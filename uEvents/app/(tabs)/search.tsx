import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    View, Text, ScrollView, Pressable, Image, StyleSheet, useWindowDimensions, Animated, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../auth/AuthContext";
import { useRsvp } from "../../lib/RsvpContext";
import { useLang, pickLocale } from "../../lib/LangContext";
import { useTheme } from "../../lib/ThemeContext";
import { useT } from "../../lib/LangContext";
import type { AppColors } from "../../styles/theme";
import { EVENT_TAGS } from "../../lib/eventTags";
import { translateCategory } from "../../lib/categories";
import { LinearGradient } from "expo-linear-gradient";
import { makeFeedStyles } from "../../styles/feed.styles";

// ─── Types ───────────────────────────────────────────────────────────────────

type ApiEvent = {
    id: string;
    locales?: { en?: { title?: string; body?: string; posterUrl?: string; imageUrl?: string }; fr?: { title?: string; body?: string; posterUrl?: string; imageUrl?: string } };
    startAt?: string;
    endAt?: string;
    locationName?: string;
    club?: { clubName?: string; category?: string };
    categories?: string[];
    price?: number;
    attendees?: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// 30 days: 7 before today through 22 ahead
// Map the app language to a BCP-47 locale for date/day-name formatting.
const locFor = (lang: string) => (lang === "fr" ? "fr-CA" : "en-US");

function getScrollDays(lang: string): { iso: string; letter: string; num: number }[] {
    const today = new Date();
    return Array.from({ length: 30 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - 7 + i);
        return {
            iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
            letter: d.toLocaleString(locFor(lang), { weekday: "short" }).slice(0, 3).toUpperCase(),
            num: d.getDate(),
        };
    });
}

