import { StyleSheet } from "react-native";
import { lightColors, type AppColors } from "./theme";
import { fonts, lbl, meta } from "../styles/theme";

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
    headerLabel: { ...lbl(11, "bold", 0.12), color: C.textMuted },
    viewAll: { ...lbl(11, "bold", 0.09), color: C.primary },
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
    name: { ...meta(10, "medium"), marginTop: 5,
        color: C.textBody,
        textAlign: "center" },
    initial: { fontFamily: fonts.displayBold, fontSize: 18, color: C.primary },
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
    modalTitle: { fontFamily: fonts.displayBold, fontSize: 18, color: C.text },
    modalBody: { ...meta(14, "regular"), color: C.textBody },
    modalButton: {
        backgroundColor: C.text,
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
        marginTop: 4,
    },
    modalButtonText: { ...meta(16, "bold"), color: "#fff" },
});

export const followedStyles = makeFollowedStyles(lightColors);
