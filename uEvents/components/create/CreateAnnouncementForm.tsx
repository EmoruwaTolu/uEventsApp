import React, { useRef, useState, useEffect } from "react";
import {
    Animated,
    View,
    Text,
    TextInput,
    Pressable,
    ScrollView,
    StyleSheet,
    ActivityIndicator,
    Alert,
    Platform,
    KeyboardAvoidingView,
} from "react-native";
import BottomSheet from "../BottomSheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import type { AnnouncementDraftValues } from "../../lib/draftsStore";
import MultiImagePicker from "./MultiImagePicker";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../auth/AuthContext";
import { uploadImage } from "../../lib/uploadImage";
import { useToast } from "../../lib/ToastContext";
import { cs } from "./CreateEventForm";
import { useT } from "../../lib/LangContext";
import { localeFor } from "../../lib/datetime";

type Lang = "en" | "fr";

type Props = {
    onBack: () => void;
    onSuccess?: () => void;
    initialValues?: AnnouncementDraftValues;
    postId?: string;
};

const MAX_TITLE = 120;
const MAX_BODY = 2000;
const BURGUNDY = "#8C0327";
const IDLE_BORDER = "#D4CFC8";
const ANIM_DURATION = 200;

function useFieldAnim() {
    const anim = useRef(new Animated.Value(0)).current;
    function focus() {
        Animated.timing(anim, { toValue: 1, duration: ANIM_DURATION, useNativeDriver: false }).start();
    }
    function blur() {
        Animated.timing(anim, { toValue: 0, duration: ANIM_DURATION, useNativeDriver: false }).start();
    }
    return { anim, focus, blur };
}

