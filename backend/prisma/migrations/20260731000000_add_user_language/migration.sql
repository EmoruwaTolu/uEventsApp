-- Mirrors the app's selected UI language so server-composed push notifications
-- can be sent in the language the user actually reads. Existing rows default to
-- "en", which matches the copy they were receiving before this change.
ALTER TABLE "User" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
