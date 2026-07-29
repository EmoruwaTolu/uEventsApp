import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { EventCore } from "../../app/(tabs)/create";
import { Ionicons } from "@expo/vector-icons";
import { lightColors, meta, lbl, fonts } from "../../styles/theme";

type CreateEventProps = {
    eventCore: EventCore;
    onEventCoreChange: <K extends keyof EventCore>(
        key: K,
        value: EventCore[K]
    ) => void;
};

const inputStyle = (focused: boolean) => ({ fontFamily: fonts.body, fontSize: 16, borderWidth: 1,
    borderColor: focused ? lightColors.primary : lightColors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    
    color: lightColors.text,
    backgroundColor: "#ffffff" });

export default function CreateEvent({ eventCore, onEventCoreChange }: CreateEventProps){
    const [focused, setFocused] = useState<string | null>(null);

    return(
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
                <Ionicons
                    name="calendar"
                    size={20}
                    color={lightColors.primary}
                />
                <View style={{ transform: [{ scaleX: 0.78 }], transformOrigin: "left" }}>
                    <Text
                        style={{
                            fontSize: 24,
                            fontFamily: fonts.displayBold,
                            color: lightColors.text,
                            letterSpacing: -0.5,
                        }}
                    >
                        Event Details
                    </Text>
                </View>
            </View>

            <View style={{ marginBottom: 16 }}>
                <Text style={{ ...meta(14, "semi"), color: lightColors.textBody, marginBottom: 8 }}>
                    Start Time
                </Text>
                <TextInput
                    value={eventCore.startAt}
                    onChangeText={(t) => onEventCoreChange("startAt", t)}
                    placeholder="2025-12-10 18:00"
                    placeholderTextColor={lightColors.textLight}
                    onFocus={() => setFocused("startAt")}
                    onBlur={() => setFocused(null)}
                    style={inputStyle(focused === "startAt")}
                />
            </View>

            <View style={{ marginBottom: 16 }}>
                <Text style={{ ...meta(14, "semi"), color: lightColors.textBody, marginBottom: 8 }}>
                    End Time{" "}
                    <Text style={{ ...meta(13, "regular"), color: "#575d69ff" }}>(optional)</Text>
                </Text>
                <TextInput
                    value={eventCore.endAt}
                    onChangeText={(t) => onEventCoreChange("endAt", t)}
                    placeholder="2025-12-10 22:00"
                    placeholderTextColor={lightColors.textLight}
                    onFocus={() => setFocused("endAt")}
                    onBlur={() => setFocused(null)}
                    style={inputStyle(focused === "endAt")}
                />
            </View>

            <View style={{ marginBottom: 16 }}>
                <Text style={{ ...meta(14, "semi"), color: lightColors.textBody, marginBottom: 8 }}>
                    Venue Name
                </Text>
                <TextInput
                    value={eventCore.locationName}
                    onChangeText={(t) => onEventCoreChange("locationName", t)}
                    placeholder="Student Centre Atrium"
                    placeholderTextColor={lightColors.textLight}
                    onFocus={() => setFocused("locationName")}
                    onBlur={() => setFocused(null)}
                    style={inputStyle(focused === "locationName")}
                />
            </View>

            <View style={{ marginBottom: 0 }}>
                <Text style={{ ...meta(14, "semi"), color: lightColors.textBody, marginBottom: 8 }}>
                    Address{" "}
                    <Text style={{ ...meta(13, "regular"), color: "#575d69ff" }}>(optional)</Text>
                </Text>
                <TextInput
                    value={eventCore.address}
                    onChangeText={(t) => onEventCoreChange("address", t)}
                    placeholder="85 University Private, Ottawa"
                    placeholderTextColor={lightColors.textLight}
                    onFocus={() => setFocused("address")}
                    onBlur={() => setFocused(null)}
                    style={inputStyle(focused === "address")}
                />
            </View>
        </View>
    )
}
