export const lightColors = {
    bg: "#F7F3EE",
    surface: "#FFFFFF",
    surfaceAlt: "#F9FAFB",
    loadingBg: "#D0D0D0",
    text: "#111827",
    textBody: "#374151",
    textMuted: "#6B7280",
    textLight: "#9CA3AF",
    textFaint: "#D1CBC3",
    primary: "#8C0327",
    primaryBg: "#FEE2E2",
    gold: "#A8763E",
    border: "#E5E7EB",
    borderWarm: "#E5E0D8",
    skeleton: "#E5E0D8",
    overlay: "rgba(0,0,0,0.5)",
};

export type AppColors = typeof lightColors;

export const darkColors: AppColors = {
    bg: "#161210",
    surface: "#2C2219",
    surfaceAlt: "#372B21",
    loadingBg: "#161210",
    text: "#F5F0EB",
    textBody: "#DDD7CF",
    textMuted: "#A8A09A",
    textLight: "#7A706A",
    textFaint: "#4D4039",
    primary: "#8C0327",
    primaryBg: "#3D1015",
    gold: "#C49A5A",
    border: "#4A3A30",
    borderWarm: "#4A3A30",
    skeleton: "#3D2E24",
    overlay: "rgba(0,0,0,0.7)",
};

// Legacy exports kept for files still importing from this module
export const colors = lightColors;
export const radius = { md: 12, lg: 16, xl: 20 };
export const space = { xs: 6, sm: 8, md: 12, lg: 16, xl: 20 };
