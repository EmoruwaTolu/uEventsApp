// components/home/DailyEventsHorizontal.tsx
import { useState } from "react";
import { View, Text, FlatList, Pressable, Image, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const DEMO = [
  { id: "1", name: "Capture the Flag", time: "1:00–4:00 PM", posterUrl: "https://picsum.photos/400", tags: ["Sport", "Academic", "Francophone"] },
  { id: "2", name: "Tech Talk",         time: "2:00–3:30 PM", posterUrl: "https://picsum.photos/401", tags: ["Tech", "Networking"] },
  { id: "3", name: "Coding Challenge",  time: "3:00–5:00 PM", posterUrl: "https://picsum.photos/402", tags: ["Coding", "Competition"] },
];

type DemoEvent = typeof DEMO[number];

function getDateParts(date: Date) {
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  const weekday = date.toLocaleString("en-US", { weekday: "long" });
  return { formatted: `${day} ${month} ${year}`, weekday };
}

function DailyEventCard({ event, cardWidth }: { event: DemoEvent; cardWidth: number }) {
  const router = useRouter();
  const cardHeight = cardWidth * 1.05;

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/event/[id]", params: { id: event.id } })}
      style={{
        width: cardWidth,
        height: cardHeight,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: "#111827",
        overflow: "hidden",
        backgroundColor: "#D0D0D0",
      }}
    >
      {event.posterUrl ? (
        <Image
          source={{ uri: event.posterUrl }}
          style={{ position: "absolute", width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      ) : null}

      {/* Gradient-like dark scrim at the bottom */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "45%",
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "flex-end",
          padding: 12,
          gap: 4,
        }}
      >
        <Text numberOfLines={1} style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
          {event.name}
        </Text>
        {event.time && (
          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12 }}>{event.time}</Text>
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
          {event.tags?.slice(0, 2).map((tag, i) => (
            <View
              key={i}
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 6,
                backgroundColor: "rgba(255,255,255,0.2)",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 10 }}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export default function DailyEventsHorizontal() {
  const { width } = useWindowDimensions();
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { formatted, weekday } = getDateParts(selectedDate);

  const SIDE_PADDING = 16;
  const CARD_GAP = 12;
  const cardWidth = (width - SIDE_PADDING * 2 - CARD_GAP) / 2;

  return (
    <View style={{ gap: 16 }}>
      {/* Date header — shrinks to text width so dots sit flush after the label */}
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 30, fontWeight: "700", color: "#111827", lineHeight: 34 }}>
            {formatted}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => setSelectedDate(d => addDays(d, -1))}
              style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "#8C0327", alignItems: "center", justifyContent: "center" }}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
            >
              <Ionicons name="chevron-back" size={16} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => setSelectedDate(d => addDays(d, 1))}
              style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: "#8C0327", alignItems: "center", justifyContent: "center" }}
              accessibilityRole="button"
              accessibilityLabel="Next day"
            >
              <Ionicons name="chevron-forward" size={16} color="#fff" />
            </Pressable>
          </View>
        </View>
        <Text style={{ fontSize: 15, color: "#6B7280", marginTop: 2 }}>{weekday}</Text>
      </View>

      {/* Horizontal event list */}
      <FlatList
        data={DEMO}
        horizontal
        keyExtractor={(x) => x.id}
        showsHorizontalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
        contentContainerStyle={{ paddingHorizontal: 0, paddingVertical: 4 }}
        renderItem={({ item }) => <DailyEventCard event={item} cardWidth={cardWidth} />}
      />
    </View>
  );
}
