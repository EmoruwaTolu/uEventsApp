export const lightColors = {
    // ── Editorial palette ──────────────────────────────────────────────────
    // Cream page, white card, crimson accent, warm-grey rules.
    bg: "#F7F3EC",
    surface: "#FFFFFF",
    surfaceAlt: "#FBF8F2",
    surfaceWarm: "#FAF6EF",
    loadingBg: "#EFE9DE",
    text: "#1B2233",
    textBody: "#3A4152",
    textMuted: "#8A8578",
    textLight: "#A39D91",
    textFaint: "#C9C1B2",
    primary: "#8E0B2C",
    primaryDeep: "#6E0620",
    primaryBg: "#FBEFF2",
    gold: "#A8763E",
    border: "#E7E0D4",
    borderWarm: "#E7E0D4",
    track: "#EFE9DE",
    skeleton: "#EFE9DE",
    overlay: "rgba(0,0,0,0.5)",
};

export type AppColors = typeof lightColors;

export const darkColors: AppColors = {
    bg: "#161210",
    surface: "#221B16",
    surfaceAlt: "#2A211A",
    surfaceWarm: "#241B14",
    loadingBg: "#161210",
    text: "#F5F0EB",
    textBody: "#DDD7CF",
    textMuted: "#A8A09A",
    textLight: "#8A8078",
    textFaint: "#4D4039",
    primary: "#C2314F",
    primaryDeep: "#6E0620",
    primaryBg: "#3D1015",
    gold: "#C49A5A",
    border: "#3E322A",
    borderWarm: "#3E322A",
    track: "#332A22",
    skeleton: "#332A22",
    overlay: "rgba(0,0,0,0.7)",
};

// ── Type ───────────────────────────────────────────────────────────────────
// Outfit (geometric display) for headlines and figures, Plus Jakarta Sans for
// body, meta and UI. Bundled via @expo-google-fonts, registered in
// app/_layout.tsx.
//
// On React Native a bundled family is chosen by *name*, not by fontWeight — so
// always pick the family that carries the weight you want and leave fontWeight
// unset. Setting fontWeight alongside these is a no-op at best and a synthetic
// double-bolding on Android at worst.
export const fonts = {
    display: "Outfit_600SemiBold",
    displayBold: "Outfit_700Bold",
    body: "PlusJakartaSans_400Regular",
    bodyMedium: "PlusJakartaSans_500Medium",
    bodySemi: "PlusJakartaSans_600SemiBold",
    bodyBold: "PlusJakartaSans_700Bold",
} as const;

const BODY_WEIGHTS = {
    regular: fonts.body,
    medium: fonts.bodyMedium,
    semi: fonts.bodySemi,
    bold: fonts.bodyBold,
} as const;

type BodyWeight = keyof typeof BODY_WEIGHTS;

/**
 * Small uppercase label — category kickers, chips, buttons, badges.
 *
 * Tracking is deliberately modest. Wide letterspacing on uppercase is what made
 * the previous type system read like newsprint; keep it subtle and reserve
 * uppercase for genuinely label-like text, never for prose or meta lines.
 *
 * @param size   font size in points
 * @param weight body weight (default "bold")
 * @param em     tracking in em — RN wants absolute points, so it's derived from size
 */
export const lbl = (size: number, weight: BodyWeight = "bold", em = 0.07) => ({
    fontFamily: BODY_WEIGHTS[weight],
    fontSize: size,
    letterSpacing: size * em,
    textTransform: "uppercase" as const,
});

/** Sentence-case meta and UI text — timestamps, counts, captions, helper copy. */
export const meta = (size: number, weight: BodyWeight = "medium") => ({
    fontFamily: BODY_WEIGHTS[weight],
    fontSize: size,
});

// Legacy exports kept for files still importing from this module
export const colors = lightColors;
export const radius = { md: 12, lg: 16, xl: 20 };
export const space = { xs: 6, sm: 8, md: 12, lg: 16, xl: 20 };
