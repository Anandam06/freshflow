/** Shared chart styling. Text uses ink tokens, never series colours. */

export const INK = { primary: "#1d2a24", secondary: "#475467", muted: "#667085", grid: "#e7eaee", axis: "#cfd5dc" };

/** Model emphasis (not categorical identity — models are always named on the axis/table). */
export const MODEL_COLOR = { M0: "#97a1ae", M1: "#76808f", M2: "#4f5b6b", M3: "#0f8a7e" } as const;

/** Validated categorical order (dataviz reference palette, adjacent-pair CVD ΔE ≥ 8). */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"] as const;

export const STATUS = { good: "#0f8a7e", warning: "#d9822b", critical: "#b4483f" } as const;

export const axisTick = { fill: INK.muted, fontSize: 13 };
export const axisLine = { stroke: INK.axis };
export const gridProps = { stroke: INK.grid, strokeDasharray: "0", vertical: false } as const;
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
