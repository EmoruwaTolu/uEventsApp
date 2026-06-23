import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { View, Text, Pressable, StyleSheet, Animated, Share, Alert, FlatList, type RefreshControlProps, type ViewStyle, type ImageStyle, type StyleProp } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { makeFeedStyles } from "../styles/feed.styles";
import { Ionicons } from "@expo/vector-icons";
import { useRsvp } from "../lib/RsvpContext";
import { useApi } from "../lib/useApi";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import * as Haptics from "expo-haptics";
import { useTheme } from "../lib/ThemeContext";

function SafeImage({ uri, style, resizeMode, label }: { uri: string; style: StyleProp<ImageStyle>; resizeMode?: "cover" | "contain"; label?: string }) {
    const { colors: C } = useTheme();
    const [errored, setErrored] = useState(false);
    if (errored) {
        return <View style={[style, { backgroundColor: C.skeleton, alignItems: "center", justifyContent: "center" }]}><Ionicons name="image-outline" size={24} color={C.textFaint} /></View>;
    }
    return <ExpoImage source={{ uri }} style={style} contentFit={resizeMode ?? "cover"} transition={200} onError={() => setErrored(true)} accessibilityLabel={label} accessibilityRole="image" />;
}

type PostType = "event" | "announcement" | "update" | "poll";

type PollOption = {
    id: string;
    text: string;
    votes: number;
};

type Poll = {
    question: string;
    options: PollOption[];
    totalVotes: number;
    userVote?: string;
    endsAt?: string;
};

export type FeedPost = {
    id: string;
    clubId: string;
    clubName: string;
    clubAvatar?: string;
    isFollowing?: boolean;
    type: PostType;
    timestamp: string;
    content: string;
    imageUrl?: string;
    images?: string[];
    eventId?: string;
    eventTitle?: string;
    eventDate?: string;
    eventLocation?: string;
    eventTime?: string;
    eventImageUrl?: string;
    eventEndAt?: string;
    eventStartAt?: string;
    eventTags?: string[];
    isRecurring?: boolean;
    freeFood?: boolean;
    rsvpCount?: number;
    likes?: number;
    comments?: number;
    isLiked?: boolean;
    reason?: string;
    poll?: Poll;
};

function isEventPast(post: FeedPost): boolean {
    if (!post.eventEndAt) return false;
    return new Date(post.eventEndAt) < new Date();
}

// ─── Poll option (animated progress bar) ───────────────────────────────────

function AnimatedPollOption({
    postId,
    option,
    poll,
    onPollVote,
    dark,
}: {
    postId: string;
    option: PollOption;
    poll: Poll;
    onPollVote: (postId: string, optionId: string) => void;
    dark?: boolean;
}) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const percentage = poll.totalVotes > 0 ? Math.round((option.votes / poll.totalVotes) * 100) : 0;
    const isUserVote = poll.userVote === option.id;
    const hasVoted = !!poll.userVote;

    const progressWidth = useRef(new Animated.Value(0)).current;
    const fadeIn = useRef(new Animated.Value(hasVoted ? 1 : 0)).current;

    useEffect(() => {
        if (hasVoted) {
            Animated.timing(progressWidth, { toValue: percentage, duration: 800, useNativeDriver: false }).start();
            Animated.timing(fadeIn, { toValue: 1, duration: 400, delay: 200, useNativeDriver: true }).start();
        }
    }, [hasVoted, percentage]);

    if (dark) {
        return (
            <Pressable
                style={[s.pollCardOption, isUserVote && s.pollCardOptionSelected]}
                onPress={() => !hasVoted && onPollVote(postId, option.id)}
                disabled={hasVoted}
            >
                {hasVoted && (
                    <Animated.View
                        style={[
                            s.pollCardProgressBar,
                            { width: progressWidth.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) },
                            isUserVote && s.pollCardProgressBarSelected,
                        ]}
                    />
                )}
                <View style={s.pollCardOptionContent}>
                    <View style={s.pollCardOptionLeft}>
                        {hasVoted && isUserVote && (
                            <Animated.View style={{ opacity: fadeIn }}>
                                <Ionicons name="checkmark-circle" size={15} color="#fff" />
                            </Animated.View>
                        )}
                        <Text style={s.pollCardOptionText}>{option.text}</Text>
                    </View>
                    {hasVoted && (
                        <Animated.Text style={[s.pollCardPercentage, { opacity: fadeIn }]}>
                            {percentage}%
                        </Animated.Text>
                    )}
                </View>
            </Pressable>
        );
    }

    return (
        <Animated.View>
            <Pressable
                style={[s.pollOption, hasVoted && s.pollOptionVoted, isUserVote && s.pollOptionSelected]}
                onPress={() => !hasVoted && onPollVote(postId, option.id)}
                disabled={hasVoted}
            >
                {hasVoted && (
                    <Animated.View
                        style={[
                            s.pollProgressBar,
                            { width: progressWidth.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) },
                            isUserVote && s.pollProgressBarSelected,
                        ]}
                    />
                )}
                <View style={s.pollOptionContent}>
                    <View style={s.pollOptionLeft}>
                        {hasVoted && isUserVote && (
                            <Animated.View style={{ opacity: fadeIn }}>
                                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                            </Animated.View>
                        )}
                        <Text style={[s.pollOptionText, isUserVote && s.pollOptionTextSelected]}>
                            {option.text}
                        </Text>
                    </View>
                    {hasVoted && !isUserVote && (
                        <Animated.Text style={[s.pollPercentage, { opacity: fadeIn }]}>
                            {percentage}%
                        </Animated.Text>
                    )}
                </View>
            </Pressable>
        </Animated.View>
    );
}

// ─── Follow button with press animation ────────────────────────────────────

function FollowButton({ isFollowing, onPress }: { isFollowing?: boolean; onPress: () => void }) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const scale = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, damping: 15, stiffness: 300 }).start();
    };
    const handlePressOut = () => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 250 }).start();
    };

    return (
        <Animated.View style={{ transform: [{ scale }] }}>
            <Pressable
                style={[s.followButton, isFollowing && s.followButtonActive]}
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                accessibilityRole="button"
                accessibilityLabel={isFollowing ? "Following" : "Follow"}
            >
                <Ionicons
                    name={isFollowing ? "checkmark" : "add"}
                    size={14}
                    color={isFollowing ? "#8C0327" : "#fff"}
                />
                <Text style={[s.followButtonText, isFollowing && s.followButtonTextActive]}>
                    {isFollowing ? "Following" : "Follow"}
                </Text>
            </Pressable>
        </Animated.View>
    );
}

// ─── Hero card (first image post) ──────────────────────────────────────────

