import React, { useEffect, useState } from "react";
import {
    View, Text, ScrollView, Pressable, StyleSheet, Image, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useApi } from "../../lib/useApi";
import { useT, useLang } from "../../lib/LangContext";
import { localeFor } from "../../lib/datetime";
import { fonts, lbl, meta, lightColors } from "../../styles/theme";

type RsvpEvent = {
    id: string;
    locales?: { en?: { title?: string; imageUrl?: string; posterUrl?: string } };
    startAt?: string;
    endAt?: string;
    locationName?: string;
    club?: { id?: string; clubName?: string; logoUrl?: string };
};

type DayGroup = {
    dateKey: string; // "YYYY-MM-DD"
    label: string;   // "MONDAY, JUNE 9"
    dayNum: string;
    events: RsvpEvent[];
};

function toDateKey(iso: string) {
    return iso.slice(0, 10); // "YYYY-MM-DD"
}

function fmtDayLabel(dateKey: string, lang: string) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const weekday = date.toLocaleString(localeFor(lang), { weekday: "long" }).toUpperCase();
    const month = date.toLocaleString(localeFor(lang), { month: "long" }).toUpperCase();
    return { label: `${weekday}, ${month} ${d}`, dayNum: String(d) };
}

function fmtTime(iso: string | undefined, lang: string) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString(localeFor(lang), {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
}

function groupByDay(events: RsvpEvent[], lang: string): DayGroup[] {
    const map = new Map<string, RsvpEvent[]>();
    for (const e of events) {
        if (!e.startAt) continue;
        const key = toDateKey(e.startAt);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(e);
    }
    return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, evts]) => {
            const sorted = evts.sort(
                (a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime()
            );
            const { label, dayNum } = fmtDayLabel(dateKey, lang);
            return { dateKey, label, dayNum, events: sorted };
        });
}

