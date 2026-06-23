import { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import ProfilePage from "../../components/profile/ProfileScreen";
import ClubProfileView from "../../components/ClubProfileView";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../auth/AuthContext";
import { useLang, pickLocale } from "../../lib/LangContext";
import { useToast } from "../../lib/ToastContext";
import { ProfileSkeleton } from "../../components/SkeletonLoader";
import { useTheme } from "../../lib/ThemeContext";


type ApiUser = {
    id: string;
    email: string;
    type: string;
    firstName?: string;
    lastName?: string;
    clubName?: string;
    program?: string;
    year?: string;
    avatarUrl?: string;
    description?: string;
    _count: { follows: number; rsvps: number };
};

type ApiClub = {
    id: string;
    clubName: string;
    category: string;
    description?: string;
    descriptionFr?: string;
    _count: { followedBy: number };
    notifPref: string;
};

type ApiPost = {
    id: string;
    type: string;
    locales: any;
    createdAt: string;
    startAt?: string;
    locationName?: string;
    club?: { id: string; clubName?: string };
    _count: { likes: number; comments: number; rsvps?: number };
};

type ApiActivity = {
    id: string;
    action: "like" | "comment";
    clubId: string;
    clubName: string;
    type: string;
    content: string;
    timestamp: string;
    actionTime: string;
    likes: number;
    comments: number;
};

type Attendance = {
    total: number;
    thisSemester: number;
    semesterLabel: string;
    events: { id: string; title: string; clubName: string; startAt?: string; checkedAt: string }[];
};

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

export default function ProfileScreen() {
    const { session, signOut } = useAuth();
    const authApi = useApi();
    const { lang } = useLang();
    const { showToast } = useToast();
    const isFocused = useIsFocused();
    const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
    const { colors: C } = useTheme();
    const PAGE = 20;
    const [user, setUser] = useState<ApiUser | null>(null);
    const [followedClubs, setFollowedClubs] = useState<ApiClub[]>([]);
    const [myPosts, setMyPosts] = useState<ApiPost[]>([]);
    const [rsvpPosts, setRsvpPosts] = useState<ApiPost[]>([]);
    const [bookmarkedPosts, setBookmarkedPosts] = useState<ApiPost[]>([]);
    const [activityPosts, setActivityPosts] = useState<ApiActivity[]>([]);
    const [attendance, setAttendance] = useState<Attendance | null>(null);
    const [followedTopics, setFollowedTopics] = useState<Set<string>>(new Set());
    const [refreshing, setRefreshing] = useState(false);
    const [hasMoreRsvps, setHasMoreRsvps] = useState(false);
    const [hasMoreBookmarks, setHasMoreBookmarks] = useState(false);
    const [hasMoreActivity, setHasMoreActivity] = useState(false);
    const [loadingMoreRsvps, setLoadingMoreRsvps] = useState(false);
    const [loadingMoreBookmarks, setLoadingMoreBookmarks] = useState(false);
    const [loadingMoreActivity, setLoadingMoreActivity] = useState(false);

    const loadProfile = useCallback((isRefresh = false) => {
        if (!session?.token) return;
        if (isRefresh) setRefreshing(true);
        authApi<ApiUser>("/users/me").then((u) => {
            setUser(u);
            if (u.type === "CLUB") {
                authApi<ApiPost[]>("/posts/mine?isDraft=false").then(setMyPosts).catch(() => {});
            } else {
                authApi<ApiPost[]>(`/users/me/rsvps?limit=${PAGE}&offset=0`).then((d) => {
                    setRsvpPosts(d); setHasMoreRsvps(d.length === PAGE);
                }).catch(() => {});
                authApi<ApiPost[]>(`/users/me/bookmarks?limit=${PAGE}&offset=0`).then((d) => {
                    setBookmarkedPosts(d); setHasMoreBookmarks(d.length === PAGE);
                }).catch(() => {});
                authApi<ApiActivity[]>(`/users/me/activity?limit=${PAGE}&offset=0`).then((d) => {
                    setActivityPosts(d); setHasMoreActivity(d.length === PAGE);
                }).catch(() => {});
                authApi<Attendance>("/users/me/attendance").then(setAttendance).catch(() => {});
                authApi<string[]>("/users/me/topics").then((tp) => setFollowedTopics(new Set(tp))).catch(() => {});
            }
        }).catch(() => showToast("Could not load profile. Pull down to retry.", "error")).finally(() => { if (isRefresh) setRefreshing(false); });
        authApi<ApiClub[]>("/users/me/follows").then(setFollowedClubs).catch(() => {});
    }, [session?.token]);

    const toggleTopic = useCallback((category: string) => {
        let wasFollowing = false;
        setFollowedTopics((prev) => {
            wasFollowing = prev.has(category);
            const next = new Set(prev);
            wasFollowing ? next.delete(category) : next.add(category);
            return next;
        });
        authApi(
            wasFollowing ? `/users/me/topics/${encodeURIComponent(category)}` : "/users/me/topics",
            wasFollowing ? { method: "DELETE" } : { method: "POST", body: JSON.stringify({ category }) },
        ).catch(() => {
            setFollowedTopics((prev) => {
                const next = new Set(prev);
                wasFollowing ? next.add(category) : next.delete(category);
                return next;
            });
        });
    }, [authApi]);

    const loadMoreRsvps = useCallback(async () => {
        if (loadingMoreRsvps || !hasMoreRsvps) return;
        setLoadingMoreRsvps(true);
        try {
            const more = await authApi<ApiPost[]>(`/users/me/rsvps?limit=${PAGE}&offset=${rsvpPosts.length}`);
            setRsvpPosts((prev) => [...prev, ...more]);
            setHasMoreRsvps(more.length === PAGE);
        } catch {} finally { setLoadingMoreRsvps(false); }
    }, [loadingMoreRsvps, hasMoreRsvps, rsvpPosts.length]);

    const loadMoreBookmarks = useCallback(async () => {
        if (loadingMoreBookmarks || !hasMoreBookmarks) return;
        setLoadingMoreBookmarks(true);
        try {
            const more = await authApi<ApiPost[]>(`/users/me/bookmarks?limit=${PAGE}&offset=${bookmarkedPosts.length}`);
            setBookmarkedPosts((prev) => [...prev, ...more]);
            setHasMoreBookmarks(more.length === PAGE);
        } catch {} finally { setLoadingMoreBookmarks(false); }
    }, [loadingMoreBookmarks, hasMoreBookmarks, bookmarkedPosts.length]);

    const loadMoreActivity = useCallback(async () => {
        if (loadingMoreActivity || !hasMoreActivity) return;
        setLoadingMoreActivity(true);
        try {
            const more = await authApi<ApiActivity[]>(`/users/me/activity?limit=${PAGE}&offset=${activityPosts.length}`);
            setActivityPosts((prev) => [...prev, ...more]);
            setHasMoreActivity(more.length === PAGE);
        } catch {} finally { setLoadingMoreActivity(false); }
    }, [loadingMoreActivity, hasMoreActivity, activityPosts.length]);

    useEffect(() => {
        if (!isFocused) return;
        loadProfile();
    }, [isFocused]);

    // Club — render their own profile inline (no header, tab bar stays visible)
    if (session?.userType === "CLUB" && session?.userId) {
        return <ClubProfileView id={session.userId} isProfileTab />;
    }

    // Guest session — no token
    if (session?.role === "guest") {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top"]}>
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
                    {/* Avatar placeholder */}
                    <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: C.border, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                        <Ionicons name="person-outline" size={36} color={C.textLight} />
                    </View>

                    <Text style={{ fontSize: 10, fontWeight: "800", color: C.textLight, letterSpacing: 2, marginBottom: 4 }}>
                        BROWSING AS GUEST
                    </Text>
                    <Text style={{ fontSize: 22, fontWeight: "900", color: C.text, letterSpacing: -0.5, marginBottom: 8 }}>
                        You're not signed in
                    </Text>
                    <Text style={{ fontSize: 14, color: C.textMuted, textAlign: "center", lineHeight: 21, marginBottom: 32, maxWidth: 280 }}>
                        Create a free account to follow clubs, RSVP to events, bookmark posts, and build your personal campus feed.
                    </Text>

                    <Pressable
                        onPress={signOut}
                        style={{ backgroundColor: C.primary, paddingHorizontal: 32, paddingVertical: 14, width: "100%", alignItems: "center", marginBottom: 12 }}
                    >
                        <Text style={{ fontSize: 12, fontWeight: "900", color: "#fff", letterSpacing: 2 }}>CREATE ACCOUNT</Text>
                    </Pressable>
                    <Pressable onPress={signOut} style={{ paddingVertical: 8 }}>
                        <Text style={{ fontSize: 13, color: C.textMuted }}>
                            Already have an account? <Text style={{ fontWeight: "800", color: C.text }}>LOG IN</Text>
                        </Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    if (!user) {
        return (
            <View style={{ flex: 1, backgroundColor: C.bg }}>
                <ProfileSkeleton />
            </View>
        );
    }

    const mappedUser = {
        id: user.id,
        name: user.type === "CLUB"
            ? (user.clubName || user.email)
            : ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email),
        email: user.email,
        program: user.program || "",
        year: user.year || "",
        avatar: user.avatarUrl,
        clubsFollowing: user._count?.follows ?? 0,
        eventsAttended: attendance?.total ?? 0,
        description: user.description,
        role: user.type,
    };

    const mappedClubs = followedClubs.map((c) => ({
        id: c.id,
        name: c.clubName ?? "",
        desc: (lang === "fr" && c.descriptionFr ? c.descriptionFr : c.description) ?? "",
        members: c._count.followedBy,
        category: c.category ?? "",
        notifPref: c.notifPref,
    }));

    const mappedMyPosts = myPosts.map((p) => {
        const loc = pickLocale(p.locales, lang);
        return {
            id: p.id,
            type: p.type,
            title: loc.title ?? "",
            body: loc.body ?? "",
            timeAgo: timeAgo(p.createdAt),
            likes: p._count.likes,
            comments: p._count.comments,
        };
    });

    const mappedRsvps = rsvpPosts.map((p) => {
        const loc = pickLocale(p.locales, lang);
        return {
            id: p.id,
            name: loc.title ?? "",
            posterUrl: loc.imageUrl,
            countdown: p.startAt ? new Date(p.startAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "",
            location: p.locationName ?? "",
            clubName: p.club?.clubName ?? "",
            desc: loc.body,
            startAt: p.startAt,
        };
    });

    const mappedBookmarks = bookmarkedPosts.map((p) => {
        const loc = pickLocale(p.locales, lang);
        return {
            id: p.id,
            clubId: p.club?.id ?? "",
            clubName: p.club?.clubName ?? "",
            type: p.type.toLowerCase() as any,
            content: loc.body ?? loc.title ?? "",
            timestamp: timeAgo(p.createdAt),
            imageUrl: loc.imageUrl,
            likes: p._count.likes,
            comments: p._count.comments,
        };
    });

    const mappedActivity = activityPosts.map((a) => ({
        id: a.id,
        action: a.action,
        clubId: a.clubId,
        clubName: a.clubName,
        type: a.type as any,
        content: a.content,
        timestamp: timeAgo(a.timestamp),
        actionTime: timeAgo(a.actionTime),
        likes: a.likes,
        comments: a.comments,
    }));

    return (
        <ProfilePage
            user={mappedUser}
            followedClubs={mappedClubs}
            rsvpEvents={mappedRsvps}
            savedPosts={mappedBookmarks}
            activityPosts={mappedActivity}
            myPosts={mappedMyPosts}
            attendedThisSemester={attendance?.thisSemester ?? 0}
            attendanceSemesterLabel={attendance?.semesterLabel}
            followedTopics={[...followedTopics]}
            onToggleTopic={toggleTopic}
            initialTab={tabParam === "saved" ? "saved" : "feed"}
            refreshing={refreshing}
            onRefresh={() => loadProfile(true)}
            onLoadMoreRsvps={hasMoreRsvps ? loadMoreRsvps : undefined}
            onLoadMoreSaved={hasMoreBookmarks ? loadMoreBookmarks : undefined}
            onLoadMoreActivity={hasMoreActivity ? loadMoreActivity : undefined}
            loadingMoreRsvps={loadingMoreRsvps}
            loadingMoreSaved={loadingMoreBookmarks}
            loadingMoreActivity={loadingMoreActivity}
        />
    );
}
