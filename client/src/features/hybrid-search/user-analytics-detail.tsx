import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from 'recharts';
import { Loader2, Download, X, Activity, Clock, Zap, DollarSign, Brain } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function getFlagEmoji(country: string): string {
  if (!country || country.length !== 2) return '🌐';
  const upper = country.toUpperCase();
  try {
    return String.fromCodePoint(upper.codePointAt(0)! - 65 + 0x1F1E6) +
           String.fromCodePoint(upper.codePointAt(1)! - 65 + 0x1F1E6);
  } catch { return '🌐'; }
}

const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'hour', label: 'Last hour' },
  { value: 'day', label: 'Last 24h' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range…' },
];

interface Props {
  userId: string;
  userLabel: string;
  onClose: () => void;
  formatCost: (n: number) => string;
  formatCostTotal: (n: number) => string;
  formatTokens: (n: number) => string;
  formatDuration: (ms: number) => string;
  formatTime: (ts: number) => string;
}

interface SummaryResp {
  user: { id: string; email: string | null; name: string | null; role: string | null; is_anonymous: boolean } | null;
  summary: {
    requests: number;
    total_tokens: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_cost_usd: number;
    avg_cost_per_prompt: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    throughput_tps: number;
    first_seen: number;
    last_seen: number;
    top_country: string | null;
    top_city: string | null;
  } | null;
  by_model: Array<{ model: string; calls: number; tokens: number; cost_usd: number; share_pct: number }>;
  by_mode: Record<string, number>;
  by_intent: Record<string, number>;
}

interface TimeseriesResp {
  bucket: string;
  range: string;
  series: Array<{ key: string; requests: number; total_tokens: number; total_cost_usd: number; total_duration_ms: number }>;
}

interface PromptsResp {
  total: number;
  page: number;
  pageSize: number;
  prompts: Array<{
    request_id: string;
    timestamp: number;
    query: string;
    models: string[];
    primary_model: string | null;
    total_tokens: number;
    duration_ms: number;
    throughput_tps: number;
    cost_usd: number;
    search_mode: string;
    intent: string | null;
    products_found: number;
  }>;
}

const TS_CHART_CONFIG = {
  cost: { label: 'Cost', color: '#34d399' },
  requests: { label: 'Requests', color: '#60a5fa' },
} satisfies ChartConfig;

