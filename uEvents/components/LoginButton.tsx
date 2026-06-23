import React, { useRef } from "react";
import { Pressable, Text, StyleProp, ViewStyle, ActivityIndicator, Animated } from "react-native";

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
                style={({ pressed }) => ({
                    width: "100%",
                    paddingVertical: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: filled
                        ? pressed ? "#6B0220" : "#8C0327"
                        : pressed ? "#F7F3EE" : "transparent",
                    borderWidth: 1.5,
                    borderColor: filled ? "#8C0327" : "#D1CBC3",
                    opacity: loading ? 0.7 : 1,
                })}
            >
                {loading ? (
                    <ActivityIndicator color={filled ? "#fff" : "#8C0327"} size="small" />
                ) : (
                    <Text style={{
                        fontSize: 12,
                        fontWeight: "800",
                        letterSpacing: 2,
                        color: filled ? "#ffffff" : "#374151",
                    }}>
                        {title}
                    </Text>
                )}
            </Pressable>
        </Animated.View>
    );
}
