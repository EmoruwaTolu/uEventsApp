import { useRef, useState, useCallback, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    Animated,
    View,
    Text,
    ScrollView,
    Pressable,
    StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect, Redirect } from "expo-router";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../auth/AuthContext";
import { useT } from "../../lib/LangContext";
import CreateEventForm from "../../components/create/CreateEventForm";
import CreatePollForm from "../../components/create/CreatePollForm";
import CreateAnnouncementForm from "../../components/create/CreateAnnouncementForm";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";

type ContentType = "event" | "announcement" | "poll";

export type EventCore = {
    startAt?: string;
    endAt?: string;
    locationName?: string;
    address?: string;
    categories?: string[];
};

export type PollOption = {
    id: string;
    text: string;
};

export type PollCore = {
    expiresAt?: string;
    allowMultiple: boolean;
    options: PollOption[];
};

const makeCreateStyles = (C: AppColors) => StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: C.bg,
    },

    // ── Top bar ──────────────────────────────────────────────────────────────
    topBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 14,
    },
    topBarIcon: { width: 32 },
    topBarTitle: {
        fontSize: 13,
        fontWeight: "800",
        color: C.text,
        letterSpacing: 2,
    },

    // ── Hero ─────────────────────────────────────────────────────────────────
    hero: {
        paddingHorizontal: 20,
        paddingBottom: 28,
    },
    heroLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
        marginBottom: 8,
    },
    heroHeading: {
        fontSize: 42,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -1,
        lineHeight: 46,
    },
    heroAccent: {
        width: 48,
        height: 3,
        backgroundColor: C.primary,
        marginTop: 14,
    },

    // ── Quick links ──────────────────────────────────────────────────────────
    quickLinks: {
        flexDirection: "row",
        paddingHorizontal: 16,
        gap: 8,
        marginBottom: 16,
    },
    quickLink: {
        flex: 1,
        backgroundColor: C.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
        paddingVertical: 12,
        alignItems: "center",
        gap: 5,
    },
    quickLinkText: {
        fontSize: 9,
        fontWeight: "800",
        color: C.textBody,
        letterSpacing: 1,
        textAlign: "center",
    },

    // ── Cards ────────────────────────────────────────────────────────────────
    cards: {
        paddingHorizontal: 16,
        gap: 10,
    },
    card: {
        backgroundColor: C.surfaceAlt,
        padding: 20,
        gap: 6,
    },
    cardFeatured: {
        backgroundColor: C.surface,
        borderLeftWidth: 3,
        borderLeftColor: C.primary,
    },
    cardIcon: {
        width: 40,
        height: 40,
        borderRadius: 6,
        backgroundColor: C.textBody,
        alignItems: "center",
        justifyContent: "center",
    },
    cardIconFeatured: {
        backgroundColor: C.primary,
    },
    cardLabel: {
        fontSize: 16,
        fontWeight: "800",
        color: C.text,
        letterSpacing: 0.5,
    },
    cardDesc: {
        fontSize: 13,
        color: C.textMuted,
        lineHeight: 19,
        marginTop: 2,
    },
    cardFooter: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        marginTop: 10,
    },
    cardCta: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textLight,
        letterSpacing: 1,
    },
    cardCtaFeatured: {
        color: C.primary,
    },

    // ── Analytics ────────────────────────────────────────────────────────────
    analyticsCard: {
        backgroundColor: C.surfaceAlt,
        paddingHorizontal: 20,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
    },

    // ── Drafts ───────────────────────────────────────────────────────────────
    draftsCard: {
        marginHorizontal: 16,
        marginTop: 16,
        backgroundColor: "#1F2937",
        padding: 20,
        gap: 14,
    },
    draftsLeft: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 14,
    },
    draftsIcon: {
        width: 40,
        height: 40,
        borderRadius: 6,
        backgroundColor: "rgba(255,255,255,0.15)",
        alignItems: "center",
        justifyContent: "center",
    },
    draftsTitle: {
        fontSize: 14,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 0.5,
    },
    draftsSubtitle: {
        fontSize: 12,
        color: "rgba(255,255,255,0.55)",
        lineHeight: 17,
        marginTop: 3,
    },
    draftsActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    draftsBadge: {
        backgroundColor: C.primary,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    draftsBadgeText: {
        fontSize: 10,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 1,
    },
    draftsBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        backgroundColor: "#111827",
        paddingVertical: 10,
    },
    draftsBtnText: {
        fontSize: 11,
        fontWeight: "700",
        color: "#fff",
        letterSpacing: 1,
    },

    // ── Form top bar ─────────────────────────────────────────────────────────
    formTopBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.border,
        backgroundColor: C.surface,
    },
    backBtn: { width: 32 },
    formTopBarTitle: {
        fontSize: 12,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },

    // ── Form ────────────────────────────────────────────────────────────────
    formContainer: {
        paddingHorizontal: 16,
        gap: 16,
        paddingTop: 16,
    },
    langSection: {
        gap: 10,
        backgroundColor: C.surfaceAlt,
        padding: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.border,
    },
    langSectionHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    langSectionTitle: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textBody,
        letterSpacing: 1.5,
    },
    langRow: {
        flexDirection: "row",
        gap: 10,
    },
    langTab: {
        flex: 1,
        paddingVertical: 11,
        alignItems: "center",
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
    },
    langTabActive: {
        backgroundColor: C.primary,
        borderColor: C.primary,
    },
    langLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: C.textMuted,
    },
    langLabelActive: {
        color: "#ffffff",
    },
    actions: {
        flexDirection: "row",
        gap: 12,
        marginTop: 4,
    },
    btnDraft: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 13,
        borderWidth: 1.5,
        borderColor: C.border,
        backgroundColor: C.surface,
    },
    btnDraftText: {
        fontSize: 13,
        fontWeight: "700",
        color: C.textBody,
        letterSpacing: 0.5,
    },
    btnPublish: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingVertical: 13,
        backgroundColor: C.primary,
    },
    btnPublishText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#ffffff",
        letterSpacing: 0.5,
    },
});

