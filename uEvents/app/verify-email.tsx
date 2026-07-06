import { useState, useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LoginButton } from "../components/LoginButton";
import { api } from "../lib/api";
import { useApi } from "../lib/useApi";
import { useAuth } from "../auth/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/LangContext";
import type { AppColors } from "../styles/theme";

type Stage = "verifying" | "success" | "error" | "prompt";

const makeStyles = (C: AppColors) => StyleSheet.create({
    page: { flex: 1, backgroundColor: C.bg },
    body: { flex: 1, paddingHorizontal: 24, justifyContent: "center", gap: 18 },
    iconWrap: { alignSelf: "center", width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
    eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 3, color: C.primary, textAlign: "center" },
    title: { fontSize: 26, fontWeight: "800", color: C.text, textAlign: "center", letterSpacing: -0.5 },
    subtitle: { fontSize: 15, color: C.textMuted, lineHeight: 22, textAlign: "center" },
    accent: { width: 40, height: 3, backgroundColor: C.primary, alignSelf: "center" },
    link: { fontSize: 12, fontWeight: "800", letterSpacing: 1, color: C.textMuted, textAlign: "center", marginTop: 8 },
});

export default function VerifyEmailScreen() {
    const router = useRouter();
    const { token } = useLocalSearchParams<{ token?: string }>();
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeStyles(C), [C]);
    const { session, markEmailVerified } = useAuth();
    const authApi = useApi();

    const [stage, setStage] = useState<Stage>(token ? "verifying" : "prompt");
    const [message, setMessage] = useState("");
    const [resending, setResending] = useState(false);
    const ran = useRef(false);

    useEffect(() => {
        if (!token || ran.current) return;
        ran.current = true;
        (async () => {
            try {
                await api("/users/verify-email", { method: "POST", body: JSON.stringify({ token }) });
                await markEmailVerified();
                setStage("success");
            } catch (e: any) {
                setMessage(e?.message ?? "This verification link is invalid or has expired.");
                setStage("error");
            }
        })();
    }, [token]);

    async function resend() {
        if (!session?.token) {
            setMessage("Please sign in first, then resend the verification email.");
            return;
        }
        setResending(true);
        try {
            await authApi("/users/resend-verification", { method: "POST" });
            setMessage("Verification email sent — check your inbox.");
        } catch (e: any) {
            setMessage(e?.message ?? "Could not send the email. Please try again.");
        } finally {
            setResending(false);
        }
    }

    function goHome() {
        if (session?.token) router.replace("/(tabs)" as any);
        else router.replace("/(auth)/login" as any);
    }

    return (
        <SafeAreaView style={s.page} edges={["top", "bottom"]}>
            <View style={s.body}>
                {stage === "verifying" && (
                    <>
                        <ActivityIndicator size="large" color={C.primary} />
                        <Text style={s.subtitle}>Verifying your email…</Text>
                    </>
                )}

                {stage === "success" && (
                    <>
                        <View style={[s.iconWrap, { backgroundColor: C.primaryBg }]}>
                            <Ionicons name="checkmark-circle" size={44} color={C.primary} />
                        </View>
                        <Text style={s.eyebrow}>{t.accountEyebrow}</Text>
                        <Text style={s.title}>{t.emailVerifiedTitle}</Text>
                        <View style={s.accent} />
                        <Text style={s.subtitle}>You're all set. Thanks for confirming your email address.</Text>
                        <LoginButton title="CONTINUE" onPress={goHome} filled />
                    </>
                )}

                {stage === "error" && (
                    <>
                        <View style={[s.iconWrap, { backgroundColor: C.primaryBg }]}>
                            <Ionicons name="alert-circle" size={44} color={C.primary} />
                        </View>
                        <Text style={s.eyebrow}>{t.accountEyebrow}</Text>
                        <Text style={s.title}>{t.linkExpiredTitle}</Text>
                        <View style={s.accent} />
                        <Text style={s.subtitle}>{message}</Text>
                        {session?.token && (
                            <LoginButton title="RESEND EMAIL" onPress={resend} filled loading={resending} />
                        )}
                        <Pressable onPress={goHome} hitSlop={8} accessibilityRole="button" accessibilityLabel="Continue">
                            <Text style={s.link}>{session?.token ? "CONTINUE FOR NOW" : "BACK TO SIGN IN"}</Text>
                        </Pressable>
                    </>
                )}

                {stage === "prompt" && (
                    <>
                        <View style={[s.iconWrap, { backgroundColor: C.primaryBg }]}>
                            <Ionicons name="mail-outline" size={40} color={C.primary} />
                        </View>
                        <Text style={s.eyebrow}>{t.accountEyebrow}</Text>
                        <Text style={s.title}>{t.verifyYourEmailTitle}</Text>
                        <View style={s.accent} />
                        <Text style={s.subtitle}>
                            {session?.email
                                ? `We sent a verification link to ${session.email}. Tap it to confirm your address.`
                                : "Open the verification link we emailed you to confirm your address."}
                        </Text>
                        {!!message && <Text style={s.subtitle}>{message}</Text>}
                        {session?.token && (
                            <LoginButton title="RESEND EMAIL" onPress={resend} filled loading={resending} />
                        )}
                        <Pressable onPress={goHome} hitSlop={8} accessibilityRole="button" accessibilityLabel="Continue">
                            <Text style={s.link}>{session?.token ? "CONTINUE FOR NOW" : "BACK TO SIGN IN"}</Text>
                        </Pressable>
                    </>
                )}
            </View>
        </SafeAreaView>
    );
}
