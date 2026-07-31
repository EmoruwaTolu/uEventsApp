import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useReduceMotion } from "../lib/useReduceMotion";
import { useAppReady } from "../lib/splash";

// Must stay in step with app.json -> splash.backgroundColor.
const SPLASH_BG = "#8C0327";
const FADE_MS = 420;

// A JS copy of the native launch image, mounted from the first frame and sitting
// under it. lib/splash.ts drops the native image without animation once the app
// is ready, so this takes over invisibly; the fade below is then the only motion
// the user actually sees, going straight from the logo to the loaded app.
//
// resizeMode="contain" over a full-bleed view is exactly what the native launch
// screen does with this same asset, which is what makes the swap invisible — if
// the asset or the background colour changes, both have to change together.
export default function LaunchOverlay() {
    const ready = useAppReady();
    const reduceMotion = useReduceMotion();
    const [done, setDone] = useState(false);
    const opacity = useRef(new Animated.Value(1)).current;
    const scale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (!ready) return;
        const duration = reduceMotion ? 0 : FADE_MS;
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 0,
                duration,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
            // Drifts outward slightly so the logo recedes instead of just
            // dimming — the same idiom as iOS zooming the icon in on launch.
            Animated.timing(scale, {
                toValue: reduceMotion ? 1 : 1.08,
                duration,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
        ]).start(({ finished }) => {
            if (finished) setDone(true);
        });
    }, [ready, reduceMotion, opacity, scale]);

    if (done) return null;

    // Touches stay blocked for the length of the fade: the app underneath is
    // visible before it is legible, and a tap that lands on a half-faded screen
    // is never the one the user meant.
    return (
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity }]}>
            <StatusBar style="light" />
            <Animated.Image
                source={require("../assets/splash-icon.png")}
                style={[StyleSheet.absoluteFill, { transform: [{ scale }] }]}
                resizeMode="contain"
                fadeDuration={0}
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    backdrop: { backgroundColor: SPLASH_BG },
});
