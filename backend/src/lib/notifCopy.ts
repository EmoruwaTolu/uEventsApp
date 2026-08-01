// Push-notification copy, per language.
//
// Division of labour with the app: rows in the Notification table are stored in
// English and localized by the client at display time (uEvents/lib/notifText.ts),
// so an in-app notification always renders in whatever language is selected
// *now* — switching language re-renders history correctly. Push notifications
// can't work that way: the OS renders them, so they must already be in the right
// language when we hand them to Expo. That's what this module is for.
//
// Keep the French here identical to notifText.ts, or the same event will read
// differently in the notification tray and in the app.

export type Lang = "en" | "fr";

/** Narrows the free-form column value to a supported language. */
export function toLang(value: string | null | undefined): Lang {
    return value === "fr" ? "fr" : "en";
}

export type PushCopy = { title: string; body: string };

// User-authored text (post titles, comment snippets, club names) is never
// translated — it is passed through in whatever language its author wrote it.

export function newPostPush(
    lang: Lang,
    postType: string,
    clubName: string,
    postTitle: string,
): PushCopy {
    const en: Record<string, string> = {
        EVENT: `New event from ${clubName}`,
        ANNOUNCEMENT: `${clubName} posted an announcement`,
        POLL: `${clubName} posted a new poll`,
        UPDATE: `Update from ${clubName}`,
    };
    const fr: Record<string, string> = {
        EVENT: `Nouvel événement de ${clubName}`,
        ANNOUNCEMENT: `${clubName} a publié une annonce`,
        POLL: `${clubName} a publié un nouveau sondage`,
        UPDATE: `Mise à jour de ${clubName}`,
    };
    const title = lang === "fr"
        ? (fr[postType] ?? `Nouvelle publication de ${clubName}`)
        : (en[postType] ?? `New post from ${clubName}`);
    return { title, body: postTitle };
}

/**
 * `changeDesc` arrives as English fragments joined with " and " (see the PATCH
 * handler in routes/posts.ts). Translate each fragment rather than the whole
 * string so any combination of them works.
 */
export function eventUpdatePush(lang: Lang, eventTitle: string, changeDesc: string): PushCopy {
    if (lang !== "fr") {
        return {
            title: `Event update: ${eventTitle}`,
            body: `The ${changeDesc} has been updated. Check the latest details.`,
        };
    }
    const parts: Record<string, string> = {
        "date/time": "la date et l'heure",
        location: "le lieu",
        details: "les détails",
    };
    const desc = changeDesc.split(" and ").map((p) => parts[p] ?? p).join(" et ");
    return {
        title: `Mise à jour d'événement : ${eventTitle}`,
        body: `Mise à jour : ${desc}. Consultez les derniers détails.`,
    };
}

export function commentPush(
    lang: Lang,
    kind: "COMMENT" | "REPLY",
    actorName: string,
    postTitle: string,
    snippet: string,
): PushCopy {
    const title = lang === "fr"
        ? (kind === "REPLY"
            ? `${actorName} a répondu à votre commentaire`
            : `${actorName} a commenté « ${postTitle} »`)
        : (kind === "REPLY"
            ? `${actorName} replied to your comment`
            : `${actorName} commented on ${postTitle}`);
    return { title, body: snippet };
}

export function eventTimeChangedPush(lang: Lang, eventTitle: string): PushCopy {
    return lang === "fr"
        ? {
            title: "Horaire de l'événement modifié",
            body: `${eventTitle} a un nouvel horaire. Votre inscription est conservée.`,
        }
        : {
            title: "Event time changed",
            body: `${eventTitle} has a new time. Your RSVP is still saved.`,
        };
}

export function waitlistPromotedPush(lang: Lang, eventTitle: string): PushCopy {
    return lang === "fr"
        ? {
            title: "Vous avez une place !",
            body: `Une place s'est libérée pour ${eventTitle} — vous n'êtes plus sur la liste d'attente.`,
        }
        : {
            title: "You're in!",
            body: `A spot opened up for ${eventTitle} — you're off the waitlist.`,
        };
}

export function eventReminderPush(lang: Lang, eventTitle: string, clubName: string): PushCopy {
    return lang === "fr"
        ? {
            title: `Ça commence bientôt : ${eventTitle}`,
            body: `Votre événement de ${clubName} commence dans environ 1 heure.`,
        }
        : {
            title: `Starting soon: ${eventTitle}`,
            body: `Your event from ${clubName} starts in about 1 hour.`,
        };
}

export function weeklyDigestPush(lang: Lang, rsvpCount: number, matchCount: number): PushCopy {
    if (lang !== "fr") {
        const parts: string[] = [];
        if (rsvpCount > 0) parts.push(`${rsvpCount} RSVP${rsvpCount === 1 ? "" : "s"}`);
        if (matchCount > 0) parts.push(`${matchCount} event${matchCount === 1 ? "" : "s"} matching your interests`);
        return { title: "Your weekly uEvents digest", body: `Your week: ${parts.join(", ")}.` };
    }
    const parts: string[] = [];
    if (rsvpCount > 0) parts.push(`${rsvpCount} inscription${rsvpCount === 1 ? "" : "s"}`);
    if (matchCount > 0) parts.push(`${matchCount} événement${matchCount === 1 ? "" : "s"} selon vos intérêts`);
    return { title: "Votre résumé hebdomadaire uEvents", body: `Votre semaine : ${parts.join(", ")}.` };
}
