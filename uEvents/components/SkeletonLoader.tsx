import { useEffect, useRef } from "react";
import { Animated, View, Text, Pressable, StyleSheet, ViewStyle, DimensionValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/LangContext";
import { useReduceMotion } from "../lib/useReduceMotion";

export function SkeletonBox({ width, height, style }: { width?: DimensionValue; height: number; style?: ViewStyle }) {
    const { colors: C } = useTheme();
    const reduceMotion = useReduceMotion();
    const opacity = useRef(new Animated.Value(reduceMotion ? 0.6 : 0.3)).current;

    useEffect(() => {
        if (reduceMotion) {
            opacity.setValue(0.6);
            return;
        }
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, [reduceMotion]);

    return (
        <Animated.View
            style={[
                { backgroundColor: C.skeleton, height, width: width ?? "100%" } as const,
                style,
                { opacity },
            ]}
        />
    );
}

export function EventCardSkeleton() {
    const { colors: C } = useTheme();
    return (
        <View style={{ backgroundColor: C.surface, marginBottom: 12, overflow: "hidden" }}>
            <SkeletonBox height={140} />
            <View style={{ padding: 14 }}>
                <SkeletonBox height={10} width="40%" />
                <SkeletonBox height={20} width="80%" style={{ marginTop: 8 }} />
                <SkeletonBox height={14} width="60%" style={{ marginTop: 6 }} />
            </View>
        </View>
    );
}

export function NotifRowSkeleton() {
    const { colors: C } = useTheme();
    return (
        <View style={{ flexDirection: "row", gap: 14, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }}>
            <SkeletonBox width={40} height={40} />
            <View style={{ flex: 1, justifyContent: "center" }}>
                <SkeletonBox height={12} width="60%" />
                <SkeletonBox height={10} width="80%" style={{ marginTop: 6 }} />
            </View>
        </View>
    );
}

export function PostDetailSkeleton() {
    return (
        <View>
            <SkeletonBox height={240} />
            <View style={{ padding: 20 }}>
                <SkeletonBox height={10} width="30%" />
                <SkeletonBox height={28} width="90%" style={{ marginTop: 10 }} />
                <SkeletonBox height={14} width="100%" style={{ marginTop: 10 }} />
                <SkeletonBox height={14} width="85%" style={{ marginTop: 6 }} />
                <SkeletonBox height={14} width="70%" style={{ marginTop: 6 }} />
            </View>
        </View>
    );
}

export function FeedCardSkeleton() {
    const { colors: C } = useTheme();
    return (
        <View style={{ backgroundColor: C.surface, marginBottom: 2, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}>
                <SkeletonBox width={32} height={32} style={{ borderRadius: 16 }} />
                <View style={{ flex: 1, gap: 4 }}>
                    <SkeletonBox height={11} width="40%" />
                    <SkeletonBox height={9} width="25%" />
                </View>
            </View>
            <SkeletonBox height={180} />
            <View style={{ padding: 14, gap: 6 }}>
                <SkeletonBox height={18} width="85%" />
                <SkeletonBox height={12} width="65%" style={{ marginTop: 6 }} />
                <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
                    <SkeletonBox width={60} height={10} />
                    <SkeletonBox width={60} height={10} />
                    <SkeletonBox width={60} height={10} />
                </View>
            </View>
        </View>
    );
}

export function ProfileSkeleton() {
    return (
        <View style={{ padding: 20 }}>
            <View style={{ flexDirection: "row", gap: 16, alignItems: "center", marginBottom: 24 }}>
                <SkeletonBox width={72} height={72} style={{ borderRadius: 36 }} />
                <View style={{ flex: 1 }}>
                    <SkeletonBox height={18} width="50%" />
                    <SkeletonBox height={12} width="70%" style={{ marginTop: 8 }} />
                </View>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
                {[0, 1, 2].map((i) => (
                    <View key={i} style={{ flex: 1 }}>
                        <SkeletonBox height={100} />
                        <SkeletonBox height={12} width="60%" style={{ marginTop: 8 }} />
                    </View>
                ))}
            </View>
        </View>
    );
}

export function ErrorRetry({ message = "Something went wrong", onRetry }: { message?: string; onRetry: () => void }) {
    const { colors: C } = useTheme();
    const t = useT();
    return (
        <View style={{ alignItems: "center", paddingVertical: 48, gap: 12 }}>
            <Ionicons name="cloud-offline-outline" size={32} color={C.textFaint} />
            <Text style={{ fontSize: 12, fontWeight: "700", color: C.textLight, letterSpacing: 1, textAlign: "center" }}>{message}</Text>
            <Pressable
                style={{ borderWidth: 1.5, borderColor: C.primary, paddingHorizontal: 20, paddingVertical: 9 }}
                onPress={onRetry}
                accessibilityRole="button"
                accessibilityLabel="Retry"
                hitSlop={8}
            >
                <Text style={{ fontSize: 10, fontWeight: "800", color: C.primary, letterSpacing: 1.5 }}>{t.retry}</Text>
            </Pressable>
        </View>
    );
}
