import { request, registerStudent, registerClub, registerAdmin, createEvent, cleanupRun } from "./helpers";

afterAll(cleanupRun);

describe("Report review surface (admin)", () => {
    it("lets a user report a post", async () => {
        const { clubId, token: clubToken } = await registerClub("rep-club-1");
        const { eventId } = await createEvent(clubToken, clubId);
        const { token: studentToken } = await registerStudent("rep-student-1");

        const res = await request
            .post(`/reports/posts/${eventId}`)
            .set("Authorization", `Bearer ${studentToken}`)
            .send({ reason: "Spam" });
        expect(res.status).toBe(201);
    });

    it("blocks non-admins from GET /reports", async () => {
        const { token } = await registerStudent("rep-nonadmin");
        const res = await request.get("/reports").set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(403);
    });

    it("blocks unauthenticated GET /reports", async () => {
        const res = await request.get("/reports");
        expect(res.status).toBe(401);
    });

    it("lets an admin list open reports with a target preview", async () => {
        const { clubId, token: clubToken } = await registerClub("rep-club-2");
        const { eventId } = await createEvent(clubToken, clubId, { locales: { en: { title: "Reported Party" } } });
        const { token: studentToken } = await registerStudent("rep-student-2");
        await request.post(`/reports/posts/${eventId}`).set("Authorization", `Bearer ${studentToken}`).send({ reason: "Inappropriate" });

        const { token: adminToken } = await registerAdmin("rep-admin-2");
        const res = await request.get("/reports").set("Authorization", `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        const row = res.body.find((r: any) => r.targetId === eventId);
        expect(row).toBeTruthy();
        expect(row.targetType).toBe("POST");
        expect(row.reason).toBe("Inappropriate");
        expect(row.target.title).toBe("Reported Party");
        expect(row.resolvedAt).toBeNull();
    });

    it("hides a reported post and resolves its reports", async () => {
        const { clubId, token: clubToken } = await registerClub("rep-club-3");
        const { eventId } = await createEvent(clubToken, clubId);
        const { token: studentToken } = await registerStudent("rep-student-3");
        await request.post(`/reports/posts/${eventId}`).set("Authorization", `Bearer ${studentToken}`).send({ reason: "Bad" });

        const { token: adminToken } = await registerAdmin("rep-admin-3");
        const list = await request.get("/reports").set("Authorization", `Bearer ${adminToken}`);
        const reportId = list.body.find((r: any) => r.targetId === eventId).id;

        const act = await request
            .patch(`/reports/${reportId}`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ action: "hide" });
        expect(act.status).toBe(200);
        expect(act.body.action).toBe("hide");

        // A different user can no longer see the hidden post.
        const { token: viewerToken } = await registerStudent("rep-viewer-3");
        const view = await request.get(`/posts/${eventId}`).set("Authorization", `Bearer ${viewerToken}`);
        expect(view.status).toBe(404);

        // The report is now resolved (out of the open list, present in resolved).
        const open = await request.get("/reports?status=open").set("Authorization", `Bearer ${adminToken}`);
        expect(open.body.find((r: any) => r.id === reportId)).toBeFalsy();
        const resolved = await request.get("/reports?status=resolved").set("Authorization", `Bearer ${adminToken}`);
        expect(resolved.body.find((r: any) => r.id === reportId)?.resolution).toBe("hide");
    });

    it("deletes a reported comment", async () => {
        const { clubId, token: clubToken } = await registerClub("rep-club-4");
        const { eventId } = await createEvent(clubToken, clubId);
        const { token: studentToken } = await registerStudent("rep-student-4");

        const c = await request
            .post(`/posts/${eventId}/comments`)
            .set("Authorization", `Bearer ${studentToken}`)
            .send({ content: "offensive comment" });
        const commentId = c.body.id;

        await request.post(`/reports/comments/${commentId}`).set("Authorization", `Bearer ${studentToken}`).send({ reason: "Abuse" });

        const { token: adminToken } = await registerAdmin("rep-admin-4");
        const list = await request.get("/reports").set("Authorization", `Bearer ${adminToken}`);
        const reportId = list.body.find((r: any) => r.targetId === commentId).id;

        const act = await request
            .patch(`/reports/${reportId}`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ action: "delete" });
        expect(act.status).toBe(200);

        const comments = await request.get(`/posts/${eventId}/comments`);
        expect(comments.body.find((cc: any) => cc.id === commentId)).toBeFalsy();
    });

    it("rejects hide/delete on user reports but allows dismiss", async () => {
        const { userId: targetId } = await registerStudent("rep-target-5");
        const { token: studentToken } = await registerStudent("rep-student-5");
        await request.post(`/reports/users/${targetId}`).set("Authorization", `Bearer ${studentToken}`).send({ reason: "Harassment" });

        const { token: adminToken } = await registerAdmin("rep-admin-5");
        const list = await request.get("/reports").set("Authorization", `Bearer ${adminToken}`);
        const reportId = list.body.find((r: any) => r.targetId === targetId).id;

        const bad = await request.patch(`/reports/${reportId}`).set("Authorization", `Bearer ${adminToken}`).send({ action: "hide" });
        expect(bad.status).toBe(400);

        const dismiss = await request.patch(`/reports/${reportId}`).set("Authorization", `Bearer ${adminToken}`).send({ action: "dismiss" });
        expect(dismiss.status).toBe(200);
        expect(dismiss.body.action).toBe("dismiss");
    });

    it("validates the action value", async () => {
        const { clubId, token: clubToken } = await registerClub("rep-club-6");
        const { eventId } = await createEvent(clubToken, clubId);
        const { token: studentToken } = await registerStudent("rep-student-6");
        await request.post(`/reports/posts/${eventId}`).set("Authorization", `Bearer ${studentToken}`).send({ reason: "x" });

        const { token: adminToken } = await registerAdmin("rep-admin-6");
        const list = await request.get("/reports").set("Authorization", `Bearer ${adminToken}`);
        const reportId = list.body.find((r: any) => r.targetId === eventId).id;

        const res = await request.patch(`/reports/${reportId}`).set("Authorization", `Bearer ${adminToken}`).send({ action: "nuke" });
        expect(res.status).toBe(400);
    });
});
