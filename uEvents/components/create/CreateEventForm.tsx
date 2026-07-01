import React, { useState, useEffect, useRef } from "react";
import {
    View,
    Text,
    TextInput,
    Pressable,
    ScrollView,
    KeyboardAvoidingView,
    StyleSheet,
    ActivityIndicator,
    Alert,
    Platform,
} from "react-native";
import BottomSheet from "../BottomSheet";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import MultiImagePicker from "./MultiImagePicker";
import type { EventDraftValues } from "../../lib/draftsStore";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../auth/AuthContext";
import { uploadImage } from "../../lib/uploadImage";
import { useToast } from "../../lib/ToastContext";
import { EVENT_TAGS } from "../../lib/eventTags";
import { useT } from "../../lib/LangContext";

type Lang = "en" | "fr";

type LocaleContent = {
    title?: string;
    description?: string;
    posterUri?: string;
    posterUrl?: string;
    isPublished: boolean;
};

type EventCore = {
    startAt?: string;
    endAt?: string;
    locationName?: string;
    address?: string;
    categories?: string[];
};

type Props = {
    onBack: () => void;
    onSuccess?: () => void;
    initialValues?: EventDraftValues;
    postId?: string;
    seriesId?: string | null;
};

/** "04/15/2026" + "10:00 AM" → ISO string, or undefined if empty */
function parseDatetime(date: string, time: string): string | undefined {
    if (!date.trim() && !time.trim()) return undefined;
    try {
        const [m, d, y] = date.split("/").map(Number);
        const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        let h = 0, min = 0;
        if (match) {
            h = parseInt(match[1]);
            min = parseInt(match[2]);
            if (match[3].toUpperCase() === "PM" && h < 12) h += 12;
            if (match[3].toUpperCase() === "AM" && h === 12) h = 0;
        }
        return new Date(y, m - 1, d, h, min).toISOString();
    } catch {
        return undefined;
    }
}

const SECTION_LABEL = (n: number, text: string) => `${n}. ${text}`;


function parseInitialDate(date?: string, time?: string): Date | null {
    if (!date) return null;
    const dt = parseDatetime(date, time ?? "12:00 PM");
    return dt ? new Date(dt) : null;
}

function fmtDate(d: Date): string {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}

