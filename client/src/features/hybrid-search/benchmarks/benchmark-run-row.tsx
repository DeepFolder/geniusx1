import { useState } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2, AlertCircle } from 'lucide-react';
import type { BenchmarkRun, FixtureReport } from './types';
import FixtureDetailRow, { FixtureTableHeader } from './benchmark-fixture-row';

function pct(n: number) { return `${(n * 100).toFixed(0)}%`; }
function ms(n: number | null | undefined) { return n == null ? '—' : `${Math.round(n)}ms`; }
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function qColor(s: number) {
  return s >= 0.8 ? 'text-emerald-600 dark:text-emerald-400'
    : s >= 0.6 ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';
}

interface Props {
  run: BenchmarkRun;
  index: number;
  total: number;
  prevRun?: BenchmarkRun;
}

export default function BenchmarkRunRow({ run, index, total, prevRun }: Props) {
  const [open, setOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const agg = run.aggregate;
  const fixtures = Array.isArray(run.fixtures) ? run.fixtures as FixtureReport[] : [];
  const prevByFixture = new Map<string, FixtureReport>();
  for (const f of (prevRun?.fixtures ?? [])) prevByFixture.set(f.id, f);

  const stageErrors = agg.perStageErrors;

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors text-left">
        <span className="text-muted-foreground font-mono text-xs w-8 shrink-0">#{total - index}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <span className="text-muted-foreground text-xs shrink-0 w-36">{fmtDate(run.runAt)}</span>
        <span className={`font-mono font-semibold text-sm shrink-0 w-16 ${qColor(agg.avgQualityScore)}`}>{pct(agg.avgQualityScore)}</span>
        <div className="flex gap-x-4 gap-y-1 text-xs text-muted-foreground flex-1 flex-wrap">
          <span>Intent <span className="text-foreground">{pct(agg.intentAccuracy)}</span></span>
          <span>Domain <span className="text-foreground">{pct(agg.domainAccuracy)}</span></span>
          {agg.followUpAnswerTypeAccuracy != null && (
            <span title={`Follow-up sub-type accuracy (${agg.followUpFixtureCount ?? '?'} fixtures)`}>
              Follow-up <span className="text-foreground">{pct(agg.followUpAnswerTypeAccuracy)}</span>
            </span>
          )}
          <span>1st token <span className="text-foreground">{ms(agg.avgStreamToFirstTokenMs)}</span></span>
          {agg.avgStreamToFirstProductCardMs != null && (
            <span>1st card <span className="text-foreground">{ms(agg.avgStreamToFirstProductCardMs)}</span></span>
          )}
          {agg.avgTotalDurationMs != null && (
            <span>Total <span className="text-foreground">{ms(agg.avgTotalDurationMs)}</span></span>
          )}
          {agg.avgTotalTokens != null && (
            <span>Tokens <span className="text-foreground">{agg.avgTotalTokens}</span></span>
          )}
          <span>Streams <span className="text-foreground">{agg.validStreamCount}/{run.fixtureCount}</span></span>
          {agg.errorRate != null && (
            <span>Err rate <span className="text-foreground">{pct(agg.errorRate)}</span></span>
          )}
          {agg.avgLatencyMs != null && (
            <span title="Avg time-to-first-token latency">Latency <span className="text-foreground">{ms(agg.avgLatencyMs)}</span></span>
          )}
          {agg.avgThroughputTokensPerSec != null && (
            <span title="Avg streaming throughput (output tokens / stream duration)">Tput <span className="text-foreground">{agg.avgThroughputTokensPerSec.toFixed(1)} tok/s</span></span>
          )}
        </div>
        {agg.errorCount > 0
          ? <span className="flex items-center gap-1 text-xs text-red-500 shrink-0" title={stageErrors ? `classify=${stageErrors.classify} discovery=${stageErrors.discovery} stream=${stageErrors.stream} scorer=${stageErrors.scorer}` : undefined}>
              <AlertCircle className="w-3 h-3" />{agg.errorCount}
            </span>
          : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
      </button>

      {open && fixtures.length > 0 && (
        <div className="border-t border-border/60 bg-muted/30">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 text-[11px] text-muted-foreground">
            <span>{fixtures.length} fixture{fixtures.length === 1 ? '' : 's'}{stageErrors ? ` · errors: classify ${stageErrors.classify} · discovery ${stageErrors.discovery} · stream ${stageErrors.stream} · scorer ${stageErrors.scorer}` : ''}</span>
            {prevRun ? (
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} className="h-3 w-3 accent-primary" />
                Compare with previous run ({fmtDate(prevRun.runAt)})
              </label>
            ) : (
              <span className="italic">No previous run to compare</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <FixtureTableHeader />
            {fixtures.map(f => (
              <FixtureDetailRow key={f.id} f={f} prev={prevByFixture.get(f.id)} compare={compare} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
