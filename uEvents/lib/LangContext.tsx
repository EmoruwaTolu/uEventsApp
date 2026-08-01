import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import * as SecureStore from "expo-secure-store";
import { getT } from "./i18n";
import { api } from "./api";
import { useAuth } from "../auth/AuthContext";

type Lang = "en" | "fr";

type LangContextType = {
    lang: Lang;
    setLang: (l: Lang) => void;
};

const LangContext = createContext<LangContextType>({ lang: "en", setLang: () => {} });

const STORE_KEY = "app_language";

export function LangProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLangState] = useState<Lang>("en");
    // The stored language arrives asynchronously; until it does, `lang` is just
    // the "en" default and must not be mirrored to the server — that would
    // overwrite a French user's setting on every cold start.
    const [hydrated, setHydrated] = useState(false);
    const { session } = useAuth();
    const syncedRef = useRef<string | null>(null);

    useEffect(() => {
        SecureStore.getItemAsync(STORE_KEY)
            .then((val) => {
                if (val === "en" || val === "fr") setLangState(val);
            })
            .finally(() => setHydrated(true));
    }, []);

    // Mirror the language to the account so server-composed push notifications
    // are sent in the language the user reads (the OS renders those, so unlike
    // in-app text they can't be translated at display time). Runs on sign-in as
    // well as on change, which backfills accounts that predate this field.
    // Fire-and-forget: a failed sync only affects push copy, never the UI.
    useEffect(() => {
        const token = session?.token;
        if (!hydrated || !token || session?.role === "guest") return;
        const key = `${token}:${lang}`;
        if (syncedRef.current === key) return;
        syncedRef.current = key;
        api("/users/me", {
            method: "PATCH",
            body: JSON.stringify({ language: lang }),
        }, token).catch(() => { syncedRef.current = null; });
    }, [hydrated, lang, session?.token, session?.role]);

    function setLang(l: Lang) {
        setLangState(l);
        SecureStore.setItemAsync(STORE_KEY, l);
    }

    return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
    return useContext(LangContext);
}

/** Returns the translation object for the current language */
export function useT() {
    const { lang } = useContext(LangContext);
    return getT(lang);
}

/** Pick the best locale string from a locales object given a language preference */
export function pickLocale(locales: Record<string, any> | undefined | null, lang: Lang): any {
    if (!locales) return {};
    return locales[lang] ?? locales["en"] ?? Object.values(locales)[0] ?? {};
}

// Pick a bilingual field (e.g. club name/description): use the French value in
// French when it exists, otherwise fall back to the English/primary value.
export function pickText(
    en: string | null | undefined,
    fr: string | null | undefined,
    lang: Lang,
): string {
    return (lang === "fr" && fr) ? fr : (en ?? "");
}
