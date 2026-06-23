import { useEffect, useState, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    View, Text, ScrollView, Pressable, Image,
    StyleSheet, Share, useWindowDimensions, ActivityIndicator,
    Modal, FlatList, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "../../lib/useApi";
import { useLang } from "../../lib/LangContext";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";

type ApiComment = {
    id: string;
    content: string;
    createdAt: string;
    user: { id: string; firstName?: string; lastName?: string; avatarUrl?: string | null };
};

type RsvpDemoItem = { label: string; count: number; pct: number };

type ApiPost = {
    id: string;
    type: string;
    category: string;
    title: string;
    publishedAt: string;
    imageUrl?: string | null;
    reach: number;
    views: number;
    saves: number;
    likes: number;
    shares: number;
    comments: number;
    rsvpTotal?: number;
    rsvpGoing?: number;
    rsvpDemographics?: {
        yearBreakdown: RsvpDemoItem[];
        programBreakdown: RsvpDemoItem[];
    } | null;
    pollOptions?: {
        id: string;
        textEn: string;
        textFr?: string | null;
        votes: number;
        yearBreakdown?: { label: string; count: number; pct: number }[];
    }[];
    pollTotalVotes?: number;
    pollDemographics?: {
        yearBreakdown: RsvpDemoItem[];
        programBreakdown: RsvpDemoItem[];
    } | null;
    classYear?: { label: string; value: number; featured?: boolean }[];
    sentimentPct: number;
    recentComments: { id: string; content: string; createdAt: string; user: { id: string; name: string; avatarUrl?: string | null } }[];
    totalComments: number;
};

type ApiAttendee = {
    userId: string;
    name: string;
    avatarUrl: string | null;
    program: string | null;
    year: string | null;
    rsvpedAt: string;
};

function fmtNum(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
}

const BAR_MAX_H = 72;

const makeStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    // Top bar
    topBar: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: C.bg,
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

    // Hero
    hero: { backgroundColor: "#111", overflow: "hidden" },
    heroPlaceholder: {
        backgroundColor: "#1a1a1a",
        alignItems: "center",
        justifyContent: "center",
    },

    // Identity
    identityBlock: {
        backgroundColor: C.surface,
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 18,
        gap: 4,
    },
    identityLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    identityTitle: {
        fontSize: 22,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.4,
        lineHeight: 28,
    },
    identityMeta: {
        fontSize: 12,
        color: C.textLight,
        fontWeight: "500",
        marginTop: 2,
    },

    // Stats grid
    statsCard: {
        backgroundColor: C.surface,
        marginTop: 1,
        flexDirection: "row",
        flexWrap: "wrap",
    },
    statCell: {
        width: "50%",
        paddingHorizontal: 20,
        paddingVertical: 18,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.borderWarm,
        gap: 4,
    },
    statCellLeft: {
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: C.borderWarm,
    },
    statCellBottom: {
        borderBottomWidth: 0,
    },
    statLabel: {
        fontSize: 9,
        fontWeight: "700",
        color: C.textLight,
        letterSpacing: 1,
    },
    statValue: {
        fontSize: 28,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.8,
        lineHeight: 34,
    },
    statSub: {
        fontSize: 10,
        fontWeight: "600",
        color: C.textLight,
    },
    statSubRed: { color: C.primary },
    statSubGreen: { color: "#16A34A" },

    // RSVP
    rsvpCard: {
        backgroundColor: C.surface,
        marginTop: 8,
        paddingHorizontal: 20,
        paddingVertical: 20,
        gap: 14,
    },
    rsvpHeadRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    attendeesBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: "#1F2937",
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    attendeesBtnText: {
        fontSize: 9,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 1,
    },
    attendeeRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.border,
    },
    attendeeName: {
        fontSize: 14,
        fontWeight: "700",
        color: C.text,
    },
    attendeeMeta: {
        fontSize: 11,
        color: C.textLight,
        marginTop: 2,
    },
    rsvpHeadLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    rsvpTotalRow: {
        flexDirection: "row",
        alignItems: "baseline",
    },
    rsvpTotalNum: {
        fontSize: 42,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -1,
    },
    rsvpTotalLabel: {
        fontSize: 16,
        fontWeight: "500",
        color: C.textMuted,
    },
    rsvpRow: { gap: 6 },
    rsvpRowLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.textBody,
        letterSpacing: 1,
    },
    rsvpRowBottom: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    rsvpRowCount: {
        fontSize: 13,
        fontWeight: "700",
        color: C.textBody,
        flexShrink: 0,
    },
    rsvpRowCountRed: { color: C.primary, fontSize: 11, fontWeight: "700", flexShrink: 0 },
    rsvpBarTrack: {
        height: 6,
        backgroundColor: C.surfaceAlt,
    },
    rsvpBarFill: {
        height: 6,
    },

    // Chart
    chartCard: {
        backgroundColor: C.surface,
        marginTop: 8,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 24,
        gap: 20,
    },
    chartLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    chartBars: {
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
    },
    chartBarCol: {
        flex: 1,
        alignItems: "center",
        gap: 8,
    },
    chartBarTrack: {
        width: 36,
        height: BAR_MAX_H,
        backgroundColor: C.surfaceAlt,
        justifyContent: "flex-end",
    },
    chartBarFill: {
        width: "100%",
        backgroundColor: "#D1D5DB",
    },
    chartBarFillFeatured: {
        backgroundColor: C.primary,
    },
    chartBarLabel: {
        fontSize: 8,
        fontWeight: "700",
        color: C.textLight,
        letterSpacing: 0.5,
        textAlign: "center",
    },

    // Sentiment
    sentimentSection: {
        backgroundColor: C.surface,
        marginTop: 8,
    },
    sentimentHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
        borderBottomWidth: 2,
        borderBottomColor: C.text,
    },
    sentimentTitle: {
        fontSize: 18,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.3,
    },
    sentimentBadge: {
        backgroundColor: "#16A34A",
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    sentimentBadgeText: {
        fontSize: 9,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 1,
    },

    feedbackCard: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        gap: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
    },
    feedbackTop: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    feedbackAvatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: "#9CA3AF",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
    },
    feedbackAvatarImg: { width: 38, height: 38, borderRadius: 19 },
    feedbackName: {
        fontSize: 13,
        fontWeight: "800",
        color: C.text,
    },
    feedbackTime: {
        fontSize: 11,
        color: C.textLight,
        fontWeight: "500",
    },
    feedbackQuote: {
        fontSize: 13,
        color: C.textBody,
        lineHeight: 20,
        fontStyle: "italic",
    },

    viewAllBtn: {
        marginHorizontal: 20,
        marginVertical: 16,
        borderWidth: 1.5,
        borderColor: C.primary,
        paddingVertical: 14,
        alignItems: "center",
    },
    viewAllText: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
    },

    // All comments modal
    modalSafe: { flex: 1, backgroundColor: C.bg },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 2,
        borderBottomColor: C.text,
        backgroundColor: C.bg,
    },
    modalTitle: {
        fontSize: 14,
        fontWeight: "900",
        color: C.text,
        letterSpacing: 1.5,
    },
    modalClose: {
        width: 32,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
    },

    // Per-option year chips
    optionYearRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 5,
        marginTop: 4,
    },
    optionYearChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: C.surfaceAlt,
        paddingHorizontal: 7,
        paddingVertical: 3,
    },
    optionYearChipText: {
        fontSize: 9,
        fontWeight: "700",
        color: C.textBody,
        letterSpacing: 0.5,
    },
    optionYearChipPct: {
        fontSize: 9,
        fontWeight: "600",
        color: C.primary,
    },

    // Demographics charts
    demoSectionLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: C.textLight,
        letterSpacing: 1.5,
        marginTop: 12,
        marginBottom: 6,
    },
    demoRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 6,
    },
    demoLabel: {
        width: 90,
        fontSize: 11,
        fontWeight: "600",
        color: C.textBody,
    },
    demoBarWrap: {
        flex: 1,
        height: 6,
        backgroundColor: C.surfaceAlt,
    },
    demoBarFill: {
        height: 6,
        backgroundColor: C.primary,
    },
    demoCount: {
        fontSize: 11,
        fontWeight: "700",
        color: C.text,
        minWidth: 50,
        textAlign: "right",
    },
    demoPct: {
        fontSize: 10,
        fontWeight: "500",
        color: C.textLight,
    },

    // Attendees modal demographics header
    attendeeDemoHeader: {
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: C.primaryBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
        gap: 8,
    },
    attendeeDemoTitle: {
        fontSize: 9,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    attendeeDemoRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    attendeeDemoChip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: C.primaryBg,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    attendeeDemoChipText: {
        fontSize: 11,
        fontWeight: "600",
        color: C.primary,
    },

    // Modal export button
    modalExportBtn: {
        width: 32,
        height: 32,
        alignItems: "center",
        justifyContent: "center",
    },
});

