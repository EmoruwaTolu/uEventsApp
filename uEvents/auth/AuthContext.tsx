import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { api } from "../lib/api";
import { analytics } from "../lib/analytics";

type Session = {
    token?: string;
    role?: "guest" | "user";
    email?: string;
    userType?: "STUDENT" | "CLUB";
    userId?: string;
    needsOnboarding?: boolean;
    // Students see the interest-picker onboarding once after signup.
    needsInterests?: boolean;
    emailVerified?: boolean;
} | null;

type Ctx = {
    session: Session;
    isLoading: boolean;
    register: (first: string, last: string, email: string, password: string) => Promise<void>;
    registerClub: (clubName: string, email: string, password: string, inviteCode?: string, category?: string) => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    continueAsGuest: () => Promise<void>;
    completeOnboarding: () => Promise<void>;
    completeInterests: () => Promise<void>;
    updateToken: (token: string) => Promise<void>;
    markEmailVerified: () => Promise<void>;
};

const AuthContext = createContext<Ctx | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session>(null);
    const [isLoading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const raw = await SecureStore.getItemAsync("session");
                if (raw) setSession(JSON.parse(raw));
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    async function saveSession(s: Session) {
        setSession(s);
        if (s) await SecureStore.setItemAsync("session", JSON.stringify(s));
        else await SecureStore.deleteItemAsync("session");
    }

    async function register(first: string, last: string, email: string, password: string) {
        const res = await api<{ token: string; user: { id: string; email: string; type: string; emailVerified?: boolean } }>(
            "/users/add-user",
            { method: "POST", body: JSON.stringify({ firstName: first, lastName: last, email, password }) }
        );
        const isClub = res.user.type === "CLUB";
        await saveSession({
            token: res.token, role: "user", email: res.user.email,
            userType: res.user.type as any, userId: res.user.id,
            needsOnboarding: isClub,
            needsInterests: !isClub,
            emailVerified: res.user.emailVerified ?? false,
        });
        analytics.identify(res.user.id, { userType: res.user.type });
        analytics.track("sign_up", { userType: res.user.type });
    }

    async function registerClub(clubName: string, email: string, password: string, inviteCode?: string, category?: string) {
        const res = await api<{ token: string; user: { id: string; email: string; type: string; emailVerified?: boolean } }>(
            "/users/add-user",
            { method: "POST", body: JSON.stringify({ type: "CLUB", clubName, email, password, inviteCode: inviteCode || undefined, category }) }
        );
        await saveSession({
            token: res.token, role: "user", email: res.user.email,
            userType: res.user.type as any, userId: res.user.id,
            needsOnboarding: true,
            emailVerified: res.user.emailVerified ?? false,
        });
        analytics.identify(res.user.id, { userType: res.user.type });
        analytics.track("sign_up", { userType: res.user.type });
    }

    async function signIn(email: string, password: string) {
        const res = await api<{ token: string; user: { id: string; email: string; type: string; emailVerified?: boolean } }>(
            "/users/validate-user",
            { method: "POST", body: JSON.stringify({ email, password }) }
        );
        await saveSession({ token: res.token, role: "user", email: res.user.email, userType: res.user.type as any, userId: res.user.id, emailVerified: res.user.emailVerified ?? false });
        analytics.identify(res.user.id, { userType: res.user.type });
        analytics.track("sign_in", { userType: res.user.type });
    }

    async function markEmailVerified() {
        if (!session) return;
        await saveSession({ ...session, emailVerified: true });
    }

    async function signOut() {
        await saveSession(null);
        analytics.track("sign_out");
        analytics.reset();
    }

    async function continueAsGuest() {
        await saveSession({ role: "guest" });
    }

    async function completeOnboarding() {
        if (!session) return;
        await saveSession({ ...session, needsOnboarding: false });
    }

    async function completeInterests() {
        if (!session) return;
        await saveSession({ ...session, needsInterests: false });
    }

    async function updateToken(token: string) {
        if (!session) return;
        await saveSession({ ...session, token });
    }

    return (
        <AuthContext.Provider value={{ session, isLoading, register, registerClub, signIn, signOut, continueAsGuest, completeOnboarding, completeInterests, updateToken, markEmailVerified }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}