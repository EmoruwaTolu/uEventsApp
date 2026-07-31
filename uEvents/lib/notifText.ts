// Notifications are stored server-side with English title/body at creation
// time, so they can't be re-rendered per-language the way UI strings are.
// This maps every known server template onto a French equivalent at display
// time — same approach as the For-You reason chips (see SocialFeed), and
// backward compatible with rows created by any deployed backend version.
// Unknown text (post titles, comment snippets) passes through untouched.

type Rule = { re: RegExp; fr: (m: RegExpMatchArray) => string };

const TITLE_RULES: Rule[] = [
    { re: /^New event from (.+)$/, fr: (m) => `Nouvel événement de ${m[1]}` },
    { re: /^(.+) posted an announcement$/, fr: (m) => `${m[1]} a publié une annonce` },
    { re: /^(.+) posted a new poll$/, fr: (m) => `${m[1]} a publié un nouveau sondage` },
    { re: /^Update from (.+)$/, fr: (m) => `Mise à jour de ${m[1]}` },
    { re: /^New post from (.+)$/, fr: (m) => `Nouvelle publication de ${m[1]}` },
    { re: /^Event update: (.+)$/, fr: (m) => `Mise à jour d'événement : ${m[1]}` },
    { re: /^(.+) replied to your comment$/, fr: (m) => `${m[1]} a répondu à votre commentaire` },
    { re: /^(.+) commented on (.+)$/, fr: (m) => `${m[1]} a commenté « ${m[2]} »` },
    { re: /^Starting soon: (.+)$/, fr: (m) => `Ça commence bientôt : ${m[1]}` },
    { re: /^Event time changed$/, fr: () => "Horaire de l'événement modifié" },
    { re: /^Your club was approved$/, fr: () => "Votre club a été approuvé" },
    { re: /^Club application update$/, fr: () => "Mise à jour de la demande de club" },
    { re: /^You're in!$/, fr: () => "Vous avez une place !" },
    { re: /^Your weekly uEvents digest$/, fr: () => "Votre résumé hebdomadaire uEvents" },
];

// changeDesc fragments used inside the "Event update" body
const CHANGE_PARTS: Record<string, string> = {
    "date/time": "la date et l'heure",
    "location": "le lieu",
    "details": "les détails",
};

function translateChangeDesc(desc: string): string {
    return desc
        .split(" and ")
        .map((p) => CHANGE_PARTS[p] ?? p)
        .join(" et ");
}

const BODY_RULES: Rule[] = [
    {
        re: /^The (.+) has been updated\. Check the latest details\.$/,
        fr: (m) => `Mise à jour : ${translateChangeDesc(m[1])}. Consultez les derniers détails.`,
    },
    {
        re: /^(.+) from (.+) has a new time\. Tap to review — your RSVP is still saved\.$/,
        fr: (m) => `${m[1]} de ${m[2]} a un nouvel horaire. Touchez pour vérifier — votre inscription est conservée.`,
    },
    {
        re: /^Your event from (.+) starts in about 1 hour\.$/,
        fr: (m) => `Votre événement de ${m[1]} commence dans environ 1 heure.`,
    },
    {
        re: /^A spot opened up — you've been moved off the waitlist\.$/,
        fr: () => "Une place s'est libérée — vous n'êtes plus sur la liste d'attente.",
    },
    {
        re: /^A spot opened up for (.+) — you're off the waitlist\.$/,
        fr: (m) => `Une place s'est libérée pour ${m[1]} — vous n'êtes plus sur la liste d'attente.`,
    },
    {
        re: /^You can now post events and announcements\.$/,
        fr: () => "Vous pouvez maintenant publier des événements et des annonces.",
    },
    {
        re: /^Your club application wasn't approved\.(?: Reason: (.+))?$/,
        fr: (m) => `Votre demande de club n'a pas été approuvée.${m[1] ? ` Motif : ${m[1]}` : ""}`,
    },
    {
        re: /^Your week: (\d+) RSVPs?(?:, (\d+) events? matching your interests)?\.$/,
        fr: (m) => {
            const parts = [`${m[1]} inscription${m[1] === "1" ? "" : "s"}`];
            if (m[2]) parts.push(`${m[2]} événement${m[2] === "1" ? "" : "s"} selon vos intérêts`);
            return `Votre semaine : ${parts.join(", ")}.`;
        },
    },
    {
        re: /^Your week: (\d+) events? matching your interests\.$/,
        fr: (m) => `Votre semaine : ${m[1]} événement${m[1] === "1" ? "" : "s"} selon vos intérêts.`,
    },
];

function apply(rules: Rule[], text: string): string {
    for (const r of rules) {
        const m = text.match(r.re);
        if (m) return r.fr(m);
    }
    return text;
}

export function localizeNotifText(
    title: string,
    body: string,
    lang: "en" | "fr"
): { title: string; body: string } {
    if (lang !== "fr") return { title, body };
    return { title: apply(TITLE_RULES, title), body: apply(BODY_RULES, body) };
}
