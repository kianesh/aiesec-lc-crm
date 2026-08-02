import { useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { radius, space, useTheme } from "../theme";
import { Txt } from "./ui";

// Charts are hand-drawn on react-native-svg rather than pulled from a charting
// library. The three shapes below are all this app needs, they theme correctly
// in dark mode for free, and it keeps a ~300 KB dependency out of the bundle.

/** Measures its own width so charts can size to the parent without a prop. */
function useMeasuredWidth(fallback = 320) {
  const [width, setWidth] = useState(fallback);
  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && Math.abs(next - width) > 1) setWidth(next);
  };
  return { width, onLayout };
}

// ------------------------------------------------------------------ funnel --

export type FunnelRow = { label: string; value: number; conversion: number | null };

/**
 * Horizontal funnel. Bars are scaled to the largest stage rather than to the
 * first, because EXPA reports sign_up as 0 for most committees and anchoring on
 * it would flatten every other bar to nothing.
 */
export function FunnelChart({ rows }: { rows: FunnelRow[] }) {
  const theme = useTheme();
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <View style={{ gap: space.md }}>
      {rows.map((row, index) => {
        const fraction = row.value / max;
        return (
          <View key={row.label} style={{ gap: space.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Txt variant="caption" tone="muted">
                {row.label}
              </Txt>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                {row.conversion !== null ? (
                  <Txt variant="caption" tone={row.conversion >= 0.5 ? "success" : row.conversion >= 0.25 ? "warning" : "danger"}>
                    {Math.round(row.conversion * 100)}%
                  </Txt>
                ) : null}
                <Txt variant="label">{row.value.toLocaleString()}</Txt>
              </View>
            </View>
            <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: theme.surfaceSunken }}>
              <View
                style={{
                  height: 10,
                  borderRadius: radius.pill,
                  // Later stages read progressively darker, so depth in the
                  // funnel is visible at a glance and not only by length.
                  backgroundColor: index % 2 === 0 ? theme.primary : theme.primaryHover,
                  width: `${Math.max(fraction * 100, row.value > 0 ? 3 : 0)}%`
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

// -------------------------------------------------------------- line chart --

export type LinePoint = { label: string; value: number | null; forecast?: number | null; lower?: number | null; upper?: number | null };

function buildPath(points: { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

/**
 * History as a solid line, forecast as a dashed continuation with its
 * confidence band shaded behind it.
 */
export function LineChart({ points, height = 160 }: { points: LinePoint[]; height?: number }) {
  const theme = useTheme();
  const { width, onLayout } = useMeasuredWidth();

  const padding = { top: 10, right: 8, bottom: 20, left: 8 };
  const plotWidth = Math.max(width - padding.left - padding.right, 1);
  const plotHeight = height - padding.top - padding.bottom;

  const values = points.flatMap((point) =>
    [point.value, point.forecast, point.lower, point.upper].filter((value): value is number => typeof value === "number")
  );
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;

  const x = (index: number) => padding.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => padding.top + plotHeight - ((value - min) / span) * plotHeight;

  const historyPoints = points
    .map((point, index) => ({ point, index }))
    .filter((entry) => typeof entry.point.value === "number")
    .map((entry) => ({ x: x(entry.index), y: y(entry.point.value as number) }));

  const forecastEntries = points
    .map((point, index) => ({ point, index }))
    .filter((entry) => typeof entry.point.forecast === "number");

  const forecastPoints = forecastEntries.map((entry) => ({ x: x(entry.index), y: y(entry.point.forecast as number) }));

  // Join the dashed forecast onto the last real observation so the line reads
  // as one series rather than two disconnected fragments.
  const lastHistory = historyPoints[historyPoints.length - 1];
  const forecastPath = lastHistory ? buildPath([lastHistory, ...forecastPoints]) : buildPath(forecastPoints);

  const bandTop = forecastEntries
    .filter((entry) => typeof entry.point.upper === "number")
    .map((entry) => ({ x: x(entry.index), y: y(entry.point.upper as number) }));
  const bandBottom = forecastEntries
    .filter((entry) => typeof entry.point.lower === "number")
    .map((entry) => ({ x: x(entry.index), y: y(entry.point.lower as number) }))
    .reverse();
  const bandPath = bandTop.length > 0 && bandBottom.length > 0 ? `${buildPath(bandTop)} ${buildPath(bandBottom).replace("M", "L")} Z` : null;

  const firstLabel = points[0]?.label;
  const lastLabel = points[points.length - 1]?.label;

  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={height}>
        <Line
          x1={padding.left}
          y1={padding.top + plotHeight}
          x2={padding.left + plotWidth}
          y2={padding.top + plotHeight}
          stroke={theme.border}
          strokeWidth={1}
        />
        {bandPath ? <Path d={bandPath} fill={theme.primary} opacity={0.12} /> : null}
        {forecastPoints.length > 0 ? (
          <Path d={forecastPath} stroke={theme.primary} strokeWidth={2} fill="none" strokeDasharray="5 4" opacity={0.8} />
        ) : null}
        {historyPoints.length > 1 ? (
          <Path d={buildPath(historyPoints)} stroke={theme.primary} strokeWidth={2.5} fill="none" />
        ) : null}
        {lastHistory ? <Circle cx={lastHistory.x} cy={lastHistory.y} r={3.5} fill={theme.primary} /> : null}
        {firstLabel ? (
          <SvgText x={padding.left} y={height - 4} fill={theme.textSubtle} fontSize={10}>
            {firstLabel}
          </SvgText>
        ) : null}
        {lastLabel && lastLabel !== firstLabel ? (
          <SvgText x={padding.left + plotWidth} y={height - 4} fill={theme.textSubtle} fontSize={10} textAnchor="end">
            {lastLabel}
          </SvgText>
        ) : null}
      </Svg>
    </View>
  );
}

// ---------------------------------------------------------- percentile bar --

/**
 * Where this LC sits against its peer cohort. The median tick is what makes the
 * bar readable — a percentile alone doesn't say which side of "typical" you're on.
 */
export function PercentileBar({ percentile }: { percentile: number }) {
  const theme = useTheme();
  const { width, onLayout } = useMeasuredWidth();
  const clamped = Math.max(0, Math.min(100, percentile));
  const height = 10;
  const tone = clamped >= 66 ? theme.success : clamped >= 33 ? theme.warning : theme.danger;

  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} rx={height / 2} fill={theme.surfaceSunken} />
        <Rect x={0} y={0} width={(clamped / 100) * width} height={height} rx={height / 2} fill={tone} />
        <Line x1={width / 2} y1={0} x2={width / 2} y2={height} stroke={theme.textSubtle} strokeWidth={1} opacity={0.5} />
      </Svg>
    </View>
  );
}

// ------------------------------------------------------------- sparkbars --

/** Compact per-snapshot bars used for the "approved over time" trend. */
export function SparkBars({ values, height = 44 }: { values: number[]; height?: number }) {
  const theme = useTheme();
  const { width, onLayout } = useMeasuredWidth();
  const max = Math.max(...values, 1);
  const gap = 2;
  const barWidth = values.length > 0 ? Math.max((width - gap * (values.length - 1)) / values.length, 1) : 0;

  return (
    <View onLayout={onLayout}>
      <Svg width={width} height={height}>
        {values.map((value, index) => {
          const barHeight = Math.max((value / max) * height, value > 0 ? 2 : 0);
          return (
            <Rect
              key={index}
              x={index * (barWidth + gap)}
              y={height - barHeight}
              width={barWidth}
              height={barHeight}
              rx={Math.min(2, barWidth / 2)}
              fill={index === values.length - 1 ? theme.primary : theme.primarySoft}
            />
          );
        })}
      </Svg>
    </View>
  );
}
