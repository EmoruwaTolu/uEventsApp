/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testMatch: ["**/__tests__/**/*.test.ts"],
    setupFiles: ["<rootDir>/src/__tests__/jestSetup.ts"],
    testTimeout: 15000,
};
