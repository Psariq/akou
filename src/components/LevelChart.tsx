import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { SessionRecord } from "../lib/types";
import { LEVELS, describeTheta } from "../lib/cefr";

interface Point {
  t: number; // session number (0 = starting point)
  v: number; // theta
  sessionIdx: number;
}

// Drawn at roughly phone width so 11px text stays ~11px on screen.
const W = 360;
const H = 210;
const PAD = { l: 30, r: 66, t: 10, b: 24 };

type SkillKey = "reading" | "listening" | "writing";

const SKILLS: { key: SkillKey; label: string; color: string }[] = [
  { key: "reading", label: "Reading", color: "var(--series-1)" },
  { key: "listening", label: "Listening", color: "var(--series-2)" },
  { key: "writing", label: "Writing", color: "var(--series-3)" },
];

/**
 * Estimated level over time, one line per skill. y is the continuous level
 * estimate; bands are labelled with CEFR levels. Hover/tap shows the values.
 */
export function LevelChart({ sessions, start }: { sessions: SessionRecord[]; start: { reading: number; listening: number } }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { series, tMin, tMax, yMin, yMax } = useMemo(() => {
    const mk = (mode: "reading" | "listening"): Point[] => {
      const own = sessions.map((s, i) => ({ s, i })).filter(({ s }) => s.mode === mode);
      if (!own.length) return [];
      return [
        { t: 0, v: own[0].s.thetaBefore ?? start[mode], sessionIdx: -1 },
        ...own.map(({ s, i }) => ({ t: i + 1, v: s.thetaAfter, sessionIdx: i })),
      ];
    };
    // Writing has no starting point: it begins with the first graded written answer.
    const writing: Point[] = sessions
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.writingThetaAfter !== undefined)
      .map(({ s, i }) => ({ t: i + 1, v: s.writingThetaAfter!, sessionIdx: i }));
    const series: Record<SkillKey, Point[]> = { reading: mk("reading"), listening: mk("listening"), writing };
    const vs = Object.values(series).flat().map((p) => p.v);
    let lo = Math.floor(Math.min(...vs, start.reading, start.listening));
    let hi = Math.ceil(Math.max(...vs, start.reading, start.listening) + 0.001);
    if (hi - lo < 2) hi = lo + 2;
    lo = Math.max(1, lo);
    hi = Math.min(6, hi);
    return { series, tMin: 0, tMax: Math.max(1, sessions.length), yMin: lo, yMax: hi };
  }, [sessions, start]);

  const x = (t: number) => PAD.l + ((t - tMin) / Math.max(1, tMax - tMin)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const path = (pts: Point[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join("");

  const bands: number[] = [];
  for (let b = yMin; b < yMax; b++) bands.push(b);
  const shown = SKILLS.filter((k) => series[k.key].length > 0);

  // Hover: nearest session (by x) among all plotted points.
  const allPts = shown
    .flatMap((k) => series[k.key])
    .filter((p) => p.sessionIdx >= 0)
    .sort((a, b) => a.t - b.t);
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !allPts.length) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = allPts[0];
    for (const p of allPts) if (Math.abs(x(p.t) - px) < Math.abs(x(best.t) - px)) best = p;
    setHover(best.sessionIdx);
  };

  const valueAt = (pts: Point[], t: number) => {
    let v: number | null = null;
    for (const p of pts) if (p.t <= t) v = p.v;
    return v;
  };

  const hs = hover !== null ? sessions[hover] : null;
  const ht = hover !== null ? hover + 1 : 0;

  // End-of-line labels, pushed apart vertically so they don't overlap.
  const labels = shown
    .map((k) => {
      const last = series[k.key].at(-1)!;
      return { ...k, lx: x(last.t) + 8, ly: y(last.v) };
    })
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < labels.length; i++) {
    if (Math.abs(labels[i].lx - labels[i - 1].lx) < 40 && labels[i].ly - labels[i - 1].ly < 13) {
      labels[i].ly = labels[i - 1].ly + 13;
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <div className="legend" aria-hidden="true">
        {shown.map((k) => (
          <span key={k.key}>
            <i style={{ background: k.color }} />
            {k.label}
          </span>
        ))}
      </div>
      <svg
        ref={svgRef}
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Estimated CEFR level over time for ${shown.map((k) => k.label.toLowerCase()).join(", ")}. A table version follows.`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        style={{ touchAction: "pan-y" }}
      >
        {bands.map((b) => (
          <g key={b}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(b)} y2={y(b)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PAD.l - 8} y={(y(b) + y(b + 1)) / 2 + 4} textAnchor="end">
              {LEVELS[b - 1] ?? ""}
            </text>
          </g>
        ))}
        <line x1={PAD.l} x2={W - PAD.r} y1={y(yMax)} y2={y(yMax)} stroke="var(--grid)" strokeWidth={1} />

        {hs && <line x1={x(ht)} x2={x(ht)} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="3 3" />}

        {shown.map((k) => {
          const pts = series[k.key];
          return (
            <g key={k.key}>
              <path d={path(pts)} fill="none" stroke={k.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {pts
                .filter((p) => p.sessionIdx >= 0)
                .map((p) => (
                  <circle
                    key={p.sessionIdx}
                    cx={x(p.t)}
                    cy={y(p.v)}
                    r={hover === p.sessionIdx ? 5 : 3}
                    fill={k.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                ))}
            </g>
          );
        })}
        {labels.map((l) => (
          <text key={l.key} x={l.lx} y={l.ly + 4} style={{ fill: "var(--text)" }}>
            {l.label}
          </text>
        ))}
        <text x={PAD.l} y={H - 6}>
          start
        </text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end">
          session {tMax}
        </text>
      </svg>
      {hs && (
        <div className="card" style={{ position: "absolute", top: 24, left: 8, padding: "8px 10px", fontSize: "0.8rem", pointerEvents: "none", maxWidth: 240 }}>
          <div style={{ fontWeight: 600 }}>{new Date(hs.date).toLocaleString()}</div>
          {shown.map((k) => {
            const v = valueAt(series[k.key], ht);
            if (v === null) return null;
            const d = describeTheta(v);
            return (
              <div key={k.key}>
                {k.label}: {d.level} {Math.round(d.progress * 100)}%
              </div>
            );
          })}
          <div className="muted">
            This session: {hs.mode}, {hs.level}, {Math.round(hs.score * 100)}%{hs.writingLevel ? `, writing ${hs.writingLevel}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}
