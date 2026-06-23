import { useAuth } from "../auth/AuthContext";
import { useGuestModal } from "./GuestModalContext";

/**
 * Returns a guard function. Call it before any action that requires auth.
 * If the user is a guest, shows the sign-up modal and returns true (blocked).
 * If the user is authenticated, returns false (not blocked).
 */
export function useGuestGuard() {
    const { session } = useAuth();
    const { showGuestModal } = useGuestModal();

    return function guard(): boolean {
        if (session?.token) return false; // authenticated — not blocked
        showGuestModal();
        return true; // blocked
    };
}
