import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useReduceMotion } from "../lib/useReduceMotion";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    View, Text, ScrollView, Pressable, StyleSheet, Alert,
    ActivityIndicator, Animated, useWindowDimensions, Modal, Share, RefreshControl, PanResponder,
    type LayoutChangeEvent,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "../lib/useApi";
import { useAuth } from "../auth/AuthContext";
import { useLang, pickLocale, pickText } from "../lib/LangContext";
import { useToast } from "../lib/ToastContext";
import { ProfileSkeleton, ErrorRetry } from "./SkeletonLoader";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/LangContext";
import { translateCategory } from "../lib/categories";
import { timeAgo, fmtTime24 as fmtTime, fmtLongDate } from "../lib/datetime";
import type { AppColors } from "../styles/theme";
import { LinearGradient } from "expo-linear-gradient";
import SocialFeed, { FeedPost } from "./SocialFeed";

const BURGUNDY = "#8C0327";

type PostTab = "history" | "events" | "polls" | "media";

type Club = {
    id: string;
    clubName: string;
    clubNameFr?: string;
    logoUrl?: string;
    description?: string;
    descriptionFr?: string;
    category?: string;
    location?: string;
    instagram?: string;
    twitter?: string;
    contactEmail?: string;
    _count: { followedBy: number; posts: number };
};

type ApiPost = {
    id: string;
    type: string;
    locales: any;
    images: string[];
    createdAt: string;
    startAt?: string;
    endAt?: string;
    locationName?: string;
    pollOptions?: { id: string; textEn: string; textFr?: string | null; _count: { votes: number } }[];
    pollExpiresAt?: string;
    userVote?: string | null;
    tags?: string[];
    _count: { likes: number; comments: number; rsvps: number };
};


function formatMembers(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}

function toFeedPost(p: ApiPost, club: Club, lang: string): FeedPost {
    // Fold the legacy "update" type into "announcement" (see index.tsx mapPost).
    const lowered = p.type.toLowerCase();
    const rawType = (lowered === "update" ? "announcement" : lowered) as FeedPost["type"];
    const loc = pickLocale(p.locales, lang as any);
    const title = loc.title ?? "";
    const body = loc.body ?? "";
    const imageUrl = loc.posterUrl ?? loc.imageUrl;
    const eventTime = p.startAt
        ? (p.endAt ? `${fmtTime(p.startAt)} – ${fmtTime(p.endAt)}` : fmtTime(p.startAt))
        : undefined;
    let poll: FeedPost["poll"] | undefined;
    if (rawType === "poll" && p.pollOptions) {
        const total = p.pollOptions.reduce((s, o) => s + (o._count?.votes ?? 0), 0);
        poll = {
            question: title,
            options: p.pollOptions.map((o) => ({
                id: o.id,
                text: lang === "fr" && o.textFr ? o.textFr : o.textEn,
                votes: o._count?.votes ?? 0,
            })),
            totalVotes: total,
            userVote: p.userVote ?? undefined,
        };
    }
    return {
        id: p.id,
        clubId: club.id,
        clubName: pickText(club.clubName, club.clubNameFr, lang as any),
        clubAvatar: club.logoUrl,
        isFollowing: true,
        type: rawType,
        timestamp: timeAgo(p.createdAt, lang),
        content: body,
        imageUrl,
        images: p.images ?? [],
        eventTitle: rawType !== "poll" ? title : undefined,
        eventDate: rawType === "event" && p.startAt ? fmtLongDate(p.startAt, lang) : undefined,
        eventTime,
        eventEndAt: rawType === "event" ? (p.endAt ?? p.startAt) : undefined,
        eventLocation: p.locationName,
        likes: p._count.likes,
        comments: p._count.comments,
        poll,
    };
}

function filterPosts(posts: FeedPost[], tab: PostTab): FeedPost[] {
    switch (tab) {
        case "events": return posts.filter((p) => p.type === "event");
        case "polls":  return posts.filter((p) => p.type === "poll");
        case "media":  return posts.filter((p) => !!p.imageUrl);
        default:       return posts;
    }
}

const TABS: { key: PostTab }[] = [
    { key: "history" },
    { key: "events" },
    { key: "polls" },
    { key: "media" },
];
const TAB_LABELS = (t: any): Record<PostTab, string> => ({
    history: t.postHistoryTab,
    events: t.upcomingEventsTab,
    polls: t.pollsTab,
    media: t.mediaTab,
});

type Props = {
    id: string;
    hideHeader?: boolean;
    isProfileTab?: boolean;
};

