import React from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";

type Event = {
    id: string;
    name: string;
    time?: string;
    tags?: string[];
    club?: string;
    posterUrl?: string;
};

export default function EventCard({ event }: { event: Event }) {
    const router = useRouter();
    const { width } = useWindowDimensions();

    const cardW = Math.min(200, 0.45 * width);
    const cardH = Math.min(320, 0.70 * width);
    const pad = Math.min(10, 0.03 * width);
    const radius = 0.03 * width;

    return (
        <Pressable
        onPress={() => router.push({ pathname: "/event/[id]", params: { id: event.id } })}
        style={{
            width: cardW,
            height: cardH,
            padding: pad,
            borderRadius: radius,
            backgroundColor: "#8C0327",
            borderWidth: 1,
            borderColor: "#A8763E",
        }}
        >
            <View
                style={{
                width: "100%",
                aspectRatio: 1,
                borderRadius: radius,
                overflow: "hidden",
                backgroundColor: "aquamarine",
                }}
            >
                {!!event.posterUrl && (
                    <ExpoImage source={{ uri: event.posterUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} />
                )}
            </View>

            <View style={{ paddingVertical: Math.min(10, 0.03 * width) }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text numberOfLines={1} style={{ color: "#fff"}}>
                    {event.name}
                </Text>
                <View style={{ width: 25, height: 25, borderRadius: 12.5, backgroundColor: "#000" }} />
                </View>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {event.tags?.map((t, i) => (
                <View key={i} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.15)" }}>
                    <Text style={{ color: "#fff", fontSize: 12 }}>{t}</Text>
                </View>
                ))}
            </View>
        </Pressable>
    );
}
