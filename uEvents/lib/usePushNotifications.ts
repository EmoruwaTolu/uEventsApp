import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { useApi } from "./useApi";
import { useAuth } from "../auth/AuthContext";

const PROJECT_ID = "5c09391b-15e2-46b6-b6f6-b883d62135c6";

export function usePushNotifications() {
    const authApi = useApi();
    const { session } = useAuth();
    const router = useRouter();
    const notifListener = useRef<Notifications.EventSubscription | null>(null);
    const responseListener = useRef<Notifications.EventSubscription | null>(null);

    useEffect(() => {
        // Configure foreground notification display inside the effect,
        // not at module level — avoids crashing before the native bridge is ready
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: true,
                // Newer expo-notifications splits the old shouldShowAlert into
                // banner + list; both are required by NotificationBehavior.
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });
    }, []);

    useEffect(() => {
        if (!session?.token) return;

        // Register device and upload token to backend
        registerForPushNotifications().then((token) => {
            if (!token) return;
            authApi("/users/me/push-token", {
                method: "PATCH",
                body: JSON.stringify({ pushToken: token }),
            }).catch(console.error);
        });

        // Foreground: notification arrives while app is open — banner is shown
        // automatically via setNotificationHandler above
        notifListener.current = Notifications.addNotificationReceivedListener(() => {
            // No-op for now; a good place to refresh the unread badge counter
        });

        // Tap: user taps a notification → navigate to the relevant screen
        responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
            const data = response.notification.request.content.data as {
                postId?: string;
                postType?: string;
            };
            if (!data?.postId) return;
            if ((data.postType ?? "").toUpperCase() === "EVENT") {
                router.push({ pathname: "/event/[id]", params: { id: data.postId } } as any);
            } else {
                router.push({ pathname: "/post/[id]", params: { id: data.postId } } as any);
            }
        });

        return () => {
            notifListener.current?.remove();
            responseListener.current?.remove();
        };
    }, [session?.token]);
}

async function registerForPushNotifications(): Promise<string | null> {
    try {
        if (Platform.OS === "android") {
            await Notifications.setNotificationChannelAsync("default", {
                name: "uEvents",
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: "#8C0327",
            });
        }

        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== "granted") return null;

        const { data } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
        return data;
    } catch {
        // Silently fails on simulators or environments without push support
        return null;
    }
}
