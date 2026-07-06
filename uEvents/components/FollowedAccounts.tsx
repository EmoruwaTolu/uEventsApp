import React, { useMemo } from "react";
import { View, Text, Pressable, Image, FlatList } from "react-native";
import { makeFollowedStyles } from "../styles/followed-accounts.styles";
import { useTheme } from "../lib/ThemeContext";
import { useT } from "../lib/LangContext";

export type Account = { id: string; name: string; avatarUri?: string };

type Props = {
    accounts: Account[];
    onAccountPress?: (a: Account) => void;
    onViewAll?: () => void;
};

export default function FollowedAccounts({ accounts, onAccountPress, onViewAll }: Props) {
    const t = useT();
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeFollowedStyles(C), [C]);
    if (!accounts.length) return null;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerLabel}>{t.followingShort}</Text>
                <Pressable onPress={onViewAll}>
                    <Text style={styles.viewAll}>{t.viewAllShort}</Text>
                </Pressable>
            </View>
            <FlatList
                data={accounts}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.listContent, { gap: 12 }]}
                renderItem={({ item }) => (
                    <Pressable onPress={() => onAccountPress?.(item)}>
                        <View style={styles.followedAccount}>
                            <View style={styles.circle}>
                                {item.avatarUri ? (
                                    <Image source={{ uri: item.avatarUri }} style={styles.avatarImage} />
                                ) : (
                                    <Text style={styles.initial}>
                                        {item.name?.trim()?.[0]?.toUpperCase() ?? "?"}
                                    </Text>
                                )}
                            </View>
                            <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
                        </View>
                    </Pressable>
                )}
            />
        </View>
    );
}
