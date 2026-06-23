import React, { useMemo, useState } from "react";
import { View, Image, Text, StyleSheet } from "react-native";

export type ClubBadgeProps = {
    logoUri?: string;
    name?: string;
    size?: number;
    borderColor?: string;
    backgroundColor?: string;
};

export default function ClubBadge({
    logoUri,
    name,
    size = 44,
    borderColor = "#A8763E",
    backgroundColor = "#111827",
}: ClubBadgeProps) {
    const [imgError, setImgError] = useState(false);
    const radius = size / 2;

    const initials = useMemo(() => {
        if (!name) return "•";

        return name.trim().split(/\s+/).map((w) => w[0]?.toUpperCase()).join("").slice(0, 2) || "•";
    }, [name]);

    const showInitials = !logoUri || imgError;

    return (
        <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={name ? `Organizer: ${name}` : "Organizer"}
        style={[
            styles.container,
            {
            width: size,
            height: size,
            borderRadius: radius,
            borderColor,
            backgroundColor,
            },
        ]}
        >
            {showInitials ? (
                <Text style={styles.initials}>{initials}</Text>
            ) : (
                <Image
                source={{ uri: logoUri! }}
                style={{ width: "100%", height: "100%" }}
                onError={() => setImgError(true)}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        overflow: "hidden",
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
    },
    initials: {
        color: "#fff",
        fontWeight: "800",
    },
});
