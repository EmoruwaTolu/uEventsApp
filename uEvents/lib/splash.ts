// lib/splash.ts
import { useSyncExternalStore } from "react";
import * as SplashScreen from "expo-splash-screen";

// Startup runs in two layers so there is never a visible cut:
//
//   1. the native launch image (app.json -> splash) — crimson, logo centred
//   2. LaunchOverlay, a JS view drawn to be pixel-identical to it
//
// The overlay mounts on the first JS frame, hidden underneath the native image.
// Once fonts and the auth session have both resolved we drop the native image
// with no animation — the overlay behind it looks the same, so nothing appears
// to happen — and only then fade the overlay out to reveal the app. That turns
// what used to be a crimson -> cream jump cut into one continuous reveal.
//
// A splash that never lifts is a dead app, so every path that can end startup
// funnels through markAppReady(), and it only ever fires once.

const WATCHDOG_MS = 8000;

let ready = false;
const listeners = new Set<() => void>();

export function holdSplash() {
    SplashScreen.preventAutoHideAsync().catch(() => {});
    // No native fade. The handoff to the overlay has to be an invisible swap,
    // and cross-fading two identical images only adds haze in the middle.
    SplashScreen.setOptions({ fade: false });
    // Nothing below should take this long. If it does, an abrupt reveal is a far
    // better outcome than a permanently stuck launch image.
    setTimeout(markAppReady, WATCHDOG_MS);
}

export function markAppReady() {
    if (ready) return;
    ready = true;
    // Rejects if the splash is already gone; that's the state we wanted anyway.
    SplashScreen.hideAsync().catch(() => {});
    for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
    listeners.add(notify);
    return () => {
        listeners.delete(notify);
    };
}

// Deliberately a module-level store rather than context: `ready` is decided deep
// inside the provider stack (Gate) but consumed above it (LaunchOverlay), and
// threading a provider around the whole tree to move one boolean upward would
// re-render every screen to do it.
export function useAppReady() {
    return useSyncExternalStore(subscribe, () => ready, () => ready);
}
