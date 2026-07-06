import { useState, useEffect, useMemo, useRef } from "react";
import {
    View, Text, TextInput, ScrollView, Pressable,
    StyleSheet, Image, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useApi } from "../../lib/useApi";
import { useLang, pickLocale, useT } from "../../lib/LangContext";
import { translateCategory } from "../../lib/categories";
import { localeFor } from "../../lib/datetime";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";

type SearchCategory = "all" | "events" | "clubs" | "posts";

type ApiClub = {
    id: string; clubName: string; category?: string;
    description?: string; descriptionFr?: string; logoUrl?: string;
    _count: { followedBy: number };
};
type ApiEvent = {
    id: string; title: string; clubName: string;
    posterUrl?: string | null; startAt?: string; locationName?: string;
};
type ApiPost = {
    id: string; type: string; title: string;
    clubName: string; createdAt: string;
};
type SearchResults = { clubs: ApiClub[]; events: ApiEvent[]; posts: ApiPost[] };

const CATEGORIES: { key: SearchCategory; label: string }[] = [
    { key: "all",    label: "ALL" },
    { key: "events", label: "EVENTS" },
    { key: "clubs",  label: "CLUBS" },
    { key: "posts",  label: "POSTS" },
];

function fmtDate(iso: string | undefined, lang: string) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(localeFor(lang), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type PopularClub = { id: string; clubName: string; category?: string; logoUrl?: string; _count: { followedBy: number } };
type UpcomingEvent = { id: string; title?: string; clubName?: string; posterUrl?: string | null; startAt?: string; locationName?: string; locales?: { en?: { title?: string; posterUrl?: string; imageUrl?: string }; fr?: { title?: string } }; club?: { clubName?: string } };

const makeStyles = (C: AppColors) => StyleSheet.create({
    page: { flex: 1, backgroundColor: C.bg },

    header: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 14,
        backgroundColor: C.bg,
    },
    backGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
    backLabel: { fontSize: 14, fontWeight: "900", color: C.primary, letterSpacing: 2 },

    inputWrap: {
        flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
        backgroundColor: C.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.border,
        paddingHorizontal: 12, paddingVertical: 10,
    },
    input: { flex: 1, fontSize: 14, color: C.text, fontWeight: "500", paddingVertical: 0 },

    hero: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },
    heroLabel: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 2, marginBottom: 6 },
    heroTitle: { fontSize: 42, fontWeight: "900", color: C.text, letterSpacing: -1, lineHeight: 46 },
    heroAccent: { width: 48, height: 3, backgroundColor: C.primary, marginTop: 12 },

    filterScroll: { backgroundColor: C.bg, flexGrow: 0, flexShrink: 0 },
    filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
    filterPill: { paddingHorizontal: 14, backgroundColor: "#EDECEA", height: 20, justifyContent: "center" },
    filterPillActive: { backgroundColor: "#1F2937" },
    filterPillText: { fontSize: 10, fontWeight: "800", color: C.textLight, letterSpacing: 1 },
    filterPillTextActive: { color: "#fff" },

    list: { paddingHorizontal: 20, paddingTop: 12 },

    resultsCount: {
        fontSize: 10, fontWeight: "800", color: C.textLight,
        letterSpacing: 1.5, marginBottom: 16,
    },

    sectionHeaderRow: {
        flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, marginTop: 4,
    },
    sectionTitle: {
        fontSize: 11, fontWeight: "900", color: C.text, letterSpacing: 1.5, flexShrink: 0,
    },
    sectionLine: {
        flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.textBody,
    },

    card: {
        flexDirection: "row", alignItems: "flex-start",
        backgroundColor: C.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.border,
        marginBottom: 8,
        overflow: "hidden",
    },
    cardAccent: { width: 3, flexShrink: 0, alignSelf: "stretch", backgroundColor: C.primary },
    cardIcon: {
        width: 44, height: 44, backgroundColor: C.primaryBg,
        alignItems: "center", justifyContent: "center",
        flexShrink: 0, margin: 12, marginRight: 0,
    },
    cardLogoImg: { width: 44, height: 44 },
    cardPoster: {
        width: 52, height: 52, backgroundColor: C.border,
        overflow: "hidden", flexShrink: 0,
        alignItems: "center", justifyContent: "center",
        margin: 12, marginRight: 0,
    },
    cardContent: { flex: 1, minWidth: 0, gap: 2, padding: 12 },
    cardLabel: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 0.8 },
    cardTitle: { fontSize: 15, fontWeight: "800", color: C.text, letterSpacing: -0.2 },
    cardMeta: { fontSize: 12, color: C.textMuted, marginTop: 1 },

    emptyState: { alignItems: "center", paddingTop: 60, gap: 10 },
    emptyTitle: { fontSize: 13, fontWeight: "900", color: C.textFaint, letterSpacing: 2 },
    emptySubtitle: { fontSize: 13, color: C.textLight },
});

