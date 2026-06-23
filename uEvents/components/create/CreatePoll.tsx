import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PollCore } from "../../app/(tabs)/create";

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

    const inputStyle = (field: string) => ({
        flex: 1,
        borderWidth: 1,
        borderColor: focused === field ? "#8C0327" : "#D0D0D0",
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        color: "#111827",
        backgroundColor: "#ffffff",
    });

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
                <Ionicons name="bar-chart" size={20} color="#8C0327" />
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
                        Poll Settings
                    </Text>
                </View>
            </View>

            <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
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
                            <Text style={{ fontSize: 14, fontWeight: "600", color: "#6B7280" }}>
                                {index + 1}
                            </Text>
                        </View>
                        <TextInput
                            value={option.text}
                            onChangeText={(t) => updatePollOption(option.id, t)}
                            placeholder={`Option ${index + 1}`}
                            placeholderTextColor="#9CA3AF"
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
                            borderColor: "#D0D0D0",
                            borderStyle: "dashed",
                            backgroundColor: "#F9FAFB",
                            marginTop: 8,
                        }}
                    >
                        <Ionicons name="add" size={20} color="#8C0327" />
                        <Text style={{ fontSize: 15, fontWeight: "600", color: "#8C0327" }}>
                            Add Option
                        </Text>
                    </Pressable>
                )}
            </View>

            <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                    Expires At{" "}
                    <Text style={{ fontSize: 13, fontWeight: "400", color: "#9CA3AF" }}>(optional)</Text>
                </Text>
                <TextInput
                    value={pollCore.expiresAt}
                    onChangeText={(t) => onPollCoreChange("expiresAt", t)}
                    placeholder="2025-12-15 23:59"
                    placeholderTextColor="#9CA3AF"
                    onFocus={() => setFocused("expiresAt")}
                    onBlur={() => setFocused(null)}
                    style={{
                        borderWidth: 1,
                        borderColor: focused === "expiresAt" ? "#8C0327" : "#D0D0D0",
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        fontSize: 16,
                        color: "#111827",
                        backgroundColor: "#ffffff",
                    }}
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
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#111827", marginBottom: 2 }}>
                        Allow Multiple Selections
                    </Text>
                    <Text style={{ fontSize: 13, color: "#6B7280" }}>
                        {pollCore.allowMultiple ? "Users can select multiple options" : "Users can select one option"}
                    </Text>
                </View>
                <View
                    style={{
                        width: 52,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: pollCore.allowMultiple ? "#8C0327" : "#E5E7EB",
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
