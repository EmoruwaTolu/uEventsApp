import React, { useState, useMemo, useRef } from "react";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../auth/AuthContext";
import { useT, useLang } from "../../lib/LangContext";
import { translateCategory } from "../../lib/categories";
import { useLikes } from "../../lib/LikeContext";
import { useBookmarks } from "../../lib/BookmarkContext";
import { useReduceMotion } from "../../lib/useReduceMotion";
import * as Haptics from "expo-haptics";
import {
    View,
    Text,
    ScrollView,
    Pressable,
    StyleSheet,
    Image,
    Animated,
    TextInput,
    ActivityIndicator,
    RefreshControl,
} from "react-native";
import ModalScreen from "../ModalScreen";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/ThemeContext";
import type { AppColors } from "../../styles/theme";
import { EVENT_TAGS } from "../../lib/eventTags";

const BURGUNDY = "#8C0327";

type User = {
    id: string;
    name: string;
    email: string;
    program: string;
    year: string;
    avatar?: string;
    clubsFollowing: number;
    eventsAttended: number;
    description?: string;
    role?: string;
};

type FollowedClub = {
    id: string;
    name: string;
    desc: string;
    members: number;
    category: string;
    notifPref?: string;
    logoUrl?: string;
};

type RSVPEvent = {
    id: string;
    name: string;
    posterUrl?: string;
    countdown: string;
    location: string;
    clubName: string;
    desc?: string;
    startAt?: string;
};

type SavedPost = {
    id: string;
    clubId: string;
    clubName: string;
    type: "event" | "announcement" | "update" | "poll";
    content: string;
    timestamp: string;
    imageUrl?: string;
    likes: number;
    comments: number;
    isLiked?: boolean;
};

type ActivityPost = {
    id: string;
    action: "like" | "comment";
    clubId: string;
    clubName: string;
    type: "event" | "announcement" | "update" | "poll";
    content: string;
    timestamp: string;
    actionTime: string;
    likes: number;
    comments: number;
};

type FeedTab = "feed" | "rsvps" | "saved";

type MyPost = {
    id: string;
    type: string;
    title: string;
    body: string;
    timeAgo: string;
    likes: number;
    comments: number;
};

function soonLabel(isoString?: string): "TODAY" | "TOMORROW" | "THIS WEEK" | null {
    if (!isoString) return null;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(isoString);
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const diffDays = Math.round((startDay.getTime() - todayStart.getTime()) / 86400000);
    if (diffDays < 0) return null;
    if (diffDays === 0) return "TODAY";
    if (diffDays === 1) return "TOMORROW";
    if (diffDays <= 7) return "THIS WEEK";
    return null;
}

function fmtCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
}

function ClubInitials({ name, size = 44 }: { name: string; size?: number }) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    return (
        <View style={[s.clubInitialsBox, { width: size, height: size }]}>
            <Text style={[s.clubInitialsText, { fontSize: size * 0.33 }]}>{initials}</Text>
        </View>
    );
}

