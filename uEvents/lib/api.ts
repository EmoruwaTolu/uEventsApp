const PUB = process.env.EXPO_PUBLIC_API_BASE;

if (!PUB || !PUB.trim()) {
    throw new Error("EXPO_PUBLIC_API_BASE is not set. Add it to your .env file.");
}

export const API_BASE = PUB.trim();

// Fail fast instead of hanging forever when the backend is unreachable
// (wrong LAN IP, server down, asleep). Without this, requests on a bad
// EXPO_PUBLIC_API_BASE never resolve and the UI is stuck on skeletons.
// Set generously because the hosted backend (Render free tier) can cold-start
// in ~30–50s after going idle; a tight timeout would fail testers' first request.
const DEFAULT_TIMEOUT_MS = 45000;

export async function api<T>(
    path: string,
    init?: RequestInit,
    token?: string
): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            ...init,
            headers: {
                "content-type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(init?.headers || {}),
            },
            signal: controller.signal,
        });
    } catch (e: any) {
        if (e?.name === "AbortError") {
            const error = new Error(`Request timed out. Check that the server at ${API_BASE} is running and reachable.`) as Error & { status: number };
            error.status = 0;
            throw error;
        }
        throw e;
    } finally {
        clearTimeout(timer);
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const error = new Error(err?.error || `HTTP ${res.status}`) as Error & { status: number };
        error.status = res.status;
        throw error;
    }
    return (await res.json()) as T;
}