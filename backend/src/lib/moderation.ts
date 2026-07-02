import type { EventPhotoStatus } from "@prisma/client";

/**
 * Decide the initial moderation status for a freshly-uploaded recap photo.
 *
 * Default policy (no external service configured): every attendee photo is held
 * as PENDING and must be approved by the club manager before it publishes.
 *
 * If an automated image-moderation provider is wired up via env
 * (IMAGE_MODERATION_PROVIDER + credentials — e.g. Cloudinary's moderation
 * add-on, AWS Rekognition, or Hive), this is the single seam to call it and
 * short-circuit to APPROVED / REJECTED. Until then we fail safe to PENDING.
 */
export async function screenRecapPhoto(url: string): Promise<EventPhotoStatus> {
    const provider = process.env.IMAGE_MODERATION_PROVIDER;
    if (!provider) return "PENDING";

    try {
        const verdict = await callModerationProvider(provider, url);
        return verdict;
    } catch (err) {
        // On provider error, fail safe to manual review rather than publishing.
        console.error("Image moderation failed, holding for manual review:", err);
        return "PENDING";
    }
}

// Extension point for an automated provider. Returns a verdict when the
// provider is confident; throws (→ manual review) otherwise. Left unimplemented
// on purpose so no unconfigured network calls happen in production.
async function callModerationProvider(provider: string, _url: string): Promise<EventPhotoStatus> {
    throw new Error(`Image moderation provider "${provider}" is configured but not implemented`);
}
