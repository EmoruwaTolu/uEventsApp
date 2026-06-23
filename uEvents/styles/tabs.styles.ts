import type { EdgeInsets } from "react-native-safe-area-context";
import type { AppColors } from "./theme";

export const TAB_BAR_HEIGHT = 64;
export const TAB_BAR_BOTTOM_GAP = 12;

export function getTabBarTheme(insets: EdgeInsets, C?: AppColors) {
    const surface = C?.surface ?? "#FFFFFF";
    const text = C?.text ?? "#111827";
    const textMuted = C?.textMuted ?? "#6B7280";

    return {
        headerShown: false,
        tabBarActiveTintColor: text,
        tabBarInactiveTintColor: textMuted,
        tabBarLabelStyle: { fontSize: 12 },
        tabBarStyle: {
            position: "absolute",
            height: TAB_BAR_HEIGHT,
            bottom: TAB_BAR_BOTTOM_GAP + insets.bottom,
            borderRadius: 28,
            paddingTop: 6,
            paddingBottom: 6,
            backgroundColor: C ? `${surface}F2` : "rgba(255, 255, 255, 0.95)",
            borderTopWidth: 0,
            elevation: 8,
            shadowColor: "#000",
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
        },
    } as const;
}
