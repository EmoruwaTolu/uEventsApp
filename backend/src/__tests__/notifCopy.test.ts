import {
    type PushCopy,
    newPostPush, eventUpdatePush, commentPush,
    eventTimeChangedPush, waitlistPromotedPush, eventReminderPush, weeklyDigestPush,
} from "../lib/notifCopy";
import { localizeNotifText } from "../../../uEvents/lib/notifText";

// The same event reaches a user twice: as a push (composed here, per recipient's
// language) and as a row in the notification list (stored in English, localized
// in the app by notifText.ts). Those two files hold the French independently, so
// they can drift — and the user would see one wording in the tray and another in
// the app. This asserts they agree: English push copy, run through the client's
// localizer, must produce exactly the French push copy.
//
// Needs no database, so it runs even when the suite's Postgres is unreachable.
function expectConsistent(en: PushCopy, fr: PushCopy, compareBody = true) {
    const localized = localizeNotifText(en.title, en.body, "fr");
    expect(localized.title).toBe(fr.title);
    if (compareBody) expect(localized.body).toBe(fr.body);
}

describe("push copy matches the in-app localizer", () => {
    it.each(["EVENT", "ANNOUNCEMENT", "POLL", "UPDATE", "UNKNOWN_TYPE"])(
        "new post (%s)",
        (postType) => {
            expectConsistent(
                newPostPush("en", postType, "Women in STEM", "Mentorship night"),
                newPostPush("fr", postType, "Women in STEM", "Mentorship night"),
            );
        },
    );

    // changeDesc is assembled from English fragments joined with " and ", so
    // every combination has to translate, not just the single-fragment cases.
    it.each([
        "date/time",
        "location",
        "details",
        "date/time and location",
        "date/time and location and details",
    ])("event update (%s)", (changeDesc) => {
        expectConsistent(
            eventUpdatePush("en", "Coding Night", changeDesc),
            eventUpdatePush("fr", "Coding Night", changeDesc),
        );
    });

    it.each(["REPLY", "COMMENT"] as const)("comment (%s)", (kind) => {
        expectConsistent(
            commentPush("en", kind, "Alan", "Coding Night", "see you there"),
            commentPush("fr", kind, "Alan", "Coding Night", "see you there"),
        );
    });

    it("event time changed", () => {
        // Title only: the in-app body deliberately says more than the push one
        // (it names the club and adds "Tap to review"), so the bodies differ.
        expectConsistent(
            eventTimeChangedPush("en", "Coding Night"),
            eventTimeChangedPush("fr", "Coding Night"),
            false,
        );
    });

    it("waitlist promotion", () => {
        expectConsistent(
            waitlistPromotedPush("en", "Coding Night"),
            waitlistPromotedPush("fr", "Coding Night"),
        );
    });

    it("event reminder", () => {
        expectConsistent(
            eventReminderPush("en", "Coding Night", "CSSA"),
            eventReminderPush("fr", "Coding Night", "CSSA"),
        );
    });

    it.each([[1, 0], [2, 0], [0, 1], [0, 3], [2, 3]])(
        "weekly digest (%i RSVPs, %i matches)",
        (rsvpCount, matchCount) => {
            expectConsistent(
                weeklyDigestPush("en", rsvpCount, matchCount),
                weeklyDigestPush("fr", rsvpCount, matchCount),
            );
        },
    );
});

describe("user-authored text is never translated", () => {
    it("keeps post titles, club names and comment snippets verbatim", () => {
        const clubName = "Women in STEM";
        const postTitle = "Mentorship Matching Now Open";
        const fr = newPostPush("fr", "ANNOUNCEMENT", clubName, postTitle);
        expect(fr.title).toContain(clubName);
        expect(fr.body).toBe(postTitle);

        const snippet = "see you there";
        expect(commentPush("fr", "REPLY", "Alan", postTitle, snippet).body).toBe(snippet);
    });
});