export default function ProfilePage({
    user,
    followedClubs,
    rsvpEvents,
    savedPosts,
    activityPosts,
    myPosts = [],
    attendedThisSemester = 0,
    attendanceSemesterLabel,
    followedTopics = [],
    onToggleTopic,
    initialTab = "feed",
    refreshing = false,
    onRefresh,
    onLoadMoreRsvps,
    onLoadMoreSaved,
    onLoadMoreActivity,
    loadingMoreRsvps = false,
    loadingMoreSaved = false,
    loadingMoreActivity = false,
}: {
    user: User;
    followedClubs: FollowedClub[];
    rsvpEvents: RSVPEvent[];
    savedPosts: SavedPost[];
    activityPosts: ActivityPost[];
    myPosts?: MyPost[];
    attendedThisSemester?: number;
    attendanceSemesterLabel?: string;
    followedTopics?: string[];
    onToggleTopic?: (category: string) => void;
    initialTab?: FeedTab;
    refreshing?: boolean;
    onRefresh?: () => void;
    onLoadMoreRsvps?: () => void;
    onLoadMoreSaved?: () => void;
    onLoadMoreActivity?: () => void;
    loadingMoreRsvps?: boolean;
    loadingMoreSaved?: boolean;
    loadingMoreActivity?: boolean;
}) {
    const router = useRouter();
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);

    const t = useT();
    const { lang } = useLang();
    const [tab, setTab] = useState<FeedTab>(initialTab);
    const [editOpen, setEditOpen] = useState(false);
    const [clubsModalOpen, setClubsModalOpen] = useState(false);
    const [savedModalOpen, setSavedModalOpen] = useState(false);
    const [notifModal, setNotifModal] = useState<{ clubId: string; name: string } | null>(null);
    const [notifPrefs, setNotifPrefs] = useState<Record<string, string>>(
        () => Object.fromEntries(followedClubs.map((c) => [c.id, c.notifPref ?? "ALL"]))
    );
    const [draftName, setDraftName] = useState(user.name);
    const [draftProgram, setDraftProgram] = useState(user.program);
    const [draftYear, setDraftYear] = useState(user.year);
    const [description, setDescription] = useState(user.description ?? "");
    const [draftDesc, setDraftDesc] = useState(user.description ?? "");
    const [saving, setSaving] = useState(false);
    const isClub = user.role === "CLUB";
    const authApi = useApi();

    function openEditModal() {
        setDraftDesc(description);
        setDraftName(user.name);
        setDraftProgram(user.program);
        setDraftYear(user.year);
        setEditOpen(true);
    }

    const TABS: { key: FeedTab; label: string }[] = [
        { key: "feed",  label: t.activity },
        { key: "rsvps", label: t.events },
        { key: "saved", label: t.saved },
    ];

    const clubsModal = (
        <ModalScreen visible={clubsModalOpen} onClose={() => setClubsModalOpen(false)} title={t.clubsYouFollow} subtitle={`${followedClubs.length} ${t.clubs}`}>
            <View style={{ paddingHorizontal: 20 }}>
                <ClubList
                    clubs={followedClubs}
                    notifPrefs={notifPrefs}
                    onNavigate={(id) => { setClubsModalOpen(false); router.push(`/club/${id}` as any); }}
                    onBell={(clubId, name) => setNotifModal({ clubId, name })}
                    showDividerAfterLast={false}
                />
            </View>
        </ModalScreen>
    );

    const savedModal = (
        <ModalScreen visible={savedModalOpen} onClose={() => setSavedModalOpen(false)} title={t.saved} subtitle={`${savedPosts.length} ${t.saved.toLowerCase()}`}>
            <View style={s.feedBlock}>
                {savedPosts.map((post) => (
                    <SavedCard key={post.id} post={post} onPress={() => { setSavedModalOpen(false); router.push((post.type === "event" ? `/event/${post.id}` : `/post/${post.id}`) as any); }} />
                ))}
                {onLoadMoreSaved && (
                    <Pressable style={s.loadMoreBtn} onPress={onLoadMoreSaved} disabled={loadingMoreSaved}>
                        {loadingMoreSaved ? <ActivityIndicator color={BURGUNDY} size="small" /> : <Text style={s.loadMoreText}>{t.loadMore}</Text>}
                    </Pressable>
                )}
            </View>
        </ModalScreen>
    );

    return (
        <SafeAreaView style={s.safe} edges={["top"]}>
            {isClub ? (
            <>
            {/* Editorial masthead */}
            <View style={s.masthead}>
                <View style={s.mastheadRow}>
                    <Text style={s.mastheadLabel}>{t.yourProfile}</Text>
                    <View style={s.mastheadActions}>
                        <Pressable
                            onPress={openEditModal}
                            style={s.iconBtn}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Edit profile"
                        >
                            <Ionicons name="pencil-outline" size={18} color={C.textBody} />
                        </Pressable>
                        <Pressable onPress={() => router.push("/settings" as any)} style={s.iconBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Settings">
                            <Ionicons name="settings-outline" size={18} color={C.textBody} />
                        </Pressable>
                    </View>
                </View>
                <View style={s.mastheadIdentity}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.mastheadName} numberOfLines={2}>{(user.name || "").toUpperCase()}</Text>
                        <View style={s.mastheadAccent} />
                    </View>
                    {user.avatar ? (
                        <Image source={{ uri: user.avatar }} style={s.mastheadAvatar} />
                    ) : (
                        <View style={s.mastheadAvatarPlaceholder}>
                            <Text style={s.mastheadAvatarInitial}>{(user.name || "?").charAt(0).toUpperCase()}</Text>
                        </View>
                    )}
                </View>
                {/* Dark stats strip — flush to masthead bottom */}
                <View style={s.statsStrip}>
                    <View style={s.stat}>
                        <Text style={s.statNum}>{fmtCount(user.clubsFollowing)}</Text>
                        <Text style={s.statLabel}>{t.following}</Text>
                    </View>
                    <View style={s.statDivider} />
                    <View style={s.stat}>
                        <Text style={s.statNum}>{fmtCount(user.eventsAttended)}</Text>
                        <Text style={s.statLabel}>{t.events}</Text>
                    </View>
                    <View style={s.statDivider} />
                    <View style={s.stat}>
                        <Text style={s.statNum}>{fmtCount(rsvpEvents.length)}</Text>
                        <Text style={s.statLabel}>{t.statUpcoming}</Text>
                    </View>
                </View>
                {!isClub && attendedThisSemester > 0 && (
                    <View style={s.semesterRecap}>
                        <Ionicons name="sparkles-outline" size={13} color={BURGUNDY} />
                        <Text style={s.semesterRecapText}>
                            {attendedThisSemester} {attendedThisSemester === 1 ? "event" : "events"} attended{attendanceSemesterLabel ? ` this ${attendanceSemesterLabel.split(" ")[0].toLowerCase()} term` : " this semester"}
                        </Text>
                    </View>
                )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BURGUNDY} /> : undefined}>

                {/* About card */}
                <View style={s.card}>
                    <View style={s.cardHeader}>
                        <Text style={s.cardLabel}>{t.about}</Text>
                    </View>
                    {isClub ? (
                        description ? (
                            <Text style={s.aboutText}>{description}</Text>
                        ) : (
                            <Text style={[s.aboutText, { color: C.textMuted, fontStyle: "italic" }]}>
                                {t.noDescription}
                            </Text>
                        )
                    ) : (
                        <View style={s.aboutBody}>
                            {user.program ? (
                                <View style={s.aboutDetailRow}>
                                    <Text style={s.aboutDetailLabel}>{t.fieldProgram}</Text>
                                    <Text style={s.aboutDetailValue}>{user.program}</Text>
                                </View>
                            ) : null}
                            {user.year ? (
                                <View style={s.aboutDetailRow}>
                                    <Text style={s.aboutDetailLabel}>{t.fieldYear}</Text>
                                    <Text style={s.aboutDetailValue}>{user.year}</Text>
                                </View>
                            ) : null}
                            <View style={[s.aboutDetailRow, { borderBottomWidth: 0 }]}>
                                <Text style={s.aboutDetailLabel}>{t.emailLabel}</Text>
                                <Text style={[s.aboutDetailValue, s.aboutLink]}>{user.email}</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Followed clubs card */}
                {followedClubs.length > 0 && (
                    <View style={s.card}>
                        <View style={s.cardHeader}>
                            <Text style={s.cardLabel}>{t.following}</Text>
                            <Text style={s.cardCount}>{followedClubs.length} {t.clubs}</Text>
                        </View>
                        <ClubList
                            clubs={followedClubs.slice(0, 2)}
                            notifPrefs={notifPrefs}
                            onNavigate={(id) => router.push(`/club/${id}` as any)}
                            onBell={(clubId, name) => setNotifModal({ clubId, name })}
                            showDividerAfterLast={false}
                        />
                        {followedClubs.length > 2 && (
                            <Pressable style={s.seeMoreBtn} onPress={() => setClubsModalOpen(true)}>
                                <View style={s.seeMorePill}>
                                    <Text style={s.seeMoreText}>
                                        +{followedClubs.length - 2} MORE
                                    </Text>
                                    <Ionicons name="chevron-forward" size={11} color={C.primary} />
                                </View>
                            </Pressable>
                        )}
                    </View>
                )}

                {/* Feed tabs */}
                <View style={s.tabBar}>
                    {TABS.map(({ key, label }) => (
                        <Pressable key={key} onPress={() => setTab(key)} style={s.tabItem} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} accessibilityLabel={label}>
                            <Text style={[s.tabLabel, tab === key && s.tabLabelActive]}>{label}</Text>
                            {tab === key && <View style={s.tabUnderline} />}
                        </Pressable>
                    ))}
                </View>

                {/* Tab content */}
                <View style={s.feedBlock}>
                    {/* ALL FEED */}
                    {tab === "feed" && (
                        isClub ? (
                            myPosts.length === 0 ? (
                                <EmptyState icon="megaphone-outline" text={t.noPostsYet} ctaLabel="Create a post" onCta={() => router.push("/(tabs)/create" as any)} />
                            ) : (
                                myPosts.map((post, idx) => (
                                    <View key={post.id}>
                                        <MyPostCard post={post} onPress={() => router.push((post.type === "event" ? `/event/${post.id}` : `/post/${post.id}`) as any)} />
                                        {idx < myPosts.length - 1 && <View style={s.divider} />}
                                    </View>
                                ))
                            )
                        ) : (
                            activityPosts.length === 0 ? (
                                <View style={s.emptyState}>
                                    <Ionicons name="pulse-outline" size={32} color={C.textFaint} />
                                    <Text style={s.emptyText}>{t.noActivityYet}</Text>
                                    <Text style={[s.emptyText, { fontSize: 12, color: C.textMuted, marginTop: 4 }]}>
                                        {t.noActivityDesc}
                                    </Text>
                                    {followedClubs.length === 0 && (
                                        <Pressable
                                            onPress={() => router.push("/(tabs)/search" as any)}
                                            style={{ marginTop: 12, backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10 }}
                                        >
                                            <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff", letterSpacing: 1.5 }}>{t.discoverClubs}</Text>
                                        </Pressable>
                                    )}
                                </View>
                            ) : (
                                <>
                                    {activityPosts.map((post, idx) => {
                                        const postId = post.id.replace(/_like$|_comment$/, "");
                                        return (
                                            <View key={post.id}>
                                                <ActivityCard post={post} onPress={() => router.push((post.type === "event" ? `/event/${postId}` : `/post/${postId}`) as any)} />
                                                {idx < activityPosts.length - 1 && <View style={s.divider} />}
                                            </View>
                                        );
                                    })}
                                    {onLoadMoreActivity && (
                                        <Pressable style={s.loadMoreBtn} onPress={onLoadMoreActivity} disabled={loadingMoreActivity}>
                                            {loadingMoreActivity
                                                ? <ActivityIndicator color={BURGUNDY} size="small" />
                                                : <Text style={s.loadMoreText}>{t.loadMore}</Text>}
                                        </Pressable>
                                    )}
                                </>
                            )
                        )
                    )}

                    {/* EVENTS — RSVPs */}
                    {tab === "rsvps" && (
                        rsvpEvents.length === 0 ? (
                            <EmptyState icon="calendar-outline" text={t.noUpcomingRsvps} ctaLabel="Browse events" onCta={() => router.push("/(tabs)/events" as any)} />
                        ) : (
                            <>
                                {rsvpEvents.map((event, idx) => (
                                    <View key={event.id}>
                                        <RSVPCard event={event} onPress={() => router.push({ pathname: "/event/[id]", params: { id: event.id } })} />
                                        {idx < rsvpEvents.length - 1 && <View style={s.divider} />}
                                    </View>
                                ))}
                                {onLoadMoreRsvps && (
                                    <Pressable style={s.loadMoreBtn} onPress={onLoadMoreRsvps} disabled={loadingMoreRsvps}>
                                        {loadingMoreRsvps
                                            ? <ActivityIndicator color={BURGUNDY} size="small" />
                                            : <Text style={s.loadMoreText}>{t.loadMore}</Text>}
                                    </Pressable>
                                )}
                            </>
                        )
                    )}

                    {/* SAVED */}
                    {tab === "saved" && (
                        savedPosts.length === 0 ? (
                            <EmptyState icon="bookmark-outline" text={t.noSavedPosts} ctaLabel="Explore feed" onCta={() => router.push("/(tabs)" as any)} />
                        ) : (
                            <>
                                {savedPosts.map((post, idx) => (
                                    <View key={post.id}>
                                        <SavedCard
                                            post={post}
                                            onPress={() => router.push(
                                                post.type === "event"
                                                    ? `/event/${post.id}` as any
                                                    : `/post/${post.id}` as any
                                            )}
                                        />
                                        {idx < savedPosts.length - 1 && <View style={s.divider} />}
                                    </View>
                                ))}
                                {onLoadMoreSaved && (
                                    <Pressable style={s.loadMoreBtn} onPress={onLoadMoreSaved} disabled={loadingMoreSaved}>
                                        {loadingMoreSaved
                                            ? <ActivityIndicator color={BURGUNDY} size="small" />
                                            : <Text style={s.loadMoreText}>{t.loadMore}</Text>}
                                    </Pressable>
                                )}
                            </>
                        )
                    )}
                </View>

                <View style={{ height: 60 }} />
            </ScrollView>
            </>
            ) : (
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 60 }}
                refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BURGUNDY} /> : undefined}
            >
                {/* Top bar */}
                <View style={s.spTopBar}>
                    <Text style={s.mastheadLabel}>{t.yourProfile}</Text>
                    <View style={s.mastheadActions}>
                        <Pressable onPress={openEditModal} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Edit profile">
                            <Ionicons name="pencil-outline" size={18} color={C.textBody} />
                        </Pressable>
                        <Pressable onPress={() => router.push("/settings" as any)} style={s.iconBtn} accessibilityRole="button" accessibilityLabel="Settings">
                            <Ionicons name="settings-outline" size={18} color={C.textBody} />
                        </Pressable>
                    </View>
                </View>

                {/* Identity */}
                <View style={s.spIdentity}>
                    {user.avatar ? (
                        <Image source={{ uri: user.avatar }} style={s.spAvatar} />
                    ) : (
                        <View style={[s.spAvatar, s.spAvatarPlaceholder]}>
                            <Text style={s.spAvatarInitial}>{(user.name || "?").charAt(0).toUpperCase()}</Text>
                        </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.spName} numberOfLines={2}>{user.name}</Text>
                        <Text style={s.spSub} numberOfLines={1}>
                            {[user.program, user.year ? `${t.fieldYear} ${user.year}` : null].filter(Boolean).join(" · ") || user.email}
                        </Text>
                    </View>
                </View>
                <View style={s.spAccent} />

                {/* This term */}
                <View style={s.spTermCard}>
                    <Text style={s.spTermEyebrow}>{attendanceSemesterLabel ? attendanceSemesterLabel.toUpperCase() : "THIS TERM"}</Text>
                    <View style={s.spTermRow}>
                        <Text style={s.spTermNum}>{attendedThisSemester}</Text>
                        <Text style={s.spTermLabel}>{attendedThisSemester === 1 ? "event attended" : "events attended"}</Text>
                    </View>
                    <View style={s.spCountRow}>
                        <View style={s.spCount}><Text style={s.spCountNum}>{fmtCount(user.clubsFollowing)}</Text><Text style={s.spCountLabel}>{t.following}</Text></View>
                        <View style={s.spCount}><Text style={s.spCountNum}>{fmtCount(savedPosts.length)}</Text><Text style={s.spCountLabel}>{t.saved}</Text></View>
                        <View style={s.spCount}><Text style={s.spCountNum}>{fmtCount(rsvpEvents.length)}</Text><Text style={s.spCountLabel}>{t.statUpcoming}</Text></View>
                    </View>
                </View>

                {/* Saved */}
                <View style={s.spSectionHeader}>
                    <Text style={s.spSectionTitle}>{t.saved}</Text>
                    {savedPosts.length > 0 && <Text style={s.spSectionCount}>{savedPosts.length}</Text>}
                    <View style={s.spSectionLine} />
                </View>
                {savedPosts.length === 0 ? (
                    <EmptyState icon="bookmark-outline" text={t.noSavedPosts} ctaLabel="Explore feed" onCta={() => router.push("/(tabs)" as any)} />
                ) : (
                    <>
                        <View style={s.feedBlock}>
                            {savedPosts.slice(0, 3).map((post) => (
                                <SavedCard key={post.id} post={post} onPress={() => router.push((post.type === "event" ? `/event/${post.id}` : `/post/${post.id}`) as any)} />
                            ))}
                        </View>
                        {savedPosts.length > 3 && (
                            <Pressable style={s.spViewAllLink} onPress={() => setSavedModalOpen(true)} accessibilityRole="button" accessibilityLabel="View all saved">
                                <Text style={s.spViewAllText}>{t.viewAll} {savedPosts.length}</Text>
                                <Ionicons name="chevron-forward" size={12} color={C.primary} />
                            </Pressable>
                        )}
                    </>
                )}

                {/* Clubs you follow */}
                <View style={s.spSectionHeader}>
                    <Text style={s.spSectionTitle}>{t.clubsYouFollow}</Text>
                    {followedClubs.length > 0 && <Text style={s.spSectionCount}>{followedClubs.length}</Text>}
                    <View style={s.spSectionLine} />
                </View>
                {followedClubs.length === 0 ? (
                    <EmptyState icon="people-outline" text={t.notFollowingAnyone} ctaLabel={t.discoverClubs} onCta={() => router.push("/(tabs)/search" as any)} />
                ) : (
                    <View style={s.card}>
                        <ClubList
                            clubs={followedClubs.slice(0, 3)}
                            notifPrefs={notifPrefs}
                            onNavigate={(id) => router.push(`/club/${id}` as any)}
                            onBell={(clubId, name) => setNotifModal({ clubId, name })}
                            showDividerAfterLast={false}
                        />
                        {followedClubs.length > 3 && (
                            <Pressable style={s.spViewAll} onPress={() => setClubsModalOpen(true)} accessibilityRole="button" accessibilityLabel="View all clubs">
                                <Text style={s.spViewAllText}>{t.viewAll} {followedClubs.length}</Text>
                                <Ionicons name="chevron-forward" size={12} color={C.primary} />
                            </Pressable>
                        )}
                    </View>
                )}

                {/* Your interests */}
                <View style={s.spSectionHeader}>
                    <Text style={s.spSectionTitle}>{t.yourInterests}</Text>
                    <View style={s.spSectionLine} />
                </View>
                <View style={s.spChips}>
                    {EVENT_TAGS.map((tag) => {
                        const on = followedTopics.includes(tag);
                        return (
                            <Pressable
                                key={tag}
                                onPress={() => onToggleTopic?.(tag)}
                                style={[s.spChip, on && s.spChipActive]}
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={`${on ? t.unfollowWord : t.followWord} ${translateCategory(tag, lang)}`}
                            >
                                {on && <Ionicons name="checkmark" size={12} color="#fff" />}
                                <Text style={[s.spChipText, on && s.spChipTextActive]} maxFontSizeMultiplier={1.3}>{translateCategory(tag, lang).toUpperCase()}</Text>
                            </Pressable>
                        );
                    })}
                </View>

                <View style={{ height: 60 }} />
            </ScrollView>
            )}

            {clubsModal}
            {savedModal}

            {/* Notification pref modal */}
            <ModalScreen visible={!!notifModal} onClose={() => setNotifModal(null)} title={notifModal?.name ?? ""} subtitle={t.notifPreference}>
                    <View style={s.sheetBody}>
                        {([
                            { key: "ALL",    icon: "notifications",            label: t.notifAll,        desc: t.notifAllDesc },
                            { key: "EVENTS", icon: "notifications-outline",    label: t.notifEventsOnly, desc: t.notifEventsOnlyDesc },
                            { key: "NONE",   icon: "notifications-off-outline",label: t.notifMuted,      desc: t.notifMutedDesc },
                        ] as const).map(({ key, icon, label, desc }) => {
                            const selected = (notifPrefs[notifModal?.clubId ?? ""] ?? "ALL") === key;
                            return (
                                <Pressable
                                    key={key}
                                    style={[s.notifOptRow, selected && s.notifOptRowActive]}
                                    onPress={async () => {
                                        const clubId = notifModal!.clubId;
                                        const prevPref = notifPrefs[clubId] ?? "ALL";
                                        setNotifPrefs((prev) => ({ ...prev, [clubId]: key }));
                                        setNotifModal(null);
                                        try {
                                            await authApi(`/clubs/${clubId}/follow/notif-pref`, {
                                                method: "PATCH",
                                                body: JSON.stringify({ notifPref: key }),
                                            });
                                        } catch {
                                            setNotifPrefs((prev) => ({ ...prev, [clubId]: prevPref }));
                                        }
                                    }}
                                >
                                    <Ionicons name={icon} size={18} color={selected ? C.primary : C.textMuted} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.notifOptLabel, selected && { color: C.primary }]}>{label}</Text>
                                        <Text style={s.notifOptDesc}>{desc}</Text>
                                    </View>
                                    {selected && <Ionicons name="checkmark" size={16} color={C.primary} />}
                                </Pressable>
                            );
                        })}
                    </View>
            </ModalScreen>

            {/* Edit profile modal */}
            <ModalScreen visible={editOpen} onClose={() => setEditOpen(false)} title={t.editProfile}>
                    <View style={s.sheetBody}>
                        <View style={s.modalFields}>
                            {isClub ? (
                                <>
                                    <View style={s.fieldBlock}>
                                        <Text style={s.fieldLabel}>{t.displayName}</Text>
                                        <TextInput
                                            style={s.fieldInput}
                                            value={draftName}
                                            onChangeText={setDraftName}
                                            placeholder="Club name"
                                            placeholderTextColor={C.textFaint}
                                        />
                                    </View>
                                    <View style={s.fieldBlock}>
                                        <Text style={s.fieldLabel}>{t.fieldDescription}</Text>
                                        <TextInput
                                            style={[s.fieldInput, { minHeight: 120, textAlignVertical: "top" }]}
                                            value={draftDesc}
                                            onChangeText={setDraftDesc}
                                            multiline
                                            placeholder="Describe your club..."
                                            placeholderTextColor={C.textFaint}
                                        />
                                    </View>
                                </>
                            ) : (
                                <>
                                    <View style={s.fieldBlock}>
                                        <Text style={s.fieldLabel}>{t.displayName}</Text>
                                        <TextInput
                                            style={s.fieldInput}
                                            value={draftName}
                                            onChangeText={setDraftName}
                                            placeholder="Your name"
                                            placeholderTextColor={C.textFaint}
                                        />
                                    </View>
                                    <View style={s.fieldBlock}>
                                        <Text style={s.fieldLabel}>{t.fieldProgram}</Text>
                                        <TextInput
                                            style={s.fieldInput}
                                            value={draftProgram}
                                            onChangeText={setDraftProgram}
                                            placeholder="e.g. BSc Computer Science"
                                            placeholderTextColor={C.textFaint}
                                        />
                                    </View>
                                    <View style={s.fieldBlock}>
                                        <Text style={s.fieldLabel}>{t.fieldYear}</Text>
                                        <TextInput
                                            style={s.fieldInput}
                                            value={draftYear}
                                            onChangeText={setDraftYear}
                                            placeholder="e.g. 3rd Year"
                                            placeholderTextColor={C.textFaint}
                                        />
                                    </View>
                                </>
                            )}
                        </View>

                        <Pressable
                            style={[s.modalSaveBtn, saving && { backgroundColor: C.textFaint }]}
                            disabled={saving}
                            onPress={async () => {
                                setSaving(true);
                                try {
                                    if (isClub) {
                                        await authApi("/users/me", {
                                            method: "PATCH",
                                            body: JSON.stringify({ clubName: draftName.trim(), description: draftDesc.trim() }),
                                        });
                                        setDescription(draftDesc.trim());
                                        user.name = draftName.trim();
                                    } else {
                                        const parts = draftName.trim().split(/\s+/);
                                        const firstName = parts[0] ?? "";
                                        const lastName = parts.slice(1).join(" ");
                                        await authApi("/users/me", {
                                            method: "PATCH",
                                            body: JSON.stringify({ firstName, lastName, program: draftProgram, year: draftYear }),
                                        });
                                        user.name = draftName.trim();
                                        user.program = draftProgram;
                                        user.year = draftYear;
                                    }
                                    setEditOpen(false);
                                } catch (e) {
                                    console.error(e);
                                } finally {
                                    setSaving(false);
                                }
                            }}
                        >
                            {saving
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={s.modalSaveText}>{t.saveChanges}</Text>
                            }
                        </Pressable>
                    </View>
            </ModalScreen>
        </SafeAreaView>
    );
}

