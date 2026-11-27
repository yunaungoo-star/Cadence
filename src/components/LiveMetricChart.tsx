import React, { useId, useMemo, useState } from 'react';
import { formatTimeClock } from '@/src/lib/formatters';

export interface ChartPoint {
  timestamp: number;
  value: number;
}

interface LiveMetricChartProps {
  title: string;
  subtitle: string;
  currentValue: number;
  unit?: string;
  valueDecimals?: number;
  maxValue?: number | 'auto';
  points: ChartPoint[];
  threshold?: number;
  accentColor: string;
  statusLabel: string;
  statusTone: 'nominal' | 'elevated' | 'critical';
  headerActions?: React.ReactNode;
}

function computeNiceMax(peak: number): number {
  if (peak <= 0) return 10;
  const target = peak * 1.25;
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  const normalized = target / magnitude;
  let nice = 10;
  if (normalized <= 1.2) nice = 1.2;
  else if (normalized <= 1.5) nice = 1.5;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 2.5) nice = 2.5;
  else if (normalized <= 4) nice = 4;
  else if (normalized <= 5) nice = 5;
  else if (normalized <= 8) nice = 8;
  return Number((nice * magnitude).toPrecision(3));
}

function formatAxisTick(val: number): string {
  if (val === 0) return '0';
  if (val >= 100) return Math.round(val).toString();
  if (val >= 10) return Number(val.toFixed(1)).toString();
  return Number(val.toFixed(2)).toString();
}

