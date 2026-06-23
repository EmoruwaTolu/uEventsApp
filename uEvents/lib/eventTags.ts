export const EVENT_TAGS = [
    "Academic",
    "Social",
    "Sports",
    "Arts & Culture",
    "Technology",
    "Business",
    "Community",
    "Health & Wellness",
    "Food & Drink",
    "Career",
] as const;

export type EventTag = typeof EVENT_TAGS[number];
