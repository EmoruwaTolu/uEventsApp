import React, { useEffect, useMemo, useState } from "react";
import {
    View, Text, ScrollView, Pressable, Alert,
    StyleSheet, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { useApi } from "../lib/useApi";
import { useT } from "../lib/LangContext";
import { useToast } from "../lib/ToastContext";
import { useTheme } from "../lib/ThemeContext";
import type { AppColors } from "../styles/theme";

type BlockedUser = {
    id: string;
    name: string;
    avatarUrl?: string | null;
    type: string;
};

export default function BlockedUsersScreen() {
    const router = useRouter();
    const authApi = useApi();
    const t = useT();
    const { showToast } = useToast();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);

    const [users, setUsers] = useState<BlockedUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        authApi<BlockedUser[]>("/users/me/blocks")
            .then((data) => { if (alive) { setUsers(data); setError(false); } })
            .catch(() => { if (alive) setError(true); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    function confirmUnblock(u: BlockedUser) {
        Alert.alert(t.unblockConfirmTitle(u.name), t.unblockConfirmMsg, [
            { text: t.cancelBtn, style: "cancel" },
            {
                text: t.unblockBtn,
                style: "destructive",
                onPress: async () => {
                    setBusyId(u.id);
                    try {
                        await authApi(`/users/${u.id}/block`, { method: "DELETE" });
                        setUsers((prev) => prev.filter((x) => x.id !== u.id));
                        showToast(t.unblockedToast(u.name));
                    } catch {
                        showToast(t.blockError, "error");
                    } finally {
                        setBusyId(null);
                    }
                },
            },
        ]);
    }

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            <View style={s.topBar}>
                <Pressable
                    onPress={() => router.canGoBack() ? router.back() : router.replace("/settings" as any)}
                    style={s.backGroup}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t.back}
                >
                    <Ionicons name="arrow-back" size={18} color={C.primary} />
                    <Text style={s.backLabel}>{t.back}</Text>
                </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
                <View style={s.masthead}>
                    <Text style={s.mastheadHeading}>{t.blockedUsers}</Text>
                    <View style={s.mastheadAccent} />
                </View>

                {loading ? (
                    <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
                ) : error ? (
                    <Text style={s.emptyText}>{t.blockedUsersLoadError}</Text>
                ) : users.length === 0 ? (
                    <View style={s.emptyWrap}>
                        <Ionicons name="shield-checkmark-outline" size={32} color={C.textFaint} />
                        <Text style={s.emptyText}>{t.blockedUsersEmpty}</Text>
                    </View>
                ) : (
                    <View style={s.card}>
                        {users.map((u, i) => (
                            <View key={u.id}>
                                {i > 0 && <View style={s.divider} />}
                                <View style={s.row}>
                                    <View style={s.avatar}>
                                        {u.avatarUrl
                                            ? <ExpoImage source={{ uri: u.avatarUrl }} style={s.avatarImg} contentFit="cover" transition={200} />
                                            : <Text style={s.avatarInit}>{u.name[0]?.toUpperCase()}</Text>}
                                    </View>
                                    <Text style={s.name} numberOfLines={1}>{u.name}</Text>
                                    <Pressable
                                        onPress={() => confirmUnblock(u)}
                                        disabled={busyId === u.id}
                                        style={({ pressed }) => [s.unblockBtn, pressed && { opacity: 0.6 }]}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${t.unblockBtn} ${u.name}`}
                                    >
                                        {busyId === u.id
                                            ? <ActivityIndicator size="small" color={C.primary} />
                                            : <Text style={s.unblockBtnText}>{t.unblockBtn}</Text>}
                                    </Pressable>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const makeStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
    backGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
    backLabel: { fontSize: 14, fontWeight: "900", color: C.primary, letterSpacing: 2 },
    scroll: { paddingBottom: 32 },
    masthead: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },
    mastheadHeading: { fontSize: 40, fontWeight: "900", color: C.text, letterSpacing: -1.2, lineHeight: 44 },
    mastheadAccent: { width: 48, height: 3, backgroundColor: C.primary, marginTop: 14 },

    card: {
        backgroundColor: C.surface,
        marginHorizontal: 12,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: C.borderWarm,
    },
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, gap: 12 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.borderWarm, marginLeft: 60 },

    avatar: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: C.primaryBg,
        alignItems: "center", justifyContent: "center",
        overflow: "hidden", flexShrink: 0,
    },
    avatarImg: { width: 36, height: 36, borderRadius: 18 },
    avatarInit: { fontSize: 14, fontWeight: "800", color: C.primary },
    name: { flex: 1, fontSize: 14, fontWeight: "700", color: C.text },

    unblockBtn: {
        paddingVertical: 7, paddingHorizontal: 14,
        borderWidth: 1, borderColor: C.primary,
        minWidth: 84, alignItems: "center",
    },
    unblockBtnText: { fontSize: 11, fontWeight: "900", color: C.primary, letterSpacing: 1.5 },

    emptyWrap: { alignItems: "center", gap: 12, marginTop: 40, paddingHorizontal: 40 },
    emptyText: { fontSize: 14, color: C.textLight, textAlign: "center", marginTop: 40 },
});
