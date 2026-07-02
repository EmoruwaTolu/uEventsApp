import React, { useMemo } from "react";
import { View, Text, Pressable, FlatList, StyleSheet } from "react-native";

type Props = {
    selectedDateISO: string;
    onSelectISO: (iso: string) => void;
    days?: number;
    startOffset?: number;
};

type Item = { key: string; date: Date; iso: string };

const ITEM_WIDTH = 88;
const SEP = 8;

function atMidnightISO(d: Date) {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    return t.toISOString();
}

function makeRange(days: number, startOffset: number): Item[] {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return Array.from({ length: days }, (_, i) => {
        const d = new Date(base);
        d.setDate(base.getDate() + startOffset + i);
        return { key: String(i), date: d, iso: atMidnightISO(d) };
    });
}

function labels(d: Date) {
  const dow = d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  return { dow, md };
}

export default function DateCarousel({
    selectedDateISO,
    onSelectISO,
    days = 15,
    startOffset = -Math.floor(15 / 2),
}: Props) {
    const data = useMemo(() => makeRange(days, startOffset), [days, startOffset]);
    const initialIndex = Math.min(Math.max(0, -startOffset), data.length - 1);

    return (
        <View style={{ marginTop: 12 }}>
            <FlatList
                data={data}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(it) => it.key}
                contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 4 }}
                ItemSeparatorComponent={() => <View style={{ width: SEP }} />}
                initialScrollIndex={initialIndex}
                getItemLayout={(_, index) => ({
                length: ITEM_WIDTH + SEP,
                offset: (ITEM_WIDTH + SEP) * index,
                index,
                })}
                renderItem={({ item }) => {
                    const { dow, md } = labels(item.date);
                    const selected = item.iso === selectedDateISO;

                    return (
                        <Pressable
                            onPress={() => onSelectISO(item.iso)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={item.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                            style={[
                                styles.cell,
                                selected ? styles.cellSelected : styles.cellDefault,
                                { width: ITEM_WIDTH },
                            ]}
                        >
                        <Text style={[styles.dow, selected && styles.dowSelected]}>{dow}</Text>
                        <Text style={[styles.md, selected && styles.mdSelected]}>{md}</Text>
                        </Pressable>
                    );
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    cell: {
        alignItems: "center",
        paddingVertical: 10,
        borderRadius: 12,
        minWidth: ITEM_WIDTH,
    },
    cellDefault: {
        backgroundColor: "transparent",
    },
    cellSelected: {
        backgroundColor: "#9d001d",
    },
    dow: {
        fontSize: 12,
        color: "#6B7280",
    },
    md: {
        fontSize: 16,
        fontWeight: "700",
        color: "#111827",
    },
    dowSelected: { color: "#FFFFFF" },
    mdSelected: { color: "#FFFFFF" },
});
