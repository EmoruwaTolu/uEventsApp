import { StyleSheet } from "react-native";
import type { AppColors } from "./theme";

export const makeFollowedStyles = (C: AppColors) => StyleSheet.create({
    container: {
        width: "100%",
        overflow: "hidden",
        backgroundColor: C.bg,
        borderBottomWidth: 1,
        borderBottomColor: C.borderWarm,
        paddingBottom: 10,
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
    },
    headerLabel: {
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 1.5,
        color: C.textMuted,
        textTransform: "uppercase",
    },
    viewAll: {
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 1,
        color: C.primary,
        textTransform: "uppercase",
    },
    listContent: {
        paddingHorizontal: 16,
    },
    followedAccount: {
        alignItems: "center",
        width: 64,
    },
    circle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: C.surface,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 2,
        borderColor: C.primary,
        overflow: "hidden",
    },
    avatarImage: {
        width: 52,
        height: 52,
        borderRadius: 26,
    },
    name: {
        fontSize: 10,
        marginTop: 5,
        color: C.textBody,
        textAlign: "center",
        fontWeight: "500",
    },
    initial: {
        fontSize: 18,
        fontWeight: "700",
        color: C.primary,
    },
    itemPressable: {},

    editCircle: { backgroundColor: C.surface },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.35)",
        justifyContent: "flex-end",
    },
    modalCard: {
        backgroundColor: C.surface,
        padding: 16,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        gap: 12,
    },
    modalTitle: { fontSize: 18, fontWeight: "700", color: C.text },
    modalBody: { fontSize: 14, color: C.textBody },
    modalButton: {
        backgroundColor: C.text,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
        marginTop: 4,
    },
    modalButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});

export const followedStyles = makeFollowedStyles({
    bg: "#F7F3EE", surface: "#FFFFFF", surfaceAlt: "#F9FAFB", surfaceWarm: "#FAF6EF", loadingBg: "#D0D0D0",
    text: "#111827", textBody: "#374151", textMuted: "#6B7280", textLight: "#9CA3AF",
    textFaint: "#D1CBC3", primary: "#8C0327", primaryBg: "#FEE2E2", gold: "#A8763E",
    border: "#E5E7EB", borderWarm: "#E5E0D8", skeleton: "#E5E0D8",
    overlay: "rgba(0,0,0,0.5)",
});
