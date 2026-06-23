import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { EventCore } from "../../app/(tabs)/create";
import { Ionicons } from "@expo/vector-icons";

type CreateEventProps = {
    eventCore: EventCore;
    onEventCoreChange: <K extends keyof EventCore>(
        key: K,
        value: EventCore[K]
    ) => void;
};

const inputStyle = (focused: boolean) => ({
    borderWidth: 1,
    borderColor: focused ? "#8C0327" : "#D0D0D0",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#ffffff",
});

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
                    color="#8C0327"
                />
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
                        Event Details
                    </Text>
                </View>
            </View>

            <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                    Start Time
                </Text>
                <TextInput
                    value={eventCore.startAt}
                    onChangeText={(t) => onEventCoreChange("startAt", t)}
                    placeholder="2025-12-10 18:00"
                    placeholderTextColor="#9CA3AF"
                    onFocus={() => setFocused("startAt")}
                    onBlur={() => setFocused(null)}
                    style={inputStyle(focused === "startAt")}
                />
            </View>

            <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                    End Time{" "}
                    <Text style={{ fontSize: 13, fontWeight: "400", color: "#575d69ff" }}>(optional)</Text>
                </Text>
                <TextInput
                    value={eventCore.endAt}
                    onChangeText={(t) => onEventCoreChange("endAt", t)}
                    placeholder="2025-12-10 22:00"
                    placeholderTextColor="#9CA3AF"
                    onFocus={() => setFocused("endAt")}
                    onBlur={() => setFocused(null)}
                    style={inputStyle(focused === "endAt")}
                />
            </View>

            <View style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                    Venue Name
                </Text>
                <TextInput
                    value={eventCore.locationName}
                    onChangeText={(t) => onEventCoreChange("locationName", t)}
                    placeholder="Student Centre Atrium"
                    placeholderTextColor="#9CA3AF"
                    onFocus={() => setFocused("locationName")}
                    onBlur={() => setFocused(null)}
                    style={inputStyle(focused === "locationName")}
                />
            </View>

            <View style={{ marginBottom: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 8 }}>
                    Address{" "}
                    <Text style={{ fontSize: 13, fontWeight: "400", color: "#575d69ff" }}>(optional)</Text>
                </Text>
                <TextInput
                    value={eventCore.address}
                    onChangeText={(t) => onEventCoreChange("address", t)}
                    placeholder="85 University Private, Ottawa"
                    placeholderTextColor="#9CA3AF"
                    onFocus={() => setFocused("address")}
                    onBlur={() => setFocused(null)}
                    style={inputStyle(focused === "address")}
                />
            </View>
        </View>
    )
}
