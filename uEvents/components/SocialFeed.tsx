import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { View, Text, Pressable, StyleSheet, Animated, Easing, Share, Alert, FlatList, useWindowDimensions, type RefreshControlProps, type ViewStyle, type ImageStyle, type StyleProp } from "react-native";
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
import { useReduceMotion } from "../lib/useReduceMotion";
import { useLang } from "../lib/LangContext";
import { localeFor } from "../lib/datetime";
import { fonts, lbl, meta } from "../styles/theme";
import { translateCategory } from "../lib/categories";
import type { Translations } from "../lib/i18n";

// The server tags For-You cards with English reason strings. Map the known
// shapes onto i18n keys so the chip localizes even against older backends.
function localizeReason(reason: string, t: Translations, lang: "en" | "fr"): string {
    const interest = reason.match(/^Matches your interest: (.+)$/);
    if (interest) return t.reasonMatchesInterest(translateCategory(interest[1], lang));
    const follow = reason.match(/^Because you follow (.+)$/);
    if (follow) return t.reasonBecauseFollow(follow[1]);
    switch (reason) {
        case "Popular this week": return t.reasonPopular;
        case "Happening soon": return t.reasonHappeningSoon;
        case "Catch the recap": return t.reasonCatchRecap;
        case "Recommended for you": return t.reasonRecommended;
        default: return reason;
    }
}

// Rise + stagger: when the active filter changes, each card fades in while
// rising 14pt, offset ~55ms per card. Cards already mounted re-run it when
// `trigger` changes; cards that mount as part of the same filter switch (new
// posts entering the list) join in via the shared transition timestamp.
function StaggerCard({ trigger, transitionAtRef, order, reduceMotion, children }: {
    trigger: string;
    transitionAtRef: React.MutableRefObject<number>;
    order: number;
    reduceMotion: boolean;
    children: React.ReactNode;
}) {
    const anim = useRef(new Animated.Value(1)).current;
    const mounted = useRef(false);
    useEffect(() => {
        const isMount = !mounted.current;
        mounted.current = true;
        // On mount, animate only if a filter switch just happened — plain
        // scrolling should never replay the entrance.
        if (isMount && Date.now() - transitionAtRef.current > 500) return;
        if (reduceMotion) { anim.setValue(1); return; }
        anim.setValue(0);
        Animated.timing(anim, {
            toValue: 1,
            duration: 200,
            delay: order * 45,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start();
    }, [trigger]);
    return (
        <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
            {children}
        </Animated.View>
    );
}

// Sentinel row ids for the sticky-section support: the section is injected as
// a real FlatList row (FlatList can only dock rows), and an empty-state row
// stands in for ListEmptyComponent so the section stays visible when a filter
// matches nothing.
const STICKY_ROW_ID = "__sticky-section__";
const EMPTY_ROW_ID = "__empty-state__";

function SafeImage({ uri, style, resizeMode, label }: { uri: string; style: StyleProp<ImageStyle>; resizeMode?: "cover" | "contain"; label?: string }) {
    const { colors: C } = useTheme();
    const t = useT();
    const [errored, setErrored] = useState(false);
    if (errored) {
        return <View style={[style, { backgroundColor: C.skeleton, alignItems: "center", justifyContent: "center" }]}><Ionicons name="image-outline" size={24} color={C.textFaint} /></View>;
    }
    return <ExpoImage source={{ uri }} style={style} contentFit={resizeMode ?? "cover"} transition={200} onError={() => setErrored(true)} accessibilityLabel={label} accessibilityRole="image" />;
}

// Feed-width image whose height is auto-scaled from the image's natural aspect ratio.
// Tall/portrait images are capped so they can't exceed ~1.25x the width (slight crop).
function AutoHeightImage({ uri, label }: { uri: string; label?: string }) {
    const { colors: C } = useTheme();
    const [ratio, setRatio] = useState<number | null>(null);
    const [errored, setErrored] = useState(false);
    const style = { width: "100%" as const, aspectRatio: ratio ?? 16 / 10, backgroundColor: C.skeleton };
    if (errored) {
        return <View style={[style, { alignItems: "center", justifyContent: "center" }]}><Ionicons name="image-outline" size={24} color={C.textFaint} /></View>;
    }
    return (
        <ExpoImage
            source={{ uri }}
            style={style}
            contentFit="cover"
            transition={200}
            onLoad={(e) => {
                const w = (e as any)?.source?.width;
                const h = (e as any)?.source?.height;
                if (w && h) setRatio(Math.max(0.8, w / h));
            }}
            onError={() => setErrored(true)}
            accessibilityLabel={label}
            accessibilityRole="image"
        />
    );
}

export type PostType = "event" | "announcement" | "update" | "poll";

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
    closed?: boolean;
};

/** A recap gallery photo. `by` is the uploader's first name, when known. */
export type RecapPhoto = { url: string; by?: string | null };

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
    rsvpPreview?: { name: string; avatarUrl?: string | null }[];
    // Attendees who share a followed club with the viewer (friends-lite signal).
    mutualGoing?: number;
    capacity?: number | null;
    likes?: number;
    comments?: number;
    isLiked?: boolean;
    isBookmarked?: boolean;
    reason?: string;
    hasRecap?: boolean;
    recapPhotos?: RecapPhoto[];
    recapPhotoCount?: number;
    recapContributors?: { name: string; avatarUrl?: string | null }[];
    recapContributorCount?: number;
    crowdCount?: number;
    canRate?: boolean;
    rating?: { avg: number | null; count: number; mine: number };
    topComment?: { id: string; author: string; avatarUrl?: string | null; content: string; upvotes?: number; isUpvoted?: boolean; replyCount?: number };
    poll?: Poll;
};

function isEventPast(post: FeedPost): boolean {
    if (!post.eventEndAt) return false;
    return new Date(post.eventEndAt) < new Date();
}

// ─── Description that collapses to 3 lines with an inline "Read more" ───────
// The affordance only appears once onTextLayout confirms the copy actually
// overflowed, so short descriptions don't get a dead link under them.
const DESC_LINES = 3;

function ExpandableText({ text }: { text: string }) {
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const [expanded, setExpanded] = useState(false);
    const [fullLines, setFullLines] = useState(0);

    return (
        <View>
            {/* Measurer. onTextLayout on the visible copy would only ever report
                the clamped line count, so the true height is measured here on an
                absolutely-positioned twin that contributes nothing to layout. */}
            <Text
                style={[s.fcDesc, { position: "absolute", left: 0, right: 0, opacity: 0 }]}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                onTextLayout={(e) => setFullLines(e.nativeEvent.lines.length)}
            >
                {text}
            </Text>

            <Text style={s.fcDesc} numberOfLines={expanded ? undefined : DESC_LINES}>{text}</Text>

            {fullLines > DESC_LINES && !expanded && (
                <Pressable onPress={() => setExpanded(true)} hitSlop={6} accessibilityRole="button">
                    <Text style={[s.fcReadMore, { marginTop: 4 }]}>{t.readMore}</Text>
                </Pressable>
            )}
        </View>
    );
}

