import { useState, useEffect, useMemo } from "react";
import {
    View, Text, ScrollView, Pressable,
    StyleSheet, ActivityIndicator, RefreshControl, Share,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "../lib/useApi";
import { useAuth } from "../auth/AuthContext";
import { useT, useLang } from "../lib/LangContext";
import { timeAgo, localeFor } from "../lib/datetime";
import { useTheme } from "../lib/ThemeContext";
import type { AppColors } from "../styles/theme";

type PostType = "EVENT" | "POLL" | "ANNOUNCEMENT" | "UPDATE";

type AnalyticsPost = {
    id: string;
    type: PostType;
    title: string;
    createdAt: string;
    reach: number;
    interactions: number;
    imageUrl?: string | null;
};

type GrowthBucket = { label: string; newFollowers: number; total: number };

const FILTER_TYPES: (PostType | "ALL")[] = ["ALL", "EVENT", "POLL", "ANNOUNCEMENT", "UPDATE"];

function fmtNum(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
}


const makeAnalyticsStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    // Top bar
    topBar: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: C.bg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
    },
    topBarSide: { width: 32 },
    topBarTitle: {
        flex: 1,
        textAlign: "center",
        fontSize: 12,
        fontWeight: "800",
        color: C.text,
        letterSpacing: 2,
    },

    // Hero card
    heroCard: {
        flexDirection: "row",
        marginHorizontal: 16,
        marginTop: 20,
        backgroundColor: C.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
    },
    heroAccent: {
        width: 3,
        backgroundColor: C.primary,
    },
    heroInner: {
        flex: 1,
        padding: 18,
        gap: 14,
    },
    heroStats: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 16,
    },
    heroStat: { flex: 1, gap: 6 },
    heroStatLabel: {
        fontSize: 9,
        fontWeight: "700",
        color: C.textLight,
        letterSpacing: 1,
        lineHeight: 13,
    },
    heroStatValueRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
    },
    heroStatValue: {
        fontSize: 34,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -1,
        lineHeight: 38,
    },
    heroStatValueLarge: {
        fontSize: 34,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -1,
        lineHeight: 38,
    },
    heroTrendBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: C.primaryBg,
        paddingHorizontal: 6,
        paddingVertical: 3,
    },
    heroTrendText: {
        fontSize: 10,
        fontWeight: "700",
        color: C.primary,
        letterSpacing: 0.5,
    },
    highIntentBadge: {
        alignSelf: "flex-start",
        backgroundColor: C.surfaceAlt,
        paddingHorizontal: 6,
        paddingVertical: 3,
    },
    highIntentText: {
        fontSize: 9,
        fontWeight: "700",
        color: C.textMuted,
        letterSpacing: 1,
    },
    heroStatDivider: {
        width: StyleSheet.hairlineWidth,
        backgroundColor: C.borderWarm,
        alignSelf: "stretch",
        marginTop: 18,
    },
    heroDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: C.borderWarm,
    },
    heroPerfRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
    },
    heroPerfText: {
        flex: 1,
        fontSize: 12,
        color: C.textMuted,
        lineHeight: 18,
    },
    heroDots: {
        flexDirection: "row",
        gap: 5,
        alignItems: "center",
    },
    heroDot: {
        width: 20,
        height: 4,
        backgroundColor: C.borderWarm,
    },
    heroDotActive: {
        backgroundColor: C.primary,
    },

    // Section
    section: {
        marginTop: 28,
    },
    sectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingBottom: 4,
        borderBottomWidth: 2,
        borderBottomColor: C.text,
        marginBottom: 0,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.3,
    },
    filterBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    filterBtnText: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1,
    },

    // Filter dropdown
    filterDropdown: {
        marginHorizontal: 16,
        backgroundColor: C.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
        borderTopWidth: 0,
    },
    filterOption: {
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
    },
    filterOptionActive: {
        backgroundColor: C.primaryBg,
    },
    filterOptionText: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textMuted,
        letterSpacing: 1,
    },
    filterOptionTextActive: {
        color: C.primary,
    },

    // Post card
    postCard: {
        flexDirection: "row",
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 18,
    },
    postThumb: {
        width: 72,
        height: 72,
        backgroundColor: "#1a1a1a",
        flexShrink: 0,
    },
    postThumbPlaceholder: {
        width: 72,
        height: 72,
        backgroundColor: "#1a1a1a",
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
    },
    postContent: {
        flex: 1,
        gap: 6,
    },
    postMeta: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    postTypeBadge: {
        borderWidth: 1,
        borderColor: C.borderWarm,
        paddingHorizontal: 7,
        paddingVertical: 3,
    },
    postTypeText: {
        fontSize: 9,
        fontWeight: "700",
        color: C.textBody,
        letterSpacing: 1,
    },
    postTimeAgo: {
        fontSize: 11,
        color: C.textLight,
        fontWeight: "500",
    },
    postTitle: {
        fontSize: 15,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.3,
        lineHeight: 20,
    },
    postStats: {
        flexDirection: "row",
        gap: 20,
        marginTop: 2,
    },
    postStat: { gap: 2 },
    postStatLabel: {
        fontSize: 9,
        fontWeight: "700",
        color: C.textLight,
        letterSpacing: 1,
    },
    postStatValue: {
        fontSize: 16,
        fontWeight: "800",
        color: C.text,
        letterSpacing: -0.3,
    },
    postStatValueRed: {
        color: C.primary,
    },

    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: C.borderWarm,
        marginHorizontal: 16,
    },

    // Export card
    exportCard: {
        marginHorizontal: 16,
        marginTop: 28,
        backgroundColor: C.primary,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 20,
    },
    exportLeft: { gap: 6 },
    exportLabel: {
        fontSize: 9,
        fontWeight: "700",
        color: "rgba(255,255,255,0.6)",
        letterSpacing: 1.5,
    },
    exportTitle: {
        fontSize: 20,
        fontWeight: "900",
        color: "#fff",
        letterSpacing: -0.3,
        lineHeight: 26,
    },
    exportIconWrap: {
        width: 44,
        height: 44,
        backgroundColor: "rgba(255,255,255,0.15)",
        alignItems: "center",
        justifyContent: "center",
    },

    // Error state
    errorText: { fontSize: 11, fontWeight: "700", color: C.textLight, letterSpacing: 2, marginTop: 12 },
    errorRetry: { marginTop: 16, borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 20, paddingVertical: 10 },
    errorRetryText: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1.5 },

    // Report period
    reportPeriod: {
        textAlign: "center",
        fontSize: 9,
        fontWeight: "700",
        color: C.textLight,
        letterSpacing: 1,
        marginTop: 14,
        marginBottom: 8,
    },

    // Follower growth chart
    growthCard: {
        marginHorizontal: 16,
        marginTop: 24,
        backgroundColor: C.surface,
        padding: 18,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
        gap: 14,
    },
    growthCardHeader: {
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
    },
    growthCardLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: C.textLight,
        letterSpacing: 1.5,
        marginBottom: 4,
    },
    growthCardTotal: {
        fontSize: 30,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -1,
    },
    growthDeltaBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: C.surfaceAlt,
        paddingHorizontal: 8,
        paddingVertical: 5,
    },
    growthDeltaPos: { backgroundColor: "#DCFCE7" },
    growthDeltaText: {
        fontSize: 9,
        fontWeight: "800",
        color: C.textLight,
        letterSpacing: 0.5,
    },
    growthDeltaTextPos: { color: "#16A34A" },
    growthBars: {
        flexDirection: "row",
        alignItems: "flex-end",
        height: 64,
        gap: 4,
    },
    growthBarCol: {
        flex: 1,
        alignItems: "center",
        height: 72,
        justifyContent: "flex-end",
    },
    growthBarTrack: {
        width: "100%",
        height: 56,
        flexDirection: "column",
        justifyContent: "flex-end",
    },
    growthBarFill: {
        width: "100%",
        backgroundColor: C.borderWarm,
        minHeight: 2,
    },
    growthBarFillActive: { backgroundColor: C.primary },
    growthBarLabel: {
        fontSize: 8,
        fontWeight: "700",
        color: C.primary,
        letterSpacing: 0.5,
        marginTop: 4,
        textAlign: "center",
    },
    growthBarLabelDim: {
        fontSize: 8,
        fontWeight: "600",
        color: C.textLight,
        letterSpacing: 0.3,
        marginTop: 4,
        textAlign: "center",
    },

    // Trends
    trendsBlock: {
        marginHorizontal: 16,
        marginTop: 24,
        gap: 10,
    },
    trendsSectionTitle: {
        fontSize: 20,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.3,
        borderBottomWidth: 2,
        borderBottomColor: C.text,
        paddingBottom: 4,
    },
    trendCard: {
        backgroundColor: C.surface,
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        gap: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
        borderLeftWidth: 3,
        borderLeftColor: C.primary,
    },
    trendCardLeft: { flex: 1, gap: 4 },
    trendCardTag: {
        fontSize: 9,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    trendCardTitle: {
        fontSize: 14,
        fontWeight: "900",
        color: C.text,
        lineHeight: 20,
    },
    trendCardStats: { flexDirection: "row", gap: 14, marginTop: 2 },
    trendCardStat: { fontSize: 11, color: C.textMuted, fontWeight: "600" },
    trendCardBtn: {
        width: 36,
        height: 36,
        backgroundColor: "#1F2937",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },

    typeAvgCard: {
        backgroundColor: C.surface,
        padding: 16,
        gap: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
    },
    typeAvgTitle: {
        fontSize: 9,
        fontWeight: "800",
        color: C.textLight,
        letterSpacing: 2,
        marginBottom: 2,
    },
    typeAvgRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    typeAvgLabel: {
        width: 90,
        fontSize: 10,
        fontWeight: "700",
        color: C.textBody,
        letterSpacing: 0.5,
    },
    typeAvgBarTrack: {
        flex: 1,
        height: 8,
        flexDirection: "row",
        backgroundColor: C.surfaceAlt,
        overflow: "hidden",
    },
    typeAvgBarFill: {
        height: 8,
        backgroundColor: C.primary,
    },
    typeAvgValue: {
        width: 36,
        textAlign: "right",
        fontSize: 12,
        fontWeight: "800",
        color: C.text,
    },
});

