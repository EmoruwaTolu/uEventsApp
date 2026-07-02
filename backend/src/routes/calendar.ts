import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// RFC 5545 text escaping.
function escapeICS(s: string): string {
    return String(s)
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r?\n/g, "\\n");
}

function toICSDate(d: Date): string {
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function localeTitle(locales: unknown): string {
    const l = (locales as any) ?? {};
    const loc = l.en ?? l.fr ?? Object.values(l)[0] ?? {};
    return (loc as any)?.title ?? "Event";
}

function localeBody(locales: unknown): string {
    const l = (locales as any) ?? {};
    const loc = l.en ?? l.fr ?? Object.values(l)[0] ?? {};
    return (loc as any)?.body ?? (loc as any)?.description ?? "";
}

// GET /calendar/:token.ics — public, token-authenticated iCalendar feed of the
// user's RSVP'd events. Subscribing (webcal://) keeps it auto-syncing.
router.get("/:token.ics", async (req, res, next) => {
    try {
        const token = req.params.token;
        const user = await prisma.user.findUnique({ where: { calendarToken: token }, select: { id: true } });
        if (!user) return res.status(404).type("text/plain").send("Calendar not found");

        // Events the user is going to, from 30 days ago onward.
        const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const rsvps = await prisma.rsvp.findMany({
            where: {
                userId: user.id,
                post: { type: "EVENT", isDraft: false, hidden: false, startAt: { gte: since } },
            },
            select: {
                post: {
                    select: {
                        id: true, locales: true, startAt: true, endAt: true,
                        locationName: true, address: true, updatedAt: true,
                        club: { select: { clubName: true } },
                    },
                },
            },
        });

        const now = toICSDate(new Date());
        const lines: string[] = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//uEvents//Calendar//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "X-WR-CALNAME:uEvents — My Events",
        ];

        for (const { post } of rsvps) {
            if (!post.startAt) continue;
            const start = new Date(post.startAt);
            const end = post.endAt ? new Date(post.endAt) : new Date(start.getTime() + 2 * 3600_000);
            const location = [post.locationName, post.address].filter(Boolean).join(", ");
            const desc = [localeBody(post.locales), `Hosted by ${post.club.clubName ?? "a club"}`]
                .filter(Boolean).join("\n\n");

            lines.push(
                "BEGIN:VEVENT",
                `UID:${post.id}@uevents`,
                `DTSTAMP:${now}`,
                `DTSTART:${toICSDate(start)}`,
                `DTEND:${toICSDate(end)}`,
                `SUMMARY:${escapeICS(localeTitle(post.locales))}`,
                ...(location ? [`LOCATION:${escapeICS(location)}`] : []),
                ...(desc ? [`DESCRIPTION:${escapeICS(desc)}`] : []),
                `LAST-MODIFIED:${toICSDate(new Date(post.updatedAt))}`,
                "END:VEVENT",
            );
        }

        lines.push("END:VCALENDAR");

        res.setHeader("Content-Type", "text/calendar; charset=utf-8");
        res.setHeader("Content-Disposition", 'inline; filename="uevents.ics"');
        res.send(lines.join("\r\n"));
    } catch (err) {
        next(err);
    }
});

export default router;
