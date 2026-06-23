import React, { useState, useRef, useCallback, useMemo } from "react";
import {
    View, Text, Pressable, Alert,
    KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
    Animated, useWindowDimensions, Linking, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LoginButton } from "../../components/LoginButton";
import { LoginInput } from "../../components/LoginInput";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";

type Page = "landing" | "signin" | "register";

function passwordStrength(pw: string): { level: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
    if (pw.length === 0) return { level: 0, label: "", color: "transparent" };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    if (score <= 1) return { level: 1, label: "WEAK", color: "#EF4444" };
    if (score === 2) return { level: 2, label: "FAIR", color: "#F59E0B" };
    if (score === 3) return { level: 3, label: "GOOD", color: "#10B981" };
    return { level: 4, label: "STRONG", color: "#059669" };
}

const PAGES: Page[] = ["landing", "signin", "register"];

const makeStyles = (C: AppColors) => StyleSheet.create({
    scroll: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 40,
        paddingBottom: 40,
        justifyContent: "center",
        overflow: "hidden",
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
    row: {
        flexDirection: "row",
        gap: 12,
    },
    guestBtn: {
        alignItems: "center",
        paddingVertical: 12,
        marginTop: 4,
    },
    guestText: {
        fontSize: 13,
        color: C.textLight,
        textDecorationLine: "underline",
    },
    divider: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginVertical: 4,
    },
    dividerLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
        backgroundColor: "#DDD8D0",
    },
    dividerText: {
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 1,
        color: C.textLight,
    },
    fieldError: {
        fontSize: 12,
        color: C.primary,
        marginTop: -6,
    },
    forgotBtn: {
        alignItems: "center",
        paddingVertical: 4,
        marginTop: -2,
    },
    forgotText: {
        fontSize: 13,
        color: C.primary,
        fontWeight: "600",
    },
    switchLink: {
        alignItems: "center",
        paddingVertical: 4,
    },
    switchText: {
        fontSize: 13,
        color: C.textMuted,
    },
    switchAction: {
        color: C.primary,
        fontWeight: "700",
    },
    powered: {
        textAlign: "center",
        fontSize: 11,
        color: C.textFaint,
        marginTop: 40,
        letterSpacing: 0.5,
    },
    legalRow: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 6,
        marginTop: 10,
    },
    legalLink: {
        fontSize: 11,
        color: C.textLight,
        textDecorationLine: "underline",
    },
    legalDot: {
        fontSize: 11,
        color: C.textFaint,
    },
});

