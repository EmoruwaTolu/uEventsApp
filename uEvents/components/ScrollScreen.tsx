import React from "react";
import { View, ScrollView, type ViewProps, type ScrollViewProps } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
    mode?: "tab" | "modal";
    bg?: string;
    padding?: number;
    scrollProps?: ScrollViewProps;
} & Omit<ViewProps, "children"> & {
    children: React.ReactNode;
};

export default function ScrollScreen({
    mode = "tab",
    bg = "#D0D0D0",
    padding = 16,
    scrollProps,
    style,
    children,
    ...rest
}: Props) {
    const insets = useSafeAreaInsets();

    if (mode === "tab") {
        // Tab screens: only top inset; let tab bar handle bottom
        return (
        <View style={[{ flex: 1, backgroundColor: bg, paddingTop: insets.top }, style]} {...rest}>
            <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, padding }}
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            {...scrollProps}
            >
            {children}
            </ScrollView>
        </View>
        );
    }

    return (
        <SafeAreaView style={[{ flex: 1, backgroundColor: bg }, style]} edges={["top", "bottom"]} {...rest}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1, padding }}
                contentInsetAdjustmentBehavior="never"
                keyboardShouldPersistTaps="handled"
                {...scrollProps}
            >
                {children}
            </ScrollView>
        </SafeAreaView>
    );
}
