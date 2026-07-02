/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch: ["**/__tests__/**/*.test.ts"],
    setupFiles: ["<rootDir>/src/__tests__/jestSetup.ts"],
    // Generous timeout: the suite runs against a remote (Render) Postgres, so a
    // cold start or latency spike shouldn't be read as a test failure.
    testTimeout: 30000,
};
