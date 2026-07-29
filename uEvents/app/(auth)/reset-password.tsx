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
import { useT } from "../../lib/LangContext";
import { meta, lbl, fonts, AppColors } from "../../styles/theme";

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
    backArrow: { fontFamily: fonts.body, fontSize: 16, color: C.text },
    backText: { ...lbl(11, "bold", 0.12), color: C.text },
    header: { marginBottom: 40 },
    eyebrow: { ...lbl(10, "bold", 0.12), color: C.primary, marginBottom: 8 },
    titleWrap: { transform: [{ scaleX: 0.78 }], transformOrigin: "left" },
    title: { fontSize: 64, color: C.text, letterSpacing: -1, fontFamily: fonts.displayBold, lineHeight: 68 },
    accent: { width: 40, height: 3, backgroundColor: C.primary, marginTop: 14, marginBottom: 14 },
    subtitle: { fontFamily: fonts.body, fontSize: 15, color: C.textMuted, lineHeight: 22 },
    form: { gap: 14 },
    fieldError: { ...meta(12, "regular"), color: C.primary, marginTop: -6 },
    successBox: {
        backgroundColor: C.surface,
        borderLeftWidth: 3,
        borderLeftColor: C.primary,
        padding: 16,
        gap: 8,
    },
    successTitle: { ...lbl(11, "bold", 0.12), color: C.primary },
    successBody: { ...meta(14, "regular"), color: C.textBody, lineHeight: 20 },
    powered: { ...meta(11, "regular"), textAlign: "center",  color: C.textFaint, marginTop: 40 },
});

export default function ResetPasswordScreen() {
    const router = useRouter();
    const { token } = useLocalSearchParams<{ token: string }>();
    const { colors: C } = useTheme();
    const t = useT();
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
            setPasswordError(t.passwordMin8);
            return;
        }
        if (trimmedPw !== confirm) {
            setPasswordError(t.passwordsDontMatch);
            return;
        }
        if (!token) {
            setPasswordError(t.rpInvalidToken);
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
            setPasswordError(e?.message ?? t.rpLinkExpired);
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
                        <Text style={s.backText}>{t.authSignInBtn}</Text>
                    </Pressable>

                    <View style={s.header}>
                        <Text style={s.eyebrow}>{t.authAccountEyebrow}</Text>
                        <View style={s.titleWrap}>
                            <Text style={s.title}>uEvents</Text>
                        </View>
                        <View style={s.accent} />
                        <Text style={s.subtitle}>
                            {stage === "input"
                                ? t.rpSubtitleInput
                                : t.rpSubtitleDone}
                        </Text>
                    </View>

                    {stage === "input" ? (
                        <View style={s.form}>
                            <LoginInput
                                label={t.rpNewPasswordLabel}
                                placeholder={t.rpNewPasswordPlaceholder}
                                secureTextEntry
                                value={password}
                                onChangeText={(v) => { setPassword(v); setPasswordError(""); }}
                                textContentType="newPassword"
                                returnKeyType="next"
                                onSubmitEditing={() => confirmRef.current?.focus()}
                            />
                            <LoginInput
                                ref={confirmRef}
                                label={t.rpConfirmLabel}
                                placeholder={t.rpConfirmPlaceholder}
                                secureTextEntry
                                value={confirm}
                                onChangeText={(v) => { setConfirm(v); setPasswordError(""); }}
                                textContentType="newPassword"
                                returnKeyType="done"
                                onSubmitEditing={handleSubmit}
                            />
                            {passwordError ? <Text style={s.fieldError}>{passwordError}</Text> : null}
                            <LoginButton
                                title={t.rpSetNewBtn}
                                onPress={handleSubmit}
                                filled
                                loading={loading}
                            />
                        </View>
                    ) : (
                        <View style={s.form}>
                            <View style={s.successBox}>
                                <Text style={s.successTitle}>{t.rpUpdatedTitle}</Text>
                                <Text style={s.successBody}>
                                    {t.rpUpdatedBody}
                                </Text>
                            </View>
                            <LoginButton
                                title={t.authSignInBtn}
                                onPress={() => router.replace("/(auth)/login" as any)}
                                filled
                            />
                        </View>
                    )}

                    <Text style={s.powered}>{t.authPoweredBy}</Text>
                </ScrollView>
            </SafeAreaView>
        </KeyboardAvoidingView>
    );
}