function fmtTime(d: Date): string {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function CreateEventForm({ onBack, onSuccess, initialValues, postId, seriesId }: Props) {
    const authApi = useApi();
    const { session } = useAuth();
    const { showToast } = useToast();
    const [lang, setLang] = useState<Lang>(initialValues?.lang ?? "en");
    const [titles, setTitles] = useState<Record<Lang, string>>({
        en: initialValues?.title ?? "",
        fr: initialValues?.titleFr ?? "",
    });
    const [descriptions, setDescriptions] = useState<Record<Lang, string>>({
        en: initialValues?.description ?? "",
        fr: initialValues?.descriptionFr ?? "",
    });
    const [images, setImages] = useState<string[]>(initialValues?.images ?? (initialValues?.posterUri ? [initialValues.posterUri] : []));
    const [uploadProgress, setUploadProgress] = useState<string | null>(null);
    const [startDate, setStartDate] = useState<Date | null>(
        parseInitialDate(initialValues?.eventDate, initialValues?.startTime)
    );
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
    const [pickerTarget, setPickerTarget] = useState<"start-date" | "start-time" | "end-date" | "end-time" | "sched-date" | "sched-time" | null>(null);
    const [venue, setVenue] = useState(initialValues?.venue ?? "");
    const [capacity, setCapacity] = useState(initialValues?.capacity ? String(initialValues.capacity) : "");
    const [freeFood, setFreeFood] = useState(initialValues?.freeFood ?? false);
    const [recapPrivate, setRecapPrivate] = useState(initialValues?.recapPrivate ?? false);
    const [selectedTags, setSelectedTags] = useState<string[]>(initialValues?.categories ?? []);
    const [submitting, setSubmitting] = useState(false);
    const [autoSaving, setAutoSaving] = useState(false);
    const [touched, setTouched] = useState<Record<string, boolean>>({});
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
    // Event-specific controls
    const [hideRsvpCount, setHideRsvpCount] = useState(initialValues?.hideRsvpCount ?? false);
    const [hideAttendeeList, setHideAttendeeList] = useState(initialValues?.hideAttendeeList ?? false);
    const [rsvpClosed, setRsvpClosed] = useState(initialValues?.rsvpClosed ?? false);
    const [waitlistEnabled, setWaitlistEnabled] = useState(initialValues?.waitlistEnabled ?? false);
    const [rsvpRequiresApproval, setRsvpRequiresApproval] = useState(initialValues?.rsvpRequiresApproval ?? false);

    // Recurrence (new events only)
    const [recurring, setRecurring] = useState(false);
    const [recurFreq, setRecurFreq] = useState<"WEEKLY" | "BIWEEKLY" | "MONTHLY">("WEEKLY");
    const [recurCount, setRecurCount] = useState(8);
    const [recurNoEnd, setRecurNoEnd] = useState(false);
    const [recurWeekdays, setRecurWeekdays] = useState<number[]>([]); // empty => start date's weekday
    const startWeekday = startDate ? startDate.getDay() : new Date().getDay();
    const effectiveWeekdays = recurWeekdays.length ? recurWeekdays : [startWeekday];
    const toggleWeekday = (d: number) => {
        setRecurWeekdays((prev) => {
            const base = prev.length ? prev : [startWeekday];
            const next = base.includes(d) ? base.filter((x) => x !== d) : [...base, d];
            return next.length ? [...next].sort((a, b) => a - b) : base; // keep at least one
        });
    };

    const touch = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

    const [focusedField, setFocusedField] = useState<string | null>(null);
    const t = useT();

    const DESC_MAX = 1000;

    // Auto-save draft every 30s when there's a title
    const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        autoSaveRef.current = setInterval(async () => {
            if (!titles.en.trim() || submitting) return;
            setAutoSaving(true);
            try { await handleSubmit(true, false, true); } catch {}
            finally { setAutoSaving(false); }
        }, 30000);
        return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
    }, [titles, descriptions, venue, startDate, endDate, images, selectedTags, capacity, submitting]);

    const hasDate = startDate !== null && (!!postId || startDate > new Date());

    const errors = {
        title: touched.title && !titles.en.trim() ? t.titleRequired : null,
        date: touched.date && !hasDate ? (startDate && startDate <= new Date() ? t.dateFuture : t.dateRequired) : null,
        venue: touched.venue && !venue.trim() ? t.venueRequired : null,
        description: touched.description && !descriptions.en.trim() ? t.descriptionRequired : null,
    };

    const requirements = [
        { key: "en-title", label: t.reqEnTitle, met: titles.en.trim().length > 0 },
        { key: "en-description", label: t.reqEnDescription, met: descriptions.en.trim().length > 0 },
        { key: "datetime", label: postId ? t.reqDatetime : t.reqFutureDatetime, met: hasDate },
        { key: "venue", label: t.reqVenue, met: venue.trim().length > 0 },
    ];
    const canPublish = requirements.every((r) => r.met);

    const pickerIsDate = pickerTarget === "start-date" || pickerTarget === "end-date" || pickerTarget === "sched-date";
    const pickerIsStart = pickerTarget === "start-date" || pickerTarget === "start-time";
    const pickerIsSched = pickerTarget === "sched-date" || pickerTarget === "sched-time";
    // iOS shows a single combined date+time wheel; Android picks date or time per tap.
    const pickerCombined = Platform.OS === "ios";
    const pickerMode = pickerCombined ? "datetime" : (pickerIsDate ? "date" : "time");
    const pickerValue = pickerIsStart
        ? (startDate ?? new Date())
        : pickerIsSched
            ? (scheduleDate ?? new Date())
            : (endDate ?? startDate ?? new Date());
    // Start/publish can't be in the past; an end can't be before its start.
    const pickerMinimumDate = pickerIsStart || pickerIsSched
        ? new Date()
        : (startDate ?? undefined);

    function onPickerChange(_: DateTimePickerEvent, selected?: Date) {
        if (Platform.OS === "android") { setPickerTarget(null); touch("date"); }
        if (!selected) return;
        const setter = pickerIsStart ? setStartDate : pickerIsSched ? setScheduleDate : setEndDate;
        setter((prev) => {
            // Combined (iOS) picker carries the full date+time in one selection.
            if (pickerCombined) return new Date(selected);
            const base = prev ?? new Date();
            const next = new Date(base);
            if (pickerIsDate) {
                next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
            } else {
                next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
            }
            return next;
        });
    }

    async function handleSubmit(isDraft: boolean, scheduled = false, silent = false) {
        if (!isDraft && !scheduled && !canPublish) {
            setTouched({ title: true, date: true, venue: true, description: true });
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
                en: { title: titles.en.trim(), body: descriptions.en.trim() || undefined, posterUrl },
                ...(titles.fr.trim() ? { fr: { title: titles.fr.trim(), body: descriptions.fr.trim() || undefined, posterUrl } } : {}),
            };
            const eventFields = {
                startAt: startDate?.toISOString(),
                endAt: endDate?.toISOString(),
                locationName: venue.trim() || undefined,
                categories: selectedTags,
                capacity: capacity.trim() ? parseInt(capacity) : null,
                freeFood,
                recapPrivate,
                ...(scheduled ? { publishAt: scheduleDate!.toISOString() } : {}),
                commentsDisabled,
                commentsLockedAt: commentsLockDate?.toISOString() ?? null,
                slowModeSeconds: slowModeSeconds ?? null,
                hideLikeCount,
                followersOnly,
                expiresAt: expiresAt?.toISOString() ?? null,
                hideRsvpCount,
                hideAttendeeList,
                rsvpClosed,
                waitlistEnabled,
                rsvpRequiresApproval,
            };
            if (recurring && !postId && !isDraft && !scheduled) {
                // Recurring events create a series + its occurrences in one call.
                await authApi("/posts/series", {
                    method: "POST",
                    body: JSON.stringify({
                        locales,
                        startAt: startDate?.toISOString(),
                        endAt: endDate?.toISOString() ?? null,
                        locationName: venue.trim() || undefined,
                        categories: selectedTags,
                        capacity: capacity.trim() ? parseInt(capacity) : null,
                        freeFood,
                        recapPrivate,
                        images: uploadedImages,
                        recurrence: {
                            freq: recurFreq,
                            ...(recurFreq !== "MONTHLY" ? { byWeekday: effectiveWeekdays } : {}),
                            ...(recurNoEnd ? {} : { count: recurCount }),
                        },
                    }),
                });
                showToast(t.published);
                onSuccess?.();
                return;
            }
            // Editing one occurrence of a recurring series: ask which to apply to.
            if (postId && seriesId && !isDraft && !scheduled && !silent) {
                const runScoped = async (scope: "this" | "future" | "all") => {
                    try {
                        if (scope === "this") {
                            const eventAlreadyPast = startDate ? startDate.getTime() < Date.now() : false;
                            await authApi(`/posts/${postId}`, {
                                method: "PATCH",
                                body: JSON.stringify({ isDraft: false, locales, images: uploadedImages, ...eventFields, ...(eventAlreadyPast ? { notifyFollowers: false } : {}) }),
                            });
                        } else {
                            await authApi(`/posts/series/${seriesId}`, {
                                method: "PATCH",
                                body: JSON.stringify({
                                    scope,
                                    fromPostId: postId,
                                    locales,
                                    images: uploadedImages,
                                    locationName: venue.trim() || null,
                                    categories: selectedTags,
                                    capacity: capacity.trim() ? parseInt(capacity) : null,
                                    freeFood,
                                    ...(startDate ? { startHour: startDate.getHours(), startMinute: startDate.getMinutes() } : {}),
                                    ...(startDate && endDate ? { durationMs: endDate.getTime() - startDate.getTime() } : {}),
                                }),
                            });
                        }
                        showToast(t.published);
                        onSuccess?.();
                    } catch (e: any) {
                        Alert.alert(t.errorTitle, e?.message ?? t.failedToSave);
                    }
                };
                setSubmitting(false);
                Alert.alert(t.editRecurringTitle, t.editRecurringMsg, [
                    { text: t.editScopeThis, onPress: () => runScoped("this") },
                    { text: t.editScopeFuture, onPress: () => runScoped("future") },
                    { text: t.editScopeAll, onPress: () => runScoped("all") },
                    { text: t.cancel, style: "cancel" },
                ]);
                return;
            }
            if (postId) {
                const eventAlreadyPast = startDate ? startDate.getTime() < Date.now() : false;
                await authApi(`/posts/${postId}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                        isDraft: isDraft || scheduled,
                        locales,
                        images: uploadedImages,
                        ...eventFields,
                        ...(eventAlreadyPast ? { notifyFollowers: false } : {}),
                    }),
                });
            } else {
                await authApi("/posts", {
                    method: "POST",
                    body: JSON.stringify({ type: "EVENT", isDraft: isDraft || scheduled, locales, images: uploadedImages, ...eventFields }),
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

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            {/* Top bar */}
            <View style={s.topBar}>
                <Pressable onPress={onBack} style={s.backGroup}>
                    <Ionicons name="arrow-back" size={18} color="#8C0327" />
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

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={s.scroll}
                keyboardShouldPersistTaps="handled"
            >
                {/* Hero */}
                <View style={s.hero}>
                    <Text style={s.heroLabel}>{t.editorialDashboard}</Text>
                    <Text style={s.heroHeading}>{t.createEventHeading}</Text>
                </View>

                {/* 1. Event Poster */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{SECTION_LABEL(1, t.sectionEventPoster)}</Text>
                    <Text style={s.visualSub}>{t.photoTapToCover}</Text>
                    <MultiImagePicker images={images} onChange={setImages} />
                </View>

                {/* 2. Headlines & Hook */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{SECTION_LABEL(2, t.sectionHeadlinesHook)}</Text>
                    <TextInput
                        value={titles[lang]}
                        onChangeText={(v) => setTitles((prev) => ({ ...prev, [lang]: v }))}
                        placeholder={lang === "en" ? "THE COMPELLING EVENT" : "L'ÉVÉNEMENT MARQUANT"}
                        placeholderTextColor="#D4CFC8"
                        style={s.titleInput}
                        onFocus={() => setFocusedField("title")}
                        onBlur={() => { setFocusedField(null); if (lang === "en") touch("title"); }}
                        multiline
                    />
                    <View style={[s.titleUnderline, errors.title && { backgroundColor: "#DC2626", opacity: 1 }]} />
                    {errors.title && <Text style={s.fieldError}>{errors.title}</Text>}
                </View>

                {/* 3. Schedule & Timeline */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{SECTION_LABEL(3, t.sectionScheduleTimeline)}</Text>

                    {/* Start */}
                    <View style={s.scheduleRow}>
                        <Pressable style={[s.fieldCard, { flex: 1 }]} onPress={() => setPickerTarget("start-date")}>
                            <Text style={s.fieldLabel}>{t.eventDateLabel}</Text>
                            <View style={s.fieldRow}>
                                <Text style={[s.fieldInput, !startDate && s.fieldInputPlaceholder]}>
                                    {startDate ? fmtDate(startDate) : t.selectDate}
                                </Text>
                                <Ionicons name="calendar-outline" size={18} color="#9CA3AF" />
                            </View>
                        </Pressable>
                        <Pressable style={[s.fieldCard, { flex: 1 }]} onPress={() => setPickerTarget("start-time")}>
                            <Text style={s.fieldLabel}>{t.startTimeLabel}</Text>
                            <View style={s.fieldRow}>
                                <Text style={[s.fieldInput, !startDate && s.fieldInputPlaceholder]}>
                                    {startDate ? fmtTime(startDate) : "TIME"}
                                </Text>
                                <Ionicons name="time-outline" size={18} color="#9CA3AF" />
                            </View>
                        </Pressable>
                    </View>

                    {/* End (optional) */}
                    <View style={[s.scheduleRow, { marginTop: 12 }]}>
                        <Pressable style={[s.fieldCard, { flex: 1, opacity: !startDate ? 0.5 : 1 }]} onPress={() => startDate && setPickerTarget("end-date")}>
                            <Text style={s.fieldLabel}>{t.endDateLabel}</Text>
                            <View style={s.fieldRow}>
                                <Text style={[s.fieldInput, !endDate && s.fieldInputPlaceholder]}>
                                    {endDate ? fmtDate(endDate) : t.noneLabel}
                                </Text>
                                <Ionicons name="calendar-outline" size={18} color="#9CA3AF" />
                            </View>
                        </Pressable>
                        <Pressable style={[s.fieldCard, { flex: 1, opacity: !endDate ? 0.5 : 1 }]} onPress={() => endDate && setPickerTarget("end-time")}>
                            <Text style={s.fieldLabel}>{t.endTimeLabel}</Text>
                            <View style={s.fieldRow}>
                                <Text style={[s.fieldInput, !endDate && s.fieldInputPlaceholder]}>
                                    {endDate ? fmtTime(endDate) : "TIME"}
                                </Text>
                                <Ionicons name="time-outline" size={18} color="#9CA3AF" />
                            </View>
                        </Pressable>
                    </View>

                    {/* Schedule row */}
                    <View style={[s.scheduleRow, { marginTop: 16 }]}>
                        <View style={[s.fieldCard, { flex: 1, backgroundColor: scheduleDate ? "#FEF3C7" : "#EDECEA" }]}>
                            <Text style={s.fieldLabel}>{t.schedulePublishSection}</Text>
                            <View style={s.fieldRow}>
                                <Ionicons name="time-outline" size={14} color="#9CA3AF" style={{ marginRight: 6 }} />
                                <Pressable onPress={() => setPickerTarget("sched-date")} style={{ flex: 1 }}>
                                    <Text style={[s.fieldInput, !scheduleDate && s.fieldInputPlaceholder]}>
                                        {scheduleDate ? `${fmtDate(scheduleDate)}` : t.noneLabel}
                                    </Text>
                                </Pressable>
                                {scheduleDate && (
                                    <Pressable onPress={() => setPickerTarget("sched-time")}>
                                        <Text style={[s.fieldInput, { color: "#8C0327" }]}>{fmtTime(scheduleDate)}</Text>
                                    </Pressable>
                                )}
                                {scheduleDate && (
                                    <Pressable onPress={() => setScheduleDate(null)} style={{ marginLeft: 6 }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear schedule date">
                                        <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                                    </Pressable>
                                )}
                            </View>
                        </View>
                    </View>

                    {/* Android picker */}
                    {Platform.OS === "android" && pickerTarget !== null && (
                        <DateTimePicker
                            value={pickerValue}
                            mode={pickerMode}
                            minimumDate={pickerMinimumDate}
                            onChange={onPickerChange}
                        />
                    )}

                    {/* iOS bottom sheet */}
                    {Platform.OS === "ios" && (
                        <BottomSheet
                            visible={pickerTarget !== null}
                            onClose={() => setPickerTarget(null)}
                        >
                            <View style={s.pickerSheet}>
                                <View style={s.pickerSheetHeader}>
                                    <Text style={s.pickerSheetTitle}>
                                        {pickerTarget === "start-date" ? t.eventDateLabel :
                                         pickerTarget === "start-time" ? t.startTimeLabel :
                                         pickerTarget === "end-date" ? t.endDateLabel :
                                         pickerTarget === "sched-date" ? t.publishDate :
                                         pickerTarget === "sched-time" ? t.publishTime : t.endTimeLabel}
                                    </Text>
                                    <Pressable onPress={() => { setPickerTarget(null); touch("date"); }} style={s.pickerDoneBtn}>
                                        <Text style={s.pickerDoneText}>{t.done}</Text>
                                    </Pressable>
                                </View>
                                <DateTimePicker
                                    value={pickerValue}
                                    mode={pickerMode}
                                    minimumDate={pickerMinimumDate}
                                    display="spinner"
                                    onChange={onPickerChange}
                                    style={{ width: "100%", backgroundColor: "#FFFFFF" }} themeVariant="light" textColor="#111827"
                                />
                            </View>
                        </BottomSheet>
                    )}
                    {errors.date && <Text style={[s.fieldError, { marginTop: 8 }]}>{errors.date}</Text>}
                </View>

                {/* 4. Venue */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{SECTION_LABEL(4, t.sectionVenueDigital)}</Text>
                    <View style={s.venueRow}>
                        <Ionicons name="location" size={18} color="#8C0327" style={{ marginTop: 2 }} />
                        <TextInput
                            value={venue}
                            onChangeText={setVenue}
                            placeholder={lang === "en" ? "VENUE NAME OR STREAMING URL" : "NOM DU LIEU OU LIEN EN LIGNE"}
                            placeholderTextColor="#D4CFC8"
                            style={s.venueInput}
                            onFocus={() => setFocusedField("venue")}
                            onBlur={() => { setFocusedField(null); touch("venue"); }}
                        />
                    </View>
                    <View style={[s.titleUnderline, errors.venue && { backgroundColor: "#DC2626", opacity: 1 }]} />
                    {errors.venue && <Text style={s.fieldError}>{errors.venue}</Text>}
                </View>

                {/* 5. Capacity */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{SECTION_LABEL(5, t.capacitySection)}</Text>
                    <View style={s.venueRow}>
                        <Ionicons name="people" size={18} color="#8C0327" style={{ marginTop: 2 }} />
                        <TextInput
                            value={capacity}
                            onChangeText={(v) => setCapacity(v.replace(/[^0-9]/g, ""))}
                            placeholder={lang === "en" ? "MAX ATTENDEES (OPTIONAL)" : "MAX PARTICIPANTS (OPTIONNEL)"}
                            placeholderTextColor="#D4CFC8"
                            style={s.venueInput}
                            keyboardType="number-pad"
                            onFocus={() => setFocusedField("capacity")}
                            onBlur={() => setFocusedField(null)}
                        />
                    </View>
                    <View style={s.titleUnderline} />
                </View>

                {/* 6. Tags */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{SECTION_LABEL(6, t.eventTagsLabel)}</Text>
                    <Text style={s.tagHint}>{t.selectAllThatApply}</Text>
                    <View style={s.tagGrid}>
                        {EVENT_TAGS.map((tag) => {
                            const active = selectedTags.includes(tag);
                            return (
                                <Pressable
                                    key={tag}
                                    onPress={() => setSelectedTags((prev) =>
                                        active ? prev.filter((t) => t !== tag) : [...prev, tag]
                                    )}
                                    style={[s.tagChip, active && s.tagChipActive]}
                                >
                                    <Text style={[s.tagChipText, active && s.tagChipTextActive]}>{tag}</Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </View>

                {/* 6. Narrative Content */}
                <View style={s.section}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <Text style={s.sectionLabel}>{SECTION_LABEL(6, t.sectionNarrativeContent)}</Text>
                        <Text style={{ fontSize: 11, color: descriptions[lang].length > DESC_MAX * 0.9 ? "#8C0327" : "#9CA3AF" }}>
                            {descriptions[lang].length}/{DESC_MAX}
                        </Text>
                    </View>
                    <View style={s.narrativeWrap}>
                        <View style={s.narrativeAccent} />
                        <TextInput
                            value={descriptions[lang]}
                            onChangeText={(v) => setDescriptions((prev) => ({ ...prev, [lang]: v.slice(0, DESC_MAX) }))}
                            placeholder={
                                lang === "en"
                                    ? "Draft the event's story here.\nConnect with your audience..."
                                    : "Rédigez l'histoire de l'événement ici.\nConnectez-vous à votre public..."
                            }
                            placeholderTextColor="#C4BFB8"
                            style={s.narrativeInput}
                            multiline
                            textAlignVertical="top"
                            onFocus={() => setFocusedField("desc")}
                            onBlur={() => setFocusedField(null)}
                        />
                    </View>
                    {errors.description && <Text style={s.fieldError}>{errors.description}</Text>}
                </View>

                {/* 7. Post Settings */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{`7. ${t.postSettingsSection}`}</Text>

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

                {/* Repeats (new events only) */}
                {!postId && (
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{t.repeatsSection}</Text>

                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.repeatEventLabel}</Text>
                            <Text style={cs.rowSub}>{t.repeatEventSub}</Text>
                        </View>
                        <Pressable style={[cs.toggle, recurring && cs.toggleOn]} onPress={() => setRecurring((v) => !v)} accessibilityRole="button" accessibilityLabel="Toggle repeat event">
                            <View style={[cs.toggleThumb, recurring && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>

                    {recurring && (
                        <>
                            <View style={{ flexDirection: "row", gap: 8, marginTop: 4, marginBottom: 4 }}>
                                {([["WEEKLY", t.freqWeekly], ["BIWEEKLY", t.freqBiweekly], ["MONTHLY", t.freqMonthly]] as const).map(([val, label]) => {
                                    const active = recurFreq === val;
                                    return (
                                        <Pressable
                                            key={val}
                                            onPress={() => setRecurFreq(val)}
                                            style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: active ? "#8C0327" : "#E5E0D8", backgroundColor: active ? "#8C0327" : "#fff", alignItems: "center" }}
                                            accessibilityRole="button"
                                            accessibilityLabel={label}
                                            accessibilityState={{ selected: active }}
                                        >
                                            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: active ? "#fff" : "#6B7280" }}>{label}</Text>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            {recurFreq !== "MONTHLY" && (
                                <View style={{ marginTop: 4, marginBottom: 4 }}>
                                    <Text style={[cs.rowTitle, { marginBottom: 8 }]}>{t.repeatDaysLabel}</Text>
                                    <View style={{ flexDirection: "row", gap: 6 }}>
                                        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => {
                                            const active = effectiveWeekdays.includes(i);
                                            return (
                                                <Pressable
                                                    key={i}
                                                    onPress={() => toggleWeekday(i)}
                                                    style={{ flex: 1, aspectRatio: 1, maxWidth: 40, borderRadius: 20, borderWidth: 1.5, borderColor: active ? "#8C0327" : "#E5E0D8", backgroundColor: active ? "#8C0327" : "#fff", alignItems: "center", justifyContent: "center" }}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
                                                    accessibilityState={{ selected: active }}
                                                >
                                                    <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 13, fontWeight: "800", color: active ? "#fff" : "#6B7280" }}>{d}</Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}

                            <View style={cs.row}>
                                <View style={cs.rowLeft}>
                                    <Text style={cs.rowTitle}>{t.repeatNoEndLabel}</Text>
                                    <Text style={cs.rowSub}>{t.repeatNoEndSub}</Text>
                                </View>
                                <Pressable style={[cs.toggle, recurNoEnd && cs.toggleOn]} onPress={() => setRecurNoEnd((v) => !v)} accessibilityRole="button" accessibilityLabel="Toggle no end date">
                                    <View style={[cs.toggleThumb, recurNoEnd && cs.toggleThumbOn]} />
                                </Pressable>
                            </View>

                            {!recurNoEnd && (
                                <View style={cs.row}>
                                    <View style={cs.rowLeft}>
                                        <Text style={cs.rowTitle}>{t.repeatCountLabel}</Text>
                                        <Text style={cs.rowSub}>{t.repeatCountSub}</Text>
                                    </View>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                                        <Pressable onPress={() => setRecurCount((c) => Math.max(2, c - 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Fewer occurrences">
                                            <Ionicons name="remove-circle-outline" size={26} color="#8C0327" />
                                        </Pressable>
                                        <Text style={{ fontSize: 16, fontWeight: "800", color: "#111827", minWidth: 26, textAlign: "center" }}>{recurCount}</Text>
                                        <Pressable onPress={() => setRecurCount((c) => Math.min(26, c + 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="More occurrences">
                                            <Ionicons name="add-circle-outline" size={26} color="#8C0327" />
                                        </Pressable>
                                    </View>
                                </View>
                            )}

                            <Text style={{ fontSize: 12, color: "#6B7280", marginTop: 6, lineHeight: 17 }}>{t.repeatHint}</Text>
                        </>
                    )}
                </View>
                )}

                {/* 8. Event Settings */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{`8. ${t.eventSettingsSection}`}</Text>

                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>🍕 {t.freeFoodLabel}</Text>
                            <Text style={cs.rowSub}>{t.freeFoodSub}</Text>
                        </View>
                        <Pressable style={[cs.toggle, freeFood && cs.toggleOn]} onPress={() => setFreeFood((v) => !v)} accessibilityRole="button" accessibilityLabel="Toggle free food">
                            <View style={[cs.toggleThumb, freeFood && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>

                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.privateRecapLabel}</Text>
                            <Text style={cs.rowSub}>{t.privateRecapSub}</Text>
                        </View>
                        <Pressable style={[cs.toggle, recapPrivate && cs.toggleOn]} onPress={() => setRecapPrivate((v) => !v)} accessibilityRole="button" accessibilityLabel="Toggle private recap">
                            <View style={[cs.toggleThumb, recapPrivate && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>

                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.hideRsvpCountLabel}</Text>
                            <Text style={cs.rowSub}>{t.hideRsvpCountSub}</Text>
                        </View>
                        <Pressable style={[cs.toggle, hideRsvpCount && cs.toggleOn]} onPress={() => setHideRsvpCount((v) => !v)}>
                            <View style={[cs.toggleThumb, hideRsvpCount && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>

                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.privateAttendeeList}</Text>
                            <Text style={cs.rowSub}>{t.privateAttendeeListSub}</Text>
                        </View>
                        <Pressable style={[cs.toggle, hideAttendeeList && cs.toggleOn]} onPress={() => setHideAttendeeList((v) => !v)}>
                            <View style={[cs.toggleThumb, hideAttendeeList && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>

                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.waitlistModeLabel}</Text>
                            <Text style={cs.rowSub}>{t.waitlistModeSub}</Text>
                        </View>
                        <Pressable style={[cs.toggle, waitlistEnabled && cs.toggleOn]} onPress={() => setWaitlistEnabled((v) => !v)}>
                            <View style={[cs.toggleThumb, waitlistEnabled && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>

                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.requireApprovalLabel}</Text>
                            <Text style={cs.rowSub}>{t.requireApprovalSub}</Text>
                        </View>
                        <Pressable style={[cs.toggle, rsvpRequiresApproval && cs.toggleOn]} onPress={() => setRsvpRequiresApproval((v) => !v)}>
                            <View style={[cs.toggleThumb, rsvpRequiresApproval && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>

                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.closeRsvpLabel}</Text>
                            <Text style={cs.rowSub}>{t.closeRsvpSub}</Text>
                        </View>
                        <Pressable style={[cs.toggle, rsvpClosed && cs.toggleOn]} onPress={() => setRsvpClosed((v) => !v)}>
                            <View style={[cs.toggleThumb, rsvpClosed && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>
                </View>

                {/* 9. Comment Settings */}
                <View style={s.section}>
                    <Text style={s.sectionLabel}>{`9. ${t.commentSettingsSection}`}</Text>

                    {/* Disable comments toggle */}
                    <View style={cs.row}>
                        <View style={cs.rowLeft}>
                            <Text style={cs.rowTitle}>{t.disableCommentsLabel}</Text>
                            <Text style={cs.rowSub}>{t.disableCommentsSub}</Text>
                        </View>
                        <Pressable
                            style={[cs.toggle, commentsDisabled && cs.toggleOn]}
                            onPress={() => setCommentsDisabled((v) => !v)}
                        >
                            <View style={[cs.toggleThumb, commentsDisabled && cs.toggleThumbOn]} />
                        </Pressable>
                    </View>

                    {!commentsDisabled && (
                        <>
                            {/* Auto-lock date */}
                            <View style={cs.row}>
                                <View style={cs.rowLeft}>
                                    <Text style={cs.rowTitle}>{t.autoLockDateLabel}</Text>
                                    <Text style={cs.rowSub}>{t.autoLockDateSub}</Text>
                                </View>
                                <Pressable
                                    style={cs.dateBtn}
                                    onPress={() => setShowLockPicker(true)}
                                >
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

                            {/* Slow mode */}
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
                                color={r.met ? "#8C0327" : "#C4BFB8"}
                            />
                            <Text style={[s.reqText, r.met && s.reqTextMet]}>{r.label}</Text>
                        </View>
                    ))}
                </View>
                <View style={s.bottomBtns}>
                    <Pressable
                        style={s.btnDraft}
                        onPress={() => handleSubmit(true)}
                        disabled={submitting}
                    >
                        <Text style={s.btnDraftText}>{t.saveDraftBtn}</Text>
                    </Pressable>
                    {scheduleDate ? (
                        <Pressable
                            style={[s.btnPublish, { backgroundColor: "#92400E" }, submitting && s.btnPublishDisabled]}
                            onPress={() => handleSubmit(false, true)}
                            disabled={submitting}
                        >
                            {submitting ? <ActivityIndicator color="#fff" /> : (
                                <Text style={s.btnPublishText}>{t.schedule}</Text>
                            )}
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
                                <Text style={s.btnPublishText}>{postId ? t.updateEventBtn : t.publishEventBtn}</Text>
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
    backBtn: { marginRight: 12 },
    backGroup: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        flex: 1,
    },
    topBarBrand: {
        flex: 1,
        fontSize: 14,
        fontWeight: "900",
        color: "#8C0327",
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
    langPillActive: { backgroundColor: "#8C0327" },
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
        color: "#8C0327",
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
    sectionLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: "#8C0327",
        letterSpacing: 1.5,
        marginBottom: 14,
    },

    visualSub: {
        fontSize: 10,
        color: "#9CA3AF",
        letterSpacing: 0.3,
        marginBottom: 10,
    },

    // Title input
    titleInput: {
        fontSize: 28,
        fontWeight: "800",
        color: "#000",
        letterSpacing: -0.5,
        lineHeight: 34,
        paddingVertical: 0,
        minHeight: 40,
    },
    fieldError: {
        fontSize: 11,
        color: "#DC2626",
        marginTop: 4,
        fontWeight: "600",
        letterSpacing: 0.3,
    },
    titleUnderline: {
        height: 1.5,
        backgroundColor: "#8C0327",
        marginTop: 8,
        opacity: 0.4,
    },

    // Field cards (schedule)
    scheduleRow: {
        flexDirection: "row",
        gap: 10,
    },
    fieldCard: {
        backgroundColor: "#EDECEA",
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    fieldLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: "#9CA3AF",
        letterSpacing: 1.5,
        marginBottom: 6,
    },
    fieldRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    fieldInput: {
        flex: 1,
        fontSize: 15,
        fontWeight: "600",
        color: "#111827",
        paddingVertical: 0,
    },
    fieldInputPlaceholder: {
        color: "#C4BFB8",
        fontWeight: "400",
    },

    // Venue
    venueRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
    },
    venueInput: {
        flex: 1,
        fontSize: 18,
        fontWeight: "700",
        color: "#8C0327",
        letterSpacing: 0.3,
        paddingVertical: 0,
    },

    // Narrative
    narrativeWrap: {
        flexDirection: "row",
        gap: 14,
    },
    narrativeAccent: {
        width: 3,
        backgroundColor: "#8C0327",
        borderRadius: 2,
        minHeight: 120,
    },
    narrativeInput: {
        flex: 1,
        fontSize: 15,
        color: "#111827",
        lineHeight: 24,
        minHeight: 120,
        paddingVertical: 4,
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
        backgroundColor: "#8C0327",
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
        backgroundColor: "#8C0327",
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
        color: "#8C0327",
    },

    // Date/time picker modal (iOS)
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
        color: "#8C0327",
        letterSpacing: 1.5,
    },
    pickerDoneBtn: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        backgroundColor: "#8C0327",
    },
    pickerDoneText: {
        fontSize: 11,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 1,
    },
    tagHint: {
        fontSize: 11,
        color: "#9CA3AF",
        fontWeight: "500",
        marginBottom: 10,
    },
    tagGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    tagChip: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderWidth: 1.5,
        borderColor: "#E5E7EB",
        backgroundColor: "#fff",
    },
    tagChipActive: {
        borderColor: "#8C0327",
        backgroundColor: "#8C0327",
    },
    tagChipText: {
        fontSize: 11,
        fontWeight: "700",
        color: "#6B7280",
        letterSpacing: 0.5,
    },
    tagChipTextActive: {
        color: "#fff",
    },
});

// Shared comment-settings styles (reused across create forms)
export const cs = StyleSheet.create({
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: "#E5E0D8",
        gap: 12,
    },
    rowLeft: { flex: 1, gap: 2 },
    rowTitle: { fontSize: 10, fontWeight: "800", color: "#111827", letterSpacing: 1 },
    rowSub: { fontSize: 11, color: "#9CA3AF" },

    toggle: {
        width: 44,
        height: 24,
        borderRadius: 12,
        backgroundColor: "#E5E0D8",
        justifyContent: "center",
        paddingHorizontal: 2,
    },
    toggleOn: { backgroundColor: "#8C0327" },
    toggleThumb: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: "#fff",
    },
    toggleThumbOn: { alignSelf: "flex-end" },

    dateBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderWidth: 1,
        borderColor: "#D4CFC8",
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    dateBtnText: { fontSize: 10, fontWeight: "700", color: "#374151", letterSpacing: 0.5 },

    slowPills: { flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" },
    slowPill: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: "#D4CFC8",
    },
    slowPillActive: { borderColor: "#8C0327", backgroundColor: "#FEF2F2" },
    slowPillText: { fontSize: 10, fontWeight: "700", color: "#9CA3AF", letterSpacing: 0.5 },
    slowPillTextActive: { color: "#8C0327" },
});