const POST_TYPE_LABEL: Record<string, string> = {
    EVENT: "EVENT", ANNOUNCEMENT: "ANNOUNCEMENT", POLL: "POLL", UPDATE: "UPDATE",
};

function MyPostCard({ post, onPress }: { post: MyPost; onPress: () => void }) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    return (
        <Pressable style={s.feedCard} onPress={onPress} accessibilityRole="button">
            <View style={s.feedCardHeader}>
                <Text style={s.postTypeBadge}>{POST_TYPE_LABEL[post.type.toUpperCase()] ?? post.type}</Text>
                <Text style={[s.feedCardTime, { marginLeft: "auto" as any }]}>{post.timeAgo}</Text>
            </View>
            {!!post.title && <Text style={s.feedCardClub}>{post.title}</Text>}
            {!!post.body && <Text style={s.feedCardBody} numberOfLines={3}>{post.body}</Text>}
            <View style={s.feedCardFooter}>
                <View style={s.feedStat}>
                    <Ionicons name="heart-outline" size={14} color={C.textMuted} />
                    <Text style={s.feedStatText}>{post.likes}</Text>
                </View>
                <View style={s.feedStat}>
                    <Ionicons name="chatbubble-outline" size={14} color={C.textMuted} />
                    <Text style={s.feedStatText}>{post.comments}</Text>
                </View>
            </View>
        </Pressable>
    );
}

