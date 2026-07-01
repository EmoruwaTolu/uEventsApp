import { useCallback, useState, useMemo } from "react";
import {
    View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useApi } from "../lib/useApi";
import { useT } from "../lib/LangContext";
import { useTheme } from "../lib/ThemeContext";
import type { AppColors } from "../styles/theme";

type PostType = "EVENT" | "POLL" | "ANNOUNCEMENT" | "UPDATE";
type FilterType = "all" | "event" | "poll" | "announcement";

type ApiPost = {
    id: string;
    type: PostType;
    isDraft: boolean;
    isPinned: boolean;
    locales: Record<string, { title?: string; body?: string }>;
    updatedAt: string;
};


function getTitle(post: ApiPost): string {
    const locale = post.locales?.en ?? Object.values(post.locales ?? {})[0] ?? {};
    return (locale.title ?? "Untitled").toUpperCase();
}

function getPreview(post: ApiPost): string {
    const locale = post.locales?.en ?? Object.values(post.locales ?? {})[0] ?? {};
    return locale.body ?? "";
}

function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

const makeMyPostsStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    topBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    backGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
    backLabel: { fontSize: 14, fontWeight: "900", color: C.primary, letterSpacing: 2 },
    topBarCounts: { flexDirection: "row", gap: 8 },
    countBadge: {
        backgroundColor: C.primary,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    countBadgeText: {
        fontSize: 10,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 1,
    },
    countBadgeDraft: { backgroundColor: C.border },
    countBadgeTextDraft: { color: C.textBody },

    scroll: { paddingHorizontal: 20 },
    hero: { paddingTop: 8, paddingBottom: 24 },
    heroLabel: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 2, marginBottom: 8 },
    heroHeading: { fontSize: 42, fontWeight: "900", color: C.text, letterSpacing: -1, lineHeight: 46 },
    heroAccent: { width: 48, height: 3, backgroundColor: C.primary, marginTop: 14 },

    filterRow: { flexDirection: "row", gap: 8, paddingBottom: 24 },
    filterPill: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.surfaceAlt },
    filterPillActive: { backgroundColor: "#1F2937" },
    filterPillText: { fontSize: 10, fontWeight: "800", color: C.textLight, letterSpacing: 1 },
    filterPillTextActive: { color: "#fff" },

    list: { gap: 10 },

    card: { backgroundColor: C.surface, flexDirection: "row", overflow: "hidden" },
    cardAccent: { width: 3, flexShrink: 0 },
    cardBody: { flex: 1, padding: 16, gap: 8 },
    cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    typeBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4 },
    typeBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
    editedAt: { fontSize: 10, color: C.textLight, fontWeight: "600" },

    livePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#DCFCE7", paddingHorizontal: 7, paddingVertical: 3 },
    liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#16A34A" },
    livePillText: { fontSize: 9, fontWeight: "800", color: "#16A34A", letterSpacing: 1 },

    draftPill: { backgroundColor: C.surfaceAlt, paddingHorizontal: 7, paddingVertical: 3 },
    draftPillText: { fontSize: 9, fontWeight: "800", color: C.textMuted, letterSpacing: 1 },

    cardTitle: { fontSize: 16, fontWeight: "900", color: C.primary, letterSpacing: 0.2, lineHeight: 22 },
    cardPreview: { fontSize: 13, color: C.textMuted, lineHeight: 19 },
    cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
    footerLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
    footerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    deleteBtn: { width: 32, height: 32, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
    pinBtn: { width: 32, height: 32, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
    pinBtnActive: { backgroundColor: C.primaryBg },
    unpublishIconBtn: { width: 32, height: 32, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },

    analyticsBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: C.primaryBg,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    analyticsBtnText: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1 },
    editBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: "#1F2937",
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    editBtnText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1 },

    emptyState: { alignItems: "center", paddingVertical: 60, gap: 12 },
    emptyText: { fontSize: 11, fontWeight: "700", color: C.textFaint, letterSpacing: 2 },
    errorRetry: { borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 20, paddingVertical: 10 },
    errorRetryText: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1.5 },
});

