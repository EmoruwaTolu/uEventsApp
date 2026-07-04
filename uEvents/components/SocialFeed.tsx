import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { View, Text, Pressable, StyleSheet, Animated, Share, Alert, FlatList, useWindowDimensions, type RefreshControlProps, type ViewStyle, type ImageStyle, type StyleProp } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { makeFeedStyles } from "../styles/feed.styles";
import { Ionicons } from "@expo/vector-icons";
import { useRsvp } from "../lib/RsvpContext";
import { useBookmarks } from "../lib/BookmarkContext";
import { useT } from "../lib/LangContext";
import { useApi } from "../lib/useApi";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import * as Haptics from "expo-haptics";
import { useTheme } from "../lib/ThemeContext";

function SafeImage({ uri, style, resizeMode, label }: { uri: string; style: StyleProp<ImageStyle>; resizeMode?: "cover" | "contain"; label?: string }) {
    const { colors: C } = useTheme();
    const t = useT();
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
    capacity?: number | null;
    likes?: number;
    comments?: number;
    isLiked?: boolean;
    isBookmarked?: boolean;
    reason?: string;
    hasRecap?: boolean;
    recapPhotos?: string[];
    recapPhotoCount?: number;
    recapContributors?: { name: string; avatarUrl?: string | null }[];
    recapContributorCount?: number;
    crowdCount?: number;
    canRate?: boolean;
    rating?: { avg: number | null; count: number; mine: number };
    topComment?: { id: string; author: string; avatarUrl?: string | null; content: string; upvotes?: number; replyCount?: number };
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
}: {
    postId: string;
    option: PollOption;
    poll: Poll;
    onPollVote: (postId: string, optionId: string) => void;
}) {
    const { colors: C } = useTheme();
    const t = useT();
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

    return (
        <Pressable
            style={[s.fcPollOption, hasVoted && s.fcPollOptionVoted, isUserVote && s.fcPollOptionSelected]}
            onPress={() => !hasVoted && onPollVote(postId, option.id)}
            disabled={hasVoted}
            accessibilityRole="button"
            accessibilityLabel={`Vote for ${option.text}`}
        >
            {hasVoted && (
                <Animated.View
                    style={[
                        s.fcPollFill,
                        { width: progressWidth.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) },
                        isUserVote && s.fcPollFillSelected,
                    ]}
                />
            )}
            <View style={s.fcPollOptionContent}>
                <View style={s.fcPollOptionLeft}>
                    {hasVoted && isUserVote && (
                        <Animated.View style={{ opacity: fadeIn }}>
                            <Ionicons name="checkmark" size={16} color={C.primary} />
                        </Animated.View>
                    )}
                    <Text style={[s.fcPollOptionText, isUserVote && s.fcPollOptionTextSelected]} numberOfLines={1}>
                        {option.text}
                    </Text>
                </View>
                {hasVoted && (
                    <Animated.Text style={[s.fcPollPct, isUserVote && s.fcPollPctSelected, { opacity: fadeIn }]}>
                        {percentage}%
                    </Animated.Text>
                )}
            </View>
        </Pressable>
    );
}

// ─── Follow button with press animation ────────────────────────────────────

function FollowButton({ isFollowing, onPress }: { isFollowing?: boolean; onPress: () => void }) {
    const { colors: C } = useTheme();
    const t = useT();
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
                    color={isFollowing ? C.primary : "#fff"}
                />
                <Text style={[s.followButtonText, isFollowing && s.followButtonTextActive]}>
                    {isFollowing ? "Following" : "Follow"}
                </Text>
            </Pressable>
        </Animated.View>
    );
}

// ─── Shared card chrome (avatar / header / action bar) ─────────────────────

function clubInitialsOf(name: string): string {
    return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function ClubAvatar({ name, uri }: { name: string; uri?: string }) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    if (uri) return <ExpoImage source={{ uri }} style={s.fcAvatarImg} contentFit="cover" transition={200} />;
    return (
        <View style={s.fcAvatar}>
            <Text style={s.fcAvatarInitials}>{clubInitialsOf(name)}</Text>
        </View>
    );
}

function CardHeader({
    post,
    subtitle,
    right,
    onClubPress,
}: {
    post: FeedPost;
    subtitle: string;
    right?: React.ReactNode;
    onClubPress?: (id: string) => void;
}) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    return (
        <View style={s.fcHeader}>
            <Pressable style={s.fcHeaderLeft} onPress={() => onClubPress?.(post.clubId)} accessibilityRole="button" accessibilityLabel={`View ${post.clubName}`}>
                <ClubAvatar name={post.clubName} uri={post.clubAvatar} />
                <View style={s.fcHeaderText}>
                    <Text style={s.fcClubName} numberOfLines={1}>{post.clubName}</Text>
                    <Text style={s.fcSubtitle} numberOfLines={1}>{subtitle}</Text>
                </View>
            </Pressable>
            {right}
        </View>
    );
}

function CardActions({
    post,
    isBookmarked,
    onLike,
    onComment,
    onShare,
    onBookmark,
    onEdit,
    onDelete,
}: {
    post: FeedPost;
    isBookmarked?: boolean;
    onLike?: () => void;
    onComment?: () => void;
    onShare?: () => void;
    onBookmark?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
}) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    return (
        <View style={s.fcActions}>
            {!onEdit && onLike && (
                <Pressable style={s.fcAction} onPress={onLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={post.isLiked ? "Unlike" : "Like"}>
                    <Ionicons name={post.isLiked ? "heart" : "heart-outline"} size={20} color={post.isLiked ? C.primary : C.textMuted} />
                    {(post.likes || 0) > 0 && <Text style={[s.fcActionText, post.isLiked && s.fcActionTextActive]}>{post.likes}</Text>}
                </Pressable>
            )}
            {!onEdit && onComment && (
                <Pressable style={s.fcAction} onPress={onComment} hitSlop={8} accessibilityRole="button" accessibilityLabel="Comments">
                    <Ionicons name="chatbubble-outline" size={18} color={C.textMuted} />
                    {(post.comments || 0) > 0 && <Text style={s.fcActionText}>{post.comments}</Text>}
                </Pressable>
            )}
            {onEdit && (
                <Pressable style={s.fcAction} onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit">
                    <Ionicons name="create-outline" size={20} color={C.textMuted} />
                </Pressable>
            )}
            {onDelete && (
                <Pressable style={s.fcAction} onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete">
                    <Ionicons name="trash-outline" size={20} color={C.textMuted} />
                </Pressable>
            )}
            <View style={s.fcActionsSpacer} />
            {!onEdit && onBookmark && (
                <Pressable style={s.fcAction} onPress={onBookmark} hitSlop={8} accessibilityRole="button" accessibilityLabel={isBookmarked ? "Remove bookmark" : "Bookmark"}>
                    <Ionicons name={isBookmarked ? "bookmark" : "bookmark-outline"} size={19} color={isBookmarked ? C.primary : C.textMuted} />
                </Pressable>
            )}
            {!onEdit && onShare && (
                <Pressable style={s.fcAction} onPress={onShare} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share">
                    <Ionicons name="arrow-redo-outline" size={20} color={C.textMuted} />
                </Pressable>
            )}
        </View>
    );
}