function HeroCard({
    post,
    onPress,
    onClubPress,
    onLikePress,
    isOwner,
}: {
    post: FeedPost;
    onPress?: () => void;
    onClubPress?: (id: string) => void;
    onLikePress?: (id: string) => void;
    isOwner?: boolean;
}) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const { isRsvped, toggleRsvp } = useRsvp();
    const [rsvpLoading, setRsvpLoading] = useState(false);

    const handleRsvp = useCallback(async () => {
        if (rsvpLoading) return;
        setRsvpLoading(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await toggleRsvp(post.id);
        setRsvpLoading(false);
    }, [rsvpLoading, post.id, toggleRsvp]);

    const handleLike = useCallback(() => {
        onLikePress?.(post.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [post.id, onLikePress]);

    const lastTap = useRef<number>(0);
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartAnim = useRef(new Animated.Value(0)).current;
    const handleDoubleTap = useCallback(() => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
            if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
            if (!post.isLiked) handleLike();
            heartAnim.setValue(1);
            Animated.timing(heartAnim, { toValue: 0, duration: 600, delay: 400, useNativeDriver: true }).start();
        } else {
            tapTimer.current = setTimeout(() => { tapTimer.current = null; onPress?.(); }, 280);
        }
        lastTap.current = now;
    }, [post.isLiked, handleLike, onPress, heartAnim]);

    const going = isRsvped(post.id);
    const isLiveNow = post.type === "event" && !!post.eventStartAt && !!post.eventEndAt &&
        new Date() >= new Date(post.eventStartAt) && new Date() <= new Date(post.eventEndAt);
    const typeBadge =
        post.type === "event" ? (isLiveNow ? "LIVE EVENT" : "EVENT") :
        post.type === "announcement" ? "BREAKING NEWS" : "UPDATE";

    return (
        <Pressable onPress={handleDoubleTap} style={s.heroCard}>
            <View style={s.heroImageWrap}>
                {post.imageUrl ? (
                    <SafeImage
                        uri={post.imageUrl}
                        style={StyleSheet.absoluteFill as any}
                        resizeMode="cover"
                        label={post.eventTitle ?? `${post.clubName} post image`}
                    />
                ) : (
                    <View style={s.heroImagePlaceholder} />
                )}
                <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.82)"]}
                    locations={[0, 0.5, 1]}
                    style={s.heroOverlay}
                />
                <View style={s.heroTypeBadge}>
                    <Text style={s.heroTypeBadgeText}>{typeBadge}</Text>
                </View>
                <View style={s.heroContent}>
                    <Text style={s.heroHeadline} numberOfLines={3}>
                        {(post.eventTitle || post.content || "").toUpperCase()}
                    </Text>
                    {post.eventTitle && !!post.content && (
                        <Text style={s.heroExcerpt} numberOfLines={2}>{post.content}</Text>
                    )}
                    {post.type === "event" && !isEventPast(post) && !isOwner && (
                        <Pressable
                            style={[s.heroRsvpBtn, going && s.heroRsvpBtnGoing]}
                            onPress={handleRsvp}
                            disabled={rsvpLoading}
                            accessibilityRole="button"
                            accessibilityLabel={going ? "Cancel RSVP" : "RSVP to event"}
                        >
                            <Ionicons
                                name={going ? "checkmark-circle" : "ticket-outline"}
                                size={12}
                                color="#fff"
                            />
                            <Text style={s.heroRsvpText}>{going ? "GOING" : "RSVP"}</Text>
                        </Pressable>
                    )}
                    <View style={s.heroStats}>
                        <Ionicons name="time-outline" size={11} color="rgba(255,255,255,0.6)" />
                        <Text style={s.heroStatText}>{post.timestamp}</Text>
                        {(post.comments || 0) > 0 && (
                            <>
                                <Text style={s.heroStatDot}>·</Text>
                                <Ionicons name="chatbubble-outline" size={11} color="rgba(255,255,255,0.6)" />
                                <Text style={s.heroStatText}>{post.comments} COMMENTS</Text>
                            </>
                        )}
                    </View>
                </View>
                <Animated.View pointerEvents="none" style={[s.doubleTapHeart, { opacity: heartAnim }]}>
                    <Ionicons name="heart" size={80} color="rgba(255,255,255,0.9)" />
                </Animated.View>
            </View>
            <Pressable style={s.heroClubRow} onPress={() => onClubPress?.(post.clubId)}>
                {post.clubAvatar ? (
                    <ExpoImage source={{ uri: post.clubAvatar }} style={s.heroClubAvatar} contentFit="cover" transition={200} />
                ) : (
                    <View style={[s.heroClubAvatar, s.heroClubAvatarPlaceholder]}>
                        <Ionicons name="people" size={12} color="#8C0327" />
                    </View>
                )}
                <Text style={s.heroClubName}>{post.clubName}</Text>
            </Pressable>
        </Pressable>
    );
}

// ─── Announcement card ──────────────────────────────────────────────────────

