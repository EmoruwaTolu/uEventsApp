/**
 * Observability: Sentry (crashes) + PostHog (product analytics).
 *
 * Both are keyed by env vars and NO-OP silently when unset, so dev builds
 * without keys behave exactly as before:
 *   EXPO_PUBLIC_SENTRY_DSN        — from sentry.io project settings
 *   EXPO_PUBLIC_POSTHOG_API_KEY   — from posthog.com project settings
 *   EXPO_PUBLIC_POSTHOG_HOST      — optional, defaults to US cloud
 *
 * Usage: call `initObservability()` once at app start (root layout), then
 * `analytics.track/identify/screen/reset` anywhere. Never import Sentry or
 * PostHog directly from app code — go through this module so call sites
 * stay one-liners and the no-op guarantee holds.
 */
import * as Sentry from "@sentry/react-native";
import PostHog from "posthog-react-native";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || "";
const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || "";
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

let posthog: PostHog | null = null;
let initialized = false;

export function initObservability() {
    if (initialized) return;
    initialized = true;

    if (SENTRY_DSN) {
        Sentry.init({
            dsn: SENTRY_DSN,
            // Keep perf sampling modest for a beta; crashes are always captured.
            tracesSampleRate: 0.2,
            // Don't spam Sentry from dev sessions.
            enabled: !__DEV__,
        });
    }

    if (POSTHOG_KEY) {
        posthog = new PostHog(POSTHOG_KEY, {
            host: POSTHOG_HOST,
            // Batch events; flush every 30s or 20 events.
            flushAt: 20,
            flushInterval: 30000,
        });
    }
}

// PostHog property values must be JSON-serializable primitives/objects.
type Props = Record<string, string | number | boolean | null | undefined>;

export const analytics = {
    /** Product event, e.g. track("rsvp", { postId, action: "join" }) */
    track(event: string, properties?: Props) {
        posthog?.capture(event, properties);
    },

    /** Tie events to a user after sign-in/up. Never pass emails/names — IDs only. */
    identify(userId: string, properties?: Props) {
        posthog?.identify(userId, properties);
        if (SENTRY_DSN) Sentry.setUser({ id: userId });
    },

    /** Screen view — wired globally in the root layout via usePathname(). */
    screen(name: string, properties?: Props) {
        posthog?.screen(name, properties);
    },

    /** Clear identity on sign-out. */
    reset() {
        posthog?.reset();
        if (SENTRY_DSN) Sentry.setUser(null);
    },

    /** Non-fatal error worth seeing in Sentry (caught exceptions, API failures). */
    captureError(error: unknown, context?: Record<string, unknown>) {
        if (!SENTRY_DSN) return;
        Sentry.captureException(error, context ? { extra: context } : undefined);
    },
};

/** Wrap the root component so Sentry instruments navigation + touch events. */
export function wrapRoot<P extends Record<string, unknown>>(component: React.ComponentType<P>) {
    return SENTRY_DSN ? Sentry.wrap(component) : component;
}
