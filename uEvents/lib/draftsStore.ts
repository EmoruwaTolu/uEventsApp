export type Lang = "en" | "fr";
export type DraftType = "event" | "announcement" | "poll";
export type DurationKey = "24H" | "3D" | "7D";

// Comment control fields shared across all post types
type CommentSettings = {
    commentsDisabled?: boolean;
    commentsLockedAt?: string | null;
    slowModeSeconds?: number | null;
};

// Visibility controls shared across all post types
type VisibilitySettings = {
    hideLikeCount?: boolean;
    followersOnly?: boolean;
    expiresAt?: string | null;
};

export type EventDraftValues = CommentSettings & VisibilitySettings & {
    lang: Lang;
    title: string;
    titleFr?: string;
    description: string;
    descriptionFr?: string;
    posterUri: string | null;
    images?: string[];
    eventDate: string;
    startTime: string;
    venue: string;
    capacity?: number;
    freeFood?: boolean;
    recapPrivate?: boolean;
    categories?: string[];
    // Event-specific controls
    hideRsvpCount?: boolean;
    hideAttendeeList?: boolean;
    rsvpClosed?: boolean;
    waitlistEnabled?: boolean;
    rsvpRequiresApproval?: boolean;
};

export type PollDraftValues = CommentSettings & VisibilitySettings & {
    lang: Lang;
    question: string;
    questionFr?: string;
    description: string;
    descriptionFr?: string;
    options: { id: string; text: string }[];
    coverUri: string | null;
    images?: string[];
    duration: DurationKey;
    anonymous: boolean;
};

export type AnnouncementDraftValues = CommentSettings & VisibilitySettings & {
    lang: Lang;
    title: string;
    titleFr?: string;
    description: string;
    descriptionFr?: string;
    images?: string[];
};

export type DraftValues = EventDraftValues | PollDraftValues | AnnouncementDraftValues;

export type Draft = {
    id: string;
    type: DraftType;
    title: string;
    preview: string;
    editedAt: string;
    values: DraftValues;
};
