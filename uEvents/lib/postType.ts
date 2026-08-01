// Post-type display labels.
//
// The API hands back post types in a few shapes — "ANNOUNCEMENT" from the raw
// Prisma enum, "announcement" from the feed mapper — and screens used to render
// whichever one arrived, uppercased. That leaked raw English type names into the
// French UI and let the same type read differently from screen to screen.
// Everything that shows a type name goes through here instead.

import type { Translations } from "./i18n";

export type PostTypeKey = "EVENT" | "ANNOUNCEMENT" | "UPDATE" | "POLL";

/**
 * Localized name for a post type, in sentence case ("Announcement" / "Annonce").
 * Unknown types fall back to the raw string so nothing renders blank.
 */
export function postTypeLabel(type: string | null | undefined, t: Translations): string {
    if (!type) return "";
    switch (type.toUpperCase()) {
        case "EVENT":        return t.eventType;
        case "ANNOUNCEMENT": return t.announcementType;
        case "UPDATE":       return t.updateType;
        case "POLL":         return t.pollType;
        default:             return type;
    }
}

/** Same, uppercased for badges and eyebrow labels. */
export function postTypeBadge(type: string | null | undefined, t: Translations): string {
    return postTypeLabel(type, t).toUpperCase();
}
