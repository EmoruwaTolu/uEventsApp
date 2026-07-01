import React, { useRef, useState, useEffect } from "react";
import {
    Animated,
    View,
    Text,
    TextInput,
    Pressable,
    ScrollView,
    Switch,
    StyleSheet,
    ActivityIndicator,
    Platform,
    Alert,
    KeyboardAvoidingView,
} from "react-native";
import BottomSheet from "../BottomSheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import MultiImagePicker from "./MultiImagePicker";
import type { PollDraftValues } from "../../lib/draftsStore";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../auth/AuthContext";
import { uploadImage } from "../../lib/uploadImage";
import { useToast } from "../../lib/ToastContext";
import { cs } from "./CreateEventForm";
import { useT } from "../../lib/LangContext";

type Lang = "en" | "fr";
type Duration = "24H" | "3D" | "7D";

type PollOption = { id: string; text: string };

type Props = {
    onBack: () => void;
    onSuccess?: () => void;
    initialValues?: PollDraftValues;
    postId?: string;
};

function durationToExpiry(d: Duration): string {
    const ms = d === "24H" ? 864e5 : d === "3D" ? 2592e5 : 6048e5;
    return new Date(Date.now() + ms).toISOString();
}

const MAX_QUESTION = 140;
const BURGUNDY = "#8C0327";
const IDLE_BORDER = "#D4CFC8";
const IDLE_DESC_BG = "#EDECEA";
const IDLE_OPTION_BORDER = "#E5E0D8";
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