function toISO(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayISO() {
    return toISO(new Date());
}

function formatDayHeader(iso: string, lang: string) {
    const [y, m, d] = iso.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleString(locFor(lang), { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
}

function formatEventTime(iso?: string) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function getRangeISO(mode: "week" | "month"): { from: string; to: string; label: string } {
    const now = new Date();
    const from = toISO(now);
    if (mode === "week") {
        const end = new Date(now);
        end.setDate(now.getDate() + 6);
        return { from, to: toISO(end), label: "THIS WEEK" };
    } else {
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month
        return { from, to: toISO(end), label: "THIS MONTH" };
    }
}

function groupByDay(events: ApiEvent[], lang: string, todayLabel: string): { iso: string; label: string; events: ApiEvent[] }[] {
    const map = new Map<string, ApiEvent[]>();
    for (const e of events) {
        if (!e.startAt) continue;
        const iso = toISO(new Date(e.startAt));
        if (!map.has(iso)) map.set(iso, []);
        map.get(iso)!.push(e);
    }
    return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([iso, evs]) => {
            const [y, mo, d] = iso.split("-").map(Number);
            const date = new Date(y, mo - 1, d);
            const isToday = iso === todayISO();
            const label = isToday
                ? todayLabel
                : date.toLocaleString(locFor(lang), { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
            return { iso, label, events: evs };
        });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FeedPost = {
    id: string;
    clubId: string;
    clubName: string;
    type: string;
    createdAt: string;
    locales: Record<string, { title?: string; body?: string }>;
    eventId?: string;
};

const TYPE_COLORS: Record<string, string> = {
    ANNOUNCEMENT: "#8C0327",
    EVENT: "#1D4ED8",
    POLL: "#7C3AED",
};
const TYPE_ICONS: Record<string, string> = {
    ANNOUNCEMENT: "megaphone-outline",
    EVENT: "calendar-outline",
    POLL: "bar-chart-outline",
};

const TODAY = todayISO();

// ─── Component ───────────────────────────────────────────────────────────────

type ApiClub = {
    id: string;
    clubName: string;
    category?: string;
    logoUrl?: string;
    _count: { followedBy: number };
};

const makeSearchStyles = (C: AppColors) => StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: C.bg,
    },
    container: {
        gap: 0,
    },

    // Masthead
    masthead: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: C.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
    },
    mastheadIcon: {
        width: 36,
        alignItems: "center",
    },
    mastheadTitle: {
        fontSize: 17,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },

    // Hero
    hero: {
        backgroundColor: C.surface,
        marginHorizontal: 12,
        marginTop: 12,
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
        gap: 8,
    },
    heroTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    dailyBrief: {
        fontSize: 11,
        fontWeight: "700",
        color: C.primary,
        letterSpacing: 1.5,
        textTransform: "uppercase",
    },
    heroDate: {
        fontSize: 10,
        fontWeight: "600",
        color: C.textLight,
        letterSpacing: 0.5,
        fontStyle: "italic",
    },
    heroTitleRow: {
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
    },
    heroTitle: {
        fontSize: 48,
        fontWeight: "900",
        color: C.text,
        lineHeight: 50,
        letterSpacing: -1,
    },
    searchBtn: {
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
    },

    // Week strip
    weekStripScroll: {
        backgroundColor: C.surface,
        marginHorizontal: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderTopWidth: 0,
        borderColor: C.borderWarm,
    },
    weekStrip: {
        flexDirection: "row",
        paddingHorizontal: 4,
    },
    weekDay: {
        width: 48,
        alignItems: "center",
        paddingVertical: 12,
        gap: 2,
    },
    weekDayLetter: {
        fontSize: 10,
        fontWeight: "600",
        color: C.textLight,
        letterSpacing: 0.3,
    },
    weekDayNum: {
        fontSize: 17,
        fontWeight: "700",
        color: C.textBody,
    },
    weekDayNumActive: {
        color: C.primary,
    },
    weekDayActive: {
        color: C.primary,
    },
    weekDayBar: {
        width: 16,
        height: 2,
        backgroundColor: C.primary,
        marginTop: 2,
    },

    // Event carousel
    carouselWrapper: {
        marginTop: 12,
    },
    carouselHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 12,
        marginBottom: 8,
    },
    carouselHeaderLabel: {
        fontSize: 11,
        fontWeight: "800",
        color: C.text,
        letterSpacing: 1.5,
    },
    viewAllBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 2,
    },
    viewAllText: {
        fontSize: 13,
        fontWeight: "600",
        color: C.primary,
    },
    carouselContent: {
        paddingLeft: 12,
        gap: 8,
    },
    // +N more card
    moreCard: {
        backgroundColor: C.text,
        justifyContent: "center",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 16,
    },
    moreCardCount: {
        fontSize: 40,
        fontWeight: "900",
        color: "#fff",
        lineHeight: 44,
    },
    moreCardLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: "rgba(255,255,255,0.5)",
        textAlign: "center",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        lineHeight: 18,
    },
    moreCardBtn: {
        marginTop: 12,
        borderWidth: 1,
        borderColor: "#fff",
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    moreCardBtnText: {
        fontSize: 11,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 1.5,
    },

    // Event card (carousel)
    eventCard: {
        backgroundColor: C.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
        overflow: "hidden",
    },
    eventCardImage: {
        height: 210,
        backgroundColor: "#1a1a2e",
        overflow: "hidden",
    },
    eventCardImagePlaceholder: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "#2a2a2a",
    },
    eventCardOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.25)",
    },
    eventCardImageBottom: {
        position: "absolute",
        bottom: 12,
        left: 12,
    },
    eventCardClubLabel: {
        fontSize: 10,
        fontWeight: "700",
        color: "rgba(255,255,255,0.7)",
        letterSpacing: 1.5,
    },
    eventCardInfo: {
        padding: 14,
        gap: 6,
    },
    eventCardCategoryRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    eventCardAccent: {
        width: 3,
        height: 14,
        backgroundColor: C.primary,
    },
    eventCardCategory: {
        fontSize: 11,
        fontWeight: "700",
        color: C.primary,
        letterSpacing: 1.5,
        textTransform: "uppercase",
    },
    eventCardTitle: {
        fontSize: 21,
        fontWeight: "800",
        color: C.text,
        letterSpacing: -0.5,
        lineHeight: 26,
    },
    eventCardMetaRow: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        marginTop: 2,
    },
    eventCardMetaItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    eventCardMetaText: {
        fontSize: 12,
        color: C.textMuted,
        fontWeight: "500",
        letterSpacing: 0.3,
        textTransform: "uppercase",
    },
    eventCardFooter: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 6,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.borderWarm,
    },
    eventCardViewText: {
        fontSize: 12,
        fontWeight: "700",
        color: C.textMuted,
        letterSpacing: 0.5,
    },
    rsvpBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        backgroundColor: C.primary,
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderWidth: 1,
        borderColor: "transparent",
        minWidth: 90,
    },
    rsvpBtnText: {
        fontSize: 11,
        fontWeight: "800",
        letterSpacing: 1.5,
    },

    // No events placeholder
    featuredPlaceholder: {
        backgroundColor: C.surface,
        marginTop: 12,
        marginHorizontal: 12,
        paddingVertical: 48,
        alignItems: "center",
        gap: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
    },
    placeholderText: {
        fontSize: 14,
        color: C.textLight,
        fontWeight: "500",
    },

    // Dot indicators
    dots: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 5,
        paddingTop: 10,
        paddingBottom: 4,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: "#D0D0D0",
    },
    dotActive: {
        backgroundColor: C.primary,
        width: 18,
    },

    // Latest updates
    section: {
        marginTop: 24,
        paddingHorizontal: 12,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "900",
        color: C.text,
        letterSpacing: 1,
        flexShrink: 0,
    },
    sectionLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
        backgroundColor: C.textBody,
    },
    updateEmpty: {
        fontSize: 13,
        color: C.textLight,
        paddingVertical: 16,
        textAlign: "center",
    },
    updateRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
    },
    updateIcon: {
        width: 54,
        height: 54,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    updateText: {
        flex: 1,
        gap: 2,
    },
    updateCategory: {
        fontSize: 10,
        fontWeight: "700",
        color: C.primary,
        letterSpacing: 1,
        textTransform: "uppercase",
    },
    updateTitle: {
        fontSize: 14,
        fontWeight: "800",
        color: C.text,
        lineHeight: 20,
        letterSpacing: -0.2,
    },
    updateExcerpt: {
        fontSize: 12,
        color: C.textMuted,
        lineHeight: 17,
        marginTop: 2,
    },

    // Clubs
    clubRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
    },
    clubLogo: {
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: C.primary,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
    },
    clubLogoImg: { width: 44, height: 44, borderRadius: 10 },
    clubLogoText: { fontSize: 16, fontWeight: "800", color: "#fff" },
    clubInfo: { flex: 1, gap: 2 },
    clubName: { fontSize: 14, fontWeight: "700", color: C.text },
    clubMeta: { fontSize: 11, color: C.textLight, fontWeight: "500", letterSpacing: 0.3 },
    followBtn: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: C.primary,
    },
    followBtnActive: { backgroundColor: C.primary },
    followBtnText: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1 },
    followBtnTextActive: { color: "#fff" },
    viewMoreBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.borderWarm,
        marginTop: 4,
    },
    viewMoreText: { fontSize: 11, fontWeight: "800", color: C.primary, letterSpacing: 1.5 },

    // Range tabs
    rangeTabs: {
        flexDirection: "row",
        gap: 6,
        marginTop: 14,
    },
    rangeTab: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderWidth: 1,
        borderColor: C.borderWarm,
        backgroundColor: C.surface,
    },
    rangeTabActive: {
        borderColor: C.text,
        backgroundColor: C.text,
    },
    rangeTabText: {
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 1,
        color: C.textMuted,
    },
    rangeTabTextActive: {
        color: "#fff",
    },

    // Grouped list (week/month view)
    groupSection: {
        marginTop: 20,
        marginHorizontal: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
        backgroundColor: C.surface,
    },
    groupDayHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: C.text,
    },
    groupDayLabel: {
        fontSize: 11,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 2,
    },
    groupDayCount: {
        fontSize: 10,
        fontWeight: "700",
        color: "rgba(255,255,255,0.5)",
        letterSpacing: 1,
    },
    groupDayLine: {
        flex: 1,
        height: 2,
        backgroundColor: C.borderWarm,
    },
    groupRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 12,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: C.borderWarm,
    },
    groupPoster: {
        width: 52,
        height: 52,
        backgroundColor: "#1a1a2e",
        overflow: "hidden",
        flexShrink: 0,
    },
    groupTime: {
        width: 44,
        alignItems: "center",
        flexShrink: 0,
        paddingTop: 2,
    },
    groupTimeMain: {
        fontSize: 13,
        fontWeight: "800",
        color: C.text,
        textAlign: "center",
    },
    groupTimeSub: {
        fontSize: 10,
        color: C.textLight,
        fontWeight: "500",
        textAlign: "center",
    },
    groupDivider: {
        width: 2,
        height: 36,
        backgroundColor: C.primary,
        flexShrink: 0,
    },
    groupInfo: { flex: 1, gap: 2, minWidth: 0 },
    groupClub: {
        fontSize: 9,
        fontWeight: "700",
        color: C.primary,
        letterSpacing: 1,
        textTransform: "uppercase",
    },
    groupTitle: {
        fontSize: 13,
        fontWeight: "800",
        color: C.text,
        lineHeight: 17,
        letterSpacing: -0.2,
    },
    groupLocation: {
        fontSize: 11,
        color: C.textMuted,
        fontWeight: "500",
    },
    groupBody: {
        fontSize: 12,
        color: C.textLight,
        lineHeight: 17,
        marginTop: 3,
    },
    groupActionRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        marginTop: 7,
    },
    groupTagWrap: {
        flex: 1,
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "flex-start",
        gap: 6,
    },
    groupTag: {
        borderWidth: 1.5,
        borderColor: C.borderWarm,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    groupTagText: {
        fontSize: 9,
        fontWeight: "800",
        letterSpacing: 0.8,
        color: C.textBody,
    },
    groupFreeFood: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        backgroundColor: C.gold,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    groupFreeFoodText: {
        fontSize: 8,
        fontWeight: "800",
        letterSpacing: 1,
        color: "#fff",
    },
    groupRsvpBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        borderWidth: 1,
        borderColor: C.primary,
        backgroundColor: C.primary,
        paddingHorizontal: 10,
        paddingVertical: 4,
        flexShrink: 0,
    },
    groupRsvpBtnGoing: {
        backgroundColor: "transparent",
        borderColor: C.primary,
    },
    groupRsvpText: {
        fontSize: 9,
        fontWeight: "800",
        letterSpacing: 1,
        color: "#fff",
    },
    groupRsvpTextGoing: {
        color: C.primary,
    },
    groupViewAll: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        paddingVertical: 12,
    },
    groupViewAllText: {
        fontSize: 12,
        fontWeight: "700",
        color: C.primary,
        letterSpacing: 0.3,
    },
    rangeEmpty: {
        paddingVertical: 48,
        alignItems: "center",
        gap: 10,
    },
    rangeEmptyText: {
        fontSize: 14,
        color: C.textLight,
        fontWeight: "500",
    },
    rangeLoading: {
        paddingVertical: 48,
        alignItems: "center",
    },
    loadMoreBtn: {
        marginHorizontal: 12,
        marginTop: 12,
        paddingVertical: 16,
        backgroundColor: C.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
        alignItems: "center",
        gap: 3,
    },
    loadMoreText: {
        fontSize: 11,
        fontWeight: "800",
        color: C.text,
        letterSpacing: 1.5,
    },
    loadMoreSub: {
        fontSize: 11,
        color: C.textLight,
        fontWeight: "500",
    },
});

