import { createContext, useContext } from "react";
import { lightColors, type AppColors } from "../styles/theme";

type ThemeCtx = { colors: AppColors; isDark: boolean };
const Ctx = createContext<ThemeCtx>({ colors: lightColors, isDark: false });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    return (
        <Ctx.Provider value={{ colors: lightColors, isDark: false }}>
            {children}
        </Ctx.Provider>
    );
}

export function useTheme(): ThemeCtx {
    return useContext(Ctx);
}