export default function ClubProfileView({ id, hideHeader = false, isProfileTab = false }: Props) {
    const { colors: C } = useTheme();
    const reduceMotion = useReduceMotion();
    const s = useMemo(() => makeClubStyles(C), [C]);
    const router = useRouter();
    const { session } = useAuth();
    const authApi = useApi();
    const { showToast } = useToast();
    const t = useT();
    const { lang } = useLang();
    const isOwner = session?.userId === id;

    const [club, setClub] = useState<Club | null>(null);
    const [posts, setPosts] = useState<FeedPost[]>([]);
    const [pinnedPost, setPinnedPost] = useState<FeedPost | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [isFollowing, setIsFollowing] = useState(false);
    const [notifPref, setNotifPref] = useState("ALL");
    const [notifModalOpen, setNotifModalOpen] = useState(false);
    const notifSheetY = useRef(new Animated.Value(600)).current;

    function openSheet(anim: Animated.Value) {
        if (reduceMotion) { anim.setValue(0); return; }
        Animated.spring(anim, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 200 }).start();
    }
    function closeSheet(anim: Animated.Value, cb: () => void) {
        if (reduceMotion) { anim.setValue(600); cb(); return; }
        Animated.timing(anim, { toValue: 600, duration: 220, useNativeDriver: true }).start(cb);
    }

    const [tab, setTab] = useState<PostTab>("history");
    const { width: screenWidth } = useWindowDimensions();
    const [headerH, setHeaderH] = useState(0);
    const [tabH, setTabH] = useState(44);

    function handleShare() {
        const shareName = pickText(club?.clubName, club?.clubNameFr, lang);
        Share.share({
            title: shareName || "Check out this club",
            message: `Check out ${shareName} on uEvents!`,
        });
    }

    const reduceMotionRef = useRef(reduceMotion); reduceMotionRef.current = reduceMotion;
    const isProfileTabRef = useRef(isProfileTab); isProfileTabRef.current = isProfileTab;
    const routerRef = useRef(router); routerRef.current = router;
    const screenWidthRef = useRef(screenWidth); screenWidthRef.current = screenWidth;
    const headerHRef = useRef(0); headerHRef.current = headerH;
    const tabRef = useRef<PostTab>("history"); tabRef.current = tab;

    // Collapsing-header tab pager (mirrors the feed's finger-tracked For You / Following).
    const slideX = useRef(new Animated.Value(0)).current;   // horizontal pager offset
    const scrollY = useRef(new Animated.Value(0)).current;  // shared vertical → header collapse
    const activeIndexRef = useRef(0);
    const paneRefs = useRef<Array<any>>([]);
    const paneScroll = useRef<number[]>(TABS.map(() => 0));

    // Header slides up as the active tab scrolls; the tab bar pins once collapsed.
    const headerTranslate = scrollY.interpolate({
        inputRange: [0, Math.max(1, headerH)],
        outputRange: [0, -Math.max(1, headerH)],
        extrapolate: "clamp",
    });

    function goToIndex(i: number) {
        const W = screenWidthRef.current;
        i = Math.max(0, Math.min(TABS.length - 1, i));
        activeIndexRef.current = i;
        setTab(TABS[i].key);
        if (reduceMotionRef.current) slideX.setValue(-i * W);
        else Animated.timing(slideX, { toValue: -i * W, duration: 240, useNativeDriver: true }).start();
        // Keep the collapsing header consistent with the tab we land on.
        scrollY.setValue(Math.min(paneScroll.current[i] ?? 0, headerHRef.current));
    }
    function switchTab(key: PostTab) { goToIndex(TABS.findIndex((tb) => tb.key === key)); }

    // Finger-tracked horizontal paging. A right-swipe past the first tab leaves
    // the club page (the native back-gesture is disabled on this route).
    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy) * 1.2 && Math.abs(g.dx) > 12,
            onPanResponderGrant: () => {
                slideX.stopAnimation();
                slideX.extractOffset();
                // Align every other pane to the current header-collapse so the tab
                // peeking in under the finger lines up with the pinned header.
                const shared = Math.min(paneScroll.current[activeIndexRef.current] ?? 0, headerHRef.current);
                paneRefs.current.forEach((r, idx) => {
                    if (idx === activeIndexRef.current || !r) return;
                    try {
                        if (typeof r.scrollToOffset === "function") r.scrollToOffset({ offset: shared, animated: false });
                        else if (typeof r.scrollTo === "function") r.scrollTo({ y: shared, animated: false });
                        paneScroll.current[idx] = shared;
                    } catch { /* noop */ }
                });
            },
            onPanResponderMove: (_, g) => {
                const i = activeIndexRef.current;
                let dx = g.dx;
                if ((i === 0 && dx > 0) || (i === TABS.length - 1 && dx < 0)) dx *= 0.35; // resist at ends
                slideX.setValue(dx);
            },
            onPanResponderRelease: (_, g) => {
                slideX.flattenOffset();
                const W = screenWidthRef.current;
                const i = activeIndexRef.current;
                const goNext = g.dx < -W / 4 || g.vx < -0.4;
                const goPrev = g.dx > W / 4 || g.vx > 0.4;
                if (goPrev && i === 0) {
                    if (!isProfileTabRef.current && routerRef.current.canGoBack()) { routerRef.current.back(); return; }
                    goToIndex(0);
                } else if (goNext) goToIndex(i + 1);
                else if (goPrev) goToIndex(i - 1);
                else goToIndex(i);
            },
        }),
    ).current;

    // The active pane drives the shared header collapse; each pane's offset is
    // remembered so switching keeps the header where it should be.
    const makeScrollHandler = (i: number) => (e: { nativeEvent: { contentOffset: { y: number } } }) => {
        const y = e.nativeEvent.contentOffset.y;
        paneScroll.current[i] = y;
        if (i === activeIndexRef.current) scrollY.setValue(y);
    };

    const renderTabBar = (onLayout?: (e: LayoutChangeEvent) => void) => (
        <View style={s.tabBar} onLayout={onLayout}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRow}>
                {TABS.map(({ key }) => (
                    <Pressable key={key} onPress={() => switchTab(key)} style={s.tabItem} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
                        <Text style={[s.tabLabel, tab === key && s.tabLabelActive]}>{TAB_LABELS(t)[key]}</Text>
                        {tab === key && <View style={s.tabUnderline} />}
                    </Pressable>
                ))}
            </ScrollView>
        </View>
    );

    const PAGE_SIZE = 20;

    function loadClub(isRefresh = false) {
        if (!id || !session?.token) return;
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setFetchError(false);
        Promise.all([
            authApi<Club>(`/clubs/${id}`),
            authApi<ApiPost[]>(`/clubs/${id}/posts?limit=${PAGE_SIZE}`),
            authApi<any[]>("/users/me/follows"),
            authApi<ApiPost | null>(`/clubs/${id}/pinned`),
        ]).then(([clubData, postsData, follows, pinned]) => {
            setClub(clubData);
            setPosts(postsData.map((p) => toFeedPost(p, clubData, lang)));
            setHasMore(postsData.length === PAGE_SIZE);
            const follow = follows.find((f: any) => f.id === id);
            setIsFollowing(!!follow);
            if (follow?.notifPref) setNotifPref(follow.notifPref);
            setPinnedPost(pinned ? toFeedPost(pinned, clubData, lang) : null);
        }).catch(() => setFetchError(true)).finally(() => isRefresh ? setRefreshing(false) : setLoading(false));
    }

    useEffect(() => { loadClub(); }, [id, session?.token]);

    async function loadMore() {
        if (loadingMore || !hasMore || !club) return;
        setLoadingMore(true);
        try {
            const more = await authApi<ApiPost[]>(`/clubs/${id}/posts?limit=${PAGE_SIZE}&offset=${posts.length}`);
            setPosts((prev) => [...prev, ...more.map((p) => toFeedPost(p, club, lang))]);
            setHasMore(more.length === PAGE_SIZE);
        } catch { showToast("Could not load more posts.", "error"); }
        setLoadingMore(false);
    }

    async function toggleFollow() {
        const wasFollowing = isFollowing;
        try {
            if (wasFollowing) {
                setIsFollowing(false);
                setClub((c) => c ? { ...c, _count: { ...c._count, followedBy: c._count.followedBy - 1 } } : c);
                await authApi(`/clubs/${id}/follow`, { method: "DELETE" });
            } else {
                setIsFollowing(true);
                setClub((c) => c ? { ...c, _count: { ...c._count, followedBy: c._count.followedBy + 1 } } : c);
                await authApi(`/clubs/${id}/follow`, { method: "POST" });
                notifSheetY.setValue(600);
                setNotifModalOpen(true);
                openSheet(notifSheetY);
            }
        } catch {
            // Revert optimistic update
            setIsFollowing(wasFollowing);
            setClub((c) => c ? { ...c, _count: { ...c._count, followedBy: c._count.followedBy + (wasFollowing ? 1 : -1) } } : c);
            Alert.alert(t.errorTitle, wasFollowing ? t.unfollowError : t.followError);
        }
    }

    async function handleLike(postId: string) {
        const post = posts.find((p) => p.id === postId);
        if (!post) return;
        const next = !post.isLiked;
        setPosts((cur) => cur.map((p) =>
            p.id === postId ? { ...p, isLiked: next, likes: (p.likes ?? 0) + (next ? 1 : -1) } : p
        ));
        try {
            await authApi(`/posts/${postId}/like`, { method: next ? "POST" : "DELETE" });
        } catch {
            setPosts((cur) => cur.map((p) =>
                p.id === postId ? { ...p, isLiked: !next, likes: (p.likes ?? 0) + (next ? -1 : 1) } : p
            ));
        }
    }

    async function handlePollVote(postId: string, optionId: string) {
        try {
            await authApi(`/posts/${postId}/vote`, { method: "POST", body: JSON.stringify({ optionId }) });
        } catch { showToast("Could not submit vote.", "error"); }
    }

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: "#F7F3EE" }}>
                <ProfileSkeleton />
            </View>
        );
    }

    if (!club) {
        return (
            <View style={{ flex: 1, backgroundColor: "#F7F3EE" }}>
                {fetchError
                    ? <ErrorRetry message="Couldn't load club profile" onRetry={() => loadClub()} />
                    : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#6B7280" }}>{t.clubNotFound}</Text></View>
                }
            </View>
        );
    }

    const refreshControl = (
        <RefreshControl refreshing={refreshing} onRefresh={() => loadClub(true)} tintColor="#8C0327" />
    );

    const clubHeader = (
        <>
            {/* Club header card */}
            <View style={s.headerCard}>
                {/* Banner */}
                <View style={s.bannerArea}>
                    {club.logoUrl
                        ? <ExpoImage source={{ uri: club.logoUrl }} style={StyleSheet.absoluteFill as any} contentFit="cover" transition={200} blurRadius={14} />
                        : <View style={[StyleSheet.absoluteFill as any, s.bannerPlaceholder]} />
                    }
                    <View style={[StyleSheet.absoluteFill as any, s.bannerDim]} />
                </View>

                {/* Below-banner body */}
                <View style={s.headerBody}>
                    {/* Logo + action button row */}
                    <View style={s.logoButtonRow}>
                        <View style={s.logoBigWrap}>
                            {club.logoUrl
                                ? <ExpoImage source={{ uri: club.logoUrl }} style={s.logoBig} contentFit="cover" transition={200} />
                                : <Ionicons name="people" size={30} color={BURGUNDY} />
                            }
                        </View>
                        {isOwner ? (
                            <Pressable
                                style={s.editProfileBtn}
                                onPress={() => router.push("/club/edit-profile" as any)}
                                accessibilityRole="button"
                                accessibilityLabel="Edit club profile"
                            >
                                <Ionicons name="create-outline" size={13} color={BURGUNDY} />
                                <Text style={s.editProfileBtnText}>{t.editProfile}</Text>
                            </Pressable>
                        ) : (
                            <Pressable
                                style={[s.followBtn, isFollowing && s.followBtnActive]}
                                onPress={toggleFollow}
                                accessibilityRole="button"
                                accessibilityLabel={isFollowing ? "Unfollow club" : "Follow club"}
                            >
                                <Text style={[s.followBtnText, isFollowing && s.followBtnTextActive]}>
                                    {isFollowing ? "FOLLOWING" : "FOLLOW"}
                                </Text>
                            </Pressable>
                        )}
                    </View>

                    {/* Club name & category */}
                    <Text style={s.clubNameNew} numberOfLines={2}>{pickText(club.clubName, club.clubNameFr, lang)}</Text>
                    {!!club.category && (
                        <Text style={s.categoryLabelNew}>{translateCategory(club.category!, lang).toUpperCase()}</Text>
                    )}

                    {/* Stats row */}
                    <View style={s.statsRow}>
                        <Pressable
                            style={s.statItem}
                            onPress={isOwner ? () => router.push(`/club/followers?id=${id}` as any) : undefined}
                            accessibilityRole={isOwner ? "button" : "text"}
                            accessibilityLabel={`${formatMembers(club._count.followedBy)} ${t.membersLabel}`}
                        >
                            <Text style={[s.statValue, isOwner && { color: BURGUNDY }]}>
                                {formatMembers(club._count.followedBy)}
                            </Text>
                            <Text style={s.statLabel}>{t.membersLabel}{isOwner ? " ›" : ""}</Text>
                        </Pressable>
                        <View style={s.statDivider} />
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{club._count.posts}</Text>
                            <Text style={s.statLabel}>{t.posts}</Text>
                        </View>
                        {!!club.location && (
                            <>
                                <View style={s.statDivider} />
                                <View style={[s.statItem, { flexDirection: "row", gap: 3 }]}>
                                    <Ionicons name="location-outline" size={10} color="#9CA3AF" />
                                    <Text style={[s.statLabel, { letterSpacing: 0.5 }]} numberOfLines={1}>{club.location}</Text>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </View>

            {/* About section */}
            {(!!club.description || isOwner) && (
                <View style={s.aboutBlock}>
                    <Text style={s.aboutLabel}>{t.about}</Text>
                    {club.description ? (
                        <Text style={s.aboutText}>{lang === "fr" && club.descriptionFr ? club.descriptionFr : club.description}</Text>
                    ) : (
                        <Text style={s.aboutPlaceholder}>{t.addDescriptionHint}</Text>
                    )}
                    {!!club.category && (
                        <View style={s.tagsRow}>
                            <View style={s.tagChip}>
                                <Text style={s.tagChipText}>{club.category}</Text>
                            </View>
                        </View>
                    )}
                </View>
            )}

            {/* Social links & contact */}
            {(club.instagram || club.twitter || club.contactEmail) && (
                <View style={s.socialBlock}>
                    {club.instagram && (
                        <View style={s.socialRow}>
                            <Ionicons name="logo-instagram" size={15} color="#6B7280" />
                            <Text style={s.socialText}>@{club.instagram.replace(/^@/, "")}</Text>
                        </View>
                    )}
                    {club.twitter && (
                        <View style={s.socialRow}>
                            <Ionicons name="logo-twitter" size={15} color="#6B7280" />
                            <Text style={s.socialText}>@{club.twitter.replace(/^@/, "")}</Text>
                        </View>
                    )}
                    {club.contactEmail && (
                        <View style={s.socialRow}>
                            <Ionicons name="mail-outline" size={15} color="#6B7280" />
                            <Text style={s.socialText}>{club.contactEmail}</Text>
                        </View>
                    )}
                </View>
            )}

            {/* Pinned post */}
            {pinnedPost && (
                pinnedPost.type === "event" && pinnedPost.imageUrl ? (
                    // Hero pinned event card
                    <Pressable
                        style={s.pinnedEventCard}
                        onPress={() => router.push(`/event/${pinnedPost.eventId ?? pinnedPost.id}` as any)}
                    >
                        <ExpoImage source={{ uri: pinnedPost.imageUrl }} style={StyleSheet.absoluteFill as any} contentFit="cover" transition={200} />
                        <LinearGradient
                            colors={["transparent", "rgba(0,0,0,0.92)"]}
                            locations={[0.25, 1]}
                            style={StyleSheet.absoluteFill as any}
                        />
                        <View style={s.pinnedEventBody}>
                            <View style={s.pinnedTagRow}>
                                <View style={s.pinnedTagBurgundy}>
                                    <Text style={s.pinnedTagText}>{t.pinnedPostBadge}</Text>
                                </View>
                                <View style={s.pinnedTagDark}>
                                    <Text style={s.pinnedTagText}>{t.featuredBadge}</Text>
                                </View>
                            </View>
                            <Text style={s.pinnedEventTitle} numberOfLines={3}>
                                {(pinnedPost.eventTitle ?? pinnedPost.content ?? "").toUpperCase()}
                            </Text>
                            {!!pinnedPost.content && (
                                <Text style={s.pinnedEventDesc} numberOfLines={3}>{pinnedPost.content}</Text>
                            )}
                            <View style={s.pinnedEventCtaRow}>
                                <Pressable
                                    style={s.pinnedEventCta}
                                    onPress={() => router.push(`/event/${pinnedPost.eventId ?? pinnedPost.id}` as any)}
                                >
                                    <Text style={s.pinnedEventCtaText}>VIEW EVENT  →</Text>
                                </Pressable>
                                {isOwner && (
                                    <Pressable
                                        style={s.pinnedEventEditBtn}
                                        onPress={() => router.push({ pathname: "/edit/[id]", params: { id: pinnedPost.id } } as any)}
                                        hitSlop={8}
                                        accessibilityRole="button"
                                        accessibilityLabel="Edit pinned post"
                                    >
                                        <Ionicons name="create-outline" size={18} color="#fff" />
                                    </Pressable>
                                )}
                            </View>
                        </View>
                    </Pressable>
                ) : (
                    // Simple pinned card for announcements / polls
                    <Pressable
                        style={s.pinnedCard}
                        onPress={() => router.push((pinnedPost.type === "event" ? `/event/${pinnedPost.eventId ?? pinnedPost.id}` : `/post/${pinnedPost.id}`) as any)}
                    >
                        <View style={s.pinnedHeader}>
                            <Ionicons name="pin" size={12} color={BURGUNDY} />
                            <Text style={s.pinnedLabel}>{t.pinnedPostBadge}</Text>
                        </View>
                        <Text style={s.pinnedTitle} numberOfLines={2}>
                            {(pinnedPost.eventTitle ?? pinnedPost.poll?.question ?? pinnedPost.content ?? "").toUpperCase()}
                        </Text>
                        {!!pinnedPost.content && !!pinnedPost.eventTitle && (
                            <Text style={s.pinnedPreview} numberOfLines={2}>{pinnedPost.content}</Text>
                        )}
                        <View style={s.pinnedFooter}>
                            <Text style={s.pinnedViewText}>VIEW POST →</Text>
                        </View>
                    </Pressable>
                )
            )}

        </>
    );

    const footerFor = (list: FeedPost[]) => (
        <>
            {hasMore && list.length > 0 && (
                <Pressable style={s.loadArchive} onPress={loadMore} disabled={loadingMore} accessibilityRole="button" accessibilityLabel="Load more posts">
                    {loadingMore
                        ? <ActivityIndicator color={BURGUNDY} size="small" />
                        : <>
                            <Text style={s.loadArchiveText}>{t.loadArchiveBtn}</Text>
                            <Ionicons name="chevron-down" size={14} color={BURGUNDY} />
                        </>
                    }
                </Pressable>
            )}
            <View style={{ height: 60 }} />
        </>
    );

    const emptyNode = (
        <View style={s.emptyState}>
            <Ionicons name="document-outline" size={32} color="#D1CBC3" />
            <Text style={s.emptyText}>{t.noPostsHere}</Text>
        </View>
    );

    const paneTopPad = headerH + tabH;

    // One pane per tab — all mounted side-by-side so they finger-track/peek.
    function renderPane(tabKey: PostTab, i: number) {
        const list = filterPosts(posts, tabKey);
        // Every pane keeps its own refresh control. (Toggling it on/off per active
        // tab makes RN recreate the scroll view, which caused a white flash on swipe.)
        const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => loadClub(true)} tintColor="#8C0327" progressViewOffset={paneTopPad} />;
        if (tabKey === "media") {
            const cellSize = Math.floor((screenWidth - 3) / 3);
            return (
                <ScrollView
                    key={tabKey}
                    ref={(r) => { paneRefs.current[i] = r; }}
                    style={{ width: screenWidth, flex: 1 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={refresh}
                    onScroll={makeScrollHandler(i)}
                    scrollEventThrottle={16}
                    contentContainerStyle={{ paddingTop: paneTopPad }}
                >
                    {list.length === 0 ? emptyNode : (
                        <View style={s.photoGrid}>
                            {list.map((post) => (
                                <Pressable
                                    key={post.id}
                                    style={{ width: cellSize, height: cellSize, margin: 0.5 }}
                                    onPress={() => router.push((post.type === "event" ? `/event/${post.eventId ?? post.id}` : `/post/${post.id}`) as any)}
                                >
                                    <ExpoImage source={{ uri: post.imageUrl ?? "" }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} />
                                    {post.images && post.images.length > 1 && (
                                        <View style={s.gridMultiIcon}>
                                            <Ionicons name="copy-outline" size={12} color="#fff" />
                                        </View>
                                    )}
                                </Pressable>
                            ))}
                        </View>
                    )}
                    {footerFor(list)}
                </ScrollView>
            );
        }
        return (
            <SocialFeed
                key={tabKey}
                scrollRef={(r: any) => { paneRefs.current[i] = r; }}
                style={{ width: screenWidth, flex: 1 }}
                contentContainerStyle={{ paddingTop: paneTopPad }}
                posts={list}
                onPostPress={(post) => router.push((post.type === "event" ? `/event/${post.eventId ?? post.id}` : `/post/${post.id}`) as any)}
                onCommentPress={(postId, type, opts) => router.push(
                    type === "event"
                        ? { pathname: "/event/[id]", params: { id: postId, ...(opts?.commentId ? { highlightComment: opts.commentId } : {}), ...(opts?.focus ? { focusComment: "1" } : {}) } } as any
                        : { pathname: "/post/[id]", params: { id: postId, ...(opts?.commentId ? { highlightComment: opts.commentId } : {}), ...(opts?.focus ? { focusComment: "1" } : {}) } } as any
                )}
                onLikePress={handleLike}
                onViewRecapPhotos={(postId) => router.push({ pathname: "/event/[id]", params: { id: postId, focusPhotos: "1" } } as any)}
                onPollVote={handlePollVote}
                onEditPress={isOwner ? (postId) => router.push({ pathname: "/edit/[id]", params: { id: postId } } as any) : undefined}
                onDeletePress={isOwner ? (postId) => setPosts((cur) => cur.filter((p) => p.id !== postId)) : undefined}
                ListEmptyComponent={emptyNode}
                ListFooterComponent={footerFor(list)}
                refreshControl={refresh}
                onScroll={makeScrollHandler(i)}
                scrollEventThrottle={16}
            />
        );
    }

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            {!hideHeader && (
                <View style={s.topBar}>
                    {isProfileTab ? (
                        <View style={{ width: 36 }} />
                    ) : (
                        <Pressable onPress={() => router.back()} style={s.backGroup} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
                            <Ionicons name="arrow-back" size={18} color={BURGUNDY} />
                        </Pressable>
                    )}
                    <Text style={s.topBarTitle}>{t.clubProfileTitle}</Text>
                    <View style={{ flexDirection: "row", gap: 4 }}>
                        {isProfileTab ? (
                            <Pressable style={s.menuBtn} onPress={() => router.push("/settings" as any)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Settings">
                                <Ionicons name="settings-outline" size={20} color="#C4BFB8" />
                            </Pressable>
                        ) : (
                            <>
                                <Pressable style={s.menuBtn} onPress={handleShare} hitSlop={8} accessibilityRole="button" accessibilityLabel="Share club">
                                    <Ionicons name="share-outline" size={20} color="#C4BFB8" />
                                </Pressable>
                                <Pressable
                                    style={s.menuBtn}
                                    onPress={() => { notifSheetY.setValue(600); setNotifModalOpen(true); openSheet(notifSheetY); }}
                                    hitSlop={8}
                                    accessibilityRole="button"
                                    accessibilityLabel={notifPref === "ALL" ? "Notifications on" : notifPref === "NONE" ? "Notifications off" : "Notification settings"}
                                >
                                    <Ionicons
                                        name={
                                            !isFollowing        ? "notifications-outline" :
                                            notifPref === "ALL"    ? "notifications" :
                                            notifPref === "NONE"   ? "notifications-off" :
                                            "notifications-outline"
                                        }
                                        size={20}
                                        color={
                                            !isFollowing          ? "#C4BFB8" :
                                            notifPref === "NONE"  ? "#C4BFB8" :
                                            notifPref === "ALL"   ? BURGUNDY :
                                            "#C4BFB8"
                                        }
                                    />
                                </Pressable>
                            </>
                        )}
                    </View>
                </View>
            )}

            <View style={{ flex: 1, overflow: "hidden" }}>
                {/* Finger-tracked tab panes */}
                <Animated.View
                    style={{ flex: 1, flexDirection: "row", width: screenWidth * TABS.length, transform: [{ translateX: slideX }] }}
                    {...panResponder.panHandlers}
                >
                    {TABS.map((tb, i) => renderPane(tb.key, i))}
                </Animated.View>

                {/* Collapsing club header (shared, slides up as you scroll) */}
                <Animated.View
                    pointerEvents="box-none"
                    onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 5, transform: [{ translateY: headerTranslate }] }}
                >
                    {clubHeader}
                </Animated.View>

                {/* Sticky tab bar — pins to the top once the header collapses */}
                <Animated.View
                    onLayout={(e) => setTabH(e.nativeEvent.layout.height)}
                    style={{ position: "absolute", top: headerH, left: 0, right: 0, zIndex: 6, transform: [{ translateY: headerTranslate }] }}
                >
                    {renderTabBar()}
                </Animated.View>
            </View>

            {/* Notification pref modal */}
            <Modal visible={notifModalOpen} animationType="none" transparent>
                <Pressable style={s.modalBackdrop} onPress={() => closeSheet(notifSheetY, () => setNotifModalOpen(false))}>
                    <Animated.View style={[s.modalSheet, { transform: [{ translateY: notifSheetY }] }]}>
                        <View style={s.modalHandle} />
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{t.notificationsSection}</Text>
                            <Pressable onPress={() => closeSheet(notifSheetY, () => setNotifModalOpen(false))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                                <Ionicons name="close" size={20} color="#374151" />
                            </Pressable>
                        </View>
                        <Text style={s.modalSubtitle}>FOR {pickText(club.clubName, club.clubNameFr, lang).toUpperCase()}</Text>
                        {([
                            { key: "ALL",    icon: "notifications",             label: "All",         desc: "Events, announcements & polls" },
                            { key: "EVENTS", icon: "notifications-outline",     label: "Events only", desc: "Only new events from this club" },
                            { key: "NONE",   icon: "notifications-off",         label: "Muted",       desc: "No notifications" },
                        ] as const).map(({ key, icon, label, desc }) => {
                            const selected = notifPref === key;
                            return (
                                <Pressable
                                    key={key}
                                    style={[s.notifOptRow, selected && s.notifOptRowActive]}
                                    onPress={async () => {
                                        const prev = notifPref;
                                        setNotifPref(key);
                                        closeSheet(notifSheetY, () => setNotifModalOpen(false));
                                        try {
                                            if (!isFollowing) {
                                                await authApi(`/clubs/${id}/follow`, { method: "POST" });
                                                setIsFollowing(true);
                                                setClub((c) => c ? { ...c, _count: { ...c._count, followedBy: c._count.followedBy + 1 } } : c);
                                            }
                                            await authApi(`/clubs/${id}/follow/notif-pref`, {
                                                method: "PATCH",
                                                body: JSON.stringify({ notifPref: key }),
                                            });
                                        } catch {
                                            setNotifPref(prev);
                                        }
                                    }}
                                >
                                    <Ionicons name={icon} size={18} color={selected ? BURGUNDY : "#9CA3AF"} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.notifOptLabel, selected && { color: BURGUNDY }]}>{label}</Text>
                                        <Text style={s.notifOptDesc}>{desc}</Text>
                                    </View>
                                    {selected && <Ionicons name="checkmark" size={16} color={BURGUNDY} />}
                                </Pressable>
                            );
                        })}
                    </Animated.View>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

const makeClubStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    topBar: {
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 20, paddingVertical: 12,
        backgroundColor: C.bg,
    },
    backGroup: { width: 36, alignItems: "flex-start" },
    topBarTitle: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "800", color: C.text, letterSpacing: 2 },
    menuBtn: { width: 36, alignItems: "flex-end" },
    headerCard: { backgroundColor: C.surface, overflow: "hidden" },
    bannerArea: { height: 140, overflow: "hidden", backgroundColor: "#1a1a1a" },
    bannerPlaceholder: { backgroundColor: C.primary, opacity: 0.6 },
    bannerDim: { backgroundColor: "rgba(0,0,0,0.28)" },
    headerBody: { paddingHorizontal: 16, paddingBottom: 20 },
    logoButtonRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: -36, marginBottom: 10 },
    logoBigWrap: { width: 72, height: 72, borderWidth: 3, borderColor: C.surface, backgroundColor: C.primaryBg, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    logoBig: { width: "100%" as any, height: "100%" as any },
    clubNameNew: { fontSize: 26, fontWeight: "900", color: C.text, letterSpacing: -0.5, lineHeight: 30 },
    categoryLabelNew: { fontSize: 10, fontWeight: "700", color: C.primary, letterSpacing: 2, marginTop: 4 },
    statsRow: { flexDirection: "row", alignItems: "center", marginTop: 16, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.borderWarm },
    statItem: { flex: 1, alignItems: "center", gap: 3 },
    statValue: { fontSize: 16, fontWeight: "900", color: C.text },
    statLabel: { fontSize: 9, fontWeight: "700", color: C.textLight, letterSpacing: 1.5 },
    statDivider: { width: 1, height: 28, backgroundColor: C.borderWarm },
    followBtn: { backgroundColor: C.primary, paddingVertical: 8, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
    editProfileBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: C.primary, paddingVertical: 7, paddingHorizontal: 12 },
    editProfileBtnText: { fontSize: 11, fontWeight: "800", color: C.primary, letterSpacing: 1 },
    followBtnActive: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: C.primary },
    followBtnText: { fontSize: 11, fontWeight: "800", color: "#fff", letterSpacing: 1.5 },
    followBtnTextActive: { color: C.primary },
    aboutBlock: { backgroundColor: C.surface, paddingHorizontal: 20, paddingVertical: 18, marginTop: 8 },
    aboutLabel: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 2, marginBottom: 10 },
    aboutText: { fontSize: 14, lineHeight: 22, color: C.textBody },
    aboutPlaceholder: { fontSize: 13, color: C.textLight, fontStyle: "italic" },
    tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    tagChip: { backgroundColor: C.surfaceAlt, paddingHorizontal: 12, paddingVertical: 6 },
    tagChipText: { fontSize: 10, fontWeight: "700", color: C.textMuted, letterSpacing: 1 },
    socialBlock: { backgroundColor: C.surface, paddingHorizontal: 20, paddingVertical: 14, marginTop: 1, gap: 10 },
    socialRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    socialText: { fontSize: 13, color: C.textBody, fontWeight: "500" },
    pinnedCard: { backgroundColor: C.surface, marginTop: 1, paddingHorizontal: 20, paddingVertical: 16, gap: 8, borderLeftWidth: 3, borderLeftColor: C.primary },
    pinnedHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
    pinnedLabel: { fontSize: 9, fontWeight: "800", color: C.primary, letterSpacing: 2 },
    pinnedTitle: { fontSize: 15, fontWeight: "900", color: C.text, letterSpacing: 0.2, lineHeight: 21 },
    pinnedPreview: { fontSize: 13, color: C.textMuted, lineHeight: 19 },
    pinnedFooter: { marginTop: 2 },
    pinnedViewText: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1.5 },
    pinnedEventCard: { marginTop: 8, marginHorizontal: 12, aspectRatio: 1, overflow: "hidden", backgroundColor: "#1a1a1a" },
    pinnedEventBody: { flex: 1, justifyContent: "flex-end", padding: 20, gap: 10 },
    pinnedTagRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
    pinnedTagBurgundy: { backgroundColor: C.primary, paddingHorizontal: 10, paddingVertical: 4 },
    pinnedTagDark: { backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 10, paddingVertical: 4 },
    pinnedTagText: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 1.5 },
    pinnedEventTitle: { fontSize: 26, fontWeight: "900", color: "#fff", letterSpacing: -0.5, lineHeight: 30 },
    pinnedEventDesc: { fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 20 },
    pinnedEventCtaRow: { flexDirection: "row", gap: 8, marginTop: 4 },
    pinnedEventCta: { flex: 3, backgroundColor: C.primary, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
    pinnedEventCtaText: { fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 2 },
    pinnedEventEditBtn: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    tabBar: { backgroundColor: C.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderWarm },
    tabRow: { flexDirection: "row", paddingHorizontal: 20 },
    stickyTabs: {
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
        backgroundColor: C.bg,
        shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
    },
    tabItem: { paddingRight: 24, paddingVertical: 14, position: "relative" },
    tabLabel: { fontSize: 10, fontWeight: "800", color: C.textLight, letterSpacing: 1 },
    tabLabelActive: { color: C.text },
    tabUnderline: { position: "absolute", bottom: 0, left: 0, right: 24, height: 2, backgroundColor: C.primary },
    postList: { backgroundColor: C.bg, marginTop: 1 },
    emptyState: { alignItems: "center", paddingVertical: 60, gap: 12 },
    emptyText: { fontSize: 11, fontWeight: "700", color: C.textFaint, letterSpacing: 2 },
    photoGrid: { flexDirection: "row", flexWrap: "wrap" },
    gridMultiIcon: {
        position: "absolute",
        top: 5,
        right: 5,
        backgroundColor: "rgba(0,0,0,0.45)",
        padding: 3,
        borderRadius: 3,
    },
    loadArchive: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 24 },
    loadArchiveText: { fontSize: 11, fontWeight: "800", color: C.primary, letterSpacing: 1.5 },
    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    modalSheet: { backgroundColor: C.bg, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12, gap: 8 },
    modalHandle: { width: 36, height: 4, backgroundColor: C.textFaint, alignSelf: "center", marginBottom: 8 },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
    modalTitle: { fontSize: 14, fontWeight: "900", color: C.text, letterSpacing: 2 },
    modalSubtitle: { fontSize: 9, fontWeight: "800", color: C.primary, letterSpacing: 1.5, marginBottom: 8 },
    notifOptRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderWarm, marginBottom: 6 },
    notifOptRowActive: { borderColor: C.primary },
    notifOptLabel: { fontSize: 13, fontWeight: "700", color: C.text },
    notifOptDesc: { fontSize: 11, color: C.textLight, marginTop: 2 },

    editModalSheet: {
        backgroundColor: C.bg,
        paddingHorizontal: 20,
        paddingBottom: 40,
        paddingTop: 12,
        gap: 10,
    },
    editFieldLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
        marginTop: 4,
    },
    editInput: {
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.borderWarm,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        color: C.text,
    },
    editInputMultiline: {
        minHeight: 100,
        textAlignVertical: "top",
    },
    editSaveBtn: {
        backgroundColor: C.text,
        paddingVertical: 14,
        alignItems: "center",
        marginTop: 8,
    },
    editSaveBtnText: { fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 2 },
});
