import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useApi } from "../lib/useApi";
import { useT, useLang } from "../lib/LangContext";
import { timeAgo } from "../lib/datetime";
import { useTheme } from "../lib/ThemeContext";
import type { AppColors } from "../styles/theme";
import { NotifRowSkeleton } from "../components/SkeletonLoader";

type ApiNotif = {
    id: string;
    type: string;
    title: string;
    body: string;
    isRead: boolean;
    createdAt: string;
    metadata?: { postId?: string; postType?: string } | null;
};

function typeIcon(type: string): string {
    if (type === "EVENT")    return "calendar-outline";
    if (type === "POST")     return "megaphone-outline";
    if (type === "LIKE")     return "heart-outline";
    if (type === "FOLLOW")   return "people-outline";
    if (type === "REMINDER") return "alarm-outline";
    return "notifications-outline";
}

function typeColor(type: string): { bg: string; icon: string } {
    if (type === "LIKE")     return { bg: "#FEE2E2", icon: "#8C0327" };
    if (type === "FOLLOW")   return { bg: "#DBEAFE", icon: "#1D4ED8" };
    if (type === "REMINDER") return { bg: "#FEF3C7", icon: "#D97706" };
    if (type === "POST")     return { bg: "#E5E7EB", icon: "#374151" };
    return { bg: "#FEE2E2", icon: "#8C0327" };
}



const makeStyles = (C: AppColors) => StyleSheet.create({
    page: { flex: 1, backgroundColor: C.bg },

    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    backGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
    backLabel: { fontSize: 14, fontWeight: "900", color: C.primary, letterSpacing: 2 },
    markAllBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#1F2937" },
    markAllText: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 1 },

    hero: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },
    heroLabel: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 2, marginBottom: 6 },
    heroTitle: { fontSize: 40, fontWeight: "900", color: C.text, letterSpacing: -1.2, lineHeight: 44 },
    heroSubtitle: { fontSize: 13, fontWeight: "600", color: C.textMuted, letterSpacing: 1, marginTop: 8 },
    heroAccent: { width: 48, height: 3, backgroundColor: C.primary, marginTop: 14 },
    unreadBadge: {
        alignSelf: "flex-start",
        marginTop: 12,
        backgroundColor: C.primary,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    unreadBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1 },

    item: {
        flexDirection: "row",
        alignItems: "flex-start",
        backgroundColor: C.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.border,
    },
    itemUnread: { backgroundColor: "#FFFBFB" },
    itemAccent: { width: 3, alignSelf: "stretch", flexShrink: 0 },
    iconWrap: {
        width: 40, height: 40,
        alignItems: "center", justifyContent: "center",
        flexShrink: 0, margin: 14, marginRight: 0,
    },
    itemContent: { flex: 1, minWidth: 0, padding: 14, gap: 3 },
    itemTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
    notifTitle: { fontSize: 13, fontWeight: "800", color: C.text, flex: 1 },
    notifTime: { fontSize: 10, fontWeight: "600", color: C.textLight, flexShrink: 0 },
    notifBody: { fontSize: 13, color: C.textMuted, lineHeight: 18 },

    emptyState: { alignItems: "center", paddingTop: 80, gap: 10 },
    emptyTitle: { fontSize: 13, fontWeight: "900", color: C.textFaint, letterSpacing: 2 },
    emptySubtitle: { fontSize: 13, color: C.textLight },

    errorText: { fontSize: 11, fontWeight: "700", color: C.textLight, letterSpacing: 2, marginTop: 12 },
    errorRetry: { marginTop: 16, borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 20, paddingVertical: 10 },
    errorRetryText: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1.5 },
});

