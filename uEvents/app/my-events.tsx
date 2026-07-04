import { useCallback, useState, useMemo } from "react";
import {
    View, Text, ScrollView, Pressable, Image, StyleSheet, ActivityIndicator, RefreshControl, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useApi } from "../lib/useApi";
import { useT } from "../lib/LangContext";
import { useTheme } from "../lib/ThemeContext";
import type { AppColors } from "../styles/theme";

const GREEN = "#16A34A";

type RsvpPost = {
    id: string;
    type: string;
    locales: any;
    startAt?: string;
    endAt?: string;
    locationName?: string;
    club?: { id: string; clubName?: string; logoUrl?: string };
    _count: { rsvps: number };
};

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function MyEventsScreen() {
    const router = useRouter();
    const authApi = useApi();
    const t = useT();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);

    const [rsvps, setRsvps] = useState<RsvpPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(false);
    const [query, setQuery] = useState("");

    const load = useCallback((isRefresh = false) => {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError(false);
        authApi<RsvpPost[]>("/users/me/rsvps")
            .then(setRsvps)
            .catch(() => setError(true))
            .finally(() => isRefresh ? setRefreshing(false) : setLoading(false));
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const now = Date.now();
    const q = query.trim().toLowerCase();
    const matches = useCallback((r: RsvpPost) => {
        if (!q) return true;
        const loc = r.locales?.en ?? r.locales?.fr ?? {};
        return [loc.title, r.club?.clubName, r.locationName]
            .filter(Boolean)
            .some((v: string) => v.toLowerCase().includes(q));
    }, [q]);

    const upcoming = useMemo(() =>
        rsvps
            .filter((r) => r.startAt && new Date(r.endAt ?? r.startAt).getTime() >= now && matches(r))
            .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime()),
        [rsvps, matches]);
    const past = useMemo(() =>
        rsvps
            .filter((r) => r.startAt && new Date(r.endAt ?? r.startAt).getTime() < now && matches(r))
            .sort((a, b) => new Date(b.startAt!).getTime() - new Date(a.startAt!).getTime()),
        [rsvps, matches]);

    function renderRow(event: RsvpPost, isPast: boolean) {
        const loc = event.locales?.en ?? event.locales?.fr ?? {};
        const img = loc.posterUrl ?? loc.imageUrl;
        const d = new Date(event.startAt!);
        const sub = [event.club?.clubName, event.startAt ? formatTime(event.startAt) : null, event.locationName]
            .filter(Boolean).join(" · ");
        return (
            <Pressable key={event.id} style={[s.row, isPast && s.rowPast]} onPress={() => router.push(`/event/${event.id}` as any)}>
                <View style={s.thumbWrap}>
                    {img
                        ? <Image source={{ uri: img }} style={s.thumb} resizeMode="cover" />
                        : <View style={[s.thumb, { backgroundColor: C.skeleton }]} />}
                    <View style={s.dateTag}>
                        <Text style={s.dateDay}>{DAYS[d.getDay()]}</Text>
                        <Text style={s.dateNum}>{d.getDate()}</Text>
                    </View>
                </View>
                <View style={s.body}>
                    <Text style={s.title} numberOfLines={1}>{loc.title ?? ""}</Text>
                    <Text style={s.sub} numberOfLines={1}>{sub}</Text>
                    {!isPast && (
                        <View style={s.goingBadge}>
                            <Text style={s.goingBadgeText}>{t.goingBtn}</Text>
                            <Ionicons name="checkmark" size={10} color="#fff" />
                        </View>
                    )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.textFaint} />
            </Pressable>
        );
    }

    const total = upcoming.length + past.length;
    const hasAny = rsvps.length > 0;

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            <View style={s.topBar}>
                <Pressable style={s.backGroup} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t.back ?? "Back"}>
                    <Ionicons name="chevron-back" size={22} color={C.primary} />
                    <Text style={s.backLabel}>{t.back ?? "BACK"}</Text>
                </Pressable>
                {hasAny && <Text style={s.countBadge}>{t.upcomingCount(upcoming.length)}</Text>}
            </View>

            <Text style={s.screenTitle}>{t.registeredEventsTitle}</Text>

            {hasAny && !loading && !error && (
                <View style={s.searchBar}>
                    <Ionicons name="search" size={16} color={C.textMuted} />
                    <TextInput
                        style={s.searchInput}
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t.registeredSearchPlaceholder}
                        placeholderTextColor={C.textFaint}
                        autoCorrect={false}
                        returnKeyType="search"
                        clearButtonMode="while-editing"
                    />
                    {query.length > 0 && (
                        <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                            <Ionicons name="close-circle" size={16} color={C.textMuted} />
                        </Pressable>
                    )}
                </View>
            )}

            {loading ? (
                <View style={s.center}><ActivityIndicator color={C.primary} /></View>
            ) : error ? (
                <View style={s.center}>
                    <Text style={s.emptyText}>—</Text>
                    <Pressable style={s.retry} onPress={() => load()}>
                        <Text style={s.retryText}>RETRY</Text>
                    </Pressable>
                </View>
            ) : !hasAny ? (
                <View style={s.center}>
                    <Ionicons name="calendar-outline" size={40} color={C.textFaint} />
                    <Text style={s.emptyText}>{t.registeredEventsEmpty}</Text>
                </View>
            ) : total === 0 ? (
                <View style={s.center}>
                    <Ionicons name="search-outline" size={36} color={C.textFaint} />
                    <Text style={s.emptyText}>{t.noMatchingEvents}</Text>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 40 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.primary} />}
                >
                    {upcoming.length > 0 && (
                        <>
                            <Text style={s.sectionLabel}>{t.upcomingCount(upcoming.length).toUpperCase()}</Text>
                            {upcoming.map((e) => renderRow(e, false))}
                        </>
                    )}
                    {past.length > 0 && (
                        <>
                            <Text style={[s.sectionLabel, { marginTop: 18 }]}>{t.pastLabel} · {past.length}</Text>
                            {past.map((e) => renderRow(e, true))}
                        </>
                    )}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const makeStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    topBar: {
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingHorizontal: 16, paddingVertical: 12,
    },
    backGroup: { flexDirection: "row", alignItems: "center", gap: 2 },
    backLabel: { fontSize: 14, fontWeight: "900", color: C.primary, letterSpacing: 2 },
    countBadge: { fontSize: 11, fontWeight: "800", color: C.textMuted, letterSpacing: 1 },
    screenTitle: { fontSize: 26, fontWeight: "900", color: C.text, letterSpacing: -0.5, paddingHorizontal: 16, marginBottom: 12 },
    searchBar: {
        flexDirection: "row", alignItems: "center", gap: 8,
        marginHorizontal: 16, marginBottom: 14,
        paddingHorizontal: 12, height: 40,
        backgroundColor: C.surfaceAlt ?? C.surface,
        borderWidth: 1, borderColor: C.border,
    },
    searchInput: { flex: 1, fontSize: 15, fontWeight: "500", color: C.text, paddingVertical: 0 },
    sectionLabel: { fontSize: 11, fontWeight: "800", color: C.textLight, letterSpacing: 1.5, paddingHorizontal: 16, marginBottom: 8 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 },
    emptyText: { fontSize: 13, fontWeight: "600", color: C.textMuted, textAlign: "center" },
    retry: { borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 20, paddingVertical: 10 },
    retryText: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1.5 },

    row: {
        flexDirection: "row", alignItems: "center", gap: 12,
        paddingHorizontal: 16, paddingVertical: 10,
    },
    rowPast: { opacity: 0.6 },
    thumbWrap: { width: 64, height: 64, position: "relative" },
    thumb: { width: 64, height: 64, borderRadius: 2 },
    dateTag: {
        position: "absolute", top: 4, left: 4, backgroundColor: "rgba(0,0,0,0.72)",
        paddingHorizontal: 5, paddingVertical: 2, alignItems: "center",
    },
    dateDay: { fontSize: 8, fontWeight: "800", color: "#fff", letterSpacing: 0.5 },
    dateNum: { fontSize: 15, fontWeight: "900", color: "#fff", lineHeight: 17 },
    body: { flex: 1, gap: 4 },
    title: { fontSize: 16, fontWeight: "800", color: C.text, letterSpacing: -0.3 },
    sub: { fontSize: 12, fontWeight: "500", color: C.textMuted },
    goingBadge: {
        alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 3,
        backgroundColor: GREEN, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2,
    },
    goingBadgeText: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.8 },
});
