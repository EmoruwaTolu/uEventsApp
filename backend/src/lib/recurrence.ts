// Occurrence-date generation for recurring events.
//
// We materialize concrete dates from a recurrence rule rather than storing a
// single virtual event, because attendance (RSVP / check-in / capacity) is
// inherently per-date. Generation is bounded so series never produce unbounded
// rows: a finite series (with `count`) yields exactly that many (capped); an
// open-ended series yields a rolling window of up to MAX_OCCURRENCES within the
// horizon, which the top-up job extends over time.

export type RecurrenceFreq = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export interface RecurrenceRule {
    freq: RecurrenceFreq;
    interval: number;          // every N units (>=1)
    byWeekday: number[];       // 0=Sun..6=Sat for WEEKLY/BIWEEKLY; empty => startDate's weekday
    startDate: Date;           // first occurrence start (wall-clock anchor)
    endDate?: Date | null;     // stop after this date (inclusive), if set
    count?: number | null;     // OR stop after this many occurrences, if set
}

export const MAX_OCCURRENCES = 26;   // hard cap on dates returned by a single call
export const HORIZON_DAYS = 180;     // open-ended series only materialize this far out

function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function addMonths(d: Date, n: number): Date {
    const r = new Date(d);
    const day = r.getDate();
    r.setMonth(r.getMonth() + n);
    if (r.getDate() < day) r.setDate(0); // clamp month overflow (e.g. Jan 31 -> Feb 28)
    return r;
}

/**
 * Generate occurrence start-times for a rule.
 * @param from  only return occurrences on/after this instant (default = rule.startDate).
 *              Used by the top-up job to extend an open-ended series.
 */
export function generateOccurrences(rule: RecurrenceRule, from?: Date): Date[] {
    const interval = Math.max(1, rule.interval || 1);
    const isFinite = !!(rule.count && rule.count > 0);
    const limit = isFinite ? Math.min(rule.count as number, MAX_OCCURRENCES) : MAX_OCCURRENCES;
    // Finite series are fully materialized regardless of horizon; open-ended ones
    // are bounded by the horizon (and topped up later).
    const horizonEnd: Date | null = isFinite ? null : addDays(new Date(), HORIZON_DAYS);
    const hardEnd = rule.endDate ? new Date(rule.endDate) : null;
    const lower = from ? new Date(from) : null;

    const start = new Date(rule.startDate);
    const hours = start.getHours();
    const minutes = start.getMinutes();
    const out: Date[] = [];

    const past = (d: Date) =>
        (hardEnd && d > hardEnd) || (horizonEnd && d > horizonEnd);

    if (rule.freq === "MONTHLY") {
        let cursor = new Date(start);
        cursor.setHours(hours, minutes, 0, 0);
        while (out.length < limit) {
            if (past(cursor)) break;
            if (!lower || cursor >= lower) out.push(new Date(cursor));
            cursor = addMonths(cursor, interval);
            cursor.setHours(hours, minutes, 0, 0);
        }
        return out;
    }

    // WEEKLY / BIWEEKLY
    const weekStep = (rule.freq === "BIWEEKLY" ? 2 : 1) * interval;
    const weekdays = (rule.byWeekday && rule.byWeekday.length > 0)
        ? [...new Set(rule.byWeekday)].sort((a, b) => a - b)
        : [start.getDay()];

    let weekAnchor = addDays(start, -start.getDay()); // Sunday of the start week
    weekAnchor.setHours(0, 0, 0, 0);

    let guard = 0;
    const maxIter = Math.ceil((HORIZON_DAYS / 7) / weekStep) + 4;
    let done = false;
    while (out.length < limit && guard <= maxIter && !done) {
        for (const wd of weekdays) {
            const occ = addDays(weekAnchor, wd);
            occ.setHours(hours, minutes, 0, 0);
            if (occ < start) continue;            // before the series begins
            if (past(occ)) { done = true; break; }
            if (out.length >= limit) { done = true; break; }
            if (!lower || occ >= lower) out.push(new Date(occ));
        }
        weekAnchor = addDays(weekAnchor, 7 * weekStep);
        guard++;
    }
    return out;
}
