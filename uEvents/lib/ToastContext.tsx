import React, { createContext, useContext, useRef, useState, useCallback } from "react";
import { Animated, Text, StyleSheet, Platform, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./ThemeContext";

type ToastType = "success" | "error" | "info";

type ToastState = {
    message: string;
    type: ToastType;
    visible: boolean;
    action?: { label: string; onPress: () => void };
};

type ToastContextValue = {
    showToast: (message: string, type?: ToastType) => void;
    showActionToast: (message: string, actionLabel: string, onAction: () => void, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue>({ showToast: () => {}, showActionToast: () => {} });

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toast, setToast] = useState<ToastState>({ message: "", type: "success", visible: false });
    const translateY = useRef(new Animated.Value(80)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const actionRef = useRef<(() => void) | null>(null);
    const insets = useSafeAreaInsets();
    const { colors: C } = useTheme();

    const dismiss = useCallback(() => {
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        Animated.parallel([
            Animated.timing(translateY, { toValue: 80, duration: 250, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => setToast((t) => ({ ...t, visible: false })));
    }, [translateY, opacity]);

    const show = useCallback((message: string, type: ToastType, action?: { label: string; onPress: () => void }, duration = 2800) => {
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
        actionRef.current = action?.onPress ?? null;
        setToast({ message, type, visible: true, action });

        translateY.setValue(80);
        opacity.setValue(0);

        Animated.parallel([
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 200 }),
            Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        ]).start();

        hideTimer.current = setTimeout(dismiss, duration);
    }, [translateY, opacity, dismiss]);

    const showToast = useCallback((message: string, type: ToastType = "success") => {
        show(message, type);
    }, [show]);

    const showActionToast = useCallback((message: string, actionLabel: string, onAction: () => void, type: ToastType = "info") => {
        show(message, type, { label: actionLabel, onPress: onAction }, 3000);
    }, [show]);

    // Accent + icon encode the toast type; the surface stays white/editorial.
    const accent =
        toast.type === "error" ? C.primary :
        toast.type === "info" ? C.text :
        C.gold;

    const icon =
        toast.type === "error" ? "alert-circle" :
        toast.type === "info" ? "information-circle" :
        "checkmark-circle";

    const hasAction = !!toast.action;

    return (
        <ToastContext.Provider value={{ showToast, showActionToast }}>
            {children}
            {toast.visible && (
                <Animated.View
                    pointerEvents={hasAction ? "box-none" : "none"}
                    style={[
                        styles.toast,
                        { backgroundColor: C.surface, borderColor: C.borderWarm, bottom: insets.bottom + 76, transform: [{ translateY }], opacity },
                    ]}
                >
                    <View style={[styles.accent, { backgroundColor: accent }]} />
                    <View style={styles.toastRow}>
                        <Ionicons name={icon} size={18} color={accent} />
                        <Text style={[styles.text, { color: C.text }]} numberOfLines={2}>{toast.message}</Text>
                        {hasAction && (
                            <Pressable
                                onPress={() => {
                                    toast.action?.onPress();
                                    dismiss();
                                }}
                                hitSlop={12}
                                style={styles.actionBtn}
                            >
                                <Text style={[styles.actionText, { color: C.primary }]}>{toast.action!.label.toUpperCase()}</Text>
                            </Pressable>
                        )}
                    </View>
                </Animated.View>
            )}
        </ToastContext.Provider>
    );
}

const styles = StyleSheet.create({
    toast: {
        position: "absolute",
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "stretch",
        minWidth: 200,
        maxWidth: 360,
        borderRadius: 0,
        borderWidth: StyleSheet.hairlineWidth,
        zIndex: 9999,
        ...Platform.select({
            ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowOffset: { width: 0, height: 4 }, shadowRadius: 12 },
            android: { elevation: 6 },
        }),
    },
    accent: {
        width: 4,
    },
    toastRow: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    text: {
        flexShrink: 1,
        fontSize: 13.5,
        fontWeight: "600",
        letterSpacing: 0.1,
    },
    actionBtn: {
        paddingLeft: 8,
        marginLeft: "auto",
    },
    actionText: {
        fontSize: 11,
        fontWeight: "800",
        letterSpacing: 1.2,
    },
});
