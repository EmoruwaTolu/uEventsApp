import { request, testEmail, registerStudent, registerClub, cleanupRun, RUN_ID } from "./helpers";

afterAll(cleanupRun);

describe("POST /users/add-user — student registration", () => {
    it("creates a student and returns a JWT", async () => {
        const { res } = await registerStudent("auth-reg");
        expect(res.status).toBe(201);
        expect(res.body.token).toBeTruthy();
        expect(res.body.user.type).toBe("STUDENT");
    });

    it("returns 409 for duplicate email", async () => {
        const email = testEmail("auth-dup");
        await request.post("/users/add-user").send({ email, password: "Password123!", type: "STUDENT" });
        const res2 = await request.post("/users/add-user").send({ email, password: "Password123!", type: "STUDENT" });
        expect(res2.status).toBe(409);
        expect(res2.body.error).toMatch(/already registered/i);
    });

    it("returns 400 for a short password", async () => {
        const res = await request.post("/users/add-user").send({
            email: testEmail("auth-short-pw"),
            password: "short",
            type: "STUDENT",
        });
        expect(res.status).toBe(400);
    });
});

describe("POST /users/add-user — club registration", () => {
    it("returns 403 without an invite code", async () => {
        const res = await request.post("/users/add-user").send({
            email: testEmail("auth-club-noinvite"),
            password: "Password123!",
            clubName: "No Invite Club",
            type: "CLUB",
        });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/invite/i);
    });

    it("returns 403 with a wrong invite code", async () => {
        const res = await request.post("/users/add-user").send({
            email: testEmail("auth-club-badinvite"),
            password: "Password123!",
            clubName: "Bad Invite Club",
            type: "CLUB",
            inviteCode: "definitely-wrong",
        });
        expect(res.status).toBe(403);
    });

    it("creates a club with a valid invite code", async () => {
        const { res } = await registerClub("auth-club-ok");
        expect(res.status).toBe(201);
        expect(res.body.user.type).toBe("CLUB");
    });
});

describe("POST /users/validate-user — login", () => {
    it("returns a token for correct credentials", async () => {
        const email = testEmail("auth-login");
        await request.post("/users/add-user").send({ email, password: "Password123!", type: "STUDENT" });
        const res = await request.post("/users/validate-user").send({ email, password: "Password123!" });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
    });

    it("returns 401 for wrong password", async () => {
        const email = testEmail("auth-wrongpw");
        await request.post("/users/add-user").send({ email, password: "Password123!", type: "STUDENT" });
        const res = await request.post("/users/validate-user").send({ email, password: "WrongPass!" });
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/invalid credentials/i);
    });

    it("returns 401 for unknown email", async () => {
        const res = await request.post("/users/validate-user").send({
            email: `nobody-${RUN_ID}@example.com`,
            password: "Password123!",
        });
        expect(res.status).toBe(401);
    });
});

describe("GET /users/me — token verification", () => {
    it("returns the current user with a valid token", async () => {
        const { token } = await registerStudent("auth-me");
        const res = await request.get("/users/me").set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.email).toContain(RUN_ID);
    });

    it("returns 401 with no token", async () => {
        const res = await request.get("/users/me");
        expect(res.status).toBe(401);
    });

    it("returns 401 with a malformed token", async () => {
        const res = await request.get("/users/me").set("Authorization", "Bearer not.a.real.token");
        expect(res.status).toBe(401);
    });
});