export default function AnalyticsScreen() {
    const router = useRouter();
    const authApi = useApi();
    const { session } = useAuth();
    const t = useT();
    const { lang } = useLang();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeAnalyticsStyles(C), [C]);
    const [posts, setPosts] = useState<AnalyticsPost[]>([]);
    const [growth, setGrowth] = useState<GrowthBucket[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(false);
    const [activeFilter, setActiveFilter] = useState<PostType | "ALL">("ALL");
    const [filterOpen, setFilterOpen] = useState(false);

    function loadData(isRefresh = false) {
        const clubId = session?.userId;
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError(false);
        Promise.all([
            authApi<AnalyticsPost[]>("/posts/mine/analytics"),
            clubId ? authApi<GrowthBucket[]>(`/clubs/${clubId}/follower-growth`) : Promise.resolve([]),
        ]).then(([postsData, growthData]) => {
            setPosts(postsData);
            setGrowth(growthData);
        }).catch(() => setError(true)).finally(() => isRefresh ? setRefreshing(false) : setLoading(false));
    }

    useEffect(() => { loadData(); }, [session?.userId]);

    const totalReach = posts.reduce((s, p) => s + p.reach, 0);
    const totalInteractions = posts.reduce((s, p) => s + p.interactions, 0);
    const engagementRate = totalReach > 0
        ? ((totalInteractions / totalReach) * 100).toFixed(1)
        : "0.0";

    const visible = activeFilter === "ALL"
        ? posts
        : posts.filter((p) => p.type === activeFilter);

    // Growth chart
    const maxNew = growth.length ? Math.max(...growth.map((b) => b.newFollowers), 1) : 1;
    const currentFollowers = growth.length ? growth[growth.length - 1].total : 0;
    const lastBucket = growth.length >= 2 ? growth[growth.length - 1] : null;
    const prevBucket = growth.length >= 2 ? growth[growth.length - 2] : null;
    const growthDelta = lastBucket && prevBucket ? lastBucket.total - prevBucket.total : 0;

    // Report period
    const reportPeriod = (() => {
        if (!posts.length) return null;
        const dates = posts.map((p) => new Date(p.createdAt).getTime());
        const fmt = (ms: number) => new Date(ms).toLocaleDateString(localeFor(lang), { month: "short", year: "numeric" }).toUpperCase();
        const earliest = fmt(Math.min(...dates));
        const latest = fmt(Math.max(...dates));
        return earliest === latest ? earliest : `${earliest} – ${latest}`;
    })();

    // Trends
    const bestPost = posts.length ? posts.reduce((best, p) => p.interactions > best.interactions ? p : best, posts[0]) : null;
    const byType: Record<string, { total: number; count: number }> = {};
    for (const p of posts) {
        if (!byType[p.type]) byType[p.type] = { total: 0, count: 0 };
        byType[p.type].total += p.interactions;
        byType[p.type].count += 1;
    }
    const typeAvgs = Object.entries(byType)
        .map(([type, { total, count }]) => ({ type, avg: count > 0 ? total / count : 0 }))
        .sort((a, b) => b.avg - a.avg);

    function exportCSV() {
        const header = "Title,Type,Date,Reach,Interactions";
        const rows = posts.map((p) =>
            [
                `"${p.title.replace(/"/g, '""')}"`,
                p.type,
                new Date(p.createdAt).toLocaleDateString("en-CA"),
                p.reach,
                p.interactions,
            ].join(",")
        );
        const csv = [header, ...rows].join("\n");
        Share.share({ message: csv, title: "Analytics Export" });
    }

    if (loading) {
        return (
            <SafeAreaView style={styles.safe} edges={["top"]}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator color={C.primary} />
                </View>
            </SafeAreaView>
        );
    }

    if (error) {
        return (
            <SafeAreaView style={styles.safe} edges={["top"]}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
                    <Ionicons name="cloud-offline-outline" size={36} color={C.textFaint} />
                    <Text style={styles.errorText}>{t.couldntLoadAnalytics}</Text>
                    <Pressable style={styles.errorRetry} onPress={() => loadData()}>
                        <Text style={styles.errorRetryText}>{t.retry}</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            {/* Top bar */}
            <View style={styles.topBar}>
                <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)} style={styles.topBarSide} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
                    <Ionicons name="arrow-back" size={18} color={C.text} />
                </Pressable>
                <Text style={styles.topBarTitle}>{t.postAnalyticsTitle}</Text>
                <Pressable onPress={exportCSV} style={styles.topBarSide} accessibilityLabel="Export analytics as CSV" accessibilityRole="button" hitSlop={8}>
                    <Ionicons name="share-outline" size={20} color={C.text} />
                </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={C.primary} />}>

                {/* ── Hero stats card ── */}
                <View style={styles.heroCard}>
                    <View style={styles.heroAccent} />
                    <View style={styles.heroInner}>
                        <View style={styles.heroStats}>
                            {/* Reach */}
                            <View style={styles.heroStat}>
                                <Text style={styles.heroStatLabel}>{t.totalCombinedReach}</Text>
                                <View style={styles.heroStatValueRow}>
                                    <Text style={styles.heroStatValue}>{fmtNum(totalReach)}</Text>
                                    {growthDelta > 0 && (
                                        <View style={styles.heroTrendBadge}>
                                            <Ionicons name="trending-up" size={11} color={C.primary} />
                                            <Text style={styles.heroTrendText}>+{growthDelta}</Text>
                                        </View>
                                    )}
                                </View>
                            </View>

                            {/* Divider */}
                            <View style={styles.heroStatDivider} />

                            {/* Engagement */}
                            <View style={styles.heroStat}>
                                <Text style={styles.heroStatLabel}>{t.engagementRateLabel}</Text>
                                <Text style={styles.heroStatValueLarge}>{engagementRate}%</Text>
                                {parseFloat(engagementRate) >= 5 && (
                                    <View style={styles.highIntentBadge}>
                                        <Text style={styles.highIntentText}>{t.highIntent}</Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        <View style={styles.heroDivider} />

                        <View style={styles.heroPerfRow}>
                            <Text style={styles.heroPerfText}>
                                {t.analyticsPostsSummary(posts.length, currentFollowers)}
                            </Text>
                            <View style={styles.heroDots}>
                                <View style={[styles.heroDot, styles.heroDotActive]} />
                                <View style={styles.heroDot} />
                                <View style={styles.heroDot} />
                            </View>
                        </View>
                    </View>
                </View>

                {/* ── Follower growth ── */}
                {growth.length > 0 && (
                    <View style={styles.growthCard}>
                        <View style={styles.growthCardHeader}>
                            <View>
                                <Text style={styles.growthCardLabel}>{t.followerGrowthLabel}</Text>
                                <Text style={styles.growthCardTotal}>{fmtNum(currentFollowers)}</Text>
                            </View>
                            {growthDelta !== 0 && (
                                <View style={[styles.growthDeltaBadge, growthDelta > 0 && styles.growthDeltaPos]}>
                                    <Ionicons
                                        name={growthDelta > 0 ? "trending-up" : "trending-down"}
                                        size={11}
                                        color={growthDelta > 0 ? "#16A34A" : C.textLight}
                                    />
                                    <Text style={[styles.growthDeltaText, growthDelta > 0 && styles.growthDeltaTextPos]}>
                                        {growthDelta > 0 ? "+" : ""}{growthDelta} {t.thisWeek}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <View style={styles.growthBars}>
                            {growth.map((bucket, i) => {
                                const heightPct = maxNew > 0 ? bucket.newFollowers / maxNew : 0;
                                const isLast = i === growth.length - 1;
                                return (
                                    <View key={i} style={styles.growthBarCol}>
                                        <View style={styles.growthBarTrack}>
                                            <View
                                                style={[
                                                    styles.growthBarFill,
                                                    { flex: heightPct || 0.02 },
                                                    isLast && styles.growthBarFillActive,
                                                ]}
                                            />
                                            <View style={{ flex: 1 - (heightPct || 0.02) }} />
                                        </View>
                                        <Text style={isLast ? styles.growthBarLabel : styles.growthBarLabelDim}>
                                            {bucket.label}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* ── Trends ── */}
                {(bestPost || typeAvgs.length > 0) && (
                    <View style={styles.trendsBlock}>
                        <Text style={styles.trendsSectionTitle}>{t.trends}</Text>

                        {bestPost && (
                            <View style={styles.trendCard}>
                                <View style={styles.trendCardLeft}>
                                    <Text style={styles.trendCardTag}>{t.topPerformer}</Text>
                                    <Text style={styles.trendCardTitle} numberOfLines={2}>{bestPost.title}</Text>
                                    <View style={styles.trendCardStats}>
                                        <Text style={styles.trendCardStat}>{fmtNum(bestPost.interactions)} {t.interactionsLabel.toLowerCase()}</Text>
                                        <Text style={styles.trendCardStat}>{fmtNum(bestPost.reach)} {t.totalReachLabel.toLowerCase()}</Text>
                                    </View>
                                </View>
                                <Pressable
                                    style={styles.trendCardBtn}
                                    onPress={() => router.push(`/post-analytics/${bestPost.id}` as any)}
                                    hitSlop={8}
                                    accessibilityLabel="View top performer analytics"
                                    accessibilityRole="button"
                                >
                                    <Ionicons name="arrow-forward" size={14} color="#fff" />
                                </Pressable>
                            </View>
                        )}

                        {typeAvgs.length > 0 && (
                            <View style={styles.typeAvgCard}>
                                <Text style={styles.typeAvgTitle}>{t.avgInteractionsByType}</Text>
                                {typeAvgs.map(({ type, avg }) => {
                                    const maxAvg = typeAvgs[0].avg;
                                    const pct = maxAvg > 0 ? avg / maxAvg : 0;
                                    return (
                                        <View key={type} style={styles.typeAvgRow}>
                                            <Text style={styles.typeAvgLabel}>{type}</Text>
                                            <View style={styles.typeAvgBarTrack}>
                                                {pct > 0 && <View style={[styles.typeAvgBarFill, { flex: pct }]} />}
                                                <View style={{ flex: Math.max(1 - pct, pct > 0 ? 0 : 1) }} />
                                            </View>
                                            <Text style={styles.typeAvgValue}>{fmtNum(Math.round(avg))}</Text>
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                )}

                {/* ── Published content ── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{t.publishedContent}</Text>
                        <Pressable style={styles.filterBtn} onPress={() => setFilterOpen((v) => !v)}>
                            <Text style={styles.filterBtnText}>
                                {activeFilter === "ALL" ? t.filterByType : activeFilter}
                            </Text>
                            <Ionicons name="filter" size={12} color={C.primary} />
                        </Pressable>
                    </View>

                    {/* Filter dropdown */}
                    {filterOpen && (
                        <View style={styles.filterDropdown}>
                            {FILTER_TYPES.map((type) => (
                                <Pressable
                                    key={type}
                                    style={[styles.filterOption, activeFilter === type && styles.filterOptionActive]}
                                    onPress={() => { setActiveFilter(type); setFilterOpen(false); }}
                                >
                                    <Text style={[styles.filterOptionText, activeFilter === type && styles.filterOptionTextActive]}>
                                        {type}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    )}

                    {/* Post list */}
                    {visible.map((post, idx) => (
                        <Pressable key={post.id} onPress={() => router.push(`/post-analytics/${post.id}` as any)}>
                            <View style={styles.postCard}>
                                {/* Thumbnail */}
                                {post.imageUrl ? (
                                    <ExpoImage source={{ uri: post.imageUrl }} style={styles.postThumb} contentFit="cover" transition={200} />
                                ) : (
                                    <View style={styles.postThumbPlaceholder}>
                                        <Ionicons
                                            name={
                                                post.type === "EVENT" ? "calendar" :
                                                post.type === "POLL" ? "stats-chart" :
                                                post.type === "UPDATE" ? "mic" : "megaphone"
                                            }
                                            size={22}
                                            color="rgba(255,255,255,0.4)"
                                        />
                                    </View>
                                )}

                                {/* Content */}
                                <View style={styles.postContent}>
                                    <View style={styles.postMeta}>
                                        <View style={styles.postTypeBadge}>
                                            <Text style={styles.postTypeText}>{post.type}</Text>
                                        </View>
                                        <Text style={styles.postTimeAgo}>{timeAgo(post.createdAt, lang)}</Text>
                                    </View>
                                    <Text style={styles.postTitle}>{post.title}</Text>
                                    <View style={styles.postStats}>
                                        <View style={styles.postStat}>
                                            <Text style={styles.postStatLabel}>{t.totalReachLabel}</Text>
                                            <Text style={styles.postStatValue}>{fmtNum(post.reach)}</Text>
                                        </View>
                                        <View style={styles.postStat}>
                                            <Text style={styles.postStatLabel}>{t.interactionsLabel}</Text>
                                            <Text style={[styles.postStatValue, styles.postStatValueRed]}>{fmtNum(post.interactions)}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                            {idx < visible.length - 1 && <View style={styles.divider} />}
                        </Pressable>
                    ))}
                </View>

                {/* ── Export card ── */}
                <Pressable style={styles.exportCard} onPress={exportCSV}>
                    <View style={styles.exportLeft}>
                        <Text style={styles.exportLabel}>{t.analyticsExport}</Text>
                        <Text style={styles.exportTitle}>{t.downloadMonthlyAudit}</Text>
                    </View>
                    <View style={styles.exportIconWrap}>
                        <Ionicons name="download-outline" size={22} color="#fff" />
                    </View>
                </Pressable>
                {reportPeriod && (
                    <Text style={styles.reportPeriod}>{t.reportPeriodLabel} {reportPeriod}</Text>
                )}

            </ScrollView>
        </SafeAreaView>
    );
}
