import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, Pattern, Rect, Circle } from "react-native-svg";

type Props = {
    bgColor?: string;     // background-color
    dotColor?: string;    // #aeaeae
    cell?: number;        // background-size (px)
    dotRadius?: number;   // radial dot radius
};

export default function PatternBackground({
    bgColor = "#C0C0C0",
    dotColor = "#D0D0D0",
    cell = 20,
    dotRadius = 1.2,
}: Props) {
    return (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%">
                <Defs>
                    <Pattern id="dots" patternUnits="userSpaceOnUse" width={cell} height={cell}>
                        <Rect width={cell} height={cell} fill={bgColor} />
                        <Circle cx={0} cy={0} r={dotRadius} fill={dotColor} />
                        <Circle cx={cell / 2} cy={cell / 2} r={dotRadius} fill={dotColor} />
                    </Pattern>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#dots)" />
            </Svg>
        </View>
    );
}
