"use client";

import { TrendingUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { DashboardData, ExpaTrendPoint } from "../lib/dashboard-data";

// ---------------------------------------------------------------- palette --
// Categorical trio validated with the dataviz palette checker (light surface
// #ffffff): CVD worst-pair ΔE 13.8, normal-vision 28.5, contrast ≥ 3:1.
// Fixed assignment — the hue follows the metric, never its position.
const SERIES = {
  applied: { label: "Applied", color: "#037ef3" },
  approved: { label: "Approved", color: "#e8590c" },
  realized: { label: "Realized", color: "#0d9488" }
} as const;

type SeriesKey = keyof typeof SERIES;
const SERIES_KEYS: SeriesKey[] = ["applied", "approved", "realized"];

const STAGE_LABELS: Record<string, string> = {
  sign_up: "Sign up",
  applied: "Applied",
  matched: "Matched",
  approved: "Approved",
  realized: "Realized",
  finished: "Finished",
  completed: "Completed"
};
const STAGE_ORDER = ["sign_up", "applied", "matched", "approved", "realized", "finished", "completed"];

function fmt(n: number): string {
  return n.toLocaleString();
}

function pct(n: number | null): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

type FunnelRow = { stage: string; label: string; value: number; conversion: number | null };

function readFunnel(summary: Record<string, unknown> | null): FunnelRow[] {
  const funnel = (summary?.funnel ?? {}) as Record<string, number>;
  let previous: number | null = null;
  const rows: FunnelRow[] = [];
  for (const stage of STAGE_ORDER) {
    const value = Number(funnel[stage] ?? 0);
    const conversion = previous !== null && previous > 0 ? value / previous : null;
    rows.push({ stage, label: STAGE_LABELS[stage] ?? stage, value, conversion });
    if (value > 0 || previous !== null) previous = value;
  }
  // EXPA reports sign_up as 0 for most committees; a leading empty stage is
  // noise, but an interior zero is signal (a real drop to nothing).
  while (rows.length > 0 && rows[0]!.value === 0) rows.shift();
  return rows;
}

// ----------------------------------------------------------------- funnel --

function FunnelChart({ rows }: { rows: FunnelRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="expa-funnel" role="img" aria-label="EXPA funnel by stage">
      {rows.map((row, i) => (
        <div
          key={row.stage}
          className={`expa-funnel-row${hover === i ? " is-hover" : ""}`}
          onPointerEnter={() => setHover(i)}
          onPointerLeave={() => setHover(null)}
          tabIndex={0}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
        >
          <span className="expa-funnel-label">{row.label}</span>
          <span className="expa-funnel-track">
            <span
              className="expa-funnel-bar"
              style={{ width: `${Math.max((row.value / max) * 100, row.value > 0 ? 2 : 0)}%` }}
            />
            {/* Conversion from the previous stage, riding the bar end. */}
            {row.conversion != null && (
              <span className="expa-funnel-conv">{pct(row.conversion)}</span>
            )}
          </span>
          <span className="expa-funnel-value">{fmt(row.value)}</span>
          {hover === i && (
            <span className="expa-tooltip" role="status">
              <strong>{fmt(row.value)}</strong> {row.label}
              {row.conversion != null ? ` · ${pct(row.conversion)} from previous` : ""}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ trend --

const W = 560;
const H = 180;
const PAD = { top: 12, right: 64, bottom: 22, left: 36 };

function TrendChart({ points }: { points: ExpaTrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const { paths, xs, yTicks, yMax } = useMemo(() => {
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const rawMax = Math.max(...points.flatMap((p) => SERIES_KEYS.map((k) => p[k])), 1);
    // Round the ceiling up to a clean tick so axis labels stay round numbers.
    const step = Math.max(1, Math.pow(10, Math.floor(Math.log10(rawMax))) / (rawMax / Math.pow(10, Math.floor(Math.log10(rawMax))) >= 5 ? 1 : 2));
    const yMax = Math.ceil(rawMax / step) * step;
    const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
    const paths = Object.fromEntries(
      SERIES_KEYS.map((key) => [
        key,
        points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ")
      ])
    ) as Record<SeriesKey, string>;
    const ticks = [0, yMax / 2, yMax].map((v) => ({ v, y: y(v) }));
    return { paths, xs: points.map((_, i) => x(i)), yTicks: ticks, yMax };
  }, [points]);

  const yFor = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) - (v / yMax) * (H - PAD.top - PAD.bottom);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i += 1) if (Math.abs(xs[i]! - px) < Math.abs(xs[best]! - px)) best = i;
    setHover(best);
  }

  const hovered = hover != null ? points[hover] : null;
  const last = points[points.length - 1]!;

  return (
    <div className="expa-trend">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="expa-trend-svg"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* Recessive hairline grid. */}
        {yTicks.map((t) => (
          <g key={t.v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={t.y} y2={t.y} className="expa-grid" />
            <text x={PAD.left - 6} y={t.y + 3} className="expa-axis" textAnchor="end">
              {fmt(t.v)}
            </text>
          </g>
        ))}

        {/* Crosshair snaps to the nearest snapshot. */}
        {hover != null && (
          <line x1={xs[hover]} x2={xs[hover]} y1={PAD.top} y2={H - PAD.bottom} className="expa-crosshair" />
        )}

        {SERIES_KEYS.map((key) => (
          <path key={key} d={paths[key]} fill="none" stroke={SERIES[key].color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* End markers with a surface ring, plus direct labels at line ends. */}
        {SERIES_KEYS.map((key) => (
          <g key={`end-${key}`}>
            <circle cx={xs[xs.length - 1]} cy={yFor(last[key])} r={4} fill={SERIES[key].color} stroke="var(--brand-surface)" strokeWidth={2} />
            <text x={W - PAD.right + 8} y={yFor(last[key]) + 3} className="expa-endlabel">
              {SERIES[key].label}
            </text>
          </g>
        ))}

        {hover != null &&
          SERIES_KEYS.map((key) => (
            <circle key={`h-${key}`} cx={xs[hover]} cy={yFor(points[hover]![key])} r={4} fill={SERIES[key].color} stroke="var(--brand-surface)" strokeWidth={2} />
          ))}
      </svg>

      {/* One tooltip, every series at the hovered snapshot. */}
      {hovered && (
        <div className="expa-trend-tip" role="status">
          <span className="expa-trend-tip-date">
            {new Date(hovered.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          {SERIES_KEYS.map((key) => (
            <span className="expa-trend-tip-row" key={key}>
              <span className="expa-key" style={{ background: SERIES[key].color }} />
              <strong>{fmt(hovered[key])}</strong> {SERIES[key].label}
            </span>
          ))}
        </div>
      )}

      <div className="expa-legend">
        {SERIES_KEYS.map((key) => (
          <span key={key} className="expa-legend-item">
            <span className="expa-key" style={{ background: SERIES[key].color }} />
            {SERIES[key].label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ table --

function TableView({ rows, points }: { rows: FunnelRow[]; points: ExpaTrendPoint[] }) {
  return (
    <div className="expa-tables">
      <table className="expa-table">
        <thead>
          <tr><th>Stage</th><th>Count</th><th>Conv.</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.stage}>
              <td>{row.label}</td>
              <td>{fmt(row.value)}</td>
              <td>{pct(row.conversion)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {points.length > 1 && (
        <table className="expa-table">
          <thead>
            <tr><th>Snapshot</th><th>Applied</th><th>Approved</th><th>Realized</th></tr>
          </thead>
          <tbody>
            {[...points].reverse().slice(0, 8).map((point) => (
              <tr key={point.at}>
                <td>{new Date(point.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                <td>{fmt(point.applied)}</td>
                <td>{fmt(point.approved)}</td>
                <td>{fmt(point.realized)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ----------------------------------------------------------------- widget --

export function DashboardExpa({ data }: { data: DashboardData }) {
  const [view, setView] = useState<"chart" | "table">("chart");

  const summary = data.expaSnapshot?.summary ?? null;
  const rows = useMemo(() => readFunnel(summary), [summary]);
  const opportunities = (summary?.opportunities ?? {}) as { openOgx?: number; openIgx?: number };
  const accepted = Number(summary?.accepted ?? 0);
  const hasFunnel = rows.some((r) => r.value > 0);

  return (
    <article className="card dash-card expa-widget">
      <div className="dash-card-head">
        <h2><TrendingUp size={15} /> EXPA funnel</h2>
        <div className="expa-head-actions">
          {(hasFunnel || data.expaTrend.length > 1) && (
            <div className="expa-toggle" role="tablist" aria-label="View">
              <button role="tab" aria-selected={view === "chart"} className={view === "chart" ? "on" : ""} onClick={() => setView("chart")}>Chart</button>
              <button role="tab" aria-selected={view === "table"} className={view === "table" ? "on" : ""} onClick={() => setView("table")}>Table</button>
            </div>
          )}
          <Link href="/expa" className="dash-link">Analytics</Link>
        </div>
      </div>

      {data.expaStatus !== "connected" ? (
        <p className="muted-note">EXPA isn’t connected. <Link href="/integrations" className="dash-link">Connect it</Link> to pull funnel analytics.</p>
      ) : !summary ? (
        <p className="muted-note">Connected — no snapshot captured yet. Run a sync from the EXPA page.</p>
      ) : (
        <>
          {/* KPI row: the three headline numbers, then the plots below. */}
          <div className="expa-kpis">
            <div className="expa-kpi"><strong>{fmt(accepted)}</strong><span>Accepted</span></div>
            <div className="expa-kpi"><strong>{fmt(Number(opportunities.openOgx ?? 0))}</strong><span>Open oGX</span></div>
            <div className="expa-kpi"><strong>{fmt(Number(opportunities.openIgx ?? 0))}</strong><span>Open iGX</span></div>
          </div>

          {view === "table" ? (
            <TableView rows={rows} points={data.expaTrend} />
          ) : (
            <>
              {hasFunnel ? (
                <FunnelChart rows={rows} />
              ) : (
                <p className="muted-note">The latest snapshot has an empty funnel — check the EXPA page for sync errors.</p>
              )}
              {data.expaTrend.length > 1 && <TrendChart points={data.expaTrend} />}
            </>
          )}

          {data.expaLastSyncedAt && (
            <p className="expa-updated">Synced {new Date(data.expaLastSyncedAt).toLocaleString()}</p>
          )}
        </>
      )}
    </article>
  );
}
