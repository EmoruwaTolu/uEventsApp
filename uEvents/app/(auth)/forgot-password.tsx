import { useState, useMemo } from "react";
import {
    View, Text, Pressable,
    KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LoginButton } from "../../components/LoginButton";
import { LoginInput } from "../../components/LoginInput";
import { api } from "../../lib/api";
import { useTheme } from "../../lib/ThemeContext";
import { useT } from "../../lib/LangContext";
import { meta, lbl, fonts, AppColors } from "../../styles/theme";

type Stage = "input" | "sent";

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
    header: {
        marginBottom: 40,
    },
    eyebrow: { ...lbl(10, "bold", 0.12), color: C.primary,
        marginBottom: 8 },
    titleWrap: {
        transform: [{ scaleX: 0.78 }],
        transformOrigin: "left",
    },
    title: {
        fontSize: 64,
        color: C.text,
        letterSpacing: -1,
        fontFamily: fonts.displayBold,
        lineHeight: 68,
    },
    accent: {
        width: 40,
        height: 3,
        backgroundColor: C.primary,
        marginTop: 14,
        marginBottom: 14,
    },
    subtitle: { fontFamily: fonts.body, fontSize: 15, color: C.textMuted,
        lineHeight: 22 },
    form: {
        gap: 14,
    },
    fieldError: { ...meta(12, "regular"), color: C.primary,
        marginTop: -6 },
    sentBox: {
        backgroundColor: C.surface,
        borderLeftWidth: 3,
        borderLeftColor: C.primary,
        padding: 16,
        gap: 8,
    },
    sentTitle: { ...lbl(11, "bold", 0.12), color: C.primary },
    sentBody: { ...meta(14, "regular"), color: C.textBody,
        lineHeight: 20 },
    sentEmail: { ...meta(13, "bold"), color: C.text },
    powered: { ...meta(11, "regular"), textAlign: "center",
        
        color: C.textFaint,
        marginTop: 40 },
});

export default function ForgotPasswordScreen() {
    const router = useRouter();
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeStyles(C), [C]);
    const [email, setEmail] = useState("");
    const [emailError, setEmailError] = useState("");
    const [loading, setLoading] = useState(false);
    const [stage, setStage] = useState<Stage>("input");

    async function handleSubmit() {
        const trimmed = email.trim();
        if (!trimmed) {
            setEmailError(t.authEmailRequired);
            return;
        }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
            setEmailError(t.authEmailInvalid);
            return;
        }
        setEmailError("");
        setLoading(true);
        try {
            await api("/users/forgot-password", {
                method: "POST",
                body: JSON.stringify({ email: trimmed }),
            });
            setStage("sent");
        } catch (e: any) {
            // Show success state regardless to avoid email enumeration
            setStage("sent");
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
                    {/* Back */}
                    <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12}>
                        <Text style={s.backArrow}>←</Text>
                        <Text style={s.backText}>{t.back}</Text>
                    </Pressable>

                    {/* Header */}
                    <View style={s.header}>
                        <Text style={s.eyebrow}>{t.authAccountEyebrow}</Text>
                        <View style={s.titleWrap}>
                            <Text style={s.title}>uEvents</Text>
                        </View>
                        <View style={s.accent} />
                        <Text style={s.subtitle}>
                            {stage === "input"
                                ? t.fpSubtitleInput
                                : t.fpSubtitleSent}
                        </Text>
                    </View>

                    {stage === "input" ? (
                        <View style={s.form}>
                            <LoginInput
                                label={t.authEmailLabel}
                                placeholder="you@university.ca"
                                keyboardType="email-address"
                                value={email}
                                onChangeText={(v) => { setEmail(v); setEmailError(""); }}
                                autoComplete="email"
                                textContentType="emailAddress"
                            />
                            {emailError ? <Text style={s.fieldError}>{emailError}</Text> : null}
                            <LoginButton
                                title={t.fpSendResetBtn}
                                onPress={handleSubmit}
                                filled
                                loading={loading}
                            />
                        </View>
                    ) : (
                        <View style={s.form}>
                            <View style={s.sentBox}>
                                <Text style={s.sentTitle}>{t.fpEmailSentTitle}</Text>
                                <Text style={s.sentBody}>
                                    {t.fpSentBodyPrefix}
                                    <Text style={s.sentEmail}>{email.trim()}</Text>
                                    {t.fpSentBodySuffix}
                                </Text>
                            </View>
                            <LoginButton
                                title={t.fpBackToSignIn}
                                onPress={() => router.back()}
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
