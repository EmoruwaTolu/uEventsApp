/**
 * Locale-aware date & relative-time formatting.
 *
 * All screens should use these instead of hardcoding `en-US` / English strings so
 * dates, day names, and "3h ago"-style timestamps follow the selected language.
 */
type Lang = "en" | "fr";

/** BCP-47 locale for Intl date formatting. */
export const localeFor = (lang: string): string => (lang === "fr" ? "fr-CA" : "en-US");

/** Relative timestamp, e.g. "3h ago" / "il y a 3 h". */
export function timeAgo(iso: string, lang: string = "en"): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (lang === "fr") {
        if (mins < 1) return "à l'instant";
        if (mins < 60) return `il y a ${mins} min`;
        if (hrs < 24) return `il y a ${hrs} h`;
        return `il y a ${days} j`;
    }
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (hrs < 24) return `${hrs}h ago`;
    return `${days}d ago`;
}

/** Time of day, 24h, e.g. "18:30". Language-neutral. */
export function fmtTime24(iso: string): string {
    const d = new Date(iso);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** Long date with weekday + month names, uppercased. e.g. "FRIDAY, JULY 4 · 18:30". */
export function fmtLongDate(iso: string, lang: string): string {
    const d = new Date(iso);
    const weekday = d.toLocaleString(localeFor(lang), { weekday: "long" });
    const month = d.toLocaleString(localeFor(lang), { month: "long" });
    const day = d.getDate();
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${weekday}, ${month} ${day} · ${h}:${m}`;
}

/** Short feed date, e.g. "FRI, JUL 4 · 18:30". */
export function fmtFeedDate(iso: string, lang: string): string {
    const d = new Date(iso);
    const weekday = d.toLocaleDateString(localeFor(lang), { weekday: "short" }).toUpperCase();
    const month = d.toLocaleDateString(localeFor(lang), { month: "short" }).toUpperCase();
    const day = d.getDate();
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${weekday}, ${month} ${day} · ${h}:${m}`;
}
