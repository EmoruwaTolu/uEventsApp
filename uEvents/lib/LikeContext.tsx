import React, { createContext, useContext, useState, useCallback } from "react";
import { useApi } from "./useApi";

export type LikeState = { liked: boolean; count: number };

type LikeContextType = {
    // Map of postId -> the user's latest like state (set after any toggle).
    overrides: Map<string, LikeState>;
    // Returns the override for a post if one exists, otherwise the server `base`.
    resolve: (postId: string, base: LikeState) => LikeState;
    // Optimistically flips the like for a post and syncs with the server.
    // `current` is the state currently shown (already merged via `resolve`), so
    // the toggle flips from what the user sees and reverts to it on failure.
    toggleLike: (postId: string, current: LikeState) => void;
};

const LikeContext = createContext<LikeContextType>({
    overrides: new Map(),
    resolve: (_postId, base) => base,
    toggleLike: () => {},
});

export function LikeProvider({ children }: { children: React.ReactNode }) {
    const authApi = useApi();
    const [overrides, setOverrides] = useState<Map<string, LikeState>>(new Map());

    const setOverride = useCallback((postId: string, state: LikeState) => {
        setOverrides((prev) => {
            const next = new Map(prev);
            next.set(postId, state);
            return next;
        });
    }, []);

    const resolve = useCallback(
        (postId: string, base: LikeState): LikeState => overrides.get(postId) ?? base,
        [overrides]
    );

    const toggleLike = useCallback((postId: string, current: LikeState) => {
        const next: LikeState = {
            liked: !current.liked,
            count: Math.max(0, current.count + (current.liked ? -1 : 1)),
        };
        setOverride(postId, next);
        authApi(`/posts/${postId}/like`, { method: next.liked ? "POST" : "DELETE" })
            .catch(() => setOverride(postId, current)); // revert to what was shown
    }, [authApi, setOverride]);

    return (
        <LikeContext.Provider value={{ overrides, resolve, toggleLike }}>
            {children}
        </LikeContext.Provider>
    );
}

export function useLikes() {
    return useContext(LikeContext);
}
