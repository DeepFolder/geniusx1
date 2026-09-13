import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, RotateCcw, Save, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { PromptFixture } from './types';

const DEFAULT_FIXTURES: PromptFixture[] = [
  { id: 'F01_simple_lookup', prompt: 'find DIN 7984 M6×70 hex socket cap screws property class 8.8 with zinc plating — must not be black oxide finish, not stainless steel', expectedIntent: 'product_search', expectedDomain: 'mechanical', expectsProductCards: true, expectsBOM: false, expectsCalculation: false, expectsBlock: false },
  { id: 'F02_bom_build', prompt: 'build a BOM for an industrial machine vision quality inspection cell: area scan camera, telecentric lens, LED ring light, frame grabber, and fanless industrial PC', expectedIntent: 'build', expectedDomain: 'consumer_electronics', expectsProductCards: false, expectsBOM: true, expectsCalculation: false, expectsBlock: false },
  { id: 'F03_engineering_calc', prompt: 'calculate fatigue safety factor for a 42CrMo4 steel shaft under 500 N·m fully reversed bending at 1500 RPM, then find shaft couplings rated for this torque', expectedIntent: 'calculation_search', expectedDomain: 'mechanical', expectsProductCards: true, expectsBOM: false, expectsCalculation: true, expectsBlock: false },
  { id: 'F04_comparison', prompt: 'compare PT100 vs Type-K thermocouple for temperature measurement accuracy between –50 °C and +200 °C in a food processing environment', expectedIntent: 'comparison', expectedDomain: 'mechanical', expectsProductCards: true, expectsBOM: false, expectsCalculation: false, expectsBlock: false },
  { id: 'F05_multi_turn_follow_up', prompt: 'show me only options with IP65 or higher protection rating', expectedIntent: 'follow_up', expectedDomain: 'mechanical', expectsProductCards: true, expectsBOM: false, expectsCalculation: false, expectsBlock: false },
  { id: 'F06_datasheet_spec_query', prompt: 'what is the maximum input speed and duty cycle limit of this actuator?', expectedIntent: 'explanation', expectedDomain: 'mechanical', expectsProductCards: false, expectsBOM: false, expectsCalculation: false, expectsBlock: false },
  { id: 'F07_manufacturer_discovery', prompt: 'who manufactures linear encoders for CNC machine tools in Europe? List the main suppliers', expectedIntent: 'product_search', expectedDomain: 'electrical', expectsProductCards: true, expectsBOM: false, expectsCalculation: false, expectsBlock: false },
  { id: 'F08_ambiguous_query', prompt: 'something compact and high-precision', expectedIntent: 'product_search', expectedDomain: 'general', expectsProductCards: false, expectsBOM: false, expectsCalculation: false, expectsBlock: false },
  { id: 'F09_off_topic', prompt: 'it is time to go to bed', expectedIntent: 'off_topic', expectedDomain: 'general', expectsProductCards: false, expectsBOM: false, expectsCalculation: false, expectsBlock: true },
  { id: 'F10_long_multi_constraint', prompt: 'find a linear actuator with 30 kN push-pull load capacity, 700 mm stroke, 120 mm/s maximum speed, ball screw driven, IP65 protection, suitable for 100% duty cycle with end-of-stroke position sensing, delivery in Europe', expectedIntent: 'product_search', expectedDomain: 'mechanical', expectsProductCards: true, expectsBOM: false, expectsCalculation: false, expectsBlock: false },
];

export default function BenchmarkPrompts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const { data } = useQuery<{ prompts: PromptFixture[] | null; isOverride: boolean }>({
    queryKey: ['/api/openai/admin/benchmark-prompts'],
    queryFn: () => fetch('/api/openai/admin/benchmark-prompts', { credentials: 'include' }).then(r => r.json()),
  });

  const prompts: PromptFixture[] = data?.prompts ?? DEFAULT_FIXTURES;

  const save = useMutation({
    mutationFn: (updated: PromptFixture[]) => apiRequest('PUT', '/api/openai/admin/benchmark-prompts', { prompts: updated }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/openai/admin/benchmark-prompts'] }); toast({ title: 'Prompts saved' }); setEditingId(null); },
    onError: () => toast({ title: 'Failed to save', variant: 'destructive' }),
  });

  const reset = useMutation({
    mutationFn: () => fetch('/api/openai/admin/benchmark-prompts', { method: 'DELETE', credentials: 'include' }).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/openai/admin/benchmark-prompts'] }); toast({ title: 'Reset to defaults' }); },
  });

  const startEdit = (f: PromptFixture) => { setEditingId(f.id); setEditText(f.prompt); };
  const cancelEdit = () => setEditingId(null);
  const commitEdit = (f: PromptFixture) => {
    const updated = prompts.map(p => p.id === f.id ? { ...p, prompt: editText } : p);
    save.mutate(updated);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{data?.isOverride ? '⚠ Custom overrides active' : 'Default fixtures'}</span>
        {data?.isOverride && (
          <Button size="sm" variant="outline" onClick={() => reset.mutate()} disabled={reset.isPending}
            className="h-7 text-xs">
            <RotateCcw className="w-3 h-3 mr-1" />Reset to defaults
          </Button>
        )}
      </div>
      <div className="space-y-1.5">
        {prompts.map(f => (
          <div key={f.id} className="border border-border/60 rounded-lg px-4 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-muted-foreground">{f.id}</span>
                  <span className="text-xs text-muted-foreground/60">{f.expectedIntent} · {f.expectedDomain}</span>
                </div>
                {editingId === f.id ? (
                  <div className="space-y-2">
                    <Textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3}
                      className="text-xs resize-none" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => commitEdit(f)} disabled={save.isPending} className="h-7 text-xs">
                        <Save className="w-3 h-3 mr-1" />Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 text-xs text-muted-foreground">
                        <X className="w-3 h-3 mr-1" />Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground leading-snug">{f.prompt}</p>
                )}
              </div>
              {editingId !== f.id && (
                <Button size="sm" variant="ghost" onClick={() => startEdit(f)} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground shrink-0">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
