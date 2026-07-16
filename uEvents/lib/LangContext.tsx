import React, { createContext, useContext, useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { getT } from "./i18n";

type Lang = "en" | "fr";

type LangContextType = {
    lang: Lang;
    setLang: (l: Lang) => void;
};

const LangContext = createContext<LangContextType>({ lang: "en", setLang: () => {} });

const STORE_KEY = "app_language";

export function LangProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLangState] = useState<Lang>("en");

    useEffect(() => {
        SecureStore.getItemAsync(STORE_KEY).then((val) => {
            if (val === "en" || val === "fr") setLangState(val);
        });
    }, []);

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
