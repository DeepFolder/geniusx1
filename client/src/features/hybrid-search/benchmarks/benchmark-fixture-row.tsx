import { useState } from 'react';
import { CheckCircle2, XCircle, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import type { FixtureReport } from './types';

function pct(n: number) { return `${(n * 100).toFixed(0)}%`; }
function ms(n: number | null | undefined) { return n == null ? '—' : `${Math.round(n)}`; }
function tok(n: number | null | undefined) { return n == null ? '—' : `${n}`; }
function qColor(s: number) {
  return s >= 0.8 ? 'text-emerald-600 dark:text-emerald-400'
    : s >= 0.6 ? 'text-amber-600 dark:text-amber-400'
    : 'text-red-600 dark:text-red-400';
}
function dMs(c: number | null | undefined, p: number | null | undefined) {
  if (c == null || p == null) return null;
  const d = c - p;
  if (d === 0) return null;
  return { text: `${d > 0 ? '+' : ''}${Math.round(d)}`, good: d < 0 };
}
function dTok(c: number | null | undefined, p: number | null | undefined) {
  if (c == null || p == null) return null;
  const d = c - p;
  if (d === 0) return null;
  return { text: `${d > 0 ? '+' : ''}${d}`, good: d < 0 };
}
function dPct(c: number | null | undefined, p: number | null | undefined) {
  if (c == null || p == null) return null;
  const d = (c - p) * 100;
  if (Math.abs(d) < 0.5) return null;
  return { text: `${d > 0 ? '+' : ''}${d.toFixed(1)}%`, good: d > 0 };
}
function Delta({ d }: { d: { text: string; good: boolean } | null }) {
  if (!d) return null;
  return <span className={`ml-1 text-[10px] ${d.good ? 'text-emerald-500' : 'text-red-500'}`}>{d.text}</span>;
}
function MatchIcon({ m }: { m: boolean | null | undefined }) {
  if (m === true) return <CheckCircle2 className="inline w-3 h-3 text-emerald-500" />;
  if (m === false) return <XCircle className="inline w-3 h-3 text-red-500" />;
  return <span className="text-muted-foreground">—</span>;
}

const COLS = [
  { key: 'id',          label: 'Fixture',      w: 'minmax(11rem, 1fr)' },
  { key: 'quality',     label: 'Quality',      w: '4.5rem' },
  { key: 'valid',       label: 'Valid',        w: '3rem'   },
  { key: 'classifyMs',  label: 'Classify',     w: '4.5rem' },
  { key: 'classifyTok', label: 'CL tok',       w: '4rem'   },
  { key: 'discoveryMs', label: 'Discovery',    w: '5rem'   },
  { key: 'discoveryTok',label: 'DC tok',       w: '4rem'   },
  { key: 'firstStatus', label: '1st status',   w: '5rem'   },
  { key: 'firstToken',  label: '1st token',    w: '5rem'   },
  { key: 'firstCard',   label: '1st card',     w: '5rem'   },
  { key: 'streamMs',    label: 'Stream',       w: '5rem'   },
  { key: 'streamTok',   label: 'ST tok',       w: '4rem'   },
  { key: 'totalMs',     label: 'Total',        w: '5rem'   },
  { key: 'totalTok',    label: 'Total tok',    w: '4.5rem' },
  { key: 'latency',     label: 'Latency',      w: '4.5rem' },
  { key: 'throughput',  label: 'Tput tok/s',   w: '5rem'   },
  { key: 'intent',      label: 'Intent',       w: '8rem'   },
  { key: 'domain',      label: 'Domain',       w: '7rem'   },
  { key: 'ended',       label: 'Ended',        w: '4.5rem' },
];

const GRID = COLS.map(c => c.w).join(' ');
const MIN_W = '88rem';

export function FixtureTableHeader() {
  return (
    <div className="grid gap-2 px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground font-medium border-b border-border/60 bg-muted/40 sticky top-0"
      style={{ gridTemplateColumns: GRID, minWidth: MIN_W }}>
      {COLS.map(c => <div key={c.key} className="truncate">{c.label}</div>)}
    </div>
  );
}

interface Props {
  f: FixtureReport;
  prev?: FixtureReport;
  compare: boolean;
}

export default function FixtureDetailRow({ f, prev, compare }: Props) {
  const [open, setOpen] = useState(false);
  const cmp = compare && prev ? prev : undefined;
  const cls = f.stages.classify;
  const disc = f.stages.manufacturerDiscovery;
  const ag = f.stages.agent;
  const pCls = cmp?.stages.classify;
  const pDisc = cmp?.stages.manufacturerDiscovery;
  const pAg = cmp?.stages.agent;
  const out = f.outcomes;
  const hasErr = !!(f.errorRecord || f.error);
  const ended = f.streamStats.endedWith ?? (f.streamStats.hasResult ? 'result' : f.streamStats.hasError ? 'error' : 'none');

  return (
    <div className={`border-b border-border/40 last:border-0 ${hasErr ? 'bg-red-500/5' : ''}`}>
      <button onClick={() => setOpen(o => !o)}
        className="grid gap-2 items-center px-3 py-2 text-xs hover:bg-muted/40 transition-colors w-full text-left"
        style={{ gridTemplateColumns: GRID, minWidth: MIN_W }}>
        <div className="flex items-center gap-1.5 min-w-0">
          {open ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
          <div className="min-w-0">
            <div className="font-mono text-foreground truncate">{f.id}</div>
            <div className="text-muted-foreground text-[10px] truncate" title={f.prompt}>{f.prompt}</div>
          </div>
        </div>
        <div><span className={`font-mono font-semibold ${qColor(f.quality.total)}`}>{pct(f.quality.total)}</span><Delta d={dPct(f.quality.total, cmp?.quality.total)} /></div>
        <div>{f.streamValid ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500" />}</div>

        <NumCell value={ms(cls?.durationMs)} suffix="ms" delta={dMs(cls?.durationMs, pCls?.durationMs)} />
        <NumCell value={tok(cls?.tokens)}    suffix=""   delta={dTok(cls?.tokens, pCls?.tokens)} />
        <NumCell value={ms(disc?.durationMs)} suffix="ms" delta={dMs(disc?.durationMs, pDisc?.durationMs)} />
        <NumCell value={tok(disc?.tokens)}    suffix=""   delta={dTok(disc?.tokens, pDisc?.tokens)} />
        <NumCell value={ms(f.stages.streamToFirstStatus?.durationMs)}      suffix="ms" delta={dMs(f.stages.streamToFirstStatus?.durationMs, cmp?.stages.streamToFirstStatus?.durationMs)} />
        <NumCell value={ms(f.stages.streamToFirstToken?.durationMs)}       suffix="ms" delta={dMs(f.stages.streamToFirstToken?.durationMs, cmp?.stages.streamToFirstToken?.durationMs)} />
        <NumCell value={ms(f.stages.streamToFirstProductCard?.durationMs)} suffix="ms" delta={dMs(f.stages.streamToFirstProductCard?.durationMs, cmp?.stages.streamToFirstProductCard?.durationMs)} />
        <NumCell value={ms(ag?.durationMs)} suffix="ms" delta={dMs(ag?.durationMs, pAg?.durationMs)} />
        <NumCell value={tok(ag?.tokens)}    suffix=""   delta={dTok(ag?.tokens, pAg?.tokens)} />
        <NumCell value={ms(f.totalDurationMs)} suffix="ms" delta={dMs(f.totalDurationMs, cmp?.totalDurationMs)} />
        <NumCell value={tok(f.totalTokens)}    suffix=""   delta={dTok(f.totalTokens, cmp?.totalTokens)} />
        <NumCell value={ms(f.latencyMs)} suffix="ms" delta={dMs(f.latencyMs, cmp?.latencyMs)} />
        <NumCell value={f.throughputTokensPerSec != null ? f.throughputTokensPerSec.toFixed(1) : '—'} suffix={f.throughputTokensPerSec != null ? '/s' : ''} delta={dTok(f.throughputTokensPerSec != null ? Math.round(f.throughputTokensPerSec) : null, cmp?.throughputTokensPerSec != null ? Math.round(cmp.throughputTokensPerSec) : null)} />

        <div className="flex items-center gap-1 min-w-0">
          <MatchIcon m={out?.intent.match ?? null} />
          <span className="truncate text-foreground" title={`${out?.intent.predicted ?? cls?.intent ?? '—'} vs ${f.expectedIntent}`}>
            {out?.intent.predicted ?? cls?.intent ?? '—'}
          </span>
        </div>
        <div className="flex items-center gap-1 min-w-0">
          <MatchIcon m={out?.domain.match ?? null} />
          <span className="truncate text-foreground" title={`${out?.domain.predicted ?? cls?.domain ?? '—'} vs ${f.expectedDomain}`}>
            {out?.domain.predicted ?? cls?.domain ?? '—'}
          </span>
        </div>
        <div className={`text-[11px] ${ended === 'error' ? 'text-red-500' : ended === 'result' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{ended}</div>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 text-[11px] space-y-2 bg-muted/20" style={{ minWidth: MIN_W }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
            <Kv k="Intent (pred)"    v={out?.intent.predicted ?? cls?.intent ?? '—'} match={out?.intent.match} />
            <Kv k="Intent (exp)"     v={f.expectedIntent} />
            <Kv k="Domain (pred)"    v={out?.domain.predicted ?? cls?.domain ?? '—'} match={out?.domain.match} />
            <Kv k="Domain (exp)"     v={f.expectedDomain} />
            {(out?.followUpAnswerType.expected || f.expectedFollowUpAnswerType) && (
              <>
                <Kv k="Follow-up (pred)" v={out?.followUpAnswerType.predicted ?? cls?.follow_up_answer_type ?? '—'} match={out?.followUpAnswerType.match} />
                <Kv k="Follow-up (exp)"  v={out?.followUpAnswerType.expected ?? f.expectedFollowUpAnswerType ?? '—'} />
              </>
            )}
            {(out?.calculationMode.expected || f.expectedCalculationMode) && (
              <>
                <Kv k="Calc mode (pred)" v={out?.calculationMode.predicted ?? cls?.calculation_mode ?? '—'} match={out?.calculationMode.match} />
                <Kv k="Calc mode (exp)"  v={out?.calculationMode.expected ?? f.expectedCalculationMode ?? '—'} />
              </>
            )}
            <Kv k="Classifier confidence" v={cls?.confidence != null ? cls.confidence.toFixed(2) : '—'} />
            <Kv k="Manufacturers found"   v={disc?.manufacturerCount != null ? String(disc.manufacturerCount) : '—'} />
            <Kv k="Stream events"         v={String(f.streamStats.totalEvents)} />
            <Kv k="Status events"         v={String(f.streamStats.statusCount)} />
            <Kv k="Token events"          v={String(f.streamStats.tokenCount)} />
            <Kv k="Product cards"         v={String(f.streamStats.productCardCount)} />
            <Kv k="Has result"            v={f.streamStats.hasResult ? 'yes' : 'no'} />
            <Kv k="Ended with"            v={ended} />
          </div>

          {hasErr && (
            <div className="mt-2 p-2 rounded bg-red-500/10 text-red-700 dark:text-red-300">
              <div className="font-medium mb-1">
                Error · stage: {f.errorRecord?.stage ?? 'unknown'}
              </div>
              <pre className="whitespace-pre-wrap break-words text-[10.5px] leading-snug">
                {f.errorRecord?.message ?? f.error}
                {f.errorRecord?.stackSnippet ? `\n\n${f.errorRecord.stackSnippet}` : ''}
              </pre>
            </div>
          )}

          {f.streamErrors.length > 0 && !hasErr && (
            <div className="mt-2 p-2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <div className="font-medium mb-1">Stream validation issues</div>
              <ul className="list-disc list-inside text-[10.5px]">
                {f.streamErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NumCell({ value, suffix, delta }: { value: string; suffix: string; delta: { text: string; good: boolean } | null }) {
  return (
    <div className="font-mono text-foreground whitespace-nowrap">
      {value}{value !== '—' && suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
      <Delta d={delta} />
    </div>
  );
}

function Kv({ k, v, match }: { k: string; v: string; match?: boolean | null }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-muted-foreground shrink-0">{k}:</span>
      {match !== undefined && <MatchIcon m={match ?? null} />}
      <span className="text-foreground truncate" title={v}>{v}</span>
    </div>
  );
}
