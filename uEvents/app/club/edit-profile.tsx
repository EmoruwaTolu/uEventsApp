import { useState, useEffect, useMemo } from "react";
import {
    View, Text, TextInput, ScrollView, Pressable, Image,
    StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../auth/AuthContext";
import { uploadImage } from "../../lib/uploadImage";
import { useToast } from "../../lib/ToastContext";
import { useT } from "../../lib/LangContext";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";

type ClubProfile = {
    clubName?: string;
    category?: string;
    description?: string;
    descriptionFr?: string;
    logoUrl?: string;
    contactEmail?: string;
    instagram?: string;
    twitter?: string;
    location?: string;
};

const makeEditProfileStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    topBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
        backgroundColor: C.bg,
    },
    backGroup: { flexDirection: "row", alignItems: "center", gap: 6, width: 80 },
    backLabel: { fontSize: 14, fontWeight: "900", color: C.primary, letterSpacing: 1 },
    topBarTitle: { fontSize: 13, fontWeight: "900", color: C.text, letterSpacing: 2 },
    saveBtn: {
        backgroundColor: C.primary,
        paddingHorizontal: 16,
        paddingVertical: 8,
        width: 80,
        alignItems: "center",
    },
    saveBtnText: { fontSize: 12, fontWeight: "900", color: "#fff", letterSpacing: 1.5 },

    scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },

    section: { marginBottom: 28 },
    sectionLabel: {
        fontSize: 11,
        fontWeight: "900",
        color: C.primary,
        letterSpacing: 2,
        marginBottom: 14,
    },
    label: {
        fontSize: 10,
        fontWeight: "700",
        color: C.textMuted,
        letterSpacing: 1,
        marginTop: 12,
        marginBottom: 4,
    },
    input: {
        backgroundColor: C.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
        paddingVertical: 11,
        paddingHorizontal: 12,
        fontSize: 14,
        color: C.text,
    },
    multiline: { minHeight: 88, paddingTop: 10 },

    logoPicker: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: C.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
        padding: 12,
    },
    logoPreview: {
        width: 60,
        height: 60,
        borderRadius: 4,
        backgroundColor: C.surfaceAlt,
    },
    logoPlaceholder: {
        width: 60,
        height: 60,
        backgroundColor: C.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
    },
    logoPickerRight: { flex: 1, gap: 3 },
    logoPickerTitle: { fontSize: 12, fontWeight: "800", color: C.text, letterSpacing: 0.5 },
    logoPickerSub: { fontSize: 11, color: C.textLight },
    logoRemove: { fontSize: 11, color: C.primary, fontWeight: "600", marginTop: 4 },

    prefixRow: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: C.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.borderWarm,
    },
    prefix: {
        paddingHorizontal: 12,
        fontSize: 14,
        color: C.textLight,
        fontWeight: "600",
    },
    prefixField: {
        flex: 1,
        paddingVertical: 11,
        paddingRight: 12,
        fontSize: 14,
        color: C.text,
    },
});

