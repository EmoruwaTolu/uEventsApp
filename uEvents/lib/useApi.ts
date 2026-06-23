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
        async <T>(path: string, init?: RequestInit): Promise<T> => {
            try {
                return await api<T>(path, init, sessionRef.current?.token);
            } catch (err: any) {
                if (err?.status === 401) {
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
