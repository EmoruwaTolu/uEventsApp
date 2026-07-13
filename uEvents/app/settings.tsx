import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    View, Text, ScrollView, Pressable, TextInput,
    Switch, Alert, StyleSheet, ActivityIndicator, Linking, Image,
    Modal, KeyboardAvoidingView, Platform, Animated,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../lib/useApi";
import { useLang, useT } from "../lib/LangContext";
import { useToast } from "../lib/ToastContext";
import { uploadImage } from "../lib/uploadImage";
import { useTheme } from "../lib/ThemeContext";
import { API_BASE } from "../lib/api";
import type { AppColors } from "../styles/theme";

// Legal pages are hosted by the backend (see backend/src/routes/legal.ts).
const TOS_URL = `${API_BASE}/legal/terms`;
const PRIVACY_URL = `${API_BASE}/legal/privacy`;

type Lang = "en" | "fr";
type Section = "profile" | "club-profile" | "password" | null;

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

const makeStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    topBar: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    backGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
    backLabel: { fontSize: 14, fontWeight: "900", color: C.primary, letterSpacing: 2 },

    scroll: { paddingBottom: 32 },

    masthead: {
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 28,
    },
    mastheadLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
        marginBottom: 8,
    },
    mastheadHeading: {
        fontSize: 48,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -1.5,
        lineHeight: 50,
    },
    mastheadAccent: {
        width: 48,
        height: 3,
        backgroundColor: C.primary,
        marginTop: 14,
    },

    sectionLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.textLight,
        letterSpacing: 2,
        paddingHorizontal: 20,
        paddingBottom: 8,
        paddingTop: 4,
    },

    card: {
        backgroundColor: C.surface,
        marginHorizontal: 12,
        marginBottom: 12,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: C.borderWarm,
    },

    row: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 12,
    },
    rowPressed: { backgroundColor: C.surfaceAlt },
    rowIcon: {
        width: 32,
        height: 32,
        backgroundColor: C.primaryBg,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    rowIconDestructive: { backgroundColor: C.primary },
    rowLabel: { flex: 1, fontSize: 14, fontWeight: "700", color: C.text, letterSpacing: 0.2 },
    rowLabelDestructive: { color: C.primary, letterSpacing: 1.5, fontSize: 12, fontWeight: "900" },

    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: C.borderWarm,
        marginLeft: 60,
    },

    fieldGroup: { gap: 6, marginTop: 12 },
    fieldLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.textLight,
        letterSpacing: 1.5,
        textTransform: "uppercase",
    },
    input: {
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.borderWarm,
        paddingVertical: 10,
        paddingHorizontal: 12,
        fontSize: 14,
        color: C.text,
    },
    inputMultiline: { minHeight: 80, textAlignVertical: "top" },

    formActions: { flexDirection: "row", gap: 10, marginTop: 16 },
    cancelBtn: {
        flex: 1,
        paddingVertical: 12,
        alignItems: "center",
        borderWidth: 1,
        borderColor: C.borderWarm,
        backgroundColor: C.surface,
    },
    cancelBtnText: { fontSize: 11, fontWeight: "800", color: C.textMuted, letterSpacing: 1.5 },
    saveBtn: {
        flex: 1,
        paddingVertical: 12,
        alignItems: "center",
        backgroundColor: C.primary,
    },
    saveBtnText: { fontSize: 11, fontWeight: "800", color: "#fff", letterSpacing: 1.5 },

    avatarRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4 },
    avatarPreview: { width: 64, height: 64, borderRadius: 32 },
    avatarPlaceholder: { backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
    avatarChangeText: { fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1.5 },

    modalBackdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.overlay },
    modalSheet: {
        backgroundColor: C.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderWidth: 1,
        borderColor: C.borderWarm,
        maxHeight: "85%",
    },
    modalHandle: {
        width: 36, height: 4,
        backgroundColor: C.borderWarm,
        borderRadius: 2,
        alignSelf: "center",
        marginTop: 10,
        marginBottom: 4,
    },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
    },
    modalTitle: { fontSize: 11, fontWeight: "900", color: C.text, letterSpacing: 2 },
    modalBody: { paddingHorizontal: 16, paddingTop: 4 },

    langPicker: { flexDirection: "row", overflow: "hidden", borderWidth: 1, borderColor: C.borderWarm },
    langOption: { paddingVertical: 7, paddingHorizontal: 16, backgroundColor: C.surface },
    langOptionActive: { backgroundColor: C.primary },
    langOptionText: { fontSize: 11, fontWeight: "800", color: C.textMuted, letterSpacing: 1 },
    langOptionTextActive: { color: "#fff" },
});

