import { useEffect, useState, useMemo, useCallback } from "react";
import {
    View, Text, ScrollView, Pressable, Image,
    StyleSheet, ActivityIndicator, TextInput, RefreshControl, Linking,
} from "react-native";
import ModalScreen from "../../components/ModalScreen";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../auth/AuthContext";
import { useRsvp } from "../../lib/RsvpContext";
import { useT } from "../../lib/LangContext";
import { EventCardSkeleton } from "../../components/SkeletonLoader";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";

// Days/months come from i18n t.days / t.months

// Shape returned by /events?upcoming=true
type ApiEvent = {
    id: string;
    type: string;
    locales: any;
    startAt?: string;
    endAt?: string;
    locationName?: string;
    createdAt: string;
    club: { id: string; clubName?: string; logoUrl?: string; category?: string };
    _count: { rsvps: number };
};

// Shape returned by /users/me/rsvps (nested post)
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

type AttendedEvent = { id: string; title: string; clubName: string; clubLogo?: string | null; startAt?: string; checkedAt: string; categories: string[] };
type AttendanceResp = { total: number; thisSemester: number; semesterLabel: string; events: AttendedEvent[] };

function openMaps(query?: string) {
    if (!query) return;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
}

function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}

function formatTime(iso: string): string {
    const d = new Date(iso);
    const h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    return `${(h % 12 || 12)}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDateLabel(d: Date, days: string[], months: string[]): string {
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function weekRange(today: Date, months: string[]): string {
    const end = new Date(today);
    end.setDate(today.getDate() + 6);
    return `${months[today.getMonth()]} ${today.getDate()}–${end.getDate()}`;
}

function isLive(startAt?: string, endAt?: string, now: Date = new Date()): boolean {
    if (!startAt) return false;
    const start = new Date(startAt);
    const end = endAt ? new Date(endAt) : new Date(start.getTime() + 2 * 3600000);
    return now >= start && now <= end;
}

function countdownText(startAt: string, now: Date): string | null {
    const diff = new Date(startAt).getTime() - now.getTime();
    if (diff <= 0) return null;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Starting now";
    if (mins < 60) return `Starts in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `Starts in ${hrs}h ${rem}m` : `Starts in ${hrs}h`;
}

function briefingKey(now: Date): "morningBriefing" | "afternoonBriefing" | "eveningBriefing" {
    const h = now.getHours();
    if (h < 12) return "morningBriefing";
    if (h < 17) return "afternoonBriefing";
    return "eveningBriefing";
}

function hasConflict(event: { id: string; startAt?: string; endAt?: string }, all: { id: string; startAt?: string; endAt?: string }[]): boolean {
    if (!event.startAt) return false;
    const s = new Date(event.startAt).getTime();
    const e = event.endAt ? new Date(event.endAt).getTime() : s + 2 * 3600000;
    return all.some((o) => {
        if (o.id === event.id || !o.startAt) return false;
        const os = new Date(o.startAt).getTime();
        const oe = o.endAt ? new Date(o.endAt).getTime() : os + 2 * 3600000;
        return s < oe && e > os;
    });
}

const makeEventsStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },

    // Header
    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 14,
        gap: 12,
        backgroundColor: C.surface,
        marginLeft: 12,
        marginRight: 12,
        marginTop: 8,
        marginBottom: 0,
        borderWidth: 1,
        borderColor: C.borderWarm,
    },
    avatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: C.textLight,
        alignItems: "center",
        justifyContent: "center",
    },
    headerTitle: {
        flex: 1,
        fontSize: 12,
        fontWeight: "800",
        color: C.text,
        letterSpacing: 2,
    },

    // Briefing
    briefingCard: {
        marginHorizontal: 12,
        marginTop: 14,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.borderWarm,
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 20,
    },
    briefingLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
        marginBottom: 10,
    },
    briefingAccent: {
        width: 32,
        height: 2,
        backgroundColor: C.primary,
        marginBottom: 12,
    },
    briefingText: {
        fontSize: 16,
        fontWeight: "500",
        color: C.text,
        lineHeight: 24,
    },

    // Agenda card
    agendaCard: {
        backgroundColor: C.surface,
        marginLeft: 12,
        marginRight: 12,
        marginTop: 14,
        paddingBottom: 4,
        borderWidth: 1,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: C.borderWarm,
    },
    agendaHeader: {
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 2,
    },
    agendaTitle: {
        fontSize: 24,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.5,
    },
    agendaRange: {
        fontSize: 11,
        fontWeight: "600",
        color: C.textMuted,
        letterSpacing: 0.5,
    },
    todayRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    todayLabel: {
        fontSize: 11,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    todayDate: {
        fontSize: 11,
        fontWeight: "500",
        color: C.textMuted,
        letterSpacing: 0.5,
    },

    // Hero event
    heroCard: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.borderWarm,
    },
    heroImage: {
        width: "100%",
        aspectRatio: 1,
    },
    heroBody: {
        padding: 20,
        gap: 8,
    },
    heroTitle: {
        fontSize: 22,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.4,
        lineHeight: 28,
    },
    heroDesc: {
        fontSize: 13,
        color: C.textMuted,
        lineHeight: 19,
    },

    // Shared
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    rsvpdBadge: {
        backgroundColor: "#16A34A",
        paddingHorizontal: 6,
        paddingVertical: 3,
    },
    rsvpdText: {
        fontSize: 8,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 1,
    },
    eventTime: {
        fontSize: 11,
        fontWeight: "500",
        color: C.textMuted,
    },
    locationRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    locationText: {
        fontSize: 11,
        fontWeight: "600",
        color: C.textMuted,
        letterSpacing: 0.3,
    },
    cardClubName: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
    },
    thumb: {
        width: 62,
        height: 62,
    },

    // Compact rows
    emptyToday: {
        paddingVertical: 24,
        alignItems: "center",
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.borderWarm,
        marginHorizontal: 20,
    },
    emptyTodayText: {
        fontSize: 10,
        fontWeight: "700",
        color: C.textFaint,
        letterSpacing: 2,
    },
    compactRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.borderWarm,
        gap: 12,
    },
    compactLeft: {
        flex: 1,
        gap: 4,
    },
    compactTitle: {
        fontSize: 15,
        fontWeight: "700",
        color: C.text,
        letterSpacing: -0.2,
    },
    compactSub: {
        fontSize: 10,
        fontWeight: "600",
        color: C.textLight,
        letterSpacing: 0.5,
    },

    // Upcoming
    upcomingSep: {
        fontSize: 10,
        fontWeight: "800",
        color: C.textLight,
        letterSpacing: 2,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 4,
    },
    upcomingRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.borderWarm,
        gap: 14,
    },
    upcomingDateCol: {
        width: 28,
        alignItems: "center",
        gap: 1,
    },
    upcomingDayName: {
        fontSize: 9,
        fontWeight: "700",
        color: C.textLight,
        letterSpacing: 0.5,
    },
    upcomingDayNum: {
        fontSize: 20,
        fontWeight: "800",
        color: C.text,
        lineHeight: 24,
    },

    // Calendar button
    calendarBtn: {
        marginHorizontal: 20,
        marginTop: 16,
        marginBottom: 16,
        borderWidth: 1.5,
        borderColor: C.primary,
        paddingVertical: 14,
        alignItems: "center",
    },
    calendarBtnText: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
    },

    // Recommended card
    recCard: {
        backgroundColor: C.surface,
        marginLeft: 12,
        marginRight: 12,
        marginTop: 14,
        paddingTop: 20,
        paddingBottom: 20,
        borderWidth: 1,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: C.borderWarm,
    },
    forYouLabel: {
        fontSize: 10,
        fontWeight: "700",
        color: C.primary,
        letterSpacing: 1.5,
        marginBottom: 2,
        paddingHorizontal: 20,
    },
    recHeading: {
        fontSize: 24,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.5,
        marginBottom: 4,
        paddingHorizontal: 20,
    },
    recRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.borderWarm,
        gap: 12,
    },
    recLeft: { flex: 1, gap: 4 },
    recMeta: { flexDirection: "row", gap: 10, alignItems: "center" },
    recTitle: {
        fontSize: 13,
        fontWeight: "800",
        color: C.text,
        letterSpacing: -0.2,
    },
    recDesc: {
        fontSize: 12,
        color: C.textMuted,
        lineHeight: 17,
    },
    recDate: {
        fontSize: 10,
        fontWeight: "600",
        color: C.textLight,
        letterSpacing: 0.3,
        marginTop: 2,
    },
    detailsBtnGoing: {
        color: "#16A34A",
    },
    detailsBtn: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1,
    },

    // Featured rec card
    featuredCard: {
        height: 180,
        backgroundColor: C.primary,
        overflow: "hidden",
        justifyContent: "flex-end",
        marginTop: 8,
    },
    featuredOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(100,3,28,0.7)",
    },
    featuredContent: {
        padding: 20,
        gap: 6,
    },
    featuredTitle: {
        fontSize: 18,
        fontWeight: "900",
        color: "#fff",
        letterSpacing: -0.3,
        lineHeight: 24,
    },
    featuredSub: {
        fontSize: 11,
        color: "rgba(255,255,255,0.65)",
        lineHeight: 16,
    },
    reserveBtn: {
        alignSelf: "flex-start",
        marginTop: 8,
        backgroundColor: "#fff",
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    reserveBtnText: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
    },

    // Archive
    archiveCard: {
        backgroundColor: C.surface,
        marginLeft: 12,
        marginRight: 12,
        marginTop: 14,
        borderWidth: 1,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: C.borderWarm,
    },
    archiveHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 20,
    },
    archiveLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.textLight,
        letterSpacing: 2,
        marginBottom: 2,
    },
    archiveTitle: {
        fontSize: 20,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.5,
    },
    archiveRight: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    archiveCount: {
        fontSize: 13,
        fontWeight: "700",
        color: C.textLight,
    },
    archiveRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.borderWarm,
        gap: 14,
    },
    attendedBadge: {
        backgroundColor: C.border,
        paddingHorizontal: 6,
        paddingVertical: 3,
    },
    attendedText: {
        fontSize: 8,
        fontWeight: "800",
        color: C.textMuted,
        letterSpacing: 1,
    },
    archiveToggleRow: {
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    archiveToggle: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderWidth: 1.5,
        borderColor: C.border,
        backgroundColor: C.surface,
    },
    archiveToggleActive: { borderColor: C.primary, backgroundColor: C.primary },
    archiveToggleText: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: C.textMuted },
    archiveToggleTextActive: { color: "#fff" },
    archiveEmpty: { fontSize: 13, color: C.textMuted, paddingHorizontal: 16, paddingBottom: 16 },
    thumbMuted: {
        opacity: 0.5,
    },

    // See all
    seeAllBtn: {
        marginTop: 16,
        marginHorizontal: 20,
        borderWidth: 1.5,
        borderColor: C.textFaint,
        paddingVertical: 14,
        alignItems: "center",
    },
    seeAllText: {
        fontSize: 10,
        fontWeight: "800",
        color: C.textBody,
        letterSpacing: 1.5,
    },

    // Search modal
    searchBackdrop: {
        flex: 1,
        backgroundColor: C.overlay,
        justifyContent: "flex-end",
    },
    searchSheet: {
        backgroundColor: C.surface,
        paddingBottom: 32,
    },
    searchHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
    },
    searchTitle: {
        fontSize: 12,
        fontWeight: "800",
        color: C.text,
        letterSpacing: 2,
    },
    searchInputWrap: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginHorizontal: 20,
        marginVertical: 12,
        backgroundColor: C.surfaceAlt,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: C.text,
        fontWeight: "500",
    },
    searchRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.borderWarm,
        gap: 12,
    },
    searchRowLeft: { flex: 1, gap: 4 },
    searchRowTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: C.text,
        letterSpacing: -0.2,
    },
    searchRowSub: {
        fontSize: 11,
        color: C.textLight,
        fontWeight: "500",
    },
    searchThumb: { width: 54, height: 54 },
    searchEmpty: { alignItems: "center", paddingVertical: 40 },
    searchEmptyText: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textFaint,
        letterSpacing: 2,
    },

    // Error state
    errorText: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textLight,
        letterSpacing: 2,
        marginTop: 12,
    },
    errorRetry: {
        marginTop: 16,
        borderWidth: 1.5,
        borderColor: C.primary,
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    errorRetryText: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
    },

    // Conflict badge
    conflictBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: "#FFFBEB",
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    conflictText: {
        fontSize: 8,
        fontWeight: "800",
        color: "#F59E0B",
        letterSpacing: 0.8,
    },

    // Show more upcoming
    showMoreBtn: {
        marginHorizontal: 20,
        marginTop: 4,
        paddingVertical: 10,
        alignItems: "center",
    },
    showMoreText: {
        fontSize: 10,
        fontWeight: "700",
        color: C.textLight,
        letterSpacing: 1.5,
    },

    // Live badge
    liveBadge: {
        backgroundColor: C.primary,
        paddingHorizontal: 6,
        paddingVertical: 3,
    },
    liveBadgeText: {
        fontSize: 8,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 1,
    },

    // Countdown
    countdownText: {
        fontSize: 11,
        fontWeight: "600",
        color: "#F59E0B",
        letterSpacing: 0.3,
    },

    // Category pills
    catPillsRow: {
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    catPill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: C.textFaint,
    },
    catPillActive: {
        backgroundColor: C.primary,
        borderColor: C.primary,
    },
    catPillText: {
        fontSize: 9,
        fontWeight: "800",
        color: C.textMuted,
        letterSpacing: 1,
    },
    catPillTextActive: {
        color: "#fff",
    },
});

