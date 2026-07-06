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
import { useReduceMotion } from "../../lib/useReduceMotion";
import { useT } from "../../lib/LangContext";
import type { AppColors } from "../../styles/theme";

type Page = "landing" | "signin" | "register" | "register-club";

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

const PAGES: Page[] = ["landing", "signin", "register", "register-club"];

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
    inviteHint: {
        fontSize: 12,
        color: C.textMuted,
        marginTop: -6,
        lineHeight: 16,
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
    const { signIn, register, registerClub, continueAsGuest } = useAuth();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const { colors: C } = useTheme();
    const t = useT();
    const reduceMotion = useReduceMotion();
    const s = useMemo(() => makeStyles(C), [C]);
    const [page, setPage] = useState<Page>("landing");
    const slideX = useRef(new Animated.Value(0)).current;

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [firstName, setFirst] = useState("");
    const [lastName, setLast] = useState("");
    const [clubName, setClubName] = useState("");
    const [category, setCategory] = useState("");
    const [inviteCode, setInviteCode] = useState("");
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
        // Honor "Reduce Motion": swap pages instantly without the slide transition.
        if (reduceMotion) {
            setPage(next);
            setErrors({});
            slideX.setValue(0);
            return;
        }
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
    }, [page, slideX, width, reduceMotion]);

    // Accept any properly-formatted email. Domain restrictions (e.g. requiring a
    // school email) are enforced server-side via the SCHOOL_EMAIL_DOMAINS env so
    // the rule can change without an app update.
    function validateEmailBasic(v: string) {
        if (!v.trim()) return t.authEmailRequired;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())) return t.authEmailInvalid;
        return "";
    }

    async function handleSignIn() {
        const emailErr = validateEmailBasic(email);
        const pwdErr = !password ? t.authPasswordRequired : "";
        if (emailErr || pwdErr) {
            setErrors({ email: emailErr, password: pwdErr });
            return;
        }
        setErrors({});
        setLoading(true);
        try {
            await signIn(email.trim(), password);
        } catch (e: any) {
            Alert.alert(t.signInFailed, e?.message ?? t.genericTryAgain);
        } finally {
            setLoading(false);
        }
    }

    async function handleRegister() {
        const newErrors: Record<string, string> = {};
        if (!firstName.trim()) newErrors.firstName = t.authFirstNameRequired;
        if (!lastName.trim()) newErrors.lastName = t.authLastNameRequired;
        const emailErr = validateEmailBasic(email);
        if (emailErr) newErrors.email = emailErr;
        if (!password) newErrors.password = t.authPasswordRequired;
        else if (password.length < 8) newErrors.password = t.passwordMin8;
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        setErrors({});
        setLoading(true);
        try {
            await register(firstName.trim(), lastName.trim(), email.trim(), password);
        } catch (e: any) {
            Alert.alert(t.signUpFailed, e?.message ?? t.genericTryAgain);
        } finally {
            setLoading(false);
        }
    }

    async function handleRegisterClub() {
        const newErrors: Record<string, string> = {};
        if (!clubName.trim()) newErrors.clubName = t.clubNameRequired;
        const emailErr = validateEmailBasic(email);
        if (emailErr) newErrors.email = emailErr;
        // Invite code is optional now: clubs without one are created pending admin approval.
        if (!password) newErrors.password = t.authPasswordRequired;
        else if (password.length < 8) newErrors.password = t.passwordMin8;
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        setErrors({});
        setLoading(true);
        try {
            await registerClub(clubName.trim(), email.trim(), password, inviteCode.trim(), category.trim() || undefined);
        } catch (e: any) {
            Alert.alert(t.signUpFailed, e?.message ?? t.genericTryAgain);
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
                                <Text style={s.backText}>{t.back}</Text>
                            </Pressable>
                        )}

                        {/* Header */}
                        <View style={s.header}>
                            <Text style={s.eyebrow}>
                                {page === "landing" ? t.authWelcome : page === "signin" ? t.authSignInEyebrow : page === "register-club" ? t.authClubAccountEyebrow : t.authCreateAccountEyebrow}
                            </Text>
                            <View style={s.titleWrap}>
                                <Text style={s.title}>uEvents</Text>
                            </View>
                            <View style={s.accent} />
                            <Text style={s.subtitle}>
                                {page === "landing"
                                    ? t.authTagline
                                    : page === "signin"
                                    ? t.authWelcomeBack
                                    : page === "register-club"
                                    ? t.authClubSubtitle
                                    : t.authJoinCommunity}
                            </Text>
                        </View>

                        {/* Landing — choose action */}
                        {page === "landing" && (
                            <View style={s.form}>
                                <LoginButton title={t.authSignInBtn} onPress={() => navigateTo("signin")} filled />
                                <LoginButton title={t.authCreateAccountBtn} onPress={() => navigateTo("register")} />
                                <Pressable onPress={() => navigateTo("register-club")} style={s.switchLink}>
                                    <Text style={s.switchText}>{t.authOrganizingClubQ}<Text style={s.switchAction}>{t.authCreateClubLink}</Text></Text>
                                </Pressable>
                                <Pressable onPress={continueAsGuest} style={s.guestBtn}>
                                    <Text style={s.guestText}>{t.authContinueGuest}</Text>
                                </Pressable>
                            </View>
                        )}

                        {/* Sign in */}
                        {page === "signin" && (
                            <View style={s.form}>
                                <LoginInput
                                    label={t.authEmailLabel}
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
                                    label={t.authPasswordLabel}
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
                                    title={t.authSignInBtn}
                                    onPress={handleSignIn}
                                    filled
                                    loading={loading}
                                />
                                <Pressable onPress={() => router.push("/(auth)/forgot-password")} style={s.forgotBtn}>
                                    <Text style={s.forgotText}>{t.authForgotPassword}</Text>
                                </Pressable>
                                <View style={s.divider}>
                                    <View style={s.dividerLine} />
                                    <Text style={s.dividerText}>{t.authOr}</Text>
                                    <View style={s.dividerLine} />
                                </View>
                                <Pressable onPress={() => navigateTo("register")} style={s.switchLink}>
                                    <Text style={s.switchText}>{t.authNoAccountQ}<Text style={s.switchAction}>{t.authCreateOneLink}</Text></Text>
                                </Pressable>
                            </View>
                        )}

                        {/* Register */}
                        {page === "register" && (
                            <View style={s.form}>
                                <View style={s.row}>
                                    <LoginInput
                                        label={t.authFirstNameLabel}
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
                                        label={t.authLastNameLabel}
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
                                    label={t.authEmailLabel}
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
                                    label={t.authPasswordLabel}
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
                                                {str.level <= 1 ? t.pwWeak : str.level === 2 ? t.pwFair : str.level === 3 ? t.pwGood : t.pwStrong}
                                            </Text>
                                        </View>
                                    );
                                })()}
                                <LoginButton
                                    title={t.authCreateAccountBtn}
                                    onPress={handleRegister}
                                    filled
                                    loading={loading}
                                />
                                <View style={s.divider}>
                                    <View style={s.dividerLine} />
                                    <Text style={s.dividerText}>{t.authOr}</Text>
                                    <View style={s.dividerLine} />
                                </View>
                                <Pressable onPress={() => navigateTo("signin")} style={s.switchLink}>
                                    <Text style={s.switchText}>{t.authHaveAccountQ}<Text style={s.switchAction}>{t.authSignInLink}</Text></Text>
                                </Pressable>
                                <Pressable onPress={() => navigateTo("register-club")} style={s.switchLink}>
                                    <Text style={s.switchText}>{t.authRegisteringClubQ}<Text style={s.switchAction}>{t.authCreateClubLink}</Text></Text>
                                </Pressable>
                            </View>
                        )}

                        {/* Register — club */}
                        {page === "register-club" && (
                            <View style={s.form}>
                                <LoginInput
                                    label={t.authClubNameLabel}
                                    placeholder="Computer Science Student Association"
                                    value={clubName}
                                    onChangeText={(v) => { setClubName(v); clearError("clubName"); }}
                                    autoCapitalize="words"
                                />
                                {errors.clubName ? <Text style={s.fieldError}>{errors.clubName}</Text> : null}
                                <LoginInput
                                    label={t.authContactEmailLabel}
                                    placeholder="club@email.com"
                                    keyboardType="email-address"
                                    value={email}
                                    onChangeText={(v) => { setEmail(v); clearError("email"); }}
                                    autoComplete="email"
                                    autoCapitalize="none"
                                    textContentType="emailAddress"
                                />
                                {errors.email ? <Text style={s.fieldError}>{errors.email}</Text> : null}
                                <LoginInput
                                    label={t.authCategoryOptionalLabel}
                                    placeholder={t.authCategoryPlaceholder}
                                    value={category}
                                    onChangeText={setCategory}
                                    autoCapitalize="words"
                                />
                                <LoginInput
                                    label={t.authInviteCodeLabel}
                                    placeholder={t.authInvitePlaceholder}
                                    value={inviteCode}
                                    onChangeText={(v) => { setInviteCode(v); clearError("inviteCode"); }}
                                    autoCapitalize="none"
                                />
                                <Text style={s.inviteHint}>Optional. Without a code, your club is reviewed by an admin before you can post.</Text>
                                {errors.inviteCode ? <Text style={s.fieldError}>{errors.inviteCode}</Text> : null}
                                <LoginInput
                                    label={t.authPasswordLabel}
                                    placeholder="••••••••"
                                    secureTextEntry
                                    showToggle
                                    value={password}
                                    onChangeText={(v) => { setPassword(v); clearError("password"); }}
                                    textContentType="newPassword"
                                    returnKeyType="go"
                                    onSubmitEditing={handleRegisterClub}
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
                                                {str.level <= 1 ? t.pwWeak : str.level === 2 ? t.pwFair : str.level === 3 ? t.pwGood : t.pwStrong}
                                            </Text>
                                        </View>
                                    );
                                })()}
                                <LoginButton
                                    title={t.authCreateClubBtn}
                                    onPress={handleRegisterClub}
                                    filled
                                    loading={loading}
                                />
                                <View style={s.divider}>
                                    <View style={s.dividerLine} />
                                    <Text style={s.dividerText}>{t.authOr}</Text>
                                    <View style={s.dividerLine} />
                                </View>
                                <Pressable onPress={() => navigateTo("register")} style={s.switchLink}>
                                    <Text style={s.switchText}>{t.authNotClubQ}<Text style={s.switchAction}>{t.authCreateStudentLink}</Text></Text>
                                </Pressable>
                                <Pressable onPress={() => navigateTo("signin")} style={s.switchLink}>
                                    <Text style={s.switchText}>{t.authHaveAccountQ}<Text style={s.switchAction}>{t.authSignInLink}</Text></Text>
                                </Pressable>
                            </View>
                        )}

                        <Text style={s.powered}>{t.authPoweredBy}</Text>
                        {page === "landing" && (
                            <View style={s.legalRow}>
                                <Pressable onPress={() => Linking.openURL("https://uevents.app/terms")}>
                                    <Text style={s.legalLink}>{t.authTerms}</Text>
                                </Pressable>
                                <Text style={s.legalDot}>·</Text>
                                <Pressable onPress={() => Linking.openURL("https://uevents.app/privacy")}>
                                    <Text style={s.legalLink}>{t.authPrivacy}</Text>
                                </Pressable>
                            </View>
                        )}
                    </Animated.View>
                </ScrollView>
            </SafeAreaView>
        </KeyboardAvoidingView>
    );
}
