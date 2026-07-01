import React, { createContext, useContext, useState, useCallback } from "react";
import { useApi } from "./useApi";

type BookmarkContextType = {
    // Map of postId -> the user's latest bookmark state (set after any toggle).
    overrides: Map<string, boolean>;
    // Returns the override for a post if one exists, otherwise the server `base`.
    resolve: (postId: string, base: boolean) => boolean;
    // Optimistically flips the bookmark and syncs with the server. `current` is
    // the state currently shown (already merged via `resolve`), so the toggle
    // flips from what the user sees and reverts to it on failure.
    toggleBookmark: (postId: string, current: boolean) => void;
};

const BookmarkContext = createContext<BookmarkContextType>({
    overrides: new Map(),
    resolve: (_postId, base) => base,
    toggleBookmark: () => {},
});

export function BookmarkProvider({ children }: { children: React.ReactNode }) {
    const authApi = useApi();
    const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());

    const setOverride = useCallback((postId: string, state: boolean) => {
        setOverrides((prev) => {
            const next = new Map(prev);
            next.set(postId, state);
            return next;
        });
    }, []);

    const resolve = useCallback(
        (postId: string, base: boolean): boolean => overrides.get(postId) ?? base,
        [overrides]
    );

    const toggleBookmark = useCallback((postId: string, current: boolean) => {
        const next = !current;
        setOverride(postId, next);
        authApi(`/posts/${postId}/bookmark`, { method: next ? "POST" : "DELETE" })
            .catch(() => setOverride(postId, current)); // revert to what was shown
    }, [authApi, setOverride]);

    return (
        <BookmarkContext.Provider value={{ overrides, resolve, toggleBookmark }}>
            {children}
        </BookmarkContext.Provider>
    );
}

export function useBookmarks() {
    return useContext(BookmarkContext);
}