export default function SettingsScreen() {
    const router = useRouter();
    const { signOut, session, updateToken } = useAuth();
    const authApi = useApi();
    const { lang: language, setLang: setLanguage } = useLang();
    const t = useT();
    const { showToast } = useToast();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);

    const [openSection, setOpenSection] = useState<Section>(null);
    const [modalMounted, setModalMounted] = useState(false);
    const slideAnim = useRef(new Animated.Value(800)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;
    const insets = useSafeAreaInsets();
    const isClub = session?.userType === "CLUB";
    const [calLoading, setCalLoading] = useState(false);

    const closeIntentRef = useRef(0);

    // Fetch the user's personal ICS feed URL and hand it to the OS to subscribe
    // (webcal:// prompts a one-tap "add subscription" on iOS/macOS).
    async function subscribeCalendar() {
        if (calLoading) return;
        setCalLoading(true);
        try {
            const { url, webcalUrl } = await authApi<{ url: string; webcalUrl: string }>("/users/me/calendar");
            const canOpen = await Linking.canOpenURL(webcalUrl).catch(() => false);
            await Linking.openURL(canOpen ? webcalUrl : url);
        } catch {
            showToast("Couldn't set up calendar subscription. Please try again.", "error");
        } finally {
            setCalLoading(false);
        }
    }

    function openModal(section: Section) {
        const intent = ++closeIntentRef.current;
        slideAnim.setValue(800);
        backdropAnim.setValue(0);
        setOpenSection(section);
        setModalMounted(true);
        Animated.parallel([
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 4 }),
            Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]).start();
        closeIntentRef.current = intent;
    }

    function closeModal() {
        const intent = ++closeIntentRef.current;
        Animated.parallel([
            Animated.timing(slideAnim, { toValue: 800, duration: 260, useNativeDriver: true }),
            Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => {
            if (closeIntentRef.current !== intent) return;
            setModalMounted(false);
            setOpenSection(null);
        });
    }

    // Student profile fields
    const [name, setName] = useState("");
    const [program, setProgram] = useState("");
    const [year, setYear] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [avatarUri, setAvatarUri] = useState<string | null>(null); // local picker URI
    const [savingProfile, setSavingProfile] = useState(false);

    // Club profile fields
    const [clubName, setClubName] = useState("");
    const [category, setCategory] = useState("");
    const [description, setDescription] = useState("");
    const [instagram, setInstagram] = useState("");
    const [twitter, setTwitter] = useState("");
    const [contactEmail, setContactEmail] = useState("");
    const [logoUrl, setLogoUrl] = useState("");
    const [savingClubProfile, setSavingClubProfile] = useState(false);

    // Password fields
    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [savingPw, setSavingPw] = useState(false);

    // Preferences
    const [pushNotifs, setPushNotifs] = useState(true);
    const [emailDigest, setEmailDigest] = useState(false);


    useEffect(() => {
        if (!session?.token) return;
        authApi<{
            firstName?: string; lastName?: string; program?: string; year?: string; avatarUrl?: string;
            clubName?: string; category?: string; description?: string; instagram?: string;
            twitter?: string; contactEmail?: string; logoUrl?: string;
            pushNotifs?: boolean; emailDigest?: boolean;
        }>("/users/me")
            .then((u) => {
                if (isClub) {
                    setClubName(u.clubName ?? "");
                    setCategory(u.category ?? "");
                    setDescription(u.description ?? "");
                    setInstagram(u.instagram ?? "");
                    setTwitter(u.twitter ?? "");
                    setContactEmail(u.contactEmail ?? "");
                    setLogoUrl(u.logoUrl ?? "");
                } else {
                    setName([u.firstName, u.lastName].filter(Boolean).join(" "));
                    setProgram(u.program ?? "");
                    setYear(u.year ?? "");
                    setAvatarUrl(u.avatarUrl ?? "");
                }
                if (u.pushNotifs !== undefined) setPushNotifs(u.pushNotifs);
                if (u.emailDigest !== undefined) setEmailDigest(u.emailDigest);
            })
            .catch(() => showToast("Could not load profile settings.", "error"));
    }, [session?.token]);

    async function togglePushNotifs(val: boolean) {
        setPushNotifs(val);
        authApi("/users/me", { method: "PATCH", body: JSON.stringify({ pushNotifs: val }) })
            .catch(() => setPushNotifs(!val));
    }

    async function toggleEmailDigest(val: boolean) {
        setEmailDigest(val);
        authApi("/users/me", { method: "PATCH", body: JSON.stringify({ emailDigest: val }) })
            .catch(() => setEmailDigest(!val));
    }

    async function pickAvatar() {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            Alert.alert(t.permissionNeededTitle, t.photoPermissionMsg);
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.9,
        });
        if (!result.canceled) setAvatarUri(result.assets[0].uri);
    }

    async function saveProfile() {
        if (!name.trim()) { Alert.alert(t.nameRequired); return; }
        setSavingProfile(true);
        try {
            let finalAvatarUrl = avatarUrl || undefined;
            if (avatarUri) finalAvatarUrl = await uploadImage(avatarUri, session?.token);
            const parts = name.trim().split(" ");
            const firstName = parts[0];
            const lastName = parts.slice(1).join(" ") || undefined;
            await authApi("/users/me", {
                method: "PATCH",
                body: JSON.stringify({ firstName, lastName, program: program || undefined, year: year || undefined, avatarUrl: finalAvatarUrl }),
            });
            if (finalAvatarUrl) { setAvatarUrl(finalAvatarUrl); setAvatarUri(null); }
            closeModal();
            showToast("Profile updated");
        } catch (e: any) {
            Alert.alert(t.errorTitle, e.message ?? t.couldNotSaveProfile);
        } finally {
            setSavingProfile(false);
        }
    }

    async function saveClubProfile() {
        if (!clubName.trim()) { Alert.alert(t.clubNameRequired); return; }
        setSavingClubProfile(true);
        try {
            await authApi("/users/me", {
                method: "PATCH",
                body: JSON.stringify({
                    clubName:     clubName.trim()     || undefined,
                    category:     category.trim()     || undefined,
                    description:  description.trim()  || undefined,
                    instagram:    instagram.trim()     || undefined,
                    twitter:      twitter.trim()       || undefined,
                    contactEmail: contactEmail.trim()  || undefined,
                    logoUrl:      logoUrl.trim()       || undefined,
                }),
            });
            closeModal();
            showToast("Club profile updated");
        } catch (e: any) {
            Alert.alert(t.errorTitle, e.message ?? t.couldNotSaveProfile);
        } finally {
            setSavingClubProfile(false);
        }
    }

    async function savePassword() {
        if (!currentPw || !newPw || !confirmPw) { Alert.alert(t.fillAllFields); return; }
        if (newPw !== confirmPw) { Alert.alert(t.passwordsDontMatch); return; }
        if (newPw.length < 8) { Alert.alert(t.passwordMin8); return; }
        setSavingPw(true);
        try {
            const res = await authApi<{ token?: string }>("/users/me/password", {
                method: "PATCH",
                body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
            });
            if (res?.token) await updateToken(res.token);
            setCurrentPw(""); setNewPw(""); setConfirmPw("");
            closeModal();
            showToast("Password changed");
        } catch (e: any) {
            Alert.alert(t.errorTitle, e.message ?? t.couldNotChangePassword);
        } finally {
            setSavingPw(false);
        }
    }

    function confirmLogout() {
        Alert.alert(t.logOutTitle, t.logOutMsg, [
            { text: t.cancelBtn, style: "cancel" },
            { text: t.logOutAction, style: "destructive", onPress: () => signOut() },
        ]);
    }

    function confirmDeleteAccount() {
        Alert.alert(
            t.deleteAccountTitle,
            t.deleteAccountMsg,
            [
                { text: t.cancelBtn, style: "cancel" },
                {
                    text: t.deleteAccountAction,
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await authApi("/users/me", { method: "DELETE" });
                            signOut();
                        } catch (e: any) {
                            Alert.alert(t.errorTitle, e?.message ?? t.couldNotDeleteAccount);
                        }
                    },
                },
            ]
        );
    }

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            {/* Top bar */}
            <View style={s.topBar}>
                <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)} style={s.backGroup} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.back}>
                    <Ionicons name="arrow-back" size={18} color={C.primary} />
                    <Text style={s.backLabel}>{t.back}</Text>
                </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
                {/* Masthead */}
                <View style={s.masthead}>

                    <Text style={s.mastheadHeading}>{t.settingsTitle}</Text>
                    <View style={s.mastheadAccent} />
                </View>

                {/* ── Account card ── */}
                <Text style={s.sectionLabel}>{t.settingsAccount}</Text>
                <View style={s.card}>
                    {/* Edit Profile — student */}
                    {!isClub && (
                        <Row
                            icon="person-outline"
                            label={t.settingsEditProfile}
                            onPress={() => openModal("profile")}
                            C={C}
                            s={s}
                        />
                    )}

                    {/* Edit Club Profile */}
                    {isClub && (
                        <Row
                            icon="shield-outline"
                            label={t.settingsClubProfile}
                            onPress={() => openModal("club-profile")}
                            C={C}
                            s={s}
                        />
                    )}

                    <View style={s.divider} />

                    {/* Change Password */}
                    <Row
                        icon="lock-closed-outline"
                        label={t.changePassword}
                        onPress={() => openModal("password")}
                        C={C}
                        s={s}
                    />
                </View>

                {/* ── Notifications card ── */}
                <Text style={s.sectionLabel}>{t.notificationsSection}</Text>
                <View style={s.card}>
                    <View style={s.row}>
                        <View style={s.rowIcon}>
                            <Ionicons name="notifications-outline" size={18} color={C.primary} />
                        </View>
                        <Text style={s.rowLabel}>{t.pushNotifications}</Text>
                        <Switch value={pushNotifs} onValueChange={togglePushNotifs}
                            trackColor={{ true: C.primary, false: "#D1D5DB" }} thumbColor="#fff" />
                    </View>
                    <View style={s.divider} />
                    <View style={s.row}>
                        <View style={s.rowIcon}>
                            <Ionicons name="mail-outline" size={18} color={C.primary} />
                        </View>
                        <Text style={s.rowLabel}>{t.emailDigest}</Text>
                        <Switch value={emailDigest} onValueChange={toggleEmailDigest}
                            trackColor={{ true: C.primary, false: "#D1D5DB" }} thumbColor="#fff" />
                    </View>
                </View>

                {/* ── Privacy card ── */}
                <Text style={s.sectionLabel}>{t.settingsPrivacySection}</Text>
                <View style={s.card}>
                    <Pressable
                        onPress={() => router.push("/blocked-users" as any)}
                        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={t.blockedUsers}
                    >
                        <View style={s.rowIcon}>
                            <Ionicons name="ban-outline" size={18} color={C.primary} />
                        </View>
                        <Text style={s.rowLabel}>{t.blockedUsers}</Text>
                        <Ionicons name="chevron-forward" size={16} color={C.textLight} />
                    </Pressable>
                </View>

                {/* ── Calendar subscription ── */}
                <Text style={s.sectionLabel}>{t.settingsCalendar}</Text>
                <View style={s.card}>
                    <Pressable
                        onPress={subscribeCalendar}
                        disabled={calLoading}
                        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={t.settingsSubscribe}
                        accessibilityHint={t.settingsSubscribeHint}
                    >
                        <View style={s.rowIcon}>
                            <Ionicons name="calendar-outline" size={18} color={C.primary} />
                        </View>
                        <Text style={s.rowLabel}>{t.settingsSubscribe}</Text>
                        {calLoading
                            ? <ActivityIndicator size="small" color={C.primary} />
                            : <Ionicons name="chevron-forward" size={16} color={C.textLight} />}
                    </Pressable>
                </View>

                {/* ── Language card ── */}
                <Text style={s.sectionLabel}>{t.languageSection}</Text>
                <View style={s.card}>
                    <View style={s.row}>
                        <View style={s.rowIcon}>
                            <Ionicons name="language-outline" size={18} color={C.primary} />
                        </View>
                        <Text style={s.rowLabel}>{t.settingsAppLanguage}</Text>
                        <View style={s.langPicker}>
                            {(["en", "fr"] as Lang[]).map((l) => (
                                <Pressable
                                    key={l}
                                    onPress={() => setLanguage(l)}
                                    style={[s.langOption, language === l && s.langOptionActive]}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: language === l }}
                                    accessibilityLabel={l === "en" ? "English" : "Français"}
                                >
                                    <Text style={[s.langOptionText, language === l && s.langOptionTextActive]}>
                                        {l === "en" ? "EN" : "FR"}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                </View>

                {/* ── Support ── */}
                <Text style={s.sectionLabel}>{t.settingsSupport}</Text>
                <View style={s.card}>
                    <Pressable
                        onPress={() => router.push("/feedback" as any)}
                        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={t.settingsSendFeedback}
                    >
                        <View style={s.rowIcon}>
                            <Ionicons name="chatbubble-ellipses-outline" size={18} color={C.primary} />
                        </View>
                        <Text style={s.rowLabel}>{t.settingsSendFeedback}</Text>
                        <Ionicons name="chevron-forward" size={16} color={C.textLight} />
                    </Pressable>
                </View>

                {/* ── Legal ── */}
                <Text style={s.sectionLabel}>{t.settingsLegal}</Text>
                <View style={s.card}>
                    <Pressable
                        onPress={() => Linking.openURL(TOS_URL)}
                        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                        accessibilityRole="link"
                        accessibilityLabel={t.settingsTerms}
                    >
                        <View style={s.rowIcon}>
                            <Ionicons name="document-text-outline" size={18} color={C.primary} />
                        </View>
                        <Text style={s.rowLabel}>{t.settingsTerms}</Text>
                        <Ionicons name="open-outline" size={16} color={C.textLight} />
                    </Pressable>
                    <View style={s.divider} />
                    <Pressable
                        onPress={() => Linking.openURL(PRIVACY_URL)}
                        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                        accessibilityRole="link"
                        accessibilityLabel={t.settingsPrivacy}
                    >
                        <View style={s.rowIcon}>
                            <Ionicons name="shield-checkmark-outline" size={18} color={C.primary} />
                        </View>
                        <Text style={s.rowLabel}>{t.settingsPrivacy}</Text>
                        <Ionicons name="open-outline" size={16} color={C.textLight} />
                    </Pressable>
                </View>

                {/* ── Sign Out / Delete ── */}
                <View style={s.card}>
                    <Pressable
                        onPress={confirmLogout}
                        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={t.signOut}
                    >
                        <View style={[s.rowIcon, s.rowIconDestructive]}>
                            <Ionicons name="log-out-outline" size={18} color="#fff" />
                        </View>
                        <Text style={[s.rowLabel, s.rowLabelDestructive]}>{t.signOut}</Text>
                    </Pressable>
                    <View style={s.divider} />
                    <Pressable
                        onPress={confirmDeleteAccount}
                        style={({ pressed }) => [s.row, pressed && s.rowPressed]}
                        accessibilityRole="button"
                        accessibilityLabel={t.deleteAccount}
                    >
                        <View style={[s.rowIcon, s.rowIconDestructive]}>
                            <Ionicons name="trash-outline" size={18} color="#fff" />
                        </View>
                        <Text style={[s.rowLabel, s.rowLabelDestructive]}>{t.deleteAccount}</Text>
                    </Pressable>
                </View>

                <View style={{ height: 60 }} />
            </ScrollView>

            {/* ── Shared slide-up modal ── */}
            <Modal visible={modalMounted} animationType="none" transparent onRequestClose={closeModal}>
                <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
                    <Animated.View style={[s.modalBackdrop, { opacity: backdropAnim }]} pointerEvents="none" />
                    <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} accessibilityRole="button" accessibilityLabel={t.close} />
                    <Animated.View style={[s.modalSheet, { paddingBottom: insets.bottom + 16, transform: [{ translateY: slideAnim }] }]}>
                        <View style={s.modalHandle} />
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>
                                {openSection === "profile" ? "EDIT PROFILE" : openSection === "club-profile" ? "CLUB PROFILE" : "CHANGE PASSWORD"}
                            </Text>
                            <Pressable onPress={closeModal} hitSlop={8} accessibilityLabel={t.close} accessibilityRole="button">
                                <Ionicons name="close" size={20} color={C.text} />
                            </Pressable>
                        </View>
                        <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            {openSection === "profile" && (
                                <>
                                    <Field label="Profile Photo" s={s}>
                                        <Pressable onPress={pickAvatar} style={s.avatarRow}>
                                            {(avatarUri || avatarUrl) ? (
                                                <Image source={{ uri: avatarUri ?? avatarUrl }} style={s.avatarPreview} />
                                            ) : (
                                                <View style={[s.avatarPreview, s.avatarPlaceholder]}>
                                                    <Ionicons name="person" size={24} color={C.textLight} />
                                                </View>
                                            )}
                                            <Text style={s.avatarChangeText}>{t.settingsTapToChange}</Text>
                                        </Pressable>
                                    </Field>
                                    <Field label="Display Name" s={s}>
                                        <TextInput style={s.input} value={name} onChangeText={setName}
                                            placeholder={t.namePlaceholder} placeholderTextColor={C.textLight} />
                                    </Field>
                                    <Field label="Program" s={s}>
                                        <TextInput style={s.input} value={program} onChangeText={setProgram}
                                            placeholder={t.programPlaceholder} placeholderTextColor={C.textLight} />
                                    </Field>
                                    <Field label="Year" s={s}>
                                        <TextInput style={s.input} value={year} onChangeText={setYear}
                                            placeholder={t.yearPlaceholder} placeholderTextColor={C.textLight} />
                                    </Field>
                                    <FormActions onCancel={closeModal} onSave={saveProfile} saving={savingProfile} cancelLabel={t.cancel} saveLabel={t.save} s={s} />
                                </>
                            )}
                            {openSection === "club-profile" && (
                                <>
                                    <Field label="Club Name" s={s}>
                                        <TextInput style={s.input} value={clubName} onChangeText={setClubName}
                                            placeholder={t.clubNamePlaceholder} placeholderTextColor={C.textLight} />
                                    </Field>
                                    <Field label="Category" s={s}>
                                        <TextInput style={s.input} value={category} onChangeText={setCategory}
                                            placeholder={t.categoryPlaceholder} placeholderTextColor={C.textLight} />
                                    </Field>
                                    <Field label="Description" s={s}>
                                        <TextInput style={[s.input, s.inputMultiline]} value={description}
                                            onChangeText={setDescription} multiline
                                            placeholder={t.descriptionPlaceholder} placeholderTextColor={C.textLight} />
                                    </Field>
                                    <Field label="Logo URL" s={s}>
                                        <TextInput style={s.input} value={logoUrl} onChangeText={setLogoUrl}
                                            placeholder={t.websitePlaceholder} placeholderTextColor={C.textLight}
                                            autoCapitalize="none" keyboardType="url" />
                                    </Field>
                                    <Field label="Instagram" s={s}>
                                        <TextInput style={s.input} value={instagram} onChangeText={setInstagram}
                                            placeholder={t.instagramPlaceholder} placeholderTextColor={C.textLight} autoCapitalize="none" />
                                    </Field>
                                    <Field label="Twitter / X" s={s}>
                                        <TextInput style={s.input} value={twitter} onChangeText={setTwitter}
                                            placeholder={t.twitterPlaceholder} placeholderTextColor={C.textLight} autoCapitalize="none" />
                                    </Field>
                                    <Field label="Contact Email" s={s}>
                                        <TextInput style={s.input} value={contactEmail} onChangeText={setContactEmail}
                                            placeholder={t.emailPlaceholder} placeholderTextColor={C.textLight}
                                            autoCapitalize="none" keyboardType="email-address" />
                                    </Field>
                                    <FormActions onCancel={closeModal} onSave={saveClubProfile} saving={savingClubProfile} cancelLabel={t.cancel} saveLabel={t.save} s={s} />
                                </>
                            )}
                            {openSection === "password" && (
                                <>
                                    <Field label="Current Password" s={s}>
                                        <TextInput style={s.input} value={currentPw} onChangeText={setCurrentPw}
                                            secureTextEntry placeholder={t.currentPasswordPlaceholder}
                                            placeholderTextColor={C.textLight} autoCapitalize="none" />
                                    </Field>
                                    <Field label="New Password" s={s}>
                                        <TextInput style={s.input} value={newPw} onChangeText={setNewPw}
                                            secureTextEntry placeholder={t.newPasswordPlaceholder}
                                            placeholderTextColor={C.textLight} autoCapitalize="none" />
                                        {newPw.length > 0 && (() => {
                                            const str = passwordStrength(newPw);
                                            return (
                                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
                                                    {([1, 2, 3, 4] as const).map((i) => (
                                                        <View key={i} style={{ flex: 1, height: 3, backgroundColor: i <= str.level ? str.color : C.border }} />
                                                    ))}
                                                    <Text style={{ fontSize: 9, fontWeight: "800", color: str.color, letterSpacing: 1, width: 44, textAlign: "right" }}>
                                                        {str.label}
                                                    </Text>
                                                </View>
                                            );
                                        })()}
                                    </Field>
                                    <Field label="Confirm New Password" s={s}>
                                        <TextInput style={s.input} value={confirmPw} onChangeText={setConfirmPw}
                                            secureTextEntry placeholder={t.confirmPasswordPlaceholder}
                                            placeholderTextColor={C.textLight} autoCapitalize="none" />
                                    </Field>
                                    <FormActions onCancel={closeModal} onSave={savePassword} saving={savingPw} cancelLabel={t.cancel} saveLabel={t.save} s={s} />
                                </>
                            )}
                        </ScrollView>
                    </Animated.View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ icon, label, onPress, C, s }: {
    icon: string; label: string; onPress: () => void;
    C: AppColors; s: ReturnType<typeof makeStyles>;
}) {
    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [s.row, pressed && s.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <View style={s.rowIcon}>
                <Ionicons name={icon as any} size={18} color={C.primary} />
            </View>
            <Text style={s.rowLabel}>{label}</Text>
            <Ionicons name="chevron-forward" size={16} color={C.textLight} />
        </Pressable>
    );
}

function Field({ label, children, s }: { label: string; children: React.ReactNode; s: ReturnType<typeof makeStyles> }) {
    return (
        <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>{label}</Text>
            {children}
        </View>
    );
}

function FormActions({ onCancel, onSave, saving, cancelLabel = "CANCEL", saveLabel = "SAVE", s }: {
    onCancel: () => void; onSave: () => void; saving: boolean; cancelLabel?: string; saveLabel?: string;
    s: ReturnType<typeof makeStyles>;
}) {
    return (
        <View style={s.formActions}>
            <Pressable style={s.cancelBtn} onPress={onCancel}>
                <Text style={s.cancelBtnText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving}>
                {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.saveBtnText}>{saveLabel}</Text>
                }
            </Pressable>
        </View>
    );
}
