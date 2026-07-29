import React, { useState, forwardRef } from "react";
import { View, Text, TextInput, Pressable, type TextInputProps, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, lbl, meta, lightColors } from "../styles/theme";

export const LoginInput = forwardRef<TextInput, TextInputProps & { style?: StyleProp<ViewStyle>; label?: string; showToggle?: boolean }>(
    function LoginInput({ style, label, showToggle, ...rest }, ref) {
        const [focused, setFocused] = useState(false);
        const [hidden, setHidden] = useState(true);

        const isSecure = showToggle ? hidden : rest.secureTextEntry;

        return (
            <View style={[{ width: "100%" }, style]}>
                {label && (
                    <Text style={{ ...lbl(10, "bold", 0.12), color: lightColors.textMuted,
                        marginBottom: 6 }}>
                        {label}
                    </Text>
                )}
                <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: focused ? lightColors.primary : lightColors.border,
                }}>
                    <TextInput
                        ref={ref}
                        {...rest}
                        accessibilityLabel={rest.accessibilityLabel ?? label}
                        secureTextEntry={isSecure}
                        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
                        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
                        placeholderTextColor={lightColors.textLight}
                        autoCapitalize="none"
                        style={{ fontFamily: fonts.body, fontSize: 15, flex: 1,
                            paddingVertical: 14,
                            paddingHorizontal: 16,
                            color: lightColors.text }}
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
                                color={lightColors.textLight}
                            />
                        </Pressable>
                    )}
                </View>
            </View>
        );
    }
);
