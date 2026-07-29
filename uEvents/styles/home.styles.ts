import { StyleSheet } from "react-native";
import { lightColors, type AppColors } from "./theme";
import { fonts, lbl, meta } from "../styles/theme";

export const makeHomeStyles = (C: AppColors) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    masthead: {
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 20,
        backgroundColor: C.bg,
    },
    mastheadTopRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 8,
        backgroundColor: C.bg,
    },
    mastheadScrollable: {
        paddingHorizontal: 20,
        paddingTop: 6,
        paddingBottom: 20,
        backgroundColor: C.bg,
    },
    mastheadLabel: { ...meta(12.5, "bold"), letterSpacing: 0.3, color: C.primary },
    mastheadActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
    },
    mastheadIconBtn: {
        position: "relative",
    },
    mastheadHeading: { fontFamily: fonts.displayBold, fontSize: 42, letterSpacing: -1, color: C.text,
        
        lineHeight: 46 },
    mastheadAccent: {
        width: 48,
        height: 3,
        backgroundColor: C.primary,
        marginTop: 12,
    },
    mastheadCenter: {
        flex: 1,
        alignItems: "center",
    },
    mastheadTitle: { ...lbl(13, "bold", 0.12), color: C.text },
    mastheadSide: {
        width: 28,
        alignItems: "center",
        position: "relative",
    },
    container: {
        gap: 0,
        flexGrow: 0,
    },
    feedSection: {
        paddingHorizontal: 0,
        paddingTop: 16,
        gap: 1,
    },
    feedHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    mastheadGreeting: { ...meta(13, "bold"), color: C.text },
    notifBadge: {
        position: "absolute",
        top: -2,
        right: -2,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: C.primary,
        borderWidth: 1.5,
        borderColor: C.bg,
    },
    feedHeaderTitle: { ...lbl(11, "bold", 0.12), color: C.textMuted },
    caughtUp: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 24,
        paddingVertical: 32,
        gap: 12,
    },
    caughtUpLine: {
        flex: 1,
        height: StyleSheet.hairlineWidth,
        backgroundColor: C.textFaint,
    },
    caughtUpText: { ...lbl(10, "bold", 0.12), color: C.textFaint },
    discoverHeader: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 20,
    },
    discoverLabel: { ...lbl(10, "bold", 0.12), color: C.primary,
        
        marginBottom: 6 },
    discoverHeading: { fontFamily: fonts.displayBold, fontSize: 42, letterSpacing: -1, color: C.text,
        
        lineHeight: 46 },
    discoverAccent: {
        width: 48,
        height: 3,
        backgroundColor: C.primary,
        marginTop: 12,
    },
    emptyState: {
        alignItems: "center",
        paddingTop: 80,
        paddingHorizontal: 32,
        gap: 10,
    },
    emptyTitle: { ...lbl(13, "bold", 0.12), color: C.textFaint,
        
        marginTop: 8 },
    emptySubtitle: { ...meta(13, "regular"), color: C.textLight,
        textAlign: "center" },
    tabBar: {
        flexDirection: "row",
        backgroundColor: C.bg,
        borderBottomWidth: 1,
        borderBottomColor: C.borderWarm,
        position: "relative",
    },
    tab: {
        flex: 1,
        paddingVertical: 14,
        alignItems: "center",
        gap: 2,
    },
    tabActive: {},
    tabText: { ...meta(13, "medium"), color: C.textLight },
    tabTextActive: { ...meta(13, "bold"), letterSpacing: -0.2, color: C.text },
    tabIndicator: {
        position: "absolute",
        bottom: 0,
        left: 0,
        width: "50%",
        height: 2,
        backgroundColor: C.primary,
    },
    discoverBtn: {
        marginTop: 16,
        backgroundColor: C.primary,
        paddingHorizontal: 24,
        paddingVertical: 12,
    },
    discoverBtnText: { ...lbl(11, "bold", 0.12), color: "#fff" },
});

// Legacy alias kept for any imports that destructure { homeStyles }
export const homeStyles = makeHomeStyles(lightColors);
