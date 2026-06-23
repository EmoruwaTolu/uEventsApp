import React, { useState, useMemo } from "react";
import {
    View, Text, TextInput, Pressable, StyleSheet,
    Image, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../lib/useApi";
import { useToast } from "../lib/ToastContext";
import { uploadImage } from "../lib/uploadImage";
import { useTheme } from "../lib/ThemeContext";
import type { AppColors } from "../styles/theme";

type FeedbackType = "BUG_REPORT" | "FEATURE_REQUEST";

const makeFeedbackStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },

    topBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.border,
        backgroundColor: C.bg,
    },
    closeBtn: {
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
    },
    topBarTitle: {
        fontSize: 12,
        fontWeight: "900",
        color: C.text,
        letterSpacing: 2,
    },

    scroll: {
        paddingHorizontal: 20,
        paddingTop: 24,
        paddingBottom: 16,
        gap: 6,
    },

    heading: {
        fontSize: 26,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.5,
        marginBottom: 6,
    },
    sub: {
        fontSize: 14,
        color: C.textMuted,
        lineHeight: 20,
        marginBottom: 24,
    },

    label: {
        fontSize: 10,
        fontWeight: "800",
        color: C.textLight,
        letterSpacing: 2,
        marginBottom: 8,
        marginTop: 16,
    },

    typePicker: {
        flexDirection: "row",
        gap: 10,
    },
    typeOption: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        paddingVertical: 12,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
    },
    typeOptionActive: {
        backgroundColor: C.primary,
        borderColor: C.primary,
    },
    typeOptionText: {
        fontSize: 13,
        fontWeight: "700",
        color: C.textMuted,
    },
    typeOptionTextActive: {
        color: "#fff",
    },

    messageInput: {
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        padding: 14,
        fontSize: 14,
        color: C.text,
        minHeight: 140,
        lineHeight: 21,
    },
    charCount: {
        fontSize: 11,
        color: C.textLight,
        textAlign: "right",
        marginTop: 4,
    },

    screenshotPicker: {
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        borderStyle: "dashed",
        height: 120,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    screenshotPickerText: {
        fontSize: 10,
        fontWeight: "800",
        color: C.textLight,
        letterSpacing: 1.5,
    },
    screenshotPreviewWrap: {
        position: "relative",
        height: 200,
        backgroundColor: "#111",
    },
    screenshotPreview: {
        width: "100%",
        height: "100%",
    },
    removeScreenshot: {
        position: "absolute",
        top: 8,
        right: 8,
    },

    footer: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.border,
        backgroundColor: C.bg,
    },
    submitBtn: {
        backgroundColor: C.primary,
        paddingVertical: 16,
        alignItems: "center",
    },
    submitBtnDisabled: {
        opacity: 0.45,
    },
    submitBtnText: {
        fontSize: 12,
        fontWeight: "900",
        color: "#fff",
        letterSpacing: 2,
    },
});

export default function FeedbackModal() {
    const router = useRouter();
    const { session } = useAuth();
    const authApi = useApi();
    const { showToast } = useToast();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeFeedbackStyles(C), [C]);

    const [feedbackType, setFeedbackType] = useState<FeedbackType>("BUG_REPORT");
    const [message, setMessage] = useState("");
    const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function pickScreenshot() {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            Alert.alert("Permission needed", "Please allow photo library access.");
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: false,
            quality: 0.9,
        });
        if (!result.canceled) setScreenshotUri(result.assets[0].uri);
    }

    async function submit() {
        if (!message.trim()) {
            Alert.alert("Please describe your feedback.");
            return;
        }
        setSubmitting(true);
        try {
            let imageUrl: string | undefined;
            if (screenshotUri) {
                imageUrl = await uploadImage(screenshotUri, session?.token);
            }
            await authApi("/feedback", {
                method: "POST",
                body: JSON.stringify({
                    type: feedbackType,
                    message: message.trim(),
                    imageUrl,
                    contactEmail: session?.email ?? undefined,
                }),
            });
            showToast("Feedback sent — thank you!");
            router.back();
        } catch (e: any) {
            Alert.alert("Error", e.message ?? "Could not send feedback.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <SafeAreaView style={styles.safe} edges={["top"]}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>

                {/* Top bar */}
                <View style={styles.topBar}>
                    <Pressable onPress={() => router.back()} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
                        <Ionicons name="close" size={22} color={C.textMuted} />
                    </Pressable>
                    <Text style={styles.topBarTitle}>FEEDBACK</Text>
                    <View style={{ width: 36 }} />
                </View>

                <ScrollView
                    contentContainerStyle={styles.scroll}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Heading */}
                    <Text style={styles.heading}>Tell us what's on your mind</Text>
                    <Text style={styles.sub}>
                        Found a bug or have an idea? We read every submission.
                    </Text>

                    {/* Type toggle */}
                    <Text style={styles.label}>TYPE</Text>
                    <View style={styles.typePicker}>
                        {(["BUG_REPORT", "FEATURE_REQUEST"] as FeedbackType[]).map((t) => (
                            <Pressable
                                key={t}
                                style={[styles.typeOption, feedbackType === t && styles.typeOptionActive]}
                                onPress={() => setFeedbackType(t)}
                            >
                                <Ionicons
                                    name={t === "BUG_REPORT" ? "bug-outline" : "bulb-outline"}
                                    size={16}
                                    color={feedbackType === t ? "#fff" : C.textMuted}
                                />
                                <Text style={[styles.typeOptionText, feedbackType === t && styles.typeOptionTextActive]}>
                                    {t === "BUG_REPORT" ? "Bug Report" : "Suggestion"}
                                </Text>
                            </Pressable>
                        ))}
                    </View>

                    {/* Message */}
                    <Text style={styles.label}>MESSAGE</Text>
                    <TextInput
                        style={styles.messageInput}
                        value={message}
                        onChangeText={setMessage}
                        placeholder={
                            feedbackType === "BUG_REPORT"
                                ? "Describe what happened and how to reproduce it..."
                                : "Describe the feature or improvement you'd like to see..."
                        }
                        placeholderTextColor={C.textLight}
                        multiline
                        maxLength={2000}
                        textAlignVertical="top"
                    />
                    <Text style={styles.charCount}>{message.length}/2000</Text>

                    {/* Screenshot */}
                    <Text style={styles.label}>SCREENSHOT{feedbackType === "BUG_REPORT" ? " (optional)" : ""}</Text>
                    {screenshotUri ? (
                        <View style={styles.screenshotPreviewWrap}>
                            <Image source={{ uri: screenshotUri }} style={styles.screenshotPreview} resizeMode="cover" />
                            <Pressable style={styles.removeScreenshot} onPress={() => setScreenshotUri(null)} accessibilityRole="button" accessibilityLabel="Remove screenshot" hitSlop={8}>
                                <Ionicons name="close-circle" size={24} color="#fff" />
                            </Pressable>
                        </View>
                    ) : (
                        <Pressable style={styles.screenshotPicker} onPress={pickScreenshot}>
                            <Ionicons name="image-outline" size={28} color={C.textLight} />
                            <Text style={styles.screenshotPickerText}>TAP TO ATTACH A SCREENSHOT</Text>
                        </Pressable>
                    )}
                </ScrollView>

                {/* Submit */}
                <View style={styles.footer}>
                    <Pressable
                        style={[styles.submitBtn, (submitting || !message.trim()) && styles.submitBtnDisabled]}
                        onPress={submit}
                        disabled={submitting || !message.trim()}
                    >
                        {submitting ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.submitBtnText}>SEND FEEDBACK</Text>
                        )}
                    </Pressable>
                </View>

            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