export default function CreateContentScreen() {
    const router = useRouter();
    const authApi = useApi();
    const { session } = useAuth();
    const t = useT();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeCreateStyles(C), [C]);

    if (session?.userType !== "CLUB") {
        return <Redirect href="/(tabs)/events" />;
    }

    const CONTENT_TYPES: { type: ContentType; icon: any; label: string; desc: string; featured?: boolean }[] = [
        { type: "announcement", icon: "megaphone",       label: t.contentTypeAnnouncement, desc: t.contentTypeAnnouncementDesc },
        { type: "event",        icon: "calendar-sharp",  label: t.contentTypeEvent,        desc: t.contentTypeEventDesc, featured: true },
        { type: "poll",         icon: "grid",            label: t.contentTypePoll,         desc: t.contentTypePollDesc },
    ];

    const [selectedType, setSelectedType] = useState<ContentType | null>(null);
    const [draftCount, setDraftCount] = useState<number | null>(null);
    const formAnim = useRef(new Animated.Value(0)).current;

    function refreshDraftCount() {
        authApi<{ id: string }[]>("/posts/mine?isDraft=true")
            .then((posts) => setDraftCount(posts.length))
            .catch(() => setDraftCount(null));
    }

    useFocusEffect(useCallback(() => {
        refreshDraftCount();
    }, []));

    function openForm(type: ContentType) {
        setSelectedType(type);
        formAnim.setValue(0);
        Animated.spring(formAnim, {
            toValue: 1,
            useNativeDriver: true,
            tension: 60,
            friction: 12,
        }).start();
    }

    function handleBack() {
        Animated.timing(formAnim, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
        }).start(() => {
            setSelectedType(null);
            refreshDraftCount();
        });
    }

    const formStyle = {
        flex: 1,
        opacity: formAnim,
        transform: [{ translateY: formAnim.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) }],
    };

    // ── Event form (dedicated screen) ─────────────────────────────────────────
    if (selectedType === "event") {
        return (
            <Animated.View style={formStyle}>
                <CreateEventForm
                    onBack={handleBack}
                    onSuccess={handleBack}
                    initialValues={undefined}
                />
            </Animated.View>
        );
    }

    // ── Poll form (dedicated screen) ──────────────────────────────────────────
    if (selectedType === "poll") {
        return (
            <Animated.View style={formStyle}>
                <CreatePollForm
                    onBack={handleBack}
                    onSuccess={handleBack}
                    initialValues={undefined}
                />
            </Animated.View>
        );
    }

    // ── Announcement form (dedicated screen) ──────────────────────────────────
    if (selectedType === "announcement") {
        return (
            <Animated.View style={formStyle}>
                <CreateAnnouncementForm
                    onBack={handleBack}
                    onSuccess={handleBack}
                    initialValues={undefined}
                />
            </Animated.View>
        );
    }

    // ── Landing / selector ─────────────────────────────────────────────────────
    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                {/* Top bar */}
                <View style={styles.topBar}>
                    <View style={styles.topBarIcon} />
                    <Text style={styles.topBarTitle}>{t.createHubTitle}</Text>
                    <View style={styles.topBarIcon} />
                </View>

                {/* Hero */}
                <View style={styles.hero}>
                    <Text style={styles.heroLabel}>{t.editorDashboard}</Text>
                    <Text style={styles.heroHeading}>{t.publishToCampus}</Text>
                    <View style={styles.heroAccent} />
                </View>

                {/* Quick links */}
                <View style={styles.quickLinks}>
                    {([
                        { icon: "newspaper-outline", label: t.myPosts,     route: "/my-posts" },
                        { icon: "people-outline",   label: t.clubFollowers, route: `/club/followers?id=${session?.userId}` },
                        { icon: "create-outline",   label: t.editProfile,  route: "/club/edit-profile" },
                    ] as const).map(({ icon, label, route }) => (
                        <Pressable key={label} style={styles.quickLink} onPress={() => router.push(route as any)}>
                            <Ionicons name={icon} size={20} color={C.primary} />
                            <Text style={styles.quickLinkText}>{label}</Text>
                        </Pressable>
                    ))}
                </View>

                {/* Content type cards */}
                <View style={styles.cards}>
                    {/* Analytics card */}
                    <Pressable style={[styles.analyticsCard, styles.cardFeatured]} onPress={() => router.push("/analytics" as any)}>
                        <View style={[styles.cardIcon, styles.cardIconFeatured]}>
                            <Ionicons name="bar-chart" size={22} color="#fff" />
                        </View>
                        <Text style={styles.cardLabel}>{t.analytics}</Text>
                        <Ionicons name="arrow-forward" size={16} color={C.primary} style={{ marginLeft: "auto" }} />
                    </Pressable>

                    {CONTENT_TYPES.map(({ type, icon, label, desc, featured }) => (
                        <Pressable
                            key={type}
                            style={[styles.card, featured && styles.cardFeatured]}
                            onPress={() => openForm(type)}
                        >
                            <View style={[styles.cardIcon, featured && styles.cardIconFeatured]}>
                                <Ionicons name={icon} size={22} color="#fff" />
                            </View>
                            <Text style={styles.cardLabel}>{label}</Text>
                            <Text style={styles.cardDesc}>{desc}</Text>
                            <View style={styles.cardFooter}>
                                <Text style={[styles.cardCta, featured && styles.cardCtaFeatured]}>
                                    {t.selectMode}
                                </Text>
                                <Ionicons
                                    name="arrow-forward"
                                    size={13}
                                    color={featured ? C.primary : C.textLight}
                                />
                            </View>
                        </Pressable>
                    ))}
                </View>

                {/* Drafts card */}
                <View style={styles.draftsCard}>
                    <View style={styles.draftsLeft}>
                        <View style={styles.draftsIcon}>
                            <Ionicons name="mail" size={22} color="#fff" />
                        </View>
                        <View>
                            <Text style={styles.draftsTitle}>{t.yourDrafts}</Text>
                            <Text style={styles.draftsSubtitle}>{t.draftsSubtitle}</Text>
                        </View>
                    </View>
                    <View style={styles.draftsActions}>
                        <View style={styles.draftsBadge}>
                            <Text style={styles.draftsBadgeText}>{draftCount ?? "—"} {t.pendingLabel}</Text>
                        </View>
                        <Pressable style={styles.draftsBtn} onPress={() => router.push("/drafts")}>
                            <Text style={styles.draftsBtnText}>{t.viewAll}</Text>
                            <Ionicons name="open-outline" size={12} color="#fff" />
                        </Pressable>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