export default function EventsScreen() {
    const router = useRouter();
    const authApi = useApi();
    const { session, signOut } = useAuth();
    const { isRsvped, toggleRsvp } = useRsvp();
    const [allEvents, setAllEvents] = useState<ApiEvent[]>([]);
    const [rsvps, setRsvps] = useState<RsvpPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState(false);
    const [showAllUpcoming, setShowAllUpcoming] = useState(false);
    const [searchVisible, setSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [showAllRec, setShowAllRec] = useState(false);
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [attended, setAttended] = useState<AttendedEvent[]>([]);
    const [archiveMode, setArchiveMode] = useState<"rsvpd" | "attended">("rsvpd");
    const [now, setNow] = useState(() => new Date());
    const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

    const { colors: C } = useTheme();
    const s = useMemo(() => makeEventsStyles(C), [C]);

    const today = useMemo(() => new Date(now), [now]);
    const t = useT();

    const PAGE = 20;

    async function loadData(isRefresh = false) {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError(false);
        try {
            authApi<{ avatarUrl?: string }>("/users/me")
                .then((u) => setAvatarUrl(u.avatarUrl ?? null))
                .catch(() => {});
            authApi<AttendanceResp>("/users/me/attendance")
                .then((a) => setAttended(a.events ?? []))
                .catch(() => {});
            const [feed, myRsvps] = await Promise.all([
                authApi<ApiEvent[]>(`/events?upcoming=true&limit=${PAGE}&offset=0`),
                authApi<RsvpPost[]>("/users/me/rsvps"),
            ]);
            setAllEvents(feed);
            setHasMore(feed.length === PAGE);
            setRsvps(myRsvps);
        } catch {
            setError(true);
        } finally {
            if (isRefresh) setRefreshing(false); else setLoading(false);
        }
    }

    async function loadMoreEvents() {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const more = await authApi<ApiEvent[]>(`/events?upcoming=true&limit=${PAGE}&offset=${allEvents.length}`);
            setAllEvents((prev) => [...prev, ...more]);
            setHasMore(more.length === PAGE);
        } catch {}
        setLoadingMore(false);
    }

    useFocusEffect(useCallback(() => {
        if (!session?.token) return;
        loadData();
    }, [session?.token]));

    const todayEvents = useMemo(() =>
        rsvps
            .filter((e) => e.startAt && isSameDay(new Date(e.startAt), today))
            .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime()),
        [rsvps, today]);

    const endOfToday = useMemo(() => {
        const d = new Date(today); d.setHours(23, 59, 59, 999); return d;
    }, [today]);

    const upcomingRsvps = useMemo(() =>
        rsvps
            .filter((e) => e.startAt && new Date(e.startAt) > endOfToday)
            .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime()),
        [rsvps, endOfToday]);

    const startOfToday = useMemo(() => {
        const d = new Date(today); d.setHours(0, 0, 0, 0); return d;
    }, [today]);

    const pastRsvps = useMemo(() =>
        rsvps
            .filter((e) => e.startAt && new Date(e.startAt) < startOfToday)
            .sort((a, b) => new Date(b.startAt!).getTime() - new Date(a.startAt!).getTime()),
        [rsvps, startOfToday]);

    async function handleRsvp(event: ApiEvent) {
        const next = await toggleRsvp(event.id);
        if (next) {
            setRsvps((prev) => [...prev, {
                id: event.id, type: event.type, locales: event.locales,
                startAt: event.startAt, endAt: event.endAt,
                locationName: event.locationName, club: event.club,
                _count: { rsvps: event._count.rsvps + 1 },
            }]);
        } else {
            setRsvps((prev) => prev.filter((r) => r.id !== event.id));
        }
    }

    // Tick every 30s for live/countdown accuracy
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(t);
    }, []);

    const rsvpIds = useMemo(() => new Set(rsvps.map((r) => r.id)), [rsvps]);

    // One-tap directions chip for agenda items (opens Maps for the venue).
    const DirectionsBtn = ({ location }: { location?: string }) =>
        location ? (
            <Pressable
                onPress={() => openMaps(location)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Get directions"
                style={{ flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", marginTop: 8, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: C.borderWarm, backgroundColor: C.surface }}
            >
                <Ionicons name="navigate-outline" size={11} color={C.primary} />
                <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 1, color: C.primary }} maxFontSizeMultiplier={1.3}>DIRECTIONS</Text>
            </Pressable>
        ) : null;

    const categories = useMemo(() =>
        [...new Set(allEvents.map((e) => e.club?.category).filter(Boolean) as string[])].sort(),
        [allEvents]);

    const recommended = useMemo(() =>
        allEvents.filter((e) =>
            !rsvpIds.has(e.id) && (!categoryFilter || e.club?.category === categoryFilter)
        ),
        [allEvents, rsvpIds, categoryFilter]);

    const briefing = useMemo(() => {
        if (todayEvents.length === 0) return null;
        const first = todayEvents[0];
        const loc = first.locales?.en ?? first.locales?.fr ?? {};
        const title = loc.title ?? "an event";
        const time = first.startAt ? ` at ${formatTime(first.startAt)}` : "";
        if (todayEvents.length === 1) return `You have 1 event today: ${title}${time}.`;
        return `You have ${todayEvents.length} events today, including ${title}${time}.`;
    }, [todayEvents]);

    // Guest — show empty state with sign-up CTA
    if (session?.role === "guest") {
        return (
            <SafeAreaView style={s.safe} edges={["top"]}>
                <View style={s.center}>
                    <Ionicons name="calendar-outline" size={48} color={C.textFaint} />
                    <Text style={{ fontSize: 14, fontWeight: "900", color: C.textFaint, letterSpacing: 2, marginTop: 16, textAlign: "center" }}>
                        NO EVENTS YET
                    </Text>
                    <Text style={{ fontSize: 13, color: C.textLight, textAlign: "center", lineHeight: 20, marginTop: 8, maxWidth: 260 }}>
                        Sign up to RSVP to events, follow clubs, and see your personal events calendar.
                    </Text>
                    <Pressable
                        style={{ marginTop: 24, backgroundColor: C.primary, paddingHorizontal: 28, paddingVertical: 13 }}
                        onPress={signOut}
                    >
                        <Text style={{ fontSize: 11, fontWeight: "900", color: "#fff", letterSpacing: 2 }}>CREATE ACCOUNT</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    if (loading) {
        return (
            <SafeAreaView style={s.safe} edges={["top"]}>
                <View style={{ padding: 16 }}>
                    {[0, 1, 2, 3].map((i) => <EventCardSkeleton key={i} />)}
                </View>
            </SafeAreaView>
        );
    }

    if (error) {
        return (
            <SafeAreaView style={s.safe} edges={["top"]}>
                <View style={s.center}>
                    <Ionicons name="cloud-offline-outline" size={36} color={C.textFaint} />
                    <Text style={s.errorText}>COULDN'T LOAD EVENTS</Text>
                    <Pressable style={s.errorRetry} onPress={() => loadData()}>
                        <Text style={s.errorRetryText}>{t.retry}</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    const heroEvent = todayEvents[0];
    const restTodayEvents = todayEvents.slice(1);

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ backgroundColor: C.bg }}
                contentContainerStyle={{ paddingBottom: 80, paddingTop: 8 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={C.primary} />}
            >

                {/* ── Header ── */}
                <View style={s.header}>
                    <Text style={s.headerTitle}>YOUR EVENTS</Text>
                    <Pressable onPress={() => { setSearchQuery(""); setSearchVisible(true); }} hitSlop={8} accessibilityLabel="Search" accessibilityRole="button">
                        <Ionicons name="search" size={20} color={C.text} />
                    </Pressable>
                </View>

                {/* ── Morning Briefing ── */}
                {briefing && (
                    <View style={s.briefingCard}>
                        <Text style={s.briefingLabel}>{t[briefingKey(now)]}</Text>
                        <View style={s.briefingAccent} />
                        <Text style={s.briefingText}>{briefing}</Text>
                    </View>
                )}

                {/* ── Your Agenda ── */}
                <View style={s.agendaCard}>
                    <View style={s.agendaHeader}>
                        <Text style={s.agendaTitle}>{t.mySchedule}</Text>
                        <Text style={s.agendaRange}>{weekRange(today, t.months as unknown as string[])}</Text>
                    </View>

                    <View style={s.todayRow}>
                        <Text style={s.todayLabel}>TODAY</Text>
                        <Text style={s.todayDate}>{formatDateLabel(today, t.days as unknown as string[], t.months as unknown as string[])}</Text>
                    </View>

                    {/* Hero event (first today) */}
                    {heroEvent ? (() => {
                        const loc = heroEvent.locales?.en ?? heroEvent.locales?.fr ?? {};
                        return (
                            <Pressable style={s.heroCard} onPress={() => router.push(`/event/${heroEvent.id}` as any)}>
                                {loc.posterUrl ?? loc.imageUrl ? (
                                    <Image source={{ uri: loc.posterUrl ?? loc.imageUrl }} style={s.heroImage} resizeMode="cover" />
                                ) : (
                                    <View style={[s.heroImage, { backgroundColor: "#2a2a2a" }]} />
                                )}
                                <View style={s.heroBody}>
                                    <View style={s.metaRow}>
                                        {isLive(heroEvent.startAt, heroEvent.endAt, now)
                                            ? <View style={s.liveBadge}><Text style={s.liveBadgeText}>● LIVE</Text></View>
                                            : <View style={s.rsvpdBadge}><Text style={s.rsvpdText}>{t.youreGoingBtn}</Text></View>
                                        }
                                        {heroEvent.startAt && <Text style={s.eventTime}>{formatTime(heroEvent.startAt)}</Text>}
                                    </View>
                                    {!!heroEvent.club?.clubName && (
                                        <Text style={s.cardClubName}>{heroEvent.club.clubName.toUpperCase()}</Text>
                                    )}
                                    <Text style={s.heroTitle}>{(loc.title ?? "").toUpperCase()}</Text>
                                    {!isLive(heroEvent.startAt, heroEvent.endAt, now) && heroEvent.startAt && !!countdownText(heroEvent.startAt, now) && (
                                        <Text style={s.countdownText}>{countdownText(heroEvent.startAt, now)}</Text>
                                    )}
                                    {!!loc.body && <Text style={s.heroDesc} numberOfLines={2}>{loc.body}</Text>}
                                    {!!heroEvent.locationName && (
                                        <View style={s.locationRow}>
                                            <Ionicons name="location-outline" size={12} color={C.textMuted} />
                                            <Text style={s.locationText}>{heroEvent.locationName.toUpperCase()}</Text>
                                        </View>
                                    )}
                                    <DirectionsBtn location={heroEvent.locationName} />
                                </View>
                            </Pressable>
                        );
                    })() : (
                        <View style={s.emptyToday}>
                            <Text style={s.emptyTodayText}>{t.noEvents.toUpperCase()}</Text>
                        </View>
                    )}

                    {/* Rest of today's events */}
                    {restTodayEvents.map((event) => {
                        const loc = event.locales?.en ?? event.locales?.fr ?? {};
                        const live = isLive(event.startAt, event.endAt, now);
                        const conflict = hasConflict(event, rsvps);
                        const cdText = !live && event.startAt ? countdownText(event.startAt, now) : null;
                        return (
                            <Pressable key={event.id} style={s.compactRow} onPress={() => router.push(`/event/${event.id}` as any)}>
                                <View style={s.compactLeft}>
                                    <View style={s.metaRow}>
                                        {live
                                            ? <View style={s.liveBadge}><Text style={s.liveBadgeText}>● LIVE</Text></View>
                                            : <View style={s.rsvpdBadge}><Text style={s.rsvpdText}>{t.youreGoingBtn}</Text></View>
                                        }
                                        {conflict && (
                                            <View style={s.conflictBadge}>
                                                <Ionicons name="warning" size={10} color="#F59E0B" />
                                                <Text style={s.conflictText}>{t.conflictBadge}</Text>
                                            </View>
                                        )}
                                        {event.startAt && (
                                            <Text style={s.eventTime}>
                                                {formatTime(event.startAt)}{event.endAt ? ` — ${formatTime(event.endAt)}` : ""}
                                            </Text>
                                        )}
                                    </View>
                                    {!!cdText && <Text style={s.countdownText}>{cdText}</Text>}
                                    <Text style={s.compactTitle} numberOfLines={2}>{loc.title ?? ""}</Text>
                                    <Text style={s.compactSub}>
                                        {[event.club?.clubName, event.locationName?.toUpperCase()].filter(Boolean).join(" · ")}
                                    </Text>
                                    <DirectionsBtn location={event.locationName} />
                                </View>
                                {loc.posterUrl ?? loc.imageUrl
                                    ? <Image source={{ uri: loc.posterUrl ?? loc.imageUrl }} style={s.thumb} resizeMode="cover" />
                                    : <View style={[s.thumb, { backgroundColor: C.skeleton }]} />}
                            </Pressable>
                        );
                    })}

                    {/* Upcoming RSVPs */}
                    {upcomingRsvps.length > 0 && (
                        <>
                            <Text style={s.upcomingSep}>{t.upcomingEvents}</Text>
                            {(showAllUpcoming ? upcomingRsvps : upcomingRsvps.slice(0, 5)).map((event) => {
                                const loc = event.locales?.en ?? event.locales?.fr ?? {};
                                const d = new Date(event.startAt!);
                                const conflict = hasConflict(event, rsvps);
                                return (
                                    <Pressable key={event.id} style={s.upcomingRow} onPress={() => router.push(`/event/${event.id}` as any)}>
                                        <View style={s.upcomingDateCol}>
                                            <Text style={s.upcomingDayName}>{(t.days as unknown as string[])[d.getDay()]}</Text>
                                            <Text style={s.upcomingDayNum}>{d.getDate()}</Text>
                                        </View>
                                        <View style={s.compactLeft}>
                                            <View style={s.metaRow}>
                                                <View style={s.rsvpdBadge}><Text style={s.rsvpdText}>{t.youreGoingBtn}</Text></View>
                                                {conflict && (
                                            <View style={s.conflictBadge}>
                                                <Ionicons name="warning" size={10} color="#F59E0B" />
                                                <Text style={s.conflictText}>{t.conflictBadge}</Text>
                                            </View>
                                        )}
                                                {event.startAt && <Text style={s.eventTime}>{formatTime(event.startAt)}</Text>}
                                            </View>
                                            <Text style={s.compactTitle} numberOfLines={1}>{loc.title ?? ""}</Text>
                                            <Text style={s.compactSub}>
                                                {[event.club?.clubName, event.locationName?.toUpperCase()].filter(Boolean).join(" · ")}
                                            </Text>
                                            <DirectionsBtn location={event.locationName} />
                                        </View>
                                        {loc.posterUrl ?? loc.imageUrl
                                            ? <Image source={{ uri: loc.posterUrl ?? loc.imageUrl }} style={s.thumb} resizeMode="cover" />
                                            : <View style={[s.thumb, { backgroundColor: C.skeleton }]} />}
                                    </Pressable>
                                );
                            })}
                        </>
                    )}

                    {upcomingRsvps.length > 5 && (
                        <Pressable style={s.showMoreBtn} onPress={() => setShowAllUpcoming((v) => !v)}>
                            <Text style={s.showMoreText}>
                                {showAllUpcoming ? t.showLess : t.moreItems(upcomingRsvps.length - 5)}
                            </Text>
                        </Pressable>
                    )}

                    <Pressable style={s.calendarBtn} onPress={() => router.push("/all-events-modal" as any)}>
                        <Text style={s.calendarBtnText}>{t.viewAll}</Text>
                    </Pressable>
                </View>

                {/* ── Past Events Archive (RSVP'd / Attended) ── */}
                {(pastRsvps.length > 0 || attended.length > 0) && (
                    <View style={s.archiveCard}>
                        <Pressable style={s.archiveHeader} onPress={() => setArchiveOpen((v) => !v)}>
                            <View>
                                <Text style={s.archiveLabel}>{t.activity.toUpperCase()}</Text>
                                <Text style={s.archiveTitle}>{t.archiveTitle}</Text>
                            </View>
                            <View style={s.archiveRight}>
                                <Text style={s.archiveCount}>{archiveMode === "attended" ? attended.length : pastRsvps.length}</Text>
                                <Ionicons
                                    name={archiveOpen ? "chevron-up" : "chevron-down"}
                                    size={16}
                                    color={C.textLight}
                                />
                            </View>
                        </Pressable>

                        {archiveOpen && (
                            <>
                                <View style={s.archiveToggleRow}>
                                    {(["rsvpd", "attended"] as const).map((m) => (
                                        <Pressable
                                            key={m}
                                            onPress={() => setArchiveMode(m)}
                                            style={[s.archiveToggle, archiveMode === m && s.archiveToggleActive]}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected: archiveMode === m }}
                                            accessibilityLabel={m === "rsvpd" ? t.archiveRsvpd : t.archiveAttended}
                                        >
                                            <Text style={[s.archiveToggleText, archiveMode === m && s.archiveToggleTextActive]} maxFontSizeMultiplier={1.3}>
                                                {m === "rsvpd" ? t.archiveRsvpd : t.archiveAttended}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>

                                {(() => {
                                    const items = archiveMode === "attended"
                                        ? attended.map((e) => ({ id: e.id, title: e.title, club: e.clubName, date: new Date(e.startAt ?? e.checkedAt), img: undefined as string | undefined, loc: undefined as string | undefined }))
                                        : pastRsvps.map((e) => {
                                            const l = e.locales?.en ?? e.locales?.fr ?? {};
                                            return { id: e.id, title: l.title ?? "", club: e.club?.clubName, date: new Date(e.startAt!), img: (l.posterUrl ?? l.imageUrl) as string | undefined, loc: e.locationName as string | undefined };
                                        });
                                    if (items.length === 0) {
                                        return <Text style={s.archiveEmpty}>{archiveMode === "attended" ? t.archiveAttendedEmpty : t.archiveRsvpdEmpty}</Text>;
                                    }
                                    return items.map((it) => (
                                        <Pressable key={it.id} style={s.archiveRow} onPress={() => router.push(`/event/${it.id}` as any)}>
                                            <View style={s.upcomingDateCol}>
                                                <Text style={s.upcomingDayName}>{(t.days as unknown as string[])[it.date.getDay()]}</Text>
                                                <Text style={[s.upcomingDayNum, { color: C.textLight }]}>{it.date.getDate()}</Text>
                                            </View>
                                            <View style={s.compactLeft}>
                                                <View style={s.metaRow}>
                                                    <View style={s.attendedBadge}>
                                                        <Text style={s.attendedText}>{archiveMode === "attended" ? t.archiveAttended : t.archiveRsvpd}</Text>
                                                    </View>
                                                    <Text style={s.eventTime}>
                                                        {(t.months as unknown as string[])[it.date.getMonth()]} {it.date.getFullYear()}
                                                    </Text>
                                                </View>
                                                <Text style={[s.compactTitle, { color: C.textMuted }]} numberOfLines={1}>{it.title}</Text>
                                                <Text style={s.compactSub}>{[it.club, it.loc?.toUpperCase()].filter(Boolean).join(" · ")}</Text>
                                            </View>
                                            {it.img
                                                ? <Image source={{ uri: it.img }} style={[s.thumb, s.thumbMuted]} resizeMode="cover" />
                                                : <View style={[s.thumb, { backgroundColor: C.skeleton }]} />}
                                        </Pressable>
                                    ));
                                })()}
                            </>
                        )}
                    </View>
                )}

                {/* ── Recommended ── */}
                <View style={s.recCard}>
                    <Text style={s.forYouLabel}>{t.recommended.toUpperCase()}</Text>
                    <Text style={s.recHeading}>{t.happeningSoon}</Text>

                    {/* Category filter pills */}
                    {categories.length > 0 && (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={s.catPillsRow}
                        >
                            <Pressable
                                style={[s.catPill, !categoryFilter && s.catPillActive]}
                                onPress={() => setCategoryFilter(null)}
                            >
                                <Text style={[s.catPillText, !categoryFilter && s.catPillTextActive]}>{t.filterAll}</Text>
                            </Pressable>
                            {categories.map((cat) => (
                                <Pressable
                                    key={cat}
                                    style={[s.catPill, categoryFilter === cat && s.catPillActive]}
                                    onPress={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                                >
                                    <Text style={[s.catPillText, categoryFilter === cat && s.catPillTextActive]}>
                                        {cat.toUpperCase()}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    )}

                    {recommended.length === 0 ? (
                        <View style={s.emptyToday}>
                            <Text style={s.emptyTodayText}>{t.noEvents.toUpperCase()}</Text>
                        </View>
                    ) : (
                        <>
                            {(showAllRec ? recommended : recommended.slice(0, 3)).map((event) => {
                                const loc = event.locales?.en ?? event.locales?.fr ?? {};
                                const dayLabel = event.startAt
                                    ? new Date(event.startAt).toLocaleDateString("en-CA", { weekday: "long" }).toUpperCase()
                                    : "";
                                const conflict = hasConflict(event, rsvps);
                                return (
                                    <Pressable key={event.id} style={s.recRow} onPress={() => router.push(`/event/${event.id}` as any)}>
                                        <View style={s.recLeft}>
                                            {!!event.club?.clubName && (
                                                <Text style={s.cardClubName}>{event.club.clubName.toUpperCase()}</Text>
                                            )}
                                            <Text style={s.recTitle} numberOfLines={2}>{(loc.title ?? "").toUpperCase()}</Text>
                                            {!!loc.body && <Text style={s.recDesc} numberOfLines={2}>{loc.body}</Text>}
                                            <View style={s.recMeta}>
                                                {conflict && (
                                                    <View style={s.conflictBadge}>
                                                        <Ionicons name="warning" size={10} color="#F59E0B" />
                                                        <Text style={s.conflictText}>{t.conflictBadge}</Text>
                                                    </View>
                                                )}
                                                {!!dayLabel && <Text style={s.recDate}>{dayLabel}</Text>}
                                                {event._count.rsvps > 0 && (
                                                    <Text style={s.recDate}>{event._count.rsvps} going</Text>
                                                )}
                                            </View>
                                        </View>
                                        <Pressable onPress={() => handleRsvp(event)}>
                                            <Text style={[s.detailsBtn, isRsvped(event.id) && s.detailsBtnGoing]}>
                                                {isRsvped(event.id) ? t.goingBtn : t.rsvpBtn}
                                            </Text>
                                        </Pressable>
                                    </Pressable>
                                );
                            })}

                            {!showAllRec && recommended[3] && (() => {
                                const event = recommended[3];
                                const loc = event.locales?.en ?? event.locales?.fr ?? {};
                                const conflict = hasConflict(event, rsvps);
                                return (
                                    <Pressable style={s.featuredCard} onPress={() => router.push(`/event/${event.id}` as any)}>
                                        {!!(loc.posterUrl ?? loc.imageUrl) && (
                                            <Image source={{ uri: loc.posterUrl ?? loc.imageUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                                        )}
                                        <View style={s.featuredOverlay} />
                                        <View style={s.featuredContent}>
                                            {conflict && (
                                                <View style={[s.conflictBadge, { alignSelf: "flex-start", marginBottom: 6 }]}>
                                                    <Ionicons name="warning" size={10} color="#F59E0B" />
                                                    <Text style={s.conflictText}>{t.conflictBadge}</Text>
                                                </View>
                                            )}
                                            <Text style={s.featuredTitle}>{(loc.title ?? "").toUpperCase()}</Text>
                                            {!!event.club?.clubName && (
                                                <Text style={s.featuredSub}>{event.club.clubName.toUpperCase()}</Text>
                                            )}
                                            <Pressable style={s.reserveBtn} onPress={() => handleRsvp(event)}>
                                                <Text style={s.reserveBtnText}>
                                                    {isRsvped(event.id) ? t.youreGoingBtn : t.reserveSpot}
                                                </Text>
                                            </Pressable>
                                        </View>
                                    </Pressable>
                                );
                            })()}
                        </>
                    )}

                    {recommended.length > 3 && (
                        <Pressable style={s.seeAllBtn} onPress={() => setShowAllRec((v) => !v)}>
                            <Text style={s.seeAllText}>{showAllRec ? t.showLess : t.seeAllRec(recommended.length)}</Text>
                        </Pressable>
                    )}

                    {showAllRec && hasMore && (
                        <Pressable
                            style={[s.seeAllBtn, loadingMore && { opacity: 0.5 }]}
                            onPress={loadMoreEvents}
                            disabled={loadingMore}
                        >
                            {loadingMore
                                ? <ActivityIndicator color={C.primary} size="small" />
                                : <Text style={s.seeAllText}>LOAD MORE</Text>
                            }
                        </Pressable>
                    )}
                </View>

            </ScrollView>
            {/* ── RSVP Search Modal ── */}
            <ModalScreen visible={searchVisible} onClose={() => setSearchVisible(false)} title={t.mySchedule} scroll={false}>
                        <View style={s.searchInputWrap}>
                            <Ionicons name="search-outline" size={16} color={C.textLight} />
                            <TextInput
                                style={s.searchInput}
                                placeholder={t.searchEventsPlaceholder}
                                placeholderTextColor={C.textLight}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoFocus
                            />
                        </View>
                        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                            {rsvps
                                .filter((e) => {
                                    const loc = e.locales?.en ?? e.locales?.fr ?? {};
                                    return (loc.title ?? "").toLowerCase().includes(searchQuery.toLowerCase());
                                })
                                .map((event) => {
                                    const loc = event.locales?.en ?? event.locales?.fr ?? {};
                                    return (
                                        <Pressable
                                            key={event.id}
                                            style={s.searchRow}
                                            onPress={() => { setSearchVisible(false); router.push(`/event/${event.id}` as any); }}
                                        >
                                            <View style={s.searchRowLeft}>
                                                <Text style={s.searchRowTitle} numberOfLines={1}>{loc.title ?? ""}</Text>
                                                {!!event.startAt && <Text style={s.searchRowSub}>{formatTime(event.startAt)}{event.locationName ? ` · ${event.locationName.toUpperCase()}` : ""}</Text>}
                                            </View>
                                            {!!(loc.posterUrl ?? loc.imageUrl)
                                                ? <Image source={{ uri: loc.posterUrl ?? loc.imageUrl }} style={s.searchThumb} resizeMode="cover" />
                                                : <View style={[s.searchThumb, { backgroundColor: C.skeleton }]} />}
                                        </Pressable>
                                    );
                                })
                            }
                            {rsvps.filter((e) => {
                                const loc = e.locales?.en ?? e.locales?.fr ?? {};
                                return (loc.title ?? "").toLowerCase().includes(searchQuery.toLowerCase());
                            }).length === 0 && (
                                <View style={s.searchEmpty}>
                                    <Text style={s.searchEmptyText}>NO MATCHING EVENTS</Text>
                                    <Pressable onPress={() => setSearchQuery("")} style={{ marginTop: 12, backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 }} accessibilityRole="button" accessibilityLabel="Clear search">
                                        <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff", letterSpacing: 1.5 }}>CLEAR SEARCH</Text>
                                    </Pressable>
                                </View>
                            )}
                        </ScrollView>
            </ModalScreen>
        </SafeAreaView>
    );
}
