import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
    View, Text, ScrollView, FlatList, Pressable, TextInput,
    StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Share, Alert, Modal, RefreshControl, useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useApi } from "../../lib/useApi";
import { API_BASE } from "../../lib/api";
import { useToast } from "../../lib/ToastContext";
import { useRsvp } from "../../lib/RsvpContext";
import { useLikes } from "../../lib/LikeContext";
import { useBookmarks } from "../../lib/BookmarkContext";
import { useLang, pickLocale, useT } from "../../lib/LangContext";
import { useAuth } from "../../auth/AuthContext";
import { PostDetailSkeleton } from "../../components/SkeletonLoader";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";

// ─── Types ────────────────────────────────────────────────────────────────────

type PollOption = {
    id: string;
    textEn: string;
    textFr?: string;
    _count: { votes: number };
};

type ApiPost = {
    id: string;
    type: "EVENT" | "POLL" | "ANNOUNCEMENT";
    isDraft: boolean;
    locales: Record<string, { title?: string; body?: string; imageUrl?: string; posterUrl?: string }>;
    images?: string[];
    pollOptions?: PollOption[];
    pollExpiresAt?: string | null;
    club?: { id: string; clubName?: string; logoUrl?: string };
    _count?: { likes: number; comments: number; rsvps: number };
    capacity?: number | null;
    createdAt: string;
    isLiked?: boolean;
    isBookmarked?: boolean;
    isRsvped?: boolean;
    canEdit?: boolean;
    userVote?: string | null;
    // Comment controls
    commentsDisabled?: boolean;
    commentsLockedAt?: string | null;
    slowModeSeconds?: number | null;
    pinnedCommentId?: string | null;
    // Visibility controls
    hideLikeCount?: boolean;
    hideRsvpCount?: boolean;
    followersOnly?: boolean;
    expiresAt?: string | null;
    previewToken?: string | null;
};