export default function DiscoverScreen() {
    const router = useRouter();
    const authApi = useApi();
    const { session } = useAuth();
    const { lang } = useLang();
    const SCROLL_DAYS = useMemo(() => getScrollDays(lang), [lang]);
    const { width: screenWidth } = useWindowDimensions();
    const { colors: C } = useTheme();
    const t = useT();
    const styles = useMemo(() => makeSearchStyles(C), [C]);
    const [rangeMode, setRangeMode] = useState<"today" | "week" | "month">("today");
    const [selectedDay, setSelectedDay] = useState(TODAY);
    const [apiEvents, setApiEvents] = useState<ApiEvent[]>([]);
    const [rangeEvents, setRangeEvents] = useState<ApiEvent[]>([]);
    const [rangeLoading, setRangeLoading] = useState(false);
    const [visibleDayCount, setVisibleDayCount] = useState(7);
    const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
    const [activeIndex, setActiveIndex] = useState(0);
    const [latestUpdates, setLatestUpdates] = useState<FeedPost[]>([]);
    const [clubs, setClubs] = useState<ApiClub[]>([]);
    const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
    const [followedTopics, setFollowedTopics] = useState<Set<string>>(new Set());
    const carouselRef = useRef<ScrollView>(null);
    const weekStripRef = useRef<ScrollView>(null);
    const carouselOpacity = useRef(new Animated.Value(1)).current;

    // Scroll week strip so today is at the left edge on mount
    useEffect(() => {
        const todayIndex = SCROLL_DAYS.findIndex((d) => d.iso === TODAY);
        if (todayIndex > 0) {
            weekStripRef.current?.scrollTo({ x: todayIndex * 48, animated: false });
        }
    }, []);

    // Fetch latest updates + clubs + follows once on mount
    useEffect(() => {
        if (session?.token) {
            authApi<FeedPost[]>("/posts/discover")
                .then((data) => setLatestUpdates(data.slice(0, 4)))
                .catch(console.error);
            authApi<{ id: string }[]>("/users/me/follows")
                .then((data) => setFollowedIds(new Set(data.map((f) => f.id))))
                .catch(console.error);
            authApi<string[]>("/users/me/topics")
                .then((data) => setFollowedTopics(new Set(data)))
                .catch(() => {});
        }
        authApi<ApiClub[]>("/clubs?limit=30")
            .then(setClubs)
            .catch(console.error);
    }, [session?.token]);

    async function toggleTopic(category: string) {
        const following = followedTopics.has(category);
        setFollowedTopics((prev) => {
            const next = new Set(prev);
            following ? next.delete(category) : next.add(category);
            return next;
        });
        try {
            await authApi(
                following ? `/users/me/topics/${encodeURIComponent(category)}` : "/users/me/topics",
                following ? { method: "DELETE" } : { method: "POST", body: JSON.stringify({ category }) },
            );
        } catch {
            // revert on failure
            setFollowedTopics((prev) => {
                const next = new Set(prev);
                following ? next.add(category) : next.delete(category);
                return next;
            });
        }
    }

    async function toggleFollow(clubId: string) {
        const isFollowing = followedIds.has(clubId);
        setFollowedIds((prev) => {
            const next = new Set(prev);
            isFollowing ? next.delete(clubId) : next.add(clubId);
            return next;
        });
        try {
            await authApi(`/clubs/${clubId}/follow`, { method: isFollowing ? "DELETE" : "POST" });
        } catch {
            setFollowedIds((prev) => {
                const next = new Set(prev);
                isFollowing ? next.add(clubId) : next.delete(clubId);
                return next;
            });
        }
    }

    // Fade out → fetch → fade in on day change (TODAY mode only)
    useEffect(() => {
        if (rangeMode !== "today") return;
        Animated.timing(carouselOpacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
            authApi<ApiEvent[]>(`/events?date=${selectedDay}`)
                .then((data) => {
                    setApiEvents(data);
                    setActiveIndex(0);
                    setCategoryFilter("ALL");
                    carouselRef.current?.scrollTo({ x: 0, animated: false });
                })
                .catch(console.error)
                .finally(() => {
                    Animated.timing(carouselOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
                });
        });
    }, [selectedDay, rangeMode]);

    // Fetch range events when switching to week/month
    useEffect(() => {
        if (rangeMode === "today") return;
        setRangeLoading(true);
        setCategoryFilter("ALL");
        setVisibleDayCount(7);
        const { from, to } = getRangeISO(rangeMode);
        authApi<ApiEvent[]>(`/events?from=${from}&to=${to}`)
            .then(setRangeEvents)
            .catch(console.error)
            .finally(() => setRangeLoading(false));
    }, [rangeMode]);

    const CARD_WIDTH = screenWidth - 24;

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.container}
                showsVerticalScrollIndicator={false}
            >
                {/* ── Hero heading ── */}
                <View style={styles.hero}>
                    <View style={styles.heroTop}>
                        <Text style={styles.dailyBrief}>{t.dailyBrief}</Text>
                        <Text style={styles.heroDate}>
                            {rangeMode === "today" ? formatDayHeader(selectedDay, lang) : (rangeMode === "week" ? t.thisWeekRange : t.thisMonthRange)}
                        </Text>
                    </View>
                    <View style={styles.heroTitleRow}>
                        <Text style={styles.heroTitle}>DISCOVER{"\n"}CAMPUS</Text>
                        <Pressable onPress={() => router.push("/search-modal" as any)} style={styles.searchBtn} hitSlop={8} accessibilityLabel="Search" accessibilityRole="button">
                            <Ionicons name="search" size={22} color={C.text} />
                        </Pressable>
                    </View>

                    {/* ── Range tabs ── */}
                    <View style={styles.rangeTabs}>
                        {(["today", "week", "month"] as const).map((mode) => {
                            const label = mode === "today" ? t.todayRange : mode === "week" ? t.thisWeekRange : t.thisMonthRange;
                            const active = rangeMode === mode;
                            return (
                                <Pressable
                                    key={mode}
                                    onPress={() => setRangeMode(mode)}
                                    style={[styles.rangeTab, active && styles.rangeTabActive]}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: active }}
                                    accessibilityLabel={label}
                                >
                                    <Text style={[styles.rangeTabText, active && styles.rangeTabTextActive]}>{label}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                {/* ── Week strip (TODAY mode only) ── */}
                {rangeMode === "today" && (
                    <ScrollView
                        ref={weekStripRef}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.weekStripScroll}
                        contentContainerStyle={styles.weekStrip}
                    >
                        {SCROLL_DAYS.map((day) => {
                            const isSelected = day.iso === selectedDay;
                            return (
                                <Pressable
                                    key={day.iso}
                                    style={styles.weekDay}
                                    onPress={() => setSelectedDay(day.iso)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: isSelected }}
                                    accessibilityLabel={new Date(day.iso).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                                >
                                    <Text style={[styles.weekDayLetter, isSelected && styles.weekDayActive]}>
                                        {day.letter}
                                    </Text>
                                    <Text style={[styles.weekDayNum, isSelected && styles.weekDayNumActive]}>
                                        {day.num}
                                    </Text>
                                    {isSelected && <View style={styles.weekDayBar} />}
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                )}

                {/* ── Events section ── */}
                {rangeMode === "today" ? (
                    // ── TODAY: carousel view ──
                    (() => {
                        const categories = ["ALL", ...Array.from(new Set(apiEvents.flatMap(e => e.categories ?? []).filter(Boolean)))];
                        const filteredEvents = categoryFilter === "ALL" ? apiEvents : apiEvents.filter(e => e.categories?.includes(categoryFilter));
                        const CAROUSEL_LIMIT = 4;
                        const carouselEvents = filteredEvents.slice(0, CAROUSEL_LIMIT);
                        const extraCount = filteredEvents.length - CAROUSEL_LIMIT;
                        // Exact snap geometry so every card — including the narrower
                        // "+N more" card — lines up flush at the start on each snap.
                        const cardStep = CARD_WIDTH + 8;
                        const moreCardWidth = CARD_WIDTH;
                        const lastWidth = extraCount > 0 ? moreCardWidth : CARD_WIDTH;
                        const snapOffsets = [
                            ...carouselEvents.map((_, i) => i * cardStep),
                            ...(extraCount > 0 ? [carouselEvents.length * cardStep] : []),
                        ];
                        const lastIndex = carouselEvents.length - 1 + (extraCount > 0 ? 1 : 0);
                        return (
                            <Animated.View style={{ opacity: carouselOpacity }}>
                                {apiEvents.length > 0 && categories.length > 1 && (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 8 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: "row" }}>
                                        {categories.map((cat) => (
                                            <Pressable
                                                key={cat}
                                                onPress={() => { setCategoryFilter(cat); setActiveIndex(0); carouselRef.current?.scrollTo({ x: 0, animated: false }); }}
                                                style={{ paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: categoryFilter === cat ? C.primary : C.borderWarm, backgroundColor: categoryFilter === cat ? C.primary : C.surface }}
                                                accessibilityRole="button"
                                                accessibilityState={{ selected: categoryFilter === cat }}
                                                accessibilityLabel={cat}
                                            >
                                                <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1, color: categoryFilter === cat ? "#fff" : C.textMuted }}>{cat === "ALL" ? t.filterAllTab : translateCategory(cat, lang).toUpperCase()}</Text>
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                )}
                                {filteredEvents.length === 0 ? (
                                    <View style={styles.featuredPlaceholder}>
                                        <Ionicons name="calendar-outline" size={32} color="#D0D0D0" />
                                        <Text style={styles.placeholderText}>{t.noEventsThisDay}</Text>
                                    </View>
                                ) : (
                                    <View style={styles.carouselWrapper}>
                                        <View style={styles.carouselHeader}>
                                            <Text style={styles.carouselHeaderLabel}>
                                                {filteredEvents.length} {filteredEvents.length === 1 ? "EVENT" : "EVENTS"}
                                            </Text>
                                            {extraCount > 0 && (
                                                <Pressable style={styles.viewAllBtn} onPress={() => router.push({ pathname: "/all-events-modal", params: { date: selectedDay, events: JSON.stringify(filteredEvents) } } as any)}>
                                                    <Text style={styles.viewAllText}>View all {filteredEvents.length}</Text>
                                                    <Ionicons name="chevron-forward" size={13} color={C.primary} />
                                                </Pressable>
                                            )}
                                        </View>
                                        <ScrollView
                                            ref={carouselRef}
                                            horizontal
                                            pagingEnabled={false}
                                            snapToOffsets={snapOffsets}
                                            snapToAlignment="start"
                                            decelerationRate="fast"
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={[styles.carouselContent, { paddingRight: screenWidth - lastWidth - 12 }]}
                                            onScroll={(e) => {
                                                const idx = Math.round(e.nativeEvent.contentOffset.x / cardStep);
                                                setActiveIndex(Math.max(0, Math.min(idx, lastIndex)));
                                            }}
                                            scrollEventThrottle={16}
                                        >
                                            {carouselEvents.map((event) => (
                                                <EventCard key={event.id} event={event} width={CARD_WIDTH} onPress={() => router.push({ pathname: "/event/[id]", params: { id: event.id } })} />
                                            ))}
                                            {extraCount > 0 && (
                                                <Pressable style={[styles.moreCard, { width: moreCardWidth }]} onPress={() => router.push({ pathname: "/all-events-modal", params: { date: selectedDay, events: JSON.stringify(filteredEvents) } } as any)}>
                                                    <Text style={styles.moreCardCount}>+{extraCount}</Text>
                                                    <Text style={styles.moreCardLabel}>more{"\n"}events</Text>
                                                    <View style={styles.moreCardBtn}><Text style={styles.moreCardBtnText}>{t.viewAll}</Text></View>
                                                </Pressable>
                                            )}
                                        </ScrollView>
                                        {(carouselEvents.length > 1 || extraCount > 0) && (
                                            <View style={styles.dots}>
                                                {carouselEvents.map((_, i) => (
                                                    <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
                                                ))}
                                                {extraCount > 0 && <View style={[styles.dot, activeIndex === carouselEvents.length && styles.dotActive]} />}
                                            </View>
                                        )}
                                    </View>
                                )}
                            </Animated.View>
                        );
                    })()
                ) : (
                    // ── WEEK / MONTH: grouped list view ──
                    (() => {
                        if (rangeLoading) {
                            return <View style={styles.rangeLoading}><ActivityIndicator color={C.primary} /></View>;
                        }
                        const categories = ["ALL", ...Array.from(new Set(rangeEvents.flatMap(e => e.categories ?? []).filter(Boolean)))];
                        const filtered = categoryFilter === "ALL" ? rangeEvents : rangeEvents.filter(e => e.categories?.includes(categoryFilter));
                        const groups = groupByDay(filtered, lang, t.todayRange);
                        return (
                            <View>
                                {/* Category chips */}
                                {rangeEvents.length > 0 && categories.length > 1 && (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 8 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexDirection: "row" }}>
                                        {categories.map((cat) => (
                                            <Pressable
                                                key={cat}
                                                onPress={() => setCategoryFilter(cat)}
                                                style={{ paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: categoryFilter === cat ? C.primary : C.borderWarm, backgroundColor: categoryFilter === cat ? C.primary : C.surface }}
                                                accessibilityRole="button"
                                                accessibilityState={{ selected: categoryFilter === cat }}
                                                accessibilityLabel={cat}
                                            >
                                                <Text style={{ fontSize: 10, fontWeight: "800", letterSpacing: 1, color: categoryFilter === cat ? "#fff" : C.textMuted }}>{cat === "ALL" ? t.filterAllTab : translateCategory(cat, lang).toUpperCase()}</Text>
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                )}
                                {groups.length === 0 ? (
                                    <View style={styles.rangeEmpty}>
                                        <Ionicons name="calendar-outline" size={32} color="#D0D0D0" />
                                        <Text style={styles.rangeEmptyText}>No events {rangeMode === "week" ? "this week" : "this month"}</Text>
                                    </View>
                                ) : groups.slice(0, visibleDayCount).map((group) => (
                                    <View key={group.iso} style={styles.groupSection}>
                                        {/* Day header */}
                                        <View style={styles.groupDayHeader}>
                                            <Text style={styles.groupDayLabel}>{group.label}</Text>
                                            <Text style={styles.groupDayCount}>{group.events.length} {group.events.length === 1 ? "EVENT" : "EVENTS"}</Text>
                                        </View>
                                        {/* Event rows — max 5 per day */}
                                        {group.events.slice(0, 5).map((event) => (
                                            <GroupEventRow
                                                key={event.id}
                                                event={event}
                                                onPress={() => router.push({ pathname: "/event/[id]", params: { id: event.id } })}
                                            />
                                        ))}
                                        {/* View all for this day if more than 5 */}
                                        {group.events.length > 5 && (
                                            <Pressable
                                                style={styles.groupViewAll}
                                                onPress={() => router.push({ pathname: "/all-events-modal", params: { date: group.iso, events: JSON.stringify(group.events) } } as any)}
                                            >
                                                <Text style={styles.groupViewAllText}>+{group.events.length - 5} more events this day</Text>
                                                <Ionicons name="chevron-forward" size={13} color={C.primary} />
                                            </Pressable>
                                        )}
                                    </View>
                                ))}
                                {/* Load more days */}
                                {groups.length > visibleDayCount && (
                                    <Pressable
                                        style={styles.loadMoreBtn}
                                        onPress={() => setVisibleDayCount((n) => n + 7)}
                                    >
                                        <Text style={styles.loadMoreText}>
                                            LOAD MORE DAYS
                                        </Text>
                                        <Text style={styles.loadMoreSub}>
                                            {groups.length - visibleDayCount} day{groups.length - visibleDayCount !== 1 ? "s" : ""} remaining
                                        </Text>
                                    </Pressable>
                                )}
                            </View>
                        );
                    })()
                )}

                {/* ── Latest updates ── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionTitle}>{t.latestUpdates}</Text>
                        <View style={styles.sectionLine} />
                        <Pressable
                            style={styles.viewAllBtn}
                            onPress={() => router.push({ pathname: "/search-modal", params: { category: "posts" } } as any)}
                        >
                            <Text style={styles.viewAllText}>{t.viewMore}</Text>
                            <Ionicons name="chevron-forward" size={13} color={C.primary} />
                        </Pressable>
                    </View>
                    {latestUpdates.length === 0 && (
                        <Text style={styles.updateEmpty}>No announcements from other clubs yet.</Text>
                    )}
                    {latestUpdates.map((item) => {
                        const locale = pickLocale(item.locales as any, lang);
                        const color = TYPE_COLORS[item.type] ?? C.textBody;
                        const icon = (TYPE_ICONS[item.type] ?? "newspaper-outline") as any;
                        return (
                        <Pressable key={item.id} style={styles.updateRow} accessibilityRole="button" accessibilityLabel={locale.title ?? item.clubName ?? "Update"} onPress={() => item.type === "event"
                            ? router.push({ pathname: "/event/[id]", params: { id: item.eventId ?? item.id } })
                            : router.push({ pathname: "/post/[id]", params: { id: item.id } })
                        }>
                            <View style={[styles.updateIcon, { backgroundColor: color }]}>
                                <Ionicons name={icon} size={18} color="#fff" />
                            </View>
                            <View style={styles.updateText}>
                                <Text style={styles.updateCategory}>{item.clubName?.toUpperCase()} · {item.type.toUpperCase()}</Text>
                                <Text style={styles.updateTitle}>{(locale.title ?? "").toUpperCase()}</Text>
                                <Text style={styles.updateExcerpt} numberOfLines={2}>{locale.body ?? ""}</Text>
                            </View>
                        </Pressable>
                        );
                    })}
                </View>

                {/* ── Follow topics ── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionTitle}>{t.followTopics}</Text>
                        <View style={styles.sectionLine} />
                    </View>
                    <Text style={{ fontSize: 12, color: C.textMuted, marginTop: -4, marginBottom: 12 }} maxFontSizeMultiplier={1.3}>
                        Get these in your feed, even from clubs you don't follow.
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {EVENT_TAGS.map((tag) => {
                            const on = followedTopics.has(tag);
                            return (
                                <Pressable
                                    key={tag}
                                    onPress={() => toggleTopic(tag)}
                                    style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: on ? C.primary : C.borderWarm, backgroundColor: on ? C.primary : C.surface }}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: on }}
                                    accessibilityLabel={`${on ? t.unfollowWord : t.followWord} ${translateCategory(tag, lang)}`}
                                >
                                    {on && <Ionicons name="checkmark" size={12} color="#fff" />}
                                    <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: on ? "#fff" : C.textMuted }} maxFontSizeMultiplier={1.3}>
                                        {translateCategory(tag, lang).toUpperCase()}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                {/* ── Discover Clubs ── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionTitle}>{t.clubsToDiscover}</Text>
                        <View style={styles.sectionLine} />
                    </View>
                    {(() => {
                        const unfollowed = clubs.filter((c) => !followedIds.has(c.id));
                        const visible = unfollowed.slice(0, 5);
                        const remaining = unfollowed.length - 5;
                        return (
                            <>
                                {visible.map((club) => {
                                    const initial = (club.clubName ?? "C").charAt(0).toUpperCase();
                                    return (
                                        <Pressable
                                            key={club.id}
                                            style={styles.clubRow}
                                            onPress={() => router.push(`/club/${club.id}` as any)}
                                        >
                                            <View style={styles.clubLogo}>
                                                {club.logoUrl
                                                    ? <Image source={{ uri: club.logoUrl }} style={styles.clubLogoImg} />
                                                    : <Text style={styles.clubLogoText}>{initial}</Text>}
                                            </View>
                                            <View style={styles.clubInfo}>
                                                <Text style={styles.clubName}>{club.clubName}</Text>
                                                <Text style={styles.clubMeta}>
                                                    {[club.category, `${club._count.followedBy} followers`].filter(Boolean).join(" · ")}
                                                </Text>
                                            </View>
                                            <Pressable
                                                style={styles.followBtn}
                                                onPress={() => toggleFollow(club.id)}
                                            >
                                                <Text style={styles.followBtnText}>{t.follow}</Text>
                                            </Pressable>
                                        </Pressable>
                                    );
                                })}
                                {remaining > 0 && (
                                    <Pressable
                                        style={styles.viewMoreBtn}
                                        onPress={() => router.push({ pathname: "/search-modal", params: { category: "clubs" } } as any)}
                                    >
                                        <Text style={styles.viewMoreText}>VIEW {remaining} MORE CLUBS</Text>
                                        <Ionicons name="arrow-forward" size={13} color={C.primary} />
                                    </Pressable>
                                )}
                            </>
                        );
                    })()}
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Event carousel card ──────────────────────────────────────────────────────

function EventCard({ event, width, onPress }: { event: ApiEvent; width: number; onPress: () => void }) {
    const { lang } = useLang();
    const t = useT();
    const { colors: C } = useTheme();
    // Use the shared feed styles so carousel cards match the feed's event cards.
    const s = useMemo(() => makeFeedStyles(C), [C]);
    const locale = pickLocale(event.locales, lang);
    const title = (locale.title ?? t.untitledEvent).toUpperCase();
    const time = formatEventTime(event.startAt);
    const endTime = formatEventTime(event.endAt);
    const timeStr = time && endTime ? `${time} – ${endTime}` : time;
    const location = event.locationName ?? "";
    const clubName = event.club?.clubName ?? "";
    const clubInitials = clubName.slice(0, 2).toLowerCase();
    const bannerUri = locale.posterUrl ?? locale.imageUrl;

    const isFreeFood = (event.categories ?? []).some((c) => /free\s*food/i.test(c));
    const tags = (event.categories ?? []).filter((c) => !/free\s*food/i.test(c));
    const going_count = event.attendees ?? 0;

    let dateBadgeDay = "";
    let dateBadgeMon = "";
    if (event.startAt) {
        const d = new Date(event.startAt);
        dateBadgeDay = String(d.getDate());
        dateBadgeMon = d.toLocaleDateString(locFor(lang), { month: "short" });
    }

    const { isRsvped, toggleRsvp } = useRsvp();
    const [rsvpLoading, setRsvpLoading] = useState(false);
    const going = isRsvped(event.id);

    const handleRsvp = useCallback(async () => {
        if (rsvpLoading) return;
        setRsvpLoading(true);
        await toggleRsvp(event.id);
        setRsvpLoading(false);
    }, [rsvpLoading, event.id, toggleRsvp]);

    return (
        <Pressable style={[s.evCard, { width, borderWidth: StyleSheet.hairlineWidth, borderColor: C.borderWarm }]} onPress={onPress}>

            {/* ── Banner ── */}
            <View style={s.evBanner}>
                {bannerUri ? (
                    <Image source={{ uri: bannerUri }} style={s.evBannerImage} resizeMode="cover" />
                ) : (
                    <View style={[s.evBannerImage, { backgroundColor: "#111" }]} />
                )}

                <LinearGradient
                    colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.72)"]}
                    style={StyleSheet.absoluteFillObject}
                />

                {/* Top row: type label (+ free food) and date badge */}
                <View style={s.evBannerTop}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={s.evTypeLabel}>{t.eventBadge}</Text>
                        {isFreeFood && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 9 }}>🍕</Text>
                                <Text style={{ fontSize: 8, fontWeight: "800", letterSpacing: 1, color: "#fff" }}>{t.freeFoodBadge}</Text>
                            </View>
                        )}
                    </View>
                    {dateBadgeDay ? (
                        <View style={s.evDateBadge}>
                            <Text style={s.evDateDay}>{dateBadgeDay}</Text>
                            <Text style={s.evDateMon}>{dateBadgeMon.toUpperCase()}</Text>
                        </View>
                    ) : null}
                </View>

                {/* Bottom: club chip + title */}
                <View style={s.evBannerBottom}>
                    {!!clubName && (
                        <View style={s.evClubChip}>
                            <View style={[s.evClubChipAvatar, s.evClubChipAvatarFallback]}>
                                <Text style={s.evClubChipInitials}>{clubInitials}</Text>
                            </View>
                            <Text style={s.evClubChipName} numberOfLines={1}>{clubName.toUpperCase()}</Text>
                        </View>
                    )}
                    <Text style={s.evBannerTitle} numberOfLines={2}>{title}</Text>
                </View>
            </View>

            {/* ── Body ── */}
            <View style={s.evBody}>
                {(timeStr || location) && (
                    <View style={s.evMetaRow}>
                        {!!timeStr && (
                            <View style={s.evMetaItem}>
                                <Ionicons name="time-outline" size={13} color={C.textMuted} />
                                <Text style={s.evMetaText} numberOfLines={1}>{timeStr}</Text>
                            </View>
                        )}
                        {!!timeStr && !!location && <View style={s.evMetaSep} />}
                        {!!location && (
                            <View style={s.evMetaItem}>
                                <Ionicons name="location-outline" size={13} color={C.textMuted} />
                                <Text style={s.evMetaText} numberOfLines={1}>{location}</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Tags wrap on the left; RSVP pinned top-right with going count beneath */}
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, paddingTop: 2 }}>
                    <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 6 }}>
                        {tags.map((tag, i) => (
                            <View key={i} style={s.evTag}>
                                <Text style={s.evTagText}>{translateCategory(tag, lang).toUpperCase()}</Text>
                            </View>
                        ))}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                        <Pressable
                            style={[s.evRsvpBtn, going && s.evRsvpBtnGoing]}
                            onPress={handleRsvp}
                            disabled={rsvpLoading}
                            accessibilityRole="button"
                            accessibilityLabel={going ? t.cancelRsvpLabel : t.rsvpToEventLabel}
                        >
                            <Ionicons name={going ? "checkmark-circle" : "ticket-outline"} size={12} color={going ? C.primary : "#fff"} />
                            <Text style={[s.evRsvpText, going && s.evRsvpTextGoing]}>{going ? "GOING" : "RSVP"}</Text>
                        </Pressable>
                        {going_count > 0 && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                                <Ionicons name="people" size={12} color={C.textMuted} />
                                <Text style={s.evGoingText}>{going_count} going</Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>
        </Pressable>
    );
}

