import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Play, Square, ChevronDown, ChevronRight } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface StatusResp { running: boolean; jobId: string | null; exitCode: number | null }

export default function BenchmarkRunner({ onComplete }: { onComplete: () => void }) {
  const { toast } = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [open, setOpen] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  const { data: status, refetch: refetchStatus } = useQuery<StatusResp>({
    queryKey: ['/api/openai/admin/benchmark-status'],
    refetchInterval: streaming ? 2000 : false,
  });

  const trigger = useMutation({
    mutationFn: () => apiRequest('/api/openai/admin/benchmark/trigger', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: async (data: any) => {
      if (data?.error) { toast({ title: data.error, variant: 'destructive' }); return; }
      setJobId(data.jobId); setLogs([]); setOpen(true); setStreaming(true);
      startStream(data.jobId);
    },
    onError: () => toast({ title: 'Failed to start benchmark', variant: 'destructive' }),
  });

  const startStream = (jid: string) => {
    fetch(`/api/openai/admin/benchmark/stream/${jid}`, { credentials: 'include' })
      .then(async res => {
        if (!res.body) return;
        const reader = res.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            const line = part.replace(/^data: /, '').trim();
            if (!line) continue;
            try {
              const msg = JSON.parse(line);
              if (msg.log) setLogs(prev => [...prev, msg.log]);
              if (msg.done) { setStreaming(false); refetchStatus(); onComplete(); }
            } catch {}
          }
        }
        setStreaming(false); refetchStatus(); onComplete();
      })
      .catch(() => setStreaming(false));
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const isRunning = streaming || (status?.running ?? false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/60">
        <div className="flex items-center gap-3">
          <button onClick={() => setOpen(o => !o)} className="text-muted-foreground hover:text-foreground">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <span className="text-sm font-medium text-foreground">Benchmark Runner</span>
          {isRunning && <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />Running…</span>}
          {!isRunning && logs.length > 0 && <span className="text-xs text-muted-foreground">{logs.length} log lines</span>}
        </div>
        <Button size="sm" disabled={isRunning || trigger.isPending}
          onClick={() => trigger.mutate()}
          className="h-7 text-xs">
          {isRunning ? <Square className="w-3 h-3 mr-1" /> : <Play className="w-3 h-3 mr-1" />}
          {isRunning ? 'Running…' : 'Run Benchmark'}
        </Button>
      </div>
      {open && (
        <div ref={logRef} className="h-56 overflow-y-auto bg-black dark:bg-black p-3 font-mono text-xs text-slate-300 space-y-0.5">
          {logs.length === 0
            ? <p className="text-slate-500">Press "Run Benchmark" to start. Logs appear here in real time.</p>
            : logs.map((l, i) => (
              <div key={i} className={`leading-5 ${l.startsWith('[err]') ? 'text-red-400' : l.startsWith('[done]') ? 'text-emerald-400 font-semibold' : ''}`}>{l}</div>
            ))}
        </div>
      )}
    </div>
  );
}
