import { useEffect, useState, useMemo } from "react";
import {
    View, Text, FlatList, Image, Pressable,
    StyleSheet, ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "../../lib/useApi";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";

type Follower = {
    userId: string;
    name: string;
    avatarUrl: string | null;
    program: string | null;
    year: string | null;
    notifPref: "ALL" | "EVENTS" | "NONE";
    followedAt: string;
};

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
}

const NOTIF_ICON: Record<string, string> = {
    ALL: "notifications",
    EVENTS: "notifications-outline",
    NONE: "notifications-off-outline",
};

const makeFollowersStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    topBar: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: C.bg,
    },
    backBtn: { width: 36, alignItems: "flex-start" },
    topBarTitle: {
        flex: 1,
        textAlign: "center",
        fontSize: 12,
        fontWeight: "800",
        color: C.text,
        letterSpacing: 2,
    },
    center: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    emptyText: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textFaint,
        letterSpacing: 2,
    },
    retryBtn: {
        borderWidth: 1.5,
        borderColor: C.primary,
        paddingHorizontal: 20,
        paddingVertical: 10,
        marginTop: 4,
    },
    retryBtnText: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
    },
    countBanner: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: C.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
    },
    countText: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: C.surface,
        gap: 14,
    },
    separator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: C.borderWarm,
        marginLeft: 74,
    },
    avatar: {
        width: 40,
        height: 40,
        backgroundColor: C.primaryBg,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    avatarImg: { width: 40, height: 40 },
    avatarInit: { fontSize: 16, fontWeight: "700", color: C.primary },
    info: { flex: 1, gap: 2 },
    name: { fontSize: 14, fontWeight: "700", color: C.text },
    meta: { fontSize: 12, color: C.textMuted },
    since: { fontSize: 11, color: C.textLight },
});

export default function FollowersScreen() {
    const router = useRouter();
    const authApi = useApi();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeFollowersStyles(C), [C]);

    const [followers, setFollowers] = useState<Follower[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState(false);

    const PAGE = 50;

    function loadFollowers(isRefresh = false) {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError(false);
        authApi<Follower[]>(`/clubs/${id}/followers?limit=${PAGE}`)
            .then((data) => {
                setFollowers(data);
                setHasMore(data.length === PAGE);
            })
            .catch(() => setError(true))
            .finally(() => isRefresh ? setRefreshing(false) : setLoading(false));
    }

    useEffect(() => {
        if (!id) return;
        loadFollowers();
    }, [id]);

    async function loadMore() {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const more = await authApi<Follower[]>(
                `/clubs/${id}/followers?limit=${PAGE}&offset=${followers.length}`
            );
            setFollowers((prev) => [...prev, ...more]);
            setHasMore(more.length === PAGE);
        } catch { /* silent — user can pull to refresh */ }
        setLoadingMore(false);
    }

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            {/* Top bar */}
            <View style={styles.topBar}>
                <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
                    <Ionicons name="arrow-back" size={18} color={C.primary} />
                </Pressable>
                <Text style={styles.topBarTitle}>FOLLOWERS</Text>
                <View style={{ width: 36 }} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator color={C.primary} />
                </View>
            ) : error ? (
                <View style={styles.center}>
                    <Ionicons name="cloud-offline-outline" size={36} color={C.textFaint} />
                    <Text style={styles.emptyText}>COULDN'T LOAD FOLLOWERS</Text>
                    <Pressable style={styles.retryBtn} onPress={() => loadFollowers()}>
                        <Text style={styles.retryBtnText}>TRY AGAIN</Text>
                    </Pressable>
                </View>
            ) : followers.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="people-outline" size={36} color={C.textFaint} />
                    <Text style={styles.emptyText}>NO FOLLOWERS YET</Text>
                </View>
            ) : (
                <FlatList
                    data={followers}
                    keyExtractor={(item) => item.userId}
                    contentContainerStyle={{ paddingBottom: 40 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadFollowers(true)} tintColor={C.primary} />}
                    renderItem={({ item }) => (
                        <View style={styles.row}>
                            <View style={styles.avatar}>
                                {item.avatarUrl
                                    ? <Image source={{ uri: item.avatarUrl }} style={styles.avatarImg} />
                                    : <Text style={styles.avatarInit}>{item.name[0]?.toUpperCase() ?? "?"}</Text>
                                }
                            </View>
                            <View style={styles.info}>
                                <Text style={styles.name}>{item.name}</Text>
                                {(item.program || item.year) && (
                                    <Text style={styles.meta}>
                                        {[item.program, item.year].filter(Boolean).join(" · ")}
                                    </Text>
                                )}
                                <Text style={styles.since}>Followed {timeAgo(item.followedAt)}</Text>
                            </View>
                            <Ionicons
                                name={NOTIF_ICON[item.notifPref] as any}
                                size={16}
                                color={item.notifPref === "ALL" ? C.primary : C.textFaint}
                            />
                        </View>
                    )}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.3}
                    ListFooterComponent={loadingMore ? (
                        <ActivityIndicator color={C.primary} style={{ paddingVertical: 16 }} />
                    ) : null}
                    ListHeaderComponent={
                        <View style={styles.countBanner}>
                            <Text style={styles.countText}>{followers.length}{hasMore ? "+" : ""} MEMBERS</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}
