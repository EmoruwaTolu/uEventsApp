import { prisma } from "../lib/prisma";
import { generateOccurrences } from "../lib/recurrence";

// Keeps open-ended recurring series topped up: ensures the next horizon window
// of occurrences exists. Finite series (with a `count`) are fully materialized
// at creation and skipped here.
export async function runSeriesTopUp() {
    const now = new Date();

    const series = await prisma.eventSeries.findMany({
        where: {
            count: null,
            OR: [{ endDate: null }, { endDate: { gt: now } }],
        },
    });

    for (const s of series) {
        const tpl = s.template as any;
        const durationMs: number = tpl?.durationMs ?? 2 * 3600000;

        const wanted = generateOccurrences(
            {
                freq: s.freq,
                interval: s.interval,
                byWeekday: s.byWeekday,
                startDate: s.startDate,
                endDate: s.endDate,
                count: null,
            },
            now, // only future occurrences
        );
        if (wanted.length === 0) continue;

        const existing = await prisma.post.findMany({
            where: { seriesId: s.id, occurrenceDate: { gte: now } },
            select: { occurrenceDate: true },
        });
        const have = new Set(existing.map((p) => p.occurrenceDate?.getTime()));
        const missing = wanted.filter((d) => !have.has(d.getTime()));
        if (missing.length === 0) continue;

        await prisma.post.createMany({
            data: missing.map((occ) => ({
                clubId: s.clubId,
                type: "EVENT" as const,
                isDraft: false,
                locales: tpl.locales,
                startAt: occ,
                endAt: new Date(occ.getTime() + durationMs),
                locationName: tpl.locationName ?? undefined,
                address: tpl.address ?? undefined,
                categories: Array.isArray(tpl.categories) ? tpl.categories : [],
                images: Array.isArray(tpl.images) ? tpl.images : [],
                capacity: tpl.capacity ?? undefined,
                freeFood: !!tpl.freeFood,
                seriesId: s.id,
                occurrenceDate: occ,
            })),
        });
    }
}