export default function NotificationsScreen() {
    const router = useRouter();
    const authApi = useApi();
    const t = useT();
    const { lang } = useLang();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    const [notifications, setNotifications] = useState<ApiNotif[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(false);

    function loadNotifications(isRefresh = false) {
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setError(false);
        authApi<ApiNotif[]>("/notifications")
            .then(setNotifications)
            .catch(() => setError(true))
            .finally(() => isRefresh ? setRefreshing(false) : setLoading(false));
    }

    useEffect(() => {
        loadNotifications();
        // Opening this screen counts as "seen" — clear the iOS app-icon badge.
        Notifications.setBadgeCountAsync(0).catch(() => {});
    }, []);

    async function markAllRead() {
        await authApi("/notifications/read-all", { method: "PATCH" }).catch(console.error);
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    }

    async function markRead(id: string) {
        await authApi(`/notifications/${id}/read`, { method: "PATCH" }).catch(console.error);
        setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
    }

    function handleTap(n: ApiNotif) {
        markRead(n.id);
        const postId = n.metadata?.postId;
        if (!postId) return;
        if (n.type === "EVENT" || n.metadata?.postType === "EVENT") {
            router.push({ pathname: "/event/[id]", params: { id: postId } });
        } else {
            router.push({ pathname: "/post/[id]", params: { id: postId } });
        }
    }

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    if (error) {
        return (
            <SafeAreaView style={s.page} edges={["top"]}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
                    <Ionicons name="cloud-offline-outline" size={36} color={C.textFaint} />
                    <Text style={s.errorText}>{t.couldntLoadNotifications}</Text>
                    <Pressable style={s.errorRetry} onPress={() => loadNotifications()} accessibilityRole="button" accessibilityLabel="Retry">
                        <Text style={s.errorRetryText}>{t.retry}</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={s.page} edges={["top"]}>
            {/* Top bar */}
            <View style={s.header}>
                <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)} style={s.backGroup} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.back}>
                    <Ionicons name="arrow-back" size={18} color={C.primary} />
                    <Text style={s.backLabel}>{t.back}</Text>
                </Pressable>
                {unreadCount > 0 && (
                    <Pressable onPress={markAllRead} style={s.markAllBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel={t.markAllRead}>
                        <Text style={s.markAllText}>{t.markAllRead}</Text>
                    </Pressable>
                )}
            </View>

            {/* Masthead */}
            <View style={s.hero}>
                <Text style={s.heroTitle}>{t.notifications}</Text>
                {unreadCount > 0 && <Text style={s.heroSubtitle}>{t.unreadCount(unreadCount)}</Text>}
                <View style={s.heroAccent} />
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadNotifications(true)} tintColor={C.primary} />}>
                {loading ? (
                    [0, 1, 2, 3, 4, 5].map((i) => <NotifRowSkeleton key={i} />)
                ) : notifications.length === 0 ? (
                    <View style={s.emptyState}>
                        <Ionicons name="notifications-off-outline" size={36} color={C.textFaint} />
                        <Text style={s.emptyTitle}>{t.allClear}</Text>
                        <Text style={s.emptySubtitle}>{t.noNotifications}</Text>
                    </View>
                ) : (
                    notifications.map((n) => {
                        const colors = typeColor(n.type);
                        return (
                            <Pressable
                                key={n.id}
                                style={[s.item, !n.isRead && s.itemUnread]}
                                onPress={() => handleTap(n)}
                                accessibilityRole="button"
                                accessibilityHint={n.isRead ? undefined : "Unread"}
                            >
                                {/* Left accent for unread */}
                                <View style={[s.itemAccent, { backgroundColor: n.isRead ? "transparent" : C.primary }]} />

                                <View style={[s.iconWrap, { backgroundColor: colors.bg }]}>
                                    <Ionicons name={typeIcon(n.type) as any} size={18} color={colors.icon} />
                                </View>

                                <View style={s.itemContent}>
                                    <View style={s.itemTopRow}>
                                        <Text style={s.notifTitle} numberOfLines={1}>{n.title}</Text>
                                        <Text style={s.notifTime}>{timeAgo(n.createdAt, lang)}</Text>
                                    </View>
                                    <Text style={s.notifBody} numberOfLines={2}>{n.body}</Text>
                                </View>
                            </Pressable>
                        );
                    })
                )}
                <View style={{ height: 80 }} />
            </ScrollView>
        </SafeAreaView>
    );
}