export default function CreateAnnouncementForm({ onBack, onSuccess, initialValues, postId }: Props) {
    const authApi = useApi();
    const { session } = useAuth();
    const { showToast } = useToast();
    const [submitting, setSubmitting] = useState(false);
    const [lang, setLang] = useState<Lang>(initialValues?.lang ?? "en");
    const [titles, setTitles] = useState<Record<Lang, string>>({
        en: initialValues?.title ?? "",
        fr: initialValues?.titleFr ?? "",
    });
    const [bodies, setBodies] = useState<Record<Lang, string>>({
        en: initialValues?.description ?? "",
        fr: initialValues?.descriptionFr ?? "",
    });
    const [images, setImages] = useState<string[]>(initialValues?.images ?? []);
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
    const [pickerTarget, setPickerTarget] = useState<"sched-date" | "sched-time" | null>(null);

    const titleField = useFieldAnim();
    const bodyField = useFieldAnim();

    const t = useT();
    const remaining = MAX_TITLE - titles[lang].length;
    const [autoSaving, setAutoSaving] = useState(false);
    const [touchedTitle, setTouchedTitle] = useState(false);
    const [touchedBody, setTouchedBody] = useState(false);
    // Comment controls
    const [commentsDisabled, setCommentsDisabled] = useState(initialValues?.commentsDisabled ?? false);
    const [commentsLockDate, setCommentsLockDate] = useState<Date | null>(
        initialValues?.commentsLockedAt ? new Date(initialValues.commentsLockedAt) : null
    );
    const [slowModeSeconds, setSlowModeSeconds] = useState<number | null>(initialValues?.slowModeSeconds ?? null);
    const [showLockPicker, setShowLockPicker] = useState(false);
    // Visibility controls
    const [hideLikeCount, setHideLikeCount] = useState(initialValues?.hideLikeCount ?? false);
    const [followersOnly, setFollowersOnly] = useState(initialValues?.followersOnly ?? false);
    const [expiresAt, setExpiresAt] = useState<Date | null>(
        initialValues?.expiresAt ? new Date(initialValues.expiresAt) : null
    );
    const [showExpirePicker, setShowExpirePicker] = useState(false);
    const titleError = touchedTitle && !titles.en.trim() ? t.headlineRequired : null;
    const bodyError = touchedBody && !bodies.en.trim() ? t.bodyRequired : null;

    const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        autoSaveRef.current = setInterval(async () => {
            if (!titles.en.trim() || submitting) return;
            setAutoSaving(true);
            try { await handleSubmit(true, false, true); } catch {}
            finally { setAutoSaving(false); }
        }, 30000);
        return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
    }, [titles, bodies, images, submitting]);

    const requirements = [
        { key: "en-title", label: t.reqEnHeadline, met: titles.en.trim().length > 0 },
        { key: "en-body", label: t.reqEnBody, met: bodies.en.trim().length > 0 },
    ];
    const canPublish = requirements.every((r) => r.met);

    async function handleSubmit(isDraft: boolean, scheduled = false, silent = false) {
        if (!isDraft && !scheduled && !canPublish) {
            setTouchedTitle(true);
            setTouchedBody(true);
            return;
        }
        if (scheduled && (!scheduleDate || scheduleDate <= new Date())) {
            Alert.alert(t.invalidScheduleTitle, t.invalidScheduleMsg);
            return;
        }
        if (!silent) setSubmitting(true);
        try {
            // Upload any local URIs (remote URLs pass through unchanged)
            const localUris = images.filter((u) => !u.startsWith("http"));
            let uploadedImages = [...images];
            if (localUris.length > 0) {
                let done = 0;
                const uploaded = await Promise.all(
                    images.map(async (uri) => {
                        if (uri.startsWith("http")) return uri;
                        const url = await uploadImage(uri, session?.token);
                        done++;
                        setUploadProgress(t.uploadingProgress(done, localUris.length));
                        return url;
                    })
                );
                uploadedImages = uploaded;
                setUploadProgress(null);
            }
            const posterUrl = uploadedImages[0] ?? undefined;
            const locales = {
                en: { title: titles.en.trim(), body: bodies.en.trim() || undefined, posterUrl },
                ...(titles.fr.trim() ? { fr: { title: titles.fr.trim(), body: bodies.fr.trim() || undefined, posterUrl } } : {}),
            };
            const scheduleFields = scheduled ? { publishAt: scheduleDate!.toISOString() } : {};
            const commentFields = {
                commentsDisabled,
                commentsLockedAt: commentsLockDate?.toISOString() ?? null,
                slowModeSeconds: slowModeSeconds ?? null,
                hideLikeCount,
                followersOnly,
                expiresAt: expiresAt?.toISOString() ?? null,
            };
            if (postId) {
                await authApi(`/posts/${postId}`, {
                    method: "PATCH",
                    body: JSON.stringify({ isDraft: isDraft || scheduled, locales, images: uploadedImages, ...scheduleFields, ...commentFields }),
                });
            } else {
                await authApi("/posts", {
                    method: "POST",
                    body: JSON.stringify({ type: "ANNOUNCEMENT", isDraft: isDraft || scheduled, locales, images: uploadedImages, ...scheduleFields, ...commentFields }),
                });
            }
            if (silent) {
                // auto-save — no navigation, no toast
            } else if (scheduled) {
                showToast(t.scheduledFor(scheduleDate!.toLocaleDateString()));
                onSuccess?.();
            } else if (isDraft) {
                showToast(postId ? t.changesSaved : t.draftSaved);
                onBack();
            } else {
                showToast(t.published);
                onSuccess?.();
            }
        } catch (err: any) {
            if (!silent) Alert.alert(t.errorTitle, err?.message ?? t.failedToSave);
        } finally {
            if (!silent) setSubmitting(false);
        }
    }

    function onPickerChange(_: DateTimePickerEvent, selected?: Date) {
        if (Platform.OS === "android") setPickerTarget(null);
        if (!selected) return;
        setScheduleDate((prev) => {
            // iOS uses a combined date+time wheel — the selection carries both.
            if (Platform.OS === "ios") return new Date(selected);
            const base = prev ?? new Date();
            const next = new Date(base);
            if (pickerTarget === "sched-date") {
                next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
            } else {
                next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
            }
            return next;
        });
    }

    // Animated styles
    const titleBorderColor = titleField.anim.interpolate({
        inputRange: [0, 1],
        outputRange: [titleError ? "#DC2626" : IDLE_BORDER, titleError ? "#DC2626" : BURGUNDY],
    });
    const bodyBorderColor = bodyField.anim.interpolate({
        inputRange: [0, 1],
        outputRange: ["transparent", BURGUNDY],
    });
    const bodyBg = bodyField.anim.interpolate({
        inputRange: [0, 1],
        outputRange: ["#EDECEA", "#fff"],
    });

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            {/* Top bar */}
            <View style={s.topBar}>
                <Pressable onPress={onBack} style={s.backGroup} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.back}>
                    <Ionicons name="arrow-back" size={18} color={BURGUNDY} />
                    <Text style={s.topBarBrand}>{t.back}</Text>
                </Pressable>
                <View style={s.langToggle}>
                    {autoSaving && (
                        <Text style={{ fontSize: 11, color: "#9CA3AF", marginRight: 8 }}>{t.saving}</Text>
                    )}
                    {(["en", "fr"] as Lang[]).map((l) => (
                        <Pressable
                            key={l}
                            onPress={() => setLang(l)}
                            style={[s.langPill, lang === l && s.langPillActive]}
                        >
                            <Text style={[s.langPillText, lang === l && s.langPillTextActive]}>
                                {l.toUpperCase()}
                            </Text>
                        </Pressable>
                    ))}
                </View>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={s.scroll}
                keyboardShouldPersistTaps="handled"
            >
                {/* Hero */}
                <View style={s.hero}>
                    <Text style={s.heroLabel}>{t.editorialDashboard}</Text>
                    <Text style={s.heroHeading}>{t.createAnnouncementHeading}</Text>
                </View>

                {/* 1. Headline */}
                <View style={s.section}>
                    <View style={s.sectionLabelRow}>
                        <Text style={s.sectionLabel}>{`1. ${t.sectionHeadline}`}</Text>
                        <Text style={[s.charCount, remaining < 20 && s.charCountWarn]}>
                            {titles[lang].length}/{MAX_TITLE}
                        </Text>
                    </View>
                    <Animated.View style={[s.titleWrap, { borderColor: titleBorderColor }]}>
                        <TextInput
                            value={titles[lang]}
                            onChangeText={(v) => setTitles((prev) => ({ ...prev, [lang]: v.slice(0, MAX_TITLE) }))}
                            placeholder={lang === "en" ? "WHAT'S THE ANNOUNCEMENT?" : "QUELLE EST L'ANNONCE?"}
                            placeholderTextColor="#D4CFC8"
                            style={s.titleInput}
                            multiline
                            textAlignVertical="top"
                            onFocus={titleField.focus}
                            onBlur={() => { titleField.blur(); if (lang === "en") setTouchedTitle(true); }}
                        />
                        <View style={s.titleCorner} />
                    </Animated.View>
                    {titleError && <Text style={s.fieldError}>{titleError}</Text>}
                </View>

                {/* 2. Body */}
                <View style={s.section}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <Text style={s.sectionLabel}>{`2. ${t.sectionBodyContent}`}</Text>
                        <Text style={{ fontSize: 11, color: bodies[lang].length > MAX_BODY * 0.9 ? "#8C0327" : "#9CA3AF" }}>
                            {bodies[lang].length}/{MAX_BODY}
                        </Text>
                    </View>
                    <Animated.View style={[s.bodyWrap, { backgroundColor: bodyBg, borderColor: bodyBorderColor }]}>
                        <TextInput
                            value={bodies[lang]}
                            onChangeText={(v) => setBodies((prev) => ({ ...prev, [lang]: v.slice(0, MAX_BODY) }))}
                            placeholder={lang === "en"
                                ? "Write the full announcement here. Be clear and concise — this will reach the entire campus."
                                : "Rédigez l'annonce complète ici. Soyez clair et concis — cela atteindra tout le campus."}
                            placeholderTextColor="#B0A99F"
                            style={s.bodyInput}
                            multiline
                            textAlignVertical="top"
                            onFocus={bodyField.focus}
                            onBlur={bodyField.blur}
                        />
                    </Animated.View>
                    {bodyError && <Text style={s.fieldError}>{bodyError}</Text>}
                </View>

                {/* 3. Visual Asset */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{`3. ${t.sectionVisualAsset}`}</Text>
                    <Text style={s.visualSub}>{t.photoTapToCover}</Text>
                    <MultiImagePicker images={images} onChange={setImages} />
                </View>

                {/* Schedule */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{`4. ${t.schedulePublishSection}`}</Text>
                    <View style={[s.schedRow, { backgroundColor: scheduleDate ? "#FEF3C7" : "#EDECEA" }]}>
                        <Ionicons name="time-outline" size={14} color="#9CA3AF" />
                        <Pressable onPress={() => setPickerTarget("sched-date")} style={{ flex: 1 }}>
                            <Text style={[s.schedText, !scheduleDate && s.schedPlaceholder]}>
                                {scheduleDate
                                    ? scheduleDate.toLocaleDateString(localeFor(lang), { month: "short", day: "numeric", year: "numeric" }).toUpperCase()
                                    : t.optionalTapToSet}
                            </Text>
                        </Pressable>
                        {scheduleDate && (
                            <Pressable onPress={() => setPickerTarget("sched-time")}>
                                <Text style={[s.schedText, { color: BURGUNDY }]}>
                                    {scheduleDate.toLocaleTimeString(localeFor(lang), { hour: "numeric", minute: "2-digit" })}
                                </Text>
                            </Pressable>
                        )}
                        {scheduleDate && (
                            <Pressable onPress={() => setScheduleDate(null)} style={{ marginLeft: 6 }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear schedule date">
                                <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                            </Pressable>
                        )}
                    </View>

                    {Platform.OS === "android" && pickerTarget !== null && (
                        <DateTimePicker
                            value={scheduleDate ?? new Date()}
                            mode={pickerTarget === "sched-date" ? "date" : "time"}
                            minimumDate={new Date()}
                            onChange={onPickerChange}
                        />
                    )}
                    {Platform.OS === "ios" && (
                        <BottomSheet visible={pickerTarget !== null} onClose={() => setPickerTarget(null)}>
                            <View style={s.pickerSheet}>
                                <View style={s.pickerSheetHeader}>
                                    <Text style={s.pickerSheetTitle}>{pickerTarget === "sched-date" ? t.publishDate : t.publishTime}</Text>
                                    <Pressable onPress={() => setPickerTarget(null)} style={s.pickerDoneBtn}>
                                        <Text style={s.pickerDoneText}>{t.done}</Text>
                                    </Pressable>
                                </View>
                                <DateTimePicker
                                    value={scheduleDate ?? new Date()}
                                    mode="datetime"
                                    minimumDate={new Date()}
                                    display="spinner"
                                    onChange={onPickerChange}
                                    style={{ width: "100%", backgroundColor: "#FFFFFF" }} themeVariant="light" textColor="#111827"
                                />
                            </View>
                        </BottomSheet>
                    )}
                </View>

                {/* Post Settings */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{t.postSettingsSection}</Text>
                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.hideLikeCountLabel}</Text>
                            <Text style={cs.rowSub}>{t.hideLikeCountSub}</Text>
                        </View>
                        <Pressable style={[cs.toggle, hideLikeCount && cs.toggleOn]} onPress={() => setHideLikeCount((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: hideLikeCount }} accessibilityLabel={t.hideLikeCountLabel}>
                            <View style={[cs.toggleThumb, hideLikeCount && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>
                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.followersOnlyLabel}</Text>
                            <Text style={cs.rowSub}>{t.followersOnlySub}</Text>
                        </View>
                        <Pressable style={[cs.toggle, followersOnly && cs.toggleOn]} onPress={() => setFollowersOnly((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: followersOnly }} accessibilityLabel={t.followersOnlyLabel}>
                            <View style={[cs.toggleThumb, followersOnly && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>
                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.expiryDateLabel}</Text>
                            <Text style={cs.rowSub}>{t.expiryDateSub}</Text>
                        </View>
                        <Pressable style={cs.dateBtn} onPress={() => setShowExpirePicker(true)}>
                            <Text style={cs.dateBtnText}>
                                {expiresAt
                                    ? expiresAt.toLocaleDateString(localeFor(lang), { month: "short", day: "numeric", year: "numeric" }).toUpperCase()
                                    : t.noneLabel}
                            </Text>
                            {expiresAt && (
                                <Pressable onPress={() => setExpiresAt(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear expiry date">
                                    <Ionicons name="close-circle" size={14} color="#9CA3AF" />
                                </Pressable>
                            )}
                        </Pressable>
                    </View>
                </View>

                {/* Comment Settings */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{t.commentSettingsSection}</Text>
                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.disableCommentsLabel}</Text>
                            <Text style={cs.rowSub}>{t.disableCommentsSub}</Text>
                        </View>
                        <Pressable style={[cs.toggle, commentsDisabled && cs.toggleOn]} onPress={() => setCommentsDisabled((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: commentsDisabled }} accessibilityLabel={t.disableCommentsLabel}>
                            <View style={[cs.toggleThumb, commentsDisabled && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>
                    {!commentsDisabled && (
                        <>
                            <View style={cs.row}>
                                <View style={cs.rowLeft}>
                                    <Text style={cs.rowTitle}>{t.autoLockDateLabel}</Text>
                                    <Text style={cs.rowSub}>{t.autoLockDateSub}</Text>
                                </View>
                                <Pressable style={cs.dateBtn} onPress={() => setShowLockPicker(true)}>
                                    <Text style={cs.dateBtnText}>
                                        {commentsLockDate
                                            ? commentsLockDate.toLocaleDateString(localeFor(lang), { month: "short", day: "numeric", year: "numeric" }).toUpperCase()
                                            : t.noneLabel}
                                    </Text>
                                    {commentsLockDate && (
                                        <Pressable onPress={() => setCommentsLockDate(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear auto-lock date">
                                            <Ionicons name="close-circle" size={14} color="#9CA3AF" />
                                        </Pressable>
                                    )}
                                </Pressable>
                            </View>
                            <View style={cs.row}>
                                <View style={cs.rowLeft}>
                                    <Text style={cs.rowTitle}>{t.slowModeLabel}</Text>
                                    <Text style={cs.rowSub}>{t.slowModeSub}</Text>
                                </View>
                                <View style={cs.slowPills}>
                                    {([null, 30, 300, 900, 3600] as (number | null)[]).map((val) => (
                                        <Pressable
                                            key={String(val)}
                                            style={[cs.slowPill, slowModeSeconds === val && cs.slowPillActive]}
                                            onPress={() => setSlowModeSeconds(val)}
                                        >
                                            <Text style={[cs.slowPillText, slowModeSeconds === val && cs.slowPillTextActive]}>
                                                {val === null ? "OFF" : val < 60 ? `${val}s` : val < 3600 ? `${val / 60}m` : "1h"}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                            </View>
                        </>
                    )}
                </View>

                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Expiry date picker modal */}
            <BottomSheet visible={showExpirePicker} onClose={() => setShowExpirePicker(false)}>
                <View style={s.pickerSheet}>
                    <View style={s.pickerSheetHeader}>
                        <Text style={s.pickerSheetTitle}>{t.expiryDateLabel}</Text>
                        <Pressable onPress={() => setShowExpirePicker(false)} style={s.pickerDoneBtn}>
                            <Text style={s.pickerDoneText}>{t.done}</Text>
                        </Pressable>
                    </View>
                    <DateTimePicker
                        value={expiresAt ?? new Date()}
                        mode="date"
                        minimumDate={new Date()}
                        display="spinner"
                        onChange={(_, d) => { if (d) setExpiresAt(d); }}
                        style={{ width: "100%", backgroundColor: "#FFFFFF" }} themeVariant="light" textColor="#111827"
                    />
                </View>
            </BottomSheet>

            {/* Auto-lock date picker modal */}
            <BottomSheet visible={showLockPicker} onClose={() => setShowLockPicker(false)}>
                <View style={s.pickerSheet}>
                    <View style={s.pickerSheetHeader}>
                        <Text style={s.pickerSheetTitle}>{t.autoLockDateLabel}</Text>
                        <Pressable onPress={() => setShowLockPicker(false)} style={s.pickerDoneBtn}>
                            <Text style={s.pickerDoneText}>{t.done}</Text>
                        </Pressable>
                    </View>
                    <DateTimePicker
                        value={commentsLockDate ?? new Date()}
                        mode="date"
                        minimumDate={new Date()}
                        display="spinner"
                        onChange={(_, d) => { if (d) setCommentsLockDate(d); }}
                        style={{ width: "100%", backgroundColor: "#FFFFFF" }} themeVariant="light" textColor="#111827"
                    />
                </View>
            </BottomSheet>

            {/* Fixed bottom bar */}
            <View style={s.bottomBar}>
                <View style={s.reqList}>
                    {requirements.map((r) => (
                        <View key={r.key} style={s.reqItem}>
                            <Ionicons
                                name={r.met ? "checkmark-circle" : "ellipse-outline"}
                                size={11}
                                color={r.met ? BURGUNDY : "#C4BFB8"}
                            />
                            <Text style={[s.reqText, r.met && s.reqTextMet]}>{r.label}</Text>
                        </View>
                    ))}
                </View>
                <View style={s.bottomBtns}>
                    <Pressable style={s.btnDraft} onPress={() => handleSubmit(true)} disabled={submitting}>
                        <Text style={s.btnDraftText}>{t.saveDraftBtn}</Text>
                    </Pressable>
                    {scheduleDate ? (
                        <Pressable
                            style={[s.btnPublish, { backgroundColor: "#92400E" }, submitting && s.btnPublishDisabled]}
                            onPress={() => handleSubmit(false, true)}
                            disabled={submitting}
                        >
                            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPublishText}>{t.schedule}</Text>}
                        </Pressable>
                    ) : (
                        <Pressable
                            style={[s.btnPublish, (!canPublish || submitting) && s.btnPublishDisabled]}
                            onPress={() => handleSubmit(false)}
                            disabled={!canPublish || submitting}
                        >
                            {submitting ? (
                                uploadProgress
                                    ? <Text style={s.btnPublishText} numberOfLines={1}>{uploadProgress}</Text>
                                    : <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={s.btnPublishText}>{postId ? t.updateAnnouncementBtn : t.publishAnnouncementBtn}</Text>
                            )}
                        </Pressable>
                    )}
                </View>
            </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    safe: { flex: 1, backgroundColor: "#F7F3EE" },

    // Top bar
    topBar: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    backGroup: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flex: 1,
    },
    topBarBrand: {
        fontSize: 14,
        fontWeight: "900",
        color: BURGUNDY,
        letterSpacing: 2,
    },
    langToggle: {
        flexDirection: "row",
        borderWidth: 1,
        borderColor: "#D1CBC3",
        overflow: "hidden",
    },
    langPill: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        backgroundColor: "transparent",
    },
    langPillActive: { backgroundColor: BURGUNDY },
    langPillText: {
        fontSize: 11,
        fontWeight: "700",
        color: "#9CA3AF",
        letterSpacing: 1,
    },
    langPillTextActive: { color: "#fff" },

    scroll: { paddingHorizontal: 20 },

    // Hero
    hero: { paddingTop: 8, paddingBottom: 28 },
    heroLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: BURGUNDY,
        letterSpacing: 2,
        marginBottom: 8,
    },
    heroHeading: {
        fontSize: 38,
        fontWeight: "900",
        color: "#111827",
        letterSpacing: -1,
        lineHeight: 42,
    },

    // Sections
    section: { marginBottom: 32 },
    sectionLabelRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: BURGUNDY,
        letterSpacing: 1.5,
        marginBottom: 14,
    },
    charCount: {
        fontSize: 10,
        fontWeight: "700",
        color: "#9CA3AF",
        letterSpacing: 0.5,
        marginBottom: 14,
    },
    charCountWarn: { color: BURGUNDY },
    fieldError: {
        fontSize: 11,
        color: "#DC2626",
        marginTop: 4,
        fontWeight: "600",
        letterSpacing: 0.3,
    },

    // Title input
    titleWrap: {
        borderWidth: 1.5,
        backgroundColor: "#fff",
        minHeight: 100,
    },
    titleInput: {
        fontSize: 22,
        fontWeight: "800",
        color: "#000",
        letterSpacing: -0.3,
        lineHeight: 30,
        padding: 14,
        paddingBottom: 28,
        minHeight: 100,
    },
    titleCorner: {
        position: "absolute",
        bottom: 0,
        right: 0,
        width: 22,
        height: 22,
        backgroundColor: BURGUNDY,
    },

    // Body input
    bodyWrap: {
        borderWidth: 1.5,
        minHeight: 160,
    },
    bodyInput: {
        fontSize: 14,
        color: "#374151",
        lineHeight: 22,
        padding: 14,
        minHeight: 160,
    },

    visualSub: {
        fontSize: 10,
        color: "#9CA3AF",
        letterSpacing: 0.3,
        marginBottom: 10,
    },

    // Schedule row
    schedRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    schedText: {
        fontSize: 13,
        fontWeight: "600",
        color: "#111827",
    },
    schedPlaceholder: {
        color: "#C4BFB8",
        fontWeight: "400",
    },
    pickerOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.35)",
    },
    pickerSheet: {
        backgroundColor: "#FFFFFF",
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "#D1CBC3",
        paddingBottom: 34,
    },
    pickerSheetHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#E5E0D8",
    },
    pickerSheetTitle: {
        fontSize: 10,
        fontWeight: "800",
        color: BURGUNDY,
        letterSpacing: 1.5,
    },
    pickerDoneBtn: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        backgroundColor: BURGUNDY,
    },
    pickerDoneText: {
        fontSize: 11,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 1,
    },

    // Bottom bar
    bottomBar: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: "#F7F3EE",
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "#D1CBC3",
        paddingBottom: 30,
        paddingTop: 10,
        paddingHorizontal: 20,
        gap: 10,
    },
    reqList: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        paddingBottom: 6,
    },
    reqItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    reqText: {
        fontSize: 9,
        fontWeight: "700",
        color: "#C4BFB8",
        letterSpacing: 0.8,
    },
    reqTextMet: { color: BURGUNDY },
    bottomBtns: {
        flexDirection: "row",
        gap: 10,
    },
    btnDraft: {
        flex: 1,
        paddingVertical: 14,
        backgroundColor: "#E5E0D8",
        alignItems: "center",
        justifyContent: "center",
    },
    btnDraftText: {
        fontSize: 11,
        fontWeight: "800",
        color: "#374151",
        letterSpacing: 1,
        textAlign: "center",
        lineHeight: 16,
    },
    btnPublish: {
        flex: 1,
        paddingVertical: 14,
        backgroundColor: BURGUNDY,
        alignItems: "center",
        justifyContent: "center",
    },
    btnPublishText: {
        fontSize: 11,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 1,
        textAlign: "center",
        lineHeight: 16,
    },
    btnPublishDisabled: {
        backgroundColor: "#C4BFB8",
    },
});
