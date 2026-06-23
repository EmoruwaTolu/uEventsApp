import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import {
    View, Text, Pressable, StyleSheet,
    Animated, Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";

type Ctx = { showGuestModal: () => void };

const GuestModalCtx = createContext<Ctx>({ showGuestModal: () => {} });

const SHEET_OFFSET = 500;

export function GuestModalProvider({ children }: { children: React.ReactNode }) {
    const { signOut } = useAuth();
    const [open, setOpen] = useState(false);
    const slideAnim = useRef(new Animated.Value(SHEET_OFFSET)).current;
    const backdropAnim = useRef(new Animated.Value(0)).current;

    const showGuestModal = useCallback(() => {
        slideAnim.setValue(SHEET_OFFSET);
        backdropAnim.setValue(0);
        // Start animating before mounting so the overlay appears mid-motion
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 350,
                easing: Easing.out(Easing.bezier(0.25, 0.46, 0.45, 0.94)),
                useNativeDriver: true,
            }),
            Animated.timing(backdropAnim, {
                toValue: 1,
                duration: 280,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
            }),
        ]).start();
        setOpen(true);
    }, [slideAnim, backdropAnim]);

    const close = useCallback(() => {
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: SHEET_OFFSET,
                duration: 260,
                easing: Easing.in(Easing.bezier(0.55, 0, 0.55, 0.2)),
                useNativeDriver: true,
            }),
            Animated.timing(backdropAnim, {
                toValue: 0,
                duration: 220,
                easing: Easing.in(Easing.quad),
                useNativeDriver: true,
            }),
        ]).start(() => setOpen(false));
    }, [slideAnim, backdropAnim]);

    const goToAuth = useCallback(() => {
        close();
        setTimeout(() => signOut(), 270);
    }, [close, signOut]);

    return (
        <GuestModalCtx.Provider value={{ showGuestModal }}>
            <View style={{ flex: 1 }}>
                {children}

                {/* Overlay — only mounted when open, so it never interferes with
                    the navigation container when the modal is closed. */}
                {open && (
                    <View style={[StyleSheet.absoluteFillObject, s.overlay]}>
                        {/* Animated backdrop */}
                        <Pressable style={StyleSheet.absoluteFillObject} onPress={close}>
                            <Animated.View
                                style={[
                                    StyleSheet.absoluteFillObject,
                                    {
                                        backgroundColor: "#000",
                                        opacity: backdropAnim.interpolate({
                                            inputRange: [0, 1],
                                            outputRange: [0, 0.5],
                                        }),
                                    },
                                ]}
                            />
                        </Pressable>

                        {/* Sheet */}
                        <Animated.View
                            style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}
                        >
                            <View style={s.handle} />

                            <Pressable style={s.closeBtn} onPress={close} hitSlop={16}>
                                <Ionicons name="close" size={20} color="#9CA3AF" />
                            </Pressable>

                            <View style={s.iconWrap}>
                                <Ionicons name="school-outline" size={36} color="#8C0327" />
                            </View>

                            <Text style={s.heading}>Join uEvents</Text>
                            <Text style={s.sub}>
                                Create a free account to RSVP to events, follow clubs, like posts, and get personalised recommendations.
                            </Text>

                            <Pressable style={s.signupBtn} onPress={goToAuth}>
                                <Text style={s.signupBtnText}>CREATE ACCOUNT</Text>
                            </Pressable>

                            <Pressable style={s.loginBtn} onPress={goToAuth}>
                                <Text style={s.loginBtnText}>
                                    Already have an account?{" "}
                                    <Text style={s.loginBtnTextBold}>LOG IN</Text>
                                </Text>
                            </Pressable>
                        </Animated.View>
                    </View>
                )}
            </View>
        </GuestModalCtx.Provider>
    );
}

export function useGuestModal() {
    return useContext(GuestModalCtx);
}

const s = StyleSheet.create({
    overlay: {
        justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: "#fff",
        paddingHorizontal: 28,
        paddingTop: 16,
        paddingBottom: 44,
        alignItems: "center",
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: "#E5E7EB",
        borderRadius: 2,
        marginBottom: 20,
    },
    closeBtn: {
        position: "absolute",
        top: 16,
        right: 20,
    },
    iconWrap: {
        width: 72,
        height: 72,
        backgroundColor: "#FEE2E2",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 20,
        marginTop: 4,
    },
    heading: {
        fontSize: 24,
        fontWeight: "900",
        color: "#111827",
        letterSpacing: -0.5,
        marginBottom: 10,
        textAlign: "center",
    },
    sub: {
        fontSize: 14,
        color: "#6B7280",
        textAlign: "center",
        lineHeight: 21,
        marginBottom: 32,
    },
    signupBtn: {
        backgroundColor: "#8C0327",
        width: "100%",
        paddingVertical: 16,
        alignItems: "center",
        marginBottom: 14,
    },
    signupBtnText: {
        fontSize: 12,
        fontWeight: "900",
        color: "#fff",
        letterSpacing: 2,
    },
    loginBtn: {
        paddingVertical: 8,
    },
    loginBtnText: {
        fontSize: 13,
        color: "#6B7280",
    },
    loginBtnTextBold: {
        fontWeight: "800",
        color: "#111827",
    },
});
