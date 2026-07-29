import React from "react";
import { View, Text } from "react-native";
import { fonts, lbl, meta, lightColors } from "../styles/theme";

export default function TagChips({ tags }: { tags: string[] }) {
    return (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {tags.map((t) => (
                <View
                key={t}
                style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 9999,
                    backgroundColor: "#8F001A",
                    borderWidth: 1,
                    borderColor: "#A8763E",
                }}
                >
                    <Text style={{ ...meta(12, "regular"), color: "#fff" }}>
                        {t}
                    </Text>
                </View>
            ))}
        </View>
    );
}
