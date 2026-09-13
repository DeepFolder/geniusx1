import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { TooltipProps } from 'recharts';
import type { ChartResponse, ChartPoint, DateRange } from './types';

interface Props { fixtureId: string; range: DateRange }

interface MappedPoint extends ChartPoint {
  label: string;
}

function fmtPeriod(p: string, groupBy: string) {
  const d = new Date(p);
  if (groupBy === 'month') return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

type Unit = 'percent' | 'ms' | 'tokens';
interface SeriesDef { key: string; color: string; label: string; unit: Unit }

const ALL_SERIES: SeriesDef[] = [
  { key: 'avgQuality',        color: '#60a5fa', label: 'Quality',            unit: 'percent' },
  { key: 'avgIntent',         color: '#34d399', label: 'Intent',             unit: 'percent' },
  { key: 'avgDomain',         color: '#a78bfa', label: 'Domain',             unit: 'percent' },
  { key: 'avgFollowUp',       color: '#fb923c', label: 'Follow-up sub-type', unit: 'percent' },
  { key: 'avgFirstToken',     color: '#f472b6', label: 'Avg first token',    unit: 'ms' },
  { key: 'avgTotalDuration',  color: '#facc15', label: 'Avg total duration', unit: 'ms' },
  { key: 'avgTotalTokens',    color: '#22d3ee', label: 'Avg total tokens',   unit: 'tokens' },
  { key: 'errorRate',         color: '#ef4444', label: 'Error rate',         unit: 'percent' },
  { key: 'avgThroughput',     color: '#84cc16', label: 'Throughput (tok/s)', unit: 'tokens' },
  { key: 'avgLatency',        color: '#ec4899', label: 'Latency (TTFT)',     unit: 'ms' },
];

const DEFAULT_KEYS = ['avgQuality', 'avgIntent', 'avgDomain', 'avgFollowUp'];

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload as MappedPoint | undefined;
  return (
    <div style={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, padding: '6px 10px', color: 'var(--popover-foreground)' }}>
      <p style={{ color: 'var(--muted-foreground)', marginBottom: 4 }}>{label}</p>
      {payload.map((entry) => {
        const v = entry.value as number | null | undefined;
        const series = ALL_SERIES.find(s => s.key === entry.dataKey);
        const suffix = series?.unit === 'percent' ? '%' : series?.unit === 'ms' ? 'ms' : (entry.dataKey === 'avgThroughput' ? ' tok/s' : '');
        const note = entry.name === 'Follow-up sub-type' && pt?.followUpFixtureCount
          ? ` (${pt.followUpFixtureCount} fixtures)` : '';
        return (
          <p key={entry.dataKey as string} style={{ color: entry.color, margin: 0 }}>
            {entry.name}: {v != null ? `${v}${suffix}${note}` : '—'}
          </p>
        );
      })}
    </div>
  );
}

export default function BenchmarkChart({ fixtureId, range }: Props) {
  const [selected, setSelected] = useState<string[]>(DEFAULT_KEYS);

  const params = new URLSearchParams();
  if (fixtureId) params.set('fixtureId', fixtureId);
  if (range.dateFrom) params.set('dateFrom', range.dateFrom);
  if (range.dateTo) params.set('dateTo', range.dateTo);

  const { data, isLoading } = useQuery<ChartResponse>({
    queryKey: ['/api/openai/admin/benchmark-chart', fixtureId, range.dateFrom, range.dateTo],
    queryFn: () => fetch(`/api/openai/admin/benchmark-chart?${params}`, { credentials: 'include' }).then(r => r.json()),
  });

  const points: MappedPoint[] = (data?.points ?? []).map(p => ({
    ...p,
    label: fmtPeriod(p.period, data?.groupBy ?? 'day'),
    avgQuality:       +(p.avgQuality * 100).toFixed(1),
    avgIntent:        +(p.avgIntent * 100).toFixed(1),
    avgDomain:        +(p.avgDomain * 100).toFixed(1),
    avgFollowUp:      p.avgFollowUp != null ? +(p.avgFollowUp * 100).toFixed(1) : null,
    errorRate:        p.errorRate != null ? +(p.errorRate * 100).toFixed(1) : null,
    avgTotalDuration: p.avgTotalDuration ?? null,
    avgTotalTokens:   p.avgTotalTokens ?? null,
    avgThroughput:    p.avgThroughput ?? null,
    avgLatency:       p.avgLatency ?? null,
  }));

  const toggle = (key: string) =>
    setSelected(s => s.includes(key) ? s.filter(k => k !== key) : [...s, key]);

  const active = ALL_SERIES.filter(s => selected.includes(s.key));
  const hasMs = active.some(s => s.unit === 'ms');
  const hasTokens = active.some(s => s.unit === 'tokens');
  const hasPercent = active.some(s => s.unit === 'percent');

  if (isLoading) return <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading chart…</div>;
  if (!points.length) return <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data for selected range.</div>;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {ALL_SERIES.map(s => (
          <button key={s.key} onClick={() => toggle(s.key)}
            className={`text-[10px] px-2 py-1 rounded border transition-colors ${
              selected.includes(s.key)
                ? 'border-transparent text-white'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
            style={selected.includes(s.key) ? { background: s.color } : {}}>
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" style={{ stroke: 'var(--border)' }} />
            <XAxis dataKey="label" tick={{ style: { fill: 'var(--muted-foreground)', fontSize: 10 } }} axisLine={{ style: { stroke: 'var(--border)' } }} tickLine={{ style: { stroke: 'var(--border)' } }} />
            {hasPercent && (
              <YAxis yAxisId="pct" domain={[0, 100]} tick={{ style: { fill: 'var(--muted-foreground)', fontSize: 10 } }} axisLine={{ style: { stroke: 'var(--border)' } }} tickLine={{ style: { stroke: 'var(--border)' } }} tickFormatter={v => `${v}%`} />
            )}
            {hasMs && (
              <YAxis yAxisId="ms" orientation="right" tick={{ style: { fill: 'var(--muted-foreground)', fontSize: 10 } }} axisLine={{ style: { stroke: 'var(--border)' } }} tickLine={{ style: { stroke: 'var(--border)' } }} tickFormatter={v => `${v}ms`} />
            )}
            {hasTokens && !hasMs && (
              <YAxis yAxisId="tok" orientation="right" tick={{ style: { fill: 'var(--muted-foreground)', fontSize: 10 } }} axisLine={{ style: { stroke: 'var(--border)' } }} tickLine={{ style: { stroke: 'var(--border)' } }} />
            )}
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: 'var(--foreground)' }} />
            {active.map(s => (
              <Line key={s.key}
                yAxisId={s.unit === 'percent' ? 'pct' : s.unit === 'ms' ? 'ms' : (hasMs ? 'ms' : 'tok')}
                dataKey={s.key} name={s.label} stroke={s.color}
                dot={points.length < 40} strokeWidth={2} connectNulls={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
