/**
 * MultiImagePicker
 *
 * Renders a horizontal scroll row of image thumbnails with:
 * - Tap a thumbnail → mark it as cover (COVER badge shown, moved to index 0 on submit)
 * - × button on each thumbnail → remove image
 * - "+ ADD" tile at the end → pick more images (multi-select, up to MAX total)
 * - Exposes `images` (ordered array, cover first) and `coverIndex` to parent via callbacks
 */
import React from "react";
import {
    View, Text, Image, Pressable, ScrollView, StyleSheet, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useT } from "../../lib/LangContext";

const BURGUNDY = "#8C0327";
const MAX_IMAGES = 10;
const THUMB = 80;

type Props = {
    images: string[];          // ordered list; images[0] is always the cover
    onChange: (images: string[]) => void;
};

export default function MultiImagePicker({ images, onChange }: Props) {
    const t = useT();
    async function pickMore() {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
            Alert.alert(t.permissionNeededTitle, t.photoPermissionMsg);
            return;
        }
        const remaining = MAX_IMAGES - images.length;
        if (remaining <= 0) {
            Alert.alert(t.imageLimitTitle, t.imageLimitMsg(MAX_IMAGES));
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"] as any,
            allowsMultipleSelection: true,
            selectionLimit: remaining,
            quality: 0.9,
        });
        if (!result.canceled) {
            const newUris = result.assets.map((a) => a.uri);
            onChange([...images, ...newUris].slice(0, MAX_IMAGES));
        }
    }

    function remove(index: number) {
        const next = images.filter((_, i) => i !== index);
        onChange(next);
    }

    function makeCover(index: number) {
        if (index === 0) return; // already cover
        const next = [...images];
        const [chosen] = next.splice(index, 1);
        next.unshift(chosen);
        onChange(next);
    }

    const isCover = (index: number) => index === 0 && images.length > 0;

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.row}
        >
            {images.map((uri, idx) => (
                <View key={`${uri}-${idx}`} style={s.thumbWrap}>
                    <Pressable onPress={() => makeCover(idx)} style={s.thumb}>
                        <Image source={{ uri }} style={s.thumbImg} resizeMode="cover" />
                        {isCover(idx) && (
                            <View style={s.coverBadge}>
                                <Text style={s.coverBadgeText}>COVER</Text>
                            </View>
                        )}
                    </Pressable>
                    <Pressable onPress={() => remove(idx)} style={s.removeBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Remove image">
                        <Ionicons name="close-circle" size={18} color="#6B7280" />
                    </Pressable>
                </View>
            ))}

            {images.length < MAX_IMAGES && (
                <Pressable style={s.addTile} onPress={pickMore} accessibilityRole="button" accessibilityLabel="Add image">
                    <Ionicons name="add" size={22} color="#9CA3AF" />
                    <Text style={s.addLabel}>ADD</Text>
                </Pressable>
            )}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    row: {
        paddingVertical: 4,
        gap: 8,
        alignItems: "flex-start",
    },
    thumbWrap: {
        position: "relative",
    },
    thumb: {
        width: THUMB,
        height: THUMB,
        backgroundColor: "#F3F4F6",
    },
    thumbImg: {
        width: THUMB,
        height: THUMB,
    },
    coverBadge: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: BURGUNDY,
        paddingVertical: 2,
        alignItems: "center",
    },
    coverBadgeText: {
        fontSize: 8,
        fontWeight: "900",
        color: "#fff",
        letterSpacing: 1,
    },
    removeBtn: {
        position: "absolute",
        top: -7,
        right: -7,
        backgroundColor: "#fff",
        borderRadius: 9,
    },
    addTile: {
        width: THUMB,
        height: THUMB,
        backgroundColor: "#F3F4F6",
        borderWidth: 1.5,
        borderColor: "#E5E0D8",
        borderStyle: "dashed",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
    },
    addLabel: {
        fontSize: 9,
        fontWeight: "800",
        color: "#9CA3AF",
        letterSpacing: 1,
    },
});
