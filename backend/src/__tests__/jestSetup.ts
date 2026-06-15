// Set default env vars before any module is imported.
// In CI these come from the workflow; locally they fall back to these test values.
process.env.JWT_SECRET ??= "jest-test-secret-not-for-production";
process.env.CLUB_INVITE_CODE ??= "test-invite";