// ─── Top comment preview (most-upvoted comment, shown on any non-recap card) ─
function TopCommentPreview({ post, onCommentPress }: {
    post: FeedPost;
    onCommentPress?: (id: string, type: PostType, opts?: { commentId?: string; focus?: boolean }) => void;
}) {
    const { colors: C } = useTheme();
    if (!post.topComment) return null;
    const target = post.eventId ?? post.id;
    const tc = post.topComment;
    const totalComments = post.comments ?? 0;
    return (
        <View style={{ backgroundColor: C.surfaceWarm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.borderWarm, paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                {tc.avatarUrl ? (
                    <ExpoImage source={{ uri: tc.avatarUrl }} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" transition={150} />
                ) : (
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 12, fontWeight: "900", color: "#fff" }}>{tc.author.slice(0, 1).toUpperCase()}</Text>
                    </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Pressable onPress={() => onCommentPress?.(target, post.type, { commentId: tc.id })}>
                        <Text style={{ fontSize: 14, color: C.textBody, lineHeight: 20 }} numberOfLines={3}>
                            <Text style={{ fontWeight: "800", color: C.text }}>{tc.author} </Text>
                            {tc.content}
                        </Text>
                    </Pressable>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Ionicons name="heart-outline" size={15} color={C.textMuted} />
                            <Text style={{ fontSize: 13, fontWeight: "600", color: C.textMuted }}>{tc.upvotes ?? 0}</Text>
                        </View>
                        <Pressable onPress={() => onCommentPress?.(target, post.type, { commentId: tc.id, focus: true })} hitSlop={6} style={{ marginLeft: 18 }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: C.textMuted }}>Reply</Text>
                        </Pressable>
                        <View style={{ flex: 1 }} />
                        {totalComments > 1 && (
                            <Pressable onPress={() => onCommentPress?.(target, post.type, { focus: true })} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 3 }} accessibilityRole="button" accessibilityLabel={`View all ${totalComments} comments`}>
                                <Text style={{ fontSize: 13, fontWeight: "700", color: C.primary }}>View all {totalComments}</Text>
                                <Ionicons name="arrow-forward" size={13} color={C.primary} />
                            </Pressable>
                        )}
                    </View>
                </View>
            </View>
        </View>
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
    const t = useT();
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
                        <Ionicons name="people" size={12} color={C.primary} />
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
    onCommentPress?: (id: string, type: PostType, opts?: { commentId?: string; focus?: boolean }) => void;
    onFollowToggle?: (id: string) => void;
    showFollow?: boolean;
    onEditPress?: (id: string) => void;
    onDeletePress?: (id: string) => void;
}) {
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const authApi = useApi();
    const { resolve: resolveBookmark, toggleBookmark } = useBookmarks();
    const isBookmarked = resolveBookmark(post.id, post.isBookmarked ?? false);

    const handleBookmark = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleBookmark(post.id, isBookmarked);
    }, [toggleBookmark, post.id, isBookmarked]);

    const handleLike = useCallback(() => {
        onLikePress?.(post.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [post.id, onLikePress]);

    const deleteOpacity = useRef(new Animated.Value(1)).current;
    const deleteScale = useRef(new Animated.Value(1)).current;

    const handleDelete = useCallback(() => {
        Alert.alert(t.deletePostConfirmTitle, t.deletePostConfirmMsg, [
            { text: t.cancelBtn, style: "cancel" },
            {
                text: t.deleteAction, style: "destructive", onPress: () => {
                    Animated.parallel([
                        Animated.timing(deleteOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
                        Animated.timing(deleteScale, { toValue: 0.92, duration: 300, useNativeDriver: true }),
                    ]).start(() => onDeletePress?.(post.id));
                },
            },
        ]);
    }, [post.id, onDeletePress, deleteOpacity, deleteScale]);

    const title = post.eventTitle || post.content || "";
    const typeLabel = post.type === "update" ? "Update" : "Announcement";
    const pillLabel = typeLabel.toUpperCase();

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
            <Pressable onPress={handleDoubleTap} style={s.fcCard}>
                {/* Header — avatar, name, "Announcement · time", type pill */}
                <CardHeader
                    post={post}
                    subtitle={`${typeLabel} · ${post.timestamp}`}
                    right={showFollow ? (
                        <FollowButton isFollowing={post.isFollowing} onPress={() => onFollowToggle?.(post.clubId)} />
                    ) : (
                        <View style={s.fcTypePill}>
                            <Text style={s.fcTypePillText}>{pillLabel}</Text>
                        </View>
                    )}
                    onClubPress={onClubPress}
                />

                {/* Image — full width */}
                {!!post.imageUrl && (
                    <View style={s.fcImageWrap}>
                        <SafeImage uri={post.imageUrl} style={[s.fcImage, s.fcImageBanner]} resizeMode="cover" label={`${post.clubName} ${pillLabel.toLowerCase()} image`} />
                    </View>
                )}

                {/* Body — title (if any) + content */}
                {(!!post.eventTitle || !!post.content) && (
                    <View style={s.fcBody}>
                        {!!post.eventTitle && <Text style={s.fcTitle} numberOfLines={3}>{post.eventTitle}</Text>}
                        {!!post.content && <Text style={s.fcContent} numberOfLines={5}>{post.content}</Text>}
                    </View>
                )}

                {/* Action bar */}
                <CardActions
                    post={post}
                    isBookmarked={isBookmarked}
                    onLike={handleLike}
                    onComment={() => onCommentPress?.(post.id, post.type, { focus: true })}
                    onShare={() => Share.share({ message: title })}
                    onBookmark={handleBookmark}
                    onEdit={onEditPress ? () => onEditPress(post.id) : undefined}
                    onDelete={onDeletePress ? handleDelete : undefined}
                />
                <TopCommentPreview post={post} onCommentPress={onCommentPress} />
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
    onCommentPress?: (id: string, type: PostType, opts?: { commentId?: string; focus?: boolean }) => void;
    onFollowToggle?: (id: string) => void;
    showFollow?: boolean;
    onEditPress?: (id: string) => void;
    onDeletePress?: (id: string) => void;
}) {
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const headline = post.eventTitle || post.content || "";
    const excerpt = post.eventTitle ? post.content : "";

    // Bookmark
    const authApi = useApi();
    const { resolve: resolveBookmark, toggleBookmark } = useBookmarks();
    const isBookmarked = resolveBookmark(post.id, post.isBookmarked ?? false);
    const handleBookmark = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleBookmark(post.id, isBookmarked);
    }, [toggleBookmark, post.id, isBookmarked]);

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
        Alert.alert(t.deletePostConfirmTitle, t.deletePostConfirmMsg, [
            { text: t.cancelBtn, style: "cancel" },
            {
                text: t.deleteAction, style: "destructive", onPress: () => {
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
        <Pressable onPress={handleDoubleTap} style={s.fcCard}>
            {/* Header */}
            <CardHeader
                post={post}
                subtitle={`Post · ${post.timestamp}`}
                right={showFollow ? (
                    <FollowButton isFollowing={post.isFollowing} onPress={() => onFollowToggle?.(post.clubId)} />
                ) : undefined}
                onClubPress={onClubPress}
            />
            {!!post.imageUrl && (
                <View style={s.fcImageWrap}>
                    <SafeImage uri={post.imageUrl} style={[s.fcImage, s.fcImageBanner]} resizeMode="cover" label={`${post.clubName} post image`} />
                    {post.images && post.images.length > 1 && (
                        <View style={s.multiImgPill}>
                            <Ionicons name="copy-outline" size={10} color="#fff" />
                            <Text style={s.multiImgPillText}>{post.images.length}</Text>
                        </View>
                    )}
                </View>
            )}
            {(!!post.eventTitle || !!post.content) && (
                <View style={s.fcBody}>
                    {!!post.eventTitle && <Text style={s.fcTitle} numberOfLines={3}>{post.eventTitle}</Text>}
                    {!!post.content && <Text style={s.fcContent} numberOfLines={5}>{post.content}</Text>}
                </View>
            )}
            <CardActions
                post={post}
                isBookmarked={isBookmarked}
                onLike={handleLike}
                onComment={() => onCommentPress?.(post.id, post.type, { focus: true })}
                onShare={() => Share.share({ message: post.eventTitle || post.content || "" })}
                onBookmark={handleBookmark}
                onEdit={onEditPress ? () => onEditPress(post.id) : undefined}
                onDelete={onDeletePress ? handleDelete : undefined}
            />
            <TopCommentPreview post={post} onCommentPress={onCommentPress} />
            {/* Double-tap heart flash */}
            <Animated.View pointerEvents="none" style={[s.doubleTapHeart, { opacity: heartAnim }]}>
                <Ionicons name="heart" size={72} color={C.primary} />
            </Animated.View>
        </Pressable>
        </Animated.View>
    );
}

// ─── Event feed card ────────────────────────────────────────────────────────

// In-feed star rating for past events (recaps). Read-only average for everyone;
// tappable to submit a rating for attendees who checked in (canRate).
function RecapStars({ postId, rating, canRate, bare }: { postId: string; rating?: { avg: number | null; count: number; mine: number }; canRate: boolean; bare?: boolean }) {
    const { colors: C } = useTheme();
    const t = useT();
    const authApi = useApi();
    const [avg, setAvg] = useState<number | null>(rating?.avg ?? null);
    const [count, setCount] = useState(rating?.count ?? 0);
    const [mine, setMine] = useState(rating?.mine ?? 0);
    const [saving, setSaving] = useState(false);

    const submit = useCallback(async (val: number) => {
        if (saving || !canRate) return;
        const prev = { mine, avg, count };
        setSaving(true);
        setMine(val);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            const r = await authApi<{ avgRating: number | null; ratingCount: number; myRating: number }>(
                `/posts/${postId}/recap/rating`, { method: "POST", body: JSON.stringify({ rating: val }) }
            );
            setAvg(r.avgRating); setCount(r.ratingCount); setMine(r.myRating);
        } catch {
            setMine(prev.mine); setAvg(prev.avg); setCount(prev.count);
        } finally {
            setSaving(false);
        }
    }, [saving, canRate, mine, avg, count, postId, authApi]);

    return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: bare ? 0 : 10, borderTopWidth: bare ? 0 : StyleSheet.hairlineWidth, borderTopColor: C.borderWarm }}>
            {/* Left: read-only average */}
            {avg != null && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 24, fontWeight: "900", color: C.text, lineHeight: 26 }}>{avg.toFixed(1)}</Text>
                    <View>
                        <View style={{ flexDirection: "row", gap: 1 }}>
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Ionicons key={i} name={i <= Math.round(avg) ? "star" : "star-outline"} size={13} color={C.gold} />
                            ))}
                        </View>
                        <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1, color: C.textMuted, marginTop: 2 }}>{count} REVIEW{count === 1 ? "" : "S"}</Text>
                    </View>
                </View>
            )}
            <View style={{ flex: 1 }} />
            {/* Right: personal tap-to-rate (attendees only) */}
            {canRate && (
                <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: C.text, marginBottom: 5 }}>{mine ? `You rated this ${mine}/5` : "You were there — tap to rate"}</Text>
                    <View style={{ flexDirection: "row", gap: 4 }}>
                        {[1, 2, 3, 4, 5].map((i) => (
                            <Pressable key={i} disabled={saving} onPress={() => submit(i)} hitSlop={5} accessibilityRole="button" accessibilityLabel={`Rate ${i} star${i > 1 ? "s" : ""}`}>
                                <Ionicons name={i <= mine ? "star" : "star-outline"} size={22} color={C.gold} />
                            </Pressable>
                        ))}
                    </View>
                </View>
            )}
        </View>
    );
}

