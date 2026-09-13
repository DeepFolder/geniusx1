import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DateRange, PromptFixture } from './types';

type Preset = 'last_month' | 'year' | 'all' | 'custom';

interface Props {
  fixtureId: string;
  setFixtureId: (v: string) => void;
  range: DateRange;
  setRange: (r: DateRange) => void;
  preset: Preset;
  setPreset: (p: Preset) => void;
  fixtures: PromptFixture[];
}

function presetRange(p: Preset): DateRange {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  if (p === 'last_month') {
    const from = new Date(now); from.setDate(from.getDate() - 30);
    return { dateFrom: from.toISOString().split('T')[0], dateTo: to };
  }
  if (p === 'year') {
    const from = new Date(now); from.setFullYear(from.getFullYear() - 1);
    return { dateFrom: from.toISOString().split('T')[0], dateTo: to };
  }
  return { dateFrom: '', dateTo: '' };
}

export function presetToRange(p: Preset): DateRange { return presetRange(p); }

export default function BenchmarkFilters({ fixtureId, setFixtureId, range, setRange, preset, setPreset, fixtures }: Props) {
  const setP = (p: Preset) => { setPreset(p); if (p !== 'custom') setRange(presetRange(p)); };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={fixtureId || '__all__'} onValueChange={v => setFixtureId(v === '__all__' ? '' : v)}>
        <SelectTrigger className="w-52 text-xs h-8">
          <SelectValue placeholder="All fixtures" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" className="text-xs">All fixtures</SelectItem>
          {fixtures.map(f => (
            <SelectItem key={f.id} value={f.id} className="text-xs">{f.id} — {f.prompt.slice(0, 40)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex gap-1">
        {(['last_month', 'year', 'all', 'custom'] as Preset[]).map(p => (
          <Button key={p} size="sm" variant={preset === p ? 'default' : 'outline'}
            className="h-8 text-xs px-3"
            onClick={() => setP(p)}>
            {p === 'last_month' ? 'Last 30d' : p === 'year' ? 'Year' : p === 'all' ? 'All time' : 'Custom'}
          </Button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <Input type="date" value={range.dateFrom} onChange={e => setRange({ ...range, dateFrom: e.target.value })}
            className="h-8 text-xs w-36" />
          <span className="text-muted-foreground text-xs">to</span>
          <Input type="date" value={range.dateTo} onChange={e => setRange({ ...range, dateTo: e.target.value })}
            className="h-8 text-xs w-36" />
        </div>
      )}
    </div>
  );
}
