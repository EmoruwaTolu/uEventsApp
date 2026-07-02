import React, { useState, forwardRef } from "react";
import { View, Text, TextInput, Pressable, type TextInputProps, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export const LoginInput = forwardRef<TextInput, TextInputProps & { style?: StyleProp<ViewStyle>; label?: string; showToggle?: boolean }>(
    function LoginInput({ style, label, showToggle, ...rest }, ref) {
        const [focused, setFocused] = useState(false);
        const [hidden, setHidden] = useState(true);

        const isSecure = showToggle ? hidden : rest.secureTextEntry;

        return (
            <View style={[{ width: "100%" }, style]}>
                {label && (
                    <Text style={{
                        fontSize: 10,
                        fontWeight: "800",
                        letterSpacing: 1.5,
                        color: "#6B7280",
                        marginBottom: 6,
                    }}>
                        {label}
                    </Text>
                )}
                <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: focused ? "#8C0327" : "#DDD8D0",
                }}>
                    <TextInput
                        ref={ref}
                        {...rest}
                        accessibilityLabel={rest.accessibilityLabel ?? label}
                        secureTextEntry={isSecure}
                        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
                        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
                        placeholderTextColor="#9CA3AF"
                        autoCapitalize="none"
                        style={{
                            flex: 1,
                            paddingVertical: 14,
                            paddingHorizontal: 16,
                            color: "#111827",
                            fontSize: 15,
                        }}
                    />
                    {showToggle && (
                        <Pressable
                            onPress={() => setHidden((h) => !h)}
                            style={{ paddingHorizontal: 14 }}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={hidden ? "Show password" : "Hide password"}
                        >
                            <Ionicons
                                name={hidden ? "eye-outline" : "eye-off-outline"}
                                size={20}
                                color="#9CA3AF"
                            />
                        </Pressable>
                    )}
                </View>
            </View>
        );
    }
);
