import { useCallback, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "./ToastContext";
import { api } from "./api";

export function useApi() {
    const { session, signOut } = useAuth();
    const { showToast } = useToast();

    const sessionRef = useRef(session);
    sessionRef.current = session;

    const authApi = useCallback(
        async <T>(path: string, init?: RequestInit, opts?: { signOutOn401?: boolean }): Promise<T> => {
            try {
                return await api<T>(path, init, sessionRef.current?.token);
            } catch (err: any) {
                // A 401 usually means the session token is invalid/expired, so we
                // sign out. But some endpoints return 401 for a business reason —
                // e.g. change-password rejects a wrong *current* password — and
                // those must NOT end the session. Such calls pass
                // { signOutOn401: false } and handle the error themselves.
                if (err?.status === 401 && (opts?.signOutOn401 ?? true)) {
                    showToast("Your session expired. Please sign in again.", "error");
                    signOut();
                }
                throw err;
            }
        },
        [signOut, showToast]
    );

    return authApi;
}
