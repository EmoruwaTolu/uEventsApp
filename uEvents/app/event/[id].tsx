import { useEffect, useRef, useState, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    View, Text, ScrollView, Pressable, Share, TextInput, Keyboard, Animated,
    StyleSheet, ActivityIndicator, useWindowDimensions, Linking, Platform, KeyboardAvoidingView, Alert, RefreshControl, FlatList, Modal,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Calendar from "expo-calendar";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { uploadImage } from "../../lib/uploadImage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "../../lib/useApi";
import { API_BASE } from "../../lib/api";
import { useRsvp } from "../../lib/RsvpContext";
import { useLikes } from "../../lib/LikeContext";
import { useBookmarks } from "../../lib/BookmarkContext";
import { useAuth } from "../../auth/AuthContext";
import { useGuestGuard } from "../../lib/useGuestGuard";
import { useLang, pickLocale, useT } from "../../lib/LangContext";
import { useToast } from "../../lib/ToastContext";
import { PostDetailSkeleton, ErrorRetry } from "../../components/SkeletonLoader";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";
import { translateCategory } from "../../lib/categories";
import { timeAgo, localeFor } from "../../lib/datetime";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiEvent = {
    id: string;
    type?: string;
    isDraft?: boolean;
    locales?: { en?: { title?: string; body?: string; imageUrl?: string; posterUrl?: string } };
    startAt?: string;
    endAt?: string;
    locationName?: string;
    address?: string;
    categories?: string[];
    seriesId?: string | null;
    freeFood?: boolean;
    capacity?: number;
    club?: { id: string; clubName?: string; slug?: string; logoUrl?: string };
    _count?: { rsvps: number; likes?: number };
    isRsvped?: boolean;
    isLiked?: boolean;
    isBookmarked?: boolean;
    rsvpPreview?: { id: string; firstName?: string; avatarUrl?: string }[];
    // Visibility controls
    hideRsvpCount?: boolean;
    hideLikeCount?: boolean;
    hideAttendeeList?: boolean;
    followersOnly?: boolean;
    expiresAt?: string | null;
    // Event-specific controls
    rsvpClosed?: boolean;
    rsvpRequiresApproval?: boolean;
    isFollowing?: boolean;
    pendingRsvp?: boolean;
    waitlistPosition?: number | null;
    previewToken?: string | null;
    images?: string[];
};

type RecommendedEvent = {
    id: string;
    type?: string;
    locales?: { en?: { title?: string; imageUrl?: string; posterUrl?: string } };
    startAt?: string;
    clubName?: string;
    club?: { clubName?: string };
    _count?: { rsvps: number };
};

type PhotoStatus = "PENDING" | "APPROVED" | "REJECTED";
type RecapPhoto = { id: string; url: string; userId: string; by: string; avatarUrl?: string | null; canDelete: boolean; status?: PhotoStatus; canModerate?: boolean };
type RecapData = {
    visible: boolean;
    eventOver: boolean;
    canContribute?: boolean;
    isClubOwner?: boolean;
    pendingPhotoCount?: number;
    avgRating?: number | null;
    ratingCount?: number;
    myRating?: number | null;
    photos?: RecapPhoto[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined, lang: string) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString(localeFor(lang), { month: "short", day: "numeric", year: "numeric" }).toUpperCase();
}

function fmtTime(iso?: string) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function openMaps(query: string) {
    const encoded = encodeURIComponent(query);
    Linking.openURL(Platform.OS === "ios" ? `http://maps.apple.com/?q=${encoded}` : `geo:0,0?q=${encoded}`);
}

function isLive(startAt?: string, endAt?: string): boolean {
    if (!startAt) return false;
    const now = new Date();
    const start = new Date(startAt);
    const end = endAt ? new Date(endAt) : new Date(start.getTime() + 2 * 3600000);
    return now >= start && now <= end;
}

const calKey = (postId: string) => `calendarEvent:${postId}`;

type CalEntry = { calId: string; startAt: string };

// Adds the event to the device calendar, or updates the existing entry if one
// was created earlier (so a changed start time stays in sync rather than stale).
// Stores the created calendar event id keyed by post id so we can update later.
async function syncToCalendar(
    postId: string,
    startAt?: string, endAt?: string, title?: string, location?: string,
    existingCalId?: string | null,
    onSuccess?: (msg: string) => void,
    t?: any,
): Promise<CalEntry | null> {
    if (!startAt) return null;
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== "granted") {
        Alert.alert(t.calendarPermTitle, t.calendarPermMsg);
        return null;
    }
    const start = new Date(startAt);
    const end = endAt ? new Date(endAt) : new Date(start.getTime() + 2 * 3600000);
    const details = {
        title: title ?? "Event",
        startDate: start,
        endDate: end,
        location: location ?? undefined,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    try {
        if (existingCalId) {
            // Update the existing entry. If the user deleted it from their
            // calendar, updateEventAsync throws — fall through to re-create.
            try {
                await Calendar.updateEventAsync(existingCalId, details);
                const entry = { calId: existingCalId, startAt };
                await AsyncStorage.setItem(calKey(postId), JSON.stringify(entry));
                onSuccess?.(t.updatedInCalendarNamed(title ?? ""));
                return entry;
            } catch {}
        }
        const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
        const defaultCal = calendars.find((c) =>
            Platform.OS === "ios" ? c.allowsModifications && c.source?.name === "iCloud" : c.isPrimary
        ) ?? calendars.find((c) => c.allowsModifications);
        if (!defaultCal) {
            Alert.alert(t.noCalendarTitle, t.noCalendarMsg);
            return null;
        }
        const newId = await Calendar.createEventAsync(defaultCal.id, details);
        const entry = { calId: newId, startAt };
        await AsyncStorage.setItem(calKey(postId), JSON.stringify(entry));
        onSuccess?.(t.addedToCalendarNamed(title ?? ""));
        return entry;
    } catch {
        Alert.alert(t.errorTitle, t.calendarAddError);
        return null;
    }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EventPage() {
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);
    const router = useRouter();
    const authApi = useApi();
    const { showToast, showActionToast } = useToast();
    const { width: screenWidth } = useWindowDimensions();
    const { id, focusComment, highlightComment, addPhoto, focusPhotos } = useLocalSearchParams<{ id: string; focusComment?: string; highlightComment?: string; addPhoto?: string; focusPhotos?: string }>();
    const scrollRef = useRef<ScrollView>(null);
    const commentInputRef = useRef<TextInput>(null);
    const commentsSectionY = useRef(0);
    const recapSectionY = useRef(0);
    const commentLayouts = useRef<Record<string, number>>({});
    const [highlightedComment, setHighlightedComment] = useState<string | null>(null);
    const highlightAnim = useRef(new Animated.Value(0)).current;
    const deepLinkHandled = useRef(false);

    const { session } = useAuth();
    const { lang } = useLang();
    const t = useT();
    const guestGuard = useGuestGuard();
    const { isRsvped, isWaitlisted, toggleRsvp: ctxToggleRsvp } = useRsvp();
    const { resolve: resolveLike, toggleLike: toggleLikeCtx } = useLikes();
    const { resolve: resolveBookmark, toggleBookmark: toggleBookmarkCtx } = useBookmarks();
    const [event, setEvent] = useState<ApiEvent | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [rsvpLoading, setRsvpLoading] = useState(false);
    const [recommended, setRecommended] = useState<RecommendedEvent[]>([]);
    const [recap, setRecap] = useState<RecapData | null>(null);
    const [recapUploading, setRecapUploading] = useState(false);
    const [comments, setComments] = useState<any[]>([]);
    const [commentText, setCommentText] = useState("");
    const [commentLoading, setCommentLoading] = useState(false);
    const [hasReminder, setHasReminder] = useState(false);
    const [calEntry, setCalEntry] = useState<CalEntry | null>(null);
    const [commentFilter, setCommentFilter] = useState<"all" | "clubs" | "students">("all");
    const [commentSort, setCommentSort] = useState<"newest" | "oldest">("newest");
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
    const [liveCountdown, setLiveCountdown] = useState<string | null>(null);
    const [heroImageFailed, setHeroImageFailed] = useState(false);
    const [carouselIndex, setCarouselIndex] = useState(0);
    // Attendance check-in (student scans the club's QR)
    const [scannerOpen, setScannerOpen] = useState(false);
    const [checkInStatus, setCheckInStatus] = useState<"idle" | "success" | "already" | "error">("idle");
    const [scanning, setScanning] = useState(false);
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();

    // Load any previously-saved calendar entry for this event so we can tell
    // whether to offer "Add", "Update" (start time changed), or "In calendar".
    useEffect(() => {
        if (!id) return;
        AsyncStorage.getItem(calKey(id))
            .then((raw) => setCalEntry(raw ? (JSON.parse(raw) as CalEntry) : null))
            .catch(() => {});
    }, [id]);

    const calNeedsUpdate = !!calEntry && !!event?.startAt && calEntry.startAt !== event.startAt;

    async function handleCalendarPress() {
        if (calEntry && !calNeedsUpdate) { showToast(t.inCalendar); return; }
        const entry = await syncToCalendar(
            id, event?.startAt, event?.endAt, title, event?.locationName,
            calNeedsUpdate ? calEntry?.calId : null, showToast, t,
        );
        if (entry) setCalEntry(entry);
    }

    // Load the post-event recap once the event is over.
    useEffect(() => {
        if (!id || !event) return;
        const end = event.endAt ?? event.startAt;
        const over = !!end && (event.endAt ? new Date(event.endAt) : new Date(new Date(event.startAt!).getTime() + 2 * 3600000)) < new Date();
        if (!over) { setRecap(null); return; }
        authApi<RecapData>(`/posts/${id}/recap`).then(setRecap).catch(() => {});
    }, [id, event?.endAt, event?.startAt]);

    async function submitRating(n: number) {
        try {
            const res = await authApi<{ avgRating: number | null; ratingCount: number; myRating: number }>(`/posts/${id}/recap/rating`, {
                method: "POST", body: JSON.stringify({ rating: n }),
            });
            setRecap((r) => r ? { ...r, avgRating: res.avgRating, ratingCount: res.ratingCount, myRating: res.myRating } : r);
            showToast("Thanks for rating!");
        } catch (e: any) {
            Alert.alert(t.couldntRateTitle, e?.message ?? t.genericTryAgain);
        }
    }

    async function addRecapPhoto() {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") { Alert.alert(t.permissionNeededTitle, t.photoPermissionMsg); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] as any, quality: 0.9 });
        if (result.canceled || !result.assets?.[0]) return;
        setRecapUploading(true);
        try {
            const url = await uploadImage(result.assets[0].uri, session?.token);
            const photo = await authApi<{ id: string; url: string; status?: PhotoStatus }>(`/posts/${id}/recap/photo`, {
                method: "POST", body: JSON.stringify({ url }),
            });
            setRecap((r) => r ? { ...r, photos: [{ id: photo.id, url: photo.url, userId: session?.userId ?? "", by: "You", canDelete: true, status: photo.status ?? "PENDING" }, ...(r.photos ?? [])] } : r);
            showToast(photo.status === "APPROVED" ? "Photo added" : "Photo submitted for review");
        } catch (e: any) {
            Alert.alert(t.uploadFailedTitle, e?.message ?? t.genericTryAgain);
        } finally {
            setRecapUploading(false);
        }
    }

    function deleteRecapPhoto(photoId: string) {
        Alert.alert(t.removePhotoTitle, t.removePhotoMsg, [
            { text: t.cancelBtn, style: "cancel" },
            { text: t.removeBtn, style: "destructive", onPress: async () => {
                setRecap((r) => r ? { ...r, photos: (r.photos ?? []).filter((p) => p.id !== photoId) } : r);
                try { await authApi(`/posts/${id}/recap/photo/${photoId}`, { method: "DELETE" }); } catch {}
            } },
        ]);
    }

    // Club owner: approve or reject a pending attendee photo.
    async function moderateRecapPhoto(photoId: string, action: "approve" | "reject") {
        setRecap((r) => {
            if (!r) return r;
            const photos = action === "approve"
                ? (r.photos ?? []).map((p) => p.id === photoId ? { ...p, status: "APPROVED" as PhotoStatus, canModerate: false } : p)
                : (r.photos ?? []).filter((p) => p.id !== photoId);
            const pendingPhotoCount = Math.max(0, (r.pendingPhotoCount ?? 1) - 1);
            return { ...r, photos, pendingPhotoCount };
        });
        try {
            await authApi(`/posts/${id}/recap/photo/${photoId}`, { method: "PATCH", body: JSON.stringify({ action }) });
        } catch {}
    }

    useEffect(() => {
        if (!event?.endAt || !isLive(event?.startAt, event?.endAt)) { setLiveCountdown(null); return; }
        function tick() {
            const minsLeft = Math.ceil((new Date(event!.endAt!).getTime() - Date.now()) / 60000);
            if (minsLeft <= 0) { setLiveCountdown(null); return; }
            const h = Math.floor(minsLeft / 60);
            const m = minsLeft % 60;
            setLiveCountdown(h > 0 ? `ENDS IN ${h}H ${m > 0 ? `${m}M` : ""}`.trim() : `ENDS IN ${minsLeft}M`);
        }
        tick();
        const timer = setInterval(tick, 60000);
        return () => clearInterval(timer);
    }, [event]);

    function loadEvent(isRefresh = false) {
        if (!id) return;
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setFetchError(false);
        authApi<ApiEvent>(`/posts/${id}`)
            .then((data) => { setEvent(data); })
            .catch(() => setFetchError(true))
            .finally(() => isRefresh ? setRefreshing(false) : setLoading(false));
        authApi<RecommendedEvent[]>("/events?upcoming=true&limit=10")
            .then((data) => setRecommended(data.filter((e) => e.id !== id).slice(0, 3)))
            .catch(() => {});
        authApi<any[]>(`/posts/${id}/comments`)
            .then(setComments)
            .catch(() => {});
    }

    useEffect(() => { loadEvent(); }, [id]);

    // Deep-link from the feed: focus the composer ("Join the conversation"),
    // scroll to + highlight a specific comment (tapped TOP COMMENT), or open the
    // recap photo picker ("Add yours").
    useEffect(() => {
        if (deepLinkHandled.current) return;
        if (!focusComment && !highlightComment && !addPhoto && !focusPhotos) return;
        if (loading) return;                                   // page content (ScrollView/input) not mounted yet
        if (highlightComment && comments.length === 0) return; // wait for comments to load
        if ((addPhoto || focusPhotos) && !recap) return;       // wait for the recap section to exist
        deepLinkHandled.current = true;
        // Let the ScrollView lay out + measure section offsets before acting.
        const timer = setTimeout(() => {
            if (highlightComment) {
                const y = commentsSectionY.current + (commentLayouts.current[highlightComment] ?? 0) - 90;
                scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
                setHighlightedComment(highlightComment);
                // Hold the colour briefly, then fade it gently back to the card.
                highlightAnim.setValue(1);
                Animated.timing(highlightAnim, { toValue: 0, duration: 1800, delay: 900, useNativeDriver: false })
                    .start(({ finished }) => { if (finished) setHighlightedComment(null); });
            } else if (focusComment) {
                scrollRef.current?.scrollToEnd({ animated: true });
                commentInputRef.current?.focus();
            } else if (addPhoto) {
                scrollRef.current?.scrollTo({ y: Math.max(0, recapSectionY.current - 60), animated: true });
                if (recap?.canContribute) setTimeout(() => addRecapPhoto(), 450);
            } else if (focusPhotos) {
                scrollRef.current?.scrollTo({ y: Math.max(0, recapSectionY.current - 60), animated: true });
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [loading, comments, recap, focusComment, highlightComment, addPhoto, focusPhotos]);

    const pendingDeletes = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    function deleteComment(commentId: string, parentId?: string) {
        // Snapshot current state for undo
        const snapshot = comments.map((c) => ({ ...c, replies: [...(c.replies ?? [])] }));

        // Optimistically remove from UI
        if (parentId) {
            setComments((prev) => prev.map((c) =>
                c.id === parentId
                    ? { ...c, replies: (c.replies ?? []).filter((r: any) => r.id !== commentId) }
                    : c
            ));
        } else {
            setComments((prev) => prev.filter((c) => c.id !== commentId));
        }

        // Schedule the actual API call after 3 s
        const timer = setTimeout(async () => {
            pendingDeletes.current.delete(commentId);
            try {
                await authApi(`/posts/${id}/comments/${commentId}`, { method: "DELETE" });
            } catch {
                // API failed — restore
                setComments(snapshot);
                showToast("Could not delete comment", "error");
            }
        }, 3000);

        pendingDeletes.current.set(commentId, timer);

        showActionToast("Comment deleted", "UNDO", () => {
            // Cancel the pending delete and restore
            const t = pendingDeletes.current.get(commentId);
            if (t) { clearTimeout(t); pendingDeletes.current.delete(commentId); }
            setComments(snapshot);
        });
    }

    function reportPost() {
        const REASONS = [
            { value: "Spam", label: t.reasonSpam },
            { value: "Misleading event details", label: t.reasonMisleading },
            { value: "Inappropriate content", label: t.reasonInappropriate },
            { value: "Harassment", label: t.reasonHarassment },
            { value: "Other", label: t.reasonOther },
        ];
        Alert.alert(t.reportEventTitle, t.reportEventMsg,
            [
                ...REASONS.map((r) => ({
                    text: r.label,
                    onPress: async () => {
                        try {
                            await authApi(`/reports/posts/${id}`, {
                                method: "POST",
                                body: JSON.stringify({ reason: r.value }),
                            });
                            showToast(t.reportThanks);
                        } catch {
                            showToast(t.reportError, "error");
                        }
                    },
                })),
                { text: t.cancelBtn, style: "cancel" },
            ]
        );
    }

    function reportComment(commentId: string) {
        const REASONS = [
            { value: "Spam", label: t.reasonSpam },
            { value: "Harassment", label: t.reasonHarassment },
            { value: "Inappropriate content", label: t.reasonInappropriate },
            { value: "Misinformation", label: t.reasonMisinformation },
            { value: "Other", label: t.reasonOther },
        ];
        Alert.alert(t.reportCommentTitle, t.reportCommentMsg,
            [
                ...REASONS.map((r) => ({
                    text: r.label,
                    onPress: async () => {
                        try {
                            await authApi(`/reports/comments/${commentId}`, {
                                method: "POST",
                                body: JSON.stringify({ reason: r.value }),
                            });
                            showToast(t.reportThanks);
                        } catch {
                            showToast(t.reportError, "error");
                        }
                    },
                })),
                { text: t.cancelBtn, style: "cancel" },
            ]
        );
    }

    async function submitComment() {
        const parentId = replyingTo ?? undefined;
        const text = commentText;
        if (!text.trim() || commentLoading) return;
        setCommentLoading(true);
        try {
            const c = await authApi<any>(`/posts/${id}/comments`, {
                method: "POST",
                body: JSON.stringify({ content: text.trim(), ...(parentId ? { parentId } : {}) }),
            });
            if (parentId) {
                setComments((prev) => prev.map((cm) =>
                    cm.id === parentId ? { ...cm, replies: [...(cm.replies ?? []), c] } : cm
                ));
                // Auto-expand so the new reply is visible
                setExpandedReplies((prev) => new Set(prev).add(parentId));
            } else {
                setComments((prev) => [{ ...c, replies: [] }, ...prev]);
            }
            setCommentText("");
            setReplyingTo(null);
            Keyboard.dismiss();
        } catch {
            Alert.alert(t.errorTitle, t.commentPostError);
        } finally {
            setCommentLoading(false);
        }
    }

    async function openScanner() {
        if (!cameraPermission?.granted) {
            const result = await requestCameraPermission();
            if (!result.granted) {
                Alert.alert(t.cameraAccessTitle, t.cameraAccessMsg);
                return;
            }
        }
        setCheckInStatus("idle");
        setScanning(false);
        setScannerOpen(true);
    }

    async function handleQrScan(data: string) {
        if (scanning) return;
        const parts = data.split(":");
        if (parts.length !== 3 || parts[0] !== "uevents-checkin" || parts[1] !== id) {
            setCheckInStatus("error");
            return;
        }
        setScanning(true);
        try {
            await authApi(`/posts/${id}/checkin`, {
                method: "POST",
                body: JSON.stringify({ token: parts[2] }),
            });
            setCheckInStatus("success");
        } catch (e: any) {
            setCheckInStatus(e?.message?.includes("409") ? "already" : "error");
        }
    }

    async function toggleRsvp() {
        if (guestGuard()) return;
        if (!id || rsvpLoading) return;
        setRsvpLoading(true);
        await ctxToggleRsvp(id);
        // Refresh the event so capacity, "going" count and waitlist position stay accurate.
        try {
            const fresh = await authApi<ApiEvent>(`/posts/${id}`);
            setEvent(fresh);
        } catch {}
        setRsvpLoading(false);
    }

    if (loading) {
        return (
            <SafeAreaView style={styles.page} edges={["top"]}>
                <PostDetailSkeleton />
            </SafeAreaView>
        );
    }

    if (!event) {
        return (
            <SafeAreaView style={styles.page} edges={["top"]}>
                {fetchError ? (
                    <ErrorRetry message="Couldn't load event" onRetry={() => loadEvent()} />
                ) : (
                    <View style={styles.loadingWrap}>
                        <Ionicons name="calendar-outline" size={40} color="#D1CBC3" />
                        <Text style={{ marginTop: 12, fontSize: 13, fontWeight: "900", color: "#D1CBC3", letterSpacing: 2 }}>
                            {t.eventNotFound}
                        </Text>
                        <Pressable
                            onPress={() => router.replace("/(tabs)" as any)}
                            style={{ marginTop: 16, backgroundColor: "#8C0327", paddingHorizontal: 24, paddingVertical: 10 }}
                        >
                            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }}>{t.goHome}</Text>
                        </Pressable>
                    </View>
                )}
            </SafeAreaView>
        );
    }

    const isPostOwner = session?.userType === "CLUB" && session?.userId === event?.club?.id;

    const like = resolveLike(id!, { liked: event.isLiked ?? false, count: event._count?.likes ?? 0 });
    const bm = resolveBookmark(id!, event.isBookmarked ?? false);
    const locale = pickLocale(event?.locales, lang);
    const title = locale.title ?? "Untitled Event";
    const body = locale.body ?? "";
    const imageUrl = locale.posterUrl ?? locale.imageUrl;
    const clubName = event?.club?.clubName?.toUpperCase() ?? "";
    const clubId = event?.club?.id ?? "";
    const location = event?.locationName ?? "";
    const date = fmtDate(event?.startAt, lang);
    const startTime = fmtTime(event?.startAt);
    const endTime = fmtTime(event?.endAt);
    const timeStr = startTime && endTime ? `${startTime} – ${endTime}` : startTime;
    const attendees = event?._count?.rsvps ?? 0;
    const capacity = event?.capacity ?? null;
    const isFull = capacity != null && attendees >= capacity;
    const isExpired = event?.expiresAt ? new Date(event.expiresAt) <= new Date() : false;
    const isPast = (() => {
        const end = event?.endAt ?? event?.startAt;
        if (!end) return false;
        const endDate = new Date(end);
        // If no endAt, treat event as lasting 2 hours
        if (!event?.endAt && event?.startAt) {
            return new Date(event.startAt).getTime() + 2 * 3600000 < Date.now();
        }
        return endDate < new Date();
    })();
    const rsvpClosed = event?.rsvpClosed ?? false;
    const rsvpRequiresApproval = event?.rsvpRequiresApproval ?? false;
    const pendingRsvp = (event?.pendingRsvp ?? false) || (id ? isWaitlisted(id) : false);
    const waitlistPosition = event?.waitlistPosition ?? null;
    const rsvpBlocked = isPast || rsvpClosed || isExpired || (isFull && !pendingRsvp);
    const rsvpPreview = event?.rsvpPreview ?? [];

    return (
        <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
            {/* ── Top bar ── */}
            <View style={styles.topBar}>
                <View style={styles.topBarRow}>
                    <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)} style={styles.backBtn} hitSlop={8} accessibilityLabel={t.goBackLabel} accessibilityRole="button">
                        <Ionicons name="arrow-back" size={18} color="#111827" />
                    </Pressable>
                    <View style={styles.topBarActions}>
                        {isPostOwner && event.isDraft && event.previewToken && (
                            <Pressable
                                onPress={() => Share.share({ message: `Preview this event: ${event.previewToken}` })}
                                style={styles.topBarBtn}
                                hitSlop={8}
                                accessibilityLabel="Share draft preview link"
                                accessibilityRole="button"
                            >
                                <Ionicons name="eye-outline" size={19} color="#D97706" />
                            </Pressable>
                        )}
                        <Pressable onPress={() => Share.share({ title, message: `${title}\n\n${API_BASE}/share/event/${id}` })} style={styles.topBarBtn} hitSlop={8} accessibilityLabel={t.shareEventLabel} accessibilityRole="button">
                            <Ionicons name="share-outline" size={19} color="#111827" />
                        </Pressable>
                        {isPostOwner ? (
                            <>
                                <Pressable
                                    style={styles.topBarBtn}
                                    hitSlop={8}
                                    onPress={() => router.push({ pathname: "/post-analytics/[id]", params: { id } } as any)}
                                    accessibilityLabel="View event analytics"
                                    accessibilityRole="button"
                                >
                                    <Ionicons name="bar-chart-outline" size={19} color="#111827" />
                                </Pressable>
                                <Pressable
                                    style={styles.topBarBtn}
                                    hitSlop={8}
                                    onPress={() => router.push({ pathname: "/edit/[id]", params: { id } } as any)}
                                    accessibilityLabel={t.editEventLabel}
                                    accessibilityRole="button"
                                >
                                    <Ionicons name="create-outline" size={19} color="#111827" />
                                </Pressable>
                            </>
                        ) : (
                            <>
                                <Pressable
                                    onPress={() => toggleLikeCtx(id!, like)}
                                    style={[styles.topBarBtn, { flexDirection: "row", alignItems: "center", gap: 4 }]}
                                    hitSlop={8}
                                    accessibilityLabel={like.liked ? "Unlike event" : "Like event"}
                                    accessibilityRole="button"
                                >
                                    <Ionicons name={like.liked ? "heart" : "heart-outline"} size={20} color="#8C0327" />
                                    {like.count > 0 && !event.hideLikeCount && (
                                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#8C0327" }}>{like.count}</Text>
                                    )}
                                </Pressable>
                                <Pressable
                                    onPress={() => toggleBookmarkCtx(id!, bm)}
                                    style={styles.topBarBtn}
                                    hitSlop={8}
                                    accessibilityLabel={bm ? "Remove bookmark" : "Bookmark event"}
                                    accessibilityRole="button"
                                >
                                    <Ionicons name={bm ? "bookmark" : "bookmark-outline"} size={19} color="#8C0327" />
                                </Pressable>
                                <Pressable
                                    style={styles.topBarBtn}
                                    hitSlop={8}
                                    onPress={() => reportPost()}
                                    accessibilityLabel={t.reportEventLabel}
                                    accessibilityRole="button"
                                >
                                    <Ionicons name="flag-outline" size={19} color="#9CA3AF" />
                                </Pressable>
                            </>
                        )}
                    </View>
                </View>
                <Text style={styles.topBarLabel}>{t.eventDetails}</Text>
                <Text style={styles.topBarHeading} numberOfLines={2}>{title.toUpperCase()}</Text>
                <View style={styles.topBarAccent} />
                {((event.categories ?? []).length > 0 || !!event.freeFood || !!event.seriesId || event.followersOnly) && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.tagScroll}
                        contentContainerStyle={styles.tagScrollContent}
                    >
                        {(event.categories ?? []).map((cat) => (
                            <View key={cat} style={styles.categoryPill}>
                                <Text style={styles.categoryPillText}>{translateCategory(cat, lang).toUpperCase()}</Text>
                            </View>
                        ))}
                        {!!event.freeFood && (
                            <View style={[styles.categoryPill, styles.freeFoodPill]}>
                                <Text style={{ fontSize: 9 }}>🍕</Text>
                                <Text style={[styles.categoryPillText, styles.freeFoodPillText]}>{t.freeFoodBadge}</Text>
                            </View>
                        )}
                        {!!event.seriesId && (
                            <View style={[styles.categoryPill, styles.recurringPill]}>
                                <Ionicons name="repeat" size={9} color="#8C0327" />
                                <Text style={[styles.categoryPillText, styles.recurringPillText]}>{t.recurringEventBadge}</Text>
                            </View>
                        )}
                        {event.followersOnly && (
                            <View style={[styles.categoryPill, styles.followersOnlyPill]}>
                                <Ionicons name="people" size={9} color="#1D4ED8" />
                                <Text style={[styles.categoryPillText, styles.followersOnlyPillText]}>{t.followersOnlyBadge}</Text>
                            </View>
                        )}
                    </ScrollView>
                )}
            </View>

            {/* Expiry banner */}
            {isExpired && (
                <View style={styles.expiryBanner}>
                    <Ionicons name="archive-outline" size={14} color="#9CA3AF" />
                    <Text style={styles.expiryBannerText}>{t.postExpired}</Text>
                </View>
            )}
            {!isExpired && event.expiresAt && (
                <View style={[styles.expiryBanner, styles.expiryBannerWarn]}>
                    <Ionicons name="time-outline" size={14} color="#D97706" />
                    <Text style={[styles.expiryBannerText, styles.expiryBannerWarnText]}>
                        EXPIRES {new Date(event.expiresAt).toLocaleDateString(localeFor(lang), { month: "short", day: "numeric" }).toUpperCase()}
                    </Text>
                </View>
            )}

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}>
            <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} style={{ backgroundColor: C.bg }} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadEvent(true)} tintColor="#8C0327" />}>
                {/* ── Hero image ── */}
                {(event?.images?.length ?? 0) > 1 ? (
                    <View style={{ marginHorizontal: 12 }}>
                        <FlatList
                            data={event!.images}
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            keyExtractor={(_, i) => String(i)}
                            onScroll={(e) => {
                                const idx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
                                setCarouselIndex(idx);
                            }}
                            scrollEventThrottle={16}
                            renderItem={({ item }) => (
                                <View style={[styles.hero, { width: screenWidth - 24, height: screenWidth - 24 }]}>
                                    <ExpoImage source={{ uri: item }} style={StyleSheet.absoluteFill as any} contentFit="cover" transition={200} />
                                </View>
                            )}
                        />
                        <View style={styles.carouselCounter}>
                            <Text style={styles.carouselCounterText}>{carouselIndex + 1} / {event!.images!.length}</Text>
                        </View>
                    </View>
                ) : (
                <View style={[styles.hero, { height: screenWidth - 24, marginHorizontal: 12 }]}>
                    {imageUrl && !heroImageFailed ? (
                        <ExpoImage source={{ uri: imageUrl }} style={StyleSheet.absoluteFill as any} contentFit="cover" transition={200} onError={() => setHeroImageFailed(true)} accessibilityLabel={`${title} event poster`} accessibilityRole="image" />
                    ) : (
                        <View style={[StyleSheet.absoluteFill as any, styles.heroPlaceholder]} />
                    )}
                    {isLive(event?.startAt, event?.endAt) && (
                        <View style={styles.heroBottom}>
                            <View style={styles.liveBadgeRow}>
                                <View style={styles.liveBadge}>
                                    <View style={styles.liveDot} />
                                    <Text style={styles.liveBadgeText}>{t.liveEvent}</Text>
                                </View>
                                {!!liveCountdown && (
                                    <View style={styles.liveCountdownBadge}>
                                        <Text style={styles.liveCountdownText}>{liveCountdown}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}
                </View>
                )}

                {/* ── Organizer + Date/Time + Location card ── */}
                <View style={styles.card}>
                    {!!clubName && (
                        <Pressable style={styles.organizerRow} onPress={() => router.push(`/club/${clubId}` as any)}>
                            <View style={styles.organizerAvatar}>
                                {event?.club?.logoUrl
                                    ? <ExpoImage source={{ uri: event.club.logoUrl }} style={styles.organizerAvatarImg} contentFit="cover" transition={200} />
                                    : <Ionicons name="people" size={15} color="#fff" />
                                }
                            </View>
                            <View>
                                <Text style={styles.organizedByLabel}>{t.organizedBy}</Text>
                                <Text style={styles.organizerName}>{clubName}</Text>
                            </View>
                        </Pressable>
                    )}

                    <View style={styles.hairline} />

                    <View style={styles.dateTimeRow}>
                        <View style={styles.dateTimeCol}>
                            <Text style={styles.dateTimeLabel}>{t.date}</Text>
                            <Text style={styles.dateTimeValue}>{date || "—"}</Text>
                        </View>
                        <View style={styles.dateTimeDivider} />
                        <View style={styles.dateTimeCol}>
                            <Text style={styles.dateTimeLabel}>{t.time}</Text>
                            <Text style={styles.dateTimeValue}>{timeStr || "—"}</Text>
                        </View>
                    </View>

                    {!!location && (
                        <>
                            <View style={styles.hairline} />
                            <Pressable style={styles.locationRow} onPress={() => openMaps(event?.address || location)} accessibilityRole="button" accessibilityLabel={t.getDirectionsLabel}>
                                <Ionicons name="location-outline" size={16} color="#8C0327" style={{ marginTop: 2 }} />
                                <View style={{ flex: 1, gap: 2 }}>
                                    <Text style={styles.locationLabel}>{t.location}</Text>
                                    <Text style={styles.locationName}>{location.toUpperCase()}</Text>
                                    {!!event?.address && <Text style={styles.locationSub}>{event.address}</Text>}
                                    <Text style={styles.directionsLink}>{t.getDirections} ↗</Text>
                                </View>
                                <Ionicons name="navigate-outline" size={16} color="#8C0327" />
                            </Pressable>
                        </>
                    )}
                </View>

                {/* ── Event briefing card ── */}
                {!!body && (
                    <View style={[styles.card, styles.briefingSection]}>
                        <Text style={styles.sectionLabel}>{t.eventBriefing}</Text>
                        <Text style={styles.briefingHeadline}>{title.toUpperCase()}</Text>
                        <Text style={styles.briefingBody}>{body}</Text>
                    </View>
                )}

                {/* ── RSVP card ── */}
                <View style={styles.card}>
                    {/* Attendee row — hidden when hideAttendeeList is set (non-owners) */}
                    {attendees > 0 && !event.hideRsvpCount && (!event.hideAttendeeList || isPostOwner) && (
                        <View style={styles.goingRow}>
                            <View style={styles.goingAvatars}>
                                {rsvpPreview.map((u, i) => (
                                    <View key={u.id} style={[styles.goingAvatar, { marginLeft: i === 0 ? 0 : -10, zIndex: rsvpPreview.length - i }]}>
                                        {u.avatarUrl
                                            ? <ExpoImage source={{ uri: u.avatarUrl }} style={styles.goingAvatarImg} contentFit="cover" transition={200} />
                                            : <Text style={styles.goingAvatarText}>{(u.firstName ?? "?").charAt(0).toUpperCase()}</Text>}
                                    </View>
                                ))}
                            </View>
                            {!event.hideRsvpCount && (
                                <Text style={styles.goingLabel}>
                                    <Text style={styles.goingCount}>{attendees}</Text>
                                    {attendees === 1 ? " person going" : " people going"}
                                </Text>
                            )}
                        </View>
                    )}
                    {event.hideAttendeeList && !isPostOwner && attendees > 0 && !event.hideRsvpCount && (
                        <Text style={styles.hiddenListNote}>{t.attendeeListPrivate}</Text>
                    )}
                    {capacity != null && !event.hideRsvpCount && (
                        <View style={styles.capacityWrap}>
                            <View style={styles.capacityBarTrack}>
                                <View style={[
                                    styles.capacityBarFill,
                                    { width: `${Math.min((attendees / capacity) * 100, 100)}%` },
                                    isFull && styles.capacityBarFull,
                                ]} />
                            </View>
                            <Text style={styles.capacityText}>
                                {t.spotsFilled(attendees, capacity!)}
                            </Text>
                        </View>
                    )}
                    <View style={styles.ctaSection}>
                        {/* Check in — anyone (RSVP'd or walk-in) scans the club's QR to confirm attendance */}
                        {!isPostOwner && !isExpired && !isPast && (
                            <Pressable style={styles.checkInBtn} onPress={openScanner} accessibilityRole="button" accessibilityLabel={t.checkInBtn}>
                                <Ionicons name="qr-code-outline" size={16} color="#fff" />
                                <Text style={styles.checkInBtnText}>{t.checkInBtn}</Text>
                            </Pressable>
                        )}
                        {/* RSVP button — adapts to closed/approval/waitlist states */}
                        {rsvpBlocked && !isRsvped(id!) ? (
                            <View style={[styles.rsvpBtn, styles.rsvpBtnClosed]}>
                                <Ionicons name="ban-outline" size={17} color="#9CA3AF" />
                                <Text style={[styles.rsvpBtnText, styles.rsvpBtnTextClosed]}>
                                    {isPast ? "EVENT ENDED" : rsvpClosed ? "RSVP CLOSED" : isExpired ? "EVENT EXPIRED" : "SOLD OUT"}
                                </Text>
                            </View>
                        ) : (
                        <Pressable
                            style={[
                                styles.rsvpBtn,
                                isRsvped(id!) && styles.rsvpBtnDone,
                                pendingRsvp && styles.rsvpBtnPending,
                            ]}
                            onPress={toggleRsvp}
                            disabled={rsvpLoading}
                            accessibilityRole="button"
                            accessibilityLabel={
                                isRsvped(id!) ? "Cancel RSVP"
                                : pendingRsvp ? "Leave waitlist"
                                : rsvpRequiresApproval ? "Request to attend"
                                : "RSVP to event"
                            }
                        >
                            {rsvpLoading ? (
                                <ActivityIndicator color={isRsvped(id!) ? "#8C0327" : "#fff"} />
                            ) : (
                                <>
                                    <Ionicons
                                        name={
                                            isRsvped(id!) ? "checkmark-circle"
                                            : pendingRsvp ? "hourglass-outline"
                                            : rsvpRequiresApproval ? "shield-checkmark-outline"
                                            : "ticket-outline"
                                        }
                                        size={17}
                                        color={isRsvped(id!) ? "#8C0327" : pendingRsvp ? "#92400E" : "#fff"}
                                    />
                                    <Text style={[
                                        styles.rsvpBtnText,
                                        isRsvped(id!) && styles.rsvpBtnTextDone,
                                        pendingRsvp && styles.rsvpBtnTextWaitlist,
                                    ]}>
                                        {isRsvped(id!) ? t.youreGoing
                                            : pendingRsvp ? "ON WAITLIST"
                                            : rsvpRequiresApproval ? "REQUEST TO ATTEND"
                                            : t.rsvpNow}
                                    </Text>
                                </>
                            )}
                        </Pressable>
                        )}
                        {pendingRsvp && waitlistPosition != null && (
                            <View style={styles.waitlistPosRow}>
                                <Ionicons name="people-outline" size={14} color="#92400E" />
                                <Text style={styles.waitlistPosText}>
                                    {waitlistPosition === 1 ? "You're next in line" : `#${waitlistPosition} in line`}
                                </Text>
                            </View>
                        )}
                        <Pressable
                            style={styles.calendarBtn}
                            onPress={handleCalendarPress}
                            accessibilityRole="button"
                            accessibilityLabel={calNeedsUpdate ? "Update calendar entry" : calEntry ? "Already in calendar" : "Add to calendar"}
                        >
                            <Ionicons name={calNeedsUpdate ? "sync-outline" : calEntry ? "checkmark-circle-outline" : "calendar-outline"} size={16} color={calNeedsUpdate ? "#8C0327" : "#374151"} />
                            <Text style={styles.calendarBtnText}>{calNeedsUpdate ? t.updateCalendar : calEntry ? t.inCalendar : t.addToCalendar}</Text>
                        </Pressable>
                        {!isPast && !isExpired && (
                            <Pressable
                                style={[styles.remindBtn, hasReminder && styles.remindBtnActive]}
                                onPress={async () => { await handleCalendarPress(); setHasReminder(true); }}
                            >
                                <Ionicons
                                    name={hasReminder ? "notifications" : "notifications-outline"}
                                    size={16}
                                    color={hasReminder ? "#8C0327" : "#374151"}
                                />
                                <Text style={[styles.remindBtnText, hasReminder && styles.remindBtnTextActive]}>
                                    {hasReminder ? t.reminderSet : t.remindMe}
                                </Text>
                            </Pressable>
                        )}
                    </View>
                </View>

                {/* ── Post-event recap ── */}
                {isPast && recap && (
                    <View style={styles.recapSection} onLayout={(e) => { recapSectionY.current = e.nativeEvent.layout.y; }}>
                        <Text style={styles.recapEyebrow}>{t.eventRecapLabel}</Text>
                        <View style={styles.recapAccent} />
                        {!recap.visible ? (
                            <Text style={styles.recapEmpty}>{t.recapPrivateMsg}</Text>
                        ) : (
                            <>
                                <View style={styles.recapRatingRow}>
                                    {recap.avgRating != null ? (
                                        <>
                                            <Text style={styles.recapAvg}>{recap.avgRating.toFixed(1)}</Text>
                                            <View style={{ flexDirection: "row", gap: 2 }}>
                                                {[1, 2, 3, 4, 5].map((i) => (
                                                    <Ionicons key={i} name={i <= Math.round(recap.avgRating!) ? "star" : "star-outline"} size={14} color="#A8763E" />
                                                ))}
                                            </View>
                                            <Text style={styles.recapCount}>({recap.ratingCount})</Text>
                                        </>
                                    ) : (
                                        <Text style={styles.recapCount}>{t.noRatingsYet}</Text>
                                    )}
                                </View>

                                {recap.canContribute && (
                                    <View style={styles.recapRateBox}>
                                        <Text style={styles.recapRateLabel}>{recap.myRating ? "YOUR RATING" : "HOW WAS IT?"}</Text>
                                        <View style={{ flexDirection: "row", gap: 8 }}>
                                            {[1, 2, 3, 4, 5].map((i) => (
                                                <Pressable key={i} onPress={() => submitRating(i)} hitSlop={4} accessibilityRole="button" accessibilityLabel={`Rate ${i} ${i === 1 ? "star" : "stars"}`}>
                                                    <Ionicons name={recap.myRating && i <= recap.myRating ? "star" : "star-outline"} size={30} color="#A8763E" />
                                                </Pressable>
                                            ))}
                                        </View>
                                    </View>
                                )}

                                {(recap.photos ?? []).length === 0 ? (
                                    <Pressable
                                        onPress={recap.canContribute ? addRecapPhoto : undefined}
                                        disabled={!recap.canContribute || recapUploading}
                                        style={styles.recapEmptyBox}
                                        accessibilityRole={recap.canContribute ? "button" : undefined}
                                        accessibilityLabel={recap.canContribute ? "Add the first photos" : undefined}
                                    >
                                        <Ionicons name="camera-outline" size={30} color={C.textMuted} />
                                        <Text style={styles.recapEmptyTitle}>{recap.canContribute ? "No photos yet — were you there?" : "No photos yet"}</Text>
                                        {recap.canContribute && (
                                            <Text style={styles.recapEmptySub}>Be the first to add photos from {title}.</Text>
                                        )}
                                        {recap.canContribute && (
                                            <View style={styles.recapEmptyBtn}>
                                                <Ionicons name={recapUploading ? "hourglass-outline" : "add"} size={15} color="#fff" />
                                                <Text style={styles.recapEmptyBtnText}>{recapUploading ? "ADDING…" : "ADD PHOTOS"}</Text>
                                            </View>
                                        )}
                                    </Pressable>
                                ) : (
                                    <>
                                    <View style={styles.recapPhotosHeader}>
                                        <Text style={styles.recapPhotosLabel}>{t.photosLabel}</Text>
                                        {recap.canContribute && (
                                            <Pressable onPress={addRecapPhoto} disabled={recapUploading} style={styles.recapAddBtn} accessibilityRole="button" accessibilityLabel="Add a photo">
                                                <Ionicons name="camera-outline" size={14} color="#8C0327" />
                                                <Text style={styles.recapAddText}>{recapUploading ? "ADDING…" : "ADD PHOTO"}</Text>
                                            </Pressable>
                                        )}
                                    </View>
                                    {recap.isClubOwner && (recap.pendingPhotoCount ?? 0) > 0 && (
                                        <Text style={styles.recapPendingNote}>
                                            {recap.pendingPhotoCount} {recap.pendingPhotoCount === 1 ? "photo" : "photos"} awaiting your review
                                        </Text>
                                    )}
                                    <View style={styles.recapGrid}>
                                        {recap.photos!.map((p) => (
                                            <View key={p.id} style={styles.recapThumbWrap}>
                                                <ExpoImage source={{ uri: p.url }} style={styles.recapThumb} contentFit="cover" transition={150} accessibilityLabel={`Recap photo by ${p.by}`} />
                                                {p.status === "PENDING" && !p.canModerate && (
                                                    <View style={styles.recapPendingBadge}>
                                                        <Ionicons name="time-outline" size={11} color="#fff" />
                                                        <Text style={styles.recapPendingText}>{t.recapPendingBadge}</Text>
                                                    </View>
                                                )}
                                                {p.canModerate ? (
                                                    <View style={styles.recapModRow}>
                                                        <Pressable onPress={() => moderateRecapPhoto(p.id, "approve")} hitSlop={6} style={[styles.recapModBtn, styles.recapApproveBtn]} accessibilityRole="button" accessibilityLabel="Approve photo">
                                                            <Ionicons name="checkmark" size={13} color="#fff" />
                                                        </Pressable>
                                                        <Pressable onPress={() => moderateRecapPhoto(p.id, "reject")} hitSlop={6} style={[styles.recapModBtn, styles.recapRejectBtn]} accessibilityRole="button" accessibilityLabel="Reject photo">
                                                            <Ionicons name="close" size={13} color="#fff" />
                                                        </Pressable>
                                                    </View>
                                                ) : p.canDelete && (
                                                    <Pressable onPress={() => deleteRecapPhoto(p.id)} hitSlop={6} style={styles.recapDelete} accessibilityRole="button" accessibilityLabel="Remove photo">
                                                        <Ionicons name="close" size={12} color="#fff" />
                                                    </Pressable>
                                                )}
                                            </View>
                                        ))}
                                    </View>
                                    </>
                                )}
                            </>
                        )}
                    </View>
                )}

                {/* ── Recommended card — hidden for post owner ── */}
                {!isPostOwner && <View style={styles.card}>
                    <View style={styles.recommendedHeader}>
                        <View>
                            <Text style={styles.recommendedLabel}>{t.recommended}</Text>
                            <Text style={styles.recommendedTitle}>{t.happeningSoon}</Text>
                        </View>
                        <Pressable onPress={() => router.push("/(tabs)/search" as any)}>
                            <Text style={styles.viewAllText}>{t.viewAll}</Text>
                        </Pressable>
                    </View>
                    {recommended.length === 0 ? (
                        <Text style={{ fontSize: 13, color: "#9CA3AF" }}>{t.noUpcomingEvents}</Text>
                    ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recommendedScroll}>
                        {recommended.map((rec) => {
                            const recLocale = pickLocale(rec.locales, lang);
                            const recTitle = recLocale.title ?? "Untitled Event";
                            const recDate = rec.startAt
                                ? new Date(rec.startAt).toLocaleDateString(localeFor(lang), { month: "short", day: "numeric" }).toUpperCase()
                                : "";
                            const recAttending = rec._count?.rsvps ?? 0;
                            const recClub = (rec.clubName ?? rec.club?.clubName ?? "EVENT").toUpperCase();
                            const recImageUrl = recLocale.posterUrl ?? recLocale.imageUrl;
                            return (
                                <Pressable
                                    key={rec.id}
                                    style={styles.recCard}
                                    onPress={() => router.push({ pathname: "/event/[id]", params: { id: rec.id } })}
                                >
                                    <View style={styles.recImageWrap}>
                                        {recImageUrl
                                            ? <ExpoImage source={{ uri: recImageUrl }} style={StyleSheet.absoluteFill as any} contentFit="cover" transition={200} />
                                            : <View style={[StyleSheet.absoluteFill as any, { backgroundColor: "#2a2a2a" }]} />
                                        }
                                    </View>
                                    <View style={styles.recInfo}>
                                        <Text style={styles.recCategory}>{recClub}</Text>
                                        <Text style={styles.recTitle} numberOfLines={2}>{recTitle.toUpperCase()}</Text>
                                        <View style={styles.recMeta}>
                                            {!!recDate && <>
                                                <Ionicons name="calendar-outline" size={11} color="#9CA3AF" />
                                                <Text style={styles.recMetaText}>{recDate}</Text>
                                            </>}
                                            {recAttending > 0 && <>
                                                <Ionicons name="people-outline" size={11} color="#9CA3AF" />
                                                <Text style={styles.recMetaText}>{recAttending} GOING</Text>
                                            </>}
                                        </View>
                                    </View>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                    )}
                </View>}

                    {/* ── Check-in banner (owner only) ── */}
                    {isPostOwner && (
                        <View style={[styles.card, { padding: 0, overflow: "hidden" }]}>
                            <Pressable
                                style={styles.checkInBanner}
                                onPress={() => router.push({ pathname: "/checkin/[id]", params: { id } } as any)}
                            >
                                <View style={styles.checkInBannerLeft}>
                                    <Ionicons name="qr-code" size={28} color="#fff" />
                                </View>
                                <View style={styles.checkInBannerBody}>
                                    <Text style={styles.checkInBannerTitle}>{t.checkInMode}</Text>
                                    <Text style={styles.checkInBannerSub}>{t.checkInSub}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
                            </Pressable>
                        </View>
                    )}

                    {/* ── Comments ── */}
                    <View style={[styles.card, styles.commentsSection]} onLayout={(e) => { commentsSectionY.current = e.nativeEvent.layout.y; }}>
                        <Text style={styles.sectionLabel}>{t.comments}</Text>
                        <Text style={styles.commentsCount}>
                            {t.commentCount(comments.length)}
                        </Text>

                        {/* Filter + sort row */}
                        {comments.length > 0 && (
                            <View style={styles.commentControls}>
                                <View style={styles.commentFilters}>
                                    {(["all", "clubs", "students"] as const).map((f) => (
                                        <Pressable
                                            key={f}
                                            style={[styles.filterPill, commentFilter === f && styles.filterPillActive]}
                                            onPress={() => setCommentFilter(f)}
                                        >
                                            <Text style={[styles.filterPillText, commentFilter === f && styles.filterPillTextActive]}>
                                                {f === "all" ? t.all : f === "clubs" ? t.clubs : t.students}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                                <Pressable
                                    style={styles.sortToggle}
                                    onPress={() => setCommentSort((s) => s === "newest" ? "oldest" : "newest")}
                                >
                                    <Ionicons name="swap-vertical-outline" size={13} color="#6B7280" />
                                    <Text style={styles.sortToggleText}>{commentSort === "newest" ? t.newest : t.oldest}</Text>
                                </Pressable>
                            </View>
                        )}

                        {(() => {
                            const filtered = comments
                                .filter((c) => {
                                    if (commentFilter === "clubs") return c.user?.type === "CLUB";
                                    if (commentFilter === "students") return c.user?.type !== "CLUB";
                                    return true;
                                })
                                .sort((a, b) => {
                                    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                                    return commentSort === "newest" ? -diff : diff;
                                });

                            if (filtered.length === 0) {
                                return (
                                    <View style={styles.commentsEmpty}>
                                        <Text style={styles.commentsEmptyText}>
                                            {comments.length === 0 ? t.beFirstToComment : t.noMatchFilter}
                                        </Text>
                                    </View>
                                );
                            }

                            return filtered.map((c) => {
                                const name = c.user?.type === "CLUB"
                                    ? c.user.clubName
                                    : [c.user?.firstName, c.user?.lastName].filter(Boolean).join(" ") || "Student";
                                const avatar = c.user?.avatarUrl ?? c.user?.logoUrl;
                                const isClub = c.user?.type === "CLUB";
                                return (
                                    <View key={c.id} style={styles.commentRow} onLayout={(e) => { commentLayouts.current[c.id] = e.nativeEvent.layout.y; }}>
                                        {highlightedComment === c.id && (
                                            <Animated.View
                                                pointerEvents="none"
                                                style={{
                                                    position: "absolute", top: 0, bottom: 0, left: -16, right: -16,
                                                    backgroundColor: highlightAnim.interpolate({ inputRange: [0, 1], outputRange: [`${C.primaryBg}00`, C.primaryBg] }),
                                                }}
                                            />
                                        )}
                                        <View style={[styles.commentAvatar, isClub && styles.commentAvatarClub]}>
                                            {avatar
                                                ? <ExpoImage source={{ uri: avatar }} style={styles.commentAvatarImg} contentFit="cover" transition={200} />
                                                : <Text style={styles.commentAvatarText}>{name.charAt(0).toUpperCase()}</Text>}
                                        </View>
                                        <View style={styles.commentBody}>
                                            <View style={styles.commentMeta}>
                                                <Text style={styles.commentName}>{name}</Text>
                                                {isClub && <View style={styles.clubBadge}><Text style={styles.clubBadgeText}>{t.clubBadge}</Text></View>}
                                                <Text style={styles.commentTime}>{timeAgo(c.createdAt, lang)}</Text>
                                                <View style={{ flexDirection: "row", gap: 10, marginLeft: "auto" }}>
                                                    {!isPostOwner && (
                                                        <Pressable onPress={() => reportComment(c.id)} hitSlop={8}
                                                            accessibilityRole="button" accessibilityLabel="Report comment">
                                                            <Ionicons name="flag-outline" size={13} color="#9CA3AF" />
                                                        </Pressable>
                                                    )}
                                                    {isPostOwner && (
                                                        <Pressable onPress={() => deleteComment(c.id)} hitSlop={8} accessibilityLabel="Delete comment" accessibilityRole="button">
                                                            <Ionicons name="trash-outline" size={13} color="#9CA3AF" />
                                                        </Pressable>
                                                    )}
                                                </View>
                                            </View>
                                            <Text style={styles.commentText}>{c.content}</Text>
                                            {/* Reply / expand row */}
                                            <View style={styles.replyActionRow}>
                                                <Pressable onPress={() => { setReplyingTo(c.id); requestAnimationFrame(() => commentInputRef.current?.focus()); }}>
                                                    <Text style={[styles.replyBtn, replyingTo === c.id && styles.replyBtnActive]}>
                                                        {t.reply}
                                                    </Text>
                                                </Pressable>
                                                {(c.replies ?? []).length > 0 && (
                                                    <Pressable onPress={() => setExpandedReplies((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                                                        return next;
                                                    })}>
                                                        <Text style={styles.replyToggle}>
                                                            {expandedReplies.has(c.id)
                                                                ? "▲ HIDE REPLIES"
                                                                : `▼ ${c.replies.length} ${c.replies.length === 1 ? "REPLY" : "REPLIES"}`}
                                                        </Text>
                                                    </Pressable>
                                                )}
                                            </View>

                                            {/* Replies — collapsed by default */}
                                            {expandedReplies.has(c.id) && (c.replies ?? []).map((r: any) => {
                                                const rName = r.user?.type === "CLUB"
                                                    ? r.user.clubName
                                                    : [r.user?.firstName, r.user?.lastName].filter(Boolean).join(" ") || "Student";
                                                const rAvatar = r.user?.avatarUrl ?? r.user?.logoUrl;
                                                const rIsClub = r.user?.type === "CLUB";
                                                return (
                                                    <View key={r.id} style={styles.replyRow}>
                                                        <View style={[styles.replyAvatar, rIsClub && styles.commentAvatarClub]}>
                                                            {rAvatar
                                                                ? <ExpoImage source={{ uri: rAvatar }} style={styles.replyAvatarImg} contentFit="cover" transition={200} />
                                                                : <Text style={styles.replyAvatarText}>{rName.charAt(0).toUpperCase()}</Text>}
                                                        </View>
                                                        <View style={styles.commentBody}>
                                                            <View style={styles.commentMeta}>
                                                                <Text style={styles.commentName}>{rName}</Text>
                                                                {rIsClub && <View style={styles.clubBadge}><Text style={styles.clubBadgeText}>{t.clubBadge}</Text></View>}
                                                                <Text style={styles.commentTime}>{timeAgo(r.createdAt, lang)}</Text>
                                                                <View style={{ flexDirection: "row", gap: 10, marginLeft: "auto" }}>
                                                                    {!isPostOwner && (
                                                                        <Pressable onPress={() => reportComment(r.id)} hitSlop={8}
                                                                            accessibilityRole="button" accessibilityLabel="Report reply">
                                                                            <Ionicons name="flag-outline" size={12} color="#9CA3AF" />
                                                                        </Pressable>
                                                                    )}
                                                                    {isPostOwner && (
                                                                        <Pressable onPress={() => deleteComment(r.id, c.id)} hitSlop={8} accessibilityLabel="Delete reply" accessibilityRole="button">
                                                                            <Ionicons name="trash-outline" size={12} color="#9CA3AF" />
                                                                        </Pressable>
                                                                    )}
                                                                </View>
                                                            </View>
                                                            <Text style={styles.commentText}>{r.content}</Text>
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                );
                            });
                        })()}
                    </View>

            </ScrollView>

            {/* ── Comment composer (single bar; shows a banner when replying) ── */}
            <View>
                {replyingTo && (() => {
                    const rc = comments.find((cm) => cm.id === replyingTo);
                    const rcName = rc
                        ? (rc.user?.type === "CLUB"
                            ? rc.user.clubName
                            : [rc.user?.firstName, rc.user?.lastName].filter(Boolean).join(" ") || "Student")
                        : "";
                    return (
                        <View style={styles.replyingBanner}>
                            <Text style={styles.replyingBannerText} numberOfLines={1}>{t.replyingTo(rcName)}</Text>
                            <Pressable onPress={() => setReplyingTo(null)} hitSlop={10} accessibilityLabel={t.cancel} accessibilityRole="button">
                                <Ionicons name="close" size={18} color={C.textFaint} />
                            </Pressable>
                        </View>
                    );
                })()}
                <View style={styles.commentBar}>
                    <TextInput
                        ref={commentInputRef}
                        style={styles.commentInput}
                        placeholder={t.addCommentPlaceholder}
                        placeholderTextColor="#9CA3AF"
                        value={commentText}
                        onChangeText={setCommentText}
                        onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                        multiline
                        maxLength={500}
                        autoCorrect
                        spellCheck
                        autoCapitalize="sentences"
                    />
                    <Pressable
                        style={[styles.commentSend, !commentText.trim() && { opacity: 0.4 }]}
                        onPress={() => submitComment()}
                        disabled={!commentText.trim() || commentLoading}
                        accessibilityLabel={replyingTo ? "Send reply" : "Send comment"}
                        accessibilityRole="button"
                    >
                        {commentLoading
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Ionicons name="send" size={15} color="#fff" />}
                    </Pressable>
                </View>
            </View>
            </KeyboardAvoidingView>

            {/* ── Attendance check-in scanner ── */}
            <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
                <SafeAreaView style={styles.scannerSafe} edges={["top"]}>
                    <View style={styles.scannerTopBar}>
                        <Pressable onPress={() => setScannerOpen(false)} style={styles.scannerClose} hitSlop={8} accessibilityLabel={t.closeScannerLabel} accessibilityRole="button">
                            <Ionicons name="close" size={22} color="#fff" />
                        </Pressable>
                        <Text style={styles.scannerTitle}>{t.scanCheckInCode}</Text>
                        <View style={{ width: 36 }} />
                    </View>

                    {checkInStatus === "idle" || checkInStatus === "error" ? (
                        <CameraView
                            style={styles.scanner}
                            facing="back"
                            onBarcodeScanned={scanning ? undefined : ({ data }) => handleQrScan(data)}
                        >
                            <View style={styles.scannerOverlay}>
                                <View style={styles.scannerFrame} />
                                <Text style={styles.scannerHint}>
                                    {checkInStatus === "error"
                                        ? "Invalid code — make sure you're scanning the right event"
                                        : "Point your camera at the club's check-in QR code"}
                                </Text>
                            </View>
                        </CameraView>
                    ) : (
                        <View style={styles.scannerResult}>
                            <Ionicons
                                name={checkInStatus === "success" ? "checkmark-circle" : "information-circle"}
                                size={72}
                                color={checkInStatus === "success" ? "#16A34A" : C.textLight}
                            />
                            <Text style={styles.scannerResultTitle}>
                                {checkInStatus === "success" ? "CHECKED IN!" : "ALREADY CHECKED IN"}
                            </Text>
                            <Text style={styles.scannerResultSub}>
                                {checkInStatus === "success"
                                    ? "You're officially on the attendance list."
                                    : "You already checked in to this event."}
                            </Text>
                            <Pressable style={styles.scannerDoneBtn} onPress={() => setScannerOpen(false)}>
                                <Text style={styles.scannerDoneBtnText}>{t.done}</Text>
                            </Pressable>
                        </View>
                    )}
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (C: AppColors) => StyleSheet.create({
    page: { flex: 1, backgroundColor: C.bg },
    loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    scrollContent: { paddingBottom: 32, gap: 8, paddingTop: 0 },
    card: { backgroundColor: C.surface, marginLeft: 12, marginRight: 12, overflow: "hidden", borderWidth: 1, borderColor: C.borderWarm },

    // Check-in button + scanner
    checkInBtn: {
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
        backgroundColor: "#1F2937", paddingVertical: 14, marginBottom: 8,
    },
    checkInBtnText: { fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 1.5 },
    scannerSafe: { flex: 1, backgroundColor: "#000" },
    scannerTopBar: {
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingHorizontal: 16, paddingVertical: 12,
    },
    scannerClose: { width: 36, alignItems: "flex-start" },
    scannerTitle: { fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 2 },
    scanner: { flex: 1 },
    scannerOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 32 },
    scannerFrame: { width: 240, height: 240, borderWidth: 3, borderColor: "#fff", borderRadius: 4 },
    scannerHint: { fontSize: 13, color: "rgba(255,255,255,0.7)", textAlign: "center", paddingHorizontal: 40, lineHeight: 20 },
    scannerResult: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 40 },
    scannerResultTitle: { fontSize: 24, fontWeight: "900", color: "#fff", letterSpacing: 1 },
    scannerResultSub: { fontSize: 14, color: "rgba(255,255,255,0.6)", textAlign: "center", lineHeight: 22 },
    scannerDoneBtn: { backgroundColor: "#fff", paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
    scannerDoneBtnText: { fontSize: 12, fontWeight: "800", color: "#111827", letterSpacing: 2 },

    // Top bar
    topBar: {
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 20,
        backgroundColor: C.bg,
    },
    topBarRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
    },
    backBtn: { padding: 8, marginLeft: -8 },
    topBarLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
        marginBottom: 6,
    },
    topBarHeading: {
        fontSize: 36,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -1,
        lineHeight: 40,
    },
    topBarAccent: {
        width: 48,
        height: 3,
        backgroundColor: C.primary,
        marginTop: 12,
    },
    tagScroll: { marginTop: 10 },
    tagScrollContent: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 20 },
    categoryPill: {
        flexDirection: "row", alignItems: "center", gap: 3,
        paddingHorizontal: 8, paddingVertical: 4,
        borderWidth: 1, borderColor: C.textFaint,
        backgroundColor: C.bg,
    },
    categoryPillText: { fontSize: 9, fontWeight: "800", color: C.textMuted, letterSpacing: 1 },
    followersOnlyPill: { borderColor: "#BFDBFE", backgroundColor: "#EFF6FF" },
    followersOnlyPillText: { color: "#1D4ED8" },
    freeFoodPill: { borderColor: "#A8763E", backgroundColor: "#FBF6EE" },
    freeFoodPillText: { color: "#A8763E" },
    recurringPill: { borderColor: C.borderWarm, backgroundColor: C.bg },
    recurringPillText: { color: C.primary },

    expiryBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: C.surfaceAlt,
    },
    expiryBannerText: { fontSize: 10, fontWeight: "800", color: C.textLight, letterSpacing: 1.5 },
    expiryBannerWarn: { backgroundColor: "#FFFBEB" },
    expiryBannerWarnText: { color: "#D97706" },

    hiddenListNote: { fontSize: 11, color: C.textLight, fontStyle: "italic", marginBottom: 8 },

    rsvpBtnClosed: { backgroundColor: C.surfaceAlt },
    rsvpBtnTextClosed: { color: C.textLight },
    rsvpBtnPending: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: "#D97706" },

    topBarActions: { flexDirection: "row", gap: 4 },
    topBarBtn: { padding: 6 },

    // Hero (image bg stays dark — poster placeholder)
    hero: { overflow: "hidden", backgroundColor: "#111" },
    carouselCounter: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
    carouselCounterText: { color: "#fff", fontSize: 12, fontWeight: "600" },
    heroPlaceholder: { backgroundColor: "#2a2a2a" },
    heroBottom: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        gap: 8,
    },
    liveBadgeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    liveBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: C.primary,
        paddingHorizontal: 10,
        paddingVertical: 4,
        alignSelf: "flex-start",
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" },
    liveBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1.5 },
    liveCountdownBadge: {
        backgroundColor: "rgba(0,0,0,0.55)",
        paddingHorizontal: 8, paddingVertical: 4,
    },
    liveCountdownText: { fontSize: 9, fontWeight: "800", color: "#fff", letterSpacing: 1 },

    hairline: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginHorizontal: 16 },

    // Organizer
    organizerRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    organizerAvatar: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: C.primary,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
    },
    organizerAvatarImg: { width: 36, height: 36, borderRadius: 8 },
    organizedByLabel: { fontSize: 10, fontWeight: "600", color: C.textLight, letterSpacing: 1 },
    organizerName: { fontSize: 13, fontWeight: "800", color: C.text, letterSpacing: 0.3 },

    // Date / Time
    dateTimeRow: {
        flexDirection: "row",
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    dateTimeCol: { flex: 1, gap: 4 },
    dateTimeDivider: { width: StyleSheet.hairlineWidth, backgroundColor: C.border, marginHorizontal: 16 },
    dateTimeLabel: { fontSize: 10, fontWeight: "700", color: C.textLight, letterSpacing: 1 },
    dateTimeValue: { fontSize: 16, fontWeight: "800", color: C.text, letterSpacing: -0.3 },

    // Location
    locationRow: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    locationLabel: { fontSize: 10, fontWeight: "700", color: C.textLight, letterSpacing: 1 },
    locationName: { fontSize: 13, fontWeight: "800", color: C.text, lineHeight: 18 },
    locationSub: { fontSize: 12, color: C.textMuted, lineHeight: 17, marginTop: 2 },
    directionsLink: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: C.primary, marginTop: 4 },

    // Event briefing
    briefingSection: {
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 8,
        gap: 10,
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    briefingHeadline: {
        fontSize: 22,
        fontWeight: "900",
        color: C.text,
        lineHeight: 27,
        letterSpacing: -0.5,
    },
    briefingBody: {
        fontSize: 14,
        color: C.textBody,
        lineHeight: 22,
    },

    // CTA
    ctaSection: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 16,
        gap: 10,
    },
    rsvpBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: C.primary,
        paddingVertical: 15,
    },
    rsvpBtnDone: {
        backgroundColor: C.surface,
        borderWidth: 1.5,
        borderColor: C.border,
    },
    rsvpBtnText: {
        fontSize: 13,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 2,
    },
    rsvpBtnTextDone: { color: C.primary },
    rsvpBtnTextWaitlist: { color: "#92400E" },
    waitlistPosRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 8 },
    waitlistPosText: { color: "#92400E", fontSize: 13, fontWeight: "600" },
    capacityWrap: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 2,
        gap: 6,
    },
    capacityBarTrack: {
        height: 4,
        backgroundColor: C.border,
        overflow: "hidden",
    },
    capacityBarFill: {
        height: 4,
        backgroundColor: C.primary,
    },
    capacityBarFull: { backgroundColor: "#DC2626" },
    capacityText: {
        fontSize: 10,
        fontWeight: "700",
        color: C.textMuted,
        letterSpacing: 0.8,
    },
    calendarBtn: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderWidth: 1.5,
        borderColor: C.border,
        paddingVertical: 13,
        backgroundColor: C.surfaceAlt,
    },
    calendarBtnText: {
        fontSize: 12,
        fontWeight: "700",
        color: C.textBody,
        letterSpacing: 1.5,
    },

    // Recommended
    recommendedSection: { paddingTop: 16, paddingBottom: 8 },
    recommendedLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
        marginBottom: 6,
    },
    recapSection: {
        backgroundColor: C.surface,
        marginHorizontal: 12,
        marginTop: 14,
        borderWidth: 1,
        borderColor: C.borderWarm,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 18,
    },
    recapEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 2, color: C.primary },
    recapAccent: { width: 32, height: 2, backgroundColor: C.primary, marginTop: 8, marginBottom: 14 },
    recapRatingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    recapAvg: { fontSize: 22, fontWeight: "900", color: C.text, letterSpacing: -0.5 },
    recapCount: { fontSize: 12, fontWeight: "600", color: C.textMuted },
    recapRateBox: { marginTop: 16, gap: 8 },
    recapRateLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: C.textMuted },
    recapPhotosHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 10 },
    recapPhotosLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1.5, color: C.textMuted },
    recapAddBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: C.borderWarm },
    recapAddText: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: C.primary },
    recapEmpty: { fontSize: 13, color: C.textMuted, lineHeight: 19 },
    recapEmptyBox: { marginTop: 18, borderWidth: 1.5, borderColor: C.borderWarm, borderStyle: "dashed", borderRadius: 10, paddingVertical: 22, paddingHorizontal: 16, alignItems: "center", gap: 8 },
    recapEmptyTitle: { fontSize: 15, fontWeight: "800", color: C.text, textAlign: "center" },
    recapEmptySub: { fontSize: 13, color: C.textMuted, textAlign: "center", marginBottom: 4 },
    recapEmptyBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 12 },
    recapEmptyBtnText: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6, color: "#fff" },
    recapGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    recapThumbWrap: { width: "31.7%", aspectRatio: 1, position: "relative" },
    recapThumb: { width: "100%", height: "100%", backgroundColor: C.skeleton },
    recapDelete: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
    recapPendingBadge: { position: "absolute", bottom: 4, left: 4, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
    recapPendingText: { color: "#fff", fontSize: 9, fontWeight: "700" },
    recapModRow: { position: "absolute", top: 4, right: 4, flexDirection: "row", gap: 4 },
    recapModBtn: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    recapApproveBtn: { backgroundColor: "rgba(22,163,74,0.9)" },
    recapRejectBtn: { backgroundColor: "rgba(220,38,38,0.9)" },
    recapPendingNote: { fontSize: 12, color: "#92400E", fontWeight: "600", marginBottom: 8 },
    recommendedHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingTop: 16,
        marginBottom: 14,
    },
    recommendedTitle: {
        fontSize: 20,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.5,
    },
    viewAllText: {
        fontSize: 12,
        fontWeight: "700",
        color: C.primary,
        letterSpacing: 0.5,
    },
    recommendedScroll: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
    recCard: {
        width: 170,
        backgroundColor: C.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: C.border,
        overflow: "hidden",
    },
    recImageWrap: { height: 110, backgroundColor: "#1a1a1a", overflow: "hidden" },
    freeBadge: {
        position: "absolute",
        top: 8,
        left: 8,
        backgroundColor: C.surface,
        paddingHorizontal: 7,
        paddingVertical: 3,
    },
    freeBadgeText: { fontSize: 9, fontWeight: "800", color: C.text, letterSpacing: 0.5 },
    recInfo: { padding: 10, gap: 3 },
    recCategory: { fontSize: 9, fontWeight: "700", color: C.primary, letterSpacing: 1 },
    recTitle: { fontSize: 13, fontWeight: "800", color: C.text, lineHeight: 17, letterSpacing: -0.2 },
    recMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, flexWrap: "wrap" },
    recMetaText: { fontSize: 10, color: C.textLight, fontWeight: "500", letterSpacing: 0.3 },

    // Who's going
    goingRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 4,
    },
    goingAvatars: { flexDirection: "row" },
    goingAvatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: C.primary,
        borderWidth: 2,
        borderColor: C.surface,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    goingAvatarImg: { width: 30, height: 30, borderRadius: 15 },
    goingAvatarText: { fontSize: 11, fontWeight: "800", color: "#fff" },
    goingLabel: { fontSize: 13, color: C.textMuted, fontWeight: "500" },
    goingCount: { fontWeight: "800", color: C.text },

    // Remind Me
    remindBtn: {
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 8, borderWidth: 1.5, borderColor: C.border,
        paddingVertical: 13, backgroundColor: C.surfaceAlt,
    },
    remindBtnActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
    remindBtnText: { fontSize: 12, fontWeight: "700", color: C.textBody, letterSpacing: 1.5 },
    remindBtnTextActive: { color: C.primary },

    // Comments
    commentsSection: { padding: 16 },
    commentsCount: { fontSize: 20, fontWeight: "900", color: C.text, letterSpacing: -0.5, marginTop: 4, marginBottom: 12 },
    commentsEmpty: { paddingVertical: 24, alignItems: "center" },
    commentsEmptyText: { fontSize: 13, color: C.textLight, fontWeight: "500" },
    commentRow: {
        flexDirection: "row", gap: 10, paddingVertical: 12,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
    },
    commentRowHighlight: {
        backgroundColor: C.primaryBg,
        marginHorizontal: -16, paddingHorizontal: 16,
        borderLeftWidth: 3, borderLeftColor: C.primary,
    },
    commentAvatar: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
        overflow: "hidden", flexShrink: 0,
    },
    commentAvatarImg: { width: 32, height: 32, borderRadius: 16 },
    commentAvatarText: { fontSize: 12, fontWeight: "800", color: "#fff" },
    commentBody: { flex: 1, gap: 3 },
    commentMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
    commentName: { fontSize: 12, fontWeight: "700", color: C.text },
    commentTime: { fontSize: 11, color: C.textLight, fontWeight: "400" },
    commentText: { fontSize: 13, color: C.textBody, lineHeight: 19 },

    // Reply UI
    replyActionRow: {
        flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6,
    },
    replyBtn: {
        fontSize: 9, fontWeight: "800", color: C.textMuted, letterSpacing: 1,
    },
    replyBtnActive: { color: C.primary },
    replyToggle: {
        fontSize: 9, fontWeight: "800", color: C.primary, letterSpacing: 1,
    },
    replyingBanner: {
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingHorizontal: 16, paddingVertical: 8,
        backgroundColor: C.surfaceAlt, borderTopWidth: 1, borderTopColor: C.borderWarm,
    },
    replyingBannerText: { flex: 1, fontSize: 12, color: C.textMuted, marginRight: 8 },
    replyRow: {
        flexDirection: "row", gap: 8, marginTop: 10,
        paddingLeft: 4,
        borderLeftWidth: 2, borderLeftColor: C.border,
        marginLeft: 4,
    },
    replyAvatar: {
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
        overflow: "hidden", flexShrink: 0,
    },
    replyAvatarImg: { width: 24, height: 24, borderRadius: 12 },
    replyAvatarText: { fontSize: 9, fontWeight: "800", color: "#fff" },

    // Comment filter + sort
    commentControls: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
        gap: 8,
    },
    commentFilters: { flexDirection: "row", gap: 6 },
    filterPill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: C.border,
        backgroundColor: C.surfaceAlt,
    },
    filterPillActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
    filterPillText: { fontSize: 9, fontWeight: "800", color: C.textLight, letterSpacing: 1 },
    filterPillTextActive: { color: C.primary },
    sortToggle: { flexDirection: "row", alignItems: "center", gap: 4 },
    sortToggleText: { fontSize: 9, fontWeight: "700", color: C.textMuted, letterSpacing: 0.5 },
    commentAvatarClub: { backgroundColor: "#1D4ED8" },
    clubBadge: {
        backgroundColor: "#1D4ED8",
        paddingHorizontal: 5,
        paddingVertical: 2,
    },
    clubBadgeText: { fontSize: 7, fontWeight: "800", color: "#fff", letterSpacing: 0.8 },

    // Comment input bar
    commentBar: {
        flexDirection: "row", alignItems: "flex-end", gap: 10,
        paddingHorizontal: 16, paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
        backgroundColor: C.surface,
    },
    commentInput: {
        flex: 1, backgroundColor: C.surfaceAlt, borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 9,
        fontSize: 14, color: C.text, maxHeight: 100,
    },
    commentSend: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
    },

    checkInBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: C.text,
        paddingVertical: 18,
        paddingHorizontal: 20,
    },
    checkInBannerLeft: {
        width: 48,
        height: 48,
        backgroundColor: C.primary,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    checkInBannerBody: { flex: 1, gap: 3 },
    checkInBannerTitle: { fontSize: 14, fontWeight: "900", color: "#fff", letterSpacing: 1 },
    checkInBannerSub: { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: "500" },
});