export default function AllEventsModal() {
    const t = useT();
    const { lang } = useLang();
    const router = useRouter();
    const authApi = useApi();
    const { events: eventsParam } = useLocalSearchParams<{ events?: string; date?: string }>();
    // Browse mode: a list of events was passed in (e.g. from Discover). Otherwise
    // fall back to the user's own RSVP'd schedule.
    const browse = !!eventsParam;
    const [groups, setGroups] = useState<DayGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        if (eventsParam) {
            try {
                const parsed = (JSON.parse(eventsParam) as RsvpEvent[]).filter((e) => e.startAt);
                setTotal(parsed.length);
                setGroups(groupByDay(parsed, lang));
            } catch {}
            setLoading(false);
            return;
        }
        authApi<RsvpEvent[]>("/users/me/rsvps")
            .then((data) => {
                const upcoming = data.filter(
                    (e) => e.startAt && new Date(e.startAt) >= new Date(new Date().setHours(0, 0, 0, 0))
                );
                setTotal(upcoming.length);
                setGroups(groupByDay(upcoming, lang));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    return (
        <SafeAreaView style={s.page} edges={["top"]}>
            {/* Top bar */}
            <View style={s.topBar}>
                <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel={t.goBackLabel}>
                    <Ionicons name="arrow-back" size={18} color={lightColors.text} />
                </Pressable>
                <Text style={s.topBarTitle}>{browse ? "ALL EVENTS" : "MY SCHEDULE"}</Text>
                <View style={{ width: 32 }} />
            </View>

            {/* Count header */}
            <View style={s.countRow}>
                <Text style={s.countText}>
                    {loading ? "—" : total} {total === 1 ? "EVENT" : "EVENTS"} COMING UP
                </Text>
            </View>

            {loading ? (
                <ActivityIndicator color={lightColors.primary} style={{ marginTop: 40 }} />
            ) : groups.length === 0 ? (
                <View style={s.empty}>
                    <Ionicons name="calendar-outline" size={40} color={lightColors.textFaint} />
                    <Text style={s.emptyText}>{t.noUpcomingEvents}</Text>
                    <Text style={s.emptySub}>{browse ? "Nothing scheduled for this view." : "RSVP to events to see them here."}</Text>
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={{ backgroundColor: lightColors.bg }}
                    contentContainerStyle={{ paddingBottom: 60, paddingTop: 8, gap: 8 }}
                >
                    {groups.map((group) => (
                        <View key={group.dateKey} style={s.card}>
                            {/* Day header */}
                            <View style={s.dayHeader}>
                                <Text style={s.dayNum}>{group.dayNum}</Text>
                                <View>
                                    <Text style={s.dayLabel}>{group.label}</Text>
                                    <Text style={s.dayCount}>
                                        {group.events.length} {group.events.length === 1 ? "event" : "events"}
                                    </Text>
                                </View>
                            </View>

                            {/* Event rows */}
                            {group.events.map((event, i) => {
                                const locale = event.locales?.en ?? {};
                                const title = locale.title ?? t.untitledEvent;
                                const imgUri = locale.posterUrl ?? locale.imageUrl;
                                const startTime = fmtTime(event.startAt, lang);
                                const endTime = fmtTime(event.endAt, lang);
                                const clubName = event.club?.clubName?.toUpperCase() ?? "";

                                return (
                                    <Pressable
                                        key={event.id}
                                        style={[s.row, i > 0 && s.rowBorder]}
                                        onPress={() => router.push({ pathname: "/event/[id]", params: { id: event.id } })}
                                    >
                                        {/* Time */}
                                        <View style={s.timeCol}>
                                            <Text style={s.timeMain}>{startTime}</Text>
                                            {!!endTime && <Text style={s.timeSub}>{endTime}</Text>}
                                        </View>

                                        {/* Accent bar */}
                                        <View style={s.accentBar} />

                                        {/* Poster */}
                                        <View style={s.poster}>
                                            {imgUri ? (
                                                <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                                            ) : (
                                                <View style={[StyleSheet.absoluteFill as any, s.posterPlaceholder]} />
                                            )}
                                        </View>

                                        {/* Details */}
                                        <View style={s.details}>
                                            {!!clubName && (
                                                <Text style={s.clubLabel} numberOfLines={1}>{clubName}</Text>
                                            )}
                                            <Text style={s.eventTitle} numberOfLines={2}>{title.toUpperCase()}</Text>
                                            {!!event.locationName && (
                                                <View style={s.metaRow}>
                                                    <Ionicons name="location-outline" size={11} color={lightColors.primary} />
                                                    <Text style={s.metaText} numberOfLines={1}>{event.locationName}</Text>
                                                </View>
                                            )}
                                        </View>

                                        <Ionicons name="chevron-forward" size={13} color={lightColors.textFaint} style={{ alignSelf: "center" }} />
                                    </Pressable>
                                );
                            })}
                        </View>
                    ))}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const BURGUNDY = lightColors.primary;

const s = StyleSheet.create({
    page: { flex: 1, backgroundColor: lightColors.bg },

    topBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: lightColors.bg,
    },
    backBtn: { width: 32 },
    topBarTitle: { ...lbl(12, "bold", 0.12), color: lightColors.text },

    countRow: {
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    countText: { ...lbl(10, "bold", 0.12), color: lightColors.textLight },

    empty: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
    },
    emptyText: { ...lbl(12, "bold", 0.12), color: lightColors.textFaint },
    emptySub: { ...meta(13, "regular"), color: lightColors.textLight,
        textAlign: "center" },

    // Floating card per day
    card: {
        backgroundColor: "#fff",
        marginLeft: 12,
        marginRight: 12,
        borderWidth: 1,
        borderColor: lightColors.border,
    },

    dayHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: lightColors.border,
    },
    dayNum: { fontFamily: fonts.displayBold, fontSize: 36, color: BURGUNDY,
        lineHeight: 38,
        minWidth: 52,
        textAlign: "center" },
    dayLabel: { ...meta(12, "bold"), color: lightColors.text },
    dayCount: { ...meta(11, "medium"), color: lightColors.textLight,
        
        marginTop: 1 },

    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 12,
    },
    rowBorder: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: lightColors.border,
    },

    timeCol: {
        width: 72,
        alignItems: "center",
        flexShrink: 0,
    },
    timeMain: { ...meta(12, "bold"), color: lightColors.text,
        textAlign: "center" },
    timeSub: { ...meta(10, "regular"), color: lightColors.textLight,
        textAlign: "center",
        marginTop: 1 },

    accentBar: {
        width: 2,
        height: 44,
        backgroundColor: BURGUNDY,
        flexShrink: 0,
    },

    poster: {
        width: 56,
        height: 56,
        overflow: "hidden",
        flexShrink: 0,
        backgroundColor: "#1a1a1a",
    },
    posterPlaceholder: { backgroundColor: "#2a2a2a" },

    details: { flex: 1, gap: 2, minWidth: 0 },
    clubLabel: { ...lbl(9, "bold", 0.11), color: BURGUNDY },
    eventTitle: { ...meta(13, "bold"), letterSpacing: -0.2, color: lightColors.text,
        lineHeight: 17 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
    metaText: { ...meta(11, "regular"), color: lightColors.textMuted, flex: 1 },
});