export default function CreatePollForm({ onBack, onSuccess, initialValues, postId }: Props) {
    const authApi = useApi();
    const { session } = useAuth();
    const { showToast } = useToast();
    const [submitting, setSubmitting] = useState(false);
    const [lang, setLang] = useState<Lang>(initialValues?.lang ?? "en");
    const [questions, setQuestions] = useState<Record<Lang, string>>({
        en: initialValues?.question ?? "",
        fr: initialValues?.questionFr ?? "",
    });
    const [descriptions, setDescriptions] = useState<Record<Lang, string>>({
        en: initialValues?.description ?? "",
        fr: initialValues?.descriptionFr ?? "",
    });
    const [options, setOptions] = useState<PollOption[]>(
        initialValues?.options ?? [
            { id: "1", text: "" },
            { id: "2", text: "" },
            { id: "3", text: "" },
        ]
    );
    const [images, setImages] = useState<string[]>(initialValues?.images ?? (initialValues?.coverUri ? [initialValues.coverUri] : []));
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [duration, setDuration] = useState<Duration>(initialValues?.duration ?? "24H");
    const [anonymous, setAnonymous] = useState(initialValues?.anonymous ?? true);
    const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
    const [pickerTarget, setPickerTarget] = useState<"sched-date" | "sched-time" | null>(null);

    // Per-field focus animations
    const questionField = useFieldAnim();
    const descField = useFieldAnim();
    // Map of option id → Animated.Value
    const optionAnims = useRef<Record<string, ReturnType<typeof useFieldAnim>>>({});

    function getOptionAnim(id: string) {
        if (!optionAnims.current[id]) {
            const anim = new Animated.Value(0);
            optionAnims.current[id] = {
                anim,
                focus: () => Animated.timing(anim, { toValue: 1, duration: ANIM_DURATION, useNativeDriver: false }).start(),
                blur: () => Animated.timing(anim, { toValue: 0, duration: ANIM_DURATION, useNativeDriver: false }).start(),
            };
        }
        return optionAnims.current[id];
    }

    const t = useT();
    const remaining = MAX_QUESTION - questions[lang].length;
    const [autoSaving, setAutoSaving] = useState(false);
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

    const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        autoSaveRef.current = setInterval(async () => {
            if (!questions.en.trim() || submitting) return;
            setAutoSaving(true);
            try { await handleSubmit(true, false, true); } catch {}
            finally { setAutoSaving(false); }
        }, 30000);
        return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
    }, [questions, descriptions, options, images, duration, submitting]);

    const filledOptions = options.filter((o) => o.text.trim());
    const requirements = [
        { key: "en-q", label: t.reqEnQuestion, met: questions.en.trim().length > 0 },
        { key: "en-description", label: t.reqEnDescription, met: descriptions.en.trim().length > 0 },
        { key: "options", label: t.reqOptions, met: filledOptions.length >= 2 },
    ];
    const canPublish = requirements.every((r) => r.met);

    const [touchedQuestion, setTouchedQuestion] = useState(false);
    const [touchedDescription, setTouchedDescription] = useState(false);
    const [touchedOptions, setTouchedOptions] = useState(false);
    const questionError = touchedQuestion && !questions.en.trim() ? t.questionRequired : null;
    const descriptionError = touchedDescription && !descriptions.en.trim() ? t.descriptionRequired : null;
    const optionsError = touchedOptions && filledOptions.length < 2 ? t.optionsRequired : null;

    async function handleSubmit(isDraft: boolean, scheduled = false, silent = false) {
        if (!isDraft && !scheduled && !canPublish) {
            setTouchedQuestion(true);
            setTouchedDescription(true);
            setTouchedOptions(true);
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
                en: { title: questions.en.trim(), body: descriptions.en.trim() || undefined, posterUrl },
                ...(questions.fr.trim() ? { fr: { title: questions.fr.trim(), body: descriptions.fr.trim() || undefined, posterUrl } } : {}),
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
                    body: JSON.stringify({
                        isDraft: isDraft || scheduled,
                        locales,
                        images: uploadedImages,
                        pollExpiresAt: durationToExpiry(duration),
                        pollAllowMultiple: false,
                        pollAnonymous: anonymous,
                        ...scheduleFields,
                        ...commentFields,
                    }),
                });
            } else {
                await authApi("/posts", {
                    method: "POST",
                    body: JSON.stringify({
                        type: "POLL",
                        isDraft: isDraft || scheduled,
                        locales,
                        images: uploadedImages,
                        pollExpiresAt: durationToExpiry(duration),
                        pollAllowMultiple: false,
                        pollAnonymous: anonymous,
                        pollOptions: filledOptions.map((o) => ({ textEn: o.text.trim() })),
                        ...scheduleFields,
                        ...commentFields,
                    }),
                });
            }
            if (silent) {
                // auto-save — no navigation, no toast
            } else if (scheduled) {
                showToast(t.scheduledFor(scheduleDate!.toLocaleDateString()));
                onSuccess?.();
            } else if (isDraft) {
                showToast(t.draftSaved);
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

    function addOption() {
        if (options.length >= 6) return;
        setOptions((prev) => [...prev, { id: String(Date.now()), text: "" }]);
    }

    function updateOption(id: string, text: string) {
        setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
    }

    function removeOption(id: string) {
        if (options.length <= 2) return;
        delete optionAnims.current[id];
        setOptions((prev) => prev.filter((o) => o.id !== id));
    }

    const DURATIONS: { key: Duration; label: string }[] = [
        { key: "24H", label: t.pollDur24h },
        { key: "3D", label: t.pollDur3d },
        { key: "7D", label: t.pollDur7d },
    ];

    // Derived animated styles
    const questionBorderColor = questionField.anim.interpolate({
        inputRange: [0, 1],
        outputRange: [questionError ? "#DC2626" : IDLE_BORDER, questionError ? "#DC2626" : BURGUNDY],
    });
    const descBorderColor = descField.anim.interpolate({
        inputRange: [0, 1],
        outputRange: ["transparent", BURGUNDY],
    });
    const descBg = descField.anim.interpolate({
        inputRange: [0, 1],
        outputRange: [IDLE_DESC_BG, "#fff"],
    });

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            {/* Top bar */}
            <View style={s.topBar}>
                <Pressable onPress={onBack} style={s.backGroup}>
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
                    <Text style={s.heroHeading}>{t.createPollHeading}</Text>
                </View>

                {/* 1. Headline Question */}
                <View style={s.section}>
                    <View style={s.sectionLabelRow}>
                        <Text style={s.sectionLabel}>{`1. ${t.sectionPollQuestion}`}</Text>
                        <Text style={[s.charCount, remaining < 20 && s.charCountWarn]}>
                            {questions[lang].length}/{MAX_QUESTION}
                        </Text>
                    </View>
                    <Animated.View style={[s.questionWrap, { borderColor: questionBorderColor }]}>
                        <TextInput
                            value={questions[lang]}
                            onChangeText={(v) => setQuestions((prev) => ({ ...prev, [lang]: v.slice(0, MAX_QUESTION) }))}
                            placeholder={lang === "en" ? "WHAT DOES CAMPUS THINK?" : "QUE PENSE LE CAMPUS?"}
                            placeholderTextColor="#D4CFC8"
                            style={s.questionInput}
                            multiline
                            textAlignVertical="top"
                            onFocus={questionField.focus}
                            onBlur={() => { questionField.blur(); if (lang === "en") setTouchedQuestion(true); }}
                        />
                        <View style={s.questionCorner} />
                    </Animated.View>
                    {questionError && <Text style={s.fieldError}>{questionError}</Text>}
                </View>

                {/* 2. Poll Description */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{`2. ${t.sectionPollDescription}`}</Text>
                    <Animated.View style={[s.descWrap, { backgroundColor: descBg, borderColor: descBorderColor }]}>
                        <TextInput
                            value={descriptions[lang]}
                            onChangeText={(v) => setDescriptions((prev) => ({ ...prev, [lang]: v }))}
                            placeholder={lang === "en"
                                ? "Provide optional context or background for this poll..."
                                : "Fournir un contexte optionnel pour ce sondage..."}
                            placeholderTextColor="#B0A99F"
                            style={s.descInput}
                            multiline
                            textAlignVertical="top"
                            onFocus={descField.focus}
                            onBlur={descField.blur}
                        />
                    </Animated.View>
                    {descriptionError && <Text style={s.fieldError}>{descriptionError}</Text>}
                </View>

                {/* 3. Poll Options */}
                <View style={s.section}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <Text style={s.sectionLabel}>{`3. ${t.sectionPollOptions}`}</Text>
                        <Text style={{ fontSize: 11, color: options.length >= 6 ? "#8C0327" : "#9CA3AF" }}>
                            {options.length} of 6
                        </Text>
                    </View>
                    <View style={s.optionsList}>
                        {options.map((opt, idx) => {
                            const fa = getOptionAnim(opt.id);
                            const borderColor = fa.anim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [IDLE_OPTION_BORDER, BURGUNDY],
                            });
                            const numColor = fa.anim.interpolate({
                                inputRange: [0, 1],
                                outputRange: ["#C4BFB8", BURGUNDY],
                            });
                            return (
                                <Animated.View key={opt.id} style={[s.optionRow, { borderBottomColor: borderColor }]}>
                                    <Animated.Text style={[s.optionNumber, { color: numColor }]}>
                                        {String(idx + 1).padStart(2, "0")}
                                    </Animated.Text>
                                    <TextInput
                                        value={opt.text}
                                        onChangeText={(v) => updateOption(opt.id, v)}
                                        placeholder={lang === "en" ? "CHOICE" : "CHOIX"}
                                        placeholderTextColor="#C4BFB8"
                                        style={s.optionInput}
                                        onFocus={fa.focus}
                                        onBlur={() => { fa.blur(); setTouchedOptions(true); }}
                                    />
                                    {options.length > 2 && (
                                        <Pressable onPress={() => removeOption(opt.id)} style={s.removeBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove option">
                                            <Ionicons name="close" size={14} color="#9CA3AF" />
                                        </Pressable>
                                    )}
                                </Animated.View>
                            );
                        })}
                    </View>
                    {options.length < 6 && (
                        <Pressable style={s.addChoiceBtn} onPress={addOption}>
                            <Text style={s.addChoiceText}>{t.addChoiceBtn}</Text>
                        </Pressable>
                    )}
                    {optionsError && <Text style={s.fieldError}>{optionsError}</Text>}
                </View>

                {/* 4. Visual Asset */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{`4. ${t.sectionVisualAsset}`}</Text>
                    <Text style={s.visualSub}>{t.photoTapToCover}</Text>
                    <MultiImagePicker images={images} onChange={setImages} />
                </View>

                {/* 5. Poll Configuration */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{`5. ${t.sectionPollConfig}`}</Text>
                    <View style={s.configCard}>
                        {/* Duration */}
                        <View style={s.configRow}>
                            <Text style={s.configLabel}>{t.pollDurationLabel}</Text>
                            <View style={s.durationPills}>
                                {DURATIONS.map(({ key, label }) => (
                                    <Pressable
                                        key={key}
                                        onPress={() => setDuration(key)}
                                        style={[s.durationPill, duration === key && s.durationPillActive]}
                                    >
                                        <Text style={[s.durationPillText, duration === key && s.durationPillTextActive]}>
                                            {label}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>

                        <View style={s.configDivider} />

                        {/* Anonymous Voting */}
                        <View style={s.configRow}>
                            <Text style={s.configLabel}>{t.pollAnonymousVoting}</Text>
                            <Switch
                                value={anonymous}
                                onValueChange={setAnonymous}
                                trackColor={{ false: "#4B5563", true: BURGUNDY }}
                                thumbColor="#fff"
                            />
                        </View>
                    </View>
                </View>

                {/* Schedule */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{`6. ${t.schedulePublishSection}`}</Text>
                    <View style={[s.schedRow, { backgroundColor: scheduleDate ? "#FEF3C7" : "#EDECEA" }]}>
                        <Ionicons name="time-outline" size={14} color="#9CA3AF" />
                        <Pressable onPress={() => setPickerTarget("sched-date")} style={{ flex: 1 }}>
                            <Text style={[s.schedText, !scheduleDate && s.schedPlaceholder]}>
                                {scheduleDate
                                    ? scheduleDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()
                                    : t.optionalTapToSet}
                            </Text>
                        </Pressable>
                        {scheduleDate && (
                            <Pressable onPress={() => setPickerTarget("sched-time")}>
                                <Text style={[s.schedText, { color: BURGUNDY }]}>
                                    {scheduleDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
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
                        <Pressable style={[cs.toggle, hideLikeCount && cs.toggleOn]} onPress={() => setHideLikeCount((v) => !v)}>
                            <View style={[cs.toggleThumb, hideLikeCount && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>
                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.followersOnlyLabel}</Text>
                            <Text style={cs.rowSub}>{t.followersOnlySub}</Text>
                        </View>
                        <Pressable style={[cs.toggle, followersOnly && cs.toggleOn]} onPress={() => setFollowersOnly((v) => !v)}>
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
                                    ? expiresAt.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()
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
                        <Pressable style={[cs.toggle, commentsDisabled && cs.toggleOn]} onPress={() => setCommentsDisabled((v) => !v)}>
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
                                            ? commentsLockDate.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()
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
                                <Text style={s.btnPublishText}>{postId ? t.updatePollBtn : t.publishPollBtn}</Text>
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

    // Question
    questionWrap: {
        borderWidth: 1.5,
        backgroundColor: "#fff",
        minHeight: 110,
    },
    questionInput: {
        fontSize: 22,
        fontWeight: "800",
        color: "#000",
        letterSpacing: -0.3,
        lineHeight: 30,
        padding: 14,
        paddingBottom: 28,
        minHeight: 110,
    },
    questionCorner: {
        position: "absolute",
        bottom: 0,
        right: 0,
        width: 22,
        height: 22,
        backgroundColor: BURGUNDY,
    },

    // Description
    descWrap: {
        borderWidth: 1.5,
        minHeight: 90,
    },
    descInput: {
        fontSize: 14,
        color: "#374151",
        lineHeight: 22,
        padding: 14,
        minHeight: 90,
    },

    // Options
    optionsList: { gap: 0 },
    optionRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 13,
        borderBottomWidth: 1.5,
    },
    optionNumber: {
        fontSize: 13,
        fontWeight: "800",
        letterSpacing: 0.5,
        width: 24,
        lineHeight: 20,
        includeFontPadding: false,
    } as any,
    optionInput: {
        flex: 1,
        fontSize: 14,
        fontWeight: "600",
        color: "#111827",
        letterSpacing: 0.3,
        height: 20,
        padding: 0,
        margin: 0,
        includeFontPadding: false,
        textAlignVertical: "center",
    } as any,
    removeBtn: {
        width: 24,
        height: 24,
        alignItems: "center",
        justifyContent: "center",
    },
    addChoiceBtn: {
        marginTop: 14,
        borderWidth: 1.5,
        borderColor: BURGUNDY,
        borderStyle: "dashed",
        paddingVertical: 12,
        alignItems: "center",
    },
    addChoiceText: {
        fontSize: 11,
        fontWeight: "800",
        color: BURGUNDY,
        letterSpacing: 1.5,
    },

    visualSub: {
        fontSize: 10,
        color: "#9CA3AF",
        letterSpacing: 0.3,
        marginBottom: 10,
    },

    // Config card
    configCard: {
        backgroundColor: "#1F2937",
        overflow: "hidden",
    },
    configRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    configLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: "rgba(255,255,255,0.55)",
        letterSpacing: 1.5,
    },
    configDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: "rgba(255,255,255,0.1)",
        marginHorizontal: 16,
    },
    durationPills: {
        flexDirection: "row",
        gap: 4,
    },
    durationPill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: "rgba(255,255,255,0.1)",
    },
    durationPillActive: { backgroundColor: BURGUNDY },
    durationPillText: {
        fontSize: 10,
        fontWeight: "700",
        color: "rgba(255,255,255,0.5)",
        letterSpacing: 0.8,
    },
    durationPillTextActive: { color: "#fff" },
    visibilityBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "rgba(255,255,255,0.08)",
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    visibilityText: {
        fontSize: 12,
        fontWeight: "600",
        color: "#fff",
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
    draftStatus: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        justifyContent: "center",
    },
    draftDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: BURGUNDY,
    },
    draftStatusText: {
        fontSize: 9,
        fontWeight: "700",
        color: "#9CA3AF",
        letterSpacing: 1.5,
    },
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

    // Picker modal (iOS)
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

    // Requirements checklist
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
    reqTextMet: {
        color: BURGUNDY,
    },
});