// Ease-out count-up for poll percentages; snaps to the final value when the OS
// asks for reduced motion.
function useCountUp(target: number, run: boolean): number {
    const reduceMotion = useReduceMotion();
    const [value, setValue] = useState(reduceMotion ? target : 0);
    const raf = useRef<number | null>(null);

    useEffect(() => {
        if (reduceMotion || !run) {
            setValue(target);
            return;
        }
        const start = Date.now();
        const tick = () => {
            const p = Math.min((Date.now() - start) / 650, 1);
            setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
            if (p < 1) raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
        return () => {
            if (raf.current != null) cancelAnimationFrame(raf.current);
        };
    }, [target, run, reduceMotion]);

    return value;
}

// ─── Poll: open state ──────────────────────────────────────────────────────
// A radio row. Selection is local until "Submit vote" commits it, so a mistap
// is recoverable — the previous build voted on first touch, irreversibly.

function PollChoice({
    option,
    selected,
    onSelect,
}: {
    option: PollOption;
    selected: boolean;
    onSelect: () => void;
}) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    return (
        <Pressable
            style={[s.fcPollOption, selected && s.fcPollOptionSelected]}
            onPress={onSelect}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.text}
        >
            <View style={s.fcPollOptionContent}>
                <View style={s.fcPollOptionLeft}>
                    <View style={[s.fcPollRadio, selected && s.fcPollRadioOn]} />
                    <Text style={[s.fcPollOptionText, selected && s.fcPollOptionTextSelected]} numberOfLines={2}>
                        {option.text}
                    </Text>
                </View>
            </View>
        </Pressable>
    );
}

// ─── Poll: results ─────────────────────────────────────────────────────────

type PollRow = PollOption & { pct: number; rank: number; rankLabel: string; mine: boolean };

// Ranks options by votes, marking ties with a "T" prefix the way the mockup does.
function tallyPoll(poll: Poll): { total: number; rows: PollRow[] } {
    const total = poll.options.reduce((sum, o) => sum + o.votes, 0);
    const sorted = [...poll.options].sort((a, b) => b.votes - a.votes);
    const rows = poll.options.map((o) => {
        const rank = sorted.findIndex((x) => x.votes === o.votes) + 1;
        const tied = sorted.filter((x) => x.votes === o.votes).length > 1;
        return {
            ...o,
            pct: total > 0 ? Math.round((o.votes / total) * 100) : 0,
            rank,
            rankLabel: `${tied ? "T" : ""}${rank}`,
            mine: poll.userVote === o.id,
        };
    });
    return { total, rows };
}

function PollWinner({ row, total, run }: { row: PollRow; total: number; run: boolean }) {
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const reduceMotion = useReduceMotion();
    const shown = useCountUp(row.pct, run);
    const width = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!run) return;
        Animated.timing(width, {
            toValue: row.pct,
            duration: reduceMotion ? 0 : 700,
            delay: reduceMotion ? 0 : 120,
            useNativeDriver: false,
        }).start();
    }, [run, row.pct, reduceMotion]);

    return (
        <View style={s.fcPollWinner}>
            <View style={s.fcPollWinnerTop}>
                <Ionicons name="trophy-outline" size={15} color={C.primary} />
                <Text style={s.fcPollWinnerLabel}>{t.pollWinner}</Text>
                {row.mine && <Text style={s.fcPollWinnerMine}>· {t.pollYourPick}</Text>}
                <View style={{ flex: 1 }} />
                <Text style={s.fcPollWinnerPct}>
                    {shown}<Text style={s.fcPollWinnerPctSign}>%</Text>
                </Text>
            </View>
            <Text style={s.fcPollWinnerText}>{row.text}</Text>
            <Text style={s.fcPollWinnerVotes}>{t.pollWinnerVotes(row.votes, total)}</Text>
            <View style={s.fcPollWinnerTrack}>
                <Animated.View
                    style={[s.fcPollWinnerFill, { width: width.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]}
                />
            </View>
        </View>
    );
}

function PollResultRow({ row, index, run }: { row: PollRow; index: number; run: boolean }) {
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const reduceMotion = useReduceMotion();
    const shown = useCountUp(row.pct, run);
    const width = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!run) return;
        Animated.timing(width, {
            toValue: row.pct,
            duration: reduceMotion ? 0 : 700,
            delay: reduceMotion ? 0 : 120 + index * 80,
            useNativeDriver: false,
        }).start();
    }, [run, row.pct, index, reduceMotion]);

    return (
        <View style={s.fcPollRow}>
            <View style={s.fcPollRowTop}>
                <Text style={s.fcPollRank}>{row.rankLabel}</Text>
                <Text style={[s.fcPollRowText, row.mine && s.fcPollRowTextMine]} numberOfLines={2}>
                    {row.text}
                    {row.mine && <Text style={s.fcPollRowMineTag}>  {t.pollYourPick}</Text>}
                </Text>
                <Text style={s.fcPollRowPct}>
                    {shown}<Text style={s.fcPollRowPctSign}>%</Text>
                </Text>
            </View>
            <View style={s.fcPollRowTrack}>
                <Animated.View
                    style={[
                        s.fcPollRowFill,
                        row.mine && s.fcPollRowFillMine,
                        { width: width.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) },
                    ]}
                />
            </View>
        </View>
    );
}

