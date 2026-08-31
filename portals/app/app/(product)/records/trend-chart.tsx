"use client";

import { useMemo, useRef, useState } from "react";
import { RUN_DURATION_MS, formatScoreMs, type TrendPoint } from "../../game/rules";

// The pro trend: daily best survival over the 30-day window, one line.
//
// One series on purpose - the spec asks for "a trend curve", and a single
// series needs no legend (the title names it) and cannot collide with itself.
// The mean and run count ride along in the tooltip where they belong. The
// series color is --vxtpl-chart-series, validated per mode with the palette
// validator (light #3457d5, dark #6d84ec) - see globals.css.
//
// Days without a run are gaps, not zeros: the x axis is a real date scale over
// the window, so an idle week reads as silence instead of a crash to 0.00s.

const VB_W = 640;
const VB_H = 220;
const M = { top: 16, right: 14, bottom: 26, left: 38 };
const PLOT_W = VB_W - M.left - M.right;
const PLOT_H = VB_H - M.top - M.bottom;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Hover {
  index: number;
  px: number;
  py: number;
}

export function TrendChart({ points, windowDays }: { points: TrendPoint[]; windowDays: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const geo = useMemo(() => {
    const end = Date.parse(new Date().toISOString().slice(0, 10)); // today, UTC midnight
    const start = end - (windowDays - 1) * DAY_MS;
    const x = (day: string) => M.left + ((Date.parse(day) - start) / (end - start || 1)) * PLOT_W;
    const y = (ms: number) => M.top + (1 - ms / RUN_DURATION_MS) * PLOT_H;
    const dots = points.map((p) => ({ ...p, px: x(p.day), py: y(p.bestMs) }));
    // ~5 date ticks across the window, first and last always present.
    const tickCount = 5;
    const ticks = Array.from({ length: tickCount }, (_, i) => {
      const t = start + ((end - start) * i) / (tickCount - 1);
      const d = new Date(t);
      return { px: M.left + (PLOT_W * i) / (tickCount - 1), label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}` };
    });
    return { dots, ticks, y };
  }, [points, windowDays]);

  const path = useMemo(
    () => geo.dots.map((d, i) => `${i === 0 ? "M" : "L"}${d.px.toFixed(1)},${d.py.toFixed(1)}`).join(" "),
    [geo],
  );

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (geo.dots.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * VB_W;
    let best = 0;
    for (let i = 1; i < geo.dots.length; i++) {
      if (Math.abs(geo.dots[i].px - vx) < Math.abs(geo.dots[best].px - vx)) best = i;
    }
    setHover({ index: best, px: geo.dots[best].px, py: geo.dots[best].py });
  }

  if (points.length === 0) {
    return <p className="trend-empty">No finished runs in the last {windowDays} days yet - the curve starts with your next one.</p>;
  }

  const h = hover ? geo.dots[hover.index] : null;

  return (
    <div ref={wrapRef} className="trend-wrap">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="trend-svg"
        role="img"
        aria-label={`Daily best survival time over the last ${windowDays} days`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* recessive grid: one line per 5s, labels in muted ink */}
        {[0, 5000, 10000, 15000, 20000].map((ms) => (
          <g key={ms}>
            <line
              x1={M.left}
              x2={VB_W - M.right}
              y1={geo.y(ms)}
              y2={geo.y(ms)}
              className={ms === RUN_DURATION_MS ? "trend-goal" : "trend-grid"}
            />
            <text x={M.left - 8} y={geo.y(ms) + 3.5} textAnchor="end" className="trend-tick">
              {ms / 1000}s
            </text>
          </g>
        ))}
        <text x={VB_W - M.right} y={geo.y(RUN_DURATION_MS) - 5} textAnchor="end" className="trend-goal-label">
          survive
        </text>

        {geo.ticks.map((t) => (
          <text key={t.px} x={t.px} y={VB_H - 8} textAnchor="middle" className="trend-tick">
            {t.label}
          </text>
        ))}

        {hover && <line x1={hover.px} x2={hover.px} y1={M.top} y2={M.top + PLOT_H} className="trend-crosshair" />}

        {geo.dots.length > 1 && <path d={path} className="trend-line" />}
        {geo.dots.map((d, i) => (
          <circle
            key={d.day}
            cx={d.px}
            cy={d.py}
            r={hover?.index === i ? 5 : 3.5}
            className="trend-dot"
          />
        ))}
      </svg>

      {h && hover && (
        <div
          className="trend-tooltip"
          style={{
            left: `${(hover.px / VB_W) * 100}%`,
            top: `${(hover.py / VB_H) * 100}%`,
          }}
        >
          <div className="trend-tooltip__day">{h.day}</div>
          <div>best {formatScoreMs(h.bestMs)}s</div>
          <div>mean {formatScoreMs(h.meanMs)}s</div>
          <div>
            {h.count} run{h.count === 1 ? "" : "s"}
          </div>
        </div>
      )}
    </div>
  );
}
