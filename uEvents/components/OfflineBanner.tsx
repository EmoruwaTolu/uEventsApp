import { useEffect, useRef } from "react";
import { Animated, Text, StyleSheet } from "react-native";
import { useNetworkState } from "../lib/useNetworkState";
import { useReduceMotion } from "../lib/useReduceMotion";
import { useT } from "../lib/LangContext";
import { fonts, lbl, meta, lightColors } from "../styles/theme";

export default function OfflineBanner() {
    const t = useT();
    const { isConnected } = useNetworkState();
    const reduceMotion = useReduceMotion();
    const translateY = useRef(new Animated.Value(-60)).current;

    useEffect(() => {
        Animated.timing(translateY, {
            toValue: isConnected ? -60 : 0,
            duration: reduceMotion ? 0 : 280,
            useNativeDriver: true,
        }).start();
    }, [isConnected, reduceMotion]);

    return (
        <Animated.View
            style={[styles.banner, { transform: [{ translateY }] }]}
            accessibilityRole="alert"
            accessibilityLabel={isConnected ? undefined : t.noInternet}
        >
            <Text style={styles.text}>{t.noInternet}</Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        backgroundColor: "#1C1917",
        paddingVertical: 10,
        alignItems: "center",
    },
    text: { ...lbl(11, "bold", 0.12), color: lightColors.bg },
});
