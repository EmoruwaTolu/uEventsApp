import { useState, useMemo, useEffect } from "react";
import {
    View, Text, ScrollView, Pressable, TextInput,
    StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../lib/useApi";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/LangContext";
import type { AppColors } from "../styles/theme";

type Step = 1 | 2 | 3;

const makeStyles = (C: AppColors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    header: {
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 16,
    },
    heading: {
        fontSize: 28,
        fontWeight: "600",
        fontFamily: "Georgia",
        color: C.text,
        letterSpacing: -0.5,
    },
    subheading: {
        fontSize: 14,
        color: C.textMuted,
        marginTop: 4,
        marginBottom: 20,
    },
    stepRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 0,
        position: "relative",
    },
    stepConnector: {
        position: "absolute",
        top: 14,
        left: 14,
        right: 14,
        height: 1,
        backgroundColor: C.textFaint,
        zIndex: -1,
    },
    stepItem: {
        flex: 1,
        alignItems: "center",
        gap: 4,
    },
    stepDot: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: C.borderWarm,
        alignItems: "center",
        justifyContent: "center",
    },
    stepDotActive: { backgroundColor: C.primary },
    stepNum: { fontSize: 12, fontWeight: "700", color: C.textLight },
    stepNumActive: { color: "#fff" },
    stepLabel: { fontSize: 10, fontWeight: "600", color: C.textLight, letterSpacing: 0.5 },
    stepLabelActive: { color: C.primary },

    scroll: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 8 },
    card: {
        backgroundColor: C.surface,
        padding: 20,
        gap: 4,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
    },
    cardTitle: {
        fontSize: 11,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
        marginBottom: 12,
    },
    cardSubtitle: {
        fontSize: 12,
        color: C.textLight,
        marginTop: -8,
        marginBottom: 8,
    },
    label: {
        fontSize: 11,
        fontWeight: "600",
        color: C.textMuted,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginTop: 10,
    },
    input: {
        backgroundColor: C.surfaceAlt,
        borderWidth: 1,
        borderColor: C.borderWarm,
        paddingVertical: 10,
        paddingHorizontal: 12,
        fontSize: 14,
        color: C.text,
        marginTop: 4,
    },
    multiline: { minHeight: 96, paddingTop: 10 },
    hint: { fontSize: 11, color: C.textLight, marginTop: 2 },

    prefixInput: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: C.surfaceAlt,
        borderWidth: 1,
        borderColor: C.borderWarm,
        marginTop: 4,
    },
    prefix: {
        paddingHorizontal: 12,
        fontSize: 14,
        color: C.textLight,
        fontWeight: "600",
    },
    prefixField: {
        flex: 1,
        paddingVertical: 10,
        paddingRight: 12,
        fontSize: 14,
        color: C.text,
    },

    actions: {
        flexDirection: "row",
        gap: 10,
        marginTop: 20,
    },
    backBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: C.textFaint,
    },
    backBtnText: { fontSize: 13, fontWeight: "600", color: C.textMuted },
    skipBtn: {
        flex: 1,
        paddingVertical: 12,
        alignItems: "center",
        borderWidth: 1,
        borderColor: C.textFaint,
    },
    skipBtnText: { fontSize: 13, fontWeight: "600", color: C.textMuted },
    nextBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 12,
        backgroundColor: C.primary,
    },
    nextBtnDisabled: { opacity: 0.4 },
    nextBtnText: { fontSize: 13, fontWeight: "700", color: "#fff", letterSpacing: 0.5 },

    laterBtn: { alignItems: "center", paddingVertical: 20 },
    laterText: { fontSize: 12, color: C.textLight, textDecorationLine: "underline" },
});

export default function ClubOnboarding() {
    const router = useRouter();
    const { completeOnboarding } = useAuth();
    const authApi = useApi();
    const { colors: C } = useTheme();
    const t = useT();
    const s = useMemo(() => makeStyles(C), [C]);

    const [step, setStep] = useState<Step>(1);
    const [saving, setSaving] = useState(false);

    // Step 1: identity
    const [clubName, setClubName] = useState("");
    const [clubNameFr, setClubNameFr] = useState("");
    const [category, setCategory] = useState("");
    const [description, setDescription] = useState("");
    const [descriptionFr, setDescriptionFr] = useState("");

    // Pre-fill from the account so we never re-ask what signup already captured
    // (the club name), and so an existing club editing later sees its values.
    useEffect(() => {
        authApi<{ clubName?: string; clubNameFr?: string; category?: string; description?: string; descriptionFr?: string }>("/users/me")
            .then((u) => {
                if (u.clubName) setClubName(u.clubName);
                if (u.clubNameFr) setClubNameFr(u.clubNameFr);
                if (u.category) setCategory(u.category);
                if (u.description) setDescription(u.description);
                if (u.descriptionFr) setDescriptionFr(u.descriptionFr);
            })
            .catch(() => {});
    }, []);

    // Step 2: visuals & contact
    const [logoUrl, setLogoUrl] = useState("");
    const [contactEmail, setContactEmail] = useState("");

    // Step 3: socials
    const [instagram, setInstagram] = useState("");
    const [twitter, setTwitter] = useState("");

    async function finish() {
        setSaving(true);
        try {
            await authApi("/users/me", {
                method: "PATCH",
                body: JSON.stringify({
                    clubName:      clubName.trim()      || undefined,
                    clubNameFr:    clubNameFr.trim(),
                    category:      category.trim()      || undefined,
                    description:   description.trim()   || undefined,
                    descriptionFr: descriptionFr.trim(),
                    logoUrl:       logoUrl.trim()       || undefined,
                    contactEmail: contactEmail.trim() || undefined,
                    instagram:    instagram.trim()    || undefined,
                    twitter:      twitter.trim()      || undefined,
                }),
            });
            await completeOnboarding();
            router.replace("/(tabs)");
        } catch (e: any) {
            Alert.alert(t.errorTitle, e.message ?? t.couldNotSave);
        } finally {
            setSaving(false);
        }
    }

    const STEPS = [
        { number: 1, label: "Identity" },
        { number: 2, label: "Contact" },
        { number: 3, label: "Socials" },
    ];

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            <View style={s.container}>
                <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
                    {/* Header */}
                    <View style={s.header}>
                        <Text style={s.heading}>{t.obSetUpClub}</Text>
                        <Text style={s.subheading}>{t.obHelpDiscover}</Text>

                        {/* Step indicators */}
                        <View style={s.stepRow}>
                            {STEPS.map(({ number, label }) => (
                                <View key={number} style={s.stepItem}>
                                    <View style={[s.stepDot, step >= number && s.stepDotActive]}>
                                        {step > number
                                            ? <Ionicons name="checkmark" size={12} color="#fff" />
                                            : <Text style={[s.stepNum, step === number && s.stepNumActive]}>{number}</Text>
                                        }
                                    </View>
                                    <Text style={[s.stepLabel, step === number && s.stepLabelActive]}>{label}</Text>
                                </View>
                            ))}
                            <View style={s.stepConnector} />
                        </View>
                    </View>

                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={s.scroll}
                    >
                        {/* ── Step 1: Identity ── */}
                        {step === 1 && (
                            <View style={s.card}>
                                <Text style={s.cardTitle}>{t.obClubIdentity}</Text>

                                <Text style={s.label}>{t.obClubName}</Text>
                                <TextInput
                                    style={s.input}
                                    value={clubName}
                                    onChangeText={setClubName}
                                    placeholder={t.phClubName}
                                    placeholderTextColor={C.textLight}
                                />

                                <Text style={s.label}>{t.obClubNameFr}</Text>
                                <TextInput
                                    style={s.input}
                                    value={clubNameFr}
                                    onChangeText={setClubNameFr}
                                    placeholder={t.phClubNameFr}
                                    placeholderTextColor={C.textLight}
                                />

                                <Text style={s.label}>{t.obCategory}</Text>
                                <TextInput
                                    style={s.input}
                                    value={category}
                                    onChangeText={setCategory}
                                    placeholder={t.phCategory}
                                    placeholderTextColor={C.textLight}
                                />

                                <Text style={s.label}>{t.obDescription}</Text>
                                <TextInput
                                    style={[s.input, s.multiline]}
                                    value={description}
                                    onChangeText={setDescription}
                                    placeholder={t.phDescription}
                                    placeholderTextColor={C.textLight}
                                    multiline
                                    textAlignVertical="top"
                                />

                                <Text style={s.label}>{t.obDescriptionFr}</Text>
                                <TextInput
                                    style={[s.input, s.multiline]}
                                    value={descriptionFr}
                                    onChangeText={setDescriptionFr}
                                    placeholder={t.phDescriptionFr}
                                    placeholderTextColor={C.textLight}
                                    multiline
                                    textAlignVertical="top"
                                />

                                <View style={s.actions}>
                                    <Pressable style={s.skipBtn} onPress={() => setStep(2)}>
                                        <Text style={s.skipBtnText}>{t.obSkipForNow}</Text>
                                    </Pressable>
                                    <Pressable
                                        style={[s.nextBtn, !clubName.trim() && s.nextBtnDisabled]}
                                        onPress={() => {
                                            if (!clubName.trim()) { Alert.alert(t.clubNameRequired); return; }
                                            setStep(2);
                                        }}
                                    >
                                        <Text style={s.nextBtnText}>{t.obNext}</Text>
                                        <Ionicons name="arrow-forward" size={14} color="#fff" />
                                    </Pressable>
                                </View>
                            </View>
                        )}

                        {/* ── Step 2: Contact ── */}
                        {step === 2 && (
                            <View style={s.card}>
                                <Text style={s.cardTitle}>CONTACT & VISUALS</Text>

                                <Text style={s.label}>{t.obLogoUrl}</Text>
                                <TextInput
                                    style={s.input}
                                    value={logoUrl}
                                    onChangeText={setLogoUrl}
                                    placeholder="https://..."
                                    placeholderTextColor={C.textLight}
                                    autoCapitalize="none"
                                    keyboardType="url"
                                />
                                <Text style={s.hint}>{t.obLogoUrlHint}</Text>

                                <Text style={s.label}>{t.obContactEmail}</Text>
                                <TextInput
                                    style={s.input}
                                    value={contactEmail}
                                    onChangeText={setContactEmail}
                                    placeholder={t.phContactEmail}
                                    placeholderTextColor={C.textLight}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                />

                                <View style={s.actions}>
                                    <Pressable style={s.backBtn} onPress={() => setStep(1)}>
                                        <Ionicons name="arrow-back" size={14} color={C.textMuted} />
                                        <Text style={s.backBtnText}>{t.obBack}</Text>
                                    </Pressable>
                                    <Pressable style={s.nextBtn} onPress={() => setStep(3)}>
                                        <Text style={s.nextBtnText}>{t.obNext}</Text>
                                        <Ionicons name="arrow-forward" size={14} color="#fff" />
                                    </Pressable>
                                </View>
                            </View>
                        )}

                        {/* ── Step 3: Socials ── */}
                        {step === 3 && (
                            <View style={s.card}>
                                <Text style={s.cardTitle}>{t.obSocialLinks}</Text>
                                <Text style={s.cardSubtitle}>{t.obSocialLinksHint}</Text>

                                <Text style={s.label}>{t.obInstagram}</Text>
                                <View style={s.prefixInput}>
                                    <Text style={s.prefix}>@</Text>
                                    <TextInput
                                        style={s.prefixField}
                                        value={instagram}
                                        onChangeText={setInstagram}
                                        placeholder={t.phSocialHandle}
                                        placeholderTextColor={C.textLight}
                                        autoCapitalize="none"
                                    />
                                </View>

                                <Text style={s.label}>{t.obTwitter}</Text>
                                <View style={s.prefixInput}>
                                    <Text style={s.prefix}>@</Text>
                                    <TextInput
                                        style={s.prefixField}
                                        value={twitter}
                                        onChangeText={setTwitter}
                                        placeholder={t.phSocialHandle}
                                        placeholderTextColor={C.textLight}
                                        autoCapitalize="none"
                                    />
                                </View>

                                <View style={s.actions}>
                                    <Pressable style={s.backBtn} onPress={() => setStep(2)}>
                                        <Ionicons name="arrow-back" size={14} color={C.textMuted} />
                                        <Text style={s.backBtnText}>{t.obBack}</Text>
                                    </Pressable>
                                    <Pressable style={s.nextBtn} onPress={finish} disabled={saving}>
                                        {saving
                                            ? <ActivityIndicator color="#fff" size="small" />
                                            : <>
                                                <Text style={s.nextBtnText}>{t.obDone}</Text>
                                                <Ionicons name="checkmark" size={14} color="#fff" />
                                            </>
                                        }
                                    </Pressable>
                                </View>
                            </View>
                        )}

                        <Pressable style={s.laterBtn} onPress={async () => {
                            await completeOnboarding();
                            router.replace("/(tabs)");
                        }}>
                            <Text style={s.laterText}>{t.obDoThisLater}</Text>
                        </Pressable>
                    </ScrollView>
                </SafeAreaView>
            </View>
        </KeyboardAvoidingView>
    );
}
