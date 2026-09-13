import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import BenchmarkRunner from './benchmark-runner';
import BenchmarkFilters, { presetToRange } from './benchmark-filters';
import BenchmarkChart from './benchmark-chart';
import BenchmarkRunList from './benchmark-run-list';
import BenchmarkPrompts from './benchmark-prompts';
import type { DateRange, PromptFixture } from './types';

type Preset = 'last_month' | 'year' | 'all' | 'custom';
type Section = 'runs' | 'chart' | 'prompts';

export default function BenchmarksTab() {
  const [fixtureId, setFixtureId] = useState('');
  const [preset, setPreset] = useState<Preset>('last_month');
  const [range, setRange] = useState<DateRange>(presetToRange('last_month'));
  const [page, setPage] = useState(1);
  const [section, setSection] = useState<Section>('runs');
  const [listKey, setListKey] = useState(0);

  const { data: promptsData } = useQuery<{ prompts: PromptFixture[] | null }>({
    queryKey: ['/api/openai/admin/benchmark-prompts'],
    queryFn: () => fetch('/api/openai/admin/benchmark-prompts', { credentials: 'include' }).then(r => r.json()),
  });

  const fixtures: PromptFixture[] = promptsData?.prompts ?? [];

  const handleFilterChange = (id: string) => { setFixtureId(id); setPage(1); };
  const handleRangeChange = (r: DateRange) => { setRange(r); setPage(1); };
  const handlePresetChange = (p: Preset) => { setPreset(p); setPage(1); };

  const tabs: { id: Section; label: string }[] = [
    { id: 'runs', label: 'Run History' },
    { id: 'chart', label: 'Progress Chart' },
    { id: 'prompts', label: 'Prompt Fixtures' },
  ];

  return (
    <div className="space-y-5 text-foreground">
      <BenchmarkRunner onComplete={() => setListKey(k => k + 1)} />

      <div className="flex gap-1 border-b border-border pb-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setSection(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              section === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {section !== 'prompts' && (
        <BenchmarkFilters
          fixtureId={fixtureId} setFixtureId={handleFilterChange}
          range={range} setRange={handleRangeChange}
          preset={preset} setPreset={handlePresetChange}
          fixtures={fixtures}
        />
      )}

      {section === 'chart' && <BenchmarkChart fixtureId={fixtureId} range={range} />}

      {section === 'runs' && (
        <BenchmarkRunList key={listKey} fixtureId={fixtureId} range={range} page={page} setPage={setPage} />
      )}

      {section === 'prompts' && <BenchmarkPrompts />}
    </div>
  );
}
