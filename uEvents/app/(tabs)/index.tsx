import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, Animated, useWindowDimensions, PanResponder, Modal, Image, StyleSheet, Alert, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { makeHomeStyles } from "../../styles/home.styles";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";
import FollowedAccounts, { type Account } from "../../components/FollowedAccounts";
import { useAuth } from "../../auth/AuthContext";
import { useApi } from "../../lib/useApi";
import SocialFeed, { type FeedPost } from "../../components/SocialFeed";
import { useRouter } from "expo-router";
import { useState, useCallback, useRef, useMemo } from "react";
import { useReduceMotion } from "../../lib/useReduceMotion";
import { useFocusEffect } from "expo-router";
import { useGuestGuard } from "../../lib/useGuestGuard";
import { useGuestModal } from "../../lib/GuestModalContext";
import { useLang, useT, pickLocale } from "../../lib/LangContext";
import { useToast } from "../../lib/ToastContext";
import { useLikes } from "../../lib/LikeContext";
import { api } from "../../lib/api";
import { FeedCardSkeleton, ErrorRetry } from "../../components/SkeletonLoader";
import { translateCategory } from "../../lib/categories";
import { timeAgo, fmtFeedDate } from "../../lib/datetime";

type ApiFeedPost = {
    id: string;
    clubId: string;
    clubName: string;
    clubAvatar?: string;
    type: string;
    createdAt: string;
    locales: Record<string, { title?: string; body?: string }>;
    images?: string[];
    startAt?: string;
    endAt?: string;
    locationName?: string;
    categories?: string[];
    isRecurring?: boolean;
    freeFood?: boolean;
    likes: number;
    rsvpCount?: number;
    capacity?: number | null;
    comments: number;
    isLiked: boolean;
    isBookmarked?: boolean;
    isFollowing?: boolean;
    reason?: string;
    isPast?: boolean;
    hasRecap?: boolean;
    recapPhotos?: string[];
    recapPhotoCount?: number;
    recapContributors?: { name: string; avatarUrl?: string | null }[];
    recapContributorCount?: number;
    crowdCount?: number;
    canRate?: boolean;
    rating?: { avg: number | null; count: number; mine: number };
    topComment?: { id: string; author: string; avatarUrl?: string | null; content: string; upvotes?: number; isUpvoted?: boolean; replyCount?: number } | null;
    poll?: {
        expiresAt?: string;
        totalVotes: number;
        userVote?: string | null;
        options: { id: string; textEn: string; textFr?: string; votes: number }[];
    } | null;
};


function mapPost(p: ApiFeedPost, lang: "en" | "fr"): FeedPost {
    const locale = pickLocale(p.locales, lang);
    const endsAt = p.poll?.expiresAt
        ? (() => {
              const diff = new Date(p.poll.expiresAt).getTime() - Date.now();
              if (diff <= 0) return "Ended";
              const days = Math.floor(diff / 86400000);
              return days > 0 ? `${days}d left` : "< 1d left";
          })()
        : undefined;

    return {
        id: p.id,
        clubId: p.clubId,
        clubName: p.clubName,
        clubAvatar: p.clubAvatar,
        type: p.type.toLowerCase() as FeedPost["type"],
        timestamp: timeAgo(p.createdAt, lang),
        content: locale.body ?? "",
        imageUrl: (locale as any).posterUrl ?? undefined,
        images: p.images ?? [],
        eventId: p.type.toLowerCase() === "event" ? p.id : undefined,
        eventTitle: (["event", "announcement", "update"].includes(p.type.toLowerCase())) ? locale.title : undefined,
        eventDate: p.type.toLowerCase() === "event" && p.startAt ? fmtFeedDate(p.startAt, lang) : undefined,
        eventLocation: p.type.toLowerCase() === "event" && p.locationName ? p.locationName : undefined,
        eventEndAt: p.type.toLowerCase() === "event" ? (p.endAt ?? p.startAt) : undefined,
        eventStartAt: p.type.toLowerCase() === "event" ? (p.startAt ?? undefined) : undefined,
        eventTime: undefined,
        eventTags: p.type.toLowerCase() === "event" ? (p.categories ?? []).map((c) => translateCategory(c, lang)) : undefined,
        isRecurring: p.type.toLowerCase() === "event" ? !!p.isRecurring : undefined,
        freeFood: p.type.toLowerCase() === "event" ? !!p.freeFood : undefined,
        rsvpCount: p.type.toLowerCase() === "event" ? (p.rsvpCount ?? 0) : undefined,
        capacity: p.type.toLowerCase() === "event" ? (p.capacity ?? null) : undefined,
        likes: p.likes,
        comments: p.comments,
        isLiked: p.isLiked,
        isBookmarked: p.isBookmarked,
        isFollowing: p.isFollowing ?? false,
        reason: p.reason,
        hasRecap: p.hasRecap,
        recapPhotos: p.recapPhotos,
        recapPhotoCount: p.recapPhotoCount,
        recapContributors: p.recapContributors,
        recapContributorCount: p.recapContributorCount,
        crowdCount: p.crowdCount,
        canRate: p.canRate,
        rating: p.rating,
        topComment: p.topComment ?? undefined,
        poll: p.poll
            ? {
                  question: locale.title ?? "",
                  options: p.poll.options.map((o) => ({ id: o.id, text: o.textEn, votes: o.votes })),
                  totalVotes: p.poll.totalVotes,
                  userVote: p.poll.userVote ?? undefined,
                  endsAt,
              }
            : undefined,
    };
}

