import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { lightColors, meta, lbl, fonts } from "../../styles/theme";
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
                <Ionicons name="pricetag" size={20} color={lightColors.primary} />
                <View style={{ transform: [{ scaleX: 0.78 }], transformOrigin: "left" }}>
                    <Text
                        style={{
                            fontSize: 24,
                            fontFamily: fonts.displayBold,
                            color: lightColors.text,
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
                    <Text style={{ ...meta(14, "semi"), color: "#505050" }}>
                        Add Tags
                    </Text>
                    <Text style={{ ...meta(12, "regular"), color: "#505050" }}>
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
                                <Text style={{ ...meta(14, "medium"), color: lightColors.primary }}>
                                    {tag}
                                </Text>
                                <Pressable onPress={() => onRemoveTag(tag)} hitSlop={8}>
                                    <Ionicons name="close-circle" size={18} color={lightColors.primary} />
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
                            placeholderTextColor={lightColors.textLight}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            style={{ fontFamily: fonts.body, fontSize: 16, flex: 1,
                                borderWidth: 1,
                                borderColor: focused ? lightColors.primary : lightColors.border,
                                paddingHorizontal: 16,
                                paddingVertical: 12,
                                
                                color: lightColors.text,
                                backgroundColor: "#ffffff" }}
                            returnKeyType="done"
                        />
                        <Pressable
                            style={{
                                width: 44,
                                height: 44,
                                backgroundColor: tagInput.trim() ? lightColors.primary : "#505050",
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
