import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, Pattern, Rect, Circle } from "react-native-svg";

type Props = {
    base?: string;   // --c3
    accent?: string; // --c4
    cell?: number;   // --s
    dotR?: number;
};

export default function CardPatternBg({
    base = "#8C0327",
    accent = "#9d001d",
    cell = 64,
    dotR = 6,
}: Props) {
    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%">
                <Defs>
                    <Pattern id="card-tiling" patternUnits="userSpaceOnUse" width={cell} height={cell}>
                        <Rect width={cell} height={cell} fill={base} />
                        <Circle cx={0} cy={0} r={dotR} fill={accent} />
                        <Circle cx={cell / 2} cy={cell / 2} r={dotR} fill={accent} />
                    </Pattern>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#card-tiling)" />
            </Svg>
        </View>
    );
}
