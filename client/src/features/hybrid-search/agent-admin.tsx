import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Save, RotateCcw, Settings, Bot, Sparkles, Search, Database, ArrowLeft, Code2, AlertCircle, CheckCircle2, Shield, Brain, BarChart3, Clock, Zap, Users, Globe, Activity, RefreshCw, History, Trash2, DollarSign, Calendar, TrendingUp, ArrowUpDown, MessageSquare, Building2, UserCheck, Plus, Pencil, X, ChevronDown, ChevronRight } from 'lucide-react';
import BenchmarksTab from './benchmarks/index';
import AdminFeedbackList from '@/components/admin/AdminFeedbackList';
import PlatformAdmin from '@/components/admin/platform-admin';
import AccessRequests from '@/components/admin/AccessRequests';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { UserAnalyticsDetail } from './user-analytics-detail';
import { GeoStatsPanel, type GeoEntry } from './GeoStatsPanel';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import {
  ComposedChart,
  Bar,
  Line,
  BarChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface AgentSettings {
  id?: number;
  name: string;
  instructions: string;
  model: string;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high';
  reasoningSummary: 'auto' | 'concise' | 'detailed' | 'none';
  storeEnabled: boolean;
  webSearchEnabled: boolean;
  searchContextSize: 'low' | 'medium' | 'high';
  temperature: number;
  maxTokens: number;
  outputSchema: string;
  guardrailsEnabled: boolean;
  guardrailsConfig: string;
  topicRestrictionEnabled: boolean;
  topicRestrictionMessage: string;
  allowedTopics: string[];
  systemInstructionPct: number;
  fluidMemoryPct: number;
  conversationPct: number;
  compactionThresholdPct: number;
  compactionModel: string;
}

const K = 1000;
const M = 1000 * 1000;

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5.4': 200 * K,
  'gpt-5.2': 200 * K,
  'gpt-5.2-chat-latest': 200 * K,
  'gpt-5.2-codex': 200 * K,
  'gpt-5.2-pro': 200 * K,
  'gpt-5.1': 200 * K,
  'gpt-5.1-chat-latest': 200 * K,
  'gpt-5.1-codex-max': 200 * K,
  'gpt-5.1-codex': 200 * K,
  'gpt-5.1-codex-mini': 200 * K,
  'gpt-5': 128 * K,
  'gpt-5-chat-latest': 128 * K,
  'gpt-5-codex': 128 * K,
  'gpt-5-mini': 128 * K,
  'gpt-5-nano': 128 * K,
  'gpt-5-pro': 128 * K,
  'gpt-5-search-api': 128 * K,
  'gpt-4.1': 1 * M,
  'gpt-4.1-mini': 1 * M,
  'gpt-4.1-nano': 1 * M,
  'gpt-4o': 128 * K,
  'gpt-4o-2024-05-13': 128 * K,
  'gpt-4o-mini': 128 * K,
  'gpt-4o-search-preview': 128 * K,
  'gpt-4o-mini-search-preview': 128 * K,
  'o1': 200 * K,
  'o1-mini': 128 * K,
  'o1-pro': 200 * K,
  'o3': 200 * K,
  'o3-mini': 200 * K,
  'o3-pro': 200 * K,
  'o3-deep-research': 200 * K,
  'o4-mini': 200 * K,
  'o4-mini-deep-research': 200 * K,
  'codex-mini-latest': 200 * K,
  'computer-use-preview': 128 * K,
};

const DEFAULT_CONTEXT_WINDOW = 128 * K;

function getModelContextWindow(model: string): number {
  if (!model) return DEFAULT_CONTEXT_WINDOW;
  if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model];
  const lower = model.toLowerCase();
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (lower.startsWith(key.toLowerCase())) return value;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000).toLocaleString()}K`;
  return n.toLocaleString();
}

const COST_EFFICIENT_COMPACTION_MODELS = new Set([
  'gpt-4o-mini',
  'gpt-4o-mini-search-preview',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'gpt-5-mini',
  'gpt-5-nano',
  'o4-mini',
  'o4-mini-deep-research',
]);

interface ContextBudgetVisualizerProps {
  model: string;
  systemPct: number;
  fluidPct: number;
  conversationPct: number;
}

function ContextBudgetVisualizer({ model, systemPct, fluidPct, conversationPct }: ContextBudgetVisualizerProps) {
  const total = getModelContextWindow(model);
  const sysTokens = Math.floor((total * systemPct) / 100);
  const fluidTokens = Math.floor((total * fluidPct) / 100);
  const convTokens = Math.floor((total * conversationPct) / 100);

  const segments = [
    {
      label: 'System Instructions',
      pct: systemPct,
      tokens: sysTokens,
      color: 'bg-purple-500',
      textColor: 'text-purple-300',
      badge: null as string | null,
    },
    {
      label: 'Fluid Memory',
      pct: fluidPct,
      tokens: fluidTokens,
      color: 'bg-muted-foreground/60',
      textColor: 'text-muted-foreground',
      badge: 'Coming soon',
    },
    {
      label: 'Conversation Context',
      pct: conversationPct,
      tokens: convTokens,
      color: 'bg-blue-500',
      textColor: 'text-blue-300',
      badge: null as string | null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Model: <span className="text-foreground font-mono">{model}</span>
        </span>
        <span>
          Total context window: <span className="text-foreground font-mono">{formatTokens(total)} tokens</span>
        </span>
      </div>

      <div className="flex w-full h-8 rounded overflow-hidden border border-border bg-muted">
        {segments.map((seg, i) => (
          <div
            key={seg.label}
            className={`${seg.color} flex items-center justify-center text-[11px] text-foreground font-medium transition-all`}
            style={{ width: `${seg.pct}%` }}
            title={`${seg.label}: ${seg.pct}% — ${formatTokens(seg.tokens)} tokens`}
          >
            {seg.pct >= 8 ? `${seg.pct}%` : ''}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {segments.map((seg) => (
          <div key={seg.label} className="bg-muted/60 border border-border rounded p-3 space-y-1">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-sm ${seg.color}`} />
              <span className={`text-xs font-medium ${seg.textColor}`}>{seg.label}</span>
              {seg.badge && (
                <span className="text-[9px] uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  {seg.badge}
                </span>
              )}
            </div>
            <div className="text-sm text-foreground font-semibold">
              {seg.pct}% — {seg.tokens.toLocaleString()} tokens
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface InstructionHistoryEntry {
  id: number;
  instructions: string;
  label: string;
  savedAt: string;
}

interface OptionsResponse {
  models: { value: string; label: string }[];
  reasoningEffort: { value: string; label: string }[];
  reasoningSummary: { value: string; label: string }[];
  searchContextSize: { value: string; label: string }[];
  defaults: AgentSettings;
}

function settingsEqual(a: AgentSettings | null, b: AgentSettings | null): boolean {
  if (!a || !b) return a === b;
  const keys: (keyof AgentSettings)[] = [
    'name', 'instructions', 'model', 'reasoningEffort', 'reasoningSummary',
    'storeEnabled', 'webSearchEnabled', 'searchContextSize', 'temperature',
    'maxTokens', 'outputSchema', 'guardrailsEnabled', 'guardrailsConfig',
    'topicRestrictionEnabled', 'topicRestrictionMessage',
    'systemInstructionPct', 'fluidMemoryPct', 'conversationPct',
    'compactionThresholdPct', 'compactionModel',
  ];
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  const at = a.allowedTopics || [];
  const bt = b.allowedTopics || [];
  if (at.length !== bt.length) return false;
  for (let i = 0; i < at.length; i++) {
    if (at[i] !== bt[i]) return false;
  }
  return true;
}

