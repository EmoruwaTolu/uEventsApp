import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { fonts, lbl, meta, lightColors } from "../../styles/theme";
import {
  View,
  Text,
  TextInput,
  Image,
  Pressable,
} from "react-native";

type Lang = "en" | "fr";

type LocaleContent = {
    title?: string;
    subtitle?: string;
    description?: string;
    posterUri?: string;
    posterUrl?: string;
    tags?: string[];
    isPublished: boolean;
};

type LocalizedContentSectionProps = {
    lang: Lang;
    locale: LocaleContent;
    setLocale: <K extends keyof LocaleContent>( lang: Lang, key: K, value: LocaleContent[K] ) => void;
    pickPoster: (lang: Lang) => void;
};

export function LocalizedContentSection({ lang, locale, setLocale, pickPoster }: LocalizedContentSectionProps) {
    const placeholderTitle = lang === "en" ? "Winter Wonderland Ball" : "Bal du Pays des Merveilles";
    const placeholderSubtitle = lang === "en" ? "A night of wonder" : "Une soirée de féerie";
    const [focused, setFocused] = useState<string | null>(null);

    const inputStyle = (field: string) => ({ fontFamily: fonts.body, fontSize: 16, borderWidth: 1,
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
            <View style={{ marginBottom: 16 }}>
                <Text style={{ ...meta(16, "semi"), color: lightColors.textBody, marginBottom: 8 }}>
                    Title
                </Text>
                <TextInput
                    value={locale.title ?? ""}
                    onChangeText={(t) => setLocale(lang, "title", t)}
                    placeholder={placeholderTitle}
                    placeholderTextColor={lightColors.textLight}
                    onFocus={() => setFocused("title")}
                    onBlur={() => setFocused(null)}
                    style={inputStyle("title")}
                />
            </View>

            <View style={{ marginBottom: 16 }}>
                <Text style={{ ...meta(16, "semi"), color: lightColors.textBody, marginBottom: 8 }}>
                    Subtitle{" "}
                    <Text style={{ ...meta(13, "regular"), color: lightColors.textLight }}>(optional)</Text>
                </Text>
                <TextInput
                    value={locale.subtitle ?? ""}
                    onChangeText={(t) => setLocale(lang, "subtitle", t)}
                    placeholder={placeholderSubtitle}
                    placeholderTextColor={lightColors.textLight}
                    onFocus={() => setFocused("subtitle")}
                    onBlur={() => setFocused(null)}
                    style={inputStyle("subtitle")}
                />
            </View>

            <View style={{ marginBottom: 16 }}>
                <Text style={{ ...meta(16, "semi"), color: lightColors.textBody, marginBottom: 8 }}>
                    Description
                </Text>
                <TextInput
                    value={locale.description ?? ""}
                    onChangeText={(t) => setLocale(lang, "description", t)}
                    placeholder="Tell people about your content..."
                    placeholderTextColor={lightColors.textLight}
                    multiline
                    onFocus={() => setFocused("description")}
                    onBlur={() => setFocused(null)}
                    style={[inputStyle("description"), { minHeight: 120, textAlignVertical: "top" }]}
                />
            </View>

            <View style={{ marginBottom: 16 }}>
                <Text style={{ ...meta(16, "semi"), color: lightColors.textBody, marginBottom: 8 }}>
                    Poster / Cover
                </Text>
                {locale.posterUri ? (
                    <View>
                        <Image
                            source={{ uri: locale.posterUri }}
                            style={{
                                width: "100%",
                                height: 200,
                                marginBottom: 12,
                                backgroundColor: lightColors.border,
                            }}
                            resizeMode="cover"
                        />
                        <Pressable
                            style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                                paddingVertical: 10,
                                borderWidth: 1,
                                borderColor: lightColors.primary,
                                backgroundColor: "#FEF2F2",
                            }}
                            onPress={() => pickPoster(lang)}
                        >
                            <Ionicons name="camera" size={16} color={lightColors.primary} />
                            <Text style={{ ...meta(16, "semi"), color: lightColors.primary }}>
                                Change Image
                            </Text>
                        </Pressable>
                    </View>
                ) : (
                    <Pressable
                        style={{
                            borderWidth: 1,
                            borderStyle: "dashed",
                            borderColor: lightColors.border,
                            paddingVertical: 24,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "#F9FAFB",
                            gap: 8,
                        }}
                        onPress={() => pickPoster(lang)}
                    >
                        <Ionicons name="cloud-upload-outline" size={32} color={lightColors.primary} />
                        <Text style={{ ...meta(15, "semi"), color: lightColors.text }}>
                            Upload Image
                        </Text>
                        <Text style={{ ...meta(12, "regular"), color: lightColors.textMuted }}>
                            Tap to select an image from your device
                        </Text>
                    </Pressable>
                )}
            </View>

            <Pressable
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 16,
                }}
                onPress={() => setLocale(lang, "isPublished", !locale.isPublished)}
            >
                <View style={{ flex: 1 }}>
                    <Text style={{ ...meta(15, "semi"), color: lightColors.text, marginBottom: 2 }}>
                        Publish this language version
                    </Text>
                    <Text style={{ ...meta(13, "regular"), color: lightColors.textMuted }}>
                        {locale.isPublished ? "Visible to users" : "Save as draft"}
                    </Text>
                </View>
                <View
                    style={{
                        width: 52,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: locale.isPublished ? lightColors.primary : lightColors.border,
                        padding: 2,
                        justifyContent: "center",
                    }}
                >
                    <View
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 16,
                            backgroundColor: "#ffffff",
                            shadowColor: "#000",
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.2,
                            shadowRadius: 2,
                            elevation: 2,
                            alignSelf: locale.isPublished ? "flex-end" : "flex-start",
                        }}
                    />
                </View>
            </Pressable>
        </View>
    );
}
