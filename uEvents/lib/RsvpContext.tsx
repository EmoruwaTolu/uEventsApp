import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Alert } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "./useApi";

type RsvpContextType = {
    isRsvped: (postId: string) => boolean;
    isWaitlisted: (postId: string) => boolean;
    toggleRsvp: (postId: string) => Promise<boolean>;
};

const RsvpContext = createContext<RsvpContextType>({
    isRsvped: () => false,
    isWaitlisted: () => false,
    toggleRsvp: async () => false,
});

export function RsvpProvider({ children }: { children: React.ReactNode }) {
    const { session } = useAuth();
    const authApi = useApi();
    const [rsvpIds, setRsvpIds] = useState<Set<string>>(new Set());
    const [waitlistIds, setWaitlistIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!session?.token || session.role === "guest") {
            setRsvpIds(new Set());
            setWaitlistIds(new Set());
            return;
        }
        Promise.all([
            authApi<{ id: string }[]>("/users/me/rsvps"),
            authApi<string[]>("/users/me/waitlist"),
        ])
            .then(([posts, waitlistPostIds]) => {
                setRsvpIds(new Set(posts.map((p) => p.id)));
                setWaitlistIds(new Set(waitlistPostIds));
            })
            .catch(console.error);
    }, [session?.token]);

    const isRsvped = useCallback((postId: string) => rsvpIds.has(postId), [rsvpIds]);
    const isWaitlisted = useCallback((postId: string) => waitlistIds.has(postId), [waitlistIds]);

    const toggleRsvp = useCallback(async (postId: string): Promise<boolean> => {
        // Leaving waitlist
        if (waitlistIds.has(postId)) {
            setWaitlistIds((prev) => { const s = new Set(prev); s.delete(postId); return s; });
            try {
                await authApi(`/posts/${postId}/rsvp`, { method: "DELETE" });
                return false;
            } catch {
                setWaitlistIds((prev) => new Set(prev).add(postId));
                Alert.alert("Error", "Could not leave the waitlist. Please try again.");
                return true;
            }
        }

        const next = !rsvpIds.has(postId);

        if (!next) {
            // Cancelling RSVP — optimistic
            setRsvpIds((prev) => { const s = new Set(prev); s.delete(postId); return s; });
            try {
                await authApi(`/posts/${postId}/rsvp`, { method: "DELETE" });
                return false;
            } catch {
                setRsvpIds((prev) => new Set(prev).add(postId));
                Alert.alert("Error", "Could not cancel your RSVP. Please try again.");
                return true;
            }
        }

        // Adding RSVP — cannot optimistically update because event may be full (waitlist path)
        try {
            const result = await authApi<{ rsvped: boolean; waitlisted: boolean }>(
                `/posts/${postId}/rsvp`,
                { method: "POST" }
            );
            if (result.waitlisted) {
                setWaitlistIds((prev) => new Set(prev).add(postId));
                Alert.alert("Added to waitlist", "This event is full. You'll be notified if a spot opens up.");
                return true;
            }
            setRsvpIds((prev) => new Set(prev).add(postId));
            return true;
        } catch (err: any) {
            const msg = err?.message?.includes("capacity")
                ? "This event is full. No spots remaining."
                : "Could not update your RSVP. Please try again.";
            Alert.alert("Error", msg);
            return false;
        }
    }, [rsvpIds, waitlistIds, authApi]);

    return (
        <RsvpContext.Provider value={{ isRsvped, isWaitlisted, toggleRsvp }}>
            {children}
        </RsvpContext.Provider>
    );
}

export function useRsvp() {
    return useContext(RsvpContext);
}
