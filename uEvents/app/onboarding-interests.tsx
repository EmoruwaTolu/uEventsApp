// app/onboarding-interests.tsx — one-time interest picker shown to students
// right after signup. Fixes the For You cold start: pick 3+ topics and follow
// a few popular clubs so the ranked feed has signals on day one. Skippable;
// everything here can also be changed later from the Search tab.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../lib/useApi";
import { useTheme } from "../lib/ThemeContext";
import { useLang, useT } from "../lib/LangContext";
import { EVENT_TAGS } from "../lib/eventTags";
import { translateCategory } from "../lib/categories";
import { analytics } from "../lib/analytics";
import ClubBadge from "../components/ClubBadge";
import type { AppColors } from "../styles/theme";

const MIN_TOPICS = 3;

type ApiClub = {
    id: string;
    clubName?: string;
    clubNameFr?: string;
    category?: string;
    logoUrl?: string;
    _count?: { followedBy: number };
};

export default function OnboardingInterests() {
    const router = useRouter();
    const { completeInterests } = useAuth();
    const authApi = useApi();
    const { colors: C } = useTheme();
    const { lang } = useLang();
    const t = useT();
    const s = useMemo(() => makeStyles(C), [C]);

    const [topics, setTopics] = useState<Set<string>>(new Set());
    const [clubIds, setClubIds] = useState<Set<string>>(new Set());
    const [clubs, setClubs] = useState<ApiClub[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Most-followed clubs first (the endpoint already orders by follower count).
        authApi<ApiClub[]>("/clubs?limit=6").then(setClubs).catch(() => {});
    }, []);

    function toggleTopic(tag: string) {
        setTopics((prev) => {
            const next = new Set(prev);
            next.has(tag) ? next.delete(tag) : next.add(tag);
            return next;
        });
    }

    function toggleClub(id: string) {
        setClubIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    async function finish(skipped: boolean) {
        if (saving) return;
        setSaving(true);
        analytics.track("onboarding_interests", {
            skipped,
            topics: skipped ? 0 : topics.size,
            clubs: skipped ? 0 : clubIds.size,
        });
        if (!skipped) {
            // Fire the follows; individual failures are non-fatal (users can
            // redo any of this from Search), so settle rather than fail.
            const results = await Promise.allSettled([
                ...[...topics].map((category) =>
                    authApi("/users/me/topics", { method: "POST", body: JSON.stringify({ category }) })
                ),
                ...[...clubIds].map((id) => authApi(`/clubs/${id}/follow`, { method: "POST" })),
            ]);
            if (results.some((r) => r.status === "rejected")) {
                analytics.captureError(new Error("onboarding-interests: partial save"), {
                    failed: results.filter((r) => r.status === "rejected").length,
                });
            }
        }
        await completeInterests();
        setSaving(false);
        router.replace("/(tabs)");
    }

    const canContinue = topics.size >= MIN_TOPICS;

    return (
        <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                <Text style={s.eyebrow}>{t.obEyebrow}</Text>
                <Text style={s.title} maxFontSizeMultiplier={1.2}>{t.obTitle}</Text>
                <Text style={s.subtitle}>{t.obSubtitle}</Text>

                <Text style={s.sectionHeader}>{t.obTopicsHeader}</Text>
                <View style={s.chipWrap}>
                    {EVENT_TAGS.map((tag) => {
                        const on = topics.has(tag);
                        return (
                            <Pressable
                                key={tag}
                                onPress={() => toggleTopic(tag)}
                                style={[s.chip, on && s.chipOn]}
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={translateCategory(tag, lang)}
                            >
                                <Text style={[s.chipText, on && s.chipTextOn]} maxFontSizeMultiplier={1.3}>
                                    {translateCategory(tag, lang).toUpperCase()}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {clubs.length > 0 && (
                    <>
                        <Text style={s.sectionHeader}>{t.obClubsHeader}</Text>
                        <Text style={s.sectionSub}>{t.obClubsSub}</Text>
                        <View style={s.clubList}>
                            {clubs.map((club) => {
                                const name = (lang === "fr" && club.clubNameFr) ? club.clubNameFr : (club.clubName ?? "");
                                const on = clubIds.has(club.id);
                                return (
                                    <Pressable
                                        key={club.id}
                                        onPress={() => toggleClub(club.id)}
                                        style={s.clubRow}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: on }}
                                        accessibilityLabel={name}
                                    >
                                        <ClubBadge logoUri={club.logoUrl} name={name} size={40} />
                                        <View style={s.clubInfo}>
                                            <Text style={s.clubName} numberOfLines={1}>{name}</Text>
                                            {!!club.category && (
                                                <Text style={s.clubCat} numberOfLines={1}>
                                                    {translateCategory(club.category, lang).toUpperCase()}
                                                </Text>
                                            )}
                                        </View>
                                        <View style={[s.followBtn, on && s.followBtnOn]}>
                                            <Text style={[s.followText, on && s.followTextOn]} maxFontSizeMultiplier={1.2}>
                                                {on ? t.following : t.follow}
                                            </Text>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </>
                )}
            </ScrollView>

            <View style={s.footer}>
                {!canContinue && <Text style={s.hint}>{t.obPickAtLeast}</Text>}
                <Pressable
                    onPress={() => finish(false)}
                    disabled={!canContinue || saving}
                    style={[s.continueBtn, (!canContinue || saving) && s.continueBtnDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel={t.obContinue}
                    accessibilityState={{ disabled: !canContinue || saving }}
                >
                    {saving
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={s.continueText} maxFontSizeMultiplier={1.2}>{t.obContinue}</Text>}
                </Pressable>
                <Pressable onPress={() => finish(true)} disabled={saving} style={s.skipBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.obSkip}>
                    <Text style={s.skipText}>{t.obSkip}</Text>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

const makeStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    scroll: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 },
    eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 3, color: C.gold, marginBottom: 10 },
    title: { fontSize: 28, fontWeight: "900", letterSpacing: 0.5, color: C.text, marginBottom: 10 },
    subtitle: { fontSize: 14, lineHeight: 20, color: C.textMuted, marginBottom: 28 },
    sectionHeader: { fontSize: 12, fontWeight: "800", letterSpacing: 2, color: C.text, marginBottom: 12, marginTop: 8 },
    sectionSub: { fontSize: 13, color: C.textMuted, marginBottom: 14, marginTop: -6 },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 28 },
    chip: {
        paddingHorizontal: 14, paddingVertical: 10, minHeight: 38,
        borderWidth: 1, borderColor: C.borderWarm, backgroundColor: C.surface,
        alignItems: "center", justifyContent: "center",
    },
    chipOn: { backgroundColor: C.primary, borderColor: C.primary },
    chipText: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: C.textBody },
    chipTextOn: { color: "#fff" },
    clubList: { gap: 4 },
    clubRow: {
        flexDirection: "row", alignItems: "center", gap: 12,
        paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderWarm,
    },
    clubInfo: { flex: 1, minWidth: 0 },
    clubName: { fontSize: 14, fontWeight: "700", color: C.text },
    clubCat: { fontSize: 10, fontWeight: "700", letterSpacing: 1, color: C.textLight, marginTop: 2 },
    followBtn: {
        paddingHorizontal: 14, paddingVertical: 8, minHeight: 32,
        borderWidth: 1, borderColor: C.primary, alignItems: "center", justifyContent: "center",
    },
    followBtnOn: { backgroundColor: C.primary },
    followText: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: C.primary },
    followTextOn: { color: "#fff" },
    footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.borderWarm, backgroundColor: C.bg },
    hint: { fontSize: 12, color: C.textLight, textAlign: "center", marginBottom: 10 },
    continueBtn: { backgroundColor: C.primary, minHeight: 52, alignItems: "center", justifyContent: "center" },
    continueBtnDisabled: { opacity: 0.4 },
    continueText: { fontSize: 13, fontWeight: "800", letterSpacing: 2, color: "#fff" },
    skipBtn: { alignItems: "center", paddingVertical: 14 },
    skipText: { fontSize: 12, color: C.textLight, textDecorationLine: "underline" },
});
