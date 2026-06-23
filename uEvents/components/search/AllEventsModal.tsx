import React, { useEffect, useState } from "react";
import {
    View, Text, ScrollView, Pressable, StyleSheet, Image, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useApi } from "../../lib/useApi";

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

function fmtDayLabel(dateKey: string) {
    const [y, m, d] = dateKey.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const weekday = date.toLocaleString("en-US", { weekday: "long" }).toUpperCase();
    const month = date.toLocaleString("en-US", { month: "long" }).toUpperCase();
    return { label: `${weekday}, ${month} ${d}`, dayNum: String(d) };
}

function fmtTime(iso?: string) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
}

function groupByDay(events: RsvpEvent[]): DayGroup[] {
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
            const { label, dayNum } = fmtDayLabel(dateKey);
            return { dateKey, label, dayNum, events: sorted };
        });
}

export default function AllEventsModal() {
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
                setGroups(groupByDay(parsed));
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
                setGroups(groupByDay(upcoming));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    return (
        <SafeAreaView style={s.page} edges={["top"]}>
            {/* Top bar */}
            <View style={s.topBar}>
                <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
                    <Ionicons name="arrow-back" size={18} color="#111827" />
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
                <ActivityIndicator color="#8C0327" style={{ marginTop: 40 }} />
            ) : groups.length === 0 ? (
                <View style={s.empty}>
                    <Ionicons name="calendar-outline" size={40} color="#D1CBC3" />
                    <Text style={s.emptyText}>NO UPCOMING EVENTS</Text>
                    <Text style={s.emptySub}>{browse ? "Nothing scheduled for this view." : "RSVP to events to see them here."}</Text>
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    style={{ backgroundColor: "#F7F3EE" }}
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
                                const title = locale.title ?? "Untitled Event";
                                const imgUri = locale.posterUrl ?? locale.imageUrl;
                                const startTime = fmtTime(event.startAt);
                                const endTime = fmtTime(event.endAt);
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
                                                    <Ionicons name="location-outline" size={11} color="#8C0327" />
                                                    <Text style={s.metaText} numberOfLines={1}>{event.locationName}</Text>
                                                </View>
                                            )}
                                        </View>

                                        <Ionicons name="chevron-forward" size={13} color="#D1CBC3" style={{ alignSelf: "center" }} />
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

const BURGUNDY = "#8C0327";

const s = StyleSheet.create({
    page: { flex: 1, backgroundColor: "#F7F3EE" },

    topBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: "#F7F3EE",
    },
    backBtn: { width: 32 },
    topBarTitle: {
        fontSize: 12,
        fontWeight: "900",
        color: "#111827",
        letterSpacing: 2,
    },

    countRow: {
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    countText: {
        fontSize: 10,
        fontWeight: "800",
        color: "#9CA3AF",
        letterSpacing: 2,
    },

    empty: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
    },
    emptyText: {
        fontSize: 12,
        fontWeight: "800",
        color: "#D1CBC3",
        letterSpacing: 2,
    },
    emptySub: {
        fontSize: 13,
        color: "#9CA3AF",
        textAlign: "center",
    },

    // Floating card per day
    card: {
        backgroundColor: "#fff",
        marginLeft: 12,
        marginRight: 12,
        borderWidth: 1,
        borderColor: "#E5E0D8",
    },

    dayHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: "#E5E0D8",
    },
    dayNum: {
        fontSize: 36,
        fontWeight: "900",
        color: BURGUNDY,
        lineHeight: 38,
        minWidth: 52,
        textAlign: "center",
    },
    dayLabel: {
        fontSize: 12,
        fontWeight: "800",
        color: "#111827",
        letterSpacing: 0.5,
    },
    dayCount: {
        fontSize: 11,
        color: "#9CA3AF",
        fontWeight: "500",
        marginTop: 1,
    },

    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 12,
    },
    rowBorder: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "#E5E0D8",
    },

    timeCol: {
        width: 72,
        alignItems: "center",
        flexShrink: 0,
    },
    timeMain: {
        fontSize: 12,
        fontWeight: "800",
        color: "#111827",
        textAlign: "center",
    },
    timeSub: {
        fontSize: 10,
        color: "#9CA3AF",
        textAlign: "center",
        marginTop: 1,
    },

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
    clubLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: BURGUNDY,
        letterSpacing: 1,
    },
    eventTitle: {
        fontSize: 13,
        fontWeight: "800",
        color: "#111827",
        lineHeight: 17,
        letterSpacing: -0.2,
    },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
    metaText: { fontSize: 11, color: "#6B7280", flex: 1 },
});