export default function LoginScreen() {
    const { signIn, register, continueAsGuest } = useAuth();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    const [page, setPage] = useState<Page>("landing");
    const slideX = useRef(new Animated.Value(0)).current;

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [firstName, setFirst] = useState("");
    const [lastName, setLast] = useState("");
    const [loading, setLoading] = useState(false);

    const [errors, setErrors] = useState<Record<string, string>>({});

    // Field refs for keyboard chaining
    const signInPasswordRef = useRef<TextInput>(null);
    const regLastRef  = useRef<TextInput>(null);
    const regEmailRef = useRef<TextInput>(null);
    const regPwdRef   = useRef<TextInput>(null);

    function clearError(field: string) {
        setErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
    }

    const navigateTo = useCallback((next: Page) => {
        const currentIdx = PAGES.indexOf(page);
        const nextIdx = PAGES.indexOf(next);
        const dir = nextIdx > currentIdx ? 1 : -1;

        // Slide out current page
        Animated.timing(slideX, {
            toValue: -dir * width,
            duration: 260,
            useNativeDriver: true,
        }).start(() => {
            setPage(next);
            setErrors({});
            // Snap new page in from opposite side, then slide to center
            slideX.setValue(dir * width);
            Animated.spring(slideX, {
                toValue: 0,
                useNativeDriver: true,
                damping: 22,
                stiffness: 200,
            }).start();
        });
    }, [page, slideX, width]);

    function validateEmail(v: string) {
        if (!v.trim()) return "Email is required";
        if (!v.trim().toLowerCase().endsWith("@uottawa.ca")) return "Must be a uOttawa email (@uottawa.ca)";
        return "";
    }

    async function handleSignIn() {
        const emailErr = validateEmail(email);
        const pwdErr = !password ? "Password is required" : "";
        if (emailErr || pwdErr) {
            setErrors({ email: emailErr, password: pwdErr });
            return;
        }
        setErrors({});
        setLoading(true);
        try {
            await signIn(email.trim(), password);
        } catch (e: any) {
            Alert.alert("Sign in failed", e?.message ?? "Please try again");
        } finally {
            setLoading(false);
        }
    }

    async function handleRegister() {
        const newErrors: Record<string, string> = {};
        if (!firstName.trim()) newErrors.firstName = "First name is required";
        if (!lastName.trim()) newErrors.lastName = "Last name is required";
        const emailErr = validateEmail(email);
        if (emailErr) newErrors.email = emailErr;
        if (!password) newErrors.password = "Password is required";
        else if (password.length < 8) newErrors.password = "Password must be at least 8 characters";
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        setErrors({});
        setLoading(true);
        try {
            await register(firstName.trim(), lastName.trim(), email.trim(), password);
        } catch (e: any) {
            Alert.alert("Sign up failed", e?.message ?? "Please try again");
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
                    <Animated.View style={{ transform: [{ translateX: slideX }] }}>
                        {/* Back arrow — shown on sub-pages */}
                        {page !== "landing" && (
                            <Pressable onPress={() => navigateTo("landing")} style={s.backBtn} hitSlop={12}>
                                <Text style={s.backArrow}>←</Text>
                                <Text style={s.backText}>BACK</Text>
                            </Pressable>
                        )}

                        {/* Header */}
                        <View style={s.header}>
                            <Text style={s.eyebrow}>
                                {page === "landing" ? "WELCOME" : page === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
                            </Text>
                            <View style={s.titleWrap}>
                                <Text style={s.title}>uEvents</Text>
                            </View>
                            <View style={s.accent} />
                            <Text style={s.subtitle}>
                                {page === "landing"
                                    ? "Your campus, all in one place."
                                    : page === "signin"
                                    ? "Welcome back."
                                    : "Join the community."}
                            </Text>
                        </View>

                        {/* Landing — choose action */}
                        {page === "landing" && (
                            <View style={s.form}>
                                <LoginButton title="SIGN IN" onPress={() => navigateTo("signin")} filled />
                                <LoginButton title="CREATE ACCOUNT" onPress={() => navigateTo("register")} />
                                <Pressable onPress={continueAsGuest} style={s.guestBtn}>
                                    <Text style={s.guestText}>Continue as guest</Text>
                                </Pressable>
                            </View>
                        )}

                        {/* Sign in */}
                        {page === "signin" && (
                            <View style={s.form}>
                                <LoginInput
                                    label="EMAIL"
                                    placeholder="you@university.ca"
                                    keyboardType="email-address"
                                    value={email}
                                    onChangeText={(v) => { setEmail(v); clearError("email"); }}
                                    autoComplete="email"
                                    textContentType="emailAddress"
                                    returnKeyType="next"
                                    onSubmitEditing={() => signInPasswordRef.current?.focus()}
                                    blurOnSubmit={false}
                                />
                                {errors.email ? <Text style={s.fieldError}>{errors.email}</Text> : null}
                                <LoginInput
                                    ref={signInPasswordRef}
                                    label="PASSWORD"
                                    placeholder="••••••••"
                                    secureTextEntry
                                    showToggle
                                    value={password}
                                    onChangeText={(v) => { setPassword(v); clearError("password"); }}
                                    textContentType="password"
                                    returnKeyType="go"
                                    onSubmitEditing={handleSignIn}
                                />
                                {errors.password ? <Text style={s.fieldError}>{errors.password}</Text> : null}
                                <LoginButton
                                    title="SIGN IN"
                                    onPress={handleSignIn}
                                    filled
                                    loading={loading}
                                />
                                <Pressable onPress={() => router.push("/(auth)/forgot-password")} style={s.forgotBtn}>
                                    <Text style={s.forgotText}>Forgot password?</Text>
                                </Pressable>
                                <View style={s.divider}>
                                    <View style={s.dividerLine} />
                                    <Text style={s.dividerText}>OR</Text>
                                    <View style={s.dividerLine} />
                                </View>
                                <Pressable onPress={() => navigateTo("register")} style={s.switchLink}>
                                    <Text style={s.switchText}>Don't have an account? <Text style={s.switchAction}>Create one</Text></Text>
                                </Pressable>
                            </View>
                        )}

                        {/* Register */}
                        {page === "register" && (
                            <View style={s.form}>
                                <View style={s.row}>
                                    <LoginInput
                                        label="FIRST NAME"
                                        placeholder="Alex"
                                        value={firstName}
                                        onChangeText={(v) => { setFirst(v); clearError("firstName"); }}
                                        autoCapitalize="words"
                                        style={{ flex: 1 }}
                                        returnKeyType="next"
                                        onSubmitEditing={() => regLastRef.current?.focus()}
                                        blurOnSubmit={false}
                                    />
                                    <LoginInput
                                        ref={regLastRef}
                                        label="LAST NAME"
                                        placeholder="Smith"
                                        value={lastName}
                                        onChangeText={(v) => { setLast(v); clearError("lastName"); }}
                                        autoCapitalize="words"
                                        style={{ flex: 1 }}
                                        returnKeyType="next"
                                        onSubmitEditing={() => regEmailRef.current?.focus()}
                                        blurOnSubmit={false}
                                    />
                                </View>
                                {(errors.firstName || errors.lastName) ? (
                                    <Text style={s.fieldError}>{errors.firstName || errors.lastName}</Text>
                                ) : null}
                                <LoginInput
                                    ref={regEmailRef}
                                    label="EMAIL"
                                    placeholder="you@university.ca"
                                    keyboardType="email-address"
                                    value={email}
                                    onChangeText={(v) => { setEmail(v); clearError("email"); }}
                                    autoComplete="email"
                                    textContentType="emailAddress"
                                    returnKeyType="next"
                                    onSubmitEditing={() => regPwdRef.current?.focus()}
                                    blurOnSubmit={false}
                                />
                                {errors.email ? <Text style={s.fieldError}>{errors.email}</Text> : null}
                                <LoginInput
                                    ref={regPwdRef}
                                    label="PASSWORD"
                                    placeholder="••••••••"
                                    secureTextEntry
                                    showToggle
                                    value={password}
                                    onChangeText={(v) => { setPassword(v); clearError("password"); }}
                                    textContentType="newPassword"
                                    returnKeyType="go"
                                    onSubmitEditing={handleRegister}
                                />
                                {errors.password ? <Text style={s.fieldError}>{errors.password}</Text> : null}
                                {password.length > 0 && (() => {
                                    const str = passwordStrength(password);
                                    return (
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                                            {([1, 2, 3, 4] as const).map((i) => (
                                                <View key={i} style={{ flex: 1, height: 3, backgroundColor: i <= str.level ? str.color : C.border }} />
                                            ))}
                                            <Text style={{ fontSize: 9, fontWeight: "800", color: str.color, letterSpacing: 1, width: 44, textAlign: "right" }}>
                                                {str.label}
                                            </Text>
                                        </View>
                                    );
                                })()}
                                <LoginButton
                                    title="CREATE ACCOUNT"
                                    onPress={handleRegister}
                                    filled
                                    loading={loading}
                                />
                                <View style={s.divider}>
                                    <View style={s.dividerLine} />
                                    <Text style={s.dividerText}>OR</Text>
                                    <View style={s.dividerLine} />
                                </View>
                                <Pressable onPress={() => navigateTo("signin")} style={s.switchLink}>
                                    <Text style={s.switchText}>Already have an account? <Text style={s.switchAction}>Sign in</Text></Text>
                                </Pressable>
                            </View>
                        )}

                        <Text style={s.powered}>Powered by the CSSA</Text>
                        {page === "landing" && (
                            <View style={s.legalRow}>
                                <Pressable onPress={() => Linking.openURL("https://uevents.app/terms")}>
                                    <Text style={s.legalLink}>Terms of Service</Text>
                                </Pressable>
                                <Text style={s.legalDot}>·</Text>
                                <Pressable onPress={() => Linking.openURL("https://uevents.app/privacy")}>
                                    <Text style={s.legalLink}>Privacy Policy</Text>
                                </Pressable>
                            </View>
                        )}
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>
        </KeyboardAvoidingView>
    );
}