// Swipeable recap gallery: paged main image with a counter, plus a tappable
// thumbnail strip. When there are more photos than thumbnail slots, the last
// tile shows a "+N" overflow that opens the full post.
function RecapCarousel({ photos, onOverflow }: { photos: string[]; onOverflow?: () => void }) {
    const { colors: C } = useTheme();
    const { width } = useWindowDimensions();
    const CW = width - 30; // card inner width: 14px side margins + 1px borders
    const MAX_THUMBS = 5;
    const GAP = 4;
    const PAD = 10;
    const [active, setActive] = useState(0);
    const listRef = useRef<FlatList<string>>(null);

    const total = photos.length;
    const overflow = total - MAX_THUMBS;
    const thumbs = photos.slice(0, MAX_THUMBS);
    const tileCount = overflow > 0 ? MAX_THUMBS + 1 : Math.min(total, MAX_THUMBS);
    const thumbSize = tileCount > 0 ? (CW - PAD * 2 - GAP * (tileCount - 1)) / tileCount : 0;

    const goTo = (i: number) => {
        listRef.current?.scrollToOffset({ offset: i * CW, animated: true });
        setActive(i);
    };

    return (
        <View>
            <View style={{ width: CW, aspectRatio: 4 / 3, backgroundColor: "#111" }}>
                <FlatList
                    ref={listRef}
                    data={photos}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(u, i) => `${u}-${i}`}
                    getItemLayout={(_, i) => ({ length: CW, offset: CW * i, index: i })}
                    onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / CW))}
                    renderItem={({ item }) => (
                        <ExpoImage source={{ uri: item }} style={{ width: CW, height: "100%" }} contentFit="cover" transition={150} />
                    )}
                />
                {total > 1 && (
                    <View style={{ position: "absolute", right: 10, bottom: 10, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 3 }}>
                        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{active + 1} / {total}</Text>
                    </View>
                )}
            </View>

            {total > 1 && (
                <View style={{ flexDirection: "row", gap: GAP, paddingHorizontal: PAD, paddingVertical: 8 }}>
                    {thumbs.map((u, i) => (
                        <Pressable
                            key={i}
                            onPress={() => goTo(i)}
                            style={{ width: thumbSize, height: thumbSize, overflow: "hidden", borderWidth: active === i ? 2 : 0, borderColor: C.primary }}
                            accessibilityRole="button"
                            accessibilityLabel={`Photo ${i + 1}`}
                        >
                            <ExpoImage source={{ uri: u }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
                        </Pressable>
                    ))}
                    {overflow > 0 && (
                        <Pressable
                            onPress={onOverflow}
                            style={{ width: thumbSize, height: thumbSize, backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" }}
                            accessibilityRole="button"
                            accessibilityLabel={`View ${overflow} more photos`}
                        >
                            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "800" }}>+{overflow}</Text>
                        </Pressable>
                    )}
                </View>
            )}
        </View>
    );
}

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
    onAddRecapPhoto,
    onViewRecapPhotos,
    isOwner,
}: {
    post: FeedPost;
    onPress?: () => void;
    onClubPress?: (id: string) => void;
    onLikePress?: (id: string) => void;
    onCommentPress?: (id: string, type: PostType, opts?: { commentId?: string; focus?: boolean }) => void;
    onFollowToggle?: (id: string) => void;
    showFollow?: boolean;
    onEditPress?: (id: string) => void;
    onDeletePress?: (id: string) => void;
    onAddRecapPhoto?: (postId: string) => void;
    onViewRecapPhotos?: (postId: string) => void;
    isOwner?: boolean;
}) {
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const { isRsvped, toggleRsvp } = useRsvp();
    const authApi = useApi();
    const [rsvpLoading, setRsvpLoading] = useState(false);
    const { resolve: resolveBookmark, toggleBookmark } = useBookmarks();
    const isBookmarked = resolveBookmark(post.id, post.isBookmarked ?? false);
    const [recapAdded, setRecapAdded] = useState(false);
    const hasRecapPhotos = (post.recapPhotos?.length ?? 0) > 0;
    const showRecapRating = hasRecapPhotos || !!post.canRate || (post.rating?.count ?? 0) > 0;
    const triggerAddRecap = () => { setRecapAdded(true); onAddRecapPhoto ? onAddRecapPhoto(post.eventId ?? post.id) : onPress?.(); };

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

    const handleBookmark = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleBookmark(post.id, isBookmarked);
    }, [toggleBookmark, post.id, isBookmarked]);

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
        Alert.alert(t.deletePostConfirmTitle, t.deletePostConfirmMsg, [
            { text: t.cancelBtn, style: "cancel" },
            {
                text: t.deleteAction, style: "destructive", onPress: () => {
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
        <Pressable onPress={handleDoubleTap} style={s.fcCard}>

            {/* Recap cards are sectioned: header → title+photos → add photo → ratings → footer. */}
            {post.hasRecap ? (
                <>
                    {/* 1. Header */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderWarm }}>
                        <Pressable onPress={() => onClubPress?.(post.clubId)}>
                            {post.clubAvatar ? (
                                <ExpoImage source={{ uri: post.clubAvatar }} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" transition={200} />
                            ) : (
                                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.primaryBg, alignItems: "center", justifyContent: "center" }}>
                                    <Text style={{ fontSize: 11, fontWeight: "900", color: C.primary }}>{clubInitials.toUpperCase()}</Text>
                                </View>
                            )}
                        </Pressable>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 14, fontWeight: "800", color: C.text }} numberOfLines={1}>{post.clubName}</Text>
                            <Text style={{ fontSize: 12, color: C.textLight, marginTop: 1 }} numberOfLines={1}>
                                {post.timestamp ? `Recap · ${post.timestamp}` : "Recap"}
                            </Text>
                        </View>
                        {showFollow ? (
                            <Pressable onPress={() => onFollowToggle?.(post.clubId)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.primary, paddingHorizontal: 12, paddingVertical: 7 }} accessibilityRole="button" accessibilityLabel="Follow club">
                                <Ionicons name="add" size={13} color="#fff" />
                                <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: "#fff" }}>FOLLOW</Text>
                            </Pressable>
                        ) : (
                            <View style={{ borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 8, paddingVertical: 3 }}>
                                <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 1.2, color: C.primary }}>RECAP</Text>
                            </View>
                        )}
                    </View>

                    {hasRecapPhotos ? (
                        <>
                            {/* 2. Title + photos (photos run edge-to-edge) */}
                            <View style={{ paddingTop: 12, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderWarm }}>
                                {!!post.eventTitle && (
                                    <Text style={{ fontSize: 22, fontWeight: "900", color: C.text, letterSpacing: -0.5, lineHeight: 26, paddingHorizontal: 16 }} numberOfLines={2}>{post.eventTitle.toUpperCase()}</Text>
                                )}
                                <RecapCarousel photos={post.recapPhotos ?? []} onOverflow={() => onPress?.()} />
                            </View>

                            {/* 3. Add photo row — contributor stack + names + outlined button */}
                            {(() => {
                                const contribs = post.recapContributors ?? [];
                                const count = post.recapContributorCount ?? contribs.length;
                                const photoTotal = post.recapPhotoCount ?? (post.recapPhotos?.length ?? 0);
                                const extra = count - 2;
                                let who = "";
                                if (count > 2) who = `${contribs.slice(0, 2).map((c) => c.name).join(", ")} & ${extra} other${extra === 1 ? "" : "s"}`;
                                else if (contribs.length > 0) who = contribs.map((c) => c.name).join(" & ");
                                return (
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderWarm }}>
                                        {contribs.length > 0 && (
                                            <View style={{ flexDirection: "row" }}>
                                                {contribs.slice(0, 3).map((c, i) => (
                                                    <View key={i} style={{ width: 24, height: 24, borderRadius: 12, marginLeft: i === 0 ? 0 : -8, borderWidth: 1.5, borderColor: C.surface, overflow: "hidden", backgroundColor: C.primary, alignItems: "center", justifyContent: "center" }}>
                                                        {c.avatarUrl ? (
                                                            <ExpoImage source={{ uri: c.avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
                                                        ) : (
                                                            <Text style={{ fontSize: 9, fontWeight: "900", color: "#fff" }}>{c.name.slice(0, 1).toUpperCase()}</Text>
                                                        )}
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                        <Text style={{ flex: 1, fontSize: 12, color: C.textMuted }} numberOfLines={1}>
                                            {who ? <Text style={{ fontWeight: "800", color: C.text }}>{who} </Text> : null}
                                            {who ? "added " : ""}{photoTotal} photo{photoTotal === 1 ? "" : "s"}
                                        </Text>
                                        <Pressable
                                            onPress={triggerAddRecap}
                                            style={{ flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1.5, borderColor: C.primary, backgroundColor: recapAdded ? C.primary : "transparent", paddingHorizontal: 14, paddingVertical: 7 }}
                                            accessibilityRole="button" accessibilityLabel="Add your photos"
                                        >
                                            {recapAdded && <Ionicons name="checkmark" size={12} color="#fff" />}
                                            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.6, color: recapAdded ? "#fff" : C.primary }}>{recapAdded ? "ADDED" : "ADD YOURS"}</Text>
                                        </Pressable>
                                    </View>
                                );
                            })()}
                        </>
                    ) : (
                        /* 2b. No photos yet — invite the first upload, then title + body */
                        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderWarm }}>
                            <Pressable
                                onPress={triggerAddRecap}
                                style={{ borderWidth: 1.5, borderColor: C.borderWarm, borderStyle: "dashed", borderRadius: 10, paddingVertical: 22, paddingHorizontal: 16, alignItems: "center", gap: 8 }}
                                accessibilityRole="button" accessibilityLabel="Add the first photos"
                            >
                                <Ionicons name="camera-outline" size={30} color={C.textMuted} />
                                <Text style={{ fontSize: 15, fontWeight: "800", color: C.text, textAlign: "center" }}>
                                    {recapAdded ? "Thanks for adding!" : "No photos yet — were you there?"}
                                </Text>
                                <Text style={{ fontSize: 13, color: C.textMuted, textAlign: "center", marginBottom: 4 }}>
                                    {post.eventTitle ? `Be the first to add photos from ${post.eventTitle}.` : "Be the first to add photos from this event."}
                                </Text>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: recapAdded ? C.text : C.primary, paddingHorizontal: 20, paddingVertical: 12 }}>
                                    <Ionicons name={recapAdded ? "checkmark" : "add"} size={15} color="#fff" />
                                    <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.6, color: "#fff" }}>{recapAdded ? "ADDED" : "ADD PHOTOS"}</Text>
                                </View>
                            </Pressable>
                            {!!post.eventTitle && (
                                <Text style={{ fontSize: 20, fontWeight: "900", color: C.text, letterSpacing: -0.4, lineHeight: 25 }} numberOfLines={2}>{post.eventTitle}</Text>
                            )}
                            {!!post.content && (
                                <Text style={{ fontSize: 15, color: C.textMuted, lineHeight: 21 }} numberOfLines={4}>{post.content}</Text>
                            )}
                        </View>
                    )}

                    {/* 4. Ratings — shown when there's something to rate or an average to display */}
                    {showRecapRating && (
                        <View style={{ backgroundColor: C.surfaceWarm, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderWarm }}>
                            <RecapStars postId={post.id} rating={post.rating} canRate={!!post.canRate} bare />
                        </View>
                    )}

                    {/* 5. Footer — likes / comments / share / bookmark */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 18, paddingHorizontal: 16, paddingVertical: 10 }}>
                        <Pressable style={s.articleAction} onPress={handleLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={post.isLiked ? "Unlike" : "Like"}>
                            <Ionicons name={post.isLiked ? "heart" : "heart-outline"} size={18} color={post.isLiked ? C.primary : C.textLight} />
                            {(post.likes || 0) > 0 && <Text style={[s.articleActionText, post.isLiked && s.articleActionTextActive]}>{post.likes}</Text>}
                        </Pressable>
                        <Pressable style={s.articleAction} onPress={() => onCommentPress?.(post.eventId ?? post.id, post.type, { focus: true })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Comment">
                            <Ionicons name="chatbubble-outline" size={17} color={C.textLight} />
                            {(post.comments || 0) > 0 && <Text style={s.articleActionText}>{post.comments}</Text>}
                        </Pressable>
                        {(post.recapPhotoCount ?? 0) > 0 && (
                            <Pressable
                                style={s.articleAction}
                                onPress={() => onViewRecapPhotos ? onViewRecapPhotos(post.eventId ?? post.id) : onPress?.()}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel={`View ${post.recapPhotoCount} photos`}
                            >
                                <Ionicons name="images-outline" size={16} color={C.textLight} />
                                <Text style={s.articleActionText}>{post.recapPhotoCount} photos</Text>
                            </Pressable>
                        )}
                        <Pressable style={s.articleAction} onPress={() => Share.share({ message: post.eventTitle || post.content || "" })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share">
                            <Ionicons name="share-outline" size={18} color={C.textLight} />
                        </Pressable>
                        <View style={{ flex: 1 }} />
                        <Pressable style={s.articleAction} onPress={handleBookmark} hitSlop={8} accessibilityRole="button" accessibilityLabel={isBookmarked ? "Remove bookmark" : "Bookmark"}>
                            <Ionicons name={isBookmarked ? "bookmark" : "bookmark-outline"} size={18} color={isBookmarked ? C.text : C.textLight} />
                        </Pressable>
                    </View>
                </>
            ) : (
            <>
                {/* Header — avatar, name, "Event · time", follow state */}
                <CardHeader
                    post={post}
                    subtitle={`Event · ${post.timestamp}`}
                    right={showFollow ? (
                        <FollowButton isFollowing={post.isFollowing} onPress={() => onFollowToggle?.(post.clubId)} />
                    ) : post.isFollowing ? (
                        <Text style={s.fcFollowingLabel}>Following</Text>
                    ) : undefined}
                    onClubPress={onClubPress}
                />

                {/* Banner image with badges */}
                <View style={s.fcImageWrap}>
                    {bannerUri ? (
                        <SafeImage uri={bannerUri} style={[s.fcImage, s.fcImageEvent]} resizeMode="cover" label={post.eventTitle ? `${post.eventTitle} event banner` : `${post.clubName} event banner`} />
                    ) : (
                        <View style={[s.fcImage, s.fcImageEvent]} />
                    )}
                    <View style={s.fcImageBadgeRow}>
                        {post.freeFood && (
                            <View style={s.fcImageBadge}>
                                <Text style={s.fcImageBadgeText}>FREE FOOD</Text>
                            </View>
                        )}
                        {post.isRecurring && (
                            <View style={[s.fcImageBadge, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                                <Ionicons name="repeat" size={10} color="#fff" />
                                <Text style={s.fcImageBadgeText}>REPEATS</Text>
                            </View>
                        )}
                    </View>
                    {!!dateBadgeDay && (
                        <View style={s.fcDateBadge}>
                            <Text style={s.fcDateMon}>{dateBadgeMon.toUpperCase()}</Text>
                            <Text style={s.fcDateDay}>{dateBadgeDay}</Text>
                        </View>
                    )}
                    <Animated.View pointerEvents="none" style={[s.doubleTapHeart, { opacity: heartAnim }]}>
                        <Ionicons name="heart" size={80} color="rgba(255,255,255,0.9)" />
                    </Animated.View>
                </View>
            </>
            )}

            {/* ── Body (non-recap cards; recaps render their own sections above) ── */}
            {!post.hasRecap && (
            <View style={s.fcBody}>
                {/* Title */}
                {!!post.eventTitle && (
                    <Text style={s.fcTitle} numberOfLines={2}>{post.eventTitle}</Text>
                )}

                {/* Meta line — date · time · location · going count */}
                {(() => {
                    const parts = [post.eventDate, post.eventTime, post.eventLocation].filter(Boolean) as string[];
                    if ((post.rsvpCount ?? 0) > 0) parts.push(`${post.rsvpCount} going`);
                    return parts.length > 0 ? <Text style={s.fcMeta} numberOfLines={1}>{parts.join(" · ")}</Text> : null;
                })()}

                {/* Description */}
                {!!post.content && (
                    <Text style={s.fcDesc} numberOfLines={3}>{post.content}</Text>
                )}

                {/* Tags + capacity nudge */}
                {(() => {
                    const tags = post.eventTags ?? [];
                    const cap = post.capacity ?? null;
                    const left = cap != null ? cap - (post.rsvpCount ?? 0) : null;
                    const showSpots = cap != null && !isPast && left != null && left <= 10;
                    if (tags.length === 0 && !showSpots) return null;
                    return (
                        <View style={s.fcTagsRow}>
                            {tags.map((tag, i) => (
                                <View key={i} style={s.fcTag}>
                                    <Text style={s.fcTagText}>{tag.toUpperCase()}</Text>
                                </View>
                            ))}
                            {showSpots && (left ?? 0) > 0 && (
                                <View style={s.evSpotsLeftBadge}>
                                    <Ionicons name="flame" size={11} color="#B45309" />
                                    <Text style={s.evSpotsLeftText}>{left} {left === 1 ? "spot" : "spots"} left</Text>
                                </View>
                            )}
                            {showSpots && (left ?? 0) <= 0 && (
                                <View style={[s.evSpotsLeftBadge, s.evSpotsFullBadge]}>
                                    <Text style={s.evSpotsFullText}>Full</Text>
                                </View>
                            )}
                        </View>
                    );
                })()}

                {/* Full-width RSVP button */}
                {!onEditPress && !isPast && !isOwner && (
                    <Pressable
                        style={[s.fcRsvpBtn, going && s.fcRsvpBtnGoing]}
                        onPress={handleRsvp}
                        disabled={rsvpLoading}
                        accessibilityRole="button"
                        accessibilityLabel={going ? "Cancel RSVP" : "RSVP to event"}
                    >
                        {going && <Ionicons name="checkmark-circle" size={15} color={C.primary} />}
                        <Text style={[s.fcRsvpText, going && s.fcRsvpTextGoing]}>{going ? "YOU'RE GOING" : "RSVP · GOING?"}</Text>
                    </Pressable>
                )}

                {/* In-feed rating for rated past events */}
                {(post.rating?.count ?? 0) > 0 && (
                    <RecapStars postId={post.id} rating={post.rating} canRate={!!post.canRate} />
                )}
            </View>
            )}

            {/* Action bar */}
            {!post.hasRecap && (
                <CardActions
                    post={post}
                    isBookmarked={isBookmarked}
                    onLike={handleLike}
                    onComment={() => onCommentPress?.(post.eventId ?? post.id, post.type, { focus: true })}
                    onShare={() => Share.share({ message: post.eventTitle || post.content || "" })}
                    onBookmark={handleBookmark}
                    onEdit={onEditPress ? () => onEditPress(post.id) : undefined}
                    onDelete={onDeletePress ? handleDelete : undefined}
                />
            )}
            <TopCommentPreview post={post} onCommentPress={onCommentPress} />
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
    onCommentPress?: (id: string, type: PostType, opts?: { commentId?: string; focus?: boolean }) => void;
    onFollowToggle?: (id: string) => void;
    showFollow?: boolean;
    onEditPress?: (id: string) => void;
    onDeletePress?: (id: string) => void;
}) {
    const { colors: C } = useTheme();
    const t = useT();
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
    const { resolve: resolveBookmark, toggleBookmark } = useBookmarks();
    const isBookmarked = resolveBookmark(post.id, post.isBookmarked ?? false);
    const handleBookmark = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleBookmark(post.id, isBookmarked);
    }, [toggleBookmark, post.id, isBookmarked]);

    const deleteOpacity = useRef(new Animated.Value(1)).current;
    const deleteScale = useRef(new Animated.Value(1)).current;

    const handleDelete = useCallback(() => {
        Alert.alert(t.deletePostConfirmTitle, t.deletePostConfirmMsg, [
            { text: t.cancelBtn, style: "cancel" },
            {
                text: t.deleteAction, style: "destructive", onPress: () => {
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
        <Pressable onPress={handleDoubleTap} style={s.fcCard}>
            {/* Header */}
            <CardHeader
                post={post}
                subtitle={`Post · ${post.timestamp}`}
                right={showFollow ? (
                    <FollowButton isFollowing={post.isFollowing} onPress={() => onFollowToggle?.(post.clubId)} />
                ) : undefined}
                onClubPress={onClubPress}
            />
            <View style={s.fcImageWrap}>
                <SafeImage uri={post.imageUrl ?? ""} style={[s.fcImage, s.fcImageEvent]} resizeMode="cover" label={`${post.clubName} post image`} />
                <Animated.View pointerEvents="none" style={[s.doubleTapHeart, { opacity: heartAnim }]}>
                    <Ionicons name="heart" size={72} color="rgba(255,255,255,0.9)" />
                </Animated.View>
            </View>
            {(!!post.eventTitle || !!post.content) && (
                <View style={s.fcBody}>
                    {!!post.eventTitle && <Text style={s.fcTitle} numberOfLines={3}>{post.eventTitle}</Text>}
                    {!!post.content && (
                        <Text style={post.eventTitle ? s.fcDesc : s.fcContent} numberOfLines={post.eventTitle ? 2 : 5}>{post.content}</Text>
                    )}
                </View>
            )}
            <CardActions
                post={post}
                isBookmarked={isBookmarked}
                onLike={handleLike}
                onComment={() => onCommentPress?.(post.id, post.type, { focus: true })}
                onShare={() => Share.share({ message: post.eventTitle || post.content || "" })}
                onBookmark={handleBookmark}
                onEdit={onEditPress ? () => onEditPress(post.id) : undefined}
                onDelete={onDeletePress ? handleDelete : undefined}
            />
            <TopCommentPreview post={post} onCommentPress={onCommentPress} />
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
    onCommentPress?: (id: string, type: PostType, opts?: { commentId?: string; focus?: boolean }) => void;
    onClubPress?: (id: string) => void;
    onFollowToggle?: (id: string) => void;
    showFollow?: boolean;
    onPollVote: (postId: string, optionId: string) => void;
    onPollRefresh?: (postId: string) => void;
    onEditPress?: (id: string) => void;
    onDeletePress?: (id: string) => void;
}) {
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const authApi = useApi();
    const { resolve: resolveBookmark, toggleBookmark } = useBookmarks();
    const isBookmarked = resolveBookmark(post.id, post.isBookmarked ?? false);
    const poll = post.poll!;

    // Real-time results: while this card is mounted (≈ visible, since the
    // FlatList unmounts off-screen cells) refresh vote counts every 10s.
    useEffect(() => {
        if (!onPollRefresh) return;
        const t = setInterval(() => onPollRefresh(post.id), 10000);
        return () => clearInterval(t);
    }, [onPollRefresh, post.id]);

    const subtitle = ["Poll", post.timestamp, poll.endsAt].filter(Boolean).join(" · ");
    const votesMeta = poll.totalVotes > 0
        ? `${poll.totalVotes.toLocaleString()} ${poll.totalVotes === 1 ? "vote" : "votes"}${poll.userVote ? " · you voted" : ""}`
        : "";

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

    const handleBookmark = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleBookmark(post.id, isBookmarked);
    }, [toggleBookmark, post.id, isBookmarked]);

    const deleteOpacity = useRef(new Animated.Value(1)).current;
    const deleteScale = useRef(new Animated.Value(1)).current;

    const handleDelete = useCallback(() => {
        Alert.alert(t.deletePostConfirmTitle, t.deletePostConfirmMsg, [
            { text: t.cancelBtn, style: "cancel" },
            {
                text: t.deleteAction, style: "destructive", onPress: () => {
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
        {/* Whole card is double-tappable to like (single taps do nothing on polls). */}
        <Pressable onPress={handleDoubleTap} style={s.fcCard}>
            {/* Header — avatar, name, "Poll · time · ends in…" */}
            <CardHeader
                post={post}
                subtitle={subtitle}
                right={showFollow ? (
                    <FollowButton isFollowing={post.isFollowing} onPress={() => onFollowToggle?.(post.clubId)} />
                ) : undefined}
                onClubPress={onClubPress}
            />

            {/* Image */}
            {!!post.imageUrl && (
                <View style={s.fcImageWrap}>
                    <SafeImage uri={post.imageUrl} style={[s.fcImage, s.fcImageBanner]} resizeMode="cover" label={`${post.clubName} poll image`} />
                </View>
            )}

            {/* Question + options */}
            <View style={s.fcBody}>
                {!!poll.question && <Text style={s.fcTitle}>{poll.question}</Text>}
                {!!post.content && <Text style={s.fcDesc}>{post.content}</Text>}
                <View style={s.fcPollOptions}>
                    {poll.options.map((option) => (
                        <AnimatedPollOption
                            key={option.id}
                            postId={post.id}
                            option={option}
                            poll={poll}
                            onPollVote={onPollVote}
                        />
                    ))}
                </View>
                {!!votesMeta && <Text style={s.fcPollMeta}>{votesMeta}</Text>}
            </View>

            {/* Action bar */}
            <CardActions
                post={post}
                isBookmarked={isBookmarked}
                onLike={handleLike}
                onComment={() => onCommentPress?.(post.id, post.type, { focus: true })}
                onShare={() => Share.share({ message: poll.question || post.content || "" })}
                onBookmark={handleBookmark}
                onEdit={onEditPress ? () => onEditPress(post.id) : undefined}
                onDelete={onDeletePress ? handleDelete : undefined}
            />

            <TopCommentPreview post={post} onCommentPress={onCommentPress} />

            {/* Double-tap heart flash (centered over the card) */}
            <Animated.View pointerEvents="none" style={[s.doubleTapHeart, { opacity: heartAnim }]}>
                <Ionicons name="heart" size={72} color={C.primary} />
            </Animated.View>
        </Pressable>
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
    onCommentPress?: (postId: string, type: PostType, opts?: { commentId?: string; focus?: boolean }) => void;
    onPollVote?: (postId: string, optionId: string) => void;
    onFollowPress?: (clubId: string, isNowFollowing: boolean) => void;
    onEditPress?: (postId: string) => void;
    onDeletePress?: (postId: string) => void;
    onAddRecapPhoto?: (postId: string) => void;
    onViewRecapPhotos?: (postId: string) => void;
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
    onAddRecapPhoto,
    onViewRecapPhotos,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    onEndReached,
    onEndReachedThreshold,
    refreshControl,
    style,
}: SocialFeedProps) {
    const { colors: C } = useTheme();
    const t = useT();
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

    // "Show less like this" — optimistically drop the card and log the signal.
    const handleShowLess = useCallback(async (post: FeedPost) => {
        setPosts((cur) => cur.filter((p) => p.id !== post.id));
        try {
            await authApi(`/posts/${post.id}/show-less`, {
                method: "POST",
                body: JSON.stringify({ reason: post.reason ?? undefined }),
            });
        } catch {}
    }, [authApi]);

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
                : <EventFeedCard post={post} onPress={() => onPostPress?.(post)} onClubPress={onClubPress} onLikePress={onLikePress} onCommentPress={onCommentPress} onFollowToggle={handleFollowToggle} showFollow={showFollow} onEditPress={onEditPress} onDeletePress={onEditPress ? handleDeletePost : undefined} onAddRecapPhoto={onAddRecapPhoto} onViewRecapPhotos={onViewRecapPhotos} isOwner={isOwner} />;
        } else if (post.type === "announcement" || post.type === "update") {
            card = <AnnouncementCard post={post} onPress={() => onPostPress?.(post)} onClubPress={onClubPress} onLikePress={onLikePress} onCommentPress={onCommentPress} onFollowToggle={handleFollowToggle} showFollow={showFollow} onEditPress={onEditPress} onDeletePress={onEditPress ? handleDeletePost : undefined} />;
        } else if (post.imageUrl) {
            card = <ImageArticleCard post={post} onPress={() => onPostPress?.(post)} onClubPress={onClubPress} onLikePress={onLikePress} onCommentPress={onCommentPress} onFollowToggle={handleFollowToggle} showFollow={showFollow} onEditPress={onEditPress} onDeletePress={onEditPress ? handleDeletePost : undefined} />;
        } else {
            card = <TextArticleCard post={post} onPress={() => onPostPress?.(post)} onClubPress={onClubPress} onLikePress={onLikePress} onCommentPress={onCommentPress} onFollowToggle={handleFollowToggle} showFollow={showFollow} onEditPress={onEditPress} onDeletePress={onEditPress ? handleDeletePost : undefined} />;
        }

        // Reason chip + "Show less" — only on ranked (For You) cards, which are
        // the only ones the server tags with a `reason`.
        if (post.reason && !onEditPress) {
            return (
                <View>
                    <View style={s.reasonChipRow}>
                        <View style={s.reasonChip}>
                            <Ionicons name="sparkles-outline" size={12} color={C.textMuted} />
                            <Text style={s.reasonChipText} numberOfLines={1}>{post.reason}</Text>
                        </View>
                        <Pressable
                            onPress={() => handleShowLess(post)}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Show less like this"
                        >
                            <Text style={s.showLessText}>Show less</Text>
                        </Pressable>
                    </View>
                    {card}
                </View>
            );
        }

        return <>{card}</>;
    }, [posts, heroIdx, unfollowedClubIds, onPostPress, onClubPress, onLikePress, onCommentPress, onEditPress, onAddRecapPhoto, onViewRecapPhotos, handleDeletePost, handleShowLess, handleFollowToggle, handlePollVote, s, C]);

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
