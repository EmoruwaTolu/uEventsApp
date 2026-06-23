import { useState, useRef, useMemo } from "react";
import {
    View, Text, Pressable,
    KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { LoginButton } from "../../components/LoginButton";
import { LoginInput } from "../../components/LoginInput";
import { api } from "../../lib/api";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";

type Stage = "input" | "done";

const makeStyles = (C: AppColors) => StyleSheet.create({
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 40,
        justifyContent: "center",
    },
    backBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 28,
    },
    backArrow: { fontSize: 16, color: C.text },
    backText: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: C.text },
    header: { marginBottom: 40 },
    eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 3, color: C.primary, marginBottom: 8 },
    titleWrap: { transform: [{ scaleX: 0.78 }], transformOrigin: "left" },
    title: { fontSize: 64, fontWeight: "600", color: C.text, letterSpacing: -1, fontFamily: "Georgia", lineHeight: 68 },
    accent: { width: 40, height: 3, backgroundColor: C.primary, marginTop: 14, marginBottom: 14 },
    subtitle: { fontSize: 15, color: C.textMuted, lineHeight: 22 },
    form: { gap: 14 },
    fieldError: { fontSize: 12, color: C.primary, marginTop: -6 },
    successBox: {
        backgroundColor: C.surface,
        borderLeftWidth: 3,
        borderLeftColor: C.primary,
        padding: 16,
        gap: 8,
    },
    successTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: C.primary },
    successBody: { fontSize: 14, color: C.textBody, lineHeight: 20 },
    powered: { textAlign: "center", fontSize: 11, color: C.textFaint, marginTop: 40, letterSpacing: 0.5 },
});

export default function ResetPasswordScreen() {
    const router = useRouter();
    const { token } = useLocalSearchParams<{ token: string }>();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [passwordError, setPasswordError] = useState("");
    const [loading, setLoading] = useState(false);
    const [stage, setStage] = useState<Stage>("input");
    const confirmRef = useRef<TextInput>(null);

    async function handleSubmit() {
        const trimmedPw = password.trim();
        if (trimmedPw.length < 8) {
            setPasswordError("Password must be at least 8 characters");
            return;
        }
        if (trimmedPw !== confirm) {
            setPasswordError("Passwords do not match");
            return;
        }
        if (!token) {
            setPasswordError("Invalid or missing reset token. Please request a new link.");
            return;
        }
        setPasswordError("");
        setLoading(true);
        try {
            await api("/users/reset-password", {
                method: "POST",
                body: JSON.stringify({ token, password: trimmedPw }),
            });
            setStage("done");
        } catch (e: any) {
            setPasswordError(e?.message ?? "This reset link is invalid or has expired.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.select({ ios: "padding", android: undefined })}
            style={{ flex: 1, backgroundColor: C.bg }}
        >
            <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
                <ScrollView
                    contentContainerStyle={s.scroll}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <Pressable onPress={() => router.replace("/(auth)/login" as any)} style={s.backBtn} hitSlop={12}>
                        <Text style={s.backArrow}>←</Text>
                        <Text style={s.backText}>SIGN IN</Text>
                    </Pressable>

                    <View style={s.header}>
                        <Text style={s.eyebrow}>ACCOUNT</Text>
                        <View style={s.titleWrap}>
                            <Text style={s.title}>uEvents</Text>
                        </View>
                        <View style={s.accent} />
                        <Text style={s.subtitle}>
                            {stage === "input"
                                ? "Choose a new password for your account."
                                : "Your password has been updated."}
                        </Text>
                    </View>

                    {stage === "input" ? (
                        <View style={s.form}>
                            <LoginInput
                                label="NEW PASSWORD"
                                placeholder="At least 8 characters"
                                secureTextEntry
                                value={password}
                                onChangeText={(v) => { setPassword(v); setPasswordError(""); }}
                                textContentType="newPassword"
                                returnKeyType="next"
                                onSubmitEditing={() => confirmRef.current?.focus()}
                            />
                            <LoginInput
                                ref={confirmRef}
                                label="CONFIRM PASSWORD"
                                placeholder="Repeat your new password"
                                secureTextEntry
                                value={confirm}
                                onChangeText={(v) => { setConfirm(v); setPasswordError(""); }}
                                textContentType="newPassword"
                                returnKeyType="done"
                                onSubmitEditing={handleSubmit}
                            />
                            {passwordError ? <Text style={s.fieldError}>{passwordError}</Text> : null}
                            <LoginButton
                                title="SET NEW PASSWORD"
                                onPress={handleSubmit}
                                filled
                                loading={loading}
                            />
                        </View>
                    ) : (
                        <View style={s.form}>
                            <View style={s.successBox}>
                                <Text style={s.successTitle}>PASSWORD UPDATED</Text>
                                <Text style={s.successBody}>
                                    Your password has been changed. You can now sign in with your new password.
                                </Text>
                            </View>
                            <LoginButton
                                title="SIGN IN"
                                onPress={() => router.replace("/(auth)/login" as any)}
                                filled
                            />
                        </View>
                    )}

                    <Text style={s.powered}>Powered by the CSSA</Text>
                </ScrollView>
            </SafeAreaView>
        </KeyboardAvoidingView>
    );
}
