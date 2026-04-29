---
name: Future features planned
description: Features the user wants to build eventually but not now
type: project
---

Recurring events and co-hosting are explicitly planned for the future.

**Why:** User confirmed interest but wants to think through the design first — both require significant schema work (recurrence rules + instance generation for recurring; new relation for co-hosting).

**How to apply:** Don't suggest these as quick wins. If the topic comes up, acknowledge they're on the roadmap and ask if the time is right.

Post performance push notifications
"Your event just hit 50 RSVPs" or "Your poll closes in 2 hours — 80 votes in." Pulls clubs back in passively. The backend notification infrastructure is already referenced in the schema (notifPref), so the foundation is there.

Content calendar view
Right now drafts are a flat list. A simple calendar showing scheduled and upcoming posts lets clubs plan their cadence visually. Helps with the "should I post today or wait?" anxiety that causes clubs to post inconsistently.
Profile completeness nudge
A small progress bar on the club settings/profile screen: logo ✓, description ✓, social links ✗, etc. This is a passive retention mechanic — clubs without logos get fewer follows, so there's self-interest in completing it. Very cheap to build.

Quick post shortcut
The current create flow is multi-step. A "quick announcement" that's just a text field + post button (for "Meeting tonight at 7pm, Room 204" type posts) reduces the friction that causes clubs to just post to Instagram instead.