export default function SearchModal() {
    const router = useRouter();
    const authApi = useApi();
    const { lang } = useLang();
    const t = useT();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    const inputRef = useRef<TextInput>(null);

    const { category: categoryParam } = useLocalSearchParams<{ category?: string }>();

    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<SearchCategory>(
        (categoryParam as SearchCategory) ?? "all"
    );
    const [results, setResults] = useState<SearchResults>({ clubs: [], events: [], posts: [] });
    const [loading, setLoading] = useState(false);
    const [popularClubs, setPopularClubs] = useState<PopularClub[]>([]);
    const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);

    useEffect(() => {
        const t = setTimeout(() => inputRef.current?.focus(), 100);
        return () => clearTimeout(t);
    }, []);

    // Fetch popular data for pre-search state
    useEffect(() => {
        authApi<PopularClub[]>("/clubs?limit=5")
            .then(setPopularClubs)
            .catch(console.error);
        authApi<UpcomingEvent[]>("/events?upcoming=true&limit=4")
            .then(setUpcomingEvents)
            .catch(console.error);
    }, []);

    useEffect(() => {
        const q = query.trim();
        if (!q) { setResults({ clubs: [], events: [], posts: [] }); return; }

        const timer = setTimeout(() => {
            setLoading(true);
            authApi<SearchResults>(`/search?q=${encodeURIComponent(q)}`)
                .then(setResults)
                .catch(console.error)
                .finally(() => setLoading(false));
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const { clubs, events, posts } = results;

    const visibleClubs  = category === "all" || category === "clubs"  ? clubs  : [];
    const visibleEvents = category === "all" || category === "events" ? events : [];
    const visiblePosts  = category === "all" || category === "posts"  ? posts  : [];
    const totalCount = visibleClubs.length + visibleEvents.length + visiblePosts.length;
    const hasResults = query.trim().length > 0 && !loading;
    const categoryCounts: Record<SearchCategory, number> = {
        all: clubs.length + events.length + posts.length,
        events: events.length,
        clubs: clubs.length,
        posts: posts.length,
    };

    return (
        <SafeAreaView style={s.page} edges={["top"]}>
            {/* Header */}
            <View style={s.header}>
                <Pressable onPress={() => router.back()} style={s.backGroup}>
                    <Ionicons name="arrow-back" size={18} color={C.primary} />
                    <Text style={s.backLabel}>{t.back}</Text>
                </Pressable>
                <View style={s.inputWrap}>
                    <Ionicons name="search" size={15} color={C.textLight} />
                    <TextInput
                        ref={inputRef}
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t.searchPlaceholder}
                        placeholderTextColor={C.textLight}
                        style={s.input}
                        returnKeyType="search"
                    />
                    {query.length > 0 && (
                        <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.clearSearchLabel}>
                            <Ionicons name="close-circle" size={17} color={C.textLight} />
                        </Pressable>
                    )}
                </View>
            </View>

            {/* Hero */}
            <View style={s.hero}>
                <Text style={s.heroLabel}>{t.campusSearch}</Text>
                <Text style={s.heroTitle}>{t.findAnything}</Text>
                <View style={s.heroAccent} />
            </View>

            {/* Filter pills */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.filterRow}
                style={s.filterScroll}
            >
                {CATEGORIES.map(({ key }) => {
                    const count = hasResults ? categoryCounts[key] : null;
                    const label = key === "all" ? t.filterAll : key === "events" ? t.events : key === "clubs" ? t.clubs : t.posts;
                    return (
                        <Pressable
                            key={key}
                            onPress={() => setCategory(key)}
                            style={[s.filterPill, category === key && s.filterPillActive]}
                        >
                            <Text style={[s.filterPillText, category === key && s.filterPillTextActive]}>
                                {count != null ? `${label} (${count})` : label}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={s.list}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {query.trim().length === 0 ? (
                    <>
                        {/* Popular clubs */}
                        {popularClubs.length > 0 && (
                            <>
                                <View style={s.sectionHeaderRow}>
                                    <Text style={s.sectionTitle}>{t.popularClubs}</Text>
                                    <View style={s.sectionLine} />
                                </View>
                                {popularClubs.map((club) => (
                                    <Pressable
                                        key={club.id}
                                        style={s.card}
                                        onPress={() => router.push(`/club/${club.id}` as any)}
                                    >
                                        <View style={s.cardAccent} />
                                        <View style={s.cardIcon}>
                                            {club.logoUrl
                                                ? <Image source={{ uri: club.logoUrl }} style={s.cardLogoImg} />
                                                : <Ionicons name="people" size={22} color={C.primary} />
                                            }
                                        </View>
                                        <View style={s.cardContent}>
                                            <Text style={s.cardLabel}>CLUB{club.category ? ` · ${translateCategory(club.category, lang).toUpperCase()}` : ""}</Text>
                                            <Text style={s.cardTitle} numberOfLines={1}>{club.clubName}</Text>
                                            <Text style={s.cardMeta}>{club._count.followedBy} followers</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={16} color={C.textLight} style={{ alignSelf: "center" }} />
                                    </Pressable>
                                ))}
                            </>
                        )}

                        {/* Upcoming events */}
                        {upcomingEvents.length > 0 && (
                            <>
                                <View style={[s.sectionHeaderRow, { marginTop: 12 }]}>
                                    <Text style={s.sectionTitle}>{t.upcomingEventsLabel}</Text>
                                    <View style={s.sectionLine} />
                                </View>
                                {upcomingEvents.map((event) => {
                                    const evLocale = pickLocale(event.locales, lang);
                                    const evTitle = evLocale.title ?? event.title ?? t.untitledEvent;
                                    const evPoster = evLocale.posterUrl ?? (evLocale as any).imageUrl ?? event.posterUrl;
                                    const evClubName = event.clubName ?? event.club?.clubName;
                                    return (
                                    <Pressable
                                        key={event.id}
                                        style={s.card}
                                        onPress={() => router.push({ pathname: "/event/[id]", params: { id: event.id } })}
                                    >
                                        <View style={[s.cardAccent, { backgroundColor: "#1D4ED8" }]} />
                                        <View style={s.cardPoster}>
                                            {evPoster
                                                ? <Image source={{ uri: evPoster }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                                                : <Ionicons name="calendar" size={20} color="#1D4ED8" />
                                            }
                                        </View>
                                        <View style={s.cardContent}>
                                            <Text style={[s.cardLabel, { color: "#1D4ED8" }]}>
                                                EVENT{evClubName ? ` · ${evClubName.toUpperCase()}` : ""}
                                            </Text>
                                            <Text style={s.cardTitle} numberOfLines={2}>{evTitle}</Text>
                                            {(event.startAt || event.locationName) ? (
                                                <Text style={s.cardMeta} numberOfLines={1}>
                                                    {[fmtDate(event.startAt, lang), event.locationName].filter(Boolean).join(" · ")}
                                                </Text>
                                            ) : null}
                                        </View>
                                        <Ionicons name="chevron-forward" size={16} color={C.textLight} style={{ alignSelf: "center" }} />
                                    </Pressable>
                                    );
                                })}
                            </>
                        )}
                    </>
                ) : loading ? (
                    <ActivityIndicator color={C.primary} style={{ marginTop: 60 }} />
                ) : totalCount === 0 ? (
                    <View style={s.emptyState}>
                        <Ionicons name="search-outline" size={36} color={C.textFaint} />
                        <Text style={s.emptyTitle}>{t.noResults}</Text>
                        <Text style={s.emptySubtitle}>{t.noResultsFor(query)}</Text>
                    </View>
                ) : (
                    <>
                        <Text style={s.resultsCount}>
                            {t.resultsCount(totalCount)}
                        </Text>

                        {/* Section: Clubs */}
                        {visibleClubs.length > 0 && (
                            <>
                                <View style={s.sectionHeaderRow}>
                                    <Text style={s.sectionTitle}>{t.clubsTab}</Text>
                                    <View style={s.sectionLine} />
                                </View>
                                {visibleClubs.map((club) => (
                                    <Pressable
                                        key={club.id}
                                        style={s.card}
                                        onPress={() => router.push(`/club/${club.id}` as any)}
                                    >
                                        <View style={s.cardAccent} />
                                        <View style={s.cardIcon}>
                                            {club.logoUrl
                                                ? <Image source={{ uri: club.logoUrl }} style={s.cardLogoImg} />
                                                : <Ionicons name="people" size={22} color={C.primary} />
                                            }
                                        </View>
                                        <View style={s.cardContent}>
                                            <Text style={s.cardLabel}>CLUB{club.category ? ` · ${translateCategory(club.category, lang).toUpperCase()}` : ""}</Text>
                                            <Text style={s.cardTitle} numberOfLines={1}>{club.clubName}</Text>
                                            {club.description ? (
                                                <Text style={s.cardMeta} numberOfLines={1}>{lang === "fr" && club.descriptionFr ? club.descriptionFr : club.description}</Text>
                                            ) : null}
                                            <Text style={s.cardMeta}>{club._count.followedBy} followers</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={16} color={C.textLight} style={{ alignSelf: "center" }} />
                                    </Pressable>
                                ))}
                            </>
                        )}

                        {/* Section: Events */}
                        {visibleEvents.length > 0 && (
                            <>
                                <View style={s.sectionHeaderRow}>
                                    <Text style={s.sectionTitle}>{t.eventsUpper}</Text>
                                    <View style={s.sectionLine} />
                                </View>
                                {visibleEvents.map((event) => (
                                    <Pressable
                                        key={event.id}
                                        style={s.card}
                                        onPress={() => router.push({ pathname: "/event/[id]", params: { id: event.id } })}
                                    >
                                        <View style={[s.cardAccent, { backgroundColor: "#1D4ED8" }]} />
                                        <View style={s.cardPoster}>
                                            {event.posterUrl
                                                ? <Image source={{ uri: event.posterUrl }} style={StyleSheet.absoluteFill as any} resizeMode="cover" />
                                                : <Ionicons name="calendar" size={20} color="#1D4ED8" />
                                            }
                                        </View>
                                        <View style={s.cardContent}>
                                            <Text style={[s.cardLabel, { color: "#1D4ED8" }]}>
                                                EVENT{event.clubName ? ` · ${event.clubName.toUpperCase()}` : ""}
                                            </Text>
                                            <Text style={s.cardTitle} numberOfLines={2}>{event.title}</Text>
                                            {(event.startAt || event.locationName) ? (
                                                <Text style={s.cardMeta} numberOfLines={1}>
                                                    {[fmtDate(event.startAt, lang), event.locationName].filter(Boolean).join(" · ")}
                                                </Text>
                                            ) : null}
                                        </View>
                                        <Ionicons name="chevron-forward" size={16} color={C.textLight} style={{ alignSelf: "center" }} />
                                    </Pressable>
                                ))}
                            </>
                        )}

                        {/* Section: Posts */}
                        {visiblePosts.length > 0 && (
                            <>
                                <View style={s.sectionHeaderRow}>
                                    <Text style={s.sectionTitle}>{t.postsUpper}</Text>
                                    <View style={s.sectionLine} />
                                </View>
                                {visiblePosts.map((post) => (
                                    <Pressable
                                        key={post.id}
                                        style={s.card}
                                        onPress={() => post.type === "EVENT"
                                            ? router.push({ pathname: "/event/[id]", params: { id: post.id } })
                                            : router.push({ pathname: "/post/[id]", params: { id: post.id } })
                                        }
                                    >
                                        <View style={[s.cardAccent, { backgroundColor: post.type === "POLL" ? "#7C3AED" : C.textBody }]} />
                                        <View style={[s.cardIcon, { backgroundColor: post.type === "POLL" ? "#EDE9FE" : C.border }]}>
                                            <Ionicons
                                                name={post.type === "POLL" ? "bar-chart-outline" : post.type === "ANNOUNCEMENT" ? "megaphone-outline" : "newspaper-outline"}
                                                size={20}
                                                color={post.type === "POLL" ? "#7C3AED" : C.textBody}
                                            />
                                        </View>
                                        <View style={s.cardContent}>
                                            <Text style={s.cardLabel}>{post.type} · {post.clubName.toUpperCase()}</Text>
                                            <Text style={s.cardTitle} numberOfLines={2}>{post.title}</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={16} color={C.textLight} style={{ alignSelf: "center" }} />
                                    </Pressable>
                                ))}
                            </>
                        )}
                    </>
                )}
                <View style={{ height: 60 }} />
            </ScrollView>
        </SafeAreaView>
    );
}
