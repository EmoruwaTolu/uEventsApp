// Central helper for Expo push delivery. Fire-and-forget by design: a failed
// push must never break the request that triggered it. Skipped entirely under
// test so the suite doesn't leave hanging outbound sockets (which slow the
// event loop and force Jest to --forceExit).

type ExpoMessage = {
    to: string;
    title: string;
    body: string;
    data?: unknown;
    sound?: "default";
};

export function sendExpoPush(messages: ExpoMessage[]): void {
    if (process.env.NODE_ENV === "test") return;
    if (!messages.length) return;

    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
        const batch = messages.slice(i, i + 100);
        fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(batch),
        }).catch(console.error);
    }
}
