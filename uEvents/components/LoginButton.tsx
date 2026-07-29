import React, { useRef } from "react";
import { Pressable, Text, StyleProp, ViewStyle, ActivityIndicator, Animated } from "react-native";
import { fonts, lbl, meta, lightColors } from "../styles/theme";

export function LoginButton({
    title,
    onPress,
    style,
    filled = false,
    loading = false,
}: {
    title: string;
    onPress: () => void;
    style?: StyleProp<ViewStyle>;
    filled?: boolean;
    loading?: boolean;
}) {
    const scale = useRef(new Animated.Value(1)).current;

    const handlePressIn = () => {
        Animated.spring(scale, {
            toValue: 0.96,
            useNativeDriver: true,
            damping: 18,
            stiffness: 400,
        }).start();
    };

    const handlePressOut = () => {
        Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            damping: 14,
            stiffness: 250,
        }).start();
    };

    return (
        <Animated.View style={[{ transform: [{ scale }] }, style]}>
            <Pressable
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel={title}
                accessibilityState={{ disabled: loading, busy: loading }}
                style={({ pressed }) => ({
                    width: "100%",
                    paddingVertical: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: filled
                        ? pressed ? lightColors.primaryDeep : lightColors.primary
                        : pressed ? lightColors.bg : "transparent",
                    borderWidth: 1.5,
                    borderColor: filled ? lightColors.primary : lightColors.textFaint,
                    opacity: loading ? 0.7 : 1,
                })}
            >
                {loading ? (
                    <ActivityIndicator color={filled ? "#fff" : lightColors.primary} size="small" />
                ) : (
                    <Text style={{ ...lbl(12, "bold", 0.12), color: filled ? "#ffffff" : lightColors.textBody }}>
                        {title}
                    </Text>
                )}
            </Pressable>
        </Animated.View>
    );
}