export default function PostAnalyticsDetail() {
    const router = useRouter();
    const authApi = useApi();
    const { lang } = useLang();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { width } = useWindowDimensions();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    const [post, setPost] = useState<ApiPost | null>(null);
    const [loading, setLoading] = useState(true);
    const [allComments, setAllComments] = useState<ApiComment[]>([]);
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [attendees, setAttendees] = useState<ApiAttendee[]>([]);
    const [attendeesOpen, setAttendeesOpen] = useState(false);
    const [attendeesLoading, setAttendeesLoading] = useState(false);

    useEffect(() => {
        if (!id) return;
        authApi<ApiPost>(`/posts/${id}/analytics`)
            .then(setPost)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [id]);

    function openAttendees() {
        setAttendeesOpen(true);
        if (attendees.length > 0) return;
        setAttendeesLoading(true);
        authApi<ApiAttendee[]>(`/posts/${id}/rsvps`)
            .then(setAttendees)
            .catch(console.error)
            .finally(() => setAttendeesLoading(false));
    }

    function exportAttendees() {
        if (!attendees.length) return;
        const lines = [
            `Event: ${post?.title ?? ""}`,
            `Total RSVPs: ${attendees.length}`,
            `Exported: ${new Date().toLocaleString()}`,
            "",
            ...attendees.map((a, i) => {
                const meta = [a.program, a.year].filter(Boolean).join(", ");
                return `${i + 1}. ${a.name}${meta ? ` (${meta})` : ""}`;
            }),
        ];
        Share.share({ message: lines.join("\n"), title: `Attendees: ${post?.title ?? ""}` });
    }

    function exportPollResults() {
        if (!post?.pollOptions) return;
        const total = post.pollTotalVotes ?? 0;
        const lines = [
            `Poll: ${post.title}`,
            `Total votes: ${total}`,
            `Exported: ${new Date().toLocaleString()}`,
            "",
            ...post.pollOptions.map((o, i) => {
                const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
                const optText = lang === "fr" && o.textFr ? o.textFr : o.textEn;
                return `${i + 1}. ${optText} — ${o.votes} votes (${pct}%)`;
            }),
        ];
        Share.share({ message: lines.join("\n"), title: `Poll Results: ${post.title}` });
    }

    function deleteComment(commentId: string) {
        Alert.alert("Delete Comment", "Remove this comment?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete", style: "destructive", onPress: async () => {
                    try {
                        await authApi(`/posts/${id}/comments/${commentId}`, { method: "DELETE" });
                        setAllComments((c) => c.filter((x) => x.id !== commentId));
                    } catch {
                        Alert.alert("Error", "Could not delete comment.");
                    }
                },
            },
        ]);
    }

    function openAllComments() {
        setCommentsOpen(true);
        if (allComments.length > 0) return;
        setCommentsLoading(true);
        authApi<ApiComment[]>(`/posts/${id}/comments`)
            .then(setAllComments)
            .catch(console.error)
            .finally(() => setCommentsLoading(false));
    }

    if (loading) {
        return (
            <SafeAreaView style={s.safe} edges={["top"]}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator color={C.primary} />
                </View>
            </SafeAreaView>
        );
    }

    if (!post) {
        return (
            <SafeAreaView style={s.safe} edges={["top"]}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: C.textLight, fontSize: 13 }}>Post not found.</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            {/* Top bar */}
            <View style={s.topBar}>
                <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)} style={s.topBarSide} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back">
                    <Ionicons name="arrow-back" size={18} color={C.text} />
                </Pressable>
                <Text style={s.topBarTitle}>POST ANALYTICS</Text>
                <Pressable
                    style={s.topBarSide}
                    onPress={() => Share.share({ title: post.title, message: `${post.title}\n\nuevents://post/${id}` })}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Share"
                >
                    <Ionicons name="share-outline" size={20} color={C.text} />
                </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

                {/* ── Hero image ── */}
                <View style={[s.hero, { height: width * 0.72 }]}>
                    {post.imageUrl ? (
                        <Image source={{ uri: post.imageUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                    ) : (
                        <View style={[StyleSheet.absoluteFill as any, s.heroPlaceholder]}>
                            <Ionicons
                                name={post.type === "EVENT" ? "calendar" : post.type === "POLL" ? "stats-chart" : post.type === "MULTIMEDIA" ? "mic" : "megaphone"}
                                size={48}
                                color="rgba(255,255,255,0.15)"
                            />
                        </View>
                    )}
                </View>

                {/* ── Post identity ── */}
                <View style={s.identityBlock}>
                    <Text style={s.identityLabel}>{post.category}</Text>
                    <Text style={s.identityTitle}>{post.title}</Text>
                    <Text style={s.identityMeta}>{post.publishedAt}</Text>
                </View>

                {/* ── Stats grid ── */}
                <View style={s.statsCard}>
                    {([
                        { label: "TOTAL REACH",  value: fmtNum(post.reach),    sub: undefined as string | undefined, subRed: false, subGreen: false },
                        { label: "TOTAL VIEWS",  value: fmtNum(post.views),    sub: undefined as string | undefined, subRed: false, subGreen: false },
                        { label: "SAVES",        value: fmtNum(post.saves),    sub: undefined as string | undefined, subRed: false, subGreen: false },
                        { label: "LIKES",        value: fmtNum(post.likes),    sub: undefined as string | undefined, subRed: false, subGreen: false },
                        { label: "SHARES",       value: fmtNum(post.shares),   sub: undefined as string | undefined, subRed: false, subGreen: false },
                        { label: "COMMENTS",     value: fmtNum(post.comments), sub: undefined as string | undefined, subRed: false, subGreen: false },
                    ]).map((stat, i) => (
                        <View
                            key={stat.label}
                            style={[
                                s.statCell,
                                i % 2 === 0 && s.statCellLeft,
                                i >= 4 && s.statCellBottom,
                            ]}
                        >
                            <Text style={s.statLabel}>{stat.label}</Text>
                            <Text style={s.statValue}>{stat.value}</Text>
                            {stat.sub && (
                                <Text style={[
                                    s.statSub,
                                    stat.subRed && s.statSubRed,
                                    stat.subGreen && s.statSubGreen,
                                ]}>
                                    {stat.sub}
                                </Text>
                            )}
                        </View>
                    ))}
                </View>

                {/* ── RSVP breakdown (events only) ── */}
                {post.rsvpTotal != null && (
                    <View style={s.rsvpCard}>
                        <View style={s.rsvpHeadRow}>
                            <Text style={s.rsvpHeadLabel}>RSVP BREAKDOWN</Text>
                            <View style={{ flexDirection: "row", gap: 8 }}>
                                <Pressable style={s.attendeesBtn} onPress={openAttendees}>
                                    <Ionicons name="people-outline" size={13} color="#fff" />
                                    <Text style={s.attendeesBtnText}>ATTENDEES</Text>
                                </Pressable>
                                {attendees.length > 0 && (
                                    <Pressable style={[s.attendeesBtn, { backgroundColor: "#374151" }]} onPress={exportAttendees}>
                                        <Ionicons name="share-outline" size={13} color="#fff" />
                                        <Text style={s.attendeesBtnText}>EXPORT</Text>
                                    </Pressable>
                                )}
                            </View>
                        </View>
                        <View style={s.rsvpTotalRow}>
                            <Text style={s.rsvpTotalNum}>{post.rsvpTotal.toLocaleString()}</Text>
                            <Text style={s.rsvpTotalLabel}> Going</Text>
                        </View>
                        <View style={s.rsvpBarTrack}>
                            <View style={[s.rsvpBarFill, { width: "100%", backgroundColor: C.primary }]} />
                        </View>
                    </View>
                )}

                {/* ── RSVP demographics ── */}
                {post.rsvpDemographics && (
                    <View style={s.rsvpCard}>
                        <Text style={s.rsvpHeadLabel}>ATTENDEE DEMOGRAPHICS</Text>

                        {post.rsvpDemographics.yearBreakdown.length > 0 && (
                            <>
                                <Text style={s.demoSectionLabel}>BY YEAR</Text>
                                {post.rsvpDemographics.yearBreakdown.map((item) => (
                                    <View key={item.label} style={s.demoRow}>
                                        <Text style={s.demoLabel}>{item.label}</Text>
                                        <View style={s.demoBarWrap}>
                                            <View style={[s.demoBarFill, { width: `${item.pct}%` as any }]} />
                                        </View>
                                        <Text style={s.demoCount}>{item.count} <Text style={s.demoPct}>({item.pct}%)</Text></Text>
                                    </View>
                                ))}
                            </>
                        )}

                        {post.rsvpDemographics.programBreakdown.length > 0 && (
                            <>
                                <Text style={[s.demoSectionLabel, { marginTop: 14 }]}>BY PROGRAM</Text>
                                {post.rsvpDemographics.programBreakdown.map((item) => (
                                    <View key={item.label} style={s.demoRow}>
                                        <Text style={s.demoLabel} numberOfLines={1}>{item.label}</Text>
                                        <View style={s.demoBarWrap}>
                                            <View style={[s.demoBarFill, { width: `${item.pct}%` as any, backgroundColor: C.textBody }]} />
                                        </View>
                                        <Text style={s.demoCount}>{item.count} <Text style={s.demoPct}>({item.pct}%)</Text></Text>
                                    </View>
                                ))}
                            </>
                        )}
                    </View>
                )}

                {/* ── Poll results (polls only) ── */}
                {post.pollOptions && (
                    <View style={s.rsvpCard}>
                        <View style={s.rsvpHeadRow}>
                            <Text style={s.rsvpHeadLabel}>POLL RESULTS</Text>
                            <Pressable style={s.attendeesBtn} onPress={exportPollResults}>
                                <Ionicons name="share-outline" size={13} color="#fff" />
                                <Text style={s.attendeesBtnText}>EXPORT</Text>
                            </Pressable>
                        </View>
                        <View style={s.rsvpTotalRow}>
                            <Text style={s.rsvpTotalNum}>{post.pollTotalVotes ?? 0}</Text>
                            <Text style={s.rsvpTotalLabel}> Total votes</Text>
                        </View>
                        {post.pollOptions.map((opt) => {
                            const total = post.pollTotalVotes ?? 0;
                            const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
                            return (
                                <View key={opt.id} style={s.rsvpRow}>
                                    <Text style={s.rsvpRowLabel}>{lang === "fr" && opt.textFr ? opt.textFr : opt.textEn}</Text>
                                    <View style={s.rsvpRowBottom}>
                                        <View style={[s.rsvpBarTrack, { flex: 1 }]}>
                                            <View style={[s.rsvpBarFill, { width: `${pct}%` as any, backgroundColor: C.primary }]} />
                                        </View>
                                        <Text style={s.rsvpRowCountRed}>{opt.votes} ({pct}%)</Text>
                                    </View>
                                    {opt.yearBreakdown && opt.yearBreakdown.length > 0 && (
                                        <View style={s.optionYearRow}>
                                            {opt.yearBreakdown.map((y) => (
                                                <View key={y.label} style={s.optionYearChip}>
                                                    <Text style={s.optionYearChipText}>{y.label.replace(" YEAR", "")}</Text>
                                                    <Text style={s.optionYearChipPct}>{y.pct}%</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* ── Poll voter demographics ── */}
                {post.pollDemographics && (
                    <View style={s.rsvpCard}>
                        <Text style={s.rsvpHeadLabel}>VOTER DEMOGRAPHICS</Text>

                        {post.pollDemographics.yearBreakdown.length > 0 && (
                            <>
                                <Text style={s.demoSectionLabel}>BY YEAR</Text>
                                {post.pollDemographics.yearBreakdown.map((item) => (
                                    <View key={item.label} style={s.demoRow}>
                                        <Text style={s.demoLabel}>{item.label}</Text>
                                        <View style={s.demoBarWrap}>
                                            <View style={[s.demoBarFill, { width: `${item.pct}%` as any }]} />
                                        </View>
                                        <Text style={s.demoCount}>{item.count} <Text style={s.demoPct}>({item.pct}%)</Text></Text>
                                    </View>
                                ))}
                            </>
                        )}

                        {post.pollDemographics.programBreakdown.length > 0 && (
                            <>
                                <Text style={[s.demoSectionLabel, { marginTop: 14 }]}>BY PROGRAM</Text>
                                {post.pollDemographics.programBreakdown.map((item) => (
                                    <View key={item.label} style={s.demoRow}>
                                        <Text style={s.demoLabel} numberOfLines={1}>{item.label}</Text>
                                        <View style={s.demoBarWrap}>
                                            <View style={[s.demoBarFill, { width: `${item.pct}%` as any, backgroundColor: C.textBody }]} />
                                        </View>
                                        <Text style={s.demoCount}>{item.count} <Text style={s.demoPct}>({item.pct}%)</Text></Text>
                                    </View>
                                ))}
                            </>
                        )}
                    </View>
                )}

                {/* ── Engagement by class year ── */}
                {post.classYear && (
                    <View style={s.chartCard}>
                        <Text style={s.chartLabel}>ENGAGEMENT BY CLASS YEAR</Text>
                        <View style={s.chartBars}>
                            {post.classYear.map((item) => (
                                <View key={item.label} style={s.chartBarCol}>
                                    <View style={s.chartBarTrack}>
                                        <View style={[
                                            s.chartBarFill,
                                            { height: (item.value / 100) * BAR_MAX_H },
                                            item.featured && s.chartBarFillFeatured,
                                        ]} />
                                    </View>
                                    <Text style={s.chartBarLabel}>{item.label}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* ── Sentiment & feedback ── */}
                <View style={s.sentimentSection}>
                    <View style={s.sentimentHeader}>
                        <Text style={s.sentimentTitle}>SENTIMENT & FEEDBACK</Text>
                        <View style={s.sentimentBadge}>
                            <Text style={s.sentimentBadgeText}>{post.sentimentPct}% POSITIVE</Text>
                        </View>
                    </View>

                    {post.recentComments.map((item) => (
                        <View key={item.id} style={s.feedbackCard}>
                            <View style={s.feedbackTop}>
                                <View style={s.feedbackAvatar}>
                                    {item.user.avatarUrl
                                        ? <Image source={{ uri: item.user.avatarUrl }} style={s.feedbackAvatarImg} />
                                        : <Ionicons name="person" size={16} color="#fff" />
                                    }
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.feedbackName}>{item.user.name}</Text>
                                </View>
                                <Text style={s.feedbackTime}>{timeAgo(item.createdAt)}</Text>
                            </View>
                            <Text style={s.feedbackQuote}>{item.content}</Text>
                        </View>
                    ))}

                    <Pressable style={s.viewAllBtn} onPress={openAllComments}>
                        <Text style={s.viewAllText}>VIEW ALL {post.totalComments} COMMENTS</Text>
                    </Pressable>
                </View>

            </ScrollView>

            {/* ── Attendees modal ── */}
            <Modal
                visible={attendeesOpen}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setAttendeesOpen(false)}
            >
                <SafeAreaView style={s.modalSafe} edges={["top"]}>
                    <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>ATTENDEES ({attendees.length})</Text>
                        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                            {attendees.length > 0 && (
                                <Pressable onPress={exportAttendees} style={s.modalExportBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Export attendees">
                                    <Ionicons name="share-outline" size={15} color={C.primary} />
                                </Pressable>
                            )}
                            <Pressable onPress={() => setAttendeesOpen(false)} style={s.modalClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                                <Ionicons name="close" size={20} color={C.text} />
                            </Pressable>
                        </View>
                    </View>
                    {attendeesLoading ? (
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            <ActivityIndicator color={C.primary} />
                        </View>
                    ) : (
                        <FlatList
                            data={attendees}
                            keyExtractor={(a) => a.userId}
                            contentContainerStyle={{ paddingBottom: 40 }}
                            ListEmptyComponent={
                                <View style={{ alignItems: "center", paddingTop: 60 }}>
                                    <Text style={{ color: C.textLight, fontSize: 13 }}>No RSVPs yet.</Text>
                                </View>
                            }
                            ListHeaderComponent={attendees.length >= 3 ? (() => {
                                // Compute quick stats from loaded attendees
                                const total = attendees.length;
                                const YEAR_ORDER = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
                                const yearMap: Record<string, number> = {};
                                const progMap: Record<string, number> = {};
                                for (const a of attendees) {
                                    if (a.year) yearMap[a.year] = (yearMap[a.year] ?? 0) + 1;
                                    if (a.program) progMap[a.program] = (progMap[a.program] ?? 0) + 1;
                                }
                                const topYear = YEAR_ORDER.find((y) => yearMap[y] === Math.max(...Object.values(yearMap)));
                                const topProgram = Object.entries(progMap).sort((a, b) => b[1] - a[1])[0]?.[0];
                                const topProgPct = topProgram ? Math.round((progMap[topProgram] / total) * 100) : null;
                                return (
                                    <View style={s.attendeeDemoHeader}>
                                        <Text style={s.attendeeDemoTitle}>QUICK STATS</Text>
                                        <View style={s.attendeeDemoRow}>
                                            {topYear && (
                                                <View style={s.attendeeDemoChip}>
                                                    <Ionicons name="school-outline" size={12} color={C.primary} />
                                                    <Text style={s.attendeeDemoChipText}>
                                                        Most: {topYear} ({Math.round((yearMap[topYear] / total) * 100)}%)
                                                    </Text>
                                                </View>
                                            )}
                                            {topProgram && (
                                                <View style={s.attendeeDemoChip}>
                                                    <Ionicons name="book-outline" size={12} color={C.primary} />
                                                    <Text style={s.attendeeDemoChipText} numberOfLines={1}>
                                                        {topProgram} ({topProgPct}%)
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                );
                            })() : null}
                            renderItem={({ item }) => (
                                <View style={s.attendeeRow}>
                                    <View style={s.feedbackAvatar}>
                                        {item.avatarUrl
                                            ? <Image source={{ uri: item.avatarUrl }} style={s.feedbackAvatarImg} />
                                            : <Ionicons name="person" size={16} color="#fff" />
                                        }
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.attendeeName}>{item.name}</Text>
                                        {(item.program || item.year) && (
                                            <Text style={s.attendeeMeta}>
                                                {[item.program, item.year].filter(Boolean).join(" · ")}
                                            </Text>
                                        )}
                                    </View>
                                    <Text style={s.feedbackTime}>{timeAgo(item.rsvpedAt)}</Text>
                                </View>
                            )}
                        />
                    )}
                </SafeAreaView>
            </Modal>

            {/* ── All comments modal ── */}
            <Modal
                visible={commentsOpen}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setCommentsOpen(false)}
            >
                <SafeAreaView style={s.modalSafe} edges={["top"]}>
                    <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>ALL COMMENTS</Text>
                        <Pressable onPress={() => setCommentsOpen(false)} style={s.modalClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                            <Ionicons name="close" size={20} color={C.text} />
                        </Pressable>
                    </View>

                    {commentsLoading ? (
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            <ActivityIndicator color={C.primary} />
                        </View>
                    ) : (
                        <FlatList
                            data={allComments}
                            keyExtractor={(c) => c.id}
                            contentContainerStyle={{ paddingBottom: 40 }}
                            ListEmptyComponent={
                                <View style={{ alignItems: "center", paddingTop: 60 }}>
                                    <Text style={{ color: C.textLight, fontSize: 13 }}>No comments yet.</Text>
                                </View>
                            }
                            renderItem={({ item }) => (
                                <View style={s.feedbackCard}>
                                    <View style={s.feedbackTop}>
                                        <View style={s.feedbackAvatar}>
                                            {item.user.avatarUrl
                                                ? <Image source={{ uri: item.user.avatarUrl }} style={s.feedbackAvatarImg} />
                                                : <Ionicons name="person" size={16} color="#fff" />
                                            }
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.feedbackName}>
                                                {[item.user.firstName, item.user.lastName].filter(Boolean).join(" ") || "Anonymous"}
                                            </Text>
                                        </View>
                                        <Text style={s.feedbackTime}>{timeAgo(item.createdAt)}</Text>
                                        <Pressable onPress={() => deleteComment(item.id)} hitSlop={8} style={{ marginLeft: 8 }} accessibilityRole="button" accessibilityLabel="Delete comment">
                                            <Ionicons name="trash-outline" size={15} color={C.textFaint} />
                                        </Pressable>
                                    </View>
                                    <Text style={s.feedbackQuote}>{item.content}</Text>
                                </View>
                            )}
                        />
                    )}
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}
