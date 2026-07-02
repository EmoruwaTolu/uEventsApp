import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
    View, Text, ScrollView, Pressable, Image, Animated,
    StyleSheet, TextInput, RefreshControl, Linking,
    LayoutAnimation, Platform, UIManager,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Calendar from "expo-calendar";
import { LinearGradient } from "expo-linear-gradient";
import ModalScreen from "../../components/ModalScreen";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../auth/AuthContext";
import { useRsvp } from "../../lib/RsvpContext";
import { useT } from "../../lib/LangContext";
import { useToast } from "../../lib/ToastContext";
import { EventCardSkeleton } from "../../components/SkeletonLoader";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";

const GREEN = "#16A34A";

// LayoutAnimation needs an explicit opt-in on (old-architecture) Android.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Smoothly animate the next layout commit — used when an RSVP moves an event
// between the "Today on Campus" list and "Your Schedule" so rows slide/fade
// into place instead of the page snapping down.
function animateRsvpReflow() {
    LayoutAnimation.configureNext(
        LayoutAnimation.create(280, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
    );
}

// Pressable with a soft scale-bounce + light haptic on tap. Defined at module
// scope so its Animated.Value isn't recreated on every parent render.
function AnimatedPressable({
    onPress, style, wrapperStyle, children, accessibilityLabel,
}: {
    onPress?: () => void;
    style?: any;
    wrapperStyle?: any;
    children?: React.ReactNode;
    accessibilityLabel?: string;
}) {
    const scale = useRef(new Animated.Value(1)).current;
    const handlePress = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        Animated.sequence([
            Animated.timing(scale, { toValue: 0.9, duration: 80, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
        ]).start();
        onPress?.();
    };
    return (
        <Animated.View style={[{ transform: [{ scale }] }, wrapperStyle]}>
            <Pressable style={style} onPress={handlePress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
                {children}
            </Pressable>
        </Animated.View>
    );
}

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

type AttendeePreview = { id: string; firstName?: string | null; avatarUrl?: string | null };

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
    rsvpPreview?: AttendeePreview[];
};

type AttendedEvent = { id: string; title: string; clubName: string; clubLogo?: string | null; imageUrl?: string | null; startAt?: string; checkedAt: string; categories: string[]; rating?: number | null };
type AttendanceResp = { total: number; thisSemester: number; semesterLabel: string; streakWeeks: number; freeMeals: number; events: AttendedEvent[] };

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


// Context-aware status badge for the NEXT UP hero. First match wins:
// live now → soon (minutes) → today (hours / clock time) → tomorrow → date.
function heroBadgeInfo(
    ev: { startAt?: string; endAt?: string },
    now: Date, today: Date, days: string[], months: string[], t: any
): { text: string; live: boolean } {
    if (!ev.startAt) return { text: t.todayBadge, live: false };
    const start = new Date(ev.startAt);
    const end = ev.endAt ? new Date(ev.endAt) : new Date(start.getTime() + 2 * 3600000);

    if (now >= start && now <= end) return { text: t.happeningNow, live: true };

    const diffMs = start.getTime() - now.getTime();
    if (diffMs <= 0) return { text: t.todayBadge, live: false };

    const mins = Math.ceil(diffMs / 60000);
    if (mins < 60) return { text: t.startsInM(mins), live: false };

    if (isSameDay(start, today)) {
        const hrs = Math.round(mins / 60);
        return hrs <= 4
            ? { text: t.startsInH(hrs), live: false }
            : { text: `${t.todayBadge} · ${formatTime(ev.startAt)}`, live: false };
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (isSameDay(start, tomorrow)) return { text: t.tomorrowBadge, live: false };

    return { text: `${days[start.getDay()]} · ${months[start.getMonth()]} ${start.getDate()}`, live: false };
}

// Gently pulsing dot for the live "HAPPENING NOW" badge.
function LiveDot() {
    const pulse = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [pulse]);
    return <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff", opacity: pulse }} />;
}

const makeEventsStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },

    // ── Page header ──
    pageHeader: {
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 6,
    },
    kicker: {
        fontSize: 11,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
        marginBottom: 2,
    },
    headerTopRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    bigTitle: {
        fontSize: 38,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -1,
    },

    // ── Stats row ──
    statsRow: {
        flexDirection: "row",
        gap: 10,
        paddingHorizontal: 20,
        marginTop: 10,
    },
    statCard: {
        flex: 1,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.borderWarm,
        paddingVertical: 16,
        paddingHorizontal: 12,
    },
    statEmoji: { fontSize: 20, marginBottom: 8 },
    statValueRow: { flexDirection: "row", alignItems: "baseline", gap: 3 },
    statNum: { fontSize: 26, fontWeight: "900", color: C.text, letterSpacing: -1 },
    statUnit: { fontSize: 11, fontWeight: "700", color: C.textLight },
    statLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: C.textMuted,
        letterSpacing: 1,
        marginTop: 6,
    },

    // ── Section header ──
    sectionHead: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        paddingHorizontal: 20,
        marginTop: 26,
        marginBottom: 12,
    },
    sectionHeadLabel: {
        fontSize: 11,
        fontWeight: "800",
        color: C.textMuted,
        letterSpacing: 2,
    },
    sectionHeadRight: {
        fontSize: 11,
        fontWeight: "600",
        color: C.textLight,
        letterSpacing: 0.3,
    },

    // ── NEXT UP hero (immersive full-bleed) ──
    heroCard: {
        marginHorizontal: 16,
        height: 440,
        backgroundColor: "#1f1f1f",
        overflow: "hidden",
    },
    heroImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
    heroBadge: {
        position: "absolute",
        top: 16,
        left: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: C.primary,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    heroBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1.2 },

    heroOverlayContent: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, gap: 10 },
    heroAttendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    avatarsRow: { flexDirection: "row" },
    avatarMini: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.9)",
    },
    avatarMiniText: { fontSize: 11, fontWeight: "800", color: "#fff" },
    heroAttendText: { flex: 1, fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.9)" },

    heroTitle: { fontSize: 28, fontWeight: "900", color: "#fff", letterSpacing: -0.6, lineHeight: 32 },
    heroClub: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.8)" },
    heroMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 16, marginTop: 2 },
    heroMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
    heroMetaText: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.9)" },

    heroActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
    goingPill: {
        flex: 1,
        backgroundColor: GREEN,
        paddingVertical: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
    },
    goingPillText: { fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 1 },
    heroQuickBtn: {
        width: 48,
        height: 48,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.18)",
    },

    // ── Schedule rows ──
    schedRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        marginHorizontal: 16,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: C.borderWarm,
    },
    schedThumbWrap: { width: 72, height: 72, backgroundColor: C.skeleton, overflow: "hidden" },
    schedThumb: { width: "100%", height: "100%" },
    schedDateTag: {
        position: "absolute",
        top: 0,
        left: 0,
        backgroundColor: C.primary,
        paddingHorizontal: 8,
        paddingVertical: 4,
        alignItems: "center",
    },
    schedDateDay: { fontSize: 8, fontWeight: "800", color: "#fff", letterSpacing: 1 },
    schedDateNum: { fontSize: 15, fontWeight: "900", color: "#fff", lineHeight: 17 },
    schedBody: { flex: 1, gap: 4 },
    schedTitle: { fontSize: 16, fontWeight: "800", color: C.text, letterSpacing: -0.3 },
    schedSub: { fontSize: 12, fontWeight: "500", color: C.textMuted },
    goingBadge: {
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: GREEN,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginTop: 2,
    },
    goingBadgeText: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 0.8 },

    // ── Free food banner ──
    foodBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginHorizontal: 16,
        marginTop: 18,
        backgroundColor: C.primary,
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    foodBannerEmoji: { fontSize: 24 },
    foodBannerBody: { flex: 1 },
    foodBannerTitle: { fontSize: 15, fontWeight: "800", color: "#fff" },
    foodBannerSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
    foodViewBtn: { borderWidth: 1.5, borderColor: "rgba(255,255,255,0.8)", paddingHorizontal: 16, paddingVertical: 8 },
    foodViewBtnText: { fontSize: 11, fontWeight: "800", color: "#fff", letterSpacing: 1 },

    // ── Today on campus rows ──
    campusRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        marginHorizontal: 16,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: C.borderWarm,
    },
    campusThumb: { width: 56, height: 56, backgroundColor: C.skeleton },
    campusBody: { flex: 1, gap: 3 },
    campusTitle: { fontSize: 15, fontWeight: "800", color: C.text, letterSpacing: -0.2 },
    campusSub: { fontSize: 12, fontWeight: "500", color: C.textMuted },
    rsvpOutline: { borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 16, paddingVertical: 9 },
    rsvpOutlineGoing: { borderColor: GREEN, backgroundColor: GREEN },
    rsvpOutlineText: { fontSize: 11, fontWeight: "800", color: C.primary, letterSpacing: 1 },
    rsvpOutlineTextGoing: { color: "#fff" },

    // ── Attended strip ──
    attendedStrip: { paddingLeft: 16, paddingRight: 6, gap: 12 },
    attendedCard: { width: 150, height: 180, backgroundColor: C.skeleton, overflow: "hidden", marginRight: 12 },
    attendedCardImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
    attendedCardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.28)" },
    attendedDateTag: { position: "absolute", top: 0, left: 0, backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 4 },
    attendedDateText: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 1 },
    attendedCardBody: { position: "absolute", left: 12, right: 12, bottom: 12 },
    attendedCardTitle: { fontSize: 14, fontWeight: "900", color: "#fff", letterSpacing: -0.2 },
    starsRow: { flexDirection: "row", gap: 2, marginTop: 4 },

    // ── Category pills (preserved) ──

    // ── Shared / empty ──
    emptyToday: { paddingVertical: 24, alignItems: "center", marginHorizontal: 16 },
    emptyTodayText: { fontSize: 10, fontWeight: "700", color: C.textFaint, letterSpacing: 2 },
    thumb: { width: 62, height: 62 },
    thumbMuted: { opacity: 0.5 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    eventTime: { fontSize: 11, fontWeight: "500", color: C.textMuted },
    compactLeft: { flex: 1, gap: 4 },
    compactTitle: { fontSize: 15, fontWeight: "700", color: C.text, letterSpacing: -0.2 },
    compactSub: { fontSize: 10, fontWeight: "600", color: C.textLight, letterSpacing: 0.5 },
    upcomingDateCol: { width: 28, alignItems: "center", gap: 1 },
    upcomingDayName: { fontSize: 9, fontWeight: "700", color: C.textLight, letterSpacing: 0.5 },
    upcomingDayNum: { fontSize: 20, fontWeight: "800", color: C.text, lineHeight: 24 },

    // ── Past events archive (preserved) ──
    archiveCard: {
        backgroundColor: C.surface,
        marginHorizontal: 16,
        marginTop: 26,
        borderWidth: 1,
        borderColor: C.borderWarm,
    },
    archiveHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 20 },
    archiveLabel: { fontSize: 10, fontWeight: "800", color: C.textLight, letterSpacing: 2, marginBottom: 2 },
    archiveTitle: { fontSize: 20, fontWeight: "900", color: C.text, letterSpacing: -0.5 },
    archiveRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    archiveCount: { fontSize: 13, fontWeight: "700", color: C.textLight },
    archiveRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.borderWarm, gap: 14 },
    attendedBadge: { backgroundColor: C.border, paddingHorizontal: 6, paddingVertical: 3 },
    attendedText: { fontSize: 8, fontWeight: "800", color: C.textMuted, letterSpacing: 1 },
    archiveToggleRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
    archiveToggle: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
    archiveToggleActive: { borderColor: C.primary, backgroundColor: C.primary },
    archiveToggleText: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: C.textMuted },
    archiveToggleTextActive: { color: "#fff" },
    archiveEmpty: { fontSize: 13, color: C.textMuted, paddingHorizontal: 16, paddingBottom: 16 },

    // ── Error state ──
    errorText: { fontSize: 11, fontWeight: "700", color: C.textLight, letterSpacing: 2, marginTop: 12 },
    errorRetry: { marginTop: 16, borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 20, paddingVertical: 10 },
    errorRetryText: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1.5 },

    // ── Search modal (preserved) ──
    searchInputWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 20, marginVertical: 12, backgroundColor: C.surfaceAlt, paddingHorizontal: 12, paddingVertical: 10 },
    searchInput: { flex: 1, fontSize: 14, color: C.text, fontWeight: "500" },
    searchRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.borderWarm, gap: 12 },
    searchRowLeft: { flex: 1, gap: 4 },
    searchRowTitle: { fontSize: 14, fontWeight: "700", color: C.text, letterSpacing: -0.2 },
    searchRowSub: { fontSize: 11, color: C.textLight, fontWeight: "500" },
    searchThumb: { width: 54, height: 54 },
    searchEmpty: { alignItems: "center", paddingVertical: 40 },
    searchEmptyText: { fontSize: 11, fontWeight: "700", color: C.textFaint, letterSpacing: 2 },
});