type Comment = {
    id: string;
    content: string;
    createdAt: string;
    isPinned?: boolean;
    parentId?: string | null;
    replies?: Comment[];
    user: {
        id: string;
        type: string;
        firstName?: string;
        lastName?: string;
        avatarUrl?: string;
        clubName?: string;
        logoUrl?: string;
    };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makePostStyles = (C: AppColors) => StyleSheet.create({
    page: { flex: 1, backgroundColor: C.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    errorText: { fontSize: 14, color: C.textLight },

    topBar: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 11,
        backgroundColor: C.bg,
    },
    backBtn: { width: 44, height: 44, alignItems: "flex-start", justifyContent: "center" },
    topBarTitle: {
        flex: 1,
        textAlign: "center",
        fontSize: 12,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    topBarActions: { flexDirection: "row", gap: 4, minWidth: 64, justifyContent: "flex-end" },
    topBarBtn: { padding: 6 },

    card: { backgroundColor: C.surface, marginLeft: 12, marginRight: 12, overflow: "hidden", borderWidth: 1, borderColor: C.borderWarm },
    hero: { aspectRatio: 1, backgroundColor: "#111", overflow: "hidden" },
    carouselCounter: {
        alignSelf: "center",
        marginTop: 6,
        backgroundColor: "rgba(0,0,0,0.12)",
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 10,
    },
    carouselCounterText: {
        fontSize: 11,
        fontWeight: "600",
        color: C.textMuted,
    },

    clubRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    clubAvatar: {
        width: 34,
        height: 34,
        borderRadius: 8,
        backgroundColor: C.primary,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
    },
    clubAvatarImg: { width: 34, height: 34, borderRadius: 8 },
    clubLabel: { fontSize: 9, fontWeight: "600", color: C.textLight, letterSpacing: 1 },
    clubName: { fontSize: 12, fontWeight: "800", color: C.text, letterSpacing: 0.3 },
    postAge: { fontSize: 11, color: C.textLight },

    hairline: { height: StyleSheet.hairlineWidth, backgroundColor: C.borderWarm, marginHorizontal: 16 },

    content: { paddingHorizontal: 16, paddingVertical: 20, gap: 12 },

    annoTitle: {
        fontSize: 24,
        fontWeight: "900",
        color: C.text,
        lineHeight: 30,
        letterSpacing: -0.5,
    },
    annoBody: { fontSize: 15, color: C.textBody, lineHeight: 24 },

    pollQuestion: {
        fontSize: 22,
        fontWeight: "900",
        color: C.text,
        lineHeight: 28,
        letterSpacing: -0.3,
        marginBottom: 4,
    },
    pollBody: { fontSize: 13, color: C.textMuted, lineHeight: 19, marginBottom: 4 },
    pollOptions: { gap: 8 },
    pollOption: {
        position: "relative",
        borderWidth: 1.5,
        borderColor: C.border,
        overflow: "hidden",
        minHeight: 52,
        justifyContent: "center",
    },
    pollOptionSelected: { borderColor: C.primary, borderWidth: 0 },
    pollBar: {
        position: "absolute",
        left: 0, top: 0, bottom: 0,
        backgroundColor: C.surfaceAlt,
    },
    pollBarSelected: { backgroundColor: "rgba(140,3,39,0.12)" },
    pollOptionInner: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 14,
        zIndex: 1,
    },
    pollOptionText: {
        fontSize: 12,
        fontWeight: "700",
        color: C.textBody,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    pollOptionTextVoted: { color: C.primary },
    pollPct: { fontSize: 12, fontWeight: "700", color: C.textLight },
    voteCount: { fontSize: 10, fontWeight: "700", color: C.textLight, letterSpacing: 1, marginTop: 4 },

    actionsBar: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 20,
    },
    actionBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
    actionCount: { fontSize: 13, fontWeight: "600", color: C.textLight },
    actionCountActive: { color: C.primary },
    rsvpBtn: {
        flexDirection: "row", alignItems: "center", gap: 5,
        backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 8,
        marginLeft: "auto" as any,
    },
    rsvpBtnActive: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: C.primary },
    rsvpBtnFull: { backgroundColor: C.textLight },
    rsvpBtnText: { fontSize: 11, fontWeight: "800", color: "#fff", letterSpacing: 1 },
    rsvpBtnTextActive: { color: C.primary },

    sectionDivider: { height: 8, backgroundColor: C.surfaceAlt },

    commentsSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
    commentsHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" },
    commentsLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    commentStatusBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: C.surfaceAlt,
        paddingHorizontal: 7,
        paddingVertical: 3,
    },
    commentStatusText: { fontSize: 9, fontWeight: "700", color: C.textLight, letterSpacing: 1 },
    commentStatusSlow: { backgroundColor: "#FEF3C7" },
    commentStatusSlowText: { color: "#D97706" },

    noComments: { fontSize: 13, color: C.textLight },
    comment: { marginBottom: 16, borderRadius: 0 },
    commentPinned: {
        backgroundColor: "#FFF9F9",
        borderLeftWidth: 2,
        borderLeftColor: C.primary,
        paddingLeft: 10,
        paddingTop: 8,
        paddingBottom: 8,
        marginBottom: 16,
    },
    pinnedBadgeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
    pinnedBadgeText: { fontSize: 9, fontWeight: "800", color: C.primary, letterSpacing: 1.5 },
    commentInner: { flexDirection: "row", gap: 10 },
    commentAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: C.border,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
    },
    commentAvatarImg: { width: 32, height: 32, borderRadius: 16 },
    commentAvatarInit: { fontSize: 12, fontWeight: "700", color: C.textBody },
    commentBody: { flex: 1 },
    commentHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
    commentName: { fontSize: 12, fontWeight: "700", color: C.text },
    commentAge: { fontSize: 11, color: C.textLight },
    commentText: { fontSize: 13, color: C.textBody, lineHeight: 19 },

    commentInputBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.border,
        backgroundColor: C.surface,
    },
    commentTextInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: C.border,
        paddingHorizontal: 12,
        paddingTop: 11,
        paddingBottom: 11,
        fontSize: 13,
        color: C.text,
        maxHeight: 100,
        backgroundColor: C.surfaceAlt,
        textAlignVertical: "center",
    },
    commentSendBtn: {
        width: 44,
        height: 44,
        backgroundColor: C.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    commentSendBtnDisabled: { backgroundColor: "#D0D0D0" },

    infoBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 9,
        backgroundColor: C.surfaceAlt,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.border,
    },
    infoBannerText: { fontSize: 10, fontWeight: "800", color: C.textLight, letterSpacing: 1.5 },
    infoBannerWarn: { backgroundColor: "#FFFBEB" },
    infoBannerWarnText: { color: "#D97706" },
    infoBannerBlue: { backgroundColor: "#EFF6FF" },
    infoBannerBlueText: { color: "#1D4ED8" },

    commentsClosedBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.border,
        backgroundColor: C.surfaceAlt,
    },
    commentsClosedText: { fontSize: 12, color: C.textLight, fontStyle: "italic" },

    slowModeBar: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 10,
    },
    slowModeText: { fontSize: 12, color: "#D97706", fontWeight: "600" },

    commentReply: { marginBottom: 10 },
    repliesBlock: { marginTop: 8, marginLeft: 42, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: C.surfaceAlt },
    replyBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
    replyBtnText: { fontSize: 10, fontWeight: "700", color: C.textLight, letterSpacing: 1 },
    replyingToBar: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 7,
        backgroundColor: C.primaryBg,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: "#FECACA",
    },
    replyingToText: { fontSize: 12, color: C.primary },

    checkInBanner: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: "#111827",
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

    checkInBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: "#1F2937",
        paddingHorizontal: 12,
        paddingVertical: 7,
    },
    checkInBtnText: { fontSize: 10, fontWeight: "800", color: "#fff", letterSpacing: 1 },

    scannerSafe: { flex: 1, backgroundColor: "#000" },
    scannerTopBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    scannerClose: { width: 36, alignItems: "flex-start" },
    scannerTitle: { fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 2 },
    scanner: { flex: 1 },
    scannerOverlay: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
    },
    scannerFrame: {
        width: 240,
        height: 240,
        borderWidth: 3,
        borderColor: "#fff",
        borderRadius: 4,
    },
    scannerHint: {
        fontSize: 13,
        color: "rgba(255,255,255,0.7)",
        textAlign: "center",
        paddingHorizontal: 40,
        lineHeight: 20,
    },
    scannerResult: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        paddingHorizontal: 40,
    },
    scannerResultTitle: {
        fontSize: 24,
        fontWeight: "900",
        color: "#fff",
        letterSpacing: 1,
    },
    scannerResultSub: {
        fontSize: 14,
        color: "rgba(255,255,255,0.6)",
        textAlign: "center",
        lineHeight: 22,
    },
    scannerDoneBtn: {
        backgroundColor: "#fff",
        paddingHorizontal: 32,
        paddingVertical: 14,
        marginTop: 8,
    },
    scannerDoneBtnText: { fontSize: 12, fontWeight: "800", color: "#111827", letterSpacing: 2 },
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function PostDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { width: winWidth } = useWindowDimensions();
    const carouselSize = winWidth - 24;
    const authApi = useApi();
    const insets = useSafeAreaInsets();
    const { showToast, showActionToast } = useToast();
    const { lang } = useLang();
    const t = useT();
    const { session } = useAuth();
    const scrollRef = useRef<ScrollView>(null);
    const { colors: C } = useTheme();
    const s = useMemo(() => makePostStyles(C), [C]);

    const { isRsvped, toggleRsvp: ctxToggleRsvp } = useRsvp();
    const { resolve: resolveLike, toggleLike: toggleLikeCtx } = useLikes();
    const { resolve: resolveBookmark, toggleBookmark: toggleBookmarkCtx } = useBookmarks();
    const [post, setPost] = useState<ApiPost | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [fetchError, setFetchError] = useState(false);
    const [rsvpCount, setRsvpCount] = useState(0);
    const [pollOptions, setPollOptions] = useState<PollOption[]>([]);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [votingId, setVotingId] = useState<string | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [commentText, setCommentText] = useState("");
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [checkInStatus, setCheckInStatus] = useState<"idle" | "success" | "already" | "error">("idle");
    const [carouselIndex, setCarouselIndex] = useState(0);
    const [scanning, setScanning] = useState(false);
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();
    // Slow mode: timestamp of user's last comment
    const [lastCommentAt, setLastCommentAt] = useState<number | null>(null);
    const [slowCooldown, setSlowCooldown] = useState(0);

    const loadPost = useCallback((isRefresh = false) => {
        if (!id) return;
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setFetchError(false);
        authApi<ApiPost>(`/posts/${id}`)
            .then((data) => {
                setPost(data);
                setRsvpCount(data._count?.rsvps ?? 0);
                setPollOptions(data.pollOptions ?? []);
                setSelectedOption(data.userVote ?? null);
            })
            .catch(() => setFetchError(true))
            .finally(() => isRefresh ? setRefreshing(false) : setLoading(false));

        setCommentsLoading(true);
        authApi<Comment[]>(`/posts/${id}/comments`)
            .then(setComments)
            .catch(console.error)
            .finally(() => setCommentsLoading(false));
    }, [id]);

    useFocusEffect(useCallback(() => { loadPost(); }, [id]));

    // Live poll refresh: re-fetch vote counts every 10 s while screen is focused
    const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    useFocusEffect(useCallback(() => {
        if (post?.type !== "POLL") return;
        const expired = post.pollExpiresAt && new Date(post.pollExpiresAt) <= new Date();
        if (expired) return;

        pollTimerRef.current = setInterval(async () => {
            try {
                const fresh = await authApi<ApiPost>(`/posts/${id}`);
                setPollOptions(fresh.pollOptions ?? []);
            } catch {}
        }, 10000);

        return () => {
            if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
        };
    }, [post?.type, post?.pollExpiresAt, id]));

    // Slow mode countdown ticker
    useEffect(() => {
        if (!lastCommentAt || !post?.slowModeSeconds) return;
        const tick = setInterval(() => {
            const remaining = Math.ceil((lastCommentAt + post.slowModeSeconds! * 1000 - Date.now()) / 1000);
            if (remaining <= 0) { setSlowCooldown(0); clearInterval(tick); }
            else setSlowCooldown(remaining);
        }, 1000);
        return () => clearInterval(tick);
    }, [lastCommentAt, post?.slowModeSeconds]);

    async function toggleRsvp() {
        const next = !isRsvped(id!);
        setRsvpCount((c) => c + (next ? 1 : -1));
        const actual = await ctxToggleRsvp(id!);
        if (actual !== next) setRsvpCount((c) => c + (next ? -1 : 1));
    }

    async function vote(optionId: string) {
        if (selectedOption || votingId) return;
        setVotingId(optionId);
        try {
            await authApi(`/posts/${id}/vote`, {
                method: "POST",
                body: JSON.stringify({ optionId }),
            });
            setSelectedOption(optionId);
            setPollOptions((opts) =>
                opts.map((o) =>
                    o.id === optionId
                        ? { ...o, _count: { votes: o._count.votes + 1 } }
                        : o
                )
            );
        } catch {
            Alert.alert(t.voteFailedTitle, t.voteFailedMsg);
        } finally {
            setVotingId(null);
        }
    }

    async function submitComment() {
        if (!commentText.trim() || commentSubmitting) return;
        setCommentSubmitting(true);
        try {
            const body: Record<string, any> = { content: commentText.trim() };
            if (replyingTo) body.parentId = replyingTo.id;
            const comment = await authApi<Comment>(`/posts/${id}/comments`, {
                method: "POST",
                body: JSON.stringify(body),
            });
            setComments((prev) => {
                if (replyingTo) {
                    return prev.map((c) =>
                        c.id === replyingTo.id
                            ? { ...c, replies: [...(c.replies ?? []), comment] }
                            : c
                    );
                }
                return [comment, ...prev];
            });
            setCommentText("");
            setReplyingTo(null);
            if (post?.slowModeSeconds) {
                const now = Date.now();
                setLastCommentAt(now);
                setSlowCooldown(post.slowModeSeconds);
            }
        } catch {
            Alert.alert(t.failedToPostTitle, t.commentSubmitError);
        } finally {
            setCommentSubmitting(false);
        }
    }

    async function togglePinComment(commentId: string, currentlyPinned: boolean) {
        try {
            if (currentlyPinned) {
                await authApi(`/posts/${id}/comments/${commentId}/unpin`, { method: "PATCH" });
                setComments((c) => c.map((x) => ({ ...x, isPinned: false })));
            } else {
                await authApi(`/posts/${id}/comments/${commentId}/pin`, { method: "PATCH" });
                setComments((c) => c.map((x) => ({ ...x, isPinned: x.id === commentId })));
            }
        } catch {
            Alert.alert(t.failedTitle, t.couldNotPinComment);
        }
    }

    const pendingDeletes = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    function deleteComment(commentId: string, parentId?: string | null) {
        let snapshot: typeof comments = [];
        setComments((prev) => {
            snapshot = prev;
            if (parentId) {
                return prev.map((c) =>
                    c.id === parentId
                        ? { ...c, replies: (c.replies ?? []).filter((r) => r.id !== commentId) }
                        : c
                );
            }
            return prev.filter((x) => x.id !== commentId);
        });

        const timer = setTimeout(async () => {
            pendingDeletes.current.delete(commentId);
            try {
                await authApi(`/posts/${id}/comments/${commentId}`, { method: "DELETE" });
            } catch {
                setComments(snapshot);
            }
        }, 3000);

        pendingDeletes.current.set(commentId, timer);

        showActionToast("Comment deleted", "UNDO", () => {
            const t = pendingDeletes.current.get(commentId);
            if (t) { clearTimeout(t); pendingDeletes.current.delete(commentId); }
            setComments(snapshot); // restore full snapshot including nesting
        });
    }

    function reportPost() {
        const REASONS = [
            { value: "Spam", label: t.reasonSpam },
            { value: "Misleading", label: t.reasonMisleading },
            { value: "Inappropriate content", label: t.reasonInappropriate },
            { value: "Harassment", label: t.reasonHarassment },
            { value: "Other", label: t.reasonOther },
        ];
        Alert.alert(t.reportPostTitle, t.reportPostMsg,
            [
                ...REASONS.map((r) => ({
                    text: r.label,
                    onPress: async () => {
                        try {
                            await authApi(`/reports/posts/${id}`, { method: "POST", body: JSON.stringify({ reason: r.value }) });
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
                            await authApi(`/reports/comments/${commentId}`, { method: "POST", body: JSON.stringify({ reason: r.value }) });
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

    if (loading) {
        return (
            <SafeAreaView style={s.page} edges={["top"]}>
                <PostDetailSkeleton />
            </SafeAreaView>
        );
    }

    if (fetchError) {
        return (
            <SafeAreaView style={s.page} edges={["top"]}>
                <View style={s.center}>
                    <Ionicons name="cloud-offline-outline" size={36} color={C.textFaint} />
                    <Text style={{ marginTop: 12, fontSize: 11, fontWeight: "700", color: C.textLight, letterSpacing: 2 }}>
                        COULDN'T LOAD POST
                    </Text>
                    <Pressable
                        onPress={() => loadPost()}
                        style={{ marginTop: 16, borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 20, paddingVertical: 10 }}
                    >
                        <Text style={{ fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1.5 }}>RETRY</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    if (!post) {
        return (
            <SafeAreaView style={s.page} edges={["top"]}>
                <View style={s.center}>
                    <Ionicons name="document-outline" size={40} color={C.textFaint} />
                    <Text style={{ marginTop: 12, fontSize: 13, fontWeight: "900", color: C.textFaint, letterSpacing: 2 }}>
                        POST NOT FOUND
                    </Text>
                    <Pressable
                        onPress={() => router.replace("/(tabs)" as any)}
                        style={{ marginTop: 16, backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 10 }}
                    >
                        <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }}>GO HOME</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    const like = resolveLike(id!, { liked: post.isLiked ?? false, count: post._count?.likes ?? 0 });
    const bm = resolveBookmark(id!, post.isBookmarked ?? false);
    const locale = pickLocale(post.locales, lang);
    const title = locale.title ?? "";
    const body = locale.body ?? "";
    const imageUrl = locale.posterUrl ?? locale.imageUrl;
    const clubName = post.club?.clubName?.toUpperCase() ?? "";
    const totalVotes = pollOptions.reduce((sum, o) => sum + o._count.votes, 0);
    const pollExpired = !!post.pollExpiresAt && new Date(post.pollExpiresAt) <= new Date();
    const postExpired = !!post.expiresAt && new Date(post.expiresAt) <= new Date();

    return (
        <SafeAreaView style={s.page} edges={["top"]}>
            {/* Top bar */}
            <View style={s.topBar}>
                <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)" as any)} style={s.backBtn} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
                    <Ionicons name="arrow-back" size={18} color={C.text} />
                </Pressable>
                <Text style={s.topBarTitle}>
                    {post.type === "POLL" ? "POLL" : post.type === "EVENT" ? "EVENT" : "ANNOUNCEMENT"}
                </Text>
                <View style={s.topBarActions}>
                    {post.canEdit && post.isDraft && post.previewToken && (
                        <Pressable
                            style={s.topBarBtn}
                            hitSlop={8}
                            onPress={() => Share.share({ message: `Preview this post: ${post.previewToken}` })}
                            accessibilityLabel="Share draft preview link"
                            accessibilityRole="button"
                        >
                            <Ionicons name="eye-outline" size={19} color="#D97706" />
                        </Pressable>
                    )}
                    {post.canEdit ? (
                        <>
                            <Pressable
                                style={s.topBarBtn}
                                hitSlop={8}
                                onPress={() => router.push({ pathname: "/post-analytics/[id]", params: { id } } as any)}
                                accessibilityLabel="View post analytics"
                                accessibilityRole="button"
                            >
                                <Ionicons name="bar-chart-outline" size={19} color={C.text} />
                            </Pressable>
                            <Pressable
                                style={s.topBarBtn}
                                hitSlop={8}
                                onPress={() => router.push({ pathname: "/edit/[id]", params: { id } })}
                                accessibilityLabel="Edit post"
                                accessibilityRole="button"
                            >
                                <Ionicons name="create-outline" size={19} color={C.text} />
                            </Pressable>
                        </>
                    ) : (
                        <Pressable onPress={() => toggleBookmarkCtx(id!, bm)} style={s.topBarBtn} hitSlop={8} accessibilityLabel={bm ? "Remove bookmark" : "Bookmark post"} accessibilityRole="button">
                            <Ionicons
                                name={bm ? "bookmark" : "bookmark-outline"}
                                size={19}
                                color={C.primary}
                            />
                        </Pressable>
                    )}
                </View>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
                <ScrollView
                    ref={scrollRef}
                    showsVerticalScrollIndicator={false}
                    style={{ backgroundColor: C.bg }}
                    contentContainerStyle={{ paddingBottom: 100, gap: 8 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadPost(true)} tintColor={C.primary} />}
                >
                    {/* Expiry / followers-only banners */}
                    {post.expiresAt && new Date(post.expiresAt) <= new Date() && (
                        <View style={s.infoBanner}>
                            <Ionicons name="archive-outline" size={13} color={C.textLight} />
                            <Text style={s.infoBannerText}>THIS POST HAS EXPIRED</Text>
                        </View>
                    )}
                    {post.expiresAt && new Date(post.expiresAt) > new Date() && (
                        <View style={[s.infoBanner, s.infoBannerWarn]}>
                            <Ionicons name="time-outline" size={13} color="#D97706" />
                            <Text style={[s.infoBannerText, s.infoBannerWarnText]}>
                                EXPIRES {new Date(post.expiresAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" }).toUpperCase()}
                            </Text>
                        </View>
                    )}
                    {post.followersOnly && (
                        <View style={[s.infoBanner, s.infoBannerBlue]}>
                            <Ionicons name="people" size={13} color="#1D4ED8" />
                            <Text style={[s.infoBannerText, s.infoBannerBlueText]}>FOLLOWERS ONLY</Text>
                        </View>
                    )}

                    {/* Hero image / carousel */}
                    {(post.images && post.images.length > 1) ? (
                        <View style={{ marginHorizontal: 12 }}>
                            <FlatList
                                data={post.images}
                                horizontal
                                pagingEnabled
                                showsHorizontalScrollIndicator={false}
                                keyExtractor={(uri, i) => `${uri}-${i}`}
                                renderItem={({ item }) => (
                                    <View style={[s.hero, { width: carouselSize, height: carouselSize }]}>
                                        <ExpoImage source={{ uri: item }} style={StyleSheet.absoluteFill as any} contentFit="cover" transition={200} />
                                    </View>
                                )}
                                onScroll={(e) => {
                                    const idx = Math.round(e.nativeEvent.contentOffset.x / carouselSize);
                                    setCarouselIndex(idx);
                                }}
                                scrollEventThrottle={16}
                            />
                            <View style={s.carouselCounter}>
                                <Text style={s.carouselCounterText}>
                                    {carouselIndex + 1} / {post.images.length}
                                </Text>
                            </View>
                        </View>
                    ) : !!imageUrl ? (
                        <View style={[s.hero, { marginHorizontal: 12 }]}>
                            <ExpoImage source={{ uri: imageUrl }} style={StyleSheet.absoluteFill as any} contentFit="cover" transition={200} />
                        </View>
                    ) : null}

                    {/* Club header + content + actions — card */}
                    <View style={s.card}>
                    <Pressable
                        style={s.clubRow}
                        onPress={() => post.club?.id && router.push(`/club/${post.club.id}` as any)}
                    >
                        <View style={s.clubAvatar}>
                            {post.club?.logoUrl
                                ? <ExpoImage source={{ uri: post.club.logoUrl }} style={s.clubAvatarImg} contentFit="cover" transition={200} />
                                : <Ionicons name="people" size={14} color="#fff" />
                            }
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.clubLabel}>POSTED BY</Text>
                            <Text style={s.clubName}>{clubName}</Text>
                        </View>
                        <Text style={s.postAge}>{timeAgo(post.createdAt)}</Text>
                    </Pressable>

                    <View style={s.hairline} />

                    {/* Content */}
                    {post.type === "POLL" ? (
                        <View style={s.content}>
                            <Text style={s.pollQuestion}>{title}</Text>
                            {!!body && <Text style={s.pollBody}>{body}</Text>}
                            <View style={s.pollOptions}>
                                {pollOptions.map((opt) => {
                                    const pct = totalVotes > 0
                                        ? Math.round((opt._count.votes / totalVotes) * 100)
                                        : 0;
                                    const isVoted = selectedOption === opt.id;
                                    const hasVoted = !!selectedOption;
                                    return (
                                        <Pressable
                                            key={opt.id}
                                            style={[s.pollOption, isVoted && s.pollOptionSelected]}
                                            onPress={() => !hasVoted && !pollExpired && vote(opt.id)}
                                            disabled={hasVoted || !!votingId || pollExpired}
                                        >
                                            {hasVoted && (
                                                <View
                                                    style={[
                                                        s.pollBar,
                                                        { width: `${pct}%` as any },
                                                        isVoted && s.pollBarSelected,
                                                    ]}
                                                />
                                            )}
                                            <View style={s.pollOptionInner}>
                                                <Text style={[s.pollOptionText, isVoted && s.pollOptionTextVoted]}>
                                                    {lang === "fr" && opt.textFr ? opt.textFr : opt.textEn}
                                                </Text>
                                                {hasVoted && (
                                                    <Text style={s.pollPct}>{pct}%</Text>
                                                )}
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </View>
                            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                                <Text style={s.voteCount}>{totalVotes} {totalVotes === 1 ? "VOTE" : "VOTES"}</Text>
                                {!!post.pollExpiresAt && (() => {
                                    const diff = new Date(post.pollExpiresAt!).getTime() - Date.now();
                                    const expired = diff <= 0;
                                    const label = expired
                                        ? "ENDED"
                                        : diff < 3600000
                                        ? `${Math.floor(diff / 60000)}M LEFT`
                                        : diff < 86400000
                                        ? `${Math.floor(diff / 3600000)}H LEFT`
                                        : `${Math.floor(diff / 86400000)}D LEFT`;
                                    return (
                                        <Text style={[s.voteCount, { color: expired ? C.textLight : C.primary }]}>{label}</Text>
                                    );
                                })()}
                            </View>
                        </View>
                    ) : (
                        <View style={s.content}>
                            <Text style={s.annoTitle}>{title}</Text>
                            {!!body && <Text style={s.annoBody}>{body}</Text>}
                        </View>
                    )}

                    <View style={s.hairline} />

                    {/* Actions bar */}
                    <View style={s.actionsBar}>
                        <Pressable style={s.actionBtn} onPress={() => toggleLikeCtx(id!, like)} accessibilityLabel={like.liked ? "Unlike post" : "Like post"} accessibilityRole="button">
                            <Ionicons
                                name={like.liked ? "heart" : "heart-outline"}
                                size={20}
                                color={like.liked ? C.primary : C.textLight}
                            />
                            {like.count > 0 && !post.hideLikeCount && (
                                <Text style={[s.actionCount, like.liked && s.actionCountActive]}>
                                    {like.count}
                                </Text>
                            )}
                        </Pressable>
                        <Pressable style={s.actionBtn} accessibilityLabel={`${comments.length} comments`} accessibilityRole="button">
                            <Ionicons name="chatbubble-outline" size={19} color={C.textLight} />
                            {comments.length > 0 && (
                                <Text style={s.actionCount}>{comments.length}</Text>
                            )}
                        </Pressable>
                        <Pressable
                            style={s.actionBtn}
                            hitSlop={8}
                            onPress={() => Share.share({ message: `${title}\n\n${API_BASE}/share/post/${id}` })}
                            accessibilityLabel="Share post"
                            accessibilityRole="button"
                        >
                            <Ionicons name="share-outline" size={20} color={C.textLight} />
                        </Pressable>
                        {!post.canEdit && (
                            <Pressable
                                style={s.actionBtn}
                                hitSlop={8}
                                onPress={reportPost}
                                accessibilityLabel="Report post"
                                accessibilityRole="button"
                            >
                                <Ionicons name="flag-outline" size={20} color={C.textLight} />
                            </Pressable>
                        )}
                        {post.type === "EVENT" && !postExpired && (() => {
                            const atCapacity = post.capacity != null && rsvpCount >= post.capacity && !isRsvped(id!);
                            return (
                                <View style={{ alignItems: "flex-end", gap: 6 }}>
                                    {!post.canEdit && isRsvped(id!) && (
                                        <Pressable style={s.checkInBtn} onPress={openScanner}>
                                            <Ionicons name="qr-code-outline" size={13} color="#fff" />
                                            <Text style={s.checkInBtnText}>CHECK IN</Text>
                                        </Pressable>
                                    )}
                                    <Pressable
                                        style={[s.rsvpBtn, isRsvped(id!) && s.rsvpBtnActive, atCapacity && s.rsvpBtnFull]}
                                        onPress={atCapacity ? undefined : toggleRsvp}
                                        disabled={atCapacity}
                                    >
                                        <Ionicons name="ticket-outline" size={14} color={isRsvped(id!) ? C.primary : "#fff"} />
                                        <Text style={[s.rsvpBtnText, isRsvped(id!) && s.rsvpBtnTextActive]}>
                                            {atCapacity ? "FULL" : isRsvped(id!) ? "GOING" : "RSVP"}
                                        </Text>
                                        {rsvpCount > 0 && (
                                            <Text style={[s.rsvpBtnText, isRsvped(id!) && s.rsvpBtnTextActive]}>
                                                · {rsvpCount}{post.capacity != null ? `/${post.capacity}` : ""}
                                            </Text>
                                        )}
                                    </Pressable>
                                </View>
                            );
                        })()}
                    </View>
                    </View>{/* end card */}

                    {/* Check-in banner — club only, events only */}
                    {post.canEdit && post.type === "EVENT" && (
                        <View style={[s.card, { overflow: "hidden" }]}>
                        <Pressable
                            style={s.checkInBanner}
                            onPress={() => router.push({ pathname: "/checkin/[id]", params: { id } } as any)}
                        >
                            <View style={s.checkInBannerLeft}>
                                <Ionicons name="qr-code" size={28} color="#fff" />
                            </View>
                            <View style={s.checkInBannerBody}>
                                <Text style={s.checkInBannerTitle}>CHECK-IN MODE</Text>
                                <Text style={s.checkInBannerSub}>Open QR code · track attendance live</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
                        </Pressable>
                        </View>
                    )}

                    {/* Comments */}
                    <View style={[s.card, s.commentsSection]}>
                        {/* Header row: label + status badges */}
                        <View style={s.commentsHeaderRow}>
                            <Text style={s.commentsLabel}>COMMENTS</Text>
                            {post.commentsDisabled && (
                                <View style={s.commentStatusBadge}>
                                    <Ionicons name="ban-outline" size={10} color={C.textLight} />
                                    <Text style={s.commentStatusText}>DISABLED</Text>
                                </View>
                            )}
                            {!post.commentsDisabled && post.commentsLockedAt && new Date(post.commentsLockedAt) <= new Date() && (
                                <View style={s.commentStatusBadge}>
                                    <Ionicons name="lock-closed-outline" size={10} color={C.textLight} />
                                    <Text style={s.commentStatusText}>LOCKED</Text>
                                </View>
                            )}
                            {!post.commentsDisabled && post.slowModeSeconds && post.slowModeSeconds > 0 && (
                                <View style={[s.commentStatusBadge, s.commentStatusSlow]}>
                                    <Ionicons name="time-outline" size={10} color="#D97706" />
                                    <Text style={[s.commentStatusText, s.commentStatusSlowText]}>
                                        SLOW MODE · {post.slowModeSeconds >= 3600
                                            ? `${Math.round(post.slowModeSeconds / 3600)}h`
                                            : post.slowModeSeconds >= 60
                                                ? `${Math.round(post.slowModeSeconds / 60)}m`
                                                : `${post.slowModeSeconds}s`}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {commentsLoading ? (
                            <ActivityIndicator color={C.primary} style={{ marginTop: 16 }} />
                        ) : comments.length === 0 ? (
                            <Text style={s.noComments}>No comments yet. Be the first.</Text>
                        ) : (
                            (() => {
                                const pinned = comments.find((c) => c.isPinned);
                                const rest = comments.filter((c) => !c.isPinned);
                                const ordered = pinned ? [pinned, ...rest] : rest;

                                const renderComment = (c: Comment, isReply = false) => {
                                    const name = c.user.type === "CLUB"
                                        ? (c.user.clubName ?? "Club")
                                        : [c.user.firstName, c.user.lastName].filter(Boolean).join(" ") || "User";
                                    const avatar = c.user.avatarUrl ?? c.user.logoUrl;
                                    const canDelete = post.canEdit || c.user.id === session?.userId;
                                    const commentsOpen = !post.commentsDisabled &&
                                        !(post.commentsLockedAt && new Date(post.commentsLockedAt) <= new Date());
                                    return (
                                        <View key={c.id} style={[s.comment, c.isPinned && s.commentPinned, isReply && s.commentReply]}>
                                            {c.isPinned && (
                                                <View style={s.pinnedBadgeRow}>
                                                    <Ionicons name="pin" size={10} color={C.primary} />
                                                    <Text style={s.pinnedBadgeText}>PINNED</Text>
                                                </View>
                                            )}
                                            <View style={s.commentInner}>
                                                <View style={[s.commentAvatar, isReply && { width: 26, height: 26, borderRadius: 13 }]}>
                                                    {avatar
                                                        ? <ExpoImage source={{ uri: avatar }} style={[s.commentAvatarImg, isReply && { width: 26, height: 26, borderRadius: 13 }]} contentFit="cover" transition={200} />
                                                        : <Text style={[s.commentAvatarInit, isReply && { fontSize: 10 }]}>{name[0]?.toUpperCase()}</Text>
                                                    }
                                                </View>
                                                <View style={s.commentBody}>
                                                    <View style={s.commentHeader}>
                                                        <Text style={s.commentName}>{name}</Text>
                                                        <Text style={s.commentAge}>{timeAgo(c.createdAt)}</Text>
                                                        {!isReply && post.canEdit && (
                                                            <Pressable
                                                                onPress={() => togglePinComment(c.id, !!c.isPinned)}
                                                                hitSlop={8}
                                                                accessibilityLabel={c.isPinned ? "Unpin comment" : "Pin comment"}
                                                                accessibilityRole="button"
                                                            >
                                                                <Ionicons
                                                                    name={c.isPinned ? "pin" : "pin-outline"}
                                                                    size={13}
                                                                    color={c.isPinned ? C.primary : C.textFaint}
                                                                />
                                                            </Pressable>
                                                        )}
                                                        {!canDelete && (
                                                            <Pressable onPress={() => reportComment(c.id)} hitSlop={8} accessibilityLabel="Report comment" accessibilityRole="button">
                                                                <Ionicons name="flag-outline" size={13} color={C.textFaint} />
                                                            </Pressable>
                                                        )}
                                                        {canDelete && (
                                                            <Pressable onPress={() => deleteComment(c.id, isReply ? c.parentId : null)} hitSlop={8} accessibilityLabel="Delete comment" accessibilityRole="button">
                                                                <Ionicons name="trash-outline" size={13} color={C.textFaint} />
                                                            </Pressable>
                                                        )}
                                                    </View>
                                                    <Text style={s.commentText}>{c.content}</Text>
                                                    {!isReply && commentsOpen && (
                                                        <Pressable
                                                            style={s.replyBtn}
                                                            onPress={() => {
                                                                setReplyingTo({ id: c.id, name });
                                                                scrollRef.current?.scrollToEnd({ animated: true });
                                                            }}
                                                            accessibilityLabel={`Reply to ${name}`}
                                                        >
                                                            <Ionicons name="return-down-forward-outline" size={11} color={C.textLight} />
                                                            <Text style={s.replyBtnText}>REPLY</Text>
                                                        </Pressable>
                                                    )}
                                                </View>
                                            </View>
                                            {/* Nested replies */}
                                            {!isReply && c.replies && c.replies.length > 0 && (
                                                <View style={s.repliesBlock}>
                                                    {c.replies.map((r) => renderComment({ ...r, parentId: c.id }, true))}
                                                </View>
                                            )}
                                        </View>
                                    );
                                };

                                return ordered.map((c) => renderComment(c));
                            })()
                        )}
                    </View>
                </ScrollView>

                {/* Comment input — hidden when disabled or locked */}
                {post.commentsDisabled ? (
                    <View style={s.commentsClosedBar}>
                        <Ionicons name="ban-outline" size={14} color={C.textLight} />
                        <Text style={s.commentsClosedText}>Comments are disabled on this post</Text>
                    </View>
                ) : post.commentsLockedAt && new Date(post.commentsLockedAt) <= new Date() ? (
                    <View style={s.commentsClosedBar}>
                        <Ionicons name="lock-closed-outline" size={14} color={C.textLight} />
                        <Text style={s.commentsClosedText}>Comments are locked</Text>
                    </View>
                ) : (
                    <View style={[s.commentInputBar, { paddingBottom: 10 + insets.bottom }]}>
                        {slowCooldown > 0 ? (
                            <View style={s.slowModeBar}>
                                <Ionicons name="time-outline" size={14} color="#D97706" />
                                <Text style={s.slowModeText}>
                                    Slow mode — wait {slowCooldown}s before commenting again
                                </Text>
                            </View>
                        ) : (
                            <>
                                {replyingTo && (
                                    <View style={s.replyingToBar}>
                                        <Ionicons name="return-down-forward-outline" size={12} color={C.primary} />
                                        <Text style={s.replyingToText}>Replying to <Text style={{ fontWeight: "700" }}>{replyingTo.name}</Text></Text>
                                        <Pressable onPress={() => setReplyingTo(null)} hitSlop={8} style={{ marginLeft: "auto" }} accessibilityLabel="Cancel reply" accessibilityRole="button">
                                            <Ionicons name="close" size={14} color={C.textLight} />
                                        </Pressable>
                                    </View>
                                )}
                                <TextInput
                                    style={s.commentTextInput}
                                    value={commentText}
                                    onChangeText={setCommentText}
                                    onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                                    placeholder={replyingTo ? `Reply to ${replyingTo.name}...` : "Add a comment..."}
                                    placeholderTextColor={C.textLight}
                                    multiline
                                />
                                <Pressable
                                    style={[
                                        s.commentSendBtn,
                                        (!commentText.trim() || commentSubmitting) && s.commentSendBtnDisabled,
                                    ]}
                                    onPress={submitComment}
                                    disabled={!commentText.trim() || commentSubmitting}
                                    accessibilityLabel="Send comment"
                                    accessibilityRole="button"
                                >
                                    {commentSubmitting
                                        ? <ActivityIndicator color="#fff" size="small" />
                                        : <Ionicons name="send" size={16} color="#fff" />
                                    }
                                </Pressable>
                            </>
                        )}
                    </View>
                )}
            </KeyboardAvoidingView>

            {/* QR Scanner Modal */}
            <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
                <SafeAreaView style={s.scannerSafe} edges={["top"]}>
                    <View style={s.scannerTopBar}>
                        <Pressable onPress={() => setScannerOpen(false)} style={s.scannerClose} hitSlop={8} accessibilityLabel="Close scanner" accessibilityRole="button">
                            <Ionicons name="close" size={22} color="#fff" />
                        </Pressable>
                        <Text style={s.scannerTitle}>SCAN CHECK-IN CODE</Text>
                        <View style={{ width: 36 }} />
                    </View>

                    {checkInStatus === "idle" || checkInStatus === "error" ? (
                        <>
                            <CameraView
                                style={s.scanner}
                                facing="back"
                                onBarcodeScanned={scanning ? undefined : ({ data }) => handleQrScan(data)}
                            >
                                <View style={s.scannerOverlay}>
                                    <View style={s.scannerFrame} />
                                    <Text style={s.scannerHint}>
                                        {checkInStatus === "error"
                                            ? "Invalid code — make sure you're scanning the right event"
                                            : "Point your camera at the club's check-in QR code"}
                                    </Text>
                                </View>
                            </CameraView>
                        </>
                    ) : (
                        <View style={s.scannerResult}>
                            <Ionicons
                                name={checkInStatus === "success" ? "checkmark-circle" : "information-circle"}
                                size={72}
                                color={checkInStatus === "success" ? "#16A34A" : C.textLight}
                            />
                            <Text style={s.scannerResultTitle}>
                                {checkInStatus === "success" ? "CHECKED IN!" : "ALREADY CHECKED IN"}
                            </Text>
                            <Text style={s.scannerResultSub}>
                                {checkInStatus === "success"
                                    ? "You're officially on the attendance list."
                                    : "You already checked in to this event."}
                            </Text>
                            <Pressable style={s.scannerDoneBtn} onPress={() => setScannerOpen(false)}>
                                <Text style={s.scannerDoneBtnText}>DONE</Text>
                            </Pressable>
                        </View>
                    )}
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
}
