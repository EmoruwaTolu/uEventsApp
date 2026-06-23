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
import type { AppColors } from "../../styles/theme";

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
    backArrow: {
        fontSize: 16,
        color: C.text,
    },
    backText: {
        fontSize: 11,
        fontWeight: "800",
        letterSpacing: 1.5,
        color: C.text,
    },
    header: {
        marginBottom: 40,
    },
    eyebrow: {
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 3,
        color: C.primary,
        marginBottom: 8,
    },
    titleWrap: {
        transform: [{ scaleX: 0.78 }],
        transformOrigin: "left",
    },
    title: {
        fontSize: 64,
        fontWeight: "600",
        color: C.text,
        letterSpacing: -1,
        fontFamily: "Georgia",
        lineHeight: 68,
    },
    accent: {
        width: 40,
        height: 3,
        backgroundColor: C.primary,
        marginTop: 14,
        marginBottom: 14,
    },
    subtitle: {
        fontSize: 15,
        color: C.textMuted,
        lineHeight: 22,
    },
    form: {
        gap: 14,
    },
    fieldError: {
        fontSize: 12,
        color: C.primary,
        marginTop: -6,
    },
    sentBox: {
        backgroundColor: C.surface,
        borderLeftWidth: 3,
        borderLeftColor: C.primary,
        padding: 16,
        gap: 8,
    },
    sentTitle: {
        fontSize: 11,
        fontWeight: "800",
        letterSpacing: 1.5,
        color: C.primary,
    },
    sentBody: {
        fontSize: 14,
        color: C.textBody,
        lineHeight: 20,
    },
    sentEmail: {
        fontWeight: "700",
        color: C.text,
    },
    powered: {
        textAlign: "center",
        fontSize: 11,
        color: C.textFaint,
        marginTop: 40,
        letterSpacing: 0.5,
    },
});

export default function ForgotPasswordScreen() {
    const router = useRouter();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    const [email, setEmail] = useState("");
    const [emailError, setEmailError] = useState("");
    const [loading, setLoading] = useState(false);
    const [stage, setStage] = useState<Stage>("input");

    async function handleSubmit() {
        const trimmed = email.trim();
        if (!trimmed) {
            setEmailError("Email is required");
            return;
        }
        if (!trimmed.toLowerCase().endsWith("@uottawa.ca")) {
            setEmailError("Must be a uOttawa email (@uottawa.ca)");
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
                        <Text style={s.backText}>BACK</Text>
                    </Pressable>

                    {/* Header */}
                    <View style={s.header}>
                        <Text style={s.eyebrow}>ACCOUNT</Text>
                        <View style={s.titleWrap}>
                            <Text style={s.title}>uEvents</Text>
                        </View>
                        <View style={s.accent} />
                        <Text style={s.subtitle}>
                            {stage === "input"
                                ? "Enter your email and we'll send a reset link."
                                : "Check your inbox."}
                        </Text>
                    </View>

                    {stage === "input" ? (
                        <View style={s.form}>
                            <LoginInput
                                label="EMAIL"
                                placeholder="you@university.ca"
                                keyboardType="email-address"
                                value={email}
                                onChangeText={(v) => { setEmail(v); setEmailError(""); }}
                                autoComplete="email"
                                textContentType="emailAddress"
                            />
                            {emailError ? <Text style={s.fieldError}>{emailError}</Text> : null}
                            <LoginButton
                                title="SEND RESET LINK"
                                onPress={handleSubmit}
                                filled
                                loading={loading}
                            />
                        </View>
                    ) : (
                        <View style={s.form}>
                            <View style={s.sentBox}>
                                <Text style={s.sentTitle}>EMAIL SENT</Text>
                                <Text style={s.sentBody}>
                                    If an account exists for{" "}
                                    <Text style={s.sentEmail}>{email.trim()}</Text>
                                    , you'll receive a password reset link shortly.
                                </Text>
                            </View>
                            <LoginButton
                                title="BACK TO SIGN IN"
                                onPress={() => router.back()}
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
