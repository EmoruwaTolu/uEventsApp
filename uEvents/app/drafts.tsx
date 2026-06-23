import React, { useCallback, useState, useMemo } from "react";
import {
    View,
    Text,
    ScrollView,
    Pressable,
    StyleSheet,
    ActivityIndicator,
    Alert,
    RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useApi } from "../lib/useApi";
import { useToast } from "../lib/ToastContext";
import type { DraftType } from "../lib/draftsStore";
import { useTheme } from "../lib/ThemeContext";
import type { AppColors } from "../styles/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiDraft = {
    id: string;
    type: "EVENT" | "POLL" | "ANNOUNCEMENT";
    locales: Record<string, { title?: string; body?: string }>;
    updatedAt: string;
    publishAt: string | null;
};

type FilterType = "all" | DraftType;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeKey(type: ApiDraft["type"]): DraftType {
    return type.toLowerCase() as DraftType;
}

function getTitle(draft: ApiDraft): string {
    const locale = draft.locales?.en ?? Object.values(draft.locales ?? {})[0] ?? {};
    return (locale.title ?? "Untitled").toUpperCase();
}

function getPreview(draft: ApiDraft): string {
    const locale = draft.locales?.en ?? Object.values(draft.locales ?? {})[0] ?? {};
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

function fmtScheduled(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        + " at "
        + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

const TYPE_META: Record<DraftType, { label: string; icon: any; color: string; bg: string }> = {
    event:        { label: "EVENT",        icon: "calendar-sharp", color: "#8C0327", bg: "#FEE2E2" },
    announcement: { label: "ANNOUNCEMENT", icon: "megaphone",      color: "#374151", bg: "#E5E7EB" },
    poll:         { label: "POLL",         icon: "grid",           color: "#1D4ED8", bg: "#DBEAFE" },
};

const FILTERS: { key: FilterType; label: string }[] = [
    { key: "all",          label: "ALL" },
    { key: "event",        label: "EVENTS" },
    { key: "announcement", label: "ANNOUNCEMENTS" },
    { key: "poll",         label: "POLLS" },
];

const makeDraftsStyles = (C: AppColors) => StyleSheet.create({
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
    topBarCount: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
        backgroundColor: C.primaryBg,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },

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
    typeBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4 },
    typeBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 1 },
    editedAt: { fontSize: 10, color: C.textLight, fontWeight: "600" },
    cardTitle: { fontSize: 16, fontWeight: "900", color: C.primary, letterSpacing: 0.2, lineHeight: 22 },
    cardPreview: { fontSize: 13, color: C.textMuted, lineHeight: 19 },
    cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
    draftStatusRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    draftDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary },
    draftStatusText: { fontSize: 9, fontWeight: "700", color: C.textLight, letterSpacing: 1.2 },
    cardActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    deleteBtn: { width: 32, height: 32, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
    editBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#1F2937", paddingHorizontal: 12, paddingVertical: 8 },
    editBtnText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1 },

    emptyState: { alignItems: "center", paddingVertical: 60, gap: 12 },
    emptyText: { fontSize: 11, fontWeight: "700", color: C.textFaint, letterSpacing: 2 },
    errorRetry: { borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 20, paddingVertical: 10 },
    errorRetryText: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1.5 },

    sectionLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.textLight,
        letterSpacing: 2,
        paddingTop: 20,
        paddingBottom: 10,
    },
    scheduledBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "#DBEAFE",
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    scheduledBadgeText: {
        fontSize: 9,
        fontWeight: "800",
        color: "#1D4ED8",
        letterSpacing: 0.5,
    },
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function DraftsScreen() {
    const router = useRouter();
    const authApi = useApi();
    const { showToast } = useToast();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeDraftsStyles(C), [C]);
    const [drafts, setDrafts] = useState<ApiDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(false);
    const [filter, setFilter] = useState<FilterType>("all");

    const loadDrafts = useCallback((isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError(false);
        authApi<ApiDraft[]>("/posts/mine?isDraft=true")
            .then(setDrafts)
            .catch(() => setError(true))
            .finally(() => isRefresh ? setRefreshing(false) : setLoading(false));
    }, []);

    useFocusEffect(useCallback(() => { loadDrafts(); }, []));

    async function deleteDraft(id: string) {
        Alert.alert("Delete Draft", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    try {
                        await authApi(`/posts/${id}`, { method: "DELETE" });
                        setDrafts((prev) => prev.filter((d) => d.id !== id));
                    } catch {
                        Alert.alert("Error", "Could not delete draft. Please try again.");
                    }
                },
            },
        ]);
    }

    async function cancelSchedule(id: string) {
        Alert.alert("Cancel Schedule", "This will unschedule the post and keep it as a draft.", [
            { text: "Keep scheduled", style: "cancel" },
            {
                text: "Unschedule",
                style: "destructive",
                onPress: async () => {
                    try {
                        await authApi(`/posts/${id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ publishAt: null, isDraft: true }),
                        });
                        setDrafts((prev) =>
                            prev.map((d) => d.id === id ? { ...d, publishAt: null } : d)
                        );
                    } catch {
                        Alert.alert("Error", "Could not unschedule post.");
                    }
                },
            },
        ]);
    }

    const scheduled = drafts.filter((d) => !!d.publishAt);
    const unscheduled = drafts.filter((d) => !d.publishAt);

    const visible = filter === "all"
        ? unscheduled
        : unscheduled.filter((d) => typeKey(d.type) === filter);

    const visibleScheduled = filter === "all"
        ? scheduled
        : scheduled.filter((d) => typeKey(d.type) === filter);

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            {/* Top bar */}
            <View style={styles.topBar}>
                <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)} style={styles.backGroup}>
                    <Ionicons name="arrow-back" size={18} color={C.primary} />
                    <Text style={styles.backLabel}>BACK</Text>
                </Pressable>
                <Text style={styles.topBarCount}>{unscheduled.length} DRAFT{unscheduled.length !== 1 ? "S" : ""}{scheduled.length > 0 ? ` · ${scheduled.length} SCHEDULED` : ""}</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadDrafts(true)} tintColor={C.primary} />}>
                {/* Hero */}
                <View style={styles.hero}>
                    <Text style={styles.heroLabel}>EDITOR DASHBOARD</Text>
                    <Text style={styles.heroHeading}>YOUR{"\n"}DRAFTS</Text>
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

                {loading ? (
                    <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
                ) : error ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="cloud-offline-outline" size={32} color={C.textFaint} />
                        <Text style={styles.emptyText}>COULDN'T LOAD DRAFTS</Text>
                        <Pressable style={styles.errorRetry} onPress={() => loadDrafts()}>
                            <Text style={styles.errorRetryText}>RETRY</Text>
                        </Pressable>
                    </View>
                ) : (
                    <>
                        {/* Scheduled queue */}
                        {visibleScheduled.length > 0 && (
                            <>
                                <Text style={styles.sectionLabel}>SCHEDULED</Text>
                                <View style={styles.list}>
                                    {visibleScheduled.map((draft) => {
                                        const key = typeKey(draft.type);
                                        const meta = TYPE_META[key];
                                        return (
                                            <Pressable key={draft.id} style={styles.card}>
                                                <View style={[styles.cardAccent, { backgroundColor: "#1D4ED8" }]} />
                                                <View style={styles.cardBody}>
                                                    <View style={styles.cardHeader}>
                                                        <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
                                                            <Ionicons name={meta.icon} size={10} color={meta.color} />
                                                            <Text style={[styles.typeBadgeText, { color: meta.color }]}>
                                                                {meta.label}
                                                            </Text>
                                                        </View>
                                                        <View style={styles.scheduledBadge}>
                                                            <Ionicons name="time-outline" size={10} color="#1D4ED8" />
                                                            <Text style={styles.scheduledBadgeText}>
                                                                {fmtScheduled(draft.publishAt!)}
                                                            </Text>
                                                        </View>
                                                    </View>

                                                    <Text style={styles.cardTitle} numberOfLines={2}>{getTitle(draft)}</Text>
                                                    <Text style={styles.cardPreview} numberOfLines={2}>{getPreview(draft)}</Text>

                                                    <View style={styles.cardFooter}>
                                                        <View style={styles.draftStatusRow}>
                                                            <View style={[styles.draftDot, { backgroundColor: "#1D4ED8" }]} />
                                                            <Text style={styles.draftStatusText}>QUEUED</Text>
                                                        </View>
                                                        <View style={styles.cardActions}>
                                                            <Pressable
                                                                style={styles.deleteBtn}
                                                                onPress={() => cancelSchedule(draft.id)}
                                                                hitSlop={8}
                                                                accessibilityRole="button"
                                                                accessibilityLabel="Cancel schedule"
                                                            >
                                                                <Ionicons name="close-outline" size={16} color={C.textLight} />
                                                            </Pressable>
                                                            <Pressable
                                                                style={styles.editBtn}
                                                                onPress={() => router.push({ pathname: "/edit/[id]", params: { id: draft.id } })}
                                                            >
                                                                <Text style={styles.editBtnText}>EDIT</Text>
                                                                <Ionicons name="create-outline" size={12} color="#fff" />
                                                            </Pressable>
                                                        </View>
                                                    </View>
                                                </View>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </>
                        )}

                        {/* Regular drafts */}
                        <Text style={styles.sectionLabel}>DRAFTS</Text>
                        <View style={styles.list}>
                            {visible.length === 0 ? (
                                <View style={styles.emptyState}>
                                    <Ionicons name="document-outline" size={32} color={C.textFaint} />
                                    <Text style={styles.emptyText}>NO DRAFTS HERE</Text>
                                    <Pressable onPress={() => router.push("/(tabs)/create" as any)} style={{ marginTop: 4, backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 }} accessibilityRole="button" accessibilityLabel="Create a post">
                                        <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff", letterSpacing: 1.5 }}>CREATE A POST</Text>
                                    </Pressable>
                                </View>
                            ) : (
                                visible.map((draft) => {
                                    const key = typeKey(draft.type);
                                    const meta = TYPE_META[key];
                                    return (
                                        <Pressable key={draft.id} style={styles.card}>
                                            <View style={[styles.cardAccent, { backgroundColor: meta.color }]} />
                                            <View style={styles.cardBody}>
                                                <View style={styles.cardHeader}>
                                                    <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
                                                        <Ionicons name={meta.icon} size={10} color={meta.color} />
                                                        <Text style={[styles.typeBadgeText, { color: meta.color }]}>
                                                            {meta.label}
                                                        </Text>
                                                    </View>
                                                    <Text style={styles.editedAt}>{relativeTime(draft.updatedAt)}</Text>
                                                </View>

                                                <Text style={styles.cardTitle} numberOfLines={2}>{getTitle(draft)}</Text>
                                                <Text style={styles.cardPreview} numberOfLines={2}>{getPreview(draft)}</Text>

                                                <View style={styles.cardFooter}>
                                                    <View style={styles.draftStatusRow}>
                                                        <View style={styles.draftDot} />
                                                        <Text style={styles.draftStatusText}>DRAFT</Text>
                                                    </View>
                                                    <View style={styles.cardActions}>
                                                        <Pressable
                                                            style={styles.deleteBtn}
                                                            onPress={() => deleteDraft(draft.id)}
                                                            hitSlop={8}
                                                            accessibilityRole="button"
                                                            accessibilityLabel="Delete draft"
                                                        >
                                                            <Ionicons name="trash-outline" size={14} color={C.textLight} />
                                                        </Pressable>
                                                        <Pressable
                                                            style={styles.editBtn}
                                                            onPress={() => router.push({ pathname: "/edit/[id]", params: { id: draft.id } })}
                                                        >
                                                            <Text style={styles.editBtnText}>CONTINUE</Text>
                                                            <Ionicons name="arrow-forward" size={12} color="#fff" />
                                                        </Pressable>
                                                    </View>
                                                </View>
                                            </View>
                                        </Pressable>
                                    );
                                })
                            )}
                        </View>
                    </>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}