export const LiveMetricChart: React.FC<LiveMetricChartProps> = ({
  title,
  subtitle,
  currentValue,
  unit = '%',
  valueDecimals = 1,
  maxValue = 100,
  points,
  threshold,
  accentColor,
  statusLabel,
  statusTone,
  headerActions,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const rawGradId = useId();
  const areaGradId = `chart-grad-${rawGradId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const width = 560;
  const height = 180;
  const padLeft = 42;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 24;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const stats = useMemo(() => {
    if (points.length === 0) {
      return { min: 0, avg: 0, p95: 0, peak: 0 };
    }
    let sum = 0;
    let peak = -Infinity;
    let min = Infinity;
    const values: number[] = [];
    for (const p of points) {
      sum += p.value;
      if (p.value > peak) peak = p.value;
      if (p.value < min) min = p.value;
      values.push(p.value);
    }
    values.sort((a, b) => a - b);
    const p95Idx = Math.min(values.length - 1, Math.floor(values.length * 0.95));
    return {
      min,
      avg: sum / points.length,
      p95: values[p95Idx] ?? 0,
      peak,
    };
  }, [points]);

  const yMax = useMemo(() => {
    if (typeof maxValue === 'number') return maxValue;
    const peakCandidate = Math.max(stats.peak, currentValue, typeof threshold === 'number' ? threshold : 0);
    return computeNiceMax(peakCandidate);
  }, [maxValue, stats.peak, currentValue, threshold]);

  const ticks = useMemo(() => {
    return [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];
  }, [yMax]);

  const { linePath, areaPath, coords } = useMemo(() => {
    if (points.length === 0) {
      return { linePath: '', areaPath: '', coords: [] as Array<{ x: number; y: number; point: ChartPoint }> };
    }
    const maxCount = Math.max(1, points.length - 1);
    const safeMax = yMax > 0 ? yMax : 1;
    const mapped = points.map((p, idx) => {
      const x = padLeft + (points.length === 1 ? plotW : (idx / maxCount) * plotW);
      const clamped = Math.min(safeMax, Math.max(0, p.value));
      const y = padTop + plotH - (clamped / safeMax) * plotH;
      return { x, y, point: p };
    });

    const line = mapped.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const last = mapped[mapped.length - 1];
    const first = mapped[0];
    const area = `${line} L ${last.x.toFixed(1)} ${(padTop + plotH).toFixed(1)} L ${first.x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

    return { linePath: line, areaPath: area, coords: mapped };
  }, [points, plotH, plotW, yMax]);

  const thresholdY =
    typeof threshold === 'number' && yMax > 0
      ? padTop + plotH - (Math.min(yMax, Math.max(0, threshold)) / yMax) * plotH
      : null;

  const hovered = hoverIdx !== null && coords[hoverIdx] ? coords[hoverIdx] : null;

  const toneText =
    statusTone === 'critical'
      ? 'text-red-600 dark:text-red-400'
      : statusTone === 'elevated'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-emerald-600 dark:text-emerald-400';

  const unitSuffix = unit ? (unit.startsWith('%') ? unit : ` ${unit}`) : '';

  const lastCoord = coords.length > 0 ? coords[coords.length - 1] : null;
  const hoverBoxW = 108;
  const hoverBoxH = 22;
  const hoverBoxX = hovered
    ? Math.min(Math.max(hovered.x - hoverBoxW / 2, padLeft), width - padRight - hoverBoxW)
    : 0;
  const hoverBoxY = hovered
    ? hovered.y - hoverBoxH - 10 >= padTop
      ? hovered.y - hoverBoxH - 10
      : Math.min(hovered.y + 10, padTop + plotH - hoverBoxH)
    : 0;

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-5 flex flex-col justify-between transition-colors">
      <div>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-display">{title}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100 leading-none">
              {currentValue.toFixed(valueDecimals)}
              {unit && (
                <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-0.5">{unit}</span>
              )}
            </div>
            <div className={`text-xs font-medium mt-1 ${toneText}`}>{statusLabel}</div>
          </div>
        </div>

        {headerActions && <div className="mb-3">{headerActions}</div>}

        <div className="relative select-none">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-44 overflow-visible"
            role="img"
            aria-label={`${title} time-series chart`}
            onMouseLeave={() => setHoverIdx(null)}
            onMouseMove={(e) => {
              if (coords.length === 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * width;
              let bestIdx = 0;
              let bestDist = Infinity;
              for (let i = 0; i < coords.length; i++) {
                const d = Math.abs(coords[i].x - relX);
                if (d < bestDist) {
                  bestDist = d;
                  bestIdx = i;
                }
              }
              setHoverIdx(bestIdx);
            }}
          >
            {/* Y-axis gridlines */}
            {ticks.map((tick, idx) => {
              const y = padTop + plotH - (yMax > 0 ? (tick / yMax) * plotH : 0);
              return (
                <g key={idx}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    className="stroke-slate-100 dark:stroke-slate-800"
                    strokeWidth={1}
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums"
                  >
                    {formatAxisTick(tick)}
                  </text>
                </g>
              );
            })}

            {/* Warning threshold line */}
            {thresholdY !== null && (
              <g>
                <line
                  x1={padLeft}
                  y1={thresholdY}
                  x2={width - padRight}
                  y2={thresholdY}
                  className="stroke-amber-500/70 dark:stroke-amber-400/60"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
              </g>
            )}

            <defs>
              <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity={0.24} />
                <stop offset="100%" stopColor={accentColor} stopOpacity={0.01} />
              </linearGradient>
            </defs>

            {/* Area & Line */}
            {areaPath && <path d={areaPath} fill={`url(#${areaGradId})`} />}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke={accentColor}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {/* Live trailing endpoint dot */}
            {!hovered && lastCoord && (
              <circle
                cx={lastCoord.x}
                cy={lastCoord.y}
                r={3.5}
                fill={accentColor}
                className="stroke-white dark:stroke-slate-900"
                strokeWidth={2}
              />
            )}

            {/* Hover crosshair & floating readout */}
            {hovered && (
              <g>
                <line
                  x1={hovered.x}
                  y1={padTop}
                  x2={hovered.x}
                  y2={padTop + plotH}
                  className="stroke-slate-400 dark:stroke-slate-500"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <circle
                  cx={hovered.x}
                  cy={hovered.y}
                  r={4}
                  fill={accentColor}
                  className="stroke-white dark:stroke-slate-900"
                  strokeWidth={2}
                />
                <g transform={`translate(${hoverBoxX.toFixed(1)}, ${hoverBoxY.toFixed(1)})`}>
                  <rect
                    width={hoverBoxW}
                    height={hoverBoxH}
                    rx={6}
                    className="fill-slate-900 dark:fill-slate-100 stroke-slate-700/60 dark:stroke-slate-300"
                    strokeWidth={0.75}
                  />
                  <text
                    x={hoverBoxW / 2}
                    y={14.5}
                    textAnchor="middle"
                    className="fill-white dark:fill-slate-900 text-[10px] font-mono font-medium tabular-nums"
                  >
                    {hovered.point.value.toFixed(valueDecimals)}
                    {unitSuffix} · {formatTimeClock(hovered.point.timestamp)}
                  </text>
                </g>
              </g>
            )}

            {/* X-axis endpoints */}
            {points.length > 0 && (
              <>
                <text
                  x={padLeft}
                  y={height - 4}
                  textAnchor="start"
                  className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  {formatTimeClock(points[0].timestamp)}
                </text>
                <text
                  x={width - padRight}
                  y={height - 4}
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  {formatTimeClock(points[points.length - 1].timestamp)}
                </text>
              </>
            )}
          </svg>

          <div className="h-5 mt-1 flex items-center justify-between text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
            {hovered ? (
              <>
                <span>Sample {formatTimeClock(hovered.point.timestamp)}</span>
                <span>
                  {hovered.point.value.toFixed(valueDecimals)}
                  {unitSuffix}
                </span>
              </>
            ) : (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {points.length} {points.length === 1 ? 'sample' : 'samples'} · Hover chart to inspect
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
        <span>
          Min{' '}
          <strong className="font-medium text-slate-800 dark:text-slate-200">
            {stats.min.toFixed(valueDecimals)}
            {unitSuffix}
          </strong>
        </span>
        <span>
          Avg{' '}
          <strong className="font-medium text-slate-800 dark:text-slate-200">
            {stats.avg.toFixed(valueDecimals)}
            {unitSuffix}
          </strong>
        </span>
        <span>
          P95{' '}
          <strong className="font-medium text-slate-800 dark:text-slate-200">
            {stats.p95.toFixed(valueDecimals)}
            {unitSuffix}
          </strong>
        </span>
        <span>
          Peak{' '}
          <strong className="font-medium text-slate-800 dark:text-slate-200">
            {stats.peak.toFixed(valueDecimals)}
            {unitSuffix}
          </strong>
        </span>
        {typeof threshold === 'number' && (
          <span>
            Alert{' '}
            <strong className="font-medium text-slate-800 dark:text-slate-200">
              {threshold}
              {unitSuffix}
            </strong>
          </span>
        )}
      </div>
    </section>
  );
};
