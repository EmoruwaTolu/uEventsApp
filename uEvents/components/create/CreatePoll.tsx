import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PollCore } from "../../app/(tabs)/create";
import { lightColors, meta, lbl, fonts } from "../../styles/theme";

type CreatePollProps = {
    pollCore: PollCore;
    onPollCoreChange: <K extends keyof PollCore>(
        key: K,
        value: PollCore[K]
    ) => void;
    addPollOption: () => void;
    removePollOption: (id: string) => void;
    updatePollOption: (id: string, text: string) => void;
};

export default function CreatePoll({ pollCore, onPollCoreChange, addPollOption, removePollOption, updatePollOption }: CreatePollProps) {
    const [focused, setFocused] = useState<string | null>(null);

    const inputStyle = (field: string) => ({ fontFamily: fonts.body, fontSize: 16, flex: 1,
        borderWidth: 1,
        borderColor: focused === field ? lightColors.primary : lightColors.border,
        paddingHorizontal: 16,
        paddingVertical: 12,
        
        color: lightColors.text,
        backgroundColor: "#ffffff" });

    return (
        <View
            style={{
                backgroundColor: "#C0C0C0",
                marginBottom: 16,
                elevation: 2,
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
                <Ionicons name="bar-chart" size={20} color={lightColors.primary} />
                <View style={{ transform: [{ scaleX: 0.78 }], transformOrigin: "left" }}>
                    <Text
                        style={{
                            fontSize: 24,
                            fontFamily: fonts.displayBold,
                            color: lightColors.text,
                            letterSpacing: -0.5,
                        }}
                    >
                        Poll Settings
                    </Text>
                </View>
            </View>

            <View style={{ marginBottom: 20 }}>
                <Text style={{ ...meta(14, "semi"), color: lightColors.textBody, marginBottom: 8 }}>
                    Poll Options
                </Text>
                {pollCore.options.map((option, index) => (
                    <View
                        key={option.id}
                        style={{
                            flexDirection: "row",
                            gap: 8,
                            marginBottom: 8,
                            alignItems: "center",
                        }}
                    >
                        <View
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 16,
                                backgroundColor: "#F3F4F6",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Text style={{ ...meta(14, "semi"), color: lightColors.textMuted }}>
                                {index + 1}
                            </Text>
                        </View>
                        <TextInput
                            value={option.text}
                            onChangeText={(t) => updatePollOption(option.id, t)}
                            placeholder={`Option ${index + 1}`}
                            placeholderTextColor={lightColors.textLight}
                            onFocus={() => setFocused(option.id)}
                            onBlur={() => setFocused(null)}
                            style={inputStyle(option.id)}
                        />
                        {pollCore.options.length > 2 && (
                            <Pressable onPress={() => removePollOption(option.id)} hitSlop={8}>
                                <Ionicons name="close-circle" size={24} color="#EF4444" />
                            </Pressable>
                        )}
                    </View>
                ))}

                {pollCore.options.length < 6 && (
                    <Pressable
                        onPress={addPollOption}
                        style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            paddingVertical: 12,
                            borderWidth: 1,
                            borderColor: lightColors.border,
                            borderStyle: "dashed",
                            backgroundColor: "#F9FAFB",
                            marginTop: 8,
                        }}
                    >
                        <Ionicons name="add" size={20} color={lightColors.primary} />
                        <Text style={{ ...meta(15, "semi"), color: lightColors.primary }}>
                            Add Option
                        </Text>
                    </Pressable>
                )}
            </View>

            <View style={{ marginBottom: 16 }}>
                <Text style={{ ...meta(14, "semi"), color: lightColors.textBody, marginBottom: 8 }}>
                    Expires At{" "}
                    <Text style={{ ...meta(13, "regular"), color: lightColors.textLight }}>(optional)</Text>
                </Text>
                <TextInput
                    value={pollCore.expiresAt}
                    onChangeText={(t) => onPollCoreChange("expiresAt", t)}
                    placeholder="2025-12-15 23:59"
                    placeholderTextColor={lightColors.textLight}
                    onFocus={() => setFocused("expiresAt")}
                    onBlur={() => setFocused(null)}
                    style={{ fontFamily: fonts.body, fontSize: 16, borderWidth: 1,
                        borderColor: focused === "expiresAt" ? lightColors.primary : lightColors.border,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        
                        color: lightColors.text,
                        backgroundColor: "#ffffff" }}
                />
            </View>

            <Pressable
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 16,
                    paddingHorizontal: 16,
                    backgroundColor: "#F9FAFB",
                }}
                onPress={() => onPollCoreChange("allowMultiple", !pollCore.allowMultiple)}
            >
                <View style={{ flex: 1 }}>
                    <Text style={{ ...meta(15, "semi"), color: lightColors.text, marginBottom: 2 }}>
                        Allow Multiple Selections
                    </Text>
                    <Text style={{ ...meta(13, "regular"), color: lightColors.textMuted }}>
                        {pollCore.allowMultiple ? "Users can select multiple options" : "Users can select one option"}
                    </Text>
                </View>
                <View
                    style={{
                        width: 52,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: pollCore.allowMultiple ? lightColors.primary : lightColors.border,
                        padding: 2,
                        justifyContent: "center",
                    }}
                >
                    <View
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: "#ffffff",
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.2,
                            shadowRadius: 2,
                            elevation: 2,
                            alignSelf: pollCore.allowMultiple ? "flex-end" : "flex-start",
                        }}
                    />
                </View>
            </Pressable>
        </View>
    );
}