// Full results block: tally rule, promoted winner, then the ranked remainder.
function PollResults({ poll }: { poll: Poll }) {
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const { total, rows } = useMemo(() => tallyPoll(poll), [poll]);
    const [run, setRun] = useState(false);

    useEffect(() => {
        const id = setTimeout(() => setRun(true), 250);
        return () => clearTimeout(id);
    }, []);

    if (total === 0) return null;
    const winner = rows.find((r) => r.rank === 1);
    const rest = rows.filter((r) => r.rank !== 1);

    return (
        <View>
            <View style={s.fcPollTallyRow}>
                {!!poll.userVote && (
                    <>
                        <Ionicons name="checkmark" size={14} color={C.primary} />
                        <Text style={s.fcPollTallyLabel}>{t.voteCounted}</Text>
                    </>
                )}
                <View style={{ flex: 1 }} />
                <Text style={s.fcPollTallyTotal}>{total}</Text>
                <Text style={s.fcPollTallyUnit}>{t.votesUnit}</Text>
            </View>

            {winner && <PollWinner row={winner} total={total} run={run} />}

            {rest.length > 0 && <Text style={s.fcPollRestLabel}>{t.pollRestOfField}</Text>}
            {rest.map((row, i) => <PollResultRow key={row.id} row={row} index={i} run={run} />)}

            {!!poll.userVote && <Text style={s.fcPollVotedNote}>{t.pollYouVoted}</Text>}
        </View>
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
                accessibilityState={{ selected: !!isFollowing }}
                accessibilityLabel={isFollowing ? t.following : t.follow}
            >
                <Ionicons
                    name={isFollowing ? "checkmark" : "add"}
                    size={14}
                    color={isFollowing ? C.primary : "#fff"}
                />
                <Text style={[s.followButtonText, isFollowing && s.followButtonTextActive]}>
                    {isFollowing ? t.following : t.follow}
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
    const t = useT();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    return (
        <View style={s.fcActions}>
            {!onEdit && onLike && (
                <Pressable style={s.fcAction} onPress={onLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={post.isLiked ? t.unlikeLabel : t.likeLabel}>
                    <Ionicons name={post.isLiked ? "heart" : "heart-outline"} size={19} color={post.isLiked ? C.primary : C.textMuted} />
                    {(post.likes || 0) > 0 && <Text style={[s.fcActionText, post.isLiked && s.fcActionTextActive]}>{post.likes}</Text>}
                </Pressable>
            )}
            {!onEdit && onComment && (
                <Pressable style={s.fcAction} onPress={onComment} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.commentsLabel}>
                    <Ionicons name="chatbubble-outline" size={19} color={C.textMuted} />
                    {(post.comments || 0) > 0 && <Text style={s.fcActionText}>{post.comments}</Text>}
                </Pressable>
            )}
            {onEdit && (
                <Pressable style={s.fcAction} onPress={onEdit} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.editLabel}>
                    <Ionicons name="create-outline" size={20} color={C.textMuted} />
                </Pressable>
            )}
            {onDelete && (
                <Pressable style={s.fcAction} onPress={onDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.deleteLabel}>
                    <Ionicons name="trash-outline" size={20} color={C.textMuted} />
                </Pressable>
            )}
            <View style={s.fcActionsSpacer} />
            {!onEdit && onBookmark && (
                <Pressable style={s.fcAction} onPress={onBookmark} hitSlop={8} accessibilityRole="button" accessibilityLabel={isBookmarked ? t.removeBookmarkLabel : t.bookmarkLabel}>
                    <Ionicons name={isBookmarked ? "bookmark" : "bookmark-outline"} size={19} color={isBookmarked ? C.primary : C.textMuted} />
                </Pressable>
            )}
            {!onEdit && onShare && (
                <Pressable style={s.fcAction} onPress={onShare} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.shareLabel}>
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
    const t = useT();
    const authApi = useApi();
    const tc = post.topComment;
    const [upvoted, setUpvoted] = useState(!!tc?.isUpvoted);
    const [count, setCount] = useState(tc?.upvotes ?? 0);
    const [busy, setBusy] = useState(false);

    const target = post.eventId ?? post.id;

    const toggleUpvote = useCallback(async () => {
        if (busy || !tc) return;
        setBusy(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const next = !upvoted;
        // Optimistic update.
        setUpvoted(next);
        setCount((c) => Math.max(0, c + (next ? 1 : -1)));
        try {
            const res = await authApi<{ upvotes: number; isUpvoted: boolean }>(
                `/posts/${target}/comments/${tc.id}/upvote`,
                { method: "POST" }
            );
            setUpvoted(res.isUpvoted);
            setCount(Math.max(0, res.upvotes));
        } catch {
            // Revert on failure.
            setUpvoted(!next);
            setCount((c) => Math.max(0, c + (next ? -1 : 1)));
        } finally {
            setBusy(false);
        }
    }, [busy, tc, upvoted, authApi, target]);

    if (!tc) return null;
    const totalComments = post.comments ?? 0;
    return (
        <View style={{ backgroundColor: C.surfaceWarm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.borderWarm, paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                {tc.avatarUrl ? (
                    <ExpoImage source={{ uri: tc.avatarUrl }} style={{ width: 34, height: 34, borderRadius: 17 }} contentFit="cover" transition={150} />
                ) : (
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.gold, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ ...meta(12, "bold"), color: "#fff" }}>{tc.author.slice(0, 1).toUpperCase()}</Text>
                    </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Pressable onPress={() => onCommentPress?.(target, post.type, { commentId: tc.id })}>
                        <Text style={{ ...meta(14, "regular"), color: C.textBody, lineHeight: 20 }} numberOfLines={3}>
                            <Text style={{ ...meta(13, "bold"), color: C.text }}>{tc.author} </Text>
                            {tc.content}
                        </Text>
                    </Pressable>
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                        <Pressable onPress={toggleUpvote} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 5 }} accessibilityRole="button" accessibilityLabel={upvoted ? t.unlikeComment : t.likeComment}>
                            <Ionicons name={upvoted ? "heart" : "heart-outline"} size={16} color={upvoted ? C.primary : C.textMuted} />
                            {count > 0 && <Text style={{ ...meta(13, "semi"), color: upvoted ? C.primary : C.textMuted }}>{count}</Text>}
                        </Pressable>
                        <Pressable onPress={() => onCommentPress?.(target, post.type, { commentId: tc.id, focus: true })} hitSlop={6} style={{ marginLeft: 18 }}>
                            <Text style={{ ...meta(13, "bold"), color: C.textMuted }}>{t.replyAction}</Text>
                        </Pressable>
                        <View style={{ flex: 1 }} />
                        {totalComments > 1 && (
                            <Pressable onPress={() => onCommentPress?.(target, post.type, { focus: true })} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 3 }} accessibilityRole="button" accessibilityLabel={t.viewAllCount(totalComments)}>
                                <Text style={{ ...meta(13, "bold"), color: C.primary }}>{t.viewAllCount(totalComments)}</Text>
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
    const { lang } = useLang();
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
        post.type === "event" ? (isLiveNow ? t.liveEvent : t.eventBadge) :
        post.type === "announcement" ? t.announcementBadge : t.updateBadge;

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
                            accessibilityLabel={going ? t.cancelRsvpLabel : t.rsvpToEventLabel}
                        >
                            <Ionicons
                                name={going ? "checkmark-circle" : "ticket-outline"}
                                size={12}
                                color="#fff"
                            />
                            <Text style={s.heroRsvpText}>{going ? t.goingBtn : t.rsvpBtn}</Text>
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

export function AnnouncementCard({
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
    const typeLabel = post.type === "update" ? t.updateType : t.announcementType;
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
                {/* Crimson masthead rule — the announcement's tell at a glance */}
                <View style={s.fcAnnRule} />

                {/* Header — avatar, name, "Announcement · time" */}
                <CardHeader
                    post={post}
                    subtitle={post.timestamp}
                    right={showFollow ? (
                        <FollowButton isFollowing={post.isFollowing} onPress={() => onFollowToggle?.(post.clubId)} />
                    ) : undefined}
                    onClubPress={onClubPress}
                />

                {/* Image — full width */}
                {!!post.imageUrl && (
                    <View style={s.fcImageWrap}>
                        <AutoHeightImage uri={post.imageUrl} label={`${post.clubName} ${pillLabel.toLowerCase()} image`} />
                    </View>
                )}

                {/* Body — ruled "ANNOUNCEMENT" ornament, then title + content */}
                <View style={s.fcBody}>
                    <View style={s.fcAnnDividerRow}>
                        <View style={s.fcAnnDividerLine} />
                        <Ionicons name="megaphone-outline" size={14} color={C.primary} />
                        <Text style={s.fcAnnDividerLabel}>{pillLabel}</Text>
                        <View style={s.fcAnnDividerLine} />
                    </View>
                    {!!post.eventTitle && <Text style={s.fcTitle} numberOfLines={3}>{post.eventTitle}</Text>}
                    {!!post.content && <Text style={s.fcContent} numberOfLines={5}>{post.content}</Text>}
                </View>

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
                    <AutoHeightImage uri={post.imageUrl} label={`${post.clubName} post image`} />
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

// Star row with fractional fill — a 4.6 average shows the fifth star 60% full
// rather than rounding it up to a whole star.
function StarRow({ value, size, gap = 3 }: { value: number; size: number; gap?: number }) {
    const { colors: C } = useTheme();
    return (
        <View style={{ flexDirection: "row", gap }}>
            {[0, 1, 2, 3, 4].map((i) => {
                const fill = Math.max(0, Math.min(1, value - i));
                return (
                    <View key={i} style={{ width: size, height: size }}>
                        <Ionicons name="star" size={size} color={C.track} />
                        {fill > 0 && (
                            <View style={{ position: "absolute", left: 0, top: 0, height: size, width: size * fill, overflow: "hidden" }}>
                                <Ionicons name="star" size={size} color={C.primary} />
                            </View>
                        )}
                    </View>
                );
            })}
        </View>
    );
}

// In-feed star rating for past events (recaps). Read-only average for everyone;
// tappable to submit a rating for attendees who checked in (canRate).
function RecapStars({ postId, rating, canRate, bare }: { postId: string; rating?: { avg: number | null; count: number; mine: number }; canRate: boolean; bare?: boolean }) {
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeFeedStyles(C), [C]);
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
        <View style={[s.fcRecapRating, bare && { borderTopWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0, paddingVertical: 0 }]}>
            {/* Left: read-only average */}
            {avg != null && (
                <View>
                    <View style={s.fcRecapAvgRow}>
                        <Text style={s.fcRecapAvg}>{avg.toFixed(1)}</Text>
                        <StarRow value={avg} size={16} />
                    </View>
                    <Text style={s.fcRecapReviews}>{t.reviewsCount(count)}</Text>
                </View>
            )}

            {avg != null && canRate && <View style={s.fcRecapDivider} />}

            {/* Right: personal tap-to-rate (attendees only) */}
            {canRate && (
                <View style={{ flex: 1 }}>
                    <Text style={s.fcRecapYourLabel}>{t.yourRating}</Text>
                    <View style={{ flexDirection: "row", gap: 4 }}>
                        {[1, 2, 3, 4, 5].map((i) => (
                            <Pressable key={i} disabled={saving} onPress={() => submit(i)} hitSlop={5} accessibilityRole="button" accessibilityLabel={`Rate ${i} star${i > 1 ? "s" : ""}`}>
                                <Ionicons name="star" size={24} color={i <= mine ? C.primary : C.track} />
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
function RecapCarousel({ photos, onOverflow }: { photos: RecapPhoto[]; onOverflow?: () => void }) {
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const { width } = useWindowDimensions();
    const CW = width - 24; // card inner width: 11px side margins + 1px borders
    const HERO_H = 250;
    const MAX_THUMBS = 4;
    const [active, setActive] = useState(0);
    const listRef = useRef<FlatList<RecapPhoto>>(null);

    const total = photos.length;
    const overflow = total - MAX_THUMBS;
    const thumbs = photos.slice(0, MAX_THUMBS);

    const goTo = (i: number) => {
        listRef.current?.scrollToOffset({ offset: i * CW, animated: true });
        setActive(i);
    };
    // Arrows wrap, matching the mockup — swiping past the last photo is a
    // dead end otherwise, and the thumbnail strip is the only way back.
    const step = (d: number) => goTo((active + d + total) % total);

    const by = photos[active]?.by;

    return (
        <View>
            <View style={[s.fcRecapHero, { width: CW }]}>
                <FlatList
                    ref={listRef}
                    data={photos}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(p, i) => `${p.url}-${i}`}
                    getItemLayout={(_, i) => ({ length: CW, offset: CW * i, index: i })}
                    onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / CW))}
                    // Both the list and the slide need an explicit height — a
                    // percentage height inside a horizontal FlatList resolves
                    // against the content, not the fixed-height parent, which
                    // leaves the image collapsed against the bottom edge.
                    style={{ height: HERO_H }}
                    renderItem={({ item }) => (
                        <ExpoImage source={{ uri: item.url }} style={{ width: CW, height: HERO_H }} contentFit="cover" transition={150} />
                    )}
                />

                {total > 1 && (
                    <>
                        <Pressable
                            onPress={() => step(-1)}
                            style={[s.fcRecapArrow, { left: 12 }]}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={t.previousPhoto}
                        >
                            <Ionicons name="chevron-back" size={18} color="#fff" />
                        </Pressable>
                        <Pressable
                            onPress={() => step(1)}
                            style={[s.fcRecapArrow, { right: 12 }]}
                            hitSlop={6}
                            accessibilityRole="button"
                            accessibilityLabel={t.nextPhoto}
                        >
                            <Ionicons name="chevron-forward" size={18} color="#fff" />
                        </Pressable>
                    </>
                )}

                {!!by && (
                    <View style={s.fcRecapTag}>
                        <Ionicons name="camera-outline" size={13} color="#fff" />
                        <Text style={s.fcRecapTagText} numberOfLines={1}>{by}</Text>
                    </View>
                )}

                {total > 1 && (
                    <View style={s.fcRecapCounter}>
                        <Text style={s.fcRecapCounterText}>{active + 1} / {total}</Text>
                    </View>
                )}
            </View>

            {total > 1 && (
                <View style={s.fcRecapThumbRow}>
                    {thumbs.map((p, i) => (
                        <Pressable
                            key={i}
                            onPress={() => goTo(i)}
                            style={[s.fcRecapThumb, active === i && s.fcRecapThumbOn]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active === i }}
                            accessibilityLabel={`Photo ${i + 1}`}
                        >
                            <ExpoImage source={{ uri: p.url }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
                        </Pressable>
                    ))}
                    {overflow > 0 && (
                        <Pressable
                            onPress={onOverflow}
                            style={[s.fcRecapThumb, s.fcRecapThumbMore]}
                            accessibilityRole="button"
                            accessibilityLabel={`View ${overflow} more photos`}
                        >
                            <Text style={s.fcRecapThumbMoreText}>+{overflow}</Text>
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
    const { lang } = useLang();
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
        dateBadgeMon = d.toLocaleDateString(localeFor(lang), { month: "short" });
    }

    return (
        <Animated.View style={{ opacity: deleteOpacity, transform: [{ scale: deleteScale }] }}>
        <Pressable onPress={handleDoubleTap} style={s.fcCard}>

            {/* Recap cards are sectioned: header → title+photos → add photo → ratings → footer. */}
            {post.hasRecap ? (
                <>
                    {/* 1. Header — ruled off from the title below it */}
                    <View style={s.fcRecapHeaderRule}>
                        <CardHeader
                            post={post}
                            subtitle={post.timestamp ? `${t.recapLabel} · ${post.timestamp}` : t.recapLabel}
                            right={showFollow ? (
                                <FollowButton isFollowing={post.isFollowing} onPress={() => onFollowToggle?.(post.clubId)} />
                            ) : (
                                <View style={s.fcRecapPill}>
                                    <Text style={s.fcRecapPillText}>{t.recapBadge}</Text>
                                </View>
                            )}
                            onClubPress={onClubPress}
                        />
                    </View>

                    {/* 2. Title — sits above the gallery it introduces */}
                    {!!post.eventTitle && (
                        <Text style={s.fcRecapTitle} numberOfLines={2}>{post.eventTitle}</Text>
                    )}

                    {hasRecapPhotos ? (
                        <>
                            {/* 3. Gallery (runs edge-to-edge) */}
                            <RecapCarousel photos={post.recapPhotos ?? []} onOverflow={() => onPress?.()} />

                            {/* 4. Contributor stack + names + "Add yours" */}
                            {(() => {
                                const contribs = post.recapContributors ?? [];
                                const count = post.recapContributorCount ?? contribs.length;
                                const extra = count - 2;
                                let who = "";
                                if (count > 2) who = `${contribs.slice(0, 2).map((c) => c.name).join(", ")} & ${extra} other${extra === 1 ? "" : "s"}`;
                                else if (contribs.length > 0) who = contribs.map((c) => c.name).join(" & ");
                                return (
                                    <View style={s.fcRecapContribRow}>
                                        {contribs.length > 0 && (
                                            <View style={{ flexDirection: "row" }}>
                                                {contribs.slice(0, 3).map((c, i) => (
                                                    <View key={i} style={[s.fcRecapContribAvatar, { marginLeft: i === 0 ? 0 : -9 }]}>
                                                        {c.avatarUrl ? (
                                                            <ExpoImage source={{ uri: c.avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
                                                        ) : (
                                                            <Text style={s.fcRecapContribInit}>{c.name.slice(0, 1).toUpperCase()}</Text>
                                                        )}
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                        <Text style={s.fcRecapContribText} numberOfLines={2}>
                                            {who ? <Text style={s.fcRecapContribStrong}>{who} </Text> : null}
                                            {t.addedPhotosWord}
                                        </Text>
                                        <Pressable
                                            onPress={triggerAddRecap}
                                            style={[s.fcRecapAddBtn, recapAdded && s.fcRecapAddBtnDone]}
                                            accessibilityRole="button" accessibilityLabel={t.addYourPhotosLabel}
                                        >
                                            {recapAdded
                                                ? <Ionicons name="checkmark" size={13} color="#fff" />
                                                : <Ionicons name="add" size={13} color={C.primary} />}
                                            <Text style={[s.fcRecapAddBtnText, recapAdded && s.fcRecapAddBtnTextDone]}>
                                                {recapAdded ? t.addedLabel : t.addYours}
                                            </Text>
                                        </Pressable>
                                    </View>
                                );
                            })()}
                        </>
                    ) : (
                        /* 3b. No photos yet — invite the first upload */
                        <View style={{ paddingHorizontal: 17, paddingBottom: 16, gap: 14 }}>
                            <Pressable
                                onPress={triggerAddRecap}
                                style={s.fcRecapEmpty}
                                accessibilityRole="button" accessibilityLabel={t.addFirstPhotosLabel}
                            >
                                <Ionicons name="camera-outline" size={30} color={C.textMuted} />
                                <Text style={s.fcRecapEmptyTitle}>
                                    {recapAdded ? t.thanksAdding : t.noPhotosYet}
                                </Text>
                                <Text style={s.fcRecapEmptyBody}>
                                    {post.eventTitle ? t.beFirstPhotos(post.eventTitle) : t.beFirstPhotosGeneric}
                                </Text>
                                <View style={s.fcRecapEmptyBtn}>
                                    <Ionicons name={recapAdded ? "checkmark" : "add"} size={15} color="#fff" />
                                    <Text style={s.fcRecapEmptyBtnText}>{recapAdded ? t.addedLabel : t.addPhotos}</Text>
                                </View>
                            </Pressable>
                            {!!post.content && (
                                <Text style={s.fcContent} numberOfLines={4}>{post.content}</Text>
                            )}
                        </View>
                    )}

                    {/* 5. Ratings — shown when there's something to rate or an average to display */}
                    {showRecapRating && (
                        <RecapStars postId={post.id} rating={post.rating} canRate={!!post.canRate} />
                    )}

                    {/* 6. Footer — likes / comments / photos / share / bookmark */}
                    <View style={s.fcActions}>
                        <Pressable style={s.fcAction} onPress={handleLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={post.isLiked ? t.unlikeLabel : t.likeLabel}>
                            <Ionicons name={post.isLiked ? "heart" : "heart-outline"} size={19} color={post.isLiked ? C.primary : C.textMuted} />
                            {(post.likes || 0) > 0 && <Text style={[s.fcActionText, post.isLiked && s.fcActionTextActive]}>{post.likes}</Text>}
                        </Pressable>
                        <Pressable style={s.fcAction} onPress={() => onCommentPress?.(post.eventId ?? post.id, post.type, { focus: true })} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.commentsLabel}>
                            <Ionicons name="chatbubble-outline" size={19} color={C.textMuted} />
                            {(post.comments || 0) > 0 && <Text style={s.fcActionText}>{post.comments}</Text>}
                        </Pressable>
                        {(post.recapPhotoCount ?? 0) > 0 && (
                            <Pressable
                                style={s.fcAction}
                                onPress={() => onViewRecapPhotos ? onViewRecapPhotos(post.eventId ?? post.id) : onPress?.()}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityLabel={t.photosCount(post.recapPhotoCount ?? 0)}
                            >
                                <Ionicons name="images-outline" size={18} color={C.textMuted} />
                                <Text style={s.fcActionText}>{t.photosCount(post.recapPhotoCount ?? 0)}</Text>
                            </Pressable>
                        )}
                        <View style={s.fcActionsSpacer} />
                        <Pressable style={s.fcAction} onPress={handleBookmark} hitSlop={8} accessibilityRole="button" accessibilityLabel={isBookmarked ? t.removeBookmarkLabel : t.bookmarkLabel}>
                            <Ionicons name={isBookmarked ? "bookmark" : "bookmark-outline"} size={19} color={isBookmarked ? C.primary : C.textMuted} />
                        </Pressable>
                        <Pressable style={s.fcAction} onPress={() => Share.share({ message: post.eventTitle || post.content || "" })} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.shareLabel}>
                            <Ionicons name="arrow-redo-outline" size={20} color={C.textMuted} />
                        </Pressable>
                    </View>
                </>
            ) : (
            <>
                {/* Header — avatar, name, "Event · time", follow state */}
                <CardHeader
                    post={post}
                    subtitle={post.timestamp}
                    right={showFollow ? (
                        <FollowButton isFollowing={post.isFollowing} onPress={() => onFollowToggle?.(post.clubId)} />
                    ) : (
                        <View style={s.fcTypePill}>
                            <Text style={s.fcTypePillText}>{t.eventType}</Text>
                        </View>
                    )}
                    onClubPress={onClubPress}
                />

                {/* Banner image with badges */}
                <View style={s.fcImageWrap}>
                    {bannerUri ? (
                        <AutoHeightImage uri={bannerUri} label={post.eventTitle ? `${post.eventTitle} event banner` : `${post.clubName} event banner`} />
                    ) : (
                        <View style={[s.fcImage, s.fcImageEvent]} />
                    )}
                    <View style={s.fcImageBadgeRow}>
                        {post.freeFood && (
                            <View style={s.fcImageBadge}>
                                <Text style={s.fcImageBadgeText}>{t.freeFoodBadge}</Text>
                            </View>
                        )}
                        {post.isRecurring && (
                            <View style={[s.fcImageBadge, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                                <Ionicons name="repeat" size={10} color="#fff" />
                                <Text style={s.fcImageBadgeText}>{t.repeatsBadge}</Text>
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
                {/* Category kicker above the headline */}
                {(post.eventTags?.length ?? 0) > 0 && (
                    <Text style={s.fcKicker} numberOfLines={1}>{post.eventTags!.join(" · ")}</Text>
                )}

                {/* Title */}
                {!!post.eventTitle && (
                    <Text style={s.fcTitle} numberOfLines={2}>{post.eventTitle}</Text>
                )}

                {/* Meta line — clock/pin glyphs, date · time · location */}
                {(() => {
                    const parts = [post.eventDate, post.eventTime].filter(Boolean) as string[];
                    if (parts.length === 0 && !post.eventLocation) return null;
                    // Each glyph is grouped with its own label so a wrap can't
                    // strand the pin on the line above its location.
                    return (
                        <View style={s.fcMetaRow}>
                            {parts.length > 0 && (
                                <View style={s.fcMetaItem}>
                                    <Ionicons name="time-outline" size={13} color={C.textMuted} />
                                    <Text style={s.fcMeta} numberOfLines={1}>{parts.join(" · ")}</Text>
                                </View>
                            )}
                            {parts.length > 0 && !!post.eventLocation && <Text style={s.fcMetaSep}>·</Text>}
                            {!!post.eventLocation && (
                                <View style={s.fcMetaItem}>
                                    <Ionicons name="location-outline" size={13} color={C.textMuted} />
                                    <Text style={[s.fcMeta, { flexShrink: 1 }]} numberOfLines={1}>{post.eventLocation}</Text>
                                </View>
                            )}
                        </View>
                    );
                })()}

                {/* Who's going — attendee avatar stack + "Maya, Jordan +N going" */}
                {!isPast && (post.rsvpCount ?? 0) > 0 && (() => {
                    const preview = post.rsvpPreview ?? [];
                    const names = preview.slice(0, 2).map((a) => a.name);
                    return (
                        <View style={s.fcGoingRow}>
                            {preview.length > 0 && (
                                <View style={{ flexDirection: "row" }}>
                                    {preview.slice(0, 3).map((a, i) => (
                                        <View key={i} style={[s.fcGoingAvatar, { marginLeft: i === 0 ? 0 : -7 }]}>
                                            {a.avatarUrl
                                                ? <ExpoImage source={{ uri: a.avatarUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
                                                : <Text style={s.fcGoingAvatarInit}>{a.name.slice(0, 1).toUpperCase()}</Text>}
                                        </View>
                                    ))}
                                </View>
                            )}
                            <Text style={s.fcGoingText} numberOfLines={1}>{t.goingSummary(names, post.rsvpCount ?? 0)}</Text>
                        </View>
                    );
                })()}

                {/* Friends-lite social proof — co-followers of your clubs who RSVP'd */}
                {!isPast && (post.mutualGoing ?? 0) > 0 && (
                    <View style={s.fcMutualRow}>
                        <Ionicons name="people" size={12} color={C.gold} />
                        <Text style={s.fcMutualText} numberOfLines={1}>{t.mutualGoing(post.mutualGoing!)}</Text>
                    </View>
                )}

                {/* Description — collapsed to 3 lines with an inline "Read more" */}
                {!!post.content && <ExpandableText text={post.content} />}

                {/* Capacity nudge — categories are carried by the kicker above */}
                {(() => {
                    const cap = post.capacity ?? null;
                    const left = cap != null ? cap - (post.rsvpCount ?? 0) : null;
                    const showSpots = cap != null && !isPast && left != null && left <= 10;
                    if (!showSpots) return null;
                    return (
                        <View style={s.fcTagsRow}>
                            {showSpots && (left ?? 0) > 0 && (
                                <View style={s.evSpotsLeftBadge}>
                                    <Ionicons name="flame" size={11} color="#B45309" />
                                    <Text style={s.evSpotsLeftText}>{t.spotsLeftBadge(left)}</Text>
                                </View>
                            )}
                            {showSpots && (left ?? 0) <= 0 && (
                                <View style={[s.evSpotsLeftBadge, s.evSpotsFullBadge]}>
                                    <Text style={s.evSpotsFullText}>{t.fullBadge}</Text>
                                </View>
                            )}
                        </View>
                    );
                })()}

                {/* In-feed rating for rated past events */}
                {(post.rating?.count ?? 0) > 0 && (
                    <RecapStars postId={post.id} rating={post.rating} canRate={!!post.canRate} />
                )}
            </View>
            )}

            {/* RSVP sits in its own ruled footer, between body and engagement */}
            {!post.hasRecap && !onEditPress && !isPast && !isOwner && (
                <View style={s.fcActionFooter}>
                    <Pressable
                        style={[s.fcRsvpBtn, going && s.fcRsvpBtnGoing]}
                        onPress={handleRsvp}
                        disabled={rsvpLoading}
                        accessibilityRole="button"
                        accessibilityLabel={going ? t.cancelRsvpLabel : t.rsvpToEventLabel}
                    >
                        {going && <Ionicons name="checkmark-circle" size={15} color={C.primary} />}
                        <Text style={[s.fcRsvpText, going && s.fcRsvpTextGoing]}>{going ? t.youreGoing : t.rsvpGoingPrompt}</Text>
                    </Pressable>
                    {going && (post.rsvpCount ?? 0) > 0 && (
                        <Text style={s.fcRsvpCaption}>{t.goingSummary([], post.rsvpCount ?? 0)}</Text>
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
                <AutoHeightImage uri={post.imageUrl ?? ""} label={`${post.clubName} post image`} />
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

export function PollCard({
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
    onPress,
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
    onPress?: () => void;
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

    const subtitle = [post.timestamp, poll.endsAt].filter(Boolean).join(" · ");

    // A closed poll can't be voted on any more, so surface its results the same
    // way a voted poll does — otherwise the options look tappable but every tap
    // is rejected by the server ("Vote failed").
    const showResults = !!poll.userVote || !!poll.closed;

    // Selection is held locally until "Submit vote" — see PollChoice.
    const [choice, setChoice] = useState<string | null>(null);
    const submitVote = useCallback(() => {
        if (!choice) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPollVote(post.id, choice);
    }, [choice, onPollVote, post.id]);

    const lastTap = useRef<number>(0);
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartAnim = useRef(new Animated.Value(0)).current;

    const handleLike = useCallback(() => {
        onLikePress?.(post.id);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, [post.id, onLikePress]);

    // Single tap on the card opens the poll detail; a second tap within 300ms cancels
    // that and likes instead. Taps on the vote options / action buttons are nested
    // Pressables, so they never reach here — voting or liking won't navigate.
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
    }, [post.isLiked, handleLike, heartAnim, onPress]);

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
                ) : (
                    <View style={s.fcTypePill}>
                        <Text style={s.fcTypePillText}>{t.pollType}</Text>
                    </View>
                )}
                onClubPress={onClubPress}
            />

            {/* Image */}
            {!!post.imageUrl && (
                <View style={s.fcImageWrap}>
                    <AutoHeightImage uri={post.imageUrl} label={`${post.clubName} poll image`} />
                </View>
            )}

            {/* Question, then either the ballot or the results */}
            <View style={s.fcBody}>
                {!!poll.question && <Text style={s.fcTitle}>{poll.question}</Text>}
                {!!post.content && <Text style={s.fcDesc}>{post.content}</Text>}
                {showResults ? (
                    <PollResults poll={poll} />
                ) : (
                    <>
                        <View style={s.fcPollOptions}>
                            {poll.options.map((option) => (
                                <PollChoice
                                    key={option.id}
                                    option={option}
                                    selected={choice === option.id}
                                    onSelect={() => {
                                        Haptics.selectionAsync();
                                        setChoice(option.id);
                                    }}
                                />
                            ))}
                        </View>
                        <View style={s.fcPollSubmitRow}>
                            <Pressable
                                style={[s.fcPollSubmitBtn, !choice && s.fcPollSubmitBtnDisabled]}
                                onPress={submitVote}
                                disabled={!choice}
                                accessibilityRole="button"
                                accessibilityState={{ disabled: !choice }}
                                accessibilityLabel={t.submitVote}
                            >
                                <Text style={[s.fcPollSubmitText, !choice && s.fcPollSubmitTextDisabled]}>{t.submitVote}</Text>
                            </Pressable>
                            <Text style={s.fcPollMeta}>{t.votedCount(poll.totalVotes)}</Text>
                        </View>
                    </>
                )}
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

// Deliberately module-level so a post viewed on one screen isn't re-reported
// when it appears on another. Keys are `${userId}:${postId}`, not bare post ids:
// views are recorded per user, so after an account switch the new user's views
// would otherwise be silently dropped for every post the previous one had seen.
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
    // Pinned section (filter chips, avatar rail): scrolls with the header, then
    // docks at the top of the list once scrolled past — Instagram-stories style.
    stickySection?: React.ReactElement | null;
    // Changes whenever the caller's active filter changes; cards respond with
    // the rise + stagger entrance (instant under reduce-motion).
    transitionKey?: string;
    // FlatList passthrough props
    ListHeaderComponent?: React.ReactElement | null;
    ListFooterComponent?: React.ReactElement | null;
    ListEmptyComponent?: React.ReactElement | null;
    onEndReached?: () => void;
    onEndReachedThreshold?: number;
    refreshControl?: React.ReactElement<RefreshControlProps>;
    onScroll?: (e: any) => void;
    scrollEventThrottle?: number;
    scrollRef?: React.Ref<any>;
    contentContainerStyle?: ViewStyle;
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
    stickySection,
    transitionKey,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    onEndReached,
    onEndReachedThreshold,
    refreshControl,
    onScroll,
    scrollEventThrottle,
    scrollRef,
    contentContainerStyle,
    style,
}: SocialFeedProps) {
    const { colors: C } = useTheme();
    const t = useT();
    const { lang } = useLang();
    const reduceMotion = useReduceMotion();
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const [posts, setPosts] = useState<FeedPost[]>(() => interleavePosts(initialPosts));

    // Sync from props during render (not in an effect) so a filter change and
    // its new post set commit in the same frame — no flash of stale content.
    const prevInitialPostsRef = useRef(initialPosts);
    if (prevInitialPostsRef.current !== initialPosts) {
        prevInitialPostsRef.current = initialPosts;
        setPosts(interleavePosts(initialPosts));
    }

    // Timestamp of the latest filter switch — lets cards that mount a beat
    // later (new posts entering the filtered list) join the same stagger.
    const transitionAtRef = useRef(0);
    const prevTransitionKeyRef = useRef(transitionKey);
    if (transitionKey !== prevTransitionKeyRef.current) {
        prevTransitionKeyRef.current = transitionKey;
        transitionAtRef.current = Date.now();
    }

    // Internal list handle (merged with the caller's scrollRef) plus live
    // scroll/header measurements for the filter-switch scroll correction.
    const listRef = useRef<FlatList<FeedPost> | null>(null);
    const setListRef = useCallback((node: FlatList<FeedPost> | null) => {
        listRef.current = node;
        if (typeof scrollRef === "function") scrollRef(node);
        else if (scrollRef) (scrollRef as React.MutableRefObject<FlatList<FeedPost> | null>).current = node;
    }, [scrollRef]);
    const scrollOffsetRef = useRef(0);
    const headerHeightRef = useRef(0);

    // On a filter switch, snap only as far as the sticky band's dock position,
    // and only when the user has scrolled past it — the new results start
    // right under the docked band instead of jarringly jumping back up to the
    // masthead. If the header is still visible, the scroll is left alone.
    const firstTransitionRef = useRef(true);
    useEffect(() => {
        if (firstTransitionRef.current) { firstTransitionRef.current = false; return; }
        if (scrollOffsetRef.current > headerHeightRef.current) {
            listRef.current?.scrollToOffset({ offset: headerHeightRef.current, animated: false });
        }
    }, [transitionKey]);
    const authApi = useApi();
    const { session } = useAuth();
    const tokenRef = useRef(session?.token);
    tokenRef.current = session?.token;
    const userIdRef = useRef(session?.userId);
    userIdRef.current = session?.userId;

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

    // Record a view only when a post actually scrolls into the viewport (≥50% visible),
    // not merely because it was fetched — so the "seen" signal reflects real attention.
    // Refs keep these stable (RN forbids changing them between renders). api() is used
    // directly so a 401 never triggers signOut() and a navigation loop.
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
    const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item?: FeedPost }> }) => {
        const token = tokenRef.current;
        const viewerId = userIdRef.current;
        if (!token) return;
        for (const v of viewableItems) {
            const p = v.item;
            if (!p || p.id === STICKY_ROW_ID || p.id === EMPTY_ROW_ID) continue;
            const key = `${viewerId ?? "anon"}:${p.id}`;
            if (viewedPostIds.has(key)) continue;
            viewedPostIds.add(key);
            api(`/posts/${p.id}/view`, { method: "POST" }, token).catch(() => {});
        }
    }).current;

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
        if (post.id === STICKY_ROW_ID) return stickySection ?? null;
        if (post.id === EMPTY_ROW_ID) return ListEmptyComponent ?? null;
        // The injected sticky row shifts real posts down by one list index.
        const postIndex = stickySection ? index - 1 : index;
        const showFollow = unfollowedClubIds.has(post.clubId);
        const isOwner = session?.userType === "CLUB" && session?.userId === post.clubId;

        let card: React.ReactNode;
        if (post.type === "poll" && post.poll) {
            card = <PollCard post={post} onPress={() => onPostPress?.(post)} onLikePress={onLikePress} onCommentPress={onCommentPress} onClubPress={onClubPress} onFollowToggle={handleFollowToggle} showFollow={showFollow} onPollVote={handlePollVote} onPollRefresh={refreshPoll} onEditPress={onEditPress} onDeletePress={onEditPress ? handleDeletePost : undefined} />;
        } else if (post.type === "event") {
            card = postIndex === heroIdx
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
        const body = post.reason && !onEditPress ? (
            <View>
                <View style={s.reasonChipRow}>
                    <View style={s.reasonChip}>
                        <Ionicons name="sparkles-outline" size={12} color={C.textMuted} />
                        <Text style={s.reasonChipText} numberOfLines={1}>{localizeReason(post.reason, t, lang)}</Text>
                    </View>
                    <Pressable
                        onPress={() => handleShowLess(post)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t.showLessLikeLabel}
                    >
                        <Text style={s.showLessText}>{t.showLess}</Text>
                    </Pressable>
                </View>
                {card}
            </View>
        ) : card;

        if (transitionKey === undefined) return <>{body}</>;
        return (
            <StaggerCard
                trigger={transitionKey}
                transitionAtRef={transitionAtRef}
                order={Math.min(Math.max(postIndex, 0), 5)}
                reduceMotion={reduceMotion}
            >
                {body}
            </StaggerCard>
        );
    }, [posts, heroIdx, unfollowedClubIds, onPostPress, onClubPress, onLikePress, onCommentPress, onEditPress, onAddRecapPhoto, onViewRecapPhotos, handleDeletePost, handleShowLess, handleFollowToggle, handlePollVote, stickySection, ListEmptyComponent, transitionKey, reduceMotion, t, lang, s, C]);

    // With a sticky section, the section itself becomes the first row so
    // FlatList can dock it, and an empty-state sentinel keeps it on screen
    // (and the filters usable) when a filter matches no posts.
    const listData = useMemo(() => {
        if (!stickySection) return posts;
        const rows: FeedPost[] = posts.length ? posts : [{ id: EMPTY_ROW_ID } as FeedPost];
        return [{ id: STICKY_ROW_ID } as FeedPost, ...rows];
    }, [posts, stickySection]);

    return (
        <FlatList
            ref={setListRef}
            data={listData}
            keyExtractor={(item) => item.id}
            renderItem={renderPost}
            extraData={listData}
            style={style}
            contentContainerStyle={[s.feed, contentContainerStyle]}
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={stickySection ? [ListHeaderComponent ? 1 : 0] : undefined}
            ListHeaderComponent={ListHeaderComponent
                ? <View onLayout={(e) => { headerHeightRef.current = e.nativeEvent.layout.height; }}>{ListHeaderComponent}</View>
                : ListHeaderComponent}
            ListFooterComponent={ListFooterComponent}
            ListEmptyComponent={stickySection ? undefined : ListEmptyComponent}
            onEndReached={onEndReached}
            onEndReachedThreshold={onEndReachedThreshold ?? 0.4}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            refreshControl={refreshControl}
            onScroll={(e) => {
                scrollOffsetRef.current = e.nativeEvent?.contentOffset?.y ?? 0;
                onScroll?.(e);
            }}
            scrollEventThrottle={scrollEventThrottle ?? 16}
        />
    );
}
