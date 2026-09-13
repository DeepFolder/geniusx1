import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  MessageSquarePlus,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  Trash2,
  Loader2,
  Download,
  Sparkles,
  CheckCheck,
  Copy,
  Check,
} from "lucide-react";

interface AdminFeedbackItem {
  id: number;
  pageUrl: string;
  bullets: string[];
  status: string;
  createdAt: string;
  authorName: string;
  authorRole: string;
}

interface Proposal {
  id: number;
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
}

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin:          "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  company_admin:  "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  company_member: "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30",
  public:         "bg-muted text-muted-foreground border-border",
};

const PRIORITY_BADGE: Record<string, string> = {
  high:   "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  low:    "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
};

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

interface AdminFeedbackListProps {
  enabled?: boolean;
}

export default function AdminFeedbackList({ enabled = true }: AdminFeedbackListProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"new" | "resolved" | "summary">("new");
  const [isExporting, setIsExporting] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [resolved, setResolved] = useState<Set<number>>(new Set());
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const handleCopyPrompt = (id: number, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      toast({ title: "Prompt copied to clipboard" });
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      toast({ title: "Failed to copy", variant: "destructive" });
    });
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const token =
        localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
      const res = await fetch("/api/feedback/export.csv", {
        credentials: "include",
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename =
        match?.[1] || `beta-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({
        title: "Failed to export feedback",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const { data: items = [], isLoading, isError, error } = useQuery<AdminFeedbackItem[]>({
    queryKey: ["/api/feedback"],
    enabled,
    staleTime: 60_000,
    retry: (failureCount, err) => {
      const msg = err instanceof Error ? err.message : "";
      if (/^(401|403)/.test(msg)) return false;
      return failureCount < 2;
    },
  });

  const errorMessage = error instanceof Error ? error.message : "";
  const isForbidden = /^(401|403)/.test(errorMessage);

  const resolveMutation = useMutation({
    mutationFn: async (id: number) =>
      apiRequest(`/api/feedback/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "valid" }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/mine"] });
    },
    onError: () => toast({ title: "Failed to update feedback", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiRequest(`/api/feedback/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/mine"] });
    },
    onError: () => toast({ title: "Failed to delete feedback", variant: "destructive" }),
  });

  const summarizeMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/feedback/summarize", { method: "POST" }) as Promise<{ proposals: Proposal[] }>,
    onSuccess: (data) => {
      const sorted = [...(data.proposals ?? [])].sort(
        (a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2)
      );
      setProposals(sorted);
      setResolved(new Set());
    },
    onError: () => toast({ title: "Failed to generate AI summary", variant: "destructive" }),
  });

  const toggleResolved = (id: number) => {
    setResolved((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const newItems = items.filter((i) => i.status === "new");
  const resolvedItems = items.filter((i) => i.status !== "new");

  const renderCard = (fb: AdminFeedbackItem, action: "resolve" | "delete") => (
    <div
      key={fb.id}
      className="bg-muted/40 border border-border rounded-lg p-3 space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm font-medium text-foreground shrink-0">
            {fb.authorName}
          </span>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium shrink-0 ${
              ROLE_BADGE_COLORS[fb.authorRole] ?? ROLE_BADGE_COLORS.public
            }`}
          >
            {fb.authorRole}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {new Date(fb.createdAt).toLocaleString()}
          </span>
        </div>
        {action === "resolve" ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 border-green-500/40 text-green-700 dark:text-green-300 hover:bg-green-500/10"
            disabled={resolveMutation.isPending && resolveMutation.variables === fb.id}
            onClick={() => resolveMutation.mutate(fb.id)}
          >
            {resolveMutation.isPending && resolveMutation.variables === fb.id ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3 h-3" />
            )}
            Mark as Resolved
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-red-600 dark:text-red-400 hover:bg-red-500/10"
            disabled={deleteMutation.isPending && deleteMutation.variables === fb.id}
            onClick={() => {
              if (window.confirm("Delete this feedback permanently?")) {
                deleteMutation.mutate(fb.id);
              }
            }}
            aria-label="Delete feedback"
          >
            {deleteMutation.isPending && deleteMutation.variables === fb.id ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-muted border border-border rounded px-2 py-1">
        <ExternalLink className="w-3 h-3 shrink-0" />
        <span className="truncate">{fb.pageUrl}</span>
      </div>
      {(() => {
        const promptPrefix = "Prompt: ";
        const promptBullet = fb.bullets.find((b) => b.startsWith(promptPrefix));
        const promptText = promptBullet ? promptBullet.slice(promptPrefix.length) : null;
        const otherBullets = fb.bullets.filter((b) => !b.startsWith(promptPrefix));
        return (
          <>
            {promptText && (
              <div className="flex items-start gap-1.5 pb-1 border-b border-border/60">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground shrink-0 mt-0.5">Prompt:</span>
                <a
                  href={`/?q=${encodeURIComponent(promptText)}`}
                  className="text-sm underline underline-offset-2 decoration-dotted text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 break-all flex-1"
                  title="Open in Genius X1"
                >
                  {promptText}
                </a>
                <button
                  onClick={() => handleCopyPrompt(fb.id, promptText)}
                  title="Copy prompt"
                  className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors mt-0.5"
                >
                  {copiedId === fb.id
                    ? <Check className="w-3.5 h-3.5 text-green-500" />
                    : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
            {otherBullets.length > 0 && (
              <ul className="space-y-1 pl-1">
                {otherBullets.map((b, i) => (
                  <li key={i} className="text-sm text-foreground flex gap-2">
                    <span className="text-primary shrink-0">•</span>
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      })()}
    </div>
  );

  const tabTriggerClass =
    "flex-1 text-sm font-medium py-1.5 text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-primary" />
            Beta Feedback
            <span className="text-sm font-normal text-muted-foreground">
              ({items.length})
            </span>
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            disabled={isExporting || isLoading || isError || items.length === 0}
            onClick={handleExportCsv}
            data-testid="button-export-feedback-csv"
            title={items.length === 0 ? "No feedback to export yet" : "Download all feedback as CSV"}
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Download CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : isError ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-amber-500 opacity-80" />
            {isForbidden
              ? "You don't have permission to view all feedback. Platform admin access required."
              : "Couldn't load feedback. Please try again."}
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "new" | "resolved" | "summary")}>
            <TabsList className="h-auto p-1 bg-muted rounded-lg w-full">
              <TabsTrigger value="new" className={tabTriggerClass}>
                New
                <span className="ml-1.5 inline-flex items-center bg-muted-foreground/20 text-foreground text-xs px-1.5 py-0.5 rounded-full leading-none">
                  {newItems.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="resolved" className={tabTriggerClass}>
                Resolved
                <span className="ml-1.5 inline-flex items-center bg-muted-foreground/20 text-foreground text-xs px-1.5 py-0.5 rounded-full leading-none">
                  {resolvedItems.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="summary" className={tabTriggerClass}>
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                AI Summary
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="mt-4">
              {newItems.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <MessageSquarePlus className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No new feedback.
                </div>
              ) : (
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  {newItems.map((fb) => renderCard(fb, "resolve"))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="resolved" className="mt-4">
              {resolvedItems.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No resolved feedback yet.
                </div>
              ) : (
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  {resolvedItems.map((fb) => renderCard(fb, "delete"))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="summary" className="mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    Sends all feedback to AI — merges duplicates and returns prioritised action proposals.
                  </p>
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5 shrink-0"
                    disabled={summarizeMutation.isPending || items.length === 0}
                    onClick={() => summarizeMutation.mutate()}
                    title={items.length === 0 ? "No feedback to summarise" : "Run AI analysis"}
                  >
                    {summarizeMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {summarizeMutation.isPending ? "Analysing…" : "Summarize"}
                  </Button>
                </div>

                {summarizeMutation.isPending && (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin opacity-50" />
                    AI is reasoning over {items.length} feedback items…
                  </div>
                )}

                {!summarizeMutation.isPending && proposals.length === 0 && !summarizeMutation.isSuccess && (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Click Summarize to generate action proposals.
                  </div>
                )}

                {!summarizeMutation.isPending && summarizeMutation.isSuccess && proposals.length === 0 && (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No proposals generated — feedback may be too sparse.
                  </div>
                )}

                {proposals.length > 0 && !summarizeMutation.isPending && (
                  <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                    {proposals.map((p, idx) => {
                      const isResolved = resolved.has(p.id);
                      return (
                        <div
                          key={p.id}
                          className={`border rounded-lg p-3 space-y-1.5 transition-opacity ${
                            isResolved
                              ? "opacity-50 bg-muted/20 border-border/50"
                              : "bg-muted/40 border-border"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="text-xs font-semibold text-muted-foreground shrink-0">
                                #{idx + 1}
                              </span>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border font-medium shrink-0 ${
                                  PRIORITY_BADGE[p.priority] ?? PRIORITY_BADGE.low
                                }`}
                              >
                                {p.priority.charAt(0).toUpperCase() + p.priority.slice(1)}
                              </span>
                              <span
                                className={`text-sm font-medium ${
                                  isResolved ? "line-through text-muted-foreground" : "text-foreground"
                                }`}
                              >
                                {p.title}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant={isResolved ? "secondary" : "outline"}
                              className={`h-7 text-xs gap-1 shrink-0 ${
                                isResolved
                                  ? "text-muted-foreground"
                                  : "border-green-500/40 text-green-700 dark:text-green-300 hover:bg-green-500/10"
                              }`}
                              onClick={() => toggleResolved(p.id)}
                            >
                              <CheckCheck className="w-3 h-3" />
                              {isResolved ? "Undo" : "Resolved"}
                            </Button>
                          </div>
                          <p
                            className={`text-sm leading-relaxed ${
                              isResolved ? "line-through text-muted-foreground" : "text-muted-foreground"
                            }`}
                          >
                            {p.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
