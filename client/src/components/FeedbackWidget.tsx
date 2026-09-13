import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedbackChatContext } from "@/contexts/FeedbackChatContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { MessageSquarePlus, CheckCircle, Clock, ThumbsUp, XCircle, ExternalLink, MessageCircle } from "lucide-react";

interface FeedbackItem {
  id: number;
  pageUrl: string;
  bullets: string[];
  status: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  new:       { label: "New",       color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",     icon: Clock },
  reviewed:  { label: "Reviewed",  color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30", icon: Clock },
  valid:     { label: "Valid",     color: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",  icon: ThumbsUp },
  dismissed: { label: "Dismissed", color: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30",     icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.new;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function FeedbackWidget() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { firstChatPrompt } = useFeedbackChatContext();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [searchExtra, setSearchExtra] = useState(0);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const mqHandler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', mqHandler);
    return () => mq.removeEventListener('change', mqHandler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setSearchExtra((e as CustomEvent<{ extra: number }>).detail.extra ?? 0);
    window.addEventListener('df:searchbar-resize', handler);
    return () => window.removeEventListener('df:searchbar-resize', handler);
  }, []);

  const { data: history = [], isLoading: historyLoading } = useQuery<FeedbackItem[]>({
    queryKey: ["/api/feedback/mine"],
    enabled: open && isAuthenticated,
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: { bullets: string[]; pageUrl: string }) =>
      apiRequest("/api/feedback", {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setText("");
        setOpen(false);
      }, 2000);
    },
    onError: () => {
      toast({ title: "Failed to submit feedback", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    const bullets = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (bullets.length === 0) return;
    const pageUrl = window.location.pathname + window.location.search;
    const allBullets = firstChatPrompt
      ? [...bullets, `Prompt: ${firstChatPrompt}`]
      : bullets;
    submitMutation.mutate({ bullets: allBullets, pageUrl });
  };

  if (!isAuthenticated) return null;

  const pageUrl = window.location.pathname + window.location.search;

  // Sort newest-first
  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-28 sm:bottom-6 left-4 z-[110] flex items-center gap-1.5 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 text-xs font-medium px-3 py-2 rounded-full shadow-lg transition-all hover:scale-105"
        style={isMobile ? { bottom: `${112 + searchExtra}px` } : undefined}
        aria-label="Open feedback"
      >
        <MessageSquarePlus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
        Feedback
      </button>

      <Sheet open={open} onOpenChange={setOpen} modal={false}>
        <SheetContent
          side="left"
          className="w-80 sm:w-96 bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 flex flex-col p-0 !z-[110] shadow-2xl"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <SheetHeader className="px-4 pt-5 pb-4 pr-12 border-b border-gray-200 dark:border-gray-800">
            <SheetTitle className="text-gray-900 dark:text-white flex items-center gap-2 text-base">
              <MessageSquarePlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Beta Feedback
            </SheetTitle>
            <SheetDescription className="sr-only">
              Share feedback about this page. One thought per line.
            </SheetDescription>
          </SheetHeader>

          <Tabs defaultValue="write" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-4 mt-4 h-auto p-1 bg-gray-100 dark:bg-gray-900 rounded-lg shrink-0">
              <TabsTrigger
                value="write"
                className="flex-1 text-sm font-medium py-1.5 text-gray-600 dark:text-gray-400 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
              >
                Write
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="flex-1 text-sm font-medium py-1.5 text-gray-600 dark:text-gray-400 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:text-gray-900 dark:data-[state=active]:text-white data-[state=active]:shadow-sm"
              >
                My Feedback
                {history.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs px-1.5 py-0.5 rounded-full leading-none">
                    {history.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="write" className="flex-1 overflow-y-auto !mt-0">
              <div className="flex flex-col h-full px-4 pb-4 pt-3">
                {submitted ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                    <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
                    <p className="text-green-700 dark:text-green-300 font-medium">Thank you!</p>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Your feedback has been saved.</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded px-2 py-1.5 border border-gray-200 dark:border-gray-800">
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate font-mono">{pageUrl}</span>
                    </div>
                    {firstChatPrompt && (
                      <div className="mb-3 flex items-start gap-2 text-xs bg-purple-50 dark:bg-purple-950/40 rounded px-2 py-1.5 border border-purple-200 dark:border-purple-800">
                        <MessageCircle className="w-3 h-3 shrink-0 mt-0.5 text-purple-500 dark:text-purple-400" />
                        <div className="min-w-0">
                          <span className="font-semibold text-purple-700 dark:text-purple-300 mr-1">Prompt:</span>
                          <button
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              navigate(`/deepsearch?q=${encodeURIComponent(firstChatPrompt!)}`);
                            }}
                            className="text-purple-600 dark:text-purple-400 italic line-clamp-2 underline underline-offset-2 decoration-dotted hover:text-purple-800 dark:hover:text-purple-200 cursor-pointer text-left"
                          >
                            "{firstChatPrompt}"
                          </button>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      One thought per line — each becomes a bullet point.
                    </p>
                    <Textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={"The search results load too slowly\nI'd love dark mode on the product page\nAdd export to CSV for results"}
                      className="flex-1 min-h-[180px] bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm resize-none"
                    />
                    <div className="flex gap-2 mt-3 shrink-0">
                      <Button
                        onClick={handleSubmit}
                        disabled={!text.trim() || submitMutation.isPending}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm"
                      >
                        {submitMutation.isPending ? "Submitting…" : "Submit"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setOpen(false)}
                        className="border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 text-sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-3 !mt-0">
              {historyLoading ? (
                <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-10">Loading…</div>
              ) : sortedHistory.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-10">
                  <MessageSquarePlus className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No feedback submitted yet.
                </div>
              ) : (
                sortedHistory.map((item) => (
                  <div
                    key={item.id}
                    className="bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-800 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 truncate">{item.pageUrl}</span>
                      <StatusBadge status={item.status} />
                    </div>
                    <ul className="space-y-1">
                      {item.bullets.map((b, i) => (
                        <li key={i} className="text-xs text-gray-700 dark:text-gray-200 flex gap-1.5">
                          <span className="text-blue-600 dark:text-blue-400 shrink-0">•</span>
                          {b}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{relativeTime(item.createdAt)}</p>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}