// Compact agenda row used in the This Week / This Month list. Same data family
// as the feed card (tags, free-food badge, inline RSVP) but a dense scan-friendly
// row instead of a full banner card.
function GroupEventRow({ event, onPress }: { event: ApiEvent; onPress: () => void }) {
    const { lang } = useLang();
    const { colors: C } = useTheme();
    const t = useT();
    const styles = useMemo(() => makeSearchStyles(C), [C]);
    const locale = pickLocale(event.locales, lang);
    const title = (locale.title ?? t.untitledEvent).toUpperCase();
    const time = formatEventTime(event.startAt);
    const endTime = formatEventTime(event.endAt);
    const clubName = event.club?.clubName?.toUpperCase() ?? "";
    const location = event.locationName ?? "";
    const imgUri = (locale as any).posterUrl ?? (locale as any).imageUrl;

    const isFreeFood = (event.categories ?? []).some((c) => /free\s*food/i.test(c));
    const tags = (event.categories ?? []).filter((c) => !/free\s*food/i.test(c)).slice(0, 2);

    const { isRsvped, toggleRsvp } = useRsvp();
    const [rsvpLoading, setRsvpLoading] = useState(false);
    const going = isRsvped(event.id);

    const handleRsvp = useCallback(async () => {
        if (rsvpLoading) return;
        setRsvpLoading(true);
        await toggleRsvp(event.id);
        setRsvpLoading(false);
    }, [rsvpLoading, event.id, toggleRsvp]);

    return (
        <Pressable style={styles.groupRow} onPress={onPress}>
            {/* Time */}
            <View style={styles.groupTime}>
                {time ? (
                    <>
                        <Text style={styles.groupTimeMain}>{time}</Text>
                        {endTime ? <Text style={styles.groupTimeSub}>{endTime}</Text> : null}
                    </>
                ) : (
                    <Text style={styles.groupTimeSub}>{t.tbd}</Text>
                )}
            </View>
            <View style={styles.groupDivider} />
            {/* Poster thumbnail */}
            <View style={styles.groupPoster}>
                {imgUri
                    ? <Image source={{ uri: imgUri }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                    : <View style={[StyleSheet.absoluteFill as any, { backgroundColor: "#2a2a2a" }]} />}
            </View>
            {/* Info */}
            <View style={styles.groupInfo}>
                {!!clubName && <Text style={styles.groupClub} numberOfLines={1}>{clubName}</Text>}
                <Text style={styles.groupTitle} numberOfLines={2}>{title}</Text>
                {!!location && <Text style={styles.groupLocation} numberOfLines={1}>{location}</Text>}

                {/* Tags + free-food badge (wrap) with inline RSVP pinned top-right */}
                <View style={styles.groupActionRow}>
                    <View style={styles.groupTagWrap}>
                        {tags.map((tag, i) => (
                            <View key={i} style={styles.groupTag}>
                                <Text style={styles.groupTagText}>{tag.toUpperCase()}</Text>
                            </View>
                        ))}
                        {isFreeFood && (
                            <View style={styles.groupFreeFood}>
                                <Text style={{ fontSize: 9 }}>🍕</Text>
                                <Text style={styles.groupFreeFoodText}>{t.freeFoodBadge}</Text>
                            </View>
                        )}
                    </View>
                    <Pressable
                        style={[styles.groupRsvpBtn, going && styles.groupRsvpBtnGoing]}
                        onPress={handleRsvp}
                        disabled={rsvpLoading}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={going ? t.cancelRsvpLabel : t.rsvpToEventLabel}
                    >
                        <Ionicons name={going ? "checkmark-circle" : "ticket-outline"} size={11} color={going ? C.primary : "#fff"} />
                        <Text style={[styles.groupRsvpText, going && styles.groupRsvpTextGoing]}>{going ? "GOING" : "RSVP"}</Text>
                    </Pressable>
                </View>
            </View>
        </Pressable>
    );
}
