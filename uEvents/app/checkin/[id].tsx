import { useEffect, useRef, useState, useMemo } from "react";
import {
    View, Text, ScrollView, Pressable, StyleSheet,
    ActivityIndicator, Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useApi } from "../../lib/useApi";
import { useToast } from "../../lib/ToastContext";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";

const POLL_INTERVAL = 5000;

type Attendee = {
    userId: string;
    checkedAt: string;
    name: string;
    avatarUrl: string | null;
    program: string | null;
    year: string | null;
};

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
}

const makeStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    topBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    backGroup: { flexDirection: "row", alignItems: "center", gap: 6, width: 64 },
    backLabel: { fontSize: 14, fontWeight: "900", color: C.primary, letterSpacing: 2 },
    topBarTitle: { fontSize: 12, fontWeight: "800", color: C.text, letterSpacing: 2 },

    scroll: { paddingHorizontal: 20 },

    qrCard: {
        backgroundColor: C.surface,
        padding: 24,
        alignItems: "center",
        gap: 12,
        marginBottom: 12,
    },
    qrCardLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    qrCardSub: {
        fontSize: 12,
        color: C.textMuted,
        textAlign: "center",
        lineHeight: 18,
    },
    qrWrap: {
        padding: 16,
        backgroundColor: C.surface,
        marginVertical: 8,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
    },
    qrPlaceholder: {
        width: 220,
        height: 220,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: C.bg,
    },

    counterRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginTop: 4,
    },
    liveIndicator: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: "#DCFCE7",
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#16A34A" },
    liveText: { fontSize: 9, fontWeight: "800", color: "#16A34A", letterSpacing: 1 },
    counterNum: { fontSize: 36, fontWeight: "900", color: C.text, letterSpacing: -1 },
    counterLabel: { fontSize: 10, fontWeight: "800", color: C.textMuted, letterSpacing: 1.5 },

    listToggle: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: C.surface,
        paddingHorizontal: 20,
        paddingVertical: 16,
        marginBottom: 2,
    },
    listToggleText: { fontSize: 11, fontWeight: "800", color: C.primary, letterSpacing: 1.5 },

    listBlock: { backgroundColor: C.surface },

    emptyState: { alignItems: "center", paddingVertical: 32 },
    emptyText: { fontSize: 11, fontWeight: "700", color: C.textFaint, letterSpacing: 2 },

    attendeeRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.surfaceAlt,
    },
    avatar: { width: 36, height: 36, borderRadius: 18 },
    avatarPlaceholder: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: C.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
    },
    attendeeInfo: { flex: 1 },
    attendeeName: { fontSize: 14, fontWeight: "700", color: C.text },
    attendeeMeta: { fontSize: 11, color: C.textLight, marginTop: 2 },
    checkedAt: { fontSize: 11, color: C.textLight, fontWeight: "500" },
});

export default function CheckInScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const authApi = useApi();
    const { showToast } = useToast();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);

    const [qrValue, setQrValue] = useState<string | null>(null);
    const [count, setCount] = useState(0);
    const [attendees, setAttendees] = useState<Attendee[]>([]);
    const [showList, setShowList] = useState(false);
    const [loading, setLoading] = useState(true);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    async function fetchCheckins() {
        try {
            const data = await authApi<{ count: number; checkIns: Attendee[] }>(`/posts/${id}/checkins`);
            setCount(data.count);
            setAttendees(data.checkIns);
        } catch { /* silent poll */ }
    }

    useEffect(() => {
        if (!id) return;
        Promise.all([
            authApi<{ value: string }>(`/posts/${id}/checkin-qr`),
            authApi<{ count: number; checkIns: Attendee[] }>(`/posts/${id}/checkins`),
        ]).then(([qr, checkins]) => {
            setQrValue(qr.value);
            setCount(checkins.count);
            setAttendees(checkins.checkIns);
        }).catch(() => showToast("Could not load check-in data.", "error")).finally(() => setLoading(false));

        pollRef.current = setInterval(fetchCheckins, POLL_INTERVAL);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [id]);

    if (loading) {
        return (
            <SafeAreaView style={s.safe} edges={["top"]}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator color={C.primary} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            {/* Top bar */}
            <View style={s.topBar}>
                <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)} style={s.backGroup} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
                    <Ionicons name="arrow-back" size={18} color={C.primary} />
                    <Text style={s.backLabel}>BACK</Text>
                </Pressable>
                <Text style={s.topBarTitle}>CHECK-IN MODE</Text>
                <View style={{ width: 64 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
                {/* QR block */}
                <View style={s.qrCard}>
                    <Text style={s.qrCardLabel}>SHOW THIS TO ATTENDEES</Text>
                    <Text style={s.qrCardSub}>Students scan with their uEvents app to check in</Text>

                    <View style={s.qrWrap}>
                        {qrValue ? (
                            <QRCode
                                value={qrValue}
                                size={220}
                                color="#111827"
                                backgroundColor="#fff"
                            />
                        ) : (
                            <View style={s.qrPlaceholder}>
                                <Ionicons name="qr-code-outline" size={64} color={C.textFaint} />
                            </View>
                        )}
                    </View>

                    {/* Live counter */}
                    <View style={s.counterRow}>
                        <View style={s.liveIndicator}>
                            <View style={s.liveDot} />
                            <Text style={s.liveText}>LIVE</Text>
                        </View>
                        <Text style={s.counterNum}>{count}</Text>
                        <Text style={s.counterLabel}>CHECKED IN</Text>
                    </View>
                </View>

                {/* Toggle attendee list */}
                <Pressable style={s.listToggle} onPress={() => setShowList((v) => !v)} accessibilityRole="button" accessibilityLabel={showList ? "Hide attendee list" : "View attendee list"} accessibilityState={{ expanded: showList }}>
                    <Text style={s.listToggleText}>
                        {showList ? "HIDE ATTENDEE LIST" : "VIEW ATTENDEE LIST"}
                    </Text>
                    <Ionicons name={showList ? "chevron-up" : "chevron-down"} size={14} color={C.primary} />
                </Pressable>

                {showList && (
                    <View style={s.listBlock}>
                        {attendees.length === 0 ? (
                            <View style={s.emptyState}>
                                <Text style={s.emptyText}>NO CHECK-INS YET</Text>
                            </View>
                        ) : (
                            attendees.map((a) => (
                                <View key={a.userId} style={s.attendeeRow}>
                                    {a.avatarUrl ? (
                                        <Image source={{ uri: a.avatarUrl }} style={s.avatar} />
                                    ) : (
                                        <View style={s.avatarPlaceholder}>
                                            <Ionicons name="person" size={14} color={C.textLight} />
                                        </View>
                                    )}
                                    <View style={s.attendeeInfo}>
                                        <Text style={s.attendeeName}>{a.name}</Text>
                                        {(a.program || a.year) && (
                                            <Text style={s.attendeeMeta}>
                                                {[a.year, a.program].filter(Boolean).join(" · ")}
                                            </Text>
                                        )}
                                    </View>
                                    <Text style={s.checkedAt}>{timeAgo(a.checkedAt)}</Text>
                                </View>
                            ))
                        )}
                    </View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}
