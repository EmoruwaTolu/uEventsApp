// app/_layout.tsx
import { Stack, Redirect, useSegments, usePathname } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import PatternBackground from "../components/PatternBackground";
import React from "react";
import { View, ActivityIndicator, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Outfit_600SemiBold, Outfit_700Bold } from "@expo-google-fonts/outfit";
import {
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { initObservability, analytics, wrapRoot } from "../lib/analytics";

// Crash reporting + product analytics. No-ops without env keys (lib/analytics.ts).
initObservability();

// Accessibility: honour the OS font-size setting everywhere, but cap the
// multiplier so very large accessibility sizes don't shatter layouts. Applied
// globally here rather than per-screen so every screen is covered.
const FONT_SCALE_CAP = 1.4;
((Text as unknown) as { defaultProps?: Record<string, unknown> }).defaultProps = {
    ...(((Text as unknown) as { defaultProps?: Record<string, unknown> }).defaultProps ?? {}),
    maxFontSizeMultiplier: FONT_SCALE_CAP,
};
((TextInput as unknown) as { defaultProps?: Record<string, unknown> }).defaultProps = {
    ...(((TextInput as unknown) as { defaultProps?: Record<string, unknown> }).defaultProps ?? {}),
    maxFontSizeMultiplier: FONT_SCALE_CAP,
    // On the New Architecture (Fabric) these default off; turn them back on so prose
    // fields (comments, posts, feedback) get iOS autocorrect + spellcheck. Fields that
    // want it off (search, email, handles) still override this explicitly.
    autoCorrect: true,
    spellCheck: true,
};
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { RsvpProvider } from "../lib/RsvpContext";
import { LikeProvider } from "../lib/LikeContext";
import { BookmarkProvider } from "../lib/BookmarkContext";
import { LangProvider } from "../lib/LangContext";
import { ToastProvider } from "../lib/ToastContext";
import { GuestModalProvider } from "../lib/GuestModalContext";
import { ThemeProvider } from "../lib/ThemeContext";
import { usePushNotifications } from "../lib/usePushNotifications";
import OfflineBanner from "../components/OfflineBanner";

class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
        analytics.captureError(error, { componentStack: info?.componentStack ?? undefined });
    }
    render() {
        if (this.state.hasError) {
            return (
                <View style={eb.container}>
                    <Text style={eb.title}>Something went wrong</Text>
                    <Text style={eb.body}>An unexpected error occurred. Please restart the app.</Text>
                    <Pressable style={eb.btn} onPress={() => this.setState({ hasError: false })}>
                        <Text style={eb.btnText}>TRY AGAIN</Text>
                    </Pressable>
                </View>
            );
        }
        return this.props.children;
    }
}

const eb = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#F7F3EC", alignItems: "center", justifyContent: "center", padding: 32 },
    title: { fontSize: 22, fontWeight: "800", color: "#1B2233", marginBottom: 12, textAlign: "center" },
    body: { fontSize: 14, color: "#8A8578", lineHeight: 20, textAlign: "center", marginBottom: 28 },
    btn: { backgroundColor: "#8E0B2C", paddingVertical: 14, paddingHorizontal: 32 },
    btnText: { fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 2 },
});