function ClubList({
    clubs,
    notifPrefs,
    onNavigate,
    onBell,
    showDividerAfterLast = true,
}: {
    clubs: FollowedClub[];
    notifPrefs: Record<string, string>;
    onNavigate: (id: string) => void;
    onBell: (clubId: string, name: string) => void;
    showDividerAfterLast?: boolean;
}) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    return (
        <View style={s.clubList}>
            {clubs.map((club, idx) => {
                const pref = notifPrefs[club.id] ?? "ALL";
                const bellIcon = pref === "NONE"
                    ? "notifications-off-outline"
                    : pref === "EVENTS"
                    ? "notifications-outline"
                    : "notifications";
                const bellActive = pref === "ALL";
                const isLast = idx === clubs.length - 1;
                return (
                    <View key={club.id}>
                        <View style={s.clubRow}>
                            {/* Thumbnail */}
                            <Pressable style={s.clubRowMain} onPress={() => onNavigate(club.id)} accessibilityRole="button" accessibilityLabel={`${club.name} club profile`}>
                                {club.logoUrl ? (
                                    <Image source={{ uri: club.logoUrl }} style={s.clubThumb} accessibilityIgnoresInvertColors />
                                ) : (
                                    <ClubInitials name={club.name} size={56} />
                                )}
                                <View style={s.clubRowInfo}>
                                    <Text style={s.clubRowName} numberOfLines={1}>{club.name}</Text>
                                    <Text style={s.clubRowSub} numberOfLines={1}>
                                        {[club.category, `${fmtCount(club.members)} followers`].filter(Boolean).join(" · ")}
                                    </Text>
                                </View>
                            </Pressable>
                            {/* Bell — styled like a bordered action button */}
                            <Pressable
                                style={[s.clubBellBtn, bellActive && s.clubBellBtnActive]}
                                onPress={() => onBell(club.id, club.name)}
                                hitSlop={8}
                                accessibilityRole="button"
                                accessibilityState={{ selected: bellActive }}
                                accessibilityLabel={`Notifications for ${club.name}${bellActive ? " on" : " off"}`}
                            >
                                <Ionicons
                                    name={bellIcon}
                                    size={15}
                                    color={bellActive ? C.primary : C.textMuted}
                                />
                            </Pressable>
                        </View>
                        {(!isLast || showDividerAfterLast) && <View style={s.divider} />}
                    </View>
                );
            })}
        </View>
    );
}

