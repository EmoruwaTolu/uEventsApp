import { useEffect, useRef } from "react";
import { Animated, Text, StyleSheet } from "react-native";
import { useNetworkState } from "../lib/useNetworkState";

export default function OfflineBanner() {
    const { isConnected } = useNetworkState();
    const translateY = useRef(new Animated.Value(-60)).current;

    useEffect(() => {
        Animated.timing(translateY, {
            toValue: isConnected ? -60 : 0,
            duration: 280,
            useNativeDriver: true,
        }).start();
    }, [isConnected]);

    return (
        <Animated.View style={[styles.banner, { transform: [{ translateY }] }]}>
            <Text style={styles.text}>NO INTERNET CONNECTION</Text>
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
    text: {
        color: "#F7F3EE",
        fontSize: 11,
        fontWeight: "800",
        letterSpacing: 1.5,
    },
});