function AnnouncementCard({
    post,
    onPress,
    onClubPress,
    onLikePress,
    onCommentPress,
    onFollowToggle,
    showFollow,
    onEditPress,
    onDeletePress,
}: {
    post: FeedPost;
    onPress?: () => void;
    onClubPress?: (id: string) => void;
    onLikePress?: (id: string) => void;
    onCommentPress?: (id: string, type: PostType) => void;
    onFollowToggle?: (id: string) => void;
    showFollow?: boolean;
    onEditPress?: (id: string) => void;
    onDeletePress?: (id: string) => void;
}) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const authApi = useApi();
    const [isBookmarked, setIsBookmarked] = useState(false);

    const handleBookmark = useCallback(async () => {
        const next = !isBookmarked;
        setIsBookmarked(next);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            await authApi(`/posts/${post.id}/bookmark`, { method: next ? "POST" : "DELETE" });
        } catch { setIsBookmarked(!next); }
    }, [isBookmarked, post.id, authApi]);

    const handleLike = useCallback(() => {
        onLikePress?.(post.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [post.id, onLikePress]);

    const deleteOpacity = useRef(new Animated.Value(1)).current;
    const deleteScale = useRef(new Animated.Value(1)).current;

    const handleDelete = useCallback(() => {
        Alert.alert("Delete post", "Are you sure? This can't be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: () => {
                    Animated.parallel([
                        Animated.timing(deleteOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
                        Animated.timing(deleteScale, { toValue: 0.92, duration: 300, useNativeDriver: true }),
                    ]).start(() => onDeletePress?.(post.id));
                },
            },
        ]);
    }, [post.id, onDeletePress, deleteOpacity, deleteScale]);

    const title = post.eventTitle || post.content || "";
    const excerpt = post.eventTitle ? post.content : "";
    const pillLabel = "ANNOUNCEMENT";

    const lastTap = useRef<number>(0);
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartAnim = useRef(new Animated.Value(0)).current;
    const handleDoubleTap = useCallback(() => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
            if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
            if (!post.isLiked) handleLike();
            heartAnim.setValue(1);
            Animated.timing(heartAnim, { toValue: 0, duration: 600, delay: 400, useNativeDriver: true }).start();
        } else {
            tapTimer.current = setTimeout(() => { tapTimer.current = null; onPress?.(); }, 280);
        }
        lastTap.current = now;
    }, [post.isLiked, handleLike, onPress, heartAnim]);

    return (
        <Animated.View style={{ opacity: deleteOpacity, transform: [{ scale: deleteScale }] }}>
            <Pressable onPress={handleDoubleTap} style={s.announcementCard}>
                <View style={s.announcementInner}>
                    <View style={s.announcementBorder} />
                    <View style={s.announcementContent}>
                        {/* Club header */}
                        <View style={s.announcementHeader}>
                            <Pressable onPress={() => onClubPress?.(post.clubId)} style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                {post.clubAvatar ? (
                                    <ExpoImage source={{ uri: post.clubAvatar }} style={s.eventFeedAvatar} contentFit="cover" transition={200} />
                                ) : (
                                    <View style={[s.eventFeedAvatar, s.eventFeedAvatarPlaceholder]}>
                                        <Ionicons name="people" size={14} color={C.primary} />
                                    </View>
                                )}
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={s.announcementClubName} numberOfLines={1}>{post.clubName}</Text>
                                    <View style={s.announcementTypePill}>
                                        <Text style={s.announcementTypePillText}>{pillLabel}</Text>
                                    </View>
                                </View>
                            </Pressable>
                            {showFollow && (
                                <FollowButton isFollowing={post.isFollowing} onPress={() => onFollowToggle?.(post.clubId)} />
                            )}
                        </View>

                        {/* Title */}
                        <Text style={s.announcementTitle} numberOfLines={3}>{title}</Text>

                        {/* Excerpt */}
                        {!!excerpt && (
                            <Text style={s.announcementExcerpt} numberOfLines={3}>{excerpt}</Text>
                        )}
                    </View>
                </View>

                {/* Image — full width, outside the left-border zone */}
                {!!post.imageUrl && (
                    <SafeImage uri={post.imageUrl} style={s.announcementImage} resizeMode="cover" label={`${post.clubName} ${pillLabel.toLowerCase()} image`} />
                )}

                {/* Action bar */}
                <View style={s.announcementActions}>
                    {!onEditPress && (
                        <Pressable style={s.announcementActionBtn} onPress={handleLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={post.isLiked ? "Unlike" : "Like"}>
                            <Ionicons name={post.isLiked ? "heart" : "heart-outline"} size={18} color={post.isLiked ? C.primary : C.textLight} />
                            {(post.likes || 0) > 0 && (
                                <Text style={[s.announcementActionText, post.isLiked && s.announcementActionTextActive]}>{post.likes}</Text>
                            )}
                        </Pressable>
                    )}
                    {!onEditPress && (
                        <Pressable style={s.announcementActionBtn} onPress={() => onCommentPress?.(post.id, post.type)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Comment">
                            <Ionicons name="chatbubble-outline" size={17} color={C.textLight} />
                            {(post.comments || 0) > 0 && <Text style={s.announcementActionText}>{post.comments}</Text>}
                        </Pressable>
                    )}
                    {!onEditPress && (
                        <Pressable style={s.announcementActionBtn} onPress={() => Share.share({ message: title })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share">
                            <Ionicons name="share-outline" size={18} color={C.textLight} />
                        </Pressable>
                    )}
                    {!onEditPress && (
                        <Pressable style={s.announcementActionBtn} onPress={handleBookmark} hitSlop={8} accessibilityRole="button" accessibilityLabel={isBookmarked ? "Remove bookmark" : "Bookmark"}>
                            <Ionicons name={isBookmarked ? "bookmark" : "bookmark-outline"} size={18} color={isBookmarked ? C.text : C.textLight} />
                        </Pressable>
                    )}
                    {onEditPress && (
                        <Pressable style={s.announcementActionBtn} onPress={() => onEditPress(post.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit">
                            <Ionicons name="create-outline" size={18} color={C.textLight} />
                        </Pressable>
                    )}
                    {onDeletePress && (
                        <Pressable style={s.announcementActionBtn} onPress={handleDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete">
                            <Ionicons name="trash-outline" size={18} color={C.textLight} />
                        </Pressable>
                    )}
                    <View style={s.announcementActionSpacer} />
                    <Text style={s.announcementTimestamp}>{post.timestamp}</Text>
                </View>
                <Animated.View pointerEvents="none" style={[s.doubleTapHeart, { opacity: heartAnim }]}>
                    <Ionicons name="heart" size={72} color={C.primary} />
                </Animated.View>
            </Pressable>
        </Animated.View>
    );
}

// ─── Text article card (no image) ──────────────────────────────────────────

function TextArticleCard({
    post,
    onPress,
    onClubPress,
    onLikePress,
    onCommentPress,
    onFollowToggle,
    showFollow,
    onEditPress,
    onDeletePress,
}: {
    post: FeedPost;
    onPress?: () => void;
    onClubPress?: (id: string) => void;
    onLikePress?: (id: string) => void;
    onCommentPress?: (id: string, type: PostType) => void;
    onFollowToggle?: (id: string) => void;
    showFollow?: boolean;
    onEditPress?: (id: string) => void;
    onDeletePress?: (id: string) => void;
}) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const headline = post.eventTitle || post.content || "";
    const excerpt = post.eventTitle ? post.content : "";

    // Bookmark
    const authApi = useApi();
    const [isBookmarked, setIsBookmarked] = useState(false);
    const handleBookmark = useCallback(async () => {
        const next = !isBookmarked;
        setIsBookmarked(next);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            await authApi(`/posts/${post.id}/bookmark`, { method: next ? "POST" : "DELETE" });
        } catch {
            setIsBookmarked(!next);
        }
    }, [isBookmarked, post.id, authApi]);

    // Double-tap to like
    const lastTap = useRef<number>(0);
    const heartAnim = useRef(new Animated.Value(0)).current;

    const handleLike = useCallback(() => {
        onLikePress?.(post.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, [post.id, onLikePress]);

    const handleDoubleTap = useCallback(() => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
            if (!post.isLiked) handleLike();
            // Flash heart animation
            heartAnim.setValue(1);
            Animated.timing(heartAnim, { toValue: 0, duration: 600, delay: 400, useNativeDriver: true }).start();
        } else {
            onPress?.();
        }
        lastTap.current = now;
    }, [post.isLiked, handleLike, onPress, heartAnim]);

    const deleteOpacity = useRef(new Animated.Value(1)).current;
    const deleteScale = useRef(new Animated.Value(1)).current;

    const handleDelete = useCallback(() => {
        Alert.alert("Delete post", "Are you sure? This can't be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: () => {
                    Animated.parallel([
                        Animated.timing(deleteOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
                        Animated.timing(deleteScale, { toValue: 0.92, duration: 300, useNativeDriver: true }),
                    ]).start(() => onDeletePress?.(post.id));
                },
            },
        ]);
    }, [post.id, onDeletePress, deleteOpacity, deleteScale]);

    return (
        <Animated.View style={{ opacity: deleteOpacity, transform: [{ scale: deleteScale }] }}>
        <Pressable onPress={handleDoubleTap} style={s.articleCard}>
            {/* Club header */}
            <View style={s.eventFeedHeader}>
                <Pressable onPress={() => onClubPress?.(post.clubId)} style={s.eventFeedClubRow}>
                    {post.clubAvatar ? (
                        <ExpoImage source={{ uri: post.clubAvatar }} style={s.eventFeedAvatar} contentFit="cover" transition={200} />
                    ) : (
                        <View style={[s.eventFeedAvatar, s.eventFeedAvatarPlaceholder]}>
                            <Ionicons name="people" size={14} color="#8C0327" />
                        </View>
                    )}
                    <Text style={s.eventFeedClubName} numberOfLines={1}>{post.clubName}</Text>
                </Pressable>
                {showFollow && (
                    <FollowButton isFollowing={post.isFollowing} onPress={() => onFollowToggle?.(post.clubId)} />
                )}
            </View>
            <View style={{ position: "relative" }}>
                {post.imageUrl && (
                    <SafeImage uri={post.imageUrl} style={s.imgArticleImage} resizeMode="cover" label={`${post.clubName} announcement image`} />
                )}
                {post.images && post.images.length > 1 && (
                    <View style={s.multiImgPill}>
                        <Ionicons name="copy-outline" size={10} color="#fff" />
                        <Text style={s.multiImgPillText}>{post.images.length}</Text>
                    </View>
                )}
                {/* Double-tap heart flash */}
                <Animated.View pointerEvents="none" style={[s.doubleTapHeart, { opacity: heartAnim }]}>
                    <Ionicons name="heart" size={72} color="#8C0327" />
                </Animated.View>
            </View>
            <View style={s.cardBody}>
            <Text style={s.articleHeadline} numberOfLines={3}>
                {headline.toUpperCase()}
            </Text>
            {!!excerpt && (
                <Text style={s.articleExcerpt} numberOfLines={3}>{excerpt}</Text>
            )}
            <View style={s.articleByline}>
                <Text style={s.articleByTime}>{post.timestamp}</Text>
                <View style={s.articleByRight}>
                    {!onEditPress && (
                        <Pressable style={s.articleAction} onPress={handleLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={post.isLiked ? "Unlike post" : "Like post"}>
                            <Ionicons
                                name={post.isLiked ? "heart" : "heart-outline"}
                                size={18}
                                color={post.isLiked ? "#8C0327" : "#9CA3AF"}
                            />
                            {(post.likes || 0) > 0 && (
                                <Text style={[s.articleActionText, post.isLiked && s.articleActionTextActive]}>
                                    {post.likes}
                                </Text>
                            )}
                        </Pressable>
                    )}
                    {!onEditPress && (
                        <Pressable style={s.articleAction} onPress={() => onCommentPress?.(post.id, post.type)} hitSlop={8} accessibilityRole="button" accessibilityLabel="View comments">
                            <Ionicons name="chatbubble-outline" size={17} color="#9CA3AF" />
                            {(post.comments || 0) > 0 && <Text style={s.articleActionText}>{post.comments}</Text>}
                        </Pressable>
                    )}
                    {!onEditPress && (
                        <Pressable style={s.articleAction} onPress={() => Share.share({ message: post.eventTitle || post.content || "" })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share post">
                            <Ionicons name="share-outline" size={18} color="#9CA3AF" />
                        </Pressable>
                    )}
                    {!onEditPress && (
                        <Pressable style={s.articleAction} onPress={handleBookmark} hitSlop={8} accessibilityRole="button" accessibilityLabel={isBookmarked ? "Remove bookmark" : "Bookmark post"}>
                            <Ionicons name={isBookmarked ? "bookmark" : "bookmark-outline"} size={18} color={isBookmarked ? "#111827" : "#9CA3AF"} />
                        </Pressable>
                    )}
                    {onEditPress && (
                        <Pressable style={s.articleAction} onPress={() => onEditPress(post.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit post">
                            <Ionicons name="create-outline" size={18} color="#9CA3AF" />
                        </Pressable>
                    )}
                    {onDeletePress && (
                        <Pressable style={s.articleAction} onPress={handleDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete post">
                            <Ionicons name="trash-outline" size={18} color="#9CA3AF" />
                        </Pressable>
                    )}
                </View>
            </View>
            </View>
        </Pressable>
        </Animated.View>
    );
}

// ─── Event feed card ────────────────────────────────────────────────────────

function EventFeedCard({
    post,
    onPress,
    onClubPress,
    onLikePress,
    onCommentPress,
    onFollowToggle,
    showFollow,
    onEditPress,
    onDeletePress,
    isOwner,
}: {
    post: FeedPost;
    onPress?: () => void;
    onClubPress?: (id: string) => void;
    onLikePress?: (id: string) => void;
    onCommentPress?: (id: string, type: PostType) => void;
    onFollowToggle?: (id: string) => void;
    showFollow?: boolean;
    onEditPress?: (id: string) => void;
    onDeletePress?: (id: string) => void;
    isOwner?: boolean;
}) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const { isRsvped, toggleRsvp } = useRsvp();
    const authApi = useApi();
    const [rsvpLoading, setRsvpLoading] = useState(false);
    const [isBookmarked, setIsBookmarked] = useState(false);

    const handleRsvp = useCallback(async () => {
        if (rsvpLoading) return;
        setRsvpLoading(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await toggleRsvp(post.id);
        setRsvpLoading(false);
    }, [rsvpLoading, post.id, toggleRsvp]);

    const handleLike = useCallback(() => {
        onLikePress?.(post.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, [post.id, onLikePress]);

    const handleBookmark = useCallback(async () => {
        const next = !isBookmarked;
        setIsBookmarked(next);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            await authApi(`/posts/${post.id}/bookmark`, { method: next ? "POST" : "DELETE" });
        } catch {
            setIsBookmarked(!next);
        }
    }, [isBookmarked, post.id, authApi]);

    const going = isRsvped(post.id);

    const lastTap = useRef<number>(0);
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartAnim = useRef(new Animated.Value(0)).current;

    const handleDoubleTap = useCallback(() => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
            if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
            if (!post.isLiked) handleLike();
            heartAnim.setValue(1);
            Animated.timing(heartAnim, { toValue: 0, duration: 600, delay: 400, useNativeDriver: true }).start();
        } else {
            tapTimer.current = setTimeout(() => { onPress?.(); tapTimer.current = null; }, 300);
        }
        lastTap.current = now;
    }, [post.isLiked, handleLike, onPress, heartAnim]);

    const deleteOpacity = useRef(new Animated.Value(1)).current;
    const deleteScale = useRef(new Animated.Value(1)).current;

    const handleDelete = useCallback(() => {
        Alert.alert("Delete post", "Are you sure? This can't be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: () => {
                    Animated.parallel([
                        Animated.timing(deleteOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
                        Animated.timing(deleteScale, { toValue: 0.92, duration: 300, useNativeDriver: true }),
                    ]).start(() => onDeletePress?.(post.id));
                },
            },
        ]);
    }, [post.id, onDeletePress, deleteOpacity, deleteScale]);

    const isPast = isEventPast(post);

    const bannerUri = post.imageUrl ?? post.eventImageUrl;
    const clubInitials = post.clubName.slice(0, 2).toLowerCase();

    let dateBadgeDay = "";
    let dateBadgeMon = "";
    if (post.eventStartAt) {
        const d = new Date(post.eventStartAt);
        dateBadgeDay = String(d.getDate());
        dateBadgeMon = d.toLocaleDateString("en-US", { month: "short" });
    }

    return (
        <Animated.View style={{ opacity: deleteOpacity, transform: [{ scale: deleteScale }] }}>
        <Pressable onPress={handleDoubleTap} style={s.evCard}>

            {/* ── Banner ── */}
            <View style={s.evBanner}>
                {bannerUri ? (
                    <SafeImage uri={bannerUri} style={s.evBannerImage} resizeMode="cover" label={post.eventTitle ? `${post.eventTitle} event banner` : `${post.clubName} event banner`} />
                ) : (
                    <View style={[s.evBannerImage, { backgroundColor: "#111" }]} />
                )}

                {/* Gradient overlay for text legibility */}
                <LinearGradient
                    colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.72)"]}
                    style={StyleSheet.absoluteFillObject}
                />

                {/* Double-tap heart */}
                <Animated.View pointerEvents="none" style={[s.doubleTapHeart, { opacity: heartAnim }]}>
                    <Ionicons name="heart" size={80} color={C.primary} />
                </Animated.View>

                {/* Top row: type label + date badge or follow button */}
                <View style={s.evBannerTop}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={s.evTypeLabel}>{"Event".toUpperCase()}</Text>
                        {post.isRecurring && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Ionicons name="repeat" size={10} color="#fff" />
                                <Text style={{ fontSize: 8, fontWeight: "800", letterSpacing: 1, color: "#fff" }}>REPEATS</Text>
                            </View>
                        )}
                        {post.freeFood && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 9 }}>🍕</Text>
                                <Text style={{ fontSize: 8, fontWeight: "800", letterSpacing: 1, color: "#fff" }}>FREE FOOD</Text>
                            </View>
                        )}
                    </View>
                    {showFollow ? (
                        <Pressable style={s.evFollowBadge} onPress={() => onFollowToggle?.(post.clubId)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Follow club">
                            <Ionicons name="add" size={13} color="#fff" />
                            <Text style={s.evFollowBadgeText}>FOLLOW</Text>
                        </Pressable>
                    ) : dateBadgeDay ? (
                        <View style={s.evDateBadge}>
                            <Text style={s.evDateDay}>{dateBadgeDay}</Text>
                            <Text style={s.evDateMon}>{dateBadgeMon.toUpperCase()}</Text>
                        </View>
                    ) : null}
                </View>

                {/* Bottom: club chip + title */}
                <View style={s.evBannerBottom}>
                    <Pressable onPress={() => onClubPress?.(post.clubId)} style={s.evClubChip}>
                        {post.clubAvatar ? (
                            <ExpoImage source={{ uri: post.clubAvatar }} style={s.evClubChipAvatar} contentFit="cover" transition={200} />
                        ) : (
                            <View style={[s.evClubChipAvatar, s.evClubChipAvatarFallback]}>
                                <Text style={s.evClubChipInitials}>{clubInitials}</Text>
                            </View>
                        )}
                        <Text style={s.evClubChipName} numberOfLines={1}>{post.clubName.toUpperCase()}</Text>
                    </Pressable>
                    {!!post.eventTitle && (
                        <Text style={s.evBannerTitle} numberOfLines={2}>
                            {post.eventTitle.toUpperCase()}
                        </Text>
                    )}
                </View>
            </View>

            {/* ── Body ── */}
            <View style={s.evBody}>

                {/* Date + Location on one row */}
                {(post.eventDate || post.eventLocation) && (
                    <View style={s.evMetaRow}>
                        {!!post.eventDate && (
                            <View style={s.evMetaItem}>
                                <Ionicons name="time-outline" size={13} color="#6B7280" />
                                <Text style={s.evMetaText} numberOfLines={1}>{post.eventDate}</Text>
                            </View>
                        )}
                        {!!post.eventDate && !!post.eventLocation && <View style={s.evMetaSep} />}
                        {!!post.eventLocation && (
                            <View style={s.evMetaItem}>
                                <Ionicons name="location-outline" size={13} color="#6B7280" />
                                <Text style={s.evMetaText} numberOfLines={1}>{post.eventLocation}</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Description */}
                {!!post.content && (
                    <Text style={s.evDesc} numberOfLines={2}>{post.content}</Text>
                )}

                {/* Tags */}
                {(post.eventTags ?? []).length > 0 && (
                    <View style={s.evTagsRow}>
                        {(post.eventTags ?? []).map((tag, i) => (
                            <View key={i} style={s.evTag}>
                                <Text style={s.evTagText}>{tag.toUpperCase()}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* RSVP strip + actions */}
                <View style={s.evFooter}>
                    {/* Going count */}
                    <View style={s.evAvatarRow}>
                        {(post.rsvpCount ?? 0) > 0 && (
                            <>
                                <Ionicons name="people" size={13} color={C.textMuted} />
                                <Text style={s.evGoingText}>{post.rsvpCount} going</Text>
                            </>
                        )}
                        {!onEditPress && !isPast && !isOwner && (
                            <Pressable
                                style={[s.evRsvpBtn, (post.rsvpCount ?? 0) > 0 && { marginLeft: 8 }, going && s.evRsvpBtnGoing]}
                                onPress={handleRsvp}
                                disabled={rsvpLoading}
                                accessibilityRole="button"
                                accessibilityLabel={going ? "Cancel RSVP" : "RSVP to event"}
                            >
                                <Ionicons name={going ? "checkmark-circle" : "ticket-outline"} size={12} color={going ? "#8C0327" : "#fff"} />
                                <Text style={[s.evRsvpText, going && s.evRsvpTextGoing]}>{going ? "GOING" : "RSVP"}</Text>
                            </Pressable>
                        )}
                    </View>

                    <View style={{ flex: 1 }} />

                    {/* Actions */}
                    {!onEditPress && (
                        <>
                            <Pressable style={s.articleAction} onPress={handleLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={post.isLiked ? "Unlike" : "Like"}>
                                <Ionicons name={post.isLiked ? "heart" : "heart-outline"} size={18} color={post.isLiked ? "#8C0327" : "#9CA3AF"} />
                                {(post.likes || 0) > 0 && (
                                    <Text style={[s.articleActionText, post.isLiked && s.articleActionTextActive]}>{post.likes}</Text>
                                )}
                            </Pressable>
                            <Pressable style={s.articleAction} onPress={() => onCommentPress?.(post.eventId ?? post.id, post.type)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Comment">
                                <Ionicons name="chatbubble-outline" size={17} color="#9CA3AF" />
                                {(post.comments || 0) > 0 && (
                                    <Text style={s.articleActionText}>{post.comments}</Text>
                                )}
                            </Pressable>
                            <Pressable style={s.articleAction} onPress={() => Share.share({ message: post.eventTitle || post.content || "" })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share">
                                <Ionicons name="share-outline" size={18} color="#9CA3AF" />
                            </Pressable>
                            <Pressable style={s.articleAction} onPress={handleBookmark} hitSlop={8} accessibilityRole="button" accessibilityLabel={isBookmarked ? "Remove bookmark" : "Bookmark"}>
                                <Ionicons name={isBookmarked ? "bookmark" : "bookmark-outline"} size={18} color={isBookmarked ? "#111827" : "#9CA3AF"} />
                            </Pressable>
                        </>
                    )}
                    {onEditPress && (
                        <Pressable style={s.articleAction} onPress={() => onEditPress(post.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit">
                            <Ionicons name="create-outline" size={18} color="#9CA3AF" />
                        </Pressable>
                    )}
                    {onDeletePress && (
                        <Pressable style={s.articleAction} onPress={handleDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete">
                            <Ionicons name="trash-outline" size={18} color="#9CA3AF" />
                        </Pressable>
                    )}
                </View>
            </View>
        </Pressable>
        </Animated.View>
    );
}

// ─── Image article card ─────────────────────────────────────────────────────

function ImageArticleCard({
    post,
    onPress,
    onClubPress,
    onLikePress,
    onCommentPress,
    onFollowToggle,
    showFollow,
    onEditPress,
    onDeletePress,
}: {
    post: FeedPost;
    onPress?: () => void;
    onClubPress?: (id: string) => void;
    onLikePress?: (id: string) => void;
    onCommentPress?: (id: string, type: PostType) => void;
    onFollowToggle?: (id: string) => void;
    showFollow?: boolean;
    onEditPress?: (id: string) => void;
    onDeletePress?: (id: string) => void;
}) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const { isRsvped, toggleRsvp } = useRsvp();
    const [rsvpLoading, setRsvpLoading] = useState(false);

    const handleRsvp = useCallback(async () => {
        if (rsvpLoading) return;
        setRsvpLoading(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await toggleRsvp(post.id);
        setRsvpLoading(false);
    }, [rsvpLoading, post.id, toggleRsvp]);

    const going = isRsvped(post.id);

    const authApi = useApi();
    const [isBookmarked, setIsBookmarked] = useState(false);
    const handleBookmark = useCallback(async () => {
        const next = !isBookmarked;
        setIsBookmarked(next);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            await authApi(`/posts/${post.id}/bookmark`, { method: next ? "POST" : "DELETE" });
        } catch {
            setIsBookmarked(!next);
        }
    }, [isBookmarked, post.id, authApi]);

    const deleteOpacity = useRef(new Animated.Value(1)).current;
    const deleteScale = useRef(new Animated.Value(1)).current;

    const handleDelete = useCallback(() => {
        Alert.alert("Delete post", "Are you sure? This can't be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: () => {
                    Animated.parallel([
                        Animated.timing(deleteOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
                        Animated.timing(deleteScale, { toValue: 0.92, duration: 300, useNativeDriver: true }),
                    ]).start(() => onDeletePress?.(post.id));
                },
            },
        ]);
    }, [post.id, onDeletePress, deleteOpacity, deleteScale]);

    const handleLike = useCallback(() => {
        onLikePress?.(post.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [post.id, onLikePress]);

    const lastTap = useRef<number>(0);
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartAnim = useRef(new Animated.Value(0)).current;
    const handleDoubleTap = useCallback(() => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
            if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
            if (!post.isLiked) handleLike();
            heartAnim.setValue(1);
            Animated.timing(heartAnim, { toValue: 0, duration: 600, delay: 400, useNativeDriver: true }).start();
        } else {
            tapTimer.current = setTimeout(() => { tapTimer.current = null; onPress?.(); }, 280);
        }
        lastTap.current = now;
    }, [post.isLiked, handleLike, onPress, heartAnim]);

    return (
        <Animated.View style={{ opacity: deleteOpacity, transform: [{ scale: deleteScale }] }}>
        <Pressable onPress={handleDoubleTap} style={s.imgArticleCard}>
            {/* Club header */}
            <View style={s.eventFeedHeader}>
                <Pressable onPress={() => onClubPress?.(post.clubId)} style={s.eventFeedClubRow}>
                    {post.clubAvatar ? (
                        <ExpoImage source={{ uri: post.clubAvatar }} style={s.eventFeedAvatar} contentFit="cover" transition={200} />
                    ) : (
                        <View style={[s.eventFeedAvatar, s.eventFeedAvatarPlaceholder]}>
                            <Ionicons name="people" size={14} color="#8C0327" />
                        </View>
                    )}
                    <Text style={s.eventFeedClubName} numberOfLines={1}>{post.clubName}</Text>
                </Pressable>
                {showFollow && (
                    <FollowButton isFollowing={post.isFollowing} onPress={() => onFollowToggle?.(post.clubId)} />
                )}
            </View>
            <SafeImage uri={post.imageUrl ?? ""} style={s.imgArticleImage} resizeMode="cover" label={`${post.clubName} post image`} />
            <View style={s.imgArticleBody}>
                <View style={s.articleTopRow} />
                <Text style={s.imgArticleHeadline} numberOfLines={3}>
                    {(post.eventTitle || post.content || "").toUpperCase()}
                </Text>
                {post.eventTitle && !!post.content && (
                    <Text style={s.imgArticleExcerpt} numberOfLines={2}>{post.content}</Text>
                )}
                <View style={s.imgArticleActions}>
                    {!onEditPress && post.type === "event" && !isEventPast(post) && (
                        <Pressable
                            style={[s.imgArticleRsvpBtn, going && s.imgArticleRsvpBtnGoing]}
                            onPress={handleRsvp}
                            disabled={rsvpLoading}
                            accessibilityRole="button"
                            accessibilityLabel={going ? "Cancel RSVP" : "RSVP to event"}
                        >
                            <Ionicons
                                name={going ? "checkmark-circle" : "ticket-outline"}
                                size={13}
                                color={going ? "#8C0327" : "#fff"}
                            />
                            <Text style={[s.imgArticleRsvpText, going && s.imgArticleRsvpTextGoing]}>
                                {going ? "GOING" : "RSVP"}
                            </Text>
                        </Pressable>
                    )}
                    {!onEditPress && (
                        <Pressable style={s.imgArticleSaveBtn} onPress={() => onCommentPress?.(post.id, post.type)} accessibilityRole="button" accessibilityLabel="View comments">
                            <Ionicons name="chatbubble-outline" size={14} color="#9CA3AF" />
                            <Text style={s.imgArticleActionText}>{(post.comments || 0) > 0 ? String(post.comments) : "COMMENT"}</Text>
                        </Pressable>
                    )}
                    {!onEditPress && (
                        <Pressable style={s.imgArticleSaveBtn} onPress={handleBookmark} accessibilityRole="button" accessibilityLabel={isBookmarked ? "Remove bookmark" : "Bookmark post"}>
                            <Ionicons name={isBookmarked ? "bookmark" : "bookmark-outline"} size={14} color={isBookmarked ? "#111827" : "#9CA3AF"} />
                            <Text style={[s.imgArticleActionText, isBookmarked && { color: "#111827" }]}>{isBookmarked ? "SAVED" : "SAVE FOR LATER"}</Text>
                        </Pressable>
                    )}
                    {!onEditPress && (
                        <Pressable style={s.imgArticleSaveBtn} onPress={handleLike} accessibilityRole="button" accessibilityLabel={post.isLiked ? "Unlike post" : "Like post"}>
                            <Ionicons
                                name={post.isLiked ? "heart" : "heart-outline"}
                                size={14}
                                color={post.isLiked ? "#8C0327" : "#9CA3AF"}
                            />
                            <Text style={[s.imgArticleActionText, post.isLiked && s.articleActionTextActive]}>
                                {(post.likes || 0) > 0 ? String(post.likes) : "LIKE"}
                            </Text>
                        </Pressable>
                    )}
                    {onEditPress && (
                        <Pressable style={s.imgArticleSaveBtn} onPress={() => onEditPress(post.id)} accessibilityRole="button" accessibilityLabel="Edit post">
                            <Ionicons name="create-outline" size={14} color="#9CA3AF" />
                            <Text style={s.imgArticleActionText}>EDIT</Text>
                        </Pressable>
                    )}
                    {onDeletePress && (
                        <Pressable style={s.imgArticleSaveBtn} onPress={handleDelete} accessibilityRole="button" accessibilityLabel="Delete post">
                            <Ionicons name="trash-outline" size={14} color="#9CA3AF" />
                            <Text style={s.imgArticleActionText}>DELETE</Text>
                        </Pressable>
                    )}
                </View>
            </View>
            <Animated.View pointerEvents="none" style={[s.doubleTapHeart, { opacity: heartAnim }]}>
                <Ionicons name="heart" size={72} color="rgba(255,255,255,0.9)" />
            </Animated.View>
        </Pressable>
        </Animated.View>
    );
}

// ─── Poll card ──────────────────────────────────────────────────────────────

function PollCard({
    post,
    onLikePress,
    onCommentPress,
    onClubPress,
    onFollowToggle,
    showFollow,
    onPollVote,
    onPollRefresh,
    onEditPress,
    onDeletePress,
}: {
    post: FeedPost;
    onLikePress?: (id: string) => void;
    onCommentPress?: (id: string, type: PostType) => void;
    onClubPress?: (id: string) => void;
    onFollowToggle?: (id: string) => void;
    showFollow?: boolean;
    onPollVote: (postId: string, optionId: string) => void;
    onPollRefresh?: (postId: string) => void;
    onEditPress?: (id: string) => void;
    onDeletePress?: (id: string) => void;
}) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const authApi = useApi();
    const [isBookmarked, setIsBookmarked] = useState(false);
    const poll = post.poll!;

    // Real-time results: while this card is mounted (≈ visible, since the
    // FlatList unmounts off-screen cells) refresh vote counts every 10s.
    useEffect(() => {
        if (!onPollRefresh) return;
        const t = setInterval(() => onPollRefresh(post.id), 10000);
        return () => clearInterval(t);
    }, [onPollRefresh, post.id]);

    const footerParts: string[] = [];
    if (poll.totalVotes > 0) footerParts.push(`${poll.totalVotes.toLocaleString()} ${poll.totalVotes === 1 ? "vote" : "votes"}`);
    if (poll.endsAt) footerParts.push(poll.endsAt);

    const lastTap = useRef<number>(0);
    const heartAnim = useRef(new Animated.Value(0)).current;

    const handleLike = useCallback(() => {
        onLikePress?.(post.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, [post.id, onLikePress]);

    const handleDoubleTap = useCallback(() => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
            if (!post.isLiked) handleLike();
            heartAnim.setValue(1);
            Animated.timing(heartAnim, { toValue: 0, duration: 600, delay: 400, useNativeDriver: true }).start();
        }
        lastTap.current = now; // no navigation to delay for polls
    }, [post.isLiked, handleLike, heartAnim]);

    const handleBookmark = useCallback(async () => {
        const next = !isBookmarked;
        setIsBookmarked(next);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            await authApi(`/posts/${post.id}/bookmark`, { method: next ? "POST" : "DELETE" });
        } catch {
            setIsBookmarked(!next);
        }
    }, [isBookmarked, post.id, authApi]);

    const deleteOpacity = useRef(new Animated.Value(1)).current;
    const deleteScale = useRef(new Animated.Value(1)).current;

    const handleDelete = useCallback(() => {
        Alert.alert("Delete post", "Are you sure? This can't be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: () => {
                    Animated.parallel([
                        Animated.timing(deleteOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
                        Animated.timing(deleteScale, { toValue: 0.92, duration: 300, useNativeDriver: true }),
                    ]).start(() => onDeletePress?.(post.id));
                },
            },
        ]);
    }, [post.id, onDeletePress, deleteOpacity, deleteScale]);

    return (
        <Animated.View style={{ opacity: deleteOpacity, transform: [{ scale: deleteScale }] }}>
        <View style={[s.postCard, s.pollCard]}>
            <Pressable style={s.pollCardHeader} onPress={() => onClubPress?.(post.clubId)}>
                <View style={s.pollCardAvatar}>
                    {post.clubAvatar ? (
                        <ExpoImage source={{ uri: post.clubAvatar }} style={s.pollCardAvatarImage} contentFit="cover" transition={200} />
                    ) : (
                        <Ionicons name="people" size={18} color="#fff" />
                    )}
                </View>
                <View style={s.pollCardHeaderText}>
                    <Text style={s.pollCardClubName} numberOfLines={1}>{post.clubName}</Text>
                    <Text style={s.pollCardSubtitle}>Active Poll</Text>
                </View>
                {showFollow && (
                    <FollowButton isFollowing={post.isFollowing} onPress={() => onFollowToggle?.(post.clubId)} />
                )}
            </Pressable>
            <Pressable onPress={handleDoubleTap} style={{ position: "relative" }}>
                {!!poll.question && <Text style={s.pollCardQuestion}>{poll.question}</Text>}
                {post.imageUrl && (
                    <View style={s.pollCardImageWrap}>
                        <SafeImage uri={post.imageUrl} style={s.pollCardImage} resizeMode="cover" label={`${post.clubName} poll image`} />
                    </View>
                )}
                {!!post.content && <Text style={s.pollCardDescription}>{post.content}</Text>}
                <Animated.View pointerEvents="none" style={[s.doubleTapHeart, { opacity: heartAnim }]}>
                    <Ionicons name="heart" size={72} color={C.primary} />
                </Animated.View>
            </Pressable>
            <View style={s.pollCardOptions}>
                {poll.options.map((option) => (
                    <AnimatedPollOption
                        key={option.id}
                        postId={post.id}
                        option={option}
                        poll={poll}
                        onPollVote={onPollVote}
                        dark
                    />
                ))}
            </View>
            <View style={s.pollCardFooter}>
                <Text style={s.pollCardFooterText}>{footerParts.join(" · ")}</Text>
            </View>
            {/* Footer */}
            <View style={s.pollCardByline}>
                <Text style={s.pollCardByTime}>{post.timestamp}</Text>
                <View style={s.articleByRight}>
                    {!onEditPress && (
                        <Pressable style={s.articleAction} onPress={handleLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={post.isLiked ? "Unlike poll" : "Like poll"}>
                            <Ionicons name={post.isLiked ? "heart" : "heart-outline"} size={18} color={post.isLiked ? "#FF6B8A" : "rgba(255,255,255,0.5)"} />
                            {(post.likes || 0) > 0 && (
                                <Text style={[s.articleActionText, { color: post.isLiked ? "#FF6B8A" : "rgba(255,255,255,0.5)" }]}>{post.likes}</Text>
                            )}
                        </Pressable>
                    )}
                    {!onEditPress && (
                        <>
                            <Pressable style={s.articleAction} onPress={() => onCommentPress?.(post.id, post.type)} hitSlop={8} accessibilityRole="button" accessibilityLabel="View comments">
                                <Ionicons name="chatbubble-outline" size={17} color="rgba(255,255,255,0.5)" />
                                {(post.comments || 0) > 0 && (
                                    <Text style={[s.articleActionText, { color: "rgba(255,255,255,0.5)" }]}>{post.comments}</Text>
                                )}
                            </Pressable>
                            <Pressable style={s.articleAction} onPress={() => Share.share({ message: poll.question || post.content || "" })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share poll">
                                <Ionicons name="share-outline" size={18} color="rgba(255,255,255,0.5)" />
                            </Pressable>
                            <Pressable style={s.articleAction} onPress={handleBookmark} hitSlop={8} accessibilityRole="button" accessibilityLabel={isBookmarked ? "Remove bookmark" : "Bookmark poll"}>
                                <Ionicons name={isBookmarked ? "bookmark" : "bookmark-outline"} size={18} color={isBookmarked ? "#fff" : "rgba(255,255,255,0.5)"} />
                            </Pressable>
                        </>
                    )}
                    {onEditPress && (
                        <Pressable style={s.articleAction} onPress={() => onEditPress(post.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit poll">
                            <Ionicons name="create-outline" size={18} color="rgba(255,255,255,0.5)" />
                        </Pressable>
                    )}
                    {onDeletePress && (
                        <Pressable style={s.articleAction} onPress={handleDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete poll">
                            <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.5)" />
                        </Pressable>
                    )}
                </View>
            </View>
        </View>
        </Animated.View>
    );
}

const viewedPostIds = new Set<string>();

// ─── Main SocialFeed ────────────────────────────────────────────────────────

type SocialFeedProps = {
    posts: FeedPost[];
    onPostPress?: (post: FeedPost) => void;
    onClubPress?: (clubId: string) => void;
    onLikePress?: (postId: string) => void;
    onCommentPress?: (postId: string, type: PostType) => void;
    onPollVote?: (postId: string, optionId: string) => void;
    onFollowPress?: (clubId: string, isNowFollowing: boolean) => void;
    onEditPress?: (postId: string) => void;
    onDeletePress?: (postId: string) => void;
    // FlatList passthrough props
    ListHeaderComponent?: React.ReactElement | null;
    ListFooterComponent?: React.ReactElement | null;
    ListEmptyComponent?: React.ReactElement | null;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    refreshControl?: React.ReactElement<RefreshControlProps>;
    style?: ViewStyle;
};

function interleavePosts(posts: FeedPost[]): FeedPost[] {
    const buckets: Partial<Record<string, FeedPost[]>> = {};
    for (const p of posts) {
        (buckets[p.type] ??= []).push(p);
    }
    const result: FeedPost[] = [];
    let lastType: string | null = null;
    while (true) {
        const types = Object.keys(buckets).filter((t) => (buckets[t]?.length ?? 0) > 0);
        if (types.length === 0) break;
        const candidates = types.filter((t) => t !== lastType);
        const pool = candidates.length > 0 ? candidates : types;
        const next = pool.reduce((a, b) => (buckets[a]!.length >= buckets[b]!.length ? a : b));
        result.push(buckets[next]!.shift()!);
        lastType = next;
        if (!buckets[next]?.length) delete buckets[next];
    }
    return result;
}

export default function SocialFeed({
    posts: initialPosts,
    onPostPress,
    onClubPress,
    onLikePress,
    onCommentPress,
    onPollVote,
    onFollowPress,
    onEditPress,
    onDeletePress,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    onEndReached,
    onEndReachedThreshold,
    refreshControl,
    style,
}: SocialFeedProps) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const [posts, setPosts] = useState<FeedPost[]>(() => interleavePosts(initialPosts));
    const authApi = useApi();
    const { session } = useAuth();
    const tokenRef = useRef(session?.token);
    tokenRef.current = session?.token;

    const handleDeletePost = useCallback(async (postId: string) => {
        try {
            await authApi(`/posts/${postId}`, { method: "DELETE" });
        } catch {}
        setPosts((cur) => cur.filter((p) => p.id !== postId));
        onDeletePress?.(postId);
    }, [authApi, onDeletePress]);

    // Pull fresh poll counts for a single post. Uses api() directly (not authApi)
    // so a transient 401 never triggers signOut(). Preserves the user's own vote.
    const refreshPoll = useCallback(async (postId: string) => {
        const token = tokenRef.current;
        try {
            const data: any = await api(`/posts/${postId}`, {}, token ?? undefined);
            if (!data?.pollOptions) return;
            const votesById: Record<string, number> = {};
            let total = 0;
            for (const o of data.pollOptions) {
                const v = o._count?.votes ?? 0;
                votesById[o.id] = v;
                total += v;
            }
            setPosts((cur) => cur.map((p) => {
                if (p.id !== postId || !p.poll) return p;
                return {
                    ...p,
                    poll: {
                        ...p.poll,
                        totalVotes: total,
                        userVote: p.poll.userVote ?? (data.userVote ?? undefined),
                        options: p.poll.options.map((o) => ({ ...o, votes: votesById[o.id] ?? o.votes })),
                    },
                };
            }));
        } catch {}
    }, []);

    useEffect(() => {
        setPosts(interleavePosts(initialPosts));
        const token = tokenRef.current;
        if (!token) return;
        // Fire view events for unseen posts using api() directly so a 401
        // never triggers signOut() and causes a navigation loop.
        const unseen = initialPosts.filter((p) => !viewedPostIds.has(p.id));
        unseen.forEach((p) => {
            viewedPostIds.add(p.id);
            api(`/posts/${p.id}/view`, { method: "POST" }, token).catch(() => {});
        });
    }, [initialPosts]);

    const unfollowedClubIds = new Set(
        posts.filter((p) => !p.isFollowing).map((p) => p.clubId)
    );

    const handlePollVote = (postId: string, optionId: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setPosts((cur) =>
            cur.map((post) => {
                if (post.id !== postId || !post.poll || post.poll.userVote) return post;
                return {
                    ...post,
                    poll: {
                        ...post.poll,
                        userVote: optionId,
                        totalVotes: post.poll.totalVotes + 1,
                        options: post.poll.options.map((o) =>
                            o.id === optionId ? { ...o, votes: o.votes + 1 } : o
                        ),
                    },
                };
            })
        );
        onPollVote?.(postId, optionId);
    };

    const handleFollowToggle = (clubId: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        let newIsFollowing = false;
        setPosts((cur) => {
            const updated = cur.map((p) => {
                if (p.clubId !== clubId) return p;
                newIsFollowing = !p.isFollowing;
                return { ...p, isFollowing: newIsFollowing };
            });
            return updated;
        });
        onFollowPress?.(clubId, newIsFollowing);
    };

    // Only a currently-live event with an image gets the hero treatment
    const heroIdx = posts.findIndex((p) =>
        p.type === "event" && !!p.imageUrl && !!p.eventStartAt && !!p.eventEndAt &&
        new Date() >= new Date(p.eventStartAt) && new Date() <= new Date(p.eventEndAt)
    );

    const renderPost = useCallback(({ item: post, index }: { item: FeedPost; index: number }) => {
        const showFollow = unfollowedClubIds.has(post.clubId);
        const isOwner = session?.userType === "CLUB" && session?.userId === post.clubId;

        let card: React.ReactNode;
        if (post.type === "poll" && post.poll) {
            card = <PollCard post={post} onLikePress={onLikePress} onCommentPress={onCommentPress} onClubPress={onClubPress} onFollowToggle={handleFollowToggle} showFollow={showFollow} onPollVote={handlePollVote} onPollRefresh={refreshPoll} onEditPress={onEditPress} onDeletePress={onEditPress ? handleDeletePost : undefined} />;
        } else if (post.type === "event") {
            card = index === heroIdx
                ? <HeroCard post={post} onPress={() => onPostPress?.(post)} onClubPress={onClubPress} onLikePress={onLikePress} isOwner={isOwner} />
                : <EventFeedCard post={post} onPress={() => onPostPress?.(post)} onClubPress={onClubPress} onLikePress={onLikePress} onCommentPress={onCommentPress} onFollowToggle={handleFollowToggle} showFollow={showFollow} onEditPress={onEditPress} onDeletePress={onEditPress ? handleDeletePost : undefined} isOwner={isOwner} />;
        } else if (post.type === "announcement" || post.type === "update") {
            card = <AnnouncementCard post={post} onPress={() => onPostPress?.(post)} onClubPress={onClubPress} onLikePress={onLikePress} onCommentPress={onCommentPress} onFollowToggle={handleFollowToggle} showFollow={showFollow} onEditPress={onEditPress} onDeletePress={onEditPress ? handleDeletePost : undefined} />;
        } else if (post.imageUrl) {
            card = <ImageArticleCard post={post} onPress={() => onPostPress?.(post)} onClubPress={onClubPress} onLikePress={onLikePress} onCommentPress={onCommentPress} onFollowToggle={handleFollowToggle} showFollow={showFollow} onEditPress={onEditPress} onDeletePress={onEditPress ? handleDeletePost : undefined} />;
        } else {
            card = <TextArticleCard post={post} onPress={() => onPostPress?.(post)} onClubPress={onClubPress} onLikePress={onLikePress} onCommentPress={onCommentPress} onFollowToggle={handleFollowToggle} showFollow={showFollow} onEditPress={onEditPress} onDeletePress={onEditPress ? handleDeletePost : undefined} />;
        }

        // "Why you're seeing this" chip — populated by the For You ranking endpoint.
        if (post.reason) {
            return (
                <View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 }}>
                        <Ionicons name="sparkles" size={12} color={C.primary} />
                        <Text style={{ flexShrink: 1, fontSize: 11, fontWeight: "700", color: C.textMuted, letterSpacing: 0.2 }} numberOfLines={1}>{post.reason}</Text>
                    </View>
                    {card}
                </View>
            );
        }
        return <>{card}</>;
    }, [posts, heroIdx, unfollowedClubIds, onPostPress, onClubPress, onLikePress, onCommentPress, onEditPress, handleDeletePost, handleFollowToggle, handlePollVote, C]);

    return (
        <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            renderItem={renderPost}
            extraData={posts}
            style={style}
            contentContainerStyle={s.feed}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={ListHeaderComponent}
            ListFooterComponent={ListFooterComponent}
            ListEmptyComponent={ListEmptyComponent}
            onEndReached={onEndReached}
            onEndReachedThreshold={onEndReachedThreshold ?? 0.4}
            refreshControl={refreshControl}
        />
    );
}