const GENIUS_MODELS = [
  { value: "gpt-4o", label: "GPT-4o (default)" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini (faster/cheaper)" },
  { value: "o3", label: "o3 (best reasoning)" },
  { value: "o3-mini", label: "o3 Mini (efficient reasoning)" },
  { value: "gpt-5.4-2026-03-05", label: "GPT-5.4 (latest)" },
];

const REASONING_EFFORTS = [
  { value: "none", label: "None (non-reasoning models)" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function GeniusModelCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [local, setLocal] = useState<{ generationModel: string; reasoningEffort: string; temperature: number } | null>(null);

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/genius/admin/settings'],
    retry: false,
  });

  useEffect(() => {
    if (data && !local) {
      setLocal({
        generationModel: data.generationModel ?? 'gpt-4o',
        reasoningEffort: data.reasoningEffort ?? 'none',
        temperature: parseFloat(data.temperature ?? '0.2'),
      });
    }
  }, [data, local]);

  const saveMutation = useMutation({
    mutationFn: async (payload: typeof local) =>
      apiRequest('/api/genius/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/genius/admin/settings'] });
      toast({ title: 'GeniusX1 settings saved', description: 'New calculations will use the updated model.' });
    },
    onError: () => {
      toast({ title: 'Save failed', description: 'Could not save settings. Please try again.', variant: 'destructive' });
    },
  });

  const vals = local ?? { generationModel: 'gpt-4o', reasoningEffort: 'none', temperature: 0.2 };
  const reasoning = /^o\d/.test(vals.generationModel) || vals.generationModel.startsWith('gpt-5.4');

  return (
    <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Brain className="w-5 h-5 text-indigo-400" />
          Genius<span className="text-blue-500">X1</span> — AI Model
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Generation model for new calculations (commentary and classifier always use gpt-4o-mini)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Generation model</Label>
                <Select
                  value={vals.generationModel}
                  onValueChange={(v) => setLocal({ ...vals, generationModel: v })}
                >
                  <SelectTrigger className="bg-background border-input text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {GENIUS_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-foreground hover:bg-muted">
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className={reasoning ? "text-muted-foreground" : "text-muted-foreground/40"}>
                  Reasoning effort {!reasoning && "(non-reasoning model)"}
                </Label>
                <Select
                  value={vals.reasoningEffort}
                  onValueChange={(v) => setLocal({ ...vals, reasoningEffort: v })}
                  disabled={!reasoning}
                >
                  <SelectTrigger className="bg-background border-input text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {REASONING_EFFORTS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-foreground hover:bg-muted">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!reasoning && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Temperature: {vals.temperature.toFixed(2)}</Label>
                <Slider
                  value={[vals.temperature]}
                  onValueChange={([v]) => setLocal({ ...vals, temperature: v })}
                  min={0}
                  max={1}
                  step={0.05}
                  className="py-4"
                />
                <p className="text-xs text-muted-foreground">
                  Lower = more deterministic. Reasoning models do not support temperature.
                </p>
              </div>
            )}

            <Button
              onClick={() => saveMutation.mutate(vals)}
              disabled={saveMutation.isPending}
              className="w-full sm:w-auto"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentAdminPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Hard guard — AdminRoute already redirects non-admins but this prevents any
  // flash of admin content if the component somehow mounts before the redirect fires.
  if (!isAdmin) return null;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [baseline, setBaseline] = useState<AgentSettings | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [guardrailsError, setGuardrailsError] = useState<string | null>(null);
  const [activeAdminTab, setActiveAdminTab] = useState('settings');
  const [lastVisit, setLastVisit] = useState<string | null>(() =>
    localStorage.getItem('adminLastVisit')
  );
  const [previousLastVisit, setPreviousLastVisit] = useState<string | null>(() =>
    localStorage.getItem('adminLastVisit')
  );

  const { data: usersForBadge = [] } = useQuery<{ id: string; createdAt: string }[]>({
    queryKey: ['/api/platform-admin/users'],
    enabled: isAdmin,
    select: (data: any[]) => data.map((u) => ({ id: u.id, createdAt: u.createdAt })),
  });

  const newUserCount = useMemo(() => {
    if (!lastVisit) return 0;
    const cutoff = new Date(lastVisit).getTime();
    return usersForBadge.filter((u) => new Date(u.createdAt).getTime() > cutoff).length;
  }, [usersForBadge, lastVisit]);

  const handleAdminTabChange = (tab: string) => {
    setActiveAdminTab(tab);
    if (tab === 'platform') {
      setPreviousLastVisit(lastVisit);
      const now = new Date().toISOString();
      localStorage.setItem('adminLastVisit', now);
      setLastVisit(now);
    }
  };

  const hasChanges = useMemo(() => !settingsEqual(settings, baseline), [settings, baseline]);

  const validateJson = (jsonString: string): boolean => {
    try {
      JSON.parse(jsonString);
      setSchemaError(null);
      return true;
    } catch (e: any) {
      setSchemaError(e.message);
      return false;
    }
  };

  const validateGuardrailsJson = (jsonString: string): boolean => {
    try {
      JSON.parse(jsonString);
      setGuardrailsError(null);
      return true;
    } catch (e: any) {
      setGuardrailsError(e.message);
      return false;
    }
  };

  const formatSchema = () => {
    if (!settings?.outputSchema) return;
    try {
      const parsed = JSON.parse(settings.outputSchema);
      const formatted = JSON.stringify(parsed, null, 2);
      updateSetting('outputSchema', formatted);
      setSchemaError(null);
    } catch (e: any) {
      setSchemaError(e.message);
    }
  };

  const formatGuardrails = () => {
    if (!settings?.guardrailsConfig) return;
    try {
      const parsed = JSON.parse(settings.guardrailsConfig);
      const formatted = JSON.stringify(parsed, null, 2);
      updateSetting('guardrailsConfig', formatted);
      setGuardrailsError(null);
    } catch (e: any) {
      setGuardrailsError(e.message);
    }
  };

  const { data: options, isLoading: optionsLoading, error: optionsError, refetch: refetchOptions } = useQuery<OptionsResponse>({
    queryKey: ['/api/openai/admin/options'],
    retry: false,
  });

  const { data: savedSettings, isLoading: settingsLoading, error: settingsError, refetch } = useQuery<AgentSettings>({
    queryKey: ['/api/openai/admin/settings'],
    retry: false,
  });

  const { data: instructionHistory = [] } = useQuery<InstructionHistoryEntry[]>({
    queryKey: ['/api/openai/admin/instruction-history'],
  });

  useEffect(() => {
    if (savedSettings && !settings) {
      const sys = savedSettings.systemInstructionPct ?? 20;
      const fluid = savedSettings.fluidMemoryPct ?? 10;
      const conv = savedSettings.conversationPct ?? Math.max(0, 100 - sys - fluid);
      const normalized: AgentSettings = {
        ...savedSettings,
        systemInstructionPct: sys,
        fluidMemoryPct: fluid,
        conversationPct: conv,
        compactionThresholdPct: savedSettings.compactionThresholdPct ?? 70,
        compactionModel: savedSettings.compactionModel ?? 'gpt-4o-mini',
      };
      setSettings(normalized);
      setBaseline(normalized);
    }
  }, [savedSettings]);

  const handleAllocationSliderChange = (
    field: 'systemInstructionPct' | 'fluidMemoryPct',
    value: number,
  ) => {
    if (!settings) return;
    const otherField =
      field === 'systemInstructionPct' ? 'fluidMemoryPct' : 'systemInstructionPct';
    const otherMin = otherField === 'systemInstructionPct' ? 1 : 0;
    const fieldMin = field === 'systemInstructionPct' ? 1 : 0;
    const maxForField = 99 - settings[otherField];
    const clamped = Math.max(fieldMin, Math.min(maxForField, Math.round(value)));
    let otherValue = settings[otherField];
    let remaining = 100 - clamped - otherValue;
    if (remaining < 1) {
      otherValue = Math.max(otherMin, 99 - clamped);
      remaining = 100 - clamped - otherValue;
    }
    setSettings({
      ...settings,
      [field]: clamped,
      [otherField]: otherValue,
      conversationPct: remaining,
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (data: AgentSettings) => {
      return apiRequest('/api/openai/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/openai/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/openai/admin/instruction-history'] });
      if (data && typeof data === 'object') {
        setBaseline(data as AgentSettings);
        setSettings(data as AgentSettings);
      } else if (settings) {
        setBaseline(settings);
      }
      toast({
        title: 'Settings saved',
        description: 'Agent settings have been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Save failed',
        description: error.message || 'Failed to save settings',
        variant: 'destructive',
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/openai/admin/settings/reset', {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      setSettings(data);
      setBaseline(data);
      queryClient.invalidateQueries({ queryKey: ['/api/openai/admin/settings'] });
      toast({
        title: 'Settings reset',
        description: 'Agent settings have been reset to defaults.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Reset failed',
        description: error.message || 'Failed to reset settings',
        variant: 'destructive',
      });
    },
  });

  const updateSetting = <K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const handleSave = () => {
    if (settings) {
      saveMutation.mutate(settings);
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      resetMutation.mutate();
    }
  };

  if (optionsLoading || settingsLoading) {
    return (
      <div className="flex items-center justify-center bg-gray-50 dark:bg-gray-950 text-gray-700 dark:text-gray-300" style={{ minHeight: 'calc(100vh - 80px)', marginTop: '0' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Loader2 className="w-6 h-6 animate-spin text-white" />
          </div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading admin panel…</p>
        </div>
      </div>
    );
  }

  if (optionsError || settingsError || !options) {
    const errMsg = (optionsError as any)?.message || (settingsError as any)?.message || 'Unable to load agent configuration.';
    return (
      <div className="bg-gray-50 dark:bg-gray-950 text-foreground flex items-center justify-center p-6" style={{ minHeight: 'calc(100vh - 80px)', marginTop: '0' }}>
        <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm max-w-xl w-full">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              Agent Admin unavailable
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              The agent settings service returned an error. This usually means database tables are missing or the
              backend is unreachable.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-xs text-muted-foreground bg-muted border border-border rounded p-3 font-mono break-words">
              {errMsg}
            </div>
            <p className="text-xs text-muted-foreground">
              If this is a fresh database, run <code className="text-muted-foreground">npm run db:push</code> against the
              correct DATABASE_URL to create the <code className="text-muted-foreground">agent_settings</code> and
              <code className="text-muted-foreground"> agent_instruction_history</code> tables.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => { refetch(); refetchOptions(); }} variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
              <Link href="/workspace">
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to search
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="bg-gray-50 dark:bg-gray-950 text-foreground flex items-center justify-center p-6" style={{ minHeight: 'calc(100vh - 80px)', marginTop: '0' }}>
        <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 shadow-sm max-w-xl w-full">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-md shadow-violet-500/25">
                <Settings className="w-4 h-4 text-white" />
              </div>
              No agent settings yet
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Create the first configuration to enable the search agent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => resetMutation.mutate()} disabled={resetMutation.isPending}>
              {resetMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Initialize with defaults
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col lg:flex-row text-foreground"
      style={{ minHeight: 'calc(100vh - 80px)', marginTop: '0' }}
    >
      <AdminSidebar
        activeTab={activeAdminTab}
        onTabChange={handleAdminTabChange}
        isAdmin={isAdmin}
        newUserCount={newUserCount}
      />
      <div className="flex-1 overflow-auto bg-[radial-gradient(ellipse_at_top_left,_#ede9fe33_0%,_transparent_60%),_linear-gradient(to_bottom_right,_#f8fafc,_#f1f5f9)] dark:bg-[radial-gradient(ellipse_at_top_left,_#2e1065_0%,_transparent_50%),_linear-gradient(to_bottom_right,_#020617,_#0f172a)]">
        <div className="max-w-5xl mx-auto px-4 py-4 lg:px-8 lg:py-8">
        <Tabs value={activeAdminTab} onValueChange={handleAdminTabChange} className="space-y-6">

          <TabsContent value="settings">
            <div className="flex justify-end gap-2 mb-6">
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={resetMutation.isPending}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                {resetMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                Reset to Defaults
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || saveMutation.isPending}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>

        <div className="space-y-6">
          <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Bot className="w-5 h-5 text-purple-400" />
                Agent Identity
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Basic agent configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Agent Name</Label>
                <Input
                  value={settings.name}
                  onChange={(e) => updateSetting('name', e.target.value)}
                  placeholder="genius-x1"
                  className="bg-background border-input text-foreground"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground">System Instructions</Label>
                  {instructionHistory.length > 0 && (
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-muted-foreground" />
                      <Select
                        onValueChange={(value) => {
                          const entry = instructionHistory.find(h => h.id.toString() === value);
                          if (entry) {
                            updateSetting('instructions', entry.instructions);
                            toast({
                              title: 'Instructions restored',
                              description: `Loaded: ${entry.label}`,
                            });
                          }
                        }}
                      >
                        <SelectTrigger className="w-[280px] h-8 bg-muted border-border text-muted-foreground text-xs">
                          <SelectValue placeholder="Restore from history..." />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border max-h-[300px]">
                          {instructionHistory.map((entry) => (
                            <SelectItem
                              key={entry.id}
                              value={entry.id.toString()}
                              className="text-muted-foreground text-xs hover:bg-muted focus:bg-muted"
                            >
                              <div className="flex flex-col">
                                <span className="truncate">{entry.label}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {new Date(entry.savedAt).toLocaleString()}
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <Textarea
                  value={settings.instructions}
                  onChange={(e) => updateSetting('instructions', e.target.value)}
                  placeholder="Enter the agent's system instructions..."
                  rows={10}
                  className="bg-background border-input text-foreground font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  These instructions define the agent's core behavior, search strategy, output format, and response rules.
                  {instructionHistory.length > 0 && ` (${instructionHistory.length} previous version${instructionHistory.length === 1 ? '' : 's'} saved)`}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                Model Configuration
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                AI model and reasoning settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Model</Label>
                  <Select
                    value={settings.model}
                    onValueChange={(value) => updateSetting('model', value)}
                  >
                    <SelectTrigger className="bg-background border-input text-foreground">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {options.models.map((model) => (
                        <SelectItem key={model.value} value={model.value} className="text-foreground hover:bg-muted">
                          {model.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Reasoning Effort</Label>
                  <Select
                    value={settings.reasoningEffort}
                    onValueChange={(value) => updateSetting('reasoningEffort', value as 'none' | 'low' | 'medium' | 'high')}
                  >
                    <SelectTrigger className="bg-background border-input text-foreground">
                      <SelectValue placeholder="Select effort" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      {options.reasoningEffort.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-foreground hover:bg-muted">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Reasoning Summary</Label>
                <Select
                  value={settings.reasoningSummary}
                  onValueChange={(value) => updateSetting('reasoningSummary', value as 'auto' | 'concise' | 'detailed' | 'none')}
                >
                  <SelectTrigger className="bg-background border-input text-foreground">
                    <SelectValue placeholder="Select summary style" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {options.reasoningSummary.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-foreground hover:bg-muted">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  How the model summarizes its reasoning process in responses.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-muted-foreground">Temperature: {settings.temperature.toFixed(2)}</Label>
                </div>
                <Slider
                  value={[settings.temperature]}
                  onValueChange={([value]) => updateSetting('temperature', value)}
                  min={0}
                  max={2}
                  step={0.1}
                  className="py-4"
                />
                <p className="text-xs text-muted-foreground">
                  Lower values make output more focused; higher values make it more creative.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Max Tokens</Label>
                <Input
                  type="number"
                  value={settings.maxTokens}
                  onChange={(e) => updateSetting('maxTokens', parseInt(e.target.value) || 4096)}
                  min={256}
                  max={16384}
                  className="bg-background border-input text-foreground"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Search className="w-5 h-5 text-green-400" />
                Tools & Features
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Enable or disable agent capabilities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-muted-foreground">Web Search</Label>
                  <p className="text-xs text-muted-foreground">Allow the agent to search the web for products</p>
                </div>
                <Switch
                  checked={settings.webSearchEnabled}
                  onCheckedChange={(checked) => updateSetting('webSearchEnabled', checked)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground">Search Context Size</Label>
                <Select
                  value={settings.searchContextSize}
                  onValueChange={(value) => updateSetting('searchContextSize', value as 'low' | 'medium' | 'high')}
                  disabled={!settings.webSearchEnabled}
                >
                  <SelectTrigger className="bg-background border-input text-foreground">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {options.searchContextSize.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-foreground hover:bg-muted">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Amount of context from web search results to include.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-muted-foreground">Store Responses</Label>
                  <p className="text-xs text-muted-foreground">Store agent responses for training and analytics</p>
                </div>
                <Switch
                  checked={settings.storeEnabled}
                  onCheckedChange={(checked) => updateSetting('storeEnabled', checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Code2 className="w-5 h-5 text-orange-400" />
                Output Schema
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Define the JSON structure for agent responses (Zod schema format)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {schemaError ? (
                    <div className="flex items-center gap-1 text-red-400 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      <span>Invalid JSON</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-green-400 text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Valid JSON</span>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={formatSchema}
                  className="border-border text-muted-foreground hover:bg-muted"
                >
                  <Code2 className="w-3 h-3 mr-1" />
                  Format
                </Button>
              </div>
              <Textarea
                value={settings.outputSchema}
                onChange={(e) => {
                  updateSetting('outputSchema', e.target.value);
                  validateJson(e.target.value);
                }}
                placeholder='{"data": [...]}'
                rows={20}
                className="bg-muted border-border text-foreground font-mono text-xs leading-relaxed"
              />
              {schemaError && (
                <p className="text-xs text-red-400">
                  {schemaError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                This schema defines what fields the agent returns. Use JSON format with "string", "number", "boolean" as type indicators.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Shield className="w-5 h-5 text-red-400" />
                Guardrails
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Safety filters and content moderation for agent inputs/outputs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-muted-foreground">Enable Guardrails</Label>
                  <p className="text-xs text-muted-foreground">Apply safety filters to agent interactions</p>
                </div>
                <Switch
                  checked={settings.guardrailsEnabled}
                  onCheckedChange={(checked) => updateSetting('guardrailsEnabled', checked)}
                />
              </div>

              {settings.guardrailsEnabled && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {guardrailsError ? (
                        <div className="flex items-center gap-1 text-red-400 text-sm">
                          <AlertCircle className="w-4 h-4" />
                          <span>Invalid JSON</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-green-400 text-sm">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Valid JSON</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={formatGuardrails}
                      className="border-border text-muted-foreground hover:bg-muted"
                    >
                      <Code2 className="w-3 h-3 mr-1" />
                      Format
                    </Button>
                  </div>
                  <Textarea
                    value={settings.guardrailsConfig}
                    onChange={(e) => {
                      updateSetting('guardrailsConfig', e.target.value);
                      validateGuardrailsJson(e.target.value);
                    }}
                    placeholder='{"guardrails": [...]}'
                    rows={15}
                    className="bg-muted border-border text-foreground font-mono text-xs leading-relaxed"
                  />
                  {guardrailsError && (
                    <p className="text-xs text-red-400">
                      {guardrailsError}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Configure guardrails: PII detection, Moderation, Jailbreak prevention, NSFW filtering, URL filtering, Prompt injection detection, and Custom prompt checks.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <AlertCircle className="w-5 h-5 text-amber-400" />
                Topic Restriction
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Restrict the agent to product-related conversations only. Off-topic queries (e.g., medical advice, general knowledge) are blocked before reaching the AI model, saving API costs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-muted-foreground">Enable Topic Restriction</Label>
                  <p className="text-xs text-muted-foreground">Block non-product queries before they reach the agent</p>
                </div>
                <Switch
                  checked={settings.topicRestrictionEnabled}
                  onCheckedChange={(checked) => updateSetting('topicRestrictionEnabled', checked)}
                />
              </div>

              {settings.topicRestrictionEnabled && (
                <>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Allowed Query Types</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Select which types of queries are permitted. Unchecked types will be blocked with the rejection message below.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'product_search', label: 'Product Search', desc: 'Find specific products' },
                        { value: 'comparison', label: 'Comparison', desc: 'Compare products' },
                        { value: 'explanation', label: 'Explanation', desc: 'Technical concepts' },
                        { value: 'recommendation', label: 'Recommendation', desc: 'Expert suggestions' },
                        { value: 'follow_up', label: 'Follow-up', desc: 'Continue conversation' },
                        { value: 'general_chat', label: 'General Chat', desc: 'Greetings, off-topic' },
                      ].map((topic) => (
                        <div
                          key={topic.value}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            (settings.allowedTopics || []).includes(topic.value)
                              ? 'border-blue-500/50 bg-blue-500/10'
                              : 'border-border bg-muted/50 opacity-60'
                          }`}
                          onClick={() => {
                            const current = settings.allowedTopics || [];
                            const updated = current.includes(topic.value)
                              ? current.filter((t: string) => t !== topic.value)
                              : [...current, topic.value];
                            updateSetting('allowedTopics', updated);
                          }}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                            (settings.allowedTopics || []).includes(topic.value)
                              ? 'border-blue-400 bg-blue-500'
                              : 'border-border'
                          }`}>
                            {(settings.allowedTopics || []).includes(topic.value) && (
                              <CheckCircle2 className="w-3 h-3 text-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm text-foreground">{topic.label}</p>
                            <p className="text-xs text-muted-foreground">{topic.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Rejection Message</Label>
                    <p className="text-xs text-muted-foreground">
                      This message is shown to users when their query is blocked. Supports markdown formatting.
                    </p>
                    <Textarea
                      value={settings.topicRestrictionMessage || ''}
                      onChange={(e) => updateSetting('topicRestrictionMessage', e.target.value)}
                      placeholder="I'm a specialized AI assistant for product sourcing..."
                      rows={8}
                      className="bg-background border-input text-foreground font-mono text-sm"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <GeniusModelCard />

          {hasChanges && (
            <div className="fixed bottom-6 right-6 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              Unsaved changes
            </div>
          )}
        </div>
          </TabsContent>

          <TabsContent value="memory">
            <div className="flex justify-end gap-2 mb-6">
              <Button
                onClick={handleSave}
                disabled={!hasChanges || saveMutation.isPending}
                data-testid="button-save-memory"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>

            <div className="space-y-6">
              <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Brain className="w-5 h-5 text-purple-400" />
                    Context Allocation
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    How the model's context window is partitioned between system instructions, fluid memory, and conversation. The three values must always sum to 100%.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ContextBudgetVisualizer
                    model={settings.model}
                    systemPct={settings.systemInstructionPct}
                    fluidPct={settings.fluidMemoryPct}
                    conversationPct={settings.conversationPct}
                  />

                  <div className="space-y-6 pt-4 border-t border-border">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-muted-foreground">System Instructions: {settings.systemInstructionPct}%</Label>
                        <span className="text-xs text-muted-foreground font-mono">
                          {Math.floor((getModelContextWindow(settings.model) * settings.systemInstructionPct) / 100).toLocaleString()} tokens
                        </span>
                      </div>
                      <Slider
                        value={[settings.systemInstructionPct]}
                        onValueChange={([v]) => handleAllocationSliderChange('systemInstructionPct', v)}
                        min={1}
                        max={Math.max(1, 99 - settings.fluidMemoryPct)}
                        step={1}
                        className="py-4"
                        data-testid="slider-system-pct"
                      />
                      <p className="text-xs text-muted-foreground">
                        Reserved for the agent's persistent system prompt and tool instructions.
                      </p>
                    </div>

                    <div className="space-y-2 opacity-70">
                      <div className="flex items-center justify-between">
                        <Label className="text-muted-foreground flex items-center gap-2">
                          Fluid Memory: {settings.fluidMemoryPct}%
                          <span className="text-[9px] uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            Coming soon
                          </span>
                        </Label>
                        <span className="text-xs text-muted-foreground font-mono">
                          {Math.floor((getModelContextWindow(settings.model) * settings.fluidMemoryPct) / 100).toLocaleString()} tokens
                        </span>
                      </div>
                      <Slider
                        value={[settings.fluidMemoryPct]}
                        onValueChange={([v]) => handleAllocationSliderChange('fluidMemoryPct', v)}
                        min={0}
                        max={Math.max(0, 99 - settings.systemInstructionPct)}
                        step={1}
                        className="py-4"
                        data-testid="slider-fluid-pct"
                      />
                      <p className="text-xs text-muted-foreground">
                        Reserved slot for cross-session memory. Injection logic ships in a future release.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-muted-foreground flex items-center gap-2">
                          Conversation Context: {settings.conversationPct}%
                          <span className="text-[9px] uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                            Auto
                          </span>
                        </Label>
                        <span className="text-xs text-muted-foreground font-mono">
                          {Math.floor((getModelContextWindow(settings.model) * settings.conversationPct) / 100).toLocaleString()} tokens
                        </span>
                      </div>
                      <Slider
                        value={[settings.conversationPct]}
                        min={0}
                        max={100}
                        step={1}
                        className="py-4 pointer-events-none opacity-80"
                        data-testid="slider-conversation-pct"
                      />
                      <p className="text-xs text-muted-foreground">
                        Working space for the live transcript. Lowest priority — auto-adjusted to fill the remainder so the three slots always sum to 100%.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Activity className="w-5 h-5 text-amber-400" />
                    Compaction
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    When the live conversation fills up, older turns are summarized to free space. Configure when this fires and which model performs the summarization.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {(() => {
                    const totalWindow = getModelContextWindow(settings.model);
                    const convTokens = Math.floor((totalWindow * settings.conversationPct) / 100);
                    const triggerTokens = Math.floor((convTokens * settings.compactionThresholdPct) / 100);
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-muted-foreground">
                            Compaction Threshold: {settings.compactionThresholdPct}%
                          </Label>
                        </div>
                        <Slider
                          value={[settings.compactionThresholdPct]}
                          onValueChange={([v]) => updateSetting('compactionThresholdPct', Math.round(v))}
                          min={0}
                          max={100}
                          step={1}
                          className="py-4"
                          data-testid="slider-compaction-threshold"
                        />
                        <p className="text-xs text-muted-foreground">
                          Compaction fires at <span className="text-amber-300 font-mono">{settings.compactionThresholdPct}%</span> →{' '}
                          <span className="text-amber-300 font-mono">{triggerTokens.toLocaleString()}</span> /{' '}
                          <span className="text-muted-foreground font-mono">{convTokens.toLocaleString()}</span> conversation tokens
                          {' '}<span className="text-muted-foreground">(model window: {formatTokens(totalWindow)})</span>
                        </p>
                      </div>
                    );
                  })()}

                  <div className="space-y-2">
                    <Label className="text-muted-foreground">Compaction Model</Label>
                    <Select
                      value={settings.compactionModel}
                      onValueChange={(value) => updateSetting('compactionModel', value)}
                    >
                      <SelectTrigger className="bg-background border-input text-foreground" data-testid="select-compaction-model">
                        <SelectValue placeholder="Select compaction model" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {options.models.map((m) => (
                          <SelectItem
                            key={m.value}
                            value={m.value}
                            className={`hover:bg-muted ${COST_EFFICIENT_COMPACTION_MODELS.has(m.value) ? 'text-foreground' : 'text-muted-foreground'}`}
                          >
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!COST_EFFICIENT_COMPACTION_MODELS.has(settings.compactionModel) && (
                      <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded p-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>
                          The selected model isn't on the recommended cost-efficient summarization list. Compaction may be slow or expensive.
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Cost-efficient mini/nano models are recommended — they handle summarization quickly without burning the main agent's budget.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {hasChanges && (
                <div className="fixed bottom-6 right-6 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                  Unsaved changes
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="usage">
            <UsageAnalytics />
          </TabsContent>

          <TabsContent value="per-user">
            <PerUserAnalytics />
          </TabsContent>

          <TabsContent value="benchmarks">
            <BenchmarksTab />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="feedback">
              <AdminFeedbackList />
            </TabsContent>
          )}

          {isAdmin && (
            <TabsContent value="platform">
              <PlatformAdmin lastVisitForNew={previousLastVisit} />
            </TabsContent>
          )}
          {isAdmin && (
            <TabsContent value="access-requests">
              <AccessRequests />
            </TabsContent>
          )}
        </Tabs>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 min-w-0">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="p-1.5 rounded-md bg-muted/60 border border-border/50 w-fit">{icon}</div>
          <p className="text-xs text-muted-foreground font-medium mt-1 truncate">{label}</p>
          <p className="text-xl font-bold text-foreground tabular-nums leading-tight break-all">{value}</p>
          {sub && <p className="text-xs text-muted-foreground break-words">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

interface PricingRow {
  model: string;
  inputPerMtok: string;
  outputPerMtok: string;
  source: string;
  fetchedAt: string | null;
  updatedAt: string | null;
}

const WEB_SEARCH_KEYS = ['web_search_preview', 'web_search_preview_reasoning', 'web_search_tool'];

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'gpt-6-astra':                  'gpt-6-astra · PhD calculations',
  'web_search_preview':           'Web Search Preview · non-reasoning (gpt-4o, gpt-4.1, …)',
  'web_search_preview_reasoning': 'Web Search Preview · reasoning (gpt-5, o3, o4, …)',
  'web_search_tool':              'Web Search Tool · all models (non-preview)',
};

function ModelPricingPanel() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(true);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [addModel, setAddModel] = useState('');
  const [addIn, setAddIn] = useState('');
  const [addOut, setAddOut] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [refreshWarning, setRefreshWarning] = useState<{ message: string; at: Date } | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);

  const { data: rows = [], isLoading } = useQuery<PricingRow[]>({
    queryKey: ['/api/openai/admin/pricing'],
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiRequest('/api/openai/admin/pricing/refresh', { method: 'POST' }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/openai/admin/pricing'] });
      if (data?.success) {
        setRefreshWarning(null);
        setLastRefreshAt(new Date());
        const desc = `${data.prices?.length ?? 0} entries updated from OpenAI.${data.tools_note ? '\n' + data.tools_note : ''}`;
        toast({ title: 'Prices refreshed', description: desc });
      } else {
        setRefreshWarning({ message: data?.error || 'Could not parse OpenAI pricing page. Cached prices are still active.', at: new Date() });
        toast({ title: 'Auto-refresh failed', description: data?.error || 'Parse failed. Cached prices kept.', variant: 'destructive' });
      }
    },
    onError: (err: any) => {
      setRefreshWarning({ message: err.message || 'Network error reaching OpenAI pricing page.', at: new Date() });
      toast({ title: 'Refresh error', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ model, inPrice, outPrice }: { model: string; inPrice: number; outPrice: number }) =>
      apiRequest(`/api/openai/admin/pricing/${encodeURIComponent(model)}`, {
        method: 'PUT',
        body: JSON.stringify({ input_per_mtok: inPrice, output_per_mtok: outPrice }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/openai/admin/pricing'] });
      setEditingRow(null);
      toast({ title: 'Price updated' });
    },
    onError: (err: any) => toast({ title: 'Update failed', description: err.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (model: string) =>
      apiRequest(`/api/openai/admin/pricing/${encodeURIComponent(model)}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/openai/admin/pricing'] });
      toast({ title: 'Model removed' });
    },
    onError: (err: any) => toast({ title: 'Delete failed', description: err.message, variant: 'destructive' }),
  });

  const resetMutation = useMutation({
    mutationFn: (model: string) =>
      apiRequest(`/api/openai/admin/pricing/${encodeURIComponent(model)}/reset`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/openai/admin/pricing'] });
      toast({ title: 'Reset to auto', description: 'Row will be updated on next refresh from OpenAI.' });
    },
    onError: (err: any) => toast({ title: 'Reset failed', description: err.message, variant: 'destructive' }),
  });

  const addMutation = useMutation({
    mutationFn: ({ model, inPrice, outPrice }: { model: string; inPrice: number; outPrice: number }) =>
      apiRequest('/api/openai/admin/pricing', {
        method: 'POST',
        body: JSON.stringify({ model, input_per_mtok: inPrice, output_per_mtok: outPrice }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/openai/admin/pricing'] });
      setAddModel(''); setAddIn(''); setAddOut(''); setShowAdd(false);
      toast({ title: 'Model added' });
    },
    onError: (err: any) => toast({ title: 'Add failed', description: err.message, variant: 'destructive' }),
  });

  const startEdit = (row: PricingRow) => {
    setEditingRow(row.model);
    setEditIn(parseFloat(row.inputPerMtok).toString());
    setEditOut(parseFloat(row.outputPerMtok).toString());
  };

  const saveEdit = (model: string) => {
    const inPrice = parseFloat(editIn);
    const outPrice = parseFloat(editOut);
    if (isNaN(inPrice) || isNaN(outPrice)) return toast({ title: 'Invalid price', variant: 'destructive' });
    updateMutation.mutate({ model, inPrice, outPrice });
  };

  const saveAdd = () => {
    if (!addModel.trim()) return toast({ title: 'Model name required', variant: 'destructive' });
    const inPrice = parseFloat(addIn);
    const outPrice = parseFloat(addOut);
    if (isNaN(inPrice) || isNaN(outPrice)) return toast({ title: 'Invalid price', variant: 'destructive' });
    addMutation.mutate({ model: addModel.trim().toLowerCase(), inPrice, outPrice });
  };

  const lastUpdate = rows.reduce<Date | null>((latest, r) => {
    if (!r.updatedAt) return latest;
    const d = new Date(r.updatedAt);
    return !latest || d > latest ? d : latest;
  }, null);

  const dominantSource = rows.some((r) => r.source === 'auto')
    ? 'Auto-fetched'
    : rows.some((r) => r.source === 'manual')
    ? 'Manually edited'
    : rows.some((r) => r.source === 'missing')
    ? 'Pricing needed'
    : 'Hardcoded defaults';
  const missingRows = rows.filter((r) => r.source === 'missing');

  return (
    <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3 cursor-pointer select-none" onClick={() => setCollapsed(!collapsed)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-foreground flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            Model Pricing
            <span className="text-[10px] font-normal text-muted-foreground px-1.5 py-0.5 bg-muted rounded">{rows.length} models</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-[10px] text-muted-foreground hidden sm:block">
                Updated {lastUpdate.toLocaleDateString()} · {dominantSource}
              </span>
            )}
            {collapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative group">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); refreshMutation.mutate(); }}
                disabled={refreshMutation.isPending}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                {refreshMutation.isPending ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
                Try refresh from OpenAI
              </Button>
              <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block z-50 w-64 p-2 bg-popover border border-border rounded shadow-md text-[10px] text-muted-foreground leading-snug">
                Attempts to scrape openai.com/api/pricing/ — may be blocked by Cloudflare on server IPs. Use row editing below to update prices manually if this fails.
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); setShowAdd(!showAdd); }}
              className="text-muted-foreground hover:bg-muted"
            >
              <Plus className="w-3 h-3 mr-1.5" />
              Add model
            </Button>
            {lastUpdate && (
              <span className="text-[10px] text-muted-foreground sm:hidden">
                Updated {lastUpdate.toLocaleDateString()} · {dominantSource}
              </span>
            )}
          </div>

          {lastRefreshAt && !refreshWarning && (
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              Last refreshed from OpenAI: {lastRefreshAt.toLocaleString()}
            </div>
          )}

          {refreshWarning && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-700 dark:text-amber-300">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <div className="font-medium">Auto-refresh failed — cached prices are still active</div>
                <div className="text-[10px] text-amber-600 dark:text-amber-400">{refreshWarning.message}</div>
                <div className="text-[10px] text-muted-foreground">At {refreshWarning.at.toLocaleString()} · Edit rows manually below to correct prices</div>
              </div>
              <button className="ml-auto shrink-0 text-amber-600 hover:text-amber-400" onClick={() => setRefreshWarning(null)}>
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {missingRows.length > 0 && (
            <div className="flex items-start gap-2 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium">Pricing needed:</span>{' '}
                {missingRows.map((row) => MODEL_DISPLAY_NAMES[row.model] ?? row.model).join(', ')}
                . Edit the row to set input and output USD-per-million-token rates; its usage costs cannot be calculated until then.
              </div>
            </div>
          )}

          {showAdd && (
            <div className="flex items-center gap-2 p-2 bg-muted/60 rounded border border-border text-xs">
              <Input
                placeholder="model-name"
                value={addModel}
                onChange={(e) => setAddModel(e.target.value)}
                className="h-7 text-xs w-44 bg-background border-input"
              />
              <Input
                placeholder="Input $/1M"
                value={addIn}
                onChange={(e) => setAddIn(e.target.value)}
                className="h-7 text-xs w-24 bg-background border-input"
              />
              <Input
                placeholder="Output $/1M"
                value={addOut}
                onChange={(e) => setAddOut(e.target.value)}
                className="h-7 text-xs w-24 bg-background border-input"
                onKeyDown={(e) => { if (e.key === 'Enter') saveAdd(); }}
              />
              <Button size="sm" className="h-7 text-xs" onClick={saveAdd} disabled={addMutation.isPending}>
                {addMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setShowAdd(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="py-4 flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/40">
                    <th className="text-left font-normal pb-1 pr-2">Model</th>
                    <th className="text-right font-normal pb-1 px-2">Input $/1M</th>
                    <th className="text-right font-normal pb-1 px-2">Output $/1M</th>
                    <th className="text-right font-normal pb-1 px-2">Source</th>
                    <th className="text-right font-normal pb-1 pl-1 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.model} className="border-b border-border/20 last:border-0 hover:bg-muted/30">
                      <td className="py-1.5 pr-2 text-foreground">
                        <span className={WEB_SEARCH_KEYS.includes(row.model) ? 'text-xs' : 'font-mono'}>
                          {MODEL_DISPLAY_NAMES[row.model] ?? row.model}
                        </span>
                      </td>
                      {editingRow === row.model ? (
                        <>
                          <td className="py-1 px-2">
                            <Input
                              value={editIn}
                              onChange={(e) => setEditIn(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(row.model); if (e.key === 'Escape') setEditingRow(null); }}
                              className="h-6 w-20 text-xs bg-background border-input ml-auto block"
                              autoFocus
                            />
                          </td>
                          <td className="py-1 px-2">
                            {!WEB_SEARCH_KEYS.includes(row.model) && (
                              <Input
                                value={editOut}
                                onChange={(e) => setEditOut(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(row.model); if (e.key === 'Escape') setEditingRow(null); }}
                                className="h-6 w-20 text-xs bg-background border-input ml-auto block"
                              />
                            )}
                          </td>
                          <td />
                          <td className="py-1 pl-1 text-right space-x-1">
                            <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => saveEdit(row.model)} disabled={updateMutation.isPending}>
                              {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 px-1 text-muted-foreground" onClick={() => setEditingRow(null)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-1.5 px-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                            {WEB_SEARCH_KEYS.includes(row.model)
                              ? <>${parseFloat(row.inputPerMtok).toFixed(4)} <span className="text-[9px] text-muted-foreground font-sans">/call</span></>
                              : `$${parseFloat(row.inputPerMtok).toFixed(4)}`}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-blue-600 dark:text-blue-400">
                            {WEB_SEARCH_KEYS.includes(row.model)
                              ? <span className="text-[9px] text-muted-foreground font-sans">per-call only</span>
                              : `$${parseFloat(row.outputPerMtok).toFixed(4)}`}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase ${
                              row.source === 'auto' ? 'bg-blue-500/15 text-blue-400' :
                              row.source === 'manual' ? 'bg-amber-500/15 text-amber-400' :
                              row.source === 'missing' ? 'bg-rose-500/15 text-rose-500 dark:text-rose-300' :
                              'bg-muted text-muted-foreground'
                            }`}>{row.source}</span>
                          </td>
                          <td className="py-1.5 pl-1 text-right space-x-0.5">
                            {row.source === 'manual' && (
                              <div className="relative group/reset inline-block">
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-6 w-6 p-0 text-amber-500 hover:text-amber-300"
                                  onClick={() => resetMutation.mutate(row.model)}
                                  disabled={resetMutation.isPending}
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </Button>
                                <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover/reset:block z-50 w-44 p-1.5 bg-popover border border-border rounded shadow-md text-[10px] text-muted-foreground leading-snug whitespace-normal">
                                  Reset to auto — price will be updated on next refresh
                                </div>
                              </div>
                            )}
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground" onClick={() => startEdit(row)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400" onClick={() => deleteMutation.mutate(row.model)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Token prices are in USD per 1 million tokens; web search rows show USD per call. Edit any row directly — changes take effect immediately with no restart.
            The refresh button scrapes openai.com but may be blocked by Cloudflare on server IPs — manual editing is the reliable fallback.
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function UsageAnalytics() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<any>({
    queryKey: ['/api/openai/usage/stats'],
    refetchInterval: 30000,
  });

  const { data: history, isLoading: historyLoading, refetch: refetchHistory } = useQuery<any[]>({
    queryKey: ['/api/openai/usage/history'],
    refetchInterval: 30000,
  });

  const refreshAll = () => {
    refetchStats();
    refetchHistory();
  };

  if (statsLoading || historyLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        <span className="ml-3 text-muted-foreground">Loading analytics...</span>
      </div>
    );
  }

  if (!stats || stats.total_requests === 0) {
    return (
      <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-muted-foreground" />
            No usage tracked yet
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Cost and token analytics will appear here once searches start running through the agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Run a calculation from GeniusX1 to populate this dashboard.
          </p>
          <div className="flex gap-2">
            <Button onClick={refreshAll} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Link href="/workspace">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <Search className="w-4 h-4 mr-2" />
                Genius<span className="text-blue-500">X1</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  const formatCost = (n: number) => {
    if (!n || n === 0) return '$0';
    if (n < 0.0001) return `$${n.toExponential(2)}`;
    if (n < 0.01) return `$${n.toFixed(5)}`;
    if (n < 1) return `$${n.toFixed(4)}`;
    if (n < 100) return `$${n.toFixed(3)}`;
    return `$${n.toFixed(2)}`;
  };

  // Totals always use 2 decimals; per-request values always use 4 decimals.
  const formatCostTotal = (n: number) => `$${(n || 0).toFixed(2)}`;
  const formatCostPerRequest = (n: number) => `$${(n || 0).toFixed(4)}`;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60000) return 'just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-400" />
          Usage Analytics
        </h2>
        <Button variant="outline" size="sm" onClick={refreshAll} className="border-border text-muted-foreground hover:bg-muted">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          icon={<BarChart3 className="w-4 h-4 text-blue-400" />}
          label="Total Requests"
          value={stats?.total_requests || 0}
        />
        <StatCard
          icon={<Zap className="w-4 h-4 text-yellow-400" />}
          label="Tokens Used"
          value={formatTokens(stats?.all_time?.total_tokens || 0)}
          sub="all time"
        />
        <StatCard
          icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
          label="Total Cost"
          value={formatCost(stats?.all_time?.total_cost_usd || 0)}
          sub="all time"
        />
        <StatCard
          icon={<DollarSign className="w-4 h-4 text-amber-400" />}
          label="Avg Cost / Search"
          value={formatCost(stats?.cost_per_request?.avg || 0)}
          sub={`p95 ${formatCost(stats?.cost_per_request?.p95 || 0)}`}
        />
        <StatCard
          icon={<Users className="w-4 h-4 text-purple-400" />}
          label="Unique Users"
          value={stats?.unique_users || 0}
          sub={`${stats?.anonymous_visitors || 0} anonymous`}
        />
        <StatCard
          icon={<Clock className="w-4 h-4 text-green-400" />}
          label="Avg Duration"
          value={formatDuration(stats?.all_time?.avg_duration_ms || 0)}
          sub={`${stats?.all_time?.avg_api_calls || 0} calls/req`}
        />
      </div>
      {stats?.unpriced_models?.length > 0 && (
        <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium">Some usage is not included in cost totals.</span>{' '}
            {stats.unpriced_models.map((entry: { model: string; calls: number; tokens: number }) =>
              `${entry.model} (${entry.calls} call${entry.calls === 1 ? '' : 's'}, ${formatTokens(entry.tokens)} tokens)`
            ).join(', ')}
            . Set its rates in Model Pricing to calculate those costs.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              Last Hour
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Requests</span><span className="text-foreground font-mono">{stats?.last_hour?.requests || 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tokens</span><span className="text-foreground font-mono">{formatTokens(stats?.last_hour?.total_tokens || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cost</span><span className="text-emerald-600 dark:text-emerald-400 font-mono">{formatCostTotal(stats?.last_hour?.total_cost_usd || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Avg Duration</span><span className="text-foreground font-mono">{formatDuration(stats?.last_hour?.avg_duration_ms || 0)}</span></div>
          </CardContent>
        </Card>
        <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-green-400" />
              Last 24 Hours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Requests</span><span className="text-foreground font-mono">{stats?.last_day?.requests || 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tokens</span><span className="text-foreground font-mono">{formatTokens(stats?.last_day?.total_tokens || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cost</span><span className="text-emerald-600 dark:text-emerald-400 font-mono">{formatCostTotal(stats?.last_day?.total_cost_usd || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Avg Duration</span><span className="text-foreground font-mono">{formatDuration(stats?.last_day?.avg_duration_ms || 0)}</span></div>
          </CardContent>
        </Card>
        <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-500" />
              {stats?.this_month?.month_label || 'This Month'}
            </CardTitle>
            <CardDescription className="text-[11px] text-muted-foreground">
              {stats?.this_month?.elapsed_fraction
                ? `${Math.round((stats.this_month.elapsed_fraction || 0) * 100)}% of month elapsed`
                : 'Calendar month to date'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Requests</span><span className="text-foreground font-mono">{stats?.this_month?.requests || 0}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tokens</span><span className="text-foreground font-mono">{formatTokens(stats?.this_month?.total_tokens || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cost</span><span className="text-emerald-600 dark:text-emerald-400 font-mono">{formatCostTotal(stats?.this_month?.total_cost_usd || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Avg / Search</span><span className="text-foreground font-mono">{formatCostPerRequest(stats?.this_month?.avg_cost_usd || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Active Users</span><span className="text-purple-600 dark:text-purple-400 font-mono">{stats?.this_month?.unique_users || 0}</span></div>
            <div className="pt-2 mt-2 border-t border-border/60 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Projected end of month
              </span>
              <span className="text-amber-600 dark:text-amber-400 font-mono text-sm">{formatCostTotal(stats?.this_month?.projected_cost_usd || 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-foreground flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            Cost Per Search (recent {stats?.cost_per_request?.window || 0} requests)
          </CardTitle>
          <CardDescription className="text-muted-foreground text-xs">
            Avg/p50/p95/max computed over the most recent 50 requests. Web Search counted at $0.027 per call.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Average</p>
              <p className="text-lg text-foreground font-mono">{formatCost(stats?.cost_per_request?.avg || 0)}</p>
            </div>
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Median (p50)</p>
              <p className="text-lg text-foreground font-mono">{formatCost(stats?.cost_per_request?.p50 || 0)}</p>
            </div>
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">p95</p>
              <p className="text-lg text-foreground font-mono">{formatCost(stats?.cost_per_request?.p95 || 0)}</p>
            </div>
            <div className="p-3 bg-muted rounded">
              <p className="text-xs text-muted-foreground">Max</p>
              <p className="text-lg text-foreground font-mono">{formatCost(stats?.cost_per_request?.max || 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <TrendsChartsSection
        formatCostTotal={formatCostTotal}
      />

      {stats?.by_mode && Object.keys(stats.by_mode).length > 0 && (
        <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              Cost by Request Type
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs">
              avg / median / p95 cost per request, broken out by request type — most recent 50 requests
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <table className="w-full table-fixed text-xs">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead>
                <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/40">
                  <th className="text-left font-normal pb-1 pr-2">Mode</th>
                  <th className="text-right font-normal pb-1 px-1">Req</th>
                  <th className="text-right font-normal pb-1 px-1">Avg</th>
                  <th className="text-right font-normal pb-1 px-1">p50</th>
                  <th className="text-right font-normal pb-1 px-1">p95</th>
                  <th className="text-right font-normal pb-1 pl-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.by_mode)
                  .sort((a: any, b: any) => (b[1].total_cost_usd || 0) - (a[1].total_cost_usd || 0))
                  .map(([mode, data]: [string, any]) => (
                    <tr key={mode} className="border-b border-border/30 last:border-0">
                      <td className="py-1.5 pr-2 text-cyan-600 dark:text-cyan-400 truncate" title={mode.replace(/_/g, ' ')}>{mode.replace(/_/g, ' ')}</td>
                      <td className="py-1.5 px-1 text-muted-foreground text-right">{data.requests}</td>
                      <td className="py-1.5 px-1 text-emerald-600 dark:text-emerald-400 font-mono text-right">{formatCost(data.cost_per_request?.avg || 0)}</td>
                      <td className="py-1.5 px-1 text-muted-foreground font-mono text-right">{formatCost(data.cost_per_request?.p50 || 0)}</td>
                      <td className="py-1.5 px-1 text-amber-600 dark:text-amber-400 font-mono text-right">{formatCost(data.cost_per_request?.p95 || 0)}</td>
                      <td className="py-1.5 pl-1 text-muted-foreground font-mono text-right">{formatCost(data.total_cost_usd || 0)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {stats?.by_model && Object.keys(stats.by_model).length > 0 && (
        <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              Usage by Model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(stats.by_model)
                .sort((a: any, b: any) => (b[1].cost_usd || 0) - (a[1].cost_usd || 0))
                .map(([model, data]: [string, any]) => (
                <div key={model} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-mono text-xs">{model}</span>
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">{data.calls} calls</span>
                    <span className="text-foreground font-mono">{formatTokens(data.tokens)} tokens</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono">{formatCost(data.cost_usd || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {stats?.by_service && Object.keys(stats.by_service).length > 0 && (
        <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Cost by Service
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs">
              Per-call cost breakdown across the search pipeline
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <table className="w-full table-fixed text-xs">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border/50">
                  <th className="py-1.5 pr-2 text-left text-muted-foreground font-medium">Service</th>
                  <th className="py-1.5 px-1 text-right text-muted-foreground font-medium">Calls</th>
                  <th className="py-1.5 px-1 text-right text-muted-foreground font-medium">Tokens</th>
                  <th className="py-1.5 px-1 text-right text-muted-foreground font-medium">Avg Dur</th>
                  <th className="py-1.5 px-1 text-right text-muted-foreground font-medium">Cost</th>
                  <th className="py-1.5 pl-1 text-right text-muted-foreground font-medium">%</th>
                </tr>
              </thead>
              <tbody>
              {Object.entries(stats.by_service)
                .sort((a: any, b: any) => (b[1].cost_usd || 0) - (a[1].cost_usd || 0))
                .map(([service, data]: [string, any]) => {
                  const svcColors: Record<string, string> = {
                    ai_generate: 'text-blue-600 dark:text-blue-400',
                    ai_followup: 'text-indigo-600 dark:text-indigo-400',
                    classifier: 'text-amber-600 dark:text-amber-400',
                    agent_search: 'text-blue-600 dark:text-blue-400',
                    guardrails: 'text-emerald-600 dark:text-emerald-400',
                    manufacturer_discovery: 'text-purple-600 dark:text-purple-400',
                    history_compression: 'text-cyan-600 dark:text-cyan-400',
                    datasheet_verifier: 'text-rose-600 dark:text-rose-400',
                    web_search_tool: 'text-orange-600 dark:text-orange-400',
                  };
                  const totalCost = stats?.all_time?.total_cost_usd || 0;
                  const pct = totalCost > 0 ? ((data.cost_usd || 0) / totalCost) * 100 : 0;
                  return (
                    <tr key={service} className="border-b border-border/30 last:border-0">
                      <td className={`py-1.5 pr-2 truncate ${svcColors[service] || 'text-muted-foreground'}`} title={service.replace(/_/g, ' ')}>
                        {service.replace(/_/g, ' ')}
                      </td>
                      <td className="py-1.5 px-1 text-muted-foreground text-right">{data.calls} calls</td>
                      <td className="py-1.5 px-1 text-muted-foreground font-mono text-right">{formatTokens(data.tokens)} tok</td>
                      <td className="py-1.5 px-1 text-muted-foreground text-right">{formatDuration(data.avg_duration_ms)}</td>
                      <td className="py-1.5 px-1 text-emerald-600 dark:text-emerald-400 font-mono text-right">{formatCost(data.cost_usd || 0)}</td>
                      <td className="py-1.5 pl-1 text-muted-foreground text-right text-[10px]">{pct.toFixed(0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {stats?.by_intent && Object.keys(stats.by_intent).length > 0 && (
        <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Search className="w-4 h-4 text-green-400" />
              Queries by Intent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.by_intent).sort((a: any, b: any) => b[1] - a[1]).map(([intent, count]: [string, any]) => (
                <div key={intent} className="px-3 py-1.5 bg-muted rounded-full text-xs">
                  <span className="text-muted-foreground">{intent.replace(/_/g, ' ')}</span>
                  <span className="ml-2 text-foreground font-mono">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <RecentRequestsCard
        history={history || []}
        selectedUserId={null}
        selectedUserLabel={''}
        onClearUser={() => {}}
        formatTokens={formatTokens}
        formatCost={formatCost}
        formatDuration={formatDuration}
        formatTime={formatTime}
      />

      <ModelPricingPanel />
    </div>
  );
}

function PerUserAnalytics() {
  const [byUserMonth, setByUserMonth] = useState<'current' | 'previous' | 'all'>('current');
  const [byUserSort, setByUserSort] = useState<'cost' | 'requests' | 'tokens' | 'recent' | 'avg_latency' | 'p95_latency' | 'throughput'>('cost');
  const [byUserExpanded, setByUserExpanded] = useState<boolean>(true);
  const [byUserRange, setByUserRange] = useState<string>('');
  const [byUserModel, setByUserModel] = useState<string>('all');
  const [byUserSearchMode, setByUserSearchMode] = useState<string>('all');
  const [byUserFrom, setByUserFrom] = useState<string>('');
  const [byUserTo, setByUserTo] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserLabel, setSelectedUserLabel] = useState<string>('');

  const { data: knownModels } = useQuery<{ models: string[] }>({
    queryKey: ['/api/openai/usage/models'],
  });

  const byUserFiltersQs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('month', byUserMonth);
    if (byUserRange) {
      p.set('range', byUserRange);
      if (byUserRange === 'custom') {
        if (byUserFrom) p.set('from', new Date(byUserFrom).toISOString());
        if (byUserTo) p.set('to', new Date(byUserTo).toISOString());
      }
    }
    if (byUserModel !== 'all') p.set('model', byUserModel);
    if (byUserSearchMode !== 'all') p.set('searchMode', byUserSearchMode);
    return p.toString();
  }, [byUserMonth, byUserRange, byUserFrom, byUserTo, byUserModel, byUserSearchMode]);

  const { data: byUser, isLoading: byUserLoading } = useQuery<any>({
    queryKey: [`/api/openai/usage/by-user?${byUserFiltersQs}`],
    refetchInterval: 30000,
  });

  const handleSelectUser = (userId: string | null, label: string) => {
    setSelectedUserId(userId);
    setSelectedUserLabel(label);
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTokensLocal = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  const formatCost = (n: number) => {
    if (!n || n === 0) return '$0';
    if (n < 0.0001) return `$${n.toExponential(2)}`;
    if (n < 0.01) return `$${n.toFixed(5)}`;
    if (n < 1) return `$${n.toFixed(4)}`;
    if (n < 100) return `$${n.toFixed(3)}`;
    return `$${n.toFixed(2)}`;
  };

  const formatCostTotal = (n: number) => `$${(n || 0).toFixed(2)}`;
  const formatCostPerRequest = (n: number) => `$${(n || 0).toFixed(4)}`;

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60000) return 'just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const { data: rawGeoStats = [], isLoading: geoLoading } = useQuery<GeoEntry[]>({
    queryKey: ['/api/openai/admin/usage/geo-stats'],
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-6">
      <CostPerUserSection
        byUser={byUser}
        byUserLoading={byUserLoading}
        month={byUserMonth}
        setMonth={setByUserMonth}
        sort={byUserSort}
        setSort={setByUserSort}
        expanded={byUserExpanded}
        setExpanded={setByUserExpanded}
        selectedUserId={selectedUserId}
        onSelectUser={handleSelectUser}
        formatCost={formatCost}
        formatCostTotal={formatCostTotal}
        formatCostPerRequest={formatCostPerRequest}
        formatTokens={formatTokensLocal}
        formatTime={formatTime}
        range={byUserRange}
        setRange={setByUserRange}
        from={byUserFrom}
        setFrom={setByUserFrom}
        to={byUserTo}
        setTo={setByUserTo}
        model={byUserModel}
        setModel={setByUserModel}
        searchMode={byUserSearchMode}
        setSearchMode={setByUserSearchMode}
        knownModels={knownModels?.models || []}
        filtersQs={byUserFiltersQs}
      />

      {selectedUserId && (
        <UserAnalyticsDetail
          userId={selectedUserId}
          userLabel={selectedUserLabel}
          onClose={() => handleSelectUser(null, '')}
          formatCost={formatCost}
          formatCostTotal={formatCostTotal}
          formatTokens={formatTokensLocal}
          formatDuration={formatDuration}
          formatTime={formatTime}
        />
      )}

      <UserOriginsSection geoStats={rawGeoStats} isLoading={geoLoading} />
    </div>
  );
}

function UserOriginsSection({ geoStats, isLoading }: {
  geoStats: GeoEntry[];
  isLoading: boolean;
}) {
  const totalRequests = geoStats.reduce((s, e) => s + e.count, 0);
  const uniqueCountries = new Set(geoStats.map(e => e.country).filter(Boolean)).size;

  return (
    <Card className="bg-card/80 border-border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-foreground flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400" />
          User Origins
        </CardTitle>
        <div className="flex items-center gap-4 mt-1">
          <span className="text-xs text-muted-foreground">
            <span className="text-foreground font-mono">{uniqueCountries}</span> countr{uniqueCountries === 1 ? 'y' : 'ies'}
          </span>
          <span className="text-xs text-muted-foreground">
            <span className="text-foreground font-mono">{totalRequests}</span> located requests
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-12 flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading geo data…
          </div>
        ) : (
          <GeoStatsPanel data={geoStats} />
        )}
      </CardContent>
    </Card>
  );
}

// ----- Trends / Charts section -----

const MODEL_PIE_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#22d3ee', '#fb923c', '#f87171'];

const DAILY_CHART_CONFIG = {
  cost: { label: 'Cost', color: '#34d399' },
  requests: { label: 'Requests', color: '#60a5fa' },
} satisfies ChartConfig;

const TOP_USERS_CHART_CONFIG = {
  cost: { label: 'Cost', color: '#a78bfa' },
} satisfies ChartConfig;

const MODEL_CHART_CONFIG = {
  value: { label: 'Cost' },
} satisfies ChartConfig;

type TrendsRange = 'day' | 'week' | 'month' | 'year';

const TRENDS_RANGE_OPTIONS: { value: TrendsRange; label: string; description: string }[] = [
  { value: 'day', label: 'Day', description: 'last 24 hours' },
  { value: 'week', label: 'Week', description: 'last 7 days' },
  { value: 'month', label: 'Month', description: 'last 30 days' },
  { value: 'year', label: 'Year', description: 'last 12 months' },
];

function formatBucketLabel(key: string, range: TrendsRange): string {
  if (range === 'day') {
    // 2026-05-12T14
    const hh = key.slice(11, 13);
    return `${hh}:00`;
  }
  if (range === 'year') {
    // 2026-05
    const [y, m] = key.split('-');
    const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return dt.toLocaleString('en-US', { month: 'short', year: '2-digit' });
  }
  // week / month — daily key 2026-05-12
  const parts = key.split('-');
  if (parts.length !== 3) return key;
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (range === 'week') {
    const dt = new Date(parseInt(parts[0], 10), m - 1, d);
    return `${dt.toLocaleString('en-US', { weekday: 'short' })} ${m}/${d}`;
  }
  return `${m}/${d}`;
}

function formatBucketTooltip(key: string, range: TrendsRange): string {
  if (range === 'day') {
    const datePart = key.slice(0, 10);
    const hh = key.slice(11, 13);
    const [y, m, d] = datePart.split('-').map(n => parseInt(n, 10));
    const dt = new Date(y, m - 1, d, parseInt(hh, 10));
    return dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' });
  }
  if (range === 'year') {
    const [y, m] = key.split('-').map(n => parseInt(n, 10));
    return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }
  const [y, m, d] = key.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function shortenUserLabel(row: any): string {
  if (row.is_anonymous) return 'Anonymous';
  if (row.email) return row.email.length > 20 ? row.email.slice(0, 18) + '…' : row.email;
  if (row.name) return row.name;
  return row.user_id ? `User ${String(row.user_id).slice(0, 8)}` : 'Unknown';
}

interface TrendsChartsSectionProps {
  formatCostTotal: (n: number) => string;
}

const TRENDS_RANGE_STORAGE_KEY = 'adminUsageTrendsRange';

function TrendsChartsSection({ formatCostTotal }: TrendsChartsSectionProps) {
  const [range, setRangeState] = useState<TrendsRange>(() => {
    if (typeof window === 'undefined') return 'month';
    const stored = window.sessionStorage.getItem(TRENDS_RANGE_STORAGE_KEY);
    return (stored === 'day' || stored === 'week' || stored === 'month' || stored === 'year') ? stored : 'month';
  });
  const setRange = (next: TrendsRange) => {
    setRangeState(next);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(TRENDS_RANGE_STORAGE_KEY, next);
    }
  };

  const { data: seriesData, isLoading: seriesLoading } = useQuery<any>({
    queryKey: [`/api/openai/usage/series?range=${range}`],
    refetchInterval: 30000,
  });

  const dailySeries = useMemo(() => {
    const series: any[] = seriesData?.series ?? [];
    return series.map(d => ({
      ...d,
      label: formatBucketLabel(d.key, range),
      tooltipLabel: formatBucketTooltip(d.key, range),
      cost: Number((d.total_cost_usd || 0).toFixed(4)),
    }));
  }, [seriesData, range]);

  const rangeTotals = seriesData?.totals ?? { requests: 0, total_cost_usd: 0, total_tokens: 0 };
  const rangeOption = TRENDS_RANGE_OPTIONS.find(o => o.value === range)!;

  const topUsersLoading = seriesLoading;
  const topUsers = useMemo(() => {
    const users: any[] = seriesData?.top_users ?? [];
    return users
      .filter(u => !u.is_anonymous)
      .slice(0, 10)
      .map(u => ({
        ...u,
        label: shortenUserLabel(u),
        cost: Number((u.total_cost_usd || 0).toFixed(4)),
      }))
      .reverse();
  }, [seriesData]);

  const modelData = useMemo(() => {
    const byModel = seriesData?.by_model || {};
    return Object.entries(byModel)
      .map(([model, data]: [string, any]) => ({
        name: model,
        value: Number((data.cost_usd || 0).toFixed(4)),
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [seriesData]);

  const totalModelCost = modelData.reduce((acc, m) => acc + m.value, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-foreground">Trends</h3>
        <span className="text-xs text-muted-foreground">Visual overview for sizing subscription tiers</span>
      </div>

      <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow min-w-0">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-sm text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                Cost &amp; Requests &mdash; {rangeOption.description}
              </CardTitle>
              <CardDescription className="text-muted-foreground text-xs mt-1">
                Bars show cost in USD; line shows request count. Total {formatCostTotal(rangeTotals.total_cost_usd || 0)} over {rangeTotals.requests || 0} requests.
              </CardDescription>
            </div>
            <div className="inline-flex items-center rounded-md border border-border bg-muted p-0.5 shrink-0" data-testid="trends-range-switcher">
              {TRENDS_RANGE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRange(opt.value)}
                  data-testid={`trends-range-${opt.value}`}
                  className={`px-3 py-1 text-xs rounded-sm transition-colors ${
                    range === opt.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 overflow-hidden">
          {seriesLoading ? (
            <div className="h-[260px] w-full p-2 space-y-2">
              <Skeleton className="h-[220px] w-full bg-muted/70" />
              <Skeleton className="h-3 w-1/3 bg-muted/70" />
            </div>
          ) : dailySeries.length === 0 || dailySeries.every(d => d.requests === 0) ? (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              No usage recorded in the {rangeOption.description}.
            </div>
          ) : (
            <ChartContainer
              config={DAILY_CHART_CONFIG}
              className="h-[260px] w-full aspect-auto"
            >
                <ComposedChart data={dailySeries} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" style={{ stroke: 'var(--border)' }} />
                  <XAxis
                    dataKey="label"
                    tick={{ style: { fill: 'var(--muted-foreground)', fontSize: 11 } }}
                    axisLine={{ style: { stroke: 'var(--border)' } }}
                    tickLine={{ style: { stroke: 'var(--border)' } }}
                    interval="preserveStartEnd"
                    minTickGap={range === 'day' ? 18 : 8}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ style: { fill: 'var(--muted-foreground)', fontSize: 11 } }}
                    axisLine={{ style: { stroke: 'var(--border)' } }}
                    tickLine={{ style: { stroke: 'var(--border)' } }}
                    tickFormatter={(v) => `$${v.toFixed(2)}`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ style: { fill: 'var(--muted-foreground)', fontSize: 11 } }}
                    axisLine={{ style: { stroke: 'var(--border)' } }}
                    tickLine={{ style: { stroke: 'var(--border)' } }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--popover-foreground)' }}
                    labelStyle={{ color: 'var(--muted-foreground)' }}
                    labelFormatter={(_label: any, payload: any) => payload?.[0]?.payload?.tooltipLabel ?? _label}
                    formatter={(value: any, name: string) => {
                      if (name === 'Cost') return [formatCostTotal(Number(value)), name];
                      return [value, name];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--foreground)' }} />
                  <Bar yAxisId="left" dataKey="cost" name="Cost" fill="#34d399" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="requests" name="Requests" stroke="#60a5fa" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-purple-400" />
              Top 10 Users by Cost &mdash; {rangeOption.description}
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs">
              Authenticated users only. Use this to set subscription tiers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topUsersLoading ? (
              <div className="h-[280px] w-full p-2 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full bg-muted/70" />
                ))}
              </div>
            ) : topUsers.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No authenticated users in the {rangeOption.description}.
              </div>
            ) : (
              <ChartContainer
                config={TOP_USERS_CHART_CONFIG}
                className="w-full aspect-auto"
                style={{ height: Math.max(220, 32 * topUsers.length + 40) }}
              >
                  <BarChart data={topUsers} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" style={{ stroke: 'var(--border)' }} horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ style: { fill: 'var(--muted-foreground)', fontSize: 11 } }}
                      axisLine={{ style: { stroke: 'var(--border)' } }}
                      tickLine={{ style: { stroke: 'var(--border)' } }}
                      tickFormatter={(v) => `$${v.toFixed(2)}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ style: { fill: 'var(--foreground)', fontSize: 11 } }}
                      axisLine={{ style: { stroke: 'var(--border)' } }}
                      tickLine={{ style: { stroke: 'var(--border)' } }}
                      width={130}
                      interval={0}
                    />
                    <Tooltip
                      contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--popover-foreground)' }}
                      labelStyle={{ color: 'var(--muted-foreground)' }}
                      formatter={(value: any) => [formatCostTotal(Number(value)), 'Cost']}
                    />
                    <Bar dataKey="cost" fill="#a78bfa" radius={[0, 3, 3, 0]} />
                  </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Brain className="w-4 h-4 text-amber-400" />
              Cost Breakdown by Model &mdash; {rangeOption.description}
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs">
              Where your spend goes across models and tools.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {modelData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No model cost recorded yet.
              </div>
            ) : (
              <ChartContainer
                config={MODEL_CHART_CONFIG}
                className="h-[280px] w-full aspect-auto"
              >
                  <PieChart>
                    <Pie
                      data={modelData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {modelData.map((_, i) => (
                        <Cell key={i} fill={MODEL_PIE_COLORS[i % MODEL_PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.length) return null;
                        const { name, value } = payload[0];
                        const pct = totalModelCost > 0 ? ((Number(value) / totalModelCost) * 100).toFixed(1) : '0';
                        return (
                          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-lg">
                            <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 mb-0.5">{name}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-300">{formatCostTotal(Number(value))} ({pct}%)</p>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      wrapperStyle={{ fontSize: 11, color: 'var(--foreground)' }}
                      formatter={(value: any) => <span className="text-muted-foreground">{value}</span>}
                    />
                  </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ----- Cost per User table -----

interface CostPerUserSectionProps {
  byUser: any;
  byUserLoading: boolean;
  month: 'current' | 'previous' | 'all';
  setMonth: (m: 'current' | 'previous' | 'all') => void;
  sort: 'cost' | 'requests' | 'tokens' | 'recent' | 'avg_latency' | 'p95_latency' | 'throughput';
  setSort: (s: 'cost' | 'requests' | 'tokens' | 'recent' | 'avg_latency' | 'p95_latency' | 'throughput') => void;
  expanded: boolean;
  setExpanded: (b: boolean) => void;
  selectedUserId: string | null;
  onSelectUser: (userId: string | null, label: string) => void;
  formatCost: (n: number) => string;
  formatCostTotal: (n: number) => string;
  formatCostPerRequest: (n: number) => string;
  formatTokens: (n: number) => string;
  formatTime: (ts: number) => string;
  range: string;
  setRange: (v: string) => void;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  searchMode: string;
  setSearchMode: (v: string) => void;
  knownModels: string[];
  filtersQs: string;
}

function CostPerUserSection({ byUser, byUserLoading, month, setMonth, sort, setSort, expanded, setExpanded, selectedUserId, onSelectUser, formatCost, formatCostTotal, formatCostPerRequest, formatTokens, formatTime, range, setRange, from, setFrom, to, setTo, model, setModel, searchMode, setSearchMode, knownModels, filtersQs }: CostPerUserSectionProps) {
  const sortedRows = useMemo(() => {
    const all: any[] = (byUser?.users ?? []).slice();
    const named = all.filter(r => !r.is_anonymous);
    const anon = all.filter(r => r.is_anonymous);
    named.sort((a, b) => {
      switch (sort) {
        case 'requests': return b.requests - a.requests;
        case 'tokens': return b.total_tokens - a.total_tokens;
        case 'recent': return (b.last_seen || 0) - (a.last_seen || 0);
        case 'avg_latency': return (b.avg_latency_ms || 0) - (a.avg_latency_ms || 0);
        case 'p95_latency': return (b.p95_latency_ms || 0) - (a.p95_latency_ms || 0);
        case 'throughput': return (b.throughput_tps || 0) - (a.throughput_tps || 0);
        case 'cost':
        default:
          return b.total_cost_usd - a.total_cost_usd;
      }
    });
    return [...named, ...anon];
  }, [byUser, sort]);

  const handleExportCsv = async () => {
    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const resp = await fetch(`/api/openai/usage/by-user/export.csv?${filtersQs}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error(`Export failed (${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `by-user-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export failed', err);
    }
  };

  const totals = byUser?.totals || { requests: 0, total_tokens: 0, total_cost_usd: 0 };
  const authenticatedUsers = byUser?.authenticated_users || 0;

  const isRowSelected = (r: any) => {
    if (selectedUserId === '__anon__') return r.is_anonymous;
    return !!r.user_id && r.user_id === selectedUserId;
  };

  const handleRowClick = (r: any) => {
    const id = r.is_anonymous ? '__anon__' : r.user_id;
    if (!id) return;
    const label = r.email || r.name || (r.is_anonymous ? 'Anonymous' : `User ${String(r.user_id || '').slice(0, 8)}`);
    if (id === selectedUserId) {
      onSelectUser(null, '');
    } else {
      onSelectUser(id, label);
    }
  };

  return (
    <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={expanded ? 'Collapse Cost per User' : 'Expand Cost per User'}
              data-testid="button-toggle-cost-per-user"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <div>
              <CardTitle className="text-sm text-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                Cost per User — {byUser?.month_label || 'Current month'}
              </CardTitle>
              <CardDescription className="text-muted-foreground text-xs mt-1">
                Use as input for subscription tier sizing. Click a row to open the per-user drill-down panel. Anonymous traffic is grouped at the bottom.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!range && (
              <Select
                value={month}
                onValueChange={(v) => {
                  if (v === 'current' || v === 'previous' || v === 'all') {
                    setMonth(v);
                  }
                }}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs bg-muted border-border" data-testid="select-byuser-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current month</SelectItem>
                  <SelectItem value="previous">Previous month</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={range || '__month'} onValueChange={(v) => setRange(v === '__month' ? '' : v)}>
              <SelectTrigger className="w-[130px] h-8 text-xs bg-muted border-border" data-testid="select-byuser-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__month">Month picker</SelectItem>
                <SelectItem value="hour">Last hour</SelectItem>
                <SelectItem value="day">Last 24h</SelectItem>
                <SelectItem value="week">Last 7 days</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="custom">Custom…</SelectItem>
              </SelectContent>
            </Select>
            {range === 'custom' && (
              <>
                <input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 text-xs bg-muted border border-border rounded px-2"
                  data-testid="input-byuser-from"
                />
                <input
                  type="datetime-local"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 text-xs bg-muted border border-border rounded px-2"
                  data-testid="input-byuser-to"
                />
              </>
            )}
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-[160px] h-8 text-xs bg-muted border-border" data-testid="select-byuser-model">
                <SelectValue placeholder="All models" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All models</SelectItem>
                {knownModels.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={searchMode} onValueChange={setSearchMode}>
              <SelectTrigger className="w-[130px] h-8 text-xs bg-muted border-border" data-testid="select-byuser-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="genius_generate">Genius Generate</SelectItem>
                <SelectItem value="genius_followup">Genius Follow-up</SelectItem>
                <SelectItem value="hybrid">Hybrid Search</SelectItem>
                <SelectItem value="agent">Agent Search</SelectItem>
                <SelectItem value="db">DB Search</SelectItem>
                <SelectItem value="web">Web Search</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={handleExportCsv}
              data-testid="button-byuser-export-csv"
            >
              Export CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
      <CardContent>
        {byUserLoading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />Loading users…
          </div>
        ) : sortedRows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            No usage recorded for this period.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-3 text-xs">
              <div className="p-2 bg-muted rounded">
                <p className="text-muted-foreground">Authenticated users</p>
                <p className="text-foreground font-mono text-base">{authenticatedUsers}</p>
              </div>
              <div className="p-2 bg-muted rounded">
                <p className="text-muted-foreground">Total requests</p>
                <p className="text-foreground font-mono text-base">{totals.requests}</p>
              </div>
              <div className="p-2 bg-muted rounded">
                <p className="text-muted-foreground">Total cost</p>
                <p className="text-emerald-600 dark:text-emerald-400 font-mono text-base">{formatCostTotal(totals.total_cost_usd)}</p>
              </div>
            </div>
            {selectedUserId && (
              <div className="mb-3 flex items-center justify-between gap-2 px-3 py-2 bg-muted/60 border border-border rounded text-xs">
                <span className="text-foreground">
                  Filtering Recent Requests by selected user. Click the row again to clear, or use the button.
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-muted-foreground hover:text-foreground"
                  onClick={() => onSelectUser(null, '')}
                  data-testid="button-clear-user-filter"
                >
                  All users
                </Button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-muted-foreground uppercase border-b border-border/40">
                    <th className="text-left py-2 px-2">User</th>
                    <th className="text-right py-2 px-2 cursor-pointer hover:text-muted-foreground" onClick={() => setSort('requests')}>
                      <span className="inline-flex items-center gap-1">Requests {sort === 'requests' && <ArrowUpDown className="w-3 h-3" />}</span>
                    </th>
                    <th className="text-right py-2 px-2 cursor-pointer hover:text-muted-foreground" onClick={() => setSort('tokens')}>
                      <span className="inline-flex items-center gap-1">Tokens {sort === 'tokens' && <ArrowUpDown className="w-3 h-3" />}</span>
                    </th>
                    <th className="text-right py-2 px-2 cursor-pointer hover:text-muted-foreground" onClick={() => setSort('cost')}>
                      <span className="inline-flex items-center gap-1">Total Cost {sort === 'cost' && <ArrowUpDown className="w-3 h-3" />}</span>
                    </th>
                    <th className="text-right py-2 px-2">Avg / Search</th>
                    <th className="text-right py-2 px-2 cursor-pointer hover:text-muted-foreground" onClick={() => setSort('avg_latency')}>
                      <span className="inline-flex items-center gap-1">Avg Latency {sort === 'avg_latency' && <ArrowUpDown className="w-3 h-3" />}</span>
                    </th>
                    <th className="text-right py-2 px-2 cursor-pointer hover:text-muted-foreground" onClick={() => setSort('p95_latency')}>
                      <span className="inline-flex items-center gap-1">P95 Latency {sort === 'p95_latency' && <ArrowUpDown className="w-3 h-3" />}</span>
                    </th>
                    <th className="text-right py-2 px-2 cursor-pointer hover:text-muted-foreground" onClick={() => setSort('throughput')}>
                      <span className="inline-flex items-center gap-1">Throughput (t/s) {sort === 'throughput' && <ArrowUpDown className="w-3 h-3" />}</span>
                    </th>
                    <th className="text-left py-2 px-2">Top Model</th>
                    <th className="text-right py-2 px-2 cursor-pointer hover:text-muted-foreground" onClick={() => setSort('recent')}>
                      <span className="inline-flex items-center gap-1">Last Activity {sort === 'recent' && <ArrowUpDown className="w-3 h-3" />}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r) => {
                    const selected = isRowSelected(r);
                    return (
                    <tr
                      key={r.is_anonymous ? '__anon' : r.user_id}
                      onClick={() => handleRowClick(r)}
                      className={`border-b border-border/30 last:border-0 cursor-pointer transition-colors ${selected ? 'bg-primary/10 hover:bg-primary/20' : r.is_anonymous ? 'bg-muted/40 hover:bg-muted' : 'hover:bg-muted/60'}`}
                      data-testid={`row-user-${r.is_anonymous ? 'anon' : r.user_id}`}
                    >
                      <td className="py-2 px-2">
                        <div className="flex flex-col">
                          <span className={r.is_anonymous ? 'text-muted-foreground italic' : selected ? 'text-primary' : 'text-foreground'}>
                            {r.email || r.name || (r.is_anonymous ? 'Anonymous' : `User ${String(r.user_id || '').slice(0, 8)}`)}
                          </span>
                          {r.role && !r.is_anonymous && (
                            <span className="text-[10px] text-muted-foreground">{r.role}</span>
                          )}
                          {r.is_anonymous && (
                            <span className="text-[10px] text-muted-foreground">{r.name}</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right py-2 px-2 text-muted-foreground font-mono">{r.requests}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground font-mono">{formatTokens(r.total_tokens)}</td>
                      <td className="text-right py-2 px-2 text-emerald-600 dark:text-emerald-400 font-mono">{formatCostTotal(r.total_cost_usd)}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground font-mono">{formatCostPerRequest(r.avg_cost_usd)}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground font-mono">{r.avg_latency_ms ? `${Math.round(r.avg_latency_ms)} ms` : '—'}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground font-mono">{r.p95_latency_ms ? `${Math.round(r.p95_latency_ms)} ms` : '—'}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground font-mono">{r.throughput_tps ? r.throughput_tps.toFixed(1) : '—'}</td>
                      <td className="text-left py-2 px-2 text-muted-foreground text-[11px]">{r.top_model || '—'}</td>
                      <td className="text-right py-2 px-2 text-muted-foreground">{r.last_seen ? formatTime(r.last_seen) : '—'}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
      )}
    </Card>
  );
}

// ----- Recent Requests card (filterable by selected user) -----

interface RecentRequestsCardProps {
  history: any[];
  selectedUserId: string | null;
  selectedUserLabel: string;
  onClearUser: () => void;
  formatTokens: (n: number) => string;
  formatCost: (n: number) => string;
  formatDuration: (ms: number) => string;
  formatTime: (ts: number) => string;
}

function RecentRequestsCard({ history, selectedUserId, selectedUserLabel, onClearUser, formatTokens, formatCost, formatDuration, formatTime }: RecentRequestsCardProps) {
  const filtered = useMemo(() => {
    if (!selectedUserId) return history;
    if (selectedUserId === '__anon__') return history.filter((r) => !r.user_id);
    return history.filter((r) => r.user_id != null && String(r.user_id) === String(selectedUserId));
  }, [history, selectedUserId]);

  return (
    <Card className="bg-card/80 border-border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Recent Requests
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {selectedUserId
                ? `Showing ${filtered.length} of ${history.length} requests for ${selectedUserLabel || 'selected user'}`
                : `Last ${history.length} requests tracked.`}
            </CardDescription>
          </div>
          {selectedUserId && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={onClearUser}
              data-testid="button-show-all-requests"
            >
              Show all users
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">No requests tracked yet. Try making a search query.</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No requests for this user in the recent history.
          </p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filtered.map((req: any, i: number) => (
              <div key={req.request_id || i} className="p-3 bg-muted rounded-lg border border-border/50 hover:border-border transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm text-foreground font-medium truncate flex-1">{req.query}</p>
                  <span className="text-xs text-muted-foreground shrink-0">{formatTime(req.timestamp)}</span>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="text-muted-foreground">
                    <Zap className="w-3 h-3 inline mr-1 text-yellow-400" />
                    {formatTokens(req.total_tokens?.total_tokens || 0)} tokens
                  </span>
                  <span className="text-muted-foreground">
                    <DollarSign className="w-3 h-3 inline mr-1 text-emerald-400" />
                    {formatCost(req.total_cost_usd || 0)}
                  </span>
                  <span className="text-muted-foreground">
                    <Clock className="w-3 h-3 inline mr-1 text-green-400" />
                    {formatDuration(req.total_duration_ms || 0)}
                  </span>
                  <span className="text-muted-foreground">
                    {req.search_mode?.startsWith('genius')
                      ? `${req.products_found ?? 0} steps`
                      : `${req.products_found ?? 0} products`}
                  </span>
                  {req.classification_intent && (
                    <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">
                      {req.classification_intent}
                    </span>
                  )}
                  {req.user_id ? (
                    <span className="text-primary">
                      <Users className="w-3 h-3 inline mr-1" />
                      {req.name || `User ${String(req.user_id).slice(0, 8)}`}
                      {req.email && <span className="text-muted-foreground ml-1">({req.email})</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      <Globe className="w-3 h-3 inline mr-1" />
                      {req.ip_address || 'unknown'}
                      {req.country && ` (${[req.city, req.country].filter(Boolean).join(', ')})`}
                    </span>
                  )}
                </div>
                {req.api_calls && req.api_calls.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="flex flex-wrap gap-2">
                      {req.api_calls.map((call: any, j: number) => {
                        const colors: Record<string, string> = {
                          ai_generate: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
                          ai_followup: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
                          classifier: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
                          agent_search: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
                          guardrails: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
                        };
                        const colorClass = colors[call.service] || 'bg-muted text-muted-foreground';
                        return (
                          <span key={j} className={`text-xs px-2 py-0.5 rounded border ${colorClass}`}>
                            {call.service} ({call.model}) - {formatTokens(call.tokens?.total_tokens || 0)} tok / {formatDuration(call.duration_ms || 0)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
