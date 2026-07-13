-- Comment & reply notifications: new NotifType values.
-- (Enum values are added one per statement, matching the DIGEST/ADMIN precedent.)
ALTER TYPE "NotifType" ADD VALUE 'COMMENT';
ALTER TYPE "NotifType" ADD VALUE 'REPLY';
