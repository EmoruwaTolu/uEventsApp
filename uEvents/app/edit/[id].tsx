import React, { useEffect, useState, useMemo } from "react";
import { View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useApi } from "../../lib/useApi";
import { useToast } from "../../lib/ToastContext";
import CreateEventForm from "../../components/create/CreateEventForm";
import CreatePollForm from "../../components/create/CreatePollForm";
import CreateAnnouncementForm from "../../components/create/CreateAnnouncementForm";
import type { EventDraftValues, PollDraftValues, AnnouncementDraftValues } from "../../lib/draftsStore";
import { useTheme } from "../../lib/ThemeContext";

type ApiPost = {
    id: string;
    type: "EVENT" | "POLL" | "ANNOUNCEMENT";
    locales: Record<string, { title?: string; body?: string; imageUrl?: string }>;
    images: string[];
    startAt?: string;
    locationName?: string;
    capacity?: number | null;
    pollOptions?: Array<{ id: string; textEn: string }>;
    pollExpiresAt?: string | null;
    pollAnonymous?: boolean;
    commentsDisabled?: boolean;
    commentsLockedAt?: string | null;
    slowModeSeconds?: number | null;
    // Visibility
    hideLikeCount?: boolean;
    followersOnly?: boolean;
    expiresAt?: string | null;
    // Event-specific
    hideRsvpCount?: boolean;
    hideAttendeeList?: boolean;
    rsvpClosed?: boolean;
    waitlistEnabled?: boolean;
    rsvpRequiresApproval?: boolean;
    freeFood?: boolean;
    recapPrivate?: boolean;
    seriesId?: string | null;
};

function commentSettings(post: ApiPost) {
    return {
        commentsDisabled: post.commentsDisabled ?? false,
        commentsLockedAt: post.commentsLockedAt ?? null,
        slowModeSeconds: post.slowModeSeconds ?? null,
    };
}

function visibilitySettings(post: ApiPost) {
    return {
        hideLikeCount: post.hideLikeCount ?? false,
        followersOnly: post.followersOnly ?? false,
        expiresAt: post.expiresAt ?? null,
    };
}

function eventSettings(post: ApiPost) {
    return {
        hideRsvpCount: post.hideRsvpCount ?? false,
        hideAttendeeList: post.hideAttendeeList ?? false,
        rsvpClosed: post.rsvpClosed ?? false,
        waitlistEnabled: post.waitlistEnabled ?? false,
        rsvpRequiresApproval: post.rsvpRequiresApproval ?? false,
    };
}

function mapToEventValues(post: ApiPost): EventDraftValues {
    const en = post.locales?.en ?? {};
    const fr = post.locales?.fr;
    const d = post.startAt ? new Date(post.startAt) : null;
    const h = d ? d.getHours() : 0;
    const min = d ? d.getMinutes() : 0;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return {
        lang: "en",
        title: en.title ?? "",
        titleFr: fr?.title ?? "",
        description: en.body ?? "",
        descriptionFr: fr?.body ?? "",
        posterUri: null,
        images: post.images ?? [],
        eventDate: d
            ? `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`
            : "",
        startTime: d ? `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${ampm}` : "",
        venue: post.locationName ?? "",
        capacity: post.capacity ?? undefined,
        freeFood: post.freeFood ?? false,
        recapPrivate: post.recapPrivate ?? false,
        ...commentSettings(post),
        ...visibilitySettings(post),
        ...eventSettings(post),
    };
}

function inferDuration(pollExpiresAt?: string | null): "24H" | "3D" | "7D" {
    if (!pollExpiresAt) return "24H";
    const msLeft = new Date(pollExpiresAt).getTime() - Date.now();
    if (msLeft <= 864e5 * 2) return "24H";
    if (msLeft <= 864e5 * 5) return "3D";
    return "7D";
}

function mapToPollValues(post: ApiPost): PollDraftValues {
    const en = post.locales?.en ?? {};
    const fr = post.locales?.fr;
    return {
        lang: "en",
        question: en.title ?? "",
        questionFr: fr?.title ?? "",
        description: en.body ?? "",
        descriptionFr: fr?.body ?? "",
        options: post.pollOptions?.length
            ? post.pollOptions.map((o) => ({ id: o.id, text: o.textEn }))
            : [{ id: "1", text: "" }, { id: "2", text: "" }],
        coverUri: null,
        images: post.images ?? [],
        duration: inferDuration(post.pollExpiresAt),
        anonymous: post.pollAnonymous ?? true,
        ...commentSettings(post),
        ...visibilitySettings(post),
    };
}

function mapToAnnouncementValues(post: ApiPost): AnnouncementDraftValues {
    const en = post.locales?.en ?? {};
    const fr = post.locales?.fr;
    return {
        lang: "en",
        title: en.title ?? "",
        titleFr: fr?.title ?? "",
        description: en.body ?? "",
        descriptionFr: fr?.body ?? "",
        images: post.images ?? [],
        ...commentSettings(post),
        ...visibilitySettings(post),
    };
}

export default function EditPostScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const authApi = useApi();
    const { showToast } = useToast();
    const { colors: C } = useTheme();
    const [post, setPost] = useState<ApiPost | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;
        authApi<ApiPost>(`/posts/${id}`)
            .then(setPost)
            .catch(() => { showToast("Could not load post for editing.", "error"); router.back(); })
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top"]}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                    <ActivityIndicator color={C.primary} />
                </View>
            </SafeAreaView>
        );
    }

    if (!post) return null;

    const onBack = () => router.back();
    const onSuccess = () => router.back();

    if (post.type === "EVENT") {
        return (
            <CreateEventForm
                onBack={onBack}
                onSuccess={onSuccess}
                initialValues={mapToEventValues(post)}
                postId={id}
                seriesId={post.seriesId}
            />
        );
    }

    if (post.type === "POLL") {
        return (
            <CreatePollForm
                onBack={onBack}
                onSuccess={onSuccess}
                initialValues={mapToPollValues(post)}
                postId={id}
            />
        );
    }

    if (post.type === "ANNOUNCEMENT") {
        return (
            <CreateAnnouncementForm
                onBack={onBack}
                onSuccess={onSuccess}
                initialValues={mapToAnnouncementValues(post)}
                postId={id}
            />
        );
    }

    return null;
}
