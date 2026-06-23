import React from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/LangContext";
import type { AppColors } from "../styles/theme";

type Props = {
    visible: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    /** Render the body inside the scaffold's own ScrollView (default). Pass false
     *  if the children manage their own scrolling (e.g. a FlatList). */
    scroll?: boolean;
    children: React.ReactNode;
};

/**
 * Full-screen slide-up modal page that matches the Settings screen chrome:
 * a top bar with a back control, a large editorial heading, and a maroon accent.
 * Used for the app's "page" modals so they all look identical.
 */
export default function ModalScreen({ visible, onClose, title, subtitle, scroll = true, children }: Props) {
    const { colors: C } = useTheme();
    const s = React.useMemo(() => makeStyles(C), [C]);
    const t = useT();
    const insets = useSafeAreaInsets();

    const header = (
        <View style={s.masthead}>
            <Text style={s.heading}>{title}</Text>
            {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
            <View style={s.accent} />
        </View>
    );

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={[s.safe, { paddingTop: insets.top }]}>
                <View style={s.topBar}>
                    <Pressable onPress={onClose} style={s.backGroup} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.back}>
                        <Ionicons name="arrow-back" size={18} color={C.primary} />
                        <Text style={s.backLabel}>{t.back}</Text>
                    </Pressable>
                </View>
                {scroll ? (
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
                        {header}
                        {children}
                    </ScrollView>
                ) : (
                    <View style={{ flex: 1 }}>
                        {header}
                        {children}
                    </View>
                )}
            </View>
        </Modal>
    );
}

const makeStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
    backGroup: { flexDirection: "row", alignItems: "center", gap: 6 },
    backLabel: { fontSize: 14, fontWeight: "900", color: C.primary, letterSpacing: 2 },
    scroll: { paddingBottom: 40 },
    masthead: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 },
    heading: { fontSize: 40, fontWeight: "900", color: C.text, letterSpacing: -1.2, lineHeight: 44 },
    subtitle: { fontSize: 13, fontWeight: "600", color: C.textMuted, letterSpacing: 1, marginTop: 8 },
    accent: { width: 48, height: 3, backgroundColor: C.primary, marginTop: 14 },
});
