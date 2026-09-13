import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import BenchmarkRunRow from './benchmark-run-row';
import type { BenchmarkListResponse, DateRange } from './types';

interface Props {
  fixtureId: string;
  range: DateRange;
  page: number;
  setPage: (p: number) => void;
}

export default function BenchmarkRunList({ fixtureId, range, page, setPage }: Props) {
  const params = new URLSearchParams({ page: String(page), perPage: '25' });
  if (fixtureId) params.set('fixtureId', fixtureId);
  if (range.dateFrom) params.set('dateFrom', range.dateFrom);
  if (range.dateTo) params.set('dateTo', range.dateTo);

  const { data, isLoading } = useQuery<BenchmarkListResponse>({
    queryKey: ['/api/openai/admin/benchmarks', fixtureId, range.dateFrom, range.dateTo, page],
    queryFn: () => fetch(`/api/openai/admin/benchmarks?${params}`, { credentials: 'include' }).then(r => r.json()),
  });

  if (isLoading) return <div className="text-muted-foreground text-sm py-8 text-center">Loading…</div>;
  if (!data?.runs?.length) return <div className="text-muted-foreground text-sm py-8 text-center">No benchmark runs found.</div>;

  const { runs, total, totalPages } = data;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{total} run{total !== 1 ? 's' : ''}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="h-7 w-7 p-0">
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}
            className="h-7 w-7 p-0">
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        {runs.map((run, i) => (
          <BenchmarkRunRow key={run.id} run={run} index={i} total={(page - 1) * 25 + runs.length} prevRun={runs[i + 1]} />
        ))}
      </div>
    </div>
  );
}
