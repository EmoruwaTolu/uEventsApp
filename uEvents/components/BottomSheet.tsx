import React, { useEffect, useRef, useState } from "react";
import {
    Animated,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    View,
    Text,
    useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/ThemeContext";
import { useReduceMotion } from "../lib/useReduceMotion";

type Props = {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** When set, the sheet renders the standard surface: drag handle + a header
     *  with this title, an optional count, and a close button. Omit `title` to
     *  render raw children (used for custom content like date pickers). */
    title?: string;
    count?: string | number;
};

/**
 * Reusable animated bottom sheet with a consistent surface + header.
 *
 * - Sheet springs up, backdrop fades in on open; slides down on close.
 * - Tapping the backdrop calls onClose. Keyboard-aware on iOS.
 * - Pass `title` for the standardized surface (handle, header, close button,
 *   white surface, capped height). Without `title`, children render as-is.
 */
export default function BottomSheet({ visible, onClose, children, title, count }: Props) {
    const { colors: C } = useTheme();
    const { height } = useWindowDimensions();
    const [mounted, setMounted] = useState(false);
    const slideAnim = useRef(new Animated.Value(600)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;
    const reduceMotion = useReduceMotion();

    useEffect(() => {
        if (visible) {
            setMounted(true);
            slideAnim.setValue(reduceMotion ? 0 : 600);
            backdropAnim.setValue(reduceMotion ? 1 : 0);
            Animated.parallel([
                reduceMotion
                    ? Animated.timing(slideAnim, { toValue: 0, duration: 0, useNativeDriver: true })
                    : Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 62, friction: 11 }),
                Animated.timing(backdropAnim, { toValue: 1, duration: reduceMotion ? 0 : 220, useNativeDriver: true }),
            ]).start();
        } else if (mounted) {
            Animated.parallel([
                Animated.timing(slideAnim, { toValue: 600, duration: reduceMotion ? 0 : 240, useNativeDriver: true }),
                Animated.timing(backdropAnim, { toValue: 0, duration: reduceMotion ? 0 : 200, useNativeDriver: true }),
            ]).start(() => setMounted(false));
        }
    }, [visible, reduceMotion]);

    const content = title !== undefined ? (
        <View style={[s.surface, { backgroundColor: C.surface, maxHeight: height * 0.85 }]}>
            <View style={[s.handle, { backgroundColor: C.textFaint }]} />
            <View style={[s.header, { borderBottomColor: C.borderWarm }]}>
                <View style={s.headerLeft}>
                    <Text style={[s.title, { color: C.text }]} numberOfLines={1}>{title}</Text>
                    {count !== undefined && <Text style={[s.count, { color: C.textLight }]}>{count}</Text>}
                </View>
                <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
                    <Ionicons name="close" size={20} color={C.textBody} />
                </Pressable>
            </View>
            {children}
        </View>
    ) : children;

    return (
        <Modal visible={mounted} animationType="none" transparent statusBarTranslucent onRequestClose={onClose}>
            <Animated.View style={[s.backdrop, { opacity: backdropAnim }]} pointerEvents="none" />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.kav}>
                <Pressable style={{ flex: 1 }} onPress={onClose} />
                <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>
                    {content}
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const s = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
    kav: { flex: 1, justifyContent: "flex-end" },
    surface: { paddingTop: 10 },
    handle: { width: 36, height: 4, alignSelf: "center", marginBottom: 6 },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
    title: { fontSize: 14, fontWeight: "900", letterSpacing: 2 },
    count: { fontSize: 11, fontWeight: "700" },
});