function EmptyState({ icon, text, ctaLabel, onCta }: { icon: any; text: string; ctaLabel?: string; onCta?: () => void }) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    return (
        <View style={s.emptyState}>
            <Ionicons name={icon} size={32} color={C.textFaint} />
            <Text style={s.emptyText}>{text}</Text>
            {ctaLabel && onCta && (
                <Pressable onPress={onCta} style={{ marginTop: 4, backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 6 }} accessibilityRole="button" accessibilityLabel={ctaLabel}>
                    <Text style={{ fontSize: 11, fontWeight: "800", color: "#fff", letterSpacing: 1.5 }}>{ctaLabel.toUpperCase()}</Text>
                </Pressable>
            )}
        </View>
    );
}

function ActivityCard({ post, onPress }: { post: ActivityPost; onPress: () => void }) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    return (
        <Pressable style={s.feedCard} onPress={onPress} accessibilityRole="button">
            <View style={s.feedCardHeader}>
                <ClubInitials name={post.clubName} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.feedCardClub}>{post.clubName}</Text>
                    <Text style={s.feedCardMeta}>
                        {post.action === "like" ? "You liked this" : "You commented"} · {post.actionTime}
                    </Text>
                </View>
                <View style={[s.actionBadge, post.action === "comment" && s.actionBadgeComment]}>
                    <Ionicons
                        name={post.action === "like" ? "heart" : "chatbubble"}
                        size={11}
                        color={post.action === "like" ? C.primary : "#1D4ED8"}
                    />
                </View>
            </View>
            <Text style={s.feedCardBody} numberOfLines={3}>{post.content}</Text>
            <View style={s.feedCardFooter}>
                <View style={s.feedStat}>
                    <Ionicons name="heart-outline" size={14} color={C.textMuted} />
                    <Text style={s.feedStatText}>{post.likes}</Text>
                </View>
                <View style={s.feedStat}>
                    <Ionicons name="chatbubble-outline" size={14} color={C.textMuted} />
                    <Text style={s.feedStatText}>{post.comments}</Text>
                </View>
                <Text style={s.feedCardTime}>{post.timestamp}</Text>
            </View>
        </Pressable>
    );
}

