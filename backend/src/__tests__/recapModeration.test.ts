import { request, registerStudent, registerClub, createEvent, cleanupRun } from "./helpers";
import { prisma } from "../lib/prisma";

afterAll(cleanupRun);

const IMG = "https://example.com/recap.jpg";

// Make an event that has already ended and check the given user in.
async function pastEventWithCheckin(label: string) {
    const { clubId, token: clubToken } = await registerClub(`${label}-club`);
    const { eventId } = await createEvent(clubToken, clubId);
    await prisma.post.update({
        where: { id: eventId },
        data: { startAt: new Date(Date.now() - 3 * 3600_000), endAt: new Date(Date.now() - 2 * 3600_000) },
    });
    return { clubId, clubToken, eventId };
}

async function checkIn(userId: string, postId: string) {
    await prisma.checkIn.create({ data: { userId, postId } });
}

describe("Recap photo moderation", () => {
    it("holds attendee photos as PENDING and hides them from other viewers", async () => {
        const { eventId } = await pastEventWithCheckin("rm1");
        const { token: attendee, userId: attendeeId } = await registerStudent("rm1-attendee");
        await checkIn(attendeeId, eventId);

        const up = await request.post(`/posts/${eventId}/recap/photo`)
            .set("Authorization", `Bearer ${attendee}`).send({ url: IMG });
        expect(up.status).toBe(201);
        expect(up.body.status).toBe("PENDING");

        // A different viewer does not see the pending photo.
        const { token: viewer } = await registerStudent("rm1-viewer");
        const view = await request.get(`/posts/${eventId}/recap`).set("Authorization", `Bearer ${viewer}`);
        expect(view.body.photos.find((p: any) => p.id === up.body.id)).toBeFalsy();

        // The uploader still sees their own pending photo.
        const mine = await request.get(`/posts/${eventId}/recap`).set("Authorization", `Bearer ${attendee}`);
        expect(mine.body.photos.find((p: any) => p.id === up.body.id)?.status).toBe("PENDING");
    });

    it("lets the club approve a pending photo, after which it is public", async () => {
        const { clubToken, eventId } = await pastEventWithCheckin("rm2");
        const { token: attendee, userId: attendeeId } = await registerStudent("rm2-attendee");
        await checkIn(attendeeId, eventId);
        const up = await request.post(`/posts/${eventId}/recap/photo`)
            .set("Authorization", `Bearer ${attendee}`).send({ url: IMG });

        // Owner sees it as pending with a moderation flag + count.
        const ownerView = await request.get(`/posts/${eventId}/recap`).set("Authorization", `Bearer ${clubToken}`);
        expect(ownerView.body.pendingPhotoCount).toBeGreaterThanOrEqual(1);
        expect(ownerView.body.photos.find((p: any) => p.id === up.body.id)?.canModerate).toBe(true);

        const approve = await request.patch(`/posts/${eventId}/recap/photo/${up.body.id}`)
            .set("Authorization", `Bearer ${clubToken}`).send({ action: "approve" });
        expect(approve.status).toBe(200);
        expect(approve.body.status).toBe("APPROVED");

        // Now any viewer sees it.
        const { token: viewer } = await registerStudent("rm2-viewer");
        const view = await request.get(`/posts/${eventId}/recap`).set("Authorization", `Bearer ${viewer}`);
        expect(view.body.photos.find((p: any) => p.id === up.body.id)).toBeTruthy();
    });

    it("blocks non-owners from moderating", async () => {
        const { eventId } = await pastEventWithCheckin("rm3");
        const { token: attendee, userId: attendeeId } = await registerStudent("rm3-attendee");
        await checkIn(attendeeId, eventId);
        const up = await request.post(`/posts/${eventId}/recap/photo`)
            .set("Authorization", `Bearer ${attendee}`).send({ url: IMG });

        const res = await request.patch(`/posts/${eventId}/recap/photo/${up.body.id}`)
            .set("Authorization", `Bearer ${attendee}`).send({ action: "approve" });
        expect(res.status).toBe(403);
    });

    it("auto-approves the club's own recap photos", async () => {
        const { clubToken, eventId } = await pastEventWithCheckin("rm4");
        const up = await request.post(`/posts/${eventId}/recap/photo`)
            .set("Authorization", `Bearer ${clubToken}`).send({ url: IMG });
        expect(up.status).toBe(201);
        expect(up.body.status).toBe("APPROVED");
    });
});
