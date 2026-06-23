import React, { createContext, useContext, useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { api } from "../lib/api";

type Session = {
    token?: string;
    role?: "guest" | "user";
    email?: string;
    userType?: "STUDENT" | "CLUB";
    userId?: string;
    needsOnboarding?: boolean;
    emailVerified?: boolean;
} | null;

type Ctx = {
    session: Session;
    isLoading: boolean;
    register: (first: string, last: string, email: string, password: string) => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    continueAsGuest: () => Promise<void>;
    completeOnboarding: () => Promise<void>;
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
            emailVerified: res.user.emailVerified ?? false,
        });
    }

    async function signIn(email: string, password: string) {
        const res = await api<{ token: string; user: { id: string; email: string; type: string; emailVerified?: boolean } }>(
            "/users/validate-user",
            { method: "POST", body: JSON.stringify({ email, password }) }
        );
        await saveSession({ token: res.token, role: "user", email: res.user.email, userType: res.user.type as any, userId: res.user.id, emailVerified: res.user.emailVerified ?? false });
    }

    async function markEmailVerified() {
        if (!session) return;
        await saveSession({ ...session, emailVerified: true });
    }

    async function signOut() {
        await saveSession(null);
    }

    async function continueAsGuest() {
        await saveSession({ role: "guest" });
    }

    async function completeOnboarding() {
        if (!session) return;
        await saveSession({ ...session, needsOnboarding: false });
    }

    async function updateToken(token: string) {
        if (!session) return;
        await saveSession({ ...session, token });
    }

    return (
        <AuthContext.Provider value={{ session, isLoading, register, signIn, signOut, continueAsGuest, completeOnboarding, updateToken, markEmailVerified }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}