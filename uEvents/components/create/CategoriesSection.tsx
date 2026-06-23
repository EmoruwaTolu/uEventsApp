import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  TextInput,
  Pressable,
} from "react-native";

type CategoriesSectionProps = {
    tags: string[] | undefined;
    tagInput: string;
    setTagInput: (value: string) => void;
    onAddTag: () => void;
    onRemoveTag: (tag: string) => void;
    title?: string;
};

export default function CategoriesSection({ tags, tagInput, setTagInput, onAddTag, onRemoveTag, title = "Categories" }: CategoriesSectionProps) {
    const count = tags?.length || 0;
    const [focused, setFocused] = useState(false);

    return (
        <View
            style={{
                backgroundColor: "#C0C0C0",
                marginBottom: 16,
            }}
        >
            <View
                style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 20,
                }}
            >
                <Ionicons name="pricetag" size={20} color="#8C0327" />
                <View style={{ transform: [{ scaleX: 0.78 }], transformOrigin: "left" }}>
                    <Text
                        style={{
                            fontSize: 24,
                            fontWeight: "600",
                            fontFamily: "Georgia",
                            color: "#111827",
                            letterSpacing: -0.5,
                        }}
                    >
                        {title}
                    </Text>
                </View>
            </View>

            <View style={{ marginBottom: 0 }}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 8,
                    }}
                >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#505050" }}>
                        Add Tags
                    </Text>
                    <Text style={{ fontSize: 12, color: "#505050" }}>
                        {count}/3
                    </Text>
                </View>

                {count > 0 && (
                    <View
                        style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 8,
                            marginBottom: 12,
                        }}
                    >
                        {tags?.map((tag, index) => (
                            <View
                                key={index}
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 6,
                                    backgroundColor: "#FEE2E2",
                                    borderWidth: 1,
                                    borderColor: "#FCA5A5",
                                    borderRadius: 20,
                                    paddingVertical: 6,
                                    paddingLeft: 12,
                                    paddingRight: 8,
                                }}
                            >
                                <Text style={{ fontSize: 14, fontWeight: "500", color: "#8C0327" }}>
                                    {tag}
                                </Text>
                                <Pressable onPress={() => onRemoveTag(tag)} hitSlop={8}>
                                    <Ionicons name="close-circle" size={18} color="#8C0327" />
                                </Pressable>
                            </View>
                        ))}
                    </View>
                )}

                {count < 3 && (
                    <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                        <TextInput
                            value={tagInput}
                            onChangeText={setTagInput}
                            onSubmitEditing={onAddTag}
                            placeholder="Type a tag and press enter"
                            placeholderTextColor="#9CA3AF"
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            style={{
                                flex: 1,
                                borderWidth: 1,
                                borderColor: focused ? "#8C0327" : "#D0D0D0",
                                paddingHorizontal: 16,
                                paddingVertical: 12,
                                fontSize: 16,
                                color: "#111827",
                                backgroundColor: "#ffffff",
                            }}
                            returnKeyType="done"
                        />
                        <Pressable
                            style={{
                                width: 44,
                                height: 44,
                                backgroundColor: tagInput.trim() ? "#8C0327" : "#505050",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                            onPress={onAddTag}
                            disabled={!tagInput.trim()}
                        >
                            <Ionicons name="add" size={20} color="#ffffff" />
                        </Pressable>
                    </View>
                )}
            </View>
        </View>
    );
}