function Gate() {
    const { session, isLoading } = useAuth();
    const segments = useSegments();
    usePushNotifications();
    // Global screen tracking — one hook covers every route.
    const pathname = usePathname();
    React.useEffect(() => {
        if (pathname) analytics.screen(pathname);
    }, [pathname]);
    const inAuth = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "club-onboarding";
    const inInterests = segments[0] === "onboarding-interests";
    // verify-email is reachable via deep link in any auth state, so it's exempt
    // from the login/onboarding redirects below.
    const inVerify = segments[0] === "verify-email";

    // Show loading state while checking auth
    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: "#F7F3EC", alignItems: "center", justifyContent: "center" }}>
                <StatusBar style="dark" backgroundColor="#F7F3EC" />
                <PatternBackground />
                <ActivityIndicator size="large" color="#8E0B2C" />
            </View>
        );
    }

    // Redirect logged-in users away from auth pages
    if (session && inAuth) {
        if (session.needsOnboarding) return <Redirect href="/club-onboarding" />;
        if (session.needsInterests) return <Redirect href="/onboarding-interests" />;
        return <Redirect href="/(tabs)" />;
    }

    // New club — redirect to onboarding before tabs
    if (session && session.needsOnboarding && !inOnboarding && !inVerify) {
        return <Redirect href="/club-onboarding" />;
    }

    // New student — pick interests before tabs (skippable inside the screen)
    if (session && session.needsInterests && !inInterests && !inVerify) {
        return <Redirect href="/onboarding-interests" />;
    }

    // Redirect logged-out users to login
    if (!session && !inAuth && !inVerify) {
        return <Redirect href="/(auth)/login" />;
    }
    return (
        <Stack
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#F7F3EC" },
            }}
            initialRouteName="(auth)"
        >
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="event/[id]" />
            <Stack.Screen name="post/[id]" />
            <Stack.Screen name="edit/[id]" />
            <Stack.Screen name="club/[id]" />
            <Stack.Screen name="club/followers" />
            <Stack.Screen name="club/edit-profile" />
            <Stack.Screen name="post-analytics/[id]" />
            <Stack.Screen name="my-posts" />
            <Stack.Screen name="my-events" />
            <Stack.Screen name="drafts" />
            <Stack.Screen name="analytics" />
            <Stack.Screen name="notifications" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
            <Stack.Screen name="settings" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
            <Stack.Screen name="blocked-users" />
            <Stack.Screen name="feedback" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
            <Stack.Screen name="search-modal" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
            <Stack.Screen name="all-events-modal" options={{ animation: "slide_from_bottom", gestureDirection: "vertical" }} />
            <Stack.Screen name="club-onboarding" />
            <Stack.Screen name="onboarding-interests" />
            <Stack.Screen name="checkin/[id]" />
            <Stack.Screen name="verify-email" />
        </Stack>
    );
}

function RootLayout() {
    // The editorial theme selects type by family name, so nothing renders with
    // the right face until these resolve. Hold on the same loading treatment the
    // auth gate uses rather than flashing system fonts for a frame.
    const [fontsLoaded, fontError] = useFonts({
        Outfit_600SemiBold,
        Outfit_700Bold,
        PlusJakartaSans_400Regular,
        PlusJakartaSans_500Medium,
        PlusJakartaSans_600SemiBold,
        PlusJakartaSans_700Bold,
    });

    React.useEffect(() => {
        if (fontError) analytics.captureError(fontError, { stage: "font-load" });
    }, [fontError]);

    // On a font failure fall through to the app anyway — system fallbacks are
    // ugly but shipping a permanently blank screen is worse.
    if (!fontsLoaded && !fontError) {
        return (
            <View style={{ flex: 1, backgroundColor: "#F7F3EC", alignItems: "center", justifyContent: "center" }}>
                <StatusBar style="dark" backgroundColor="#F7F3EC" />
                <ActivityIndicator size="large" color="#8E0B2C" />
            </View>
        );
    }

    return (
        <ErrorBoundary>
            <ThemeProvider>
            <SafeAreaProvider style={{ flex: 1, backgroundColor: "#F7F3EC" }}>
                <AuthProvider>
                    <LangProvider>
                        <RsvpProvider>
                            <LikeProvider>
                                <BookmarkProvider>
                                    <ToastProvider>
                                        <GuestModalProvider>
                                            <StatusBar style="dark" backgroundColor="#F7F3EC" />
                                            <Gate />
                                            <OfflineBanner />
                                        </GuestModalProvider>
                                    </ToastProvider>
                                </BookmarkProvider>
                            </LikeProvider>
                        </RsvpProvider>
                    </LangProvider>
                </AuthProvider>
            </SafeAreaProvider>
            </ThemeProvider>
        </ErrorBoundary>
    );
}

// Sentry.wrap instruments navigation/touch breadcrumbs; identity fn without a DSN.
export default wrapRoot(RootLayout);