export default function EditClubProfile() {
    const router = useRouter();
    const authApi = useApi();
    const { session } = useAuth();
    const { showToast } = useToast();
    const { colors: C } = useTheme();
    const t = useT();
    const styles = useMemo(() => makeEditProfileStyles(C), [C]);

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [saving, setSaving] = useState(false);

    const [clubName, setClubName] = useState("");
    const [category, setCategory] = useState("");
    const [description, setDescription] = useState("");
    const [descriptionFr, setDescriptionFr] = useState("");
    const [logoUri, setLogoUri] = useState<string | null>(null); // local pick
    const [logoUrl, setLogoUrl] = useState("");                  // existing remote URL
    const [contactEmail, setContactEmail] = useState("");
    const [instagram, setInstagram] = useState("");
    const [twitter, setTwitter] = useState("");
    const [location, setLocation] = useState("");

    useEffect(() => {
        authApi<ClubProfile>("/users/me")
            .then((data) => {
                setClubName(data.clubName ?? "");
                setCategory(data.category ?? "");
                setDescription(data.description ?? "");
                setDescriptionFr(data.descriptionFr ?? "");
                setLogoUrl(data.logoUrl ?? "");
                setContactEmail(data.contactEmail ?? "");
                setInstagram(data.instagram?.replace(/^@/, "") ?? "");
                setTwitter(data.twitter?.replace(/^@/, "") ?? "");
                setLocation(data.location ?? "");
            })
            .catch(() => setLoadError(true))
            .finally(() => setLoading(false));
    }, []);

    async function pickLogo() {
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
        if (!result.canceled) {
            setLogoUri(result.assets[0].uri);
        }
    }

    async function save() {
        if (!clubName.trim()) {
            Alert.alert(t.clubNameRequired);
            return;
        }
        setSaving(true);
        try {
            let finalLogoUrl = logoUrl || null;
            if (logoUri) {
                finalLogoUrl = await uploadImage(logoUri, session?.token);
            }
            await authApi("/users/me", {
                method: "PATCH",
                body: JSON.stringify({
                    clubName: clubName.trim(),
                    category: category.trim() || null,
                    description: description.trim() || null,
                    descriptionFr: descriptionFr.trim() || null,
                    logoUrl: finalLogoUrl,
                    contactEmail: contactEmail.trim() || null,
                    instagram: instagram.trim() || null,
                    twitter: twitter.trim() || null,
                    location: location.trim() || null,
                }),
            });
            showToast("Profile saved");
            router.back();
        } catch (e: any) {
            Alert.alert(t.errorTitle, e.message ?? t.couldNotSaveChanges);
        } finally {
            setSaving(false);
        }
    }

    const logoPreview = logoUri ?? (logoUrl || null);

    if (loading) {
        return (
            <SafeAreaView style={styles.safe} edges={["top"]}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator color={C.primary} />
                </View>
            </SafeAreaView>
        );
    }

    if (loadError) {
        return (
            <SafeAreaView style={styles.safe} edges={["top"]}>
                <View style={styles.topBar}>
                    <Pressable onPress={() => router.back()} style={styles.backGroup}>
                        <Ionicons name="arrow-back" size={18} color={C.primary} />
                        <Text style={styles.backLabel}>BACK</Text>
                    </Pressable>
                    <Text style={styles.topBarTitle}>EDIT PROFILE</Text>
                    <View style={{ width: 80 }} />
                </View>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
                    <Ionicons name="cloud-offline-outline" size={36} color={C.textFaint} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: C.textMuted, textAlign: "center" }}>
                        COULDN'T LOAD PROFILE
                    </Text>
                    <Pressable
                        onPress={() => {
                            setLoadError(false);
                            setLoading(true);
                            authApi<ClubProfile>("/users/me")
                                .then((data) => {
                                    setClubName(data.clubName ?? "");
                                    setCategory(data.category ?? "");
                                    setDescription(data.description ?? "");
                                    setDescriptionFr(data.descriptionFr ?? "");
                                    setLogoUrl(data.logoUrl ?? "");
                                    setContactEmail(data.contactEmail ?? "");
                                    setInstagram(data.instagram?.replace(/^@/, "") ?? "");
                                    setTwitter(data.twitter?.replace(/^@/, "") ?? "");
                                    setLocation(data.location ?? "");
                                })
                                .catch(() => setLoadError(true))
                                .finally(() => setLoading(false));
                        }}
                        style={{ borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 24, paddingVertical: 10 }}
                    >
                        <Text style={{ fontSize: 11, fontWeight: "800", color: C.primary, letterSpacing: 1.5 }}>TRY AGAIN</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
                {/* Top bar */}
                <View style={styles.topBar}>
                    <Pressable onPress={() => router.back()} style={styles.backGroup}>
                        <Ionicons name="arrow-back" size={18} color={C.primary} />
                        <Text style={styles.backLabel}>BACK</Text>
                    </Pressable>
                    <Text style={styles.topBarTitle}>EDIT PROFILE</Text>
                    <Pressable onPress={save} disabled={saving} style={styles.saveBtn}>
                        {saving
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.saveBtnText}>SAVE</Text>
                        }
                    </Pressable>
                </View>

                <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scroll}
                >
                    {/* Identity */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>1. IDENTITY</Text>

                        <Text style={styles.label}>CLUB NAME</Text>
                        <TextInput
                            style={styles.input}
                            value={clubName}
                            onChangeText={setClubName}
                            placeholder="e.g. Computer Science Society"
                            placeholderTextColor={C.textLight}
                        />

                        <Text style={styles.label}>CATEGORY</Text>
                        <TextInput
                            style={styles.input}
                            value={category}
                            onChangeText={setCategory}
                            placeholder="e.g. Academic, Sports, Arts"
                            placeholderTextColor={C.textLight}
                        />

                        <Text style={styles.label}>LOCATION</Text>
                        <TextInput
                            style={styles.input}
                            value={location}
                            onChangeText={setLocation}
                            placeholder="e.g. Room 204, Arts Building"
                            placeholderTextColor={C.textLight}
                        />
                    </View>

                    {/* About */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>2. ABOUT</Text>

                        <Text style={styles.label}>DESCRIPTION (EN)</Text>
                        <TextInput
                            style={[styles.input, styles.multiline]}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="Tell students what your club is about..."
                            placeholderTextColor={C.textLight}
                            multiline
                            textAlignVertical="top"
                        />

                        <Text style={styles.label}>DESCRIPTION (FR)</Text>
                        <TextInput
                            style={[styles.input, styles.multiline]}
                            value={descriptionFr}
                            onChangeText={setDescriptionFr}
                            placeholder="Description en français..."
                            placeholderTextColor={C.textLight}
                            multiline
                            textAlignVertical="top"
                        />
                    </View>

                    {/* Visuals */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>3. VISUALS</Text>

                        <Text style={styles.label}>CLUB LOGO</Text>
                        <Pressable style={styles.logoPicker} onPress={pickLogo}>
                            {logoPreview ? (
                                <Image source={{ uri: logoPreview }} style={styles.logoPreview} />
                            ) : (
                                <View style={styles.logoPlaceholder}>
                                    <Ionicons name="image-outline" size={28} color={C.textLight} />
                                </View>
                            )}
                            <View style={styles.logoPickerRight}>
                                <Text style={styles.logoPickerTitle}>
                                    {logoPreview ? "CHANGE LOGO" : "UPLOAD LOGO"}
                                </Text>
                                <Text style={styles.logoPickerSub}>Tap to choose from your photo library</Text>
                                {logoPreview && (
                                    <Pressable
                                        hitSlop={8}
                                        onPress={() => { setLogoUri(null); setLogoUrl(""); }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Remove logo"
                                    >
                                        <Text style={styles.logoRemove}>Remove</Text>
                                    </Pressable>
                                )}
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={C.textLight} style={{ alignSelf: "center" }} />
                        </Pressable>
                    </View>

                    {/* Contact */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>4. CONTACT</Text>

                        <Text style={styles.label}>EMAIL</Text>
                        <TextInput
                            style={styles.input}
                            value={contactEmail}
                            onChangeText={setContactEmail}
                            placeholder="contact@yourclub.com"
                            placeholderTextColor={C.textLight}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />
                    </View>

                    {/* Socials */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>5. SOCIAL LINKS</Text>

                        <Text style={styles.label}>INSTAGRAM</Text>
                        <View style={styles.prefixRow}>
                            <Text style={styles.prefix}>@</Text>
                            <TextInput
                                style={styles.prefixField}
                                value={instagram}
                                onChangeText={setInstagram}
                                placeholder="yourclub"
                                placeholderTextColor={C.textLight}
                                autoCapitalize="none"
                            />
                        </View>

                        <Text style={styles.label}>TWITTER / X</Text>
                        <View style={styles.prefixRow}>
                            <Text style={styles.prefix}>@</Text>
                            <TextInput
                                style={styles.prefixField}
                                value={twitter}
                                onChangeText={setTwitter}
                                placeholder="yourclub"
                                placeholderTextColor={C.textLight}
                                autoCapitalize="none"
                            />
                        </View>
                    </View>

                    <View style={{ height: 60 }} />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
