import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
    const insets = useSafeAreaInsets();
    const { session } = useAuth();
    const isClub = session?.userType === 'CLUB';
    const hiddenRoutes = isClub ? ['events'] : ['create'];

    return (
        <View style={[styles.container, { paddingBottom: insets.bottom }]}>
            <View style={styles.topBorder} />
            <View style={styles.row}>
                {state.routes.map((route, index) => {
                    const { options } = descriptors[route.key];
                    if (hiddenRoutes.includes(route.name)) return null;
                    const isFocused = state.index === index;
                    const label = options.title ?? route.name;

                    const onPress = () => {
                        const event = navigation.emit({
                            type: 'tabPress',
                            target: route.key,
                            canPreventDefault: true,
                        });
                        if (!isFocused && !event.defaultPrevented) {
                            navigation.navigate(route.name);
                        }
                    };

                    const onLongPress = () => {
                        navigation.emit({ type: 'tabLongPress', target: route.key });
                    };

                    return (
                        <TouchableOpacity
                            key={route.key}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: isFocused }}
                            accessibilityLabel={options.tabBarAccessibilityLabel ?? String(label)}
                            onPress={onPress}
                            onLongPress={onLongPress}
                            style={styles.tabButton}
                            activeOpacity={0.7}
                        >
                            {options.tabBarIcon?.({
                                focused: isFocused,
                                color: isFocused ? '#C0C0C0' : 'rgba(255,255,255,0.45)',
                                size: 24,
                            })}
                            <Text
                                style={[styles.label, isFocused && styles.labelActive]}
                                numberOfLines={1}
                                maxFontSizeMultiplier={1.3}
                            >
                                {label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#6B0220',
    },
    topBorder: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#560119',
    },
    row: {
        flexDirection: 'row',
        minHeight: 56,
    },
    tabButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
    },
    label: {
        fontSize: 10,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.45)',
    },
    labelActive: {
        color: '#C0C0C0',
        fontWeight: '600',
    },
});