export function UserAnalyticsDetail({
  userId,
  userLabel,
  onClose,
  formatCost,
  formatCostTotal,
  formatTokens,
  formatDuration,
  formatTime,
}: Props) {
  const [range, setRange] = useState<string>('month');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [model, setModel] = useState<string>('all');
  const [searchMode, setSearchMode] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [isExporting, setIsExporting] = useState(false);
  const pageSize = 25;
  const { toast } = useToast();

  const customReady = range !== 'custom' || (!!from && !!to);

  const filtersQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('range', range);
    if (range === 'custom') {
      if (from) p.set('from', new Date(from).toISOString());
      if (to) p.set('to', new Date(to).toISOString());
    }
    if (model !== 'all') p.set('model', model);
    if (searchMode !== 'all') p.set('searchMode', searchMode);
    return p.toString();
  }, [range, from, to, model, searchMode]);

  const { data: models } = useQuery<{ models: string[] }>({
    queryKey: ['/api/openai/usage/models'],
  });

  const { data: summary, isLoading: sumLoading } = useQuery<SummaryResp>({
    queryKey: [`/api/openai/usage/by-user/${encodeURIComponent(userId)}/summary?${filtersQs}`],
    enabled: customReady,
  });

  const { data: ts, isLoading: tsLoading } = useQuery<TimeseriesResp>({
    queryKey: [`/api/openai/usage/by-user/${encodeURIComponent(userId)}/timeseries?${filtersQs}`],
    enabled: customReady,
  });

  const promptsQs = useMemo(() => `${filtersQs}&page=${page}&pageSize=${pageSize}`, [filtersQs, page]);
  const { data: prompts, isLoading: promptsLoading } = useQuery<PromptsResp>({
    queryKey: [`/api/openai/usage/by-user/${encodeURIComponent(userId)}/prompts?${promptsQs}`],
    enabled: customReady,
  });

  const totalPages = prompts ? Math.max(1, Math.ceil(prompts.total / pageSize)) : 1;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const res = await fetch(`/api/openai/usage/by-user/export.csv?${filtersQs}`, {
        credentials: 'include',
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `usage-by-user-${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: 'Failed to export CSV',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card className="bg-card border-border border-l-2 border-l-primary" data-testid="card-user-analytics-detail">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm text-foreground flex items-center gap-2 flex-wrap">
              <Activity className="w-4 h-4 text-primary" />
              Per-User Analytics — {userLabel}
              {summary?.summary?.top_country && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded-full text-xs text-muted-foreground font-normal">
                  <span>{getFlagEmoji(summary.summary.top_country)}</span>
                  {summary.summary.top_city
                    ? `${summary.summary.top_city}, ${summary.summary.top_country}`
                    : summary.summary.top_country}
                </span>
              )}
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs mt-1">
              Read-only drill-down. Filters apply across summary, chart, models and prompt list.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={range} onValueChange={(v) => { setRange(v); setPage(1); }}>
              <SelectTrigger className="w-[150px] h-8 text-xs bg-muted border-border" data-testid="select-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {range === 'custom' && (
              <>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => { setFrom(e.target.value); setPage(1); }}
                  className="w-[140px] h-8 text-xs bg-muted border-border"
                  data-testid="input-from-date"
                />
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => { setTo(e.target.value); setPage(1); }}
                  className="w-[140px] h-8 text-xs bg-muted border-border"
                  data-testid="input-to-date"
                />
              </>
            )}
            <Select value={model} onValueChange={(v) => { setModel(v); setPage(1); }}>
              <SelectTrigger className="w-[180px] h-8 text-xs bg-muted border-border" data-testid="select-model">
                <SelectValue placeholder="All models" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All models</SelectItem>
                {(models?.models || []).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={searchMode} onValueChange={(v) => { setSearchMode(v); setPage(1); }}>
              <SelectTrigger className="w-[150px] h-8 text-xs bg-muted border-border" data-testid="select-search-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                <SelectItem value="standard">standard</SelectItem>
                <SelectItem value="deep">deep</SelectItem>
                <SelectItem value="calculation_search">calculation_search</SelectItem>
                <SelectItem value="hybrid">hybrid</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExport} disabled={isExporting || !customReady} data-testid="button-export-csv">
              {isExporting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
              Export CSV
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={onClose} data-testid="button-close-detail">
              <X className="w-3 h-3 mr-1" /> Close
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sumLoading ? (
          <div className="py-8 flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading summary…
          </div>
        ) : !summary || !summary.summary ? (
          <div className="py-8 text-center text-muted-foreground text-sm">No data for these filters.</div>
        ) : (
          <SummaryStrip s={summary.summary} formatCostTotal={formatCostTotal} formatCost={formatCost} formatTokens={formatTokens} formatDuration={formatDuration} formatTime={formatTime} />
        )}

        <TimeseriesChart loading={tsLoading} data={ts} formatCostTotal={formatCostTotal} />

        <PerModelTable rows={summary?.by_model || []} formatCost={formatCost} formatTokens={formatTokens} />

        <PromptsTable
          loading={promptsLoading}
          prompts={prompts?.prompts || []}
          total={prompts?.total || 0}
          page={page}
          totalPages={totalPages}
          setPage={setPage}
          formatTokens={formatTokens}
          formatCost={formatCost}
          formatDuration={formatDuration}
          formatTime={formatTime}
        />
      </CardContent>
    </Card>
  );
}

function SummaryStrip({ s, formatCostTotal, formatCost, formatTokens, formatDuration, formatTime }: {
  s: NonNullable<SummaryResp['summary']>;
  formatCostTotal: (n: number) => string;
  formatCost: (n: number) => string;
  formatTokens: (n: number) => string;
  formatDuration: (ms: number) => string;
  formatTime: (ts: number) => string;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-xs">
      <Stat icon={<Activity className="w-3 h-3 text-blue-400" />} label="Prompts" value={String(s.requests)} />
      <Stat icon={<Zap className="w-3 h-3 text-amber-400" />} label="Tokens" value={formatTokens(s.total_tokens)} />
      <Stat icon={<DollarSign className="w-3 h-3 text-emerald-400" />} label="Total cost" value={formatCostTotal(s.total_cost_usd)} accent="emerald" />
      <Stat icon={<DollarSign className="w-3 h-3 text-emerald-400" />} label="Cost / prompt" value={formatCost(s.avg_cost_per_prompt)} />
      <Stat icon={<Clock className="w-3 h-3 text-cyan-400" />} label="Avg latency" value={formatDuration(s.avg_latency_ms)} />
      <Stat icon={<Clock className="w-3 h-3 text-amber-400" />} label="p95 latency" value={formatDuration(s.p95_latency_ms)} accent="amber" />
      <Stat icon={<Zap className="w-3 h-3 text-purple-400" />} label="Throughput" value={`${s.throughput_tps} tok/s`} />
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: 'emerald' | 'amber' }) {
  const cls = accent === 'emerald'
    ? 'text-emerald-600 dark:text-emerald-400'
    : accent === 'amber'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-foreground';
  return (
    <div className="p-2 bg-muted rounded">
      <div className="flex items-center gap-1 text-muted-foreground text-[10px] uppercase">{icon}{label}</div>
      <div className={`font-mono text-sm mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

function TimeseriesChart({ loading, data, formatCostTotal }: { loading: boolean; data?: TimeseriesResp; formatCostTotal: (n: number) => string }) {
  if (loading) {
    return (
      <div className="py-10 flex items-center justify-center text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading chart…
      </div>
    );
  }
  const series = data?.series || [];
  if (!series.length) {
    return <div className="py-6 text-center text-muted-foreground text-xs">No activity in selected range.</div>;
  }
  return (
    <div className="rounded border border-border/40 p-3">
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
        <Activity className="w-3 h-3" /> Activity over time ({data?.bucket} buckets)
      </div>
      <ChartContainer config={TS_CHART_CONFIG} className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="key" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCostTotal(v)} />
            <ReTooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
              formatter={(value: any, name: any) => name === 'total_cost_usd' ? [formatCostTotal(Number(value)), 'Cost'] : [value, 'Requests']}
            />
            <Area yAxisId="left" type="monotone" dataKey="requests" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.2} />
            <Area yAxisId="right" type="monotone" dataKey="total_cost_usd" stroke="#34d399" fill="#34d399" fillOpacity={0.1} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}

function PerModelTable({ rows, formatCost, formatTokens }: { rows: SummaryResp['by_model']; formatCost: (n: number) => string; formatTokens: (n: number) => string }) {
  if (!rows.length) return null;
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
        <Brain className="w-3 h-3 text-purple-400" /> Cost by Model
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/40">
              <th className="text-left py-1.5 px-2">Model</th>
              <th className="text-right py-1.5 px-2">Calls</th>
              <th className="text-right py-1.5 px-2">Tokens</th>
              <th className="text-right py-1.5 px-2">Cost</th>
              <th className="text-right py-1.5 px-2">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.model} className="border-b border-border/30 last:border-0">
                <td className="py-1.5 px-2 text-foreground font-mono">{r.model}</td>
                <td className="text-right py-1.5 px-2 text-muted-foreground font-mono">{r.calls}</td>
                <td className="text-right py-1.5 px-2 text-muted-foreground font-mono">{formatTokens(r.tokens)}</td>
                <td className="text-right py-1.5 px-2 text-emerald-600 dark:text-emerald-400 font-mono">{formatCost(r.cost_usd)}</td>
                <td className="text-right py-1.5 px-2 text-muted-foreground font-mono">{r.share_pct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PromptsTable({ loading, prompts, total, page, totalPages, setPage, formatTokens, formatCost, formatDuration, formatTime }: {
  loading: boolean;
  prompts: PromptsResp['prompts'];
  total: number;
  page: number;
  totalPages: number;
  setPage: (n: number) => void;
  formatTokens: (n: number) => string;
  formatCost: (n: number) => string;
  formatDuration: (ms: number) => string;
  formatTime: (ts: number) => string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2"><Activity className="w-3 h-3" /> Prompts ({total})</span>
        <span>Page {page} / {totalPages}</span>
      </div>
      {loading ? (
        <div className="py-8 flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading prompts…
        </div>
      ) : prompts.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground text-xs">No prompts in selected range.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/40">
                <th className="text-left py-1.5 px-2">When</th>
                <th className="text-left py-1.5 px-2">Query</th>
                <th className="text-left py-1.5 px-2">Mode</th>
                <th className="text-left py-1.5 px-2">Model</th>
                <th className="text-right py-1.5 px-2">Tokens</th>
                <th className="text-right py-1.5 px-2">Latency</th>
                <th className="text-right py-1.5 px-2">tok/s</th>
                <th className="text-right py-1.5 px-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map(p => (
                <tr key={p.request_id} className="border-b border-border/30 last:border-0 hover:bg-muted/40">
                  <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{formatTime(p.timestamp)}</td>
                  <td className="py-1.5 px-2 text-foreground max-w-[300px] truncate" title={p.query}>
                    {p.query
                      ? <a href={`/deepsearch?q=${encodeURIComponent(p.query)}`} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-primary cursor-pointer">{p.query}</a>
                      : '—'}
                  </td>
                  <td className="py-1.5 px-2 text-cyan-600 dark:text-cyan-400">{p.search_mode}</td>
                  <td className="py-1.5 px-2 text-muted-foreground font-mono">{p.primary_model || '—'}</td>
                  <td className="text-right py-1.5 px-2 text-muted-foreground font-mono">{formatTokens(p.total_tokens)}</td>
                  <td className="text-right py-1.5 px-2 text-muted-foreground font-mono">{formatDuration(p.duration_ms)}</td>
                  <td className="text-right py-1.5 px-2 text-muted-foreground font-mono">{p.throughput_tps}</td>
                  <td className="text-right py-1.5 px-2 text-emerald-600 dark:text-emerald-400 font-mono">{formatCost(p.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-end gap-2 mt-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} data-testid="button-prev-page">
          Prev
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} data-testid="button-next-page">
          Next
        </Button>
      </div>
    </div>
  );
}