function RSVPCard({ event, onPress }: { event: RSVPEvent; onPress: () => void }) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    const soon = soonLabel(event.startAt);
    return (
        <Pressable style={s.feedCard} onPress={onPress} accessibilityRole="button">
            <View style={s.rsvpBadgeRow}>
                <View style={s.rsvpBadgeBar} />
                <Text style={s.rsvpBadgeText}>EVENT · RSVP'D</Text>
                {soon && (
                    <View style={[s.soonBadge, soon === "TODAY" && s.soonBadgeToday]}>
                        <Text style={[s.soonBadgeText, soon === "TODAY" && s.soonBadgeTextToday]}>{soon}</Text>
                    </View>
                )}
            </View>
            <Text style={s.rsvpTitle}>{event.name.toUpperCase()}</Text>
            <View style={s.rsvpMeta}>
                <View style={s.rsvpMetaItem}>
                    <Ionicons name="time-outline" size={13} color={C.textMuted} />
                    <Text style={s.rsvpMetaText}>{event.countdown}</Text>
                </View>
                <View style={s.rsvpMetaItem}>
                    <Ionicons name="location-outline" size={13} color={C.textMuted} />
                    <Text style={s.rsvpMetaText}>{event.location}</Text>
                </View>
            </View>
            {event.desc && (
                <Text style={s.feedCardBody} numberOfLines={2}>{event.desc}</Text>
            )}
            <View style={s.feedCardFooter}>
                <Text style={s.feedCardClub}>{event.clubName}</Text>
                <Ionicons name="arrow-forward" size={14} color={C.primary} />
            </View>
        </Pressable>
    );
}

function SavedCard({ post, onPress }: { post: SavedPost; onPress: () => void }) {
    const { colors: C } = useTheme();
    const s = useMemo(() => makeStyles(C), [C]);
    const router = useRouter();
    const reduceMotion = useReduceMotion();
    const { resolve: resolveLike, toggleLike } = useLikes();
    const { resolve: resolveBookmark, toggleBookmark } = useBookmarks();

    // Live like/bookmark state (context overrides win over the server snapshot),
    // so these stay in sync with the rest of the app.
    const like = resolveLike(post.id, { liked: post.isLiked ?? false, count: post.likes });
    const saved = resolveBookmark(post.id, true);

    const lastTap = useRef(0);
    const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartAnim = useRef(new Animated.Value(0)).current;

    const doLike = () => {
        toggleLike(post.id, like);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };
    const popHeart = () => {
        if (reduceMotion) return;
        heartAnim.setValue(1);
        Animated.timing(heartAnim, { toValue: 0, duration: 600, delay: 400, useNativeDriver: true }).start();
    };
    // Single tap navigates (deferred so a double tap can cancel it); double tap likes.
    const handleTap = () => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
            if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
            if (!like.liked) doLike();
            popHeart();
        } else {
            tapTimer.current = setTimeout(() => { tapTimer.current = null; onPress(); }, 280);
        }
        lastTap.current = now;
    };
    const goComments = () => router.push((post.type === "event"
        ? { pathname: "/event/[id]", params: { id: post.id, focusComment: "1" } }
        : { pathname: "/post/[id]", params: { id: post.id, focusComment: "1" } }) as any);

    return (
        <Pressable style={s.feedCard} onPress={handleTap} accessibilityRole="button">
            <View style={s.feedCardHeader}>
                <ClubInitials name={post.clubName} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.feedCardClub}>{post.clubName}</Text>
                    <Text style={s.feedCardMeta}>{post.type.toUpperCase()} · {post.timestamp}</Text>
                </View>
                <Pressable onPress={() => toggleBookmark(post.id, saved)} hitSlop={10} accessibilityRole="button" accessibilityLabel={saved ? "Remove from saved" : "Save"}>
                    <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={16} color={saved ? C.primary : C.textMuted} />
                </Pressable>
            </View>
            {post.imageUrl && (
                <View>
                    <Image source={{ uri: post.imageUrl }} style={s.feedCardImage} resizeMode="cover" />
                    <Animated.View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", opacity: heartAnim }}>
                        <Ionicons name="heart" size={64} color="rgba(255,255,255,0.92)" />
                    </Animated.View>
                </View>
            )}
            <Text style={s.feedCardBody} numberOfLines={3}>{post.content}</Text>
            <View style={s.feedCardFooter}>
                <Pressable style={s.feedStat} onPress={doLike} hitSlop={8} accessibilityRole="button" accessibilityLabel={like.liked ? "Unlike" : "Like"}>
                    <Ionicons name={like.liked ? "heart" : "heart-outline"} size={16} color={like.liked ? C.primary : C.textMuted} />
                    <Text style={[s.feedStatText, like.liked && { color: C.primary }]}>{like.count}</Text>
                </Pressable>
                <Pressable style={s.feedStat} onPress={goComments} hitSlop={8} accessibilityRole="button" accessibilityLabel="View comments">
                    <Ionicons name="chatbubble-outline" size={15} color={C.textMuted} />
                    <Text style={s.feedStatText}>{post.comments}</Text>
                </Pressable>
            </View>
        </Pressable>
    );
}

const makeStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

    // Masthead
    masthead: {
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 0,
        backgroundColor: C.bg,
    },
    mastheadRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
    },
    mastheadLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    mastheadActions: { flexDirection: "row", gap: 4 },
    mastheadIdentity: {
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 16,
    },
    mastheadName: {
        fontSize: 36,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -1,
        lineHeight: 40,
    },
    mastheadAccent: {
        width: 48,
        height: 3,
        backgroundColor: C.primary,
        marginTop: 12,
        marginBottom: 20,
    },
    mastheadAvatar: {
        width: 72,
        height: 72,
        borderRadius: 0,
        backgroundColor: "#2a2a2a",
        flexShrink: 0,
    },
    mastheadAvatarPlaceholder: {
        width: 72,
        height: 72,
        borderRadius: 0,
        backgroundColor: C.primary,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    mastheadAvatarInitial: {
        fontSize: 28,
        fontWeight: "900",
        color: "#fff",
    },

    // Dark stats strip
    statsStrip: {
        backgroundColor: C.text,
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 18,
        marginHorizontal: -20,
    },
    stat: { flex: 1, alignItems: "center", gap: 2 },
    statNum: { fontSize: 20, fontWeight: "900", color: C.surface },
    statLabel: { fontSize: 9, fontWeight: "700", color: C.textMuted, letterSpacing: 1 },
    statDivider: { width: 1, height: 24, backgroundColor: C.textBody },
    semesterRecap: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        paddingVertical: 9,
        paddingHorizontal: 16,
        backgroundColor: C.primaryBg,
    },
    semesterRecapText: { fontSize: 12, fontWeight: "700", color: BURGUNDY, letterSpacing: 0.2 },

    // ── Redesigned student profile ──
    spTopBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 },
    spIdentity: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingTop: 12 },
    spAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.skeleton },
    spAvatarPlaceholder: { backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
    spAvatarInitial: { fontSize: 18, fontWeight: "800", color: "#fff" },
    spName: { fontSize: 24, fontWeight: "900", color: C.text, letterSpacing: -0.5, lineHeight: 27 },
    spSub: { fontSize: 13, color: C.textMuted, marginTop: 3 },
    spAccent: { width: 36, height: 3, backgroundColor: C.primary, marginLeft: 16, marginTop: 10 },

    spTermCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderWarm, marginHorizontal: 12, marginTop: 14, paddingHorizontal: 16, paddingVertical: 14 },
    spTermEyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 2, color: C.textMuted },
    spTermRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 },
    spTermNum: { fontSize: 30, fontWeight: "900", color: C.gold, letterSpacing: -1 },
    spTermLabel: { fontSize: 13, color: C.text },
    spCountRow: { flexDirection: "row", gap: 20, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.borderWarm },
    spCount: { flexDirection: "row", alignItems: "baseline", gap: 5 },
    spCountNum: { fontSize: 15, fontWeight: "800", color: C.text },
    spCountLabel: { fontSize: 11, fontWeight: "600", color: C.textMuted, letterSpacing: 0.5 },

    spSectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 22, paddingBottom: 10 },
    spSectionTitle: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: C.text },
    spSectionCount: { fontSize: 11, color: C.textLight },
    spSectionLine: { flex: 1, height: 1, backgroundColor: C.borderWarm },
    spViewAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.borderWarm },
    spViewAllLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 14, marginTop: 4 },
    spViewAllText: { fontSize: 10, fontWeight: "800", letterSpacing: 1, color: C.primary },
    spChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
    spChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 11, paddingVertical: 6, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
    spChipActive: { borderColor: C.primary, backgroundColor: C.primary },
    spChipText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5, color: C.textMuted },
    spChipTextActive: { color: "#fff" },
    sheetBody: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 16 },

    // Cards
    card: {
        backgroundColor: C.surface,
        marginHorizontal: 12,
        marginTop: 8,
        paddingHorizontal: 20,
        paddingVertical: 18,
        borderWidth: 1,
        borderColor: C.borderWarm,
        overflow: "hidden",
    },
    cardHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14,
    },
    cardLabel: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 2,
    },
    cardCount: {
        fontSize: 10,
        fontWeight: "700",
        color: C.textMuted,
        letterSpacing: 1,
    },

    // About
    aboutBody: { gap: 0 },
    aboutText: { fontSize: 13, color: C.textBody, fontWeight: "500" },
    aboutLink: { color: C.primary },
    aboutDetailRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
    },
    aboutDetailLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: C.textMuted,
        letterSpacing: 1.5,
    },
    aboutDetailValue: {
        fontSize: 13,
        fontWeight: "600",
        color: C.text,
        flexShrink: 1,
        textAlign: "right",
        maxWidth: "65%",
    },

    // Followed clubs list
    clubList: {},
    clubRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        gap: 14,
    },
    clubThumb: {
        width: 56,
        height: 56,
        backgroundColor: C.borderWarm,
    },
    clubRowMain: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
    },
    clubRowInfo: {
        flex: 1,
        gap: 4,
    },
    clubRowName: {
        fontSize: 15,
        fontWeight: "700",
        color: C.text,
        letterSpacing: 0.1,
    },
    clubRowSub: {
        fontSize: 12,
        color: C.textMuted,
        fontWeight: "400",
    },
    clubBellBtn: {
        width: 36,
        height: 36,
        borderWidth: 1.5,
        borderColor: C.borderWarm,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    clubBellBtnActive: {
        borderColor: C.primary,
        backgroundColor: C.primaryBg,
    },
    clubInitialsBox: { backgroundColor: C.primary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    clubInitialsText: { color: "#fff", fontWeight: "800", letterSpacing: 0.5 },

    // See more button
    seeMoreBtn: {
        alignItems: "center",
        paddingVertical: 14,
        marginHorizontal: -20,
        marginBottom: -18,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.borderWarm,
        backgroundColor: C.surfaceAlt,
    },
    seeMorePill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderWidth: 1.5,
        borderColor: C.primary,
    },
    seeMoreText: {
        fontSize: 11,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
    },

    // Clubs full-list modal
    clubsSheet: {
        backgroundColor: C.bg,
        paddingTop: 12,
        paddingHorizontal: 20,
    },
    clubsSheetHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
        marginBottom: 4,
    },
    clubsSheetScroll: {
        marginHorizontal: -20,
    },

    // Tab bar
    tabBar: {
        backgroundColor: C.surface,
        flexDirection: "row",
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.borderWarm,
        marginTop: 8,
        paddingHorizontal: 20,
    },
    tabItem: {
        paddingRight: 24,
        paddingVertical: 14,
        position: "relative",
    },
    tabLabel: { fontSize: 10, fontWeight: "800", color: C.textMuted, letterSpacing: 1 },
    tabLabelActive: { color: C.text },
    tabUnderline: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 24,
        height: 2,
        backgroundColor: C.primary,
    },

    // Feed
    feedBlock: {
        marginTop: 8,
        gap: 8,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: C.borderWarm,
        marginHorizontal: 20,
    },

    // Feed cards
    feedCard: {
        marginHorizontal: 12,
        paddingHorizontal: 20,
        paddingVertical: 18,
        gap: 8,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.borderWarm,
        overflow: "hidden",
    },
    feedCardHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    feedCardClub: {
        fontSize: 12,
        fontWeight: "800",
        color: C.text,
        letterSpacing: 0.3,
    },
    feedCardMeta: {
        fontSize: 11,
        color: C.textMuted,
        fontWeight: "500",
    },
    feedCardBody: {
        fontSize: 13,
        color: C.textMuted,
        lineHeight: 20,
    },
    feedCardImage: {
        width: "100%",
        height: 160,
        backgroundColor: C.surfaceAlt,
    },
    feedCardFooter: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingTop: 6,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.borderWarm,
    },
    feedCardTime: {
        fontSize: 11,
        color: C.textFaint,
        marginLeft: "auto" as any,
        fontWeight: "600",
    },
    feedStat: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
    },
    feedStatText: {
        fontSize: 12,
        fontWeight: "600",
        color: C.textMuted,
    },
    postTypeBadge: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
    },
    actionBadge: {
        width: 26,
        height: 26,
        backgroundColor: C.primaryBg,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    actionBadgeComment: {
        backgroundColor: "#DBEAFE",
    },

    // RSVP card
    rsvpBadgeRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
    },
    rsvpBadgeBar: {
        width: 3,
        height: 14,
        backgroundColor: C.primary,
    },
    rsvpBadgeText: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
    },
    rsvpTitle: {
        fontSize: 20,
        fontWeight: "900",
        color: C.text,
        letterSpacing: -0.3,
        lineHeight: 26,
    },
    rsvpMeta: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 14,
    },
    rsvpMetaItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
    },
    rsvpMetaText: {
        fontSize: 12,
        color: C.textMuted,
        fontWeight: "500",
    },

    modalSheet: {
        backgroundColor: C.bg,
        paddingHorizontal: 20,
        paddingBottom: 40,
        paddingTop: 12,
        gap: 20,
    },
    modalHandle: {
        width: 36,
        height: 4,
        backgroundColor: C.textFaint,
        alignSelf: "center",
        marginBottom: 4,
    },
    modalHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    modalTitle: {
        fontSize: 14,
        fontWeight: "900",
        color: C.text,
        letterSpacing: 2,
    },
    modalFields: {
        gap: 16,
    },
    fieldBlock: {
        gap: 6,
    },
    fieldLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
    },
    fieldInput: {
        backgroundColor: C.surface,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        fontWeight: "600",
        color: C.text,
        borderWidth: 1.5,
        borderColor: C.borderWarm,
    },
    modalSaveBtn: {
        backgroundColor: C.primary,
        paddingVertical: 14,
        alignItems: "center",
    },
    modalSaveText: {
        fontSize: 12,
        fontWeight: "800",
        color: "#fff",
        letterSpacing: 2,
    },

    notifModalSubtitle: {
        fontSize: 9,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
        marginBottom: 4,
    },
    notifOptRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: C.surface,
        borderWidth: 1,
        borderColor: C.border,
        marginBottom: 6,
    },
    notifOptRowActive: {
        borderColor: C.primary,
    },
    notifOptLabel: {
        fontSize: 13,
        fontWeight: "700",
        color: C.text,
    },
    notifOptDesc: {
        fontSize: 11,
        color: C.textMuted,
        marginTop: 2,
    },

    // Soon badge
    soonBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        backgroundColor: C.border,
    },
    soonBadgeToday: {
        backgroundColor: C.primary,
    },
    soonBadgeText: {
        fontSize: 9,
        fontWeight: "800",
        color: C.textMuted,
        letterSpacing: 1,
    },
    soonBadgeTextToday: {
        color: "#fff",
    },

    // Empty
    emptyState: {
        alignItems: "center",
        paddingVertical: 60,
        gap: 12,
    },
    emptyText: {
        fontSize: 11,
        fontWeight: "700",
        color: C.textFaint,
        letterSpacing: 2,
    },
    loadMoreBtn: {
        alignItems: "center",
        paddingVertical: 14,
        marginTop: 4,
    },
    loadMoreText: {
        fontSize: 10,
        fontWeight: "800",
        color: C.primary,
        letterSpacing: 1.5,
    },
});