export default function EventsScreen() {
    const router = useRouter();
    const authApi = useApi();
    const { session, signOut } = useAuth();
    const { isRsvped, toggleRsvp } = useRsvp();
    const { showToast } = useToast();
    const [allEvents, setAllEvents] = useState<ApiEvent[]>([]);
    const [rsvps, setRsvps] = useState<RsvpPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState(false);
    const [searchVisible, setSearchVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [showAllRec, setShowAllRec] = useState(false);
    const [archiveOpen, setArchiveOpen] = useState(false);
    const [attended, setAttended] = useState<AttendedEvent[]>([]);
    const [attendedTotal, setAttendedTotal] = useState(0);
    const [streakWeeks, setStreakWeeks] = useState(0);
    const [freeMeals, setFreeMeals] = useState(0);
    const [archiveMode, setArchiveMode] = useState<"rsvpd" | "attended">("rsvpd");
    const [now, setNow] = useState(() => new Date());

    const { colors: C } = useTheme();
    const s = useMemo(() => makeEventsStyles(C), [C]);

    const today = useMemo(() => new Date(now), [now]);
    const t = useT();
    const days = t.days as unknown as string[];
    const months = t.months as unknown as string[];

    const PAGE = 20;

    async function loadData(isRefresh = false) {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError(false);
        try {
            authApi<AttendanceResp>("/users/me/attendance")
                .then((a) => {
                    setAttended(a.events ?? []);
                    setAttendedTotal(a.total ?? (a.events?.length ?? 0));
                    setStreakWeeks(a.streakWeeks ?? 0);
                    setFreeMeals(a.freeMeals ?? 0);
                })
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
        if (!hasMore) return;
        try {
            const more = await authApi<ApiEvent[]>(`/events?upcoming=true&limit=${PAGE}&offset=${allEvents.length}`);
            setAllEvents((prev) => [...prev, ...more]);
            setHasMore(more.length === PAGE);
        } catch {
            showToast(t.loadMoreError, "error");
        }
    }

    useFocusEffect(useCallback(() => {
        if (!session?.token) return;
        loadData();
    }, [session?.token]));

    // Tick every 30s for live/countdown accuracy
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    const endOfToday = useMemo(() => { const d = new Date(today); d.setHours(23, 59, 59, 999); return d; }, [today]);
    const startOfToday = useMemo(() => { const d = new Date(today); d.setHours(0, 0, 0, 0); return d; }, [today]);

    const todayEvents = useMemo(() =>
        rsvps
            .filter((e) => e.startAt && isSameDay(new Date(e.startAt), today))
            .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime()),
        [rsvps, today]);

    const upcomingRsvps = useMemo(() =>
        rsvps
            .filter((e) => e.startAt && new Date(e.startAt) > endOfToday)
            .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime()),
        [rsvps, endOfToday]);

    const pastRsvps = useMemo(() =>
        rsvps
            .filter((e) => e.startAt && new Date(e.startAt) < startOfToday)
            .sort((a, b) => new Date(b.startAt!).getTime() - new Date(a.startAt!).getTime()),
        [rsvps, startOfToday]);

    const rsvpIds = useMemo(() => new Set(rsvps.map((r) => r.id)), [rsvps]);

    const recommended = useMemo(() =>
        allEvents.filter((e) => !rsvpIds.has(e.id)),
        [allEvents, rsvpIds]);

    const recommendedToday = useMemo(() =>
        recommended.filter((e) => e.startAt && isSameDay(new Date(e.startAt!), today)),
        [recommended, today]);

    // "Today on campus": prefer events happening today, else fall back to the feed.
    const campusList = recommendedToday.length > 0 ? recommendedToday : recommended;

    // Free-food banner: highlight a Food & Drink event today (placeholder association).
    const freeFoodEvent = useMemo(() => {
        const pool = recommendedToday.length > 0 ? recommendedToday : recommended;
        return pool.find((e) => e.club?.category === "Food & Drink") ?? pool[0] ?? null;
    }, [recommendedToday, recommended]);

    // The NEXT UP hero: the first today RSVP that hasn't ended yet (live or
    // upcoming), else the next upcoming RSVP. Finished events are skipped so the
    // hero always looks forward.
    const heroEvent =
        todayEvents.find((e) => !e.endAt || new Date(e.endAt) >= now)
        ?? upcomingRsvps[0] ?? null;

    async function handleRsvp(event: ApiEvent) {
        const next = await toggleRsvp(event.id);
        animateRsvpReflow();
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

    async function cancelRsvpPost(id: string) {
        const next = await toggleRsvp(id);
        if (!next) {
            animateRsvpReflow();
            setRsvps((prev) => prev.filter((r) => r.id !== id));
        }
    }

    // Quick action: add an event the user is going to into their device calendar.
    async function addToCalendar(ev: RsvpPost) {
        if (!ev.startAt) return;
        try {
            const { status } = await Calendar.requestCalendarPermissionsAsync();
            if (status !== "granted") { showToast(t.calendarError, "error"); return; }
            const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
            const writable = cals.find((c) => c.allowsModifications) ?? cals[0];
            if (!writable) { showToast(t.calendarError, "error"); return; }
            const start = new Date(ev.startAt);
            const end = ev.endAt ? new Date(ev.endAt) : new Date(start.getTime() + 2 * 3600000);
            const loc = ev.locales?.en ?? ev.locales?.fr ?? {};
            await Calendar.createEventAsync(writable.id, {
                title: loc.title ?? "Event",
                startDate: start,
                endDate: end,
                location: ev.locationName ?? undefined,
            });
            showToast(t.addedToCalendar);
        } catch {
            showToast(t.calendarError, "error");
        }
    }

    // ── Guest empty state ──
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

    const heroLoc = heroEvent ? (heroEvent.locales?.en ?? heroEvent.locales?.fr ?? {}) : {};
    const heroImg = heroLoc.posterUrl ?? heroLoc.imageUrl;
    const heroBadge = heroEvent
        ? heroBadgeInfo(heroEvent, now, today, days, months, t)
        : { text: "", live: false };
    const heroGoing = heroEvent ? rsvpIds.has(heroEvent.id) : false;
    const avatarColors = [C.primary, "#1F2937", C.gold];

    // Real attendees for the hero "X, Y and N others are going" row (self excluded).
    const myId = session?.userId;
    const heroPreview = (heroEvent?.rsvpPreview ?? []).filter((u) => u.id !== myId);
    const heroGoingCount = heroEvent?._count?.rsvps ?? 0;
    const heroNames = heroPreview.slice(0, 2).map((u) => u.firstName?.trim() || "Someone").join(", ");
    const heroNamedCount = Math.min(heroPreview.length, 2);
    const heroOthers = Math.max((heroGoingCount - (heroGoing ? 1 : 0)) - heroNamedCount, 0);
    const heroGoingLabel =
        heroNamedCount > 0 ? t.friendsGoing(heroNames, heroOthers)
        : heroGoingCount > 1 ? t.peopleGoing(heroGoingCount)
        : t.youreGoingSolo;

    const campusNotGoing = campusList.slice(0, showAllRec ? campusList.length : 4);

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ backgroundColor: C.bg }}
                contentContainerStyle={{ paddingBottom: 90 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={C.primary} />}
            >
                {/* ── Header ── */}
                <View style={s.pageHeader}>
                    <Text style={s.kicker}>{t.myEventsKicker}</Text>
                    <View style={s.headerTopRow}>
                        <Text style={s.bigTitle}>{t.eventsTitle}</Text>
                        <Pressable onPress={() => { setSearchQuery(""); setSearchVisible(true); }} hitSlop={8} accessibilityLabel="Search" accessibilityRole="button">
                            <Ionicons name="search" size={22} color={C.text} />
                        </Pressable>
                    </View>
                </View>

                {/* ── Stats row ── */}
                <View style={s.statsRow}>
                    <View style={s.statCard}>
                        <Text style={s.statEmoji}>🔥</Text>
                        <View style={s.statValueRow}>
                            <Text style={s.statNum}>{streakWeeks}</Text>
                            <Text style={s.statUnit}>{t.weekUnit}</Text>
                        </View>
                        <Text style={s.statLabel}>{t.statStreakLabel}</Text>
                    </View>
                    <View style={s.statCard}>
                        <Text style={s.statEmoji}>🎟️</Text>
                        <View style={s.statValueRow}>
                            <Text style={s.statNum}>{attendedTotal}</Text>
                        </View>
                        <Text style={s.statLabel}>{t.statAttendedLabel}</Text>
                    </View>
                    <View style={s.statCard}>
                        <Text style={s.statEmoji}>🍕</Text>
                        <View style={s.statValueRow}>
                            <Text style={s.statNum}>{freeMeals}</Text>
                        </View>
                        <Text style={s.statLabel}>{t.statFreeMealsLabel}</Text>
                    </View>
                </View>

                {/* ── NEXT UP ── */}
                {heroEvent && (
                    <>
                        <View style={s.sectionHead}>
                            <Text style={s.sectionHeadLabel}>{t.nextUp}</Text>
                        </View>

                        <View style={s.heroCard}>
                            {/* Full-bleed image + gradient — tapping the photo opens the event */}
                            <Pressable style={StyleSheet.absoluteFill as any} onPress={() => router.push(`/event/${heroEvent.id}` as any)} accessibilityLabel={heroLoc.title ?? "Event"} accessibilityRole="button">
                                {heroImg
                                    ? <Image source={{ uri: heroImg }} style={s.heroImage} resizeMode="cover" />
                                    : <View style={[s.heroImage, { backgroundColor: "#2a2a2a" }]} />}
                                <LinearGradient
                                    colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.92)"]}
                                    locations={[0, 0.45, 1]}
                                    style={StyleSheet.absoluteFill as any}
                                />
                            </Pressable>

                            <View style={s.heroBadge}>
                                {heroBadge.live && <LiveDot />}
                                <Text style={s.heroBadgeText}>{heroBadge.text.toUpperCase()}</Text>
                            </View>

                            {/* Overlaid content — box-none lets taps on empty areas reach the photo */}
                            <View style={s.heroOverlayContent} pointerEvents="box-none">
                                {/* Attendees / going status */}
                                {heroPreview.length > 0 ? (
                                    <View style={s.heroAttendRow}>
                                        <View style={s.avatarsRow}>
                                            {heroPreview.slice(0, 3).map((u, i) => (
                                                u.avatarUrl ? (
                                                    <Image
                                                        key={u.id}
                                                        source={{ uri: u.avatarUrl }}
                                                        style={[s.avatarMini, { marginLeft: i === 0 ? 0 : -8 }]}
                                                    />
                                                ) : (
                                                    <View
                                                        key={u.id}
                                                        style={[s.avatarMini, { backgroundColor: avatarColors[i % avatarColors.length], marginLeft: i === 0 ? 0 : -8 }]}
                                                    >
                                                        <Text style={s.avatarMiniText}>{(u.firstName?.[0] ?? "?").toUpperCase()}</Text>
                                                    </View>
                                                )
                                            ))}
                                        </View>
                                        <Text style={s.heroAttendText} numberOfLines={1}>{heroGoingLabel}</Text>
                                    </View>
                                ) : heroGoingCount > 1 ? (
                                    <Text style={s.heroAttendText} numberOfLines={1}>{t.peopleGoing(heroGoingCount)}</Text>
                                ) : null}

                                {/* Title + club */}
                                <Text style={s.heroTitle} numberOfLines={2}>{heroLoc.title ?? ""}</Text>
                                {!!heroEvent.club?.clubName && (
                                    <Text style={s.heroClub}>{heroEvent.club.clubName}</Text>
                                )}

                                {/* Meta */}
                                <View style={s.heroMetaRow}>
                                    {!!heroEvent.startAt && (
                                        <View style={s.heroMetaItem}>
                                            <Ionicons name="time-outline" size={15} color="rgba(255,255,255,0.9)" />
                                            <Text style={s.heroMetaText}>{formatTime(heroEvent.startAt)}</Text>
                                        </View>
                                    )}
                                    {!!heroEvent.locationName && (
                                        <View style={s.heroMetaItem}>
                                            <Ionicons name="location-outline" size={15} color="rgba(255,255,255,0.9)" />
                                            <Text style={s.heroMetaText} numberOfLines={1}>{heroEvent.locationName}</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Actions: GOING toggle + quick actions */}
                                <View style={s.heroActions}>
                                    <AnimatedPressable
                                        wrapperStyle={{ flex: 1 }}
                                        style={s.goingPill}
                                        onPress={() => cancelRsvpPost(heroEvent.id)}
                                        accessibilityLabel={heroGoing ? t.goingBtn : t.rsvpBtn}
                                    >
                                        <Text style={s.goingPillText}>{heroGoing ? t.goingBtn : t.rsvpBtn}</Text>
                                        {heroGoing && <Ionicons name="checkmark" size={14} color="#fff" />}
                                    </AnimatedPressable>
                                    {!!heroEvent.locationName && (
                                        <AnimatedPressable
                                            style={s.heroQuickBtn}
                                            onPress={() => openMaps(heroEvent.locationName)}
                                            accessibilityLabel={t.getDirections}
                                        >
                                            <Ionicons name="navigate-outline" size={20} color="#fff" />
                                        </AnimatedPressable>
                                    )}
                                    {!!heroEvent.startAt && (
                                        <AnimatedPressable
                                            style={s.heroQuickBtn}
                                            onPress={() => addToCalendar(heroEvent)}
                                            accessibilityLabel={t.addToCalendar}
                                        >
                                            <Ionicons name="calendar-outline" size={20} color="#fff" />
                                        </AnimatedPressable>
                                    )}
                                </View>
                            </View>
                        </View>
                    </>
                )}

                {/* ── YOUR SCHEDULE ── */}
                <View style={s.sectionHead}>
                    <Text style={s.sectionHeadLabel}>{t.yourScheduleSection}</Text>
                    <Text style={s.sectionHeadRight}>{t.upcomingCount(upcomingRsvps.length)}</Text>
                </View>

                {upcomingRsvps.length === 0 ? (
                    <View style={s.emptyToday}><Text style={s.emptyTodayText}>{t.noRsvps.toUpperCase()}</Text></View>
                ) : (
                    upcomingRsvps.map((event) => {
                        const loc = event.locales?.en ?? event.locales?.fr ?? {};
                        const img = loc.posterUrl ?? loc.imageUrl;
                        const d = new Date(event.startAt!);
                        const sub = [event.club?.clubName, event.startAt ? formatTime(event.startAt) : null, event.locationName]
                            .filter(Boolean).join(" · ");
                        return (
                            <Pressable key={event.id} style={s.schedRow} onPress={() => router.push(`/event/${event.id}` as any)}>
                                <View style={s.schedThumbWrap}>
                                    {img
                                        ? <Image source={{ uri: img }} style={s.schedThumb} resizeMode="cover" />
                                        : <View style={[s.schedThumb, { backgroundColor: C.skeleton }]} />}
                                    <View style={s.schedDateTag}>
                                        <Text style={s.schedDateDay}>{days[d.getDay()]}</Text>
                                        <Text style={s.schedDateNum}>{d.getDate()}</Text>
                                    </View>
                                </View>
                                <View style={s.schedBody}>
                                    <Text style={s.schedTitle} numberOfLines={1}>{loc.title ?? ""}</Text>
                                    <Text style={s.schedSub} numberOfLines={1}>{sub}</Text>
                                    <View style={s.goingBadge}>
                                        <Text style={s.goingBadgeText}>{t.goingBtn}</Text>
                                        <Ionicons name="checkmark" size={10} color="#fff" />
                                    </View>
                                </View>
                            </Pressable>
                        );
                    })
                )}

                {/* ── Free food banner ── */}
                {freeFoodEvent && (() => {
                    const loc = freeFoodEvent.locales?.en ?? freeFoodEvent.locales?.fr ?? {};
                    const sub = [loc.title, freeFoodEvent.club?.clubName, freeFoodEvent.startAt ? formatTime(freeFoodEvent.startAt) : null]
                        .filter(Boolean).join(" · ");
                    return (
                        <View style={s.foodBanner}>
                            <Text style={s.foodBannerEmoji}>🍕</Text>
                            <View style={s.foodBannerBody}>
                                <Text style={s.foodBannerTitle}>{t.freeFoodToday}</Text>
                                <Text style={s.foodBannerSub} numberOfLines={1}>{sub}</Text>
                            </View>
                            <Pressable style={s.foodViewBtn} onPress={() => router.push(`/event/${freeFoodEvent.id}` as any)}>
                                <Text style={s.foodViewBtnText}>{t.viewBtn}</Text>
                            </Pressable>
                        </View>
                    );
                })()}

                {/* ── TODAY ON CAMPUS ── */}
                <View style={s.sectionHead}>
                    <Text style={s.sectionHeadLabel}>{t.todayOnCampus}</Text>
                    <Text style={s.sectionHeadRight}>{t.notGoingYet(campusList.length)}</Text>
                </View>

                {campusNotGoing.length === 0 ? (
                    <View style={s.emptyToday}><Text style={s.emptyTodayText}>{t.noEvents.toUpperCase()}</Text></View>
                ) : (
                    campusNotGoing.map((event) => {
                        const loc = event.locales?.en ?? event.locales?.fr ?? {};
                        const img = loc.posterUrl ?? loc.imageUrl;
                        const going = isRsvped(event.id);
                        const sub = [event.club?.clubName, event.locationName, event.startAt ? formatTime(event.startAt) : null]
                            .filter(Boolean).join(" · ");
                        return (
                            <Pressable key={event.id} style={s.campusRow} onPress={() => router.push(`/event/${event.id}` as any)}>
                                {img
                                    ? <Image source={{ uri: img }} style={s.campusThumb} resizeMode="cover" />
                                    : <View style={[s.campusThumb, { backgroundColor: C.skeleton }]} />}
                                <View style={s.campusBody}>
                                    <Text style={s.campusTitle} numberOfLines={1}>{loc.title ?? ""}</Text>
                                    <Text style={s.campusSub} numberOfLines={2}>{sub}</Text>
                                </View>
                                <AnimatedPressable
                                    style={[s.rsvpOutline, going && s.rsvpOutlineGoing]}
                                    onPress={() => handleRsvp(event)}
                                    accessibilityLabel={going ? t.goingBtn : t.rsvpBtn}
                                >
                                    <Text style={[s.rsvpOutlineText, going && s.rsvpOutlineTextGoing]}>
                                        {going ? t.goingBtn : t.rsvpBtn}
                                    </Text>
                                </AnimatedPressable>
                            </Pressable>
                        );
                    })
                )}

                {campusList.length > 4 && (
                    <Pressable style={[s.rsvpOutline, { marginHorizontal: 16, marginTop: 14, alignItems: "center" }]} onPress={() => { setShowAllRec((v) => !v); if (!showAllRec) loadMoreEvents(); }}>
                        <Text style={s.rsvpOutlineText}>{showAllRec ? t.showLess : t.seeAllRec(campusList.length)}</Text>
                    </Pressable>
                )}

                {/* ── ATTENDED ── */}
                {attended.length > 0 && (
                    <>
                        <View style={s.sectionHead}>
                            <Text style={s.sectionHeadLabel}>{t.attendedSection}</Text>
                            <Text style={s.sectionHeadRight}>{t.tapToReview}</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.attendedStrip}>
                            {attended.map((ev) => {
                                const d = new Date(ev.startAt ?? ev.checkedAt);
                                const img = ev.imageUrl ?? ev.clubLogo;
                                const rating = ev.rating ?? 0; // 0 = not yet reviewed
                                return (
                                    <Pressable key={ev.id} style={s.attendedCard} onPress={() => router.push(`/event/${ev.id}` as any)}>
                                        {img
                                            ? <Image source={{ uri: img }} style={s.attendedCardImg} resizeMode="cover" />
                                            : <View style={[s.attendedCardImg, { backgroundColor: "#3a3a3a" }]} />}
                                        <View style={s.attendedCardOverlay} />
                                        <View style={s.attendedDateTag}>
                                            <Text style={s.attendedDateText}>{months[d.getMonth()]} {d.getDate()}</Text>
                                        </View>
                                        <View style={s.attendedCardBody}>
                                            <Text style={s.attendedCardTitle} numberOfLines={2}>{ev.title}</Text>
                                            <View style={s.starsRow}>
                                                {[0, 1, 2, 3, 4].map((i) => (
                                                    <Ionicons key={i} name={i < rating ? "star" : "star-outline"} size={12} color={C.gold} />
                                                ))}
                                            </View>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </>
                )}

                {/* ── Past events archive (preserved) ── */}
                {(pastRsvps.length > 0 || attended.length > 0) && (
                    <View style={s.archiveCard}>
                        <Pressable style={s.archiveHeader} onPress={() => setArchiveOpen((v) => !v)}>
                            <View>
                                <Text style={s.archiveLabel}>{t.activity.toUpperCase()}</Text>
                                <Text style={s.archiveTitle}>{t.archiveTitle}</Text>
                            </View>
                            <View style={s.archiveRight}>
                                <Text style={s.archiveCount}>{archiveMode === "attended" ? attended.length : pastRsvps.length}</Text>
                                <Ionicons name={archiveOpen ? "chevron-up" : "chevron-down"} size={16} color={C.textLight} />
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
                                                <Text style={s.upcomingDayName}>{days[it.date.getDay()]}</Text>
                                                <Text style={[s.upcomingDayNum, { color: C.textLight }]}>{it.date.getDate()}</Text>
                                            </View>
                                            <View style={s.compactLeft}>
                                                <View style={s.metaRow}>
                                                    <View style={s.attendedBadge}>
                                                        <Text style={s.attendedText}>{archiveMode === "attended" ? t.archiveAttended : t.archiveRsvpd}</Text>
                                                    </View>
                                                    <Text style={s.eventTime}>{months[it.date.getMonth()]} {it.date.getFullYear()}</Text>
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
            </ScrollView>

            {/* ── RSVP Search Modal (preserved) ── */}
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
