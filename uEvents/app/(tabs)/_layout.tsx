import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CustomTabBar } from "../../components/CustomTabBar";
import { useAuth } from "../../auth/AuthContext";
import { useTheme } from "../../lib/ThemeContext";
import { useT } from "../../lib/LangContext";

export default function TabLayout() {
    const { session } = useAuth();
    const { colors: C } = useTheme();
    const t = useT();
    const isClub = session?.userType === "CLUB";

    return (
        <Tabs
            tabBar={(props) => <CustomTabBar {...props} />}
            screenOptions={{
                headerShown: false,
                sceneStyle: { backgroundColor: C.bg },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: t.tabHome,
                    tabBarIcon: ({ color, size, focused }) => (
                        <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="search"
                options={{
                    title: t.tabDiscover,
                    tabBarIcon: ({ color, size, focused }) => (
                        <Ionicons name={focused ? "compass" : "compass-outline"} size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="events"
                options={{
                    title: t.tabEvents,
                    href: isClub ? null : undefined,
                    tabBarIcon: ({ color, size, focused }) => (
                        <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="create"
                options={{
                    title: t.tabCreate,
                    href: isClub ? undefined : null,
                    tabBarIcon: ({ color, size, focused }) => (
                        <Ionicons name={focused ? "add-circle" : "add-circle-outline"} size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: t.tabProfile,
                    tabBarIcon: ({ color, size, focused }) => (
                        <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}