type ApiFollow = { id: string; clubName: string; logoUrl?: string };

export default function HomeScreen() {
    const { colors: C } = useTheme();
    const reduceMotion = useReduceMotion();
    const reduceMotionRef = useRef(reduceMotion);
    reduceMotionRef.current = reduceMotion;
    const styles = useMemo(() => makeHomeStyles(C), [C]);
    const ob = useMemo(() => makeObStyles(C), [C]);
    const { session } = useAuth();
    const authApi = useApi();
    const router = useRouter();
    const guestGuard = useGuestGuard();
    const { showGuestModal } = useGuestModal();
    const isGuest = session?.role === "guest";
    const { showToast } = useToast();
    const { overrides: likeOverrides, resolve: resolveLike, toggleLike: toggleLikeCtx } = useLikes();
    const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
    const feedPostsLengthRef = useRef(0);
    const [discoverPosts, setDiscoverPosts] = useState<FeedPost[]>([]);
    const [followedAccounts, setFollowedAccounts] = useState<Account[]>([]);
    const [followedTopicsCount, setFollowedTopicsCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [feedError, setFeedError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [feedLoadingMore, setFeedLoadingMore] = useState(false);
    const [feedHasMore, setFeedHasMore] = useState(true);
    const FEED_PAGE = 20;
    const [activeTab, setActiveTab] = useState<"following" | "for-you">("following");
    // Lazy-mount the For-You pane: it only renders its FlatList once the user
    // first swipes toward it or taps the tab, halving initial feed memory.
    const [forYouMounted, setForYouMounted] = useState(false);
    const [verifyDismissed, setVerifyDismissed] = useState(false);
    const showVerifyBanner = session?.role === "user" && session?.emailVerified === false && !verifyDismissed;
    const [feedFilter, setFeedFilter] = useState<"ALL" | "event" | "poll" | "announcement" | "freefood">("ALL");
    const [forYouFilter, setForYouFilter] = useState<"ALL" | "events" | "recaps" | "polls">("ALL");
    const { lang } = useLang();
    const t = useT();
    const greetingText = (() => {
        const h = new Date().getHours();
        if (h < 12) return t.goodMorning;
        if (h < 17) return t.goodAfternoon;
        return t.goodEvening;
    })();
    const { width: screenWidth } = useWindowDimensions();
    // Overlay the shared like state so a like made on a detail screen (or here)
    // is reflected immediately, without waiting for the next feed refetch.
    const applyLikeOverrides = useCallback((list: FeedPost[]) =>
        list.map((p) => {
            const o = likeOverrides.get(p.id);
            return o ? { ...p, isLiked: o.liked, likes: o.count } : p;
        }), [likeOverrides]);

    const filteredPosts = useMemo(
        () => applyLikeOverrides(
            feedFilter === "ALL" ? feedPosts :
            feedFilter === "freefood" ? feedPosts.filter(p => p.freeFood) :
            feedFilter === "announcement" ? feedPosts.filter(p => p.type === "announcement" || p.type === "update") :
            feedPosts.filter(p => p.type === feedFilter)
        ),
        [feedPosts, feedFilter, applyLikeOverrides]
    );
    const discoverFiltered = useMemo(
        () => applyLikeOverrides(
            forYouFilter === "ALL" ? discoverPosts :
            forYouFilter === "recaps" ? discoverPosts.filter(p => p.hasRecap) :
            forYouFilter === "polls" ? discoverPosts.filter(p => p.type === "poll") :
            discoverPosts.filter(p => p.type === "event" && !p.hasRecap)
        ),
        [discoverPosts, forYouFilter, applyLikeOverrides]
    );
    const slideAnim = useRef(new Animated.Value(0)).current;
    const indicatorX = slideAnim.interpolate({
        inputRange: [-screenWidth, 0],
        outputRange: [screenWidth / 2, 0],
    });

    // Refs to avoid stale closures inside PanResponder
    const activeTabRef = useRef<"following" | "for-you">("following");
    const screenWidthRef = useRef(screenWidth);
    screenWidthRef.current = screenWidth;

    function switchTab(tab: "following" | "for-you") {
        if (tab === activeTabRef.current) return;
        if (tab === "for-you") setForYouMounted(true);
        activeTabRef.current = tab;
        setActiveTab(tab);
        Animated.timing(slideAnim, {
            toValue: tab === "for-you" ? -screenWidthRef.current : 0,
            duration: reduceMotion ? 0 : 280,
            useNativeDriver: true,
        }).start();
    }

    function snapToTab(tab: "following" | "for-you") {
        activeTabRef.current = tab;
        setActiveTab(tab);
        Animated.timing(slideAnim, {
            toValue: tab === "for-you" ? -screenWidthRef.current : 0,
            duration: reduceMotionRef.current ? 0 : 200,
            useNativeDriver: true,
        }).start();
    }

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, g) =>
                Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 8,
            onPanResponderGrant: () => {
                // A swipe can only head toward For-You from Following — mount it now
                // so the pane shows real content as it slides in.
                setForYouMounted(true);
                slideAnim.stopAnimation();
                slideAnim.extractOffset();
            },
            onPanResponderMove: (_, g) => {
                const isFollowing = activeTabRef.current === "following";
                if (isFollowing && g.dx > 0) return;   // no overscroll left
                if (!isFollowing && g.dx < 0) return;  // no overscroll right
                slideAnim.setValue(g.dx);
            },
            onPanResponderRelease: (_, g) => {
                slideAnim.flattenOffset();
                const w = screenWidthRef.current;
                const isFollowing = activeTabRef.current === "following";
                const shouldSwitch =
                    (isFollowing  && (g.dx < -w / 3 || g.vx < -0.5)) ||
                    (!isFollowing && (g.dx >  w / 3 || g.vx >  0.5));
                snapToTab(shouldSwitch
                    ? (isFollowing ? "for-you" : "following")
                    : activeTabRef.current);
            },
        })
    ).current;
    const [firstName, setFirstName] = useState<string>("");
    const [unreadCount, setUnreadCount] = useState(0);
    const [onboardingClubs, setOnboardingClubs] = useState<{ id: string; clubName: string; category?: string; logoUrl?: string; _count: { followedBy: number } }[]>([]);
    const [onboardingFollowed, setOnboardingFollowed] = useState<Set<string>>(new Set());
    const [onboardingMounted, setOnboardingMounted] = useState(false);
    const onboardingSlide = useRef(new Animated.Value(800)).current;
    const onboardingShownRef = useRef(false);
    const onboardingActiveRef = useRef(false);

    function setShowOnboarding(visible: boolean) {
        if (visible) {
            setOnboardingMounted(true);
            if (reduceMotion) { onboardingSlide.setValue(0); }
            else { Animated.spring(onboardingSlide, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start(); }
        } else {
            Animated.timing(onboardingSlide, { toValue: 800, duration: reduceMotion ? 0 : 260, useNativeDriver: true }).start(() => {
                setOnboardingMounted(false);
            });
        }
    }

    // Guest-only: load popular posts without auth
    const fetchGuestFeed = useCallback((isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        api<ApiFeedPost[]>("/posts/popular")
            .then((posts) => { setFeedError(false); setDiscoverPosts(posts.map((p) => mapPost(p, lang))); })
            .catch(() => setFeedError(true))
            .finally(() => isRefresh ? setRefreshing(false) : setLoading(false));
    }, [lang]);

    const fetchFeed = useCallback((isRefresh = false) => {
        if (!session?.token) return;
        if (isRefresh) setRefreshing(true);
        else if (feedPostsLengthRef.current === 0) setLoading(true);

        // Fetch name + unread count once (or on refresh)
        if (isRefresh || !firstName) {
            authApi<{ firstName?: string }>("/users/me")
                .then((u) => setFirstName(u.firstName ?? ""))
                .catch(() => {});
            authApi<{ count: number }>("/notifications/unread-count")
                .then((r) => setUnreadCount(r.count))
                .catch(() => {});
        }

        authApi<string[]>("/users/me/topics").then((tp) => setFollowedTopicsCount(tp.length)).catch(() => {});

        Promise.all([
            authApi<ApiFeedPost[]>(`/posts/feed?limit=${FEED_PAGE}&offset=0`),
            authApi<ApiFollow[]>("/users/me/follows"),
            authApi<ApiFeedPost[]>("/posts/for-you"),
        ])
            .then(([posts, clubs, forYou]) => {
                const mapped = posts.map((p) => mapPost(p, lang));
                feedPostsLengthRef.current = mapped.length;
                setFeedPosts(mapped);
                setFeedHasMore(posts.length === FEED_PAGE);
                setFollowedAccounts(clubs.map((c) => ({ id: c.id, name: c.clubName, avatarUri: c.logoUrl })));
                setDiscoverPosts(forYou.map((p) => mapPost(p, lang)));
                // Show onboarding for new users with no follows
                if (clubs.length === 0 && !isRefresh && !onboardingShownRef.current) {
                    onboardingShownRef.current = true;
                    authApi<typeof onboardingClubs>("/clubs?limit=20")
                        .then((all) => {
                            setOnboardingClubs(all);
                            onboardingActiveRef.current = true;
                            setShowOnboarding(true);
                        })
                        .catch(() => {});
                }
            })
            .then(() => setFeedError(false))
            .catch(() => { setFeedError(true); showToast(t.feedLoadError, "error"); })
            .finally(() => isRefresh ? setRefreshing(false) : setLoading(false));
    }, [session?.token, lang]);

    const loadMoreFeed = useCallback(async () => {
        if (feedLoadingMore || !feedHasMore || !session?.token) return;
        setFeedLoadingMore(true);
        try {
            const more = await authApi<ApiFeedPost[]>(`/posts/feed?limit=${FEED_PAGE}&offset=${feedPostsLengthRef.current}`);
            const mapped = more.map((p) => mapPost(p, lang));
            setFeedPosts((prev) => {
                const next = [...prev, ...mapped];
                feedPostsLengthRef.current = next.length;
                return next;
            });
            setFeedHasMore(more.length === FEED_PAGE);
        } catch { /* silent */ }
        setFeedLoadingMore(false);
    }, [feedLoadingMore, feedHasMore, session?.token, lang]);

    useFocusEffect(useCallback(() => {
        if (isGuest) fetchGuestFeed();
        else fetchFeed();
    }, [isGuest, fetchFeed, fetchGuestFeed]));
    useFocusEffect(useCallback(() => {
        if (onboardingActiveRef.current) setShowOnboarding(true);
    }, []));

    function handleLike(postId: string) {
        if (guestGuard()) return;
        const post = feedPosts.find((p) => p.id === postId) ?? discoverPosts.find((p) => p.id === postId);
        const base = { liked: post?.isLiked ?? false, count: post?.likes ?? 0 };
        // Toggle from the currently displayed state (override wins over base).
        toggleLikeCtx(postId, resolveLike(postId, base));
    }

    function handlePollVote(postId: string, optionId: string) {
        const apply = (prev: FeedPost[]) =>
            prev.map((p) => {
                if (p.id !== postId || !p.poll) return p;
                return {
                    ...p,
                    poll: {
                        ...p.poll,
                        userVote: optionId,
                        totalVotes: p.poll.totalVotes + 1,
                        options: p.poll.options.map((o) => ({
                            ...o,
                            votes: o.id === optionId ? o.votes + 1 : o.votes,
                        })),
                    },
                };
            });
        const revert = (prev: FeedPost[]) =>
            prev.map((p) => {
                if (p.id !== postId || !p.poll) return p;
                return {
                    ...p,
                    poll: {
                        ...p.poll,
                        userVote: undefined,
                        totalVotes: p.poll.totalVotes - 1,
                        options: p.poll.options.map((o) => ({
                            ...o,
                            votes: o.id === optionId ? o.votes - 1 : o.votes,
                        })),
                    },
                };
            });
        setFeedPosts(apply);
        setDiscoverPosts(apply);
        authApi(`/posts/${postId}/vote`, {
            method: "POST",
            body: JSON.stringify({ optionId }),
        }).catch(() => {
            setFeedPosts(revert);
            setDiscoverPosts(revert);
            Alert.alert(t.voteFailedTitle, t.voteFailedMsg);
        });
    }

    async function handleFollow(clubId: string, isNowFollowing: boolean) {
        if (guestGuard()) return;
        if (isNowFollowing) {
            const post = feedPosts.find((p) => p.clubId === clubId) ?? discoverPosts.find((p) => p.clubId === clubId);
            if (post) {
                setFollowedAccounts((prev) =>
                    prev.some((a) => a.id === clubId)
                        ? prev
                        : [...prev, { id: clubId, name: post.clubName, avatarUri: post.clubAvatar }]
                );
            }
        } else {
            setFollowedAccounts((prev) => prev.filter((a) => a.id !== clubId));
        }
        try {
            await authApi(`/clubs/${clubId}/follow`, { method: isNowFollowing ? "POST" : "DELETE" });
        } catch {
            // Revert
            if (isNowFollowing) {
                setFollowedAccounts((prev) => prev.filter((a) => a.id !== clubId));
            } else {
                const post = feedPosts.find((p) => p.clubId === clubId) ?? discoverPosts.find((p) => p.clubId === clubId);
                if (post) {
                    setFollowedAccounts((prev) =>
                        prev.some((a) => a.id === clubId)
                            ? prev
                            : [...prev, { id: clubId, name: post.clubName, avatarUri: post.clubAvatar }]
                    );
                }
            }
            Alert.alert(t.errorTitle, isNowFollowing ? t.followError : t.unfollowError);
        }
    }

    function handleOnboardingFollow(clubId: string) {
        const isFollowing = onboardingFollowed.has(clubId);
        setOnboardingFollowed((prev) => {
            const next = new Set(prev);
            isFollowing ? next.delete(clubId) : next.add(clubId);
            return next;
        });
        authApi(`/clubs/${clubId}/follow`, { method: isFollowing ? "DELETE" : "POST" }).catch(console.error);
    }

    function handleOnboardingDone() {
        onboardingActiveRef.current = false;
        setShowOnboarding(false);
        fetchFeed(true);
    }

    function handlePostPress(post: FeedPost) {
        if (post.type === "event") {
            router.push({ pathname: "/event/[id]", params: { id: post.eventId ?? post.id } });
        } else {
            router.push({ pathname: "/post/[id]", params: { id: post.id } });
        }
    }

    // ── Guest view ────────────────────────────────────────────────────────────
    if (isGuest) {
        return (
            <SafeAreaView style={styles.safe} edges={["top"]}>
                <View style={styles.mastheadTopRow}>
                    <Text style={styles.mastheadLabel}>{t.forYouPane}</Text>
                    <Pressable onPress={() => router.push("/search-modal" as any)} style={styles.mastheadIconBtn} accessibilityRole="button" accessibilityLabel="Search" hitSlop={8}>
                        <Ionicons name="search-outline" size={20} color={C.text} />
                    </Pressable>
                </View>
                <SocialFeed
                    style={{ flex: 1 }}
                    posts={loading || feedError ? [] : discoverPosts}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => fetchGuestFeed(true)} tintColor={C.primary} />
                    }
                    onPostPress={() => showGuestModal()}
                    onClubPress={() => showGuestModal()}
                    onLikePress={() => showGuestModal()}
                    onCommentPress={() => showGuestModal()}
                    onPollVote={() => showGuestModal()}
                    onFollowPress={() => showGuestModal()}
                    ListHeaderComponent={
                        <View style={styles.mastheadScrollable}>
                            <Text style={styles.mastheadHeading}>{t.forYouTab}</Text>
                            <View style={styles.mastheadAccent} />
                        </View>
                    }
                    ListEmptyComponent={
                        loading ? (
                            <>{[0,1,2,3].map(i => <FeedCardSkeleton key={i} />)}</>
                        ) : feedError ? (
                            <ErrorRetry message="Couldn't load feed" onRetry={() => fetchGuestFeed()} />
                        ) : null
                    }
                    ListFooterComponent={<View style={{ height: 60 }} />}
                />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            {/* Tab bar — sticky */}
            <View style={styles.tabBar}>
                <Pressable
                    style={[styles.tab, activeTab === "following" && styles.tabActive]}
                    onPress={() => switchTab("following")}
                >
                    <Text style={[styles.tabText, activeTab === "following" && styles.tabTextActive]}>{t.followingTab}</Text>
                </Pressable>
                <Pressable
                    style={[styles.tab, activeTab === "for-you" && styles.tabActive]}
                    onPress={() => switchTab("for-you")}
                >
                    <Text style={[styles.tabText, activeTab === "for-you" && styles.tabTextActive]}>{t.forYouTab}</Text>
                </Pressable>
                <Animated.View style={[styles.tabIndicator, { transform: [{ translateX: indicatorX }] }]} />
            </View>

            {/* Sticky greeting row */}
            <View style={styles.mastheadTopRow}>
                <Text style={styles.mastheadLabel}>{greetingText}{firstName ? `, ${firstName}` : ""}</Text>
                <View style={styles.mastheadActions}>
                    <Pressable onPress={() => router.push("/notifications" as any)} style={styles.mastheadIconBtn} accessibilityRole="button" accessibilityLabel="Notifications" hitSlop={8}>
                        <Ionicons name="notifications-outline" size={20} color={C.text} />
                        {unreadCount > 0 && <View style={styles.notifBadge} />}
                    </Pressable>
                    <Pressable onPress={() => router.push("/search-modal" as any)} style={styles.mastheadIconBtn} accessibilityRole="button" accessibilityLabel="Search" hitSlop={8}>
                        <Ionicons name="search-outline" size={20} color={C.text} />
                    </Pressable>
                </View>
            </View>

            {showVerifyBanner && (
                <Pressable
                    onPress={() => router.push("/verify-email" as any)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.primaryBg }}
                    accessibilityRole="button"
                    accessibilityLabel="Verify your email"
                >
                    <Ionicons name="mail-unread-outline" size={16} color={C.primary} />
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: "700", color: C.primary }} numberOfLines={2} maxFontSizeMultiplier={1.4}>
                        Verify your email to secure your account
                    </Text>
                    <Pressable onPress={() => setVerifyDismissed(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
                        <Ionicons name="close" size={16} color={C.primary} />
                    </Pressable>
                </Pressable>
            )}

            <View style={{ flex: 1, overflow: "hidden" }} {...panResponder.panHandlers}>
                <Animated.View style={{ flex: 1, flexDirection: "row", width: screenWidth * 2, transform: [{ translateX: slideAnim }] }}>

                    {/* Following — left pane */}
                    <SocialFeed
                        style={{ width: screenWidth, flex: 1 }}
                        posts={loading || feedError || (followedAccounts.length === 0 && followedTopicsCount === 0) ? [] : filteredPosts}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={() => fetchFeed(true)} tintColor={C.primary} />
                        }
                        onEndReached={loadMoreFeed}
                        onEndReachedThreshold={0.4}
                        onPostPress={handlePostPress}
                        onClubPress={(clubId) => router.push(`/club/${clubId}`)}
                        onLikePress={handleLike}
                        onCommentPress={(postId, type, opts) => type === "event"
                            ? router.push({ pathname: "/event/[id]", params: { id: postId, ...(opts?.commentId ? { highlightComment: opts.commentId } : {}), ...(opts?.focus ? { focusComment: "1" } : {}) } })
                            : router.push({ pathname: "/post/[id]", params: { id: postId, ...(opts?.commentId ? { highlightComment: opts.commentId } : {}), ...(opts?.focus ? { focusComment: "1" } : {}) } })
                        }
                        onAddRecapPhoto={(postId) => router.push({ pathname: "/event/[id]", params: { id: postId, addPhoto: "1" } })}
                        onViewRecapPhotos={(postId) => router.push({ pathname: "/event/[id]", params: { id: postId, focusPhotos: "1" } })}
                        onPollVote={handlePollVote}
                        onFollowPress={handleFollow}
                        ListHeaderComponent={
                            <>
                                <View style={styles.mastheadScrollable}>
                                    <Text style={styles.mastheadHeading}>{t.yourFeed}</Text>
                                    <View style={styles.mastheadAccent} />
                                </View>
                                <FollowedAccounts
                                    accounts={followedAccounts}
                                    onAccountPress={(a) => router.push(`/club/${a.id}` as any)}
                                    onViewAll={() => router.push("/(tabs)/profile" as any)}
                                />
                                {followedAccounts.length > 0 && (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 8 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: "row", alignItems: "center" }}>
                                        {([
                                            { value: "ALL", label: t.feedFilterAll },
                                            { value: "event", label: t.events },
                                            { value: "freefood", label: t.freeFoodFilter },
                                            { value: "announcement", label: t.feedFilterAnnouncements },
                                            { value: "poll", label: t.feedFilterPolls },
                                        ] as const).map((f) => (
                                            <Pressable
                                                key={f.value}
                                                onPress={() => setFeedFilter(f.value)}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Filter by ${f.label}`}
                                                accessibilityState={{ selected: feedFilter === f.value }}
                                                style={{
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 5,
                                                    borderWidth: 1.5,
                                                    borderColor: feedFilter === f.value ? C.primary : C.border,
                                                    backgroundColor: feedFilter === f.value ? C.primary : C.surface,
                                                }}
                                            >
                                                <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1, color: feedFilter === f.value ? "#fff" : C.textMuted }}>
                                                    {f.label}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                )}
                                {feedFilter === "freefood" && (
                                    <Pressable
                                        onPress={() => Linking.openURL("https://freefoodalert.com/en_CA/event")}
                                        style={{ flexDirection: "row", marginHorizontal: 16, marginVertical: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderWarm }}
                                        accessibilityRole="link"
                                        accessibilityLabel={t.freeFoodAlertCta}
                                    >
                                        <View style={{ width: 3, backgroundColor: C.primary }} />
                                        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
                                            <Text style={{ fontSize: 20 }}>🍕</Text>
                                            <View style={{ flex: 1, gap: 4 }}>
                                                <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 1.5, color: C.primary }} maxFontSizeMultiplier={1.3}>{t.freeFoodAlertTitle}</Text>
                                                <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }} maxFontSizeMultiplier={1.3}>{t.freeFoodAlertPrompt}</Text>
                                            </View>
                                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                                <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1, color: C.primary }} maxFontSizeMultiplier={1.2}>{t.openBtn}</Text>
                                                <Ionicons name="open-outline" size={14} color={C.primary} />
                                            </View>
                                        </View>
                                    </Pressable>
                                )}
                            </>
                        }
                        ListEmptyComponent={
                            loading ? (
                                <>{[0,1,2,3].map(i => <FeedCardSkeleton key={i} />)}</>
                            ) : feedError ? (
                                <ErrorRetry message="Couldn't load feed" onRetry={() => fetchFeed()} />
                            ) : (followedAccounts.length === 0 && followedTopicsCount === 0) ? (
                                <View style={styles.emptyState}>
                                    <Ionicons name="people-outline" size={36} color={C.textFaint} />
                                    <Text style={styles.emptyTitle}>{t.notFollowingAnyone}</Text>
                                    <Text style={styles.emptySubtitle}>{t.followClubsToSeeContent}</Text>
                                    <Pressable style={styles.discoverBtn} onPress={() => router.push("/(tabs)/search" as any)}>
                                        <Text style={styles.discoverBtnText}>{t.discoverClubs}</Text>
                                    </Pressable>
                                </View>
                            ) : (
                                <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
                                    <Ionicons name="filter-outline" size={28} color={C.textFaint} />
                                    <Text style={{ fontSize: 11, fontWeight: "700", color: C.textFaint, letterSpacing: 2 }}>
                                        {({ event: t.noEventsFilter, announcement: t.noAnnouncementsFilter, poll: t.noPollsFilter } as Record<string, string>)[feedFilter] ?? t.noPostsYet}
                                    </Text>
                                </View>
                            )
                        }
                        ListFooterComponent={
                            !loading && !feedError && followedAccounts.length > 0 ? (
                                feedLoadingMore ? (
                                    <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />
                                ) : !feedHasMore ? (
                                    <View style={styles.caughtUp}>
                                        <View style={styles.caughtUpLine} />
                                        <Text style={styles.caughtUpText}>{t.allCaughtUp}</Text>
                                        <View style={styles.caughtUpLine} />
                                    </View>
                                ) : <View style={{ height: 60 }} />
                            ) : <View style={{ height: 60 }} />
                        }
                    />

                    {/* For You — right pane (lazy-mounted on first swipe/tap) */}
                    {forYouMounted ? (
                    <SocialFeed
                        style={{ width: screenWidth, flex: 1 }}
                        posts={loading || feedError ? [] : discoverFiltered}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={() => fetchFeed(true)} tintColor={C.primary} />
                        }
                        onPostPress={handlePostPress}
                        onClubPress={(clubId) => router.push(`/club/${clubId}`)}
                        onLikePress={handleLike}
                        onCommentPress={(postId, type, opts) => type === "event"
                            ? router.push({ pathname: "/event/[id]", params: { id: postId, ...(opts?.commentId ? { highlightComment: opts.commentId } : {}), ...(opts?.focus ? { focusComment: "1" } : {}) } })
                            : router.push({ pathname: "/post/[id]", params: { id: postId, ...(opts?.commentId ? { highlightComment: opts.commentId } : {}), ...(opts?.focus ? { focusComment: "1" } : {}) } })
                        }
                        onAddRecapPhoto={(postId) => router.push({ pathname: "/event/[id]", params: { id: postId, addPhoto: "1" } })}
                        onViewRecapPhotos={(postId) => router.push({ pathname: "/event/[id]", params: { id: postId, focusPhotos: "1" } })}
                        onPollVote={handlePollVote}
                        onFollowPress={handleFollow}
                        ListHeaderComponent={
                            <>
                                <View style={styles.mastheadScrollable}>
                                    <Text style={styles.mastheadHeading}>{t.yourFeed}</Text>
                                    <View style={styles.mastheadAccent} />
                                </View>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingBottom: 8 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: "row", alignItems: "center" }}>
                                    {([
                                        { value: "ALL", label: "ALL" },
                                        { value: "events", label: "EVENTS" },
                                        { value: "recaps", label: "RECAPS" },
                                        { value: "polls", label: "POLLS" },
                                    ] as const).map((f) => (
                                        <Pressable
                                            key={f.value}
                                            onPress={() => setForYouFilter(f.value)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Filter by ${f.label}`}
                                            accessibilityState={{ selected: forYouFilter === f.value }}
                                            style={{ paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1.5, borderColor: forYouFilter === f.value ? C.primary : C.borderWarm, backgroundColor: forYouFilter === f.value ? C.primary : C.surface }}
                                        >
                                            <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1, color: forYouFilter === f.value ? "#fff" : C.textMuted }}>{f.label}</Text>
                                        </Pressable>
                                    ))}
                                </ScrollView>
                            </>
                        }
                        ListEmptyComponent={
                            loading ? (
                                <>{[0,1,2,3].map(i => <FeedCardSkeleton key={i} />)}</>
                            ) : feedError ? (
                                <ErrorRetry message="Couldn't load feed" onRetry={() => fetchFeed()} />
                            ) : (
                                <View style={styles.emptyState}>
                                    <Ionicons name="telescope-outline" size={36} color={C.textFaint} />
                                    <Text style={styles.emptyTitle}>{t.nothingHereYet}</Text>
                                    <Text style={styles.emptySubtitle}>{t.followMoreClubs}</Text>
                                    <Pressable style={styles.discoverBtn} onPress={() => router.push("/(tabs)/search" as any)}>
                                        <Text style={styles.discoverBtnText}>{t.discoverClubs}</Text>
                                    </Pressable>
                                </View>
                            )
                        }
                        ListFooterComponent={
                            !loading && !feedError && discoverPosts.length > 0 ? (
                                <View style={styles.caughtUp}>
                                    <View style={styles.caughtUpLine} />
                                    <Text style={styles.caughtUpText}>{t.allCaughtUp}</Text>
                                    <View style={styles.caughtUpLine} />
                                </View>
                            ) : <View style={{ height: 60 }} />
                        }
                    />
                    ) : (
                        <View style={{ width: screenWidth, flex: 1 }} />
                    )}

                </Animated.View>
            </View>
            {/* Onboarding modal */}
            <Modal visible={onboardingMounted} animationType="none" transparent>
                <Pressable style={ob.backdrop} onPress={() => {}} accessible={false}>
                    <Animated.View style={[ob.sheet, { transform: [{ translateY: onboardingSlide }] }]}>
                        <View style={ob.handle} />
                        <Text style={ob.title}>{t.followSomeClubs}</Text>
                        <Text style={ob.subtitle}>{t.pickFewClubs}</Text>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                            {Array.from(new Set(onboardingClubs.map((c) => c.category ?? "Other"))).map((cat) => (
                                <View key={cat} style={ob.catSection}>
                                    <Text style={ob.catLabel}>{translateCategory(cat, lang).toUpperCase()}</Text>
                                    {onboardingClubs.filter((c) => (c.category ?? "Other") === cat).map((club) => {
                                        const following = onboardingFollowed.has(club.id);
                                        return (
                                            <Pressable key={club.id} style={ob.row} onPress={() => { setShowOnboarding(false); router.push(`/club/${club.id}` as any); }}>
                                                <View style={ob.logo}>
                                                    {club.logoUrl
                                                        ? <Image source={{ uri: club.logoUrl }} style={ob.logoImg} />
                                                        : <Text style={ob.logoText}>{(club.clubName ?? "C").charAt(0).toUpperCase()}</Text>}
                                                </View>
                                                <View style={ob.info}>
                                                    <Text style={ob.clubName}>{club.clubName}</Text>
                                                    <Text style={ob.followers}>{t.followersCount(club._count.followedBy)}</Text>
                                                </View>
                                                <Pressable
                                                    style={[ob.followBtn, following && ob.followBtnActive]}
                                                    onPress={() => handleOnboardingFollow(club.id)}
                                                >
                                                    <Text style={[ob.followBtnText, following && ob.followBtnTextActive]}>
                                                        {following ? t.following : t.follow}
                                                    </Text>
                                                </Pressable>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            ))}
                            <View style={{ height: 20 }} />
                        </ScrollView>
                        <Pressable
                            style={[ob.doneBtn, onboardingFollowed.size === 0 && ob.doneBtnMuted]}
                            onPress={handleOnboardingDone}
                        >
                            <Text style={ob.doneBtnText}>
                                {onboardingFollowed.size === 0 ? t.skipForNow : t.doneFollowed(onboardingFollowed.size)}
                            </Text>
                        </Pressable>
                    </Animated.View>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

function makeObStyles(C: AppColors) {
    return StyleSheet.create({
        backdrop: {
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "flex-end",
        },
        sheet: {
            backgroundColor: C.bg,
            height: "82%",
            paddingBottom: 32,
        },
        handle: {
            width: 36,
            height: 4,
            backgroundColor: C.textFaint,
            borderRadius: 2,
            alignSelf: "center",
            marginTop: 12,
            marginBottom: 20,
        },
        title: {
            fontSize: 22,
            fontWeight: "900",
            color: C.text,
            letterSpacing: -0.5,
            paddingHorizontal: 20,
        },
        subtitle: {
            fontSize: 13,
            color: C.textMuted,
            paddingHorizontal: 20,
            marginTop: 4,
            marginBottom: 16,
        },
        catSection: {
            marginBottom: 8,
        },
        catLabel: {
            fontSize: 10,
            fontWeight: "800",
            color: C.primary,
            letterSpacing: 1.5,
            paddingHorizontal: 20,
            paddingVertical: 8,
            backgroundColor: C.bg,
        },
        row: {
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: C.border,
            backgroundColor: C.surface,
        },
        logo: {
            width: 40,
            height: 40,
            borderRadius: 8,
            backgroundColor: C.primary,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
        },
        logoImg: { width: 40, height: 40 },
        logoText: { fontSize: 15, fontWeight: "800", color: "#fff" },
        info: { flex: 1, gap: 2 },
        clubName: { fontSize: 14, fontWeight: "700", color: C.text },
        followers: { fontSize: 11, color: C.textLight, fontWeight: "500" },
        followBtn: {
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderWidth: 1.5,
            borderColor: C.primary,
        },
        followBtnActive: { backgroundColor: C.primary },
        followBtnText: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1 },
        followBtnTextActive: { color: "#fff" },
        doneBtn: {
            marginHorizontal: 20,
            marginTop: 16,
            backgroundColor: C.primary,
            paddingVertical: 14,
            alignItems: "center",
        },
        doneBtnMuted: { backgroundColor: C.textBody },
        doneBtnText: { fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 1.5 },
    });
}