export default function MyPostsScreen() {
    const router = useRouter();
    const authApi = useApi();
    const t = useT();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeMyPostsStyles(C), [C]);

    const TYPE_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
        EVENT:        { label: t.contentTypeEvent,        icon: "calendar-sharp", color: "#8C0327", bg: "#FEE2E2" },
        ANNOUNCEMENT: { label: t.contentTypeAnnouncement, icon: "megaphone",      color: "#374151", bg: "#E5E7EB" },
        POLL:         { label: t.contentTypePoll,         icon: "grid",           color: "#1D4ED8", bg: "#DBEAFE" },
        UPDATE:       { label: "UPDATE",                  icon: "newspaper",      color: "#065F46", bg: "#D1FAE5" },
    };

    const FILTERS: { key: FilterType; label: string }[] = [
        { key: "all",          label: t.filterAll },
        { key: "event",        label: t.events },
        { key: "announcement", label: t.filterAnnouncements },
        { key: "poll",         label: t.filterPolls },
    ];
    const [posts, setPosts] = useState<ApiPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(false);
    const [filter, setFilter] = useState<FilterType>("all");
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const PAGE = 20;

    const loadPosts = useCallback((isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError(false);
        authApi<ApiPost[]>(`/posts/mine?limit=${PAGE}&offset=0`)
            .then((data) => { setPosts(data); setHasMore(data.length === PAGE); })
            .catch(() => setError(true))
            .finally(() => isRefresh ? setRefreshing(false) : setLoading(false));
    }, []);

    async function loadMore() {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const more = await authApi<ApiPost[]>(`/posts/mine?limit=${PAGE}&offset=${posts.length}`);
            setPosts((prev) => [...prev, ...more]);
            setHasMore(more.length === PAGE);
        } catch { /* silent */ }
        setLoadingMore(false);
    }

    useFocusEffect(useCallback(() => {
        setFilter("all");
        loadPosts();
    }, []));

    function unpublishPost(id: string) {
        Alert.alert(
            t.unpublishPostTitle,
            t.unpublishPostBody,
            [
                { text: t.cancel, style: "cancel" },
                {
                    text: t.unpublishAction,
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await authApi(`/posts/${id}`, { method: "PATCH", body: JSON.stringify({ isDraft: true }) });
                            setPosts((prev) => prev.map((p) => p.id === id ? { ...p, isDraft: true } : p));
                        } catch {
                            Alert.alert(t.errorTitle, t.failedToUnpublish);
                        }
                    },
                },
            ]
        );
    }

    async function togglePin(id: string, currentlyPinned: boolean) {
        try {
            await authApi(`/posts/${id}/pin`, { method: "PATCH" });
            setPosts((prev) => prev.map((p) =>
                p.isDraft ? p : { ...p, isPinned: p.id === id ? !currentlyPinned : false }
            ));
        } catch {
            Alert.alert(t.errorTitle, t.failedToUpdatePin);
        }
    }

    function deletePost(id: string) {
        Alert.alert(t.deletePostTitle, t.deletePostBody, [
            { text: t.cancel, style: "cancel" },
            {
                text: t.deleteAction,
                style: "destructive",
                onPress: async () => {
                    try {
                        await authApi(`/posts/${id}`, { method: "DELETE" });
                        setPosts((prev) => prev.filter((p) => p.id !== id));
                    } catch (e) {
                        Alert.alert(t.errorTitle, t.failedToDeletePost);
                    }
                },
            },
        ]);
    }

    const visible = posts
        .filter((p) => !p.isDraft)
        .filter((p) => filter === "all" || p.type === filter.toUpperCase());

    const publishedCount = posts.filter((p) => !p.isDraft).length;
    const draftCount = posts.filter((p) => p.isDraft).length;

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            {/* Top bar */}
            <View style={styles.topBar}>
                <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)} style={styles.backGroup}>
                    <Ionicons name="arrow-back" size={18} color={C.primary} />
                    <Text style={styles.backLabel}>{t.back}</Text>
                </Pressable>
                <View style={styles.topBarCounts}>
                    <View style={styles.countBadge}>
                        <Text style={styles.countBadgeText}>{t.postsLiveCount(publishedCount)}</Text>
                    </View>
                    <View style={[styles.countBadge, styles.countBadgeDraft]}>
                        <Text style={[styles.countBadgeText, styles.countBadgeTextDraft]}>{t.postsDraftCount(draftCount)}</Text>
                    </View>
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPosts(true)} tintColor={C.primary} />}
                onMomentumScrollEnd={({ nativeEvent: e }) => {
                    const nearBottom = e.contentOffset.y + e.layoutMeasurement.height >= e.contentSize.height - 200;
                    if (nearBottom) loadMore();
                }}
                scrollEventThrottle={400}
            >
                {/* Hero */}
                <View style={styles.hero}>
                    <Text style={styles.heroLabel}>{t.editorDashboard}</Text>
                    <Text style={styles.heroHeading}>{t.myPostsHeading}</Text>
                    <View style={styles.heroAccent} />
                </View>

                {/* Filter pills */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterRow}
                >
                    {FILTERS.map(({ key, label }) => (
                        <Pressable
                            key={key}
                            onPress={() => setFilter(key)}
                            style={[styles.filterPill, filter === key && styles.filterPillActive]}
                        >
                            <Text style={[styles.filterPillText, filter === key && styles.filterPillTextActive]}>
                                {label}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>

                {/* Post list */}
                <View style={styles.list}>
                    {loading ? (
                        <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
                    ) : error ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="cloud-offline-outline" size={32} color={C.textFaint} />
                            <Text style={styles.emptyText}>{t.couldntLoadPosts}</Text>
                            <Pressable style={styles.errorRetry} onPress={() => loadPosts()}>
                                <Text style={styles.errorRetryText}>{t.retry}</Text>
                            </Pressable>
                        </View>
                    ) : visible.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="document-outline" size={32} color={C.textFaint} />
                            <Text style={styles.emptyText}>{t.noPostsHere}</Text>
                            <Pressable onPress={() => router.push("/(tabs)/create" as any)} style={{ marginTop: 4, backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 }} accessibilityRole="button" accessibilityLabel="Create a post">
                                <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff", letterSpacing: 1.5 }}>CREATE A POST</Text>
                            </Pressable>
                        </View>
                    ) : (
                        visible.map((post) => {
                            const meta = TYPE_META[post.type];
                            return (
                                <View key={post.id} style={styles.card}>
                                    <View style={[styles.cardAccent, { backgroundColor: meta.color }]} />
                                    <View style={styles.cardBody}>
                                        <View style={styles.cardHeader}>
                                            <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
                                                <Ionicons name={meta.icon} size={10} color={meta.color} />
                                                <Text style={[styles.typeBadgeText, { color: meta.color }]}>
                                                    {meta.label}
                                                </Text>
                                            </View>
                                            <View style={styles.headerRight}>
                                                {post.isDraft ? (
                                                    <View style={styles.draftPill}>
                                                        <Text style={styles.draftPillText}>{t.draftBadge}</Text>
                                                    </View>
                                                ) : (
                                                    <View style={styles.livePill}>
                                                        <View style={styles.liveDot} />
                                                        <Text style={styles.livePillText}>{t.liveBadge}</Text>
                                                    </View>
                                                )}
                                                <Text style={styles.editedAt}>{relativeTime(post.updatedAt)}</Text>
                                            </View>
                                        </View>

                                        <Text style={styles.cardTitle} numberOfLines={2}>{getTitle(post)}</Text>
                                        <Text style={styles.cardPreview} numberOfLines={2}>{getPreview(post)}</Text>

                                        <View style={styles.cardFooter}>
                                            <View style={styles.footerLeft}>
                                                <Pressable
                                                    style={styles.deleteBtn}
                                                    onPress={() => deletePost(post.id)}
                                                    hitSlop={8}
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Delete post"
                                                >
                                                    <Ionicons name="trash-outline" size={14} color={C.textLight} />
                                                </Pressable>
                                                {!post.isDraft && (
                                                    <Pressable
                                                        style={[styles.pinBtn, post.isPinned && styles.pinBtnActive]}
                                                        onPress={() => togglePin(post.id, post.isPinned)}
                                                        hitSlop={8}
                                                        accessibilityRole="button"
                                                        accessibilityLabel={post.isPinned ? "Unpin post" : "Pin post"}
                                                    >
                                                        <Ionicons
                                                            name={post.isPinned ? "pin" : "pin-outline"}
                                                            size={13}
                                                            color={post.isPinned ? C.primary : C.textMuted}
                                                        />
                                                    </Pressable>
                                                )}
                                                {!post.isDraft && (
                                                    <Pressable
                                                        style={styles.unpublishIconBtn}
                                                        onPress={() => unpublishPost(post.id)}
                                                        hitSlop={8}
                                                        accessibilityRole="button"
                                                        accessibilityLabel="Unpublish post"
                                                    >
                                                        <Ionicons name="eye-off-outline" size={14} color={C.textMuted} />
                                                    </Pressable>
                                                )}
                                            </View>
                                            <View style={styles.footerRight}>
                                                {!post.isDraft && (
                                                    <Pressable
                                                        style={styles.analyticsBtn}
                                                        onPress={() => router.push({ pathname: "/post-analytics/[id]", params: { id: post.id } })}
                                                    >
                                                        <Ionicons name="bar-chart-outline" size={13} color={C.primary} />
                                                        <Text style={styles.analyticsBtnText}>{t.statsBtn}</Text>
                                                    </Pressable>
                                                )}
                                                <Pressable
                                                    style={styles.editBtn}
                                                    onPress={() => router.push({ pathname: "/edit/[id]", params: { id: post.id } })}
                                                >
                                                    <Ionicons name="create-outline" size={13} color="#fff" />
                                                    <Text style={styles.editBtnText}>{t.editBtn}</Text>
                                                </Pressable>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            );
                        })
                    )}
                </View>

                {loadingMore && <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} />}
                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}
