import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  generateCalc,
  messageCalc,
  recalcCalc,
  saveCalc,
  deleteCalc,
  patchCalc,
  createStepComment,
  updateStepComment,
  deleteStepComment,
  uploadDocument,
  planFromText,
  planCalculationExample,
  refineProposal,
  buildFromProposal,
  cancelJobRequest,
  explainCalculationStep,
  getCalculationVersion,
  getCalculationVersions,
  saveCalculationDetails,
  CancelledError,
  pollJob,
  type CalculationDetails,
  type CalcOrAnswer,
  type ChatHistoryItem,
} from "./api";
import { EMPTY_DOC } from "./empty";
import type {
  BusyPhase,
  ChatMessage,
  GeniusCalculationDoc,
  GeniusCalculationRow,
  GeniusListItem,
  GeniusTaskProposal,
  GeniusStep,
  GeniusAnswerResponse,
  GeniusCalculationExampleContext,
  GeniusCalculationVersion,
  GeniusStepComment,
} from "./types";

// Defensive fallback only — the server normally supplies a reasoned
// `commentary` alongside every calculation response.
function summarize(doc: GeniusCalculationDoc): string {
  const top = doc.results[0];
  const key = top ? ` The headline result is ${top.label}: ${top.value} ${top.unit}.` : "";
  return `Here's your calculation for "${doc.projectTitle}" with ${doc.steps.length} step${
    doc.steps.length === 1 ? "" : "s"
  }.${key} Every number is computed from the equations shown — edit any input and hit Recalculate, or ask me to change an assumption.`;
}

const WEB_SEARCH_KEY = "genius-web-search";
const EXPERT_MODE_KEY = "genius-expert-mode";
const PHD_MODE_KEY = "genius-phd-mode";
const ACTIVE_JOB_KEY = "genius-active-job";

/** Restore a valid quality-mode selection, preferring PhD if an old browser saved both. */
export function readInitialQualityModes(storage: Pick<Storage, "getItem" | "setItem"> = localStorage) {
  const phdMode = storage.getItem(PHD_MODE_KEY) === "1";
  const expertMode = storage.getItem(EXPERT_MODE_KEY) === "1" && !phdMode;
  if (phdMode && storage.getItem(EXPERT_MODE_KEY) === "1") {
    storage.setItem(EXPERT_MODE_KEY, "0");
  }
  return { expertMode, phdMode };
}

export function toggleQualityMode(
  mode: "expert" | "phd",
  current: { expertMode: boolean; phdMode: boolean },
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  const next = mode === "expert"
    ? { expertMode: !current.expertMode, phdMode: false }
    : { expertMode: false, phdMode: !current.phdMode };
  storage.setItem(EXPERT_MODE_KEY, next.expertMode ? "1" : "0");
  storage.setItem(PHD_MODE_KEY, next.phdMode ? "1" : "0");
  return next;
}

let _msgCounter = 0;
function nextMsgId(): string {
  return `msg-${++_msgCounter}`;
}

export function useGenius() {
  const queryClient = useQueryClient();
  const [calcId, setCalcId] = useState<number | null>(null);
  const calcIdRef = useRef<number | null>(null);
  calcIdRef.current = calcId;
  const [doc, setDoc] = useState<GeniusCalculationDoc>(EMPTY_DOC);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historicalVersion, setHistoricalVersion] = useState<GeniusCalculationVersion | null>(null);
  const [stepComments, setStepComments] = useState<GeniusStepComment[]>([]);
  /** Changes only when the server supplies a new or updated calculation row. */
  const [calculationUpdateToken, setCalculationUpdateToken] = useState(0);
  const latestDocRef = useRef<GeniusCalculationDoc>(EMPTY_DOC);
  const historicalVersionRef = useRef<GeniusCalculationVersion | null>(null);
  historicalVersionRef.current = historicalVersion;
  /** The jobId of the currently-running background job, if any. */
  const activeJobIdRef = useRef<string | null>(null);
  /** AbortController for the current polling loop — aborted instantly on stop. */
  const activeAbortRef = useRef<AbortController | null>(null);
  /** Reactive flag: true while a cancellable job is in flight. Drives the stop button. */
  const [hasActiveJob, setHasActiveJob] = useState(false);
  /**
   * Set of message IDs whose proposals have been explicitly discarded.
   * We use a Set so discard is O(1) and we never remove messages from the list.
   */
  const [discardedProposalIds, setDiscardedProposalIds] = useState<Set<string>>(new Set());
  const [exampleCreatedIds, setExampleCreatedIds] = useState<Set<string>>(new Set());

  // Both default OFF. Persisted in localStorage (not sessionStorage) so the
  // user's last choice survives closing the tab/browser and is restored the
  // next time the app starts — only an explicit "1" turns either one on.
  const [webSearch, setWebSearchState] = useState(() => {
    return localStorage.getItem(WEB_SEARCH_KEY) === "1";
  });
  const [{ expertMode: initialExpertMode, phdMode: initialPhdMode }] = useState(readInitialQualityModes);
  const [expertMode, setExpertModeState] = useState(initialExpertMode);
  const [phdMode, setPhdModeState] = useState(initialPhdMode);

  const toggleWebSearch = useCallback(() => {
    setWebSearchState((v) => {
      localStorage.setItem(WEB_SEARCH_KEY, v ? "0" : "1");
      return !v;
    });
  }, []);

  const toggleExpertMode = useCallback(() => {
    setExpertModeState((v) => {
      const next = toggleQualityMode("expert", { expertMode: v, phdMode });
      setPhdModeState(next.phdMode);
      return next.expertMode;
    });
  }, [phdMode]);

  const togglePhdMode = useCallback(() => {
    setPhdModeState((v) => {
      const next = toggleQualityMode("phd", { expertMode, phdMode: v });
      setExpertModeState(next.expertMode);
      return next.phdMode;
    });
  }, [expertMode]);

  const { data: history = [] } = useQuery<GeniusListItem[]>({ queryKey: ["/api/genius"] });
  const { data: versions = [] } = useQuery<GeniusCalculationVersion[]>({
    queryKey: ["/api/genius", calcId, "versions"],
    queryFn: () => getCalculationVersions(calcId!),
    enabled: calcId != null,
  });

  /**
   * Ref that always holds the current messages array without causing stale
   * closures in callbacks. Assigned during render (safe React pattern).
   */
  const messagesRef = useRef<typeof messages>([]);
  messagesRef.current = messages;

  const pushMessage = useCallback((msg: Omit<ChatMessage, "id"> & { id?: string }): string => {
    const id = msg.id ?? nextMsgId();
    setMessages((m) => [...m, { ...msg, id }]);
    return id;
  }, []);

  /**
   * Fencing token — any action that changes what the workspace shows
   * (new request, loading from history, starting fresh) bumps the epoch so
   * a stale result arriving from an older in-flight job does not overwrite it.
   */
  const sessionEpochRef = useRef(0);

  const applyRow = useCallback((row: GeniusCalculationRow, assistant?: string) => {
    setCalcId(row.id);
    setDoc(row.document);
    setCalculationUpdateToken((token) => token + 1);
    latestDocRef.current = row.document;
    setHistoricalVersion(null);
    setStepComments(row.comments ?? []);
    if (assistant) pushMessage({ role: "assistant", content: assistant });
    queryClient.invalidateQueries({ queryKey: ["/api/genius"] });
    queryClient.invalidateQueries({ queryKey: ["/api/genius", row.id, "versions"] });
  }, [queryClient, pushMessage]);

  const fail = useCallback((err: Error) => {
    pushMessage({ role: "assistant", content: `Sorry — ${err.message}` });
  }, [pushMessage]);

  // A reload must not abandon a valid server job. The durable job endpoint
  // remains the source of truth; this merely reconnects polling for this tab.
  useEffect(() => {
    const jobId = localStorage.getItem(ACTIVE_JOB_KEY);
    if (!jobId) return;
    const controller = new AbortController();
    activeJobIdRef.current = jobId;
    activeAbortRef.current = controller;
    setHasActiveJob(true);
    pollJob<GeniusCalculationRow>(jobId, controller.signal, (row) => applyRow(row))
      .then((row) => {
        localStorage.removeItem(ACTIVE_JOB_KEY);
        activeJobIdRef.current = null;
        setHasActiveJob(false);
        applyRow(row, row.commentary?.trim() || summarize(row.document));
      })
      .catch((error) => {
        localStorage.removeItem(ACTIVE_JOB_KEY);
        activeJobIdRef.current = null;
        setHasActiveJob(false);
        if (!(error instanceof CancelledError)) fail(error);
      });
    return () => controller.abort();
  }, [applyRow, fail]);

  /**
   * The most recent message that carries a proposal and has NOT been discarded.
   * This is the base used for refine calls.
   */
  const activeProposalBase = messages.reduceRight<ChatMessage | null>((found, msg) => {
    if (found) return found;
    if (msg.proposal && !discardedProposalIds.has(msg.id)) return msg;
    return null;
  }, null);

  const hasAnyProposal = messages.some((m) => m.proposal);
  const allProposalsDiscarded = hasAnyProposal && activeProposalBase === null;

  const sendMutation = useMutation<CalcOrAnswer, Error, { prompt: string; requestId: string; chatHistory?: ChatHistoryItem[] }, number>({
    mutationFn: ({ prompt, requestId, chatHistory }) => {
      // Fresh controller per mutation — aborted immediately by stopGeneration().
      const controller = new AbortController();
      activeAbortRef.current = controller;
      const captureJobId = (id: string) => {
        activeJobIdRef.current = id;
        localStorage.setItem(ACTIVE_JOB_KEY, id);
        // If the user already clicked Stop before the POST response arrived,
        // send the server-side cancel now that we have the jobId.
        if (controller.signal.aborted) {
          cancelJobRequest(id).catch(() => {});
        }
      };
      const requestEpoch = sessionEpochRef.current;
      const showVerified = (row: GeniusCalculationRow) => {
        if (requestEpoch === sessionEpochRef.current) applyRow(row);
      };
      if (calcId == null) return generateCalc(prompt, webSearch, expertMode, phdMode, requestId, captureJobId, controller.signal, chatHistory, showVerified);
      return messageCalc(calcId, prompt, webSearch, expertMode, phdMode, requestId, captureJobId, controller.signal, chatHistory, showVerified);
    },
    onMutate: () => {
      // Show the stop button immediately — the server starts a cancellable job
      // as soon as the POST is received, so the user can stop at any point.
      setHasActiveJob(true);
      // Bump the epoch and return it as context so success/error handlers can
      // check whether the user has navigated away since this job was started.
      return ++sessionEpochRef.current;
    },
    onSuccess: (response, _vars, epoch) => {
      // Only clear active-job state if this completion still owns the session —
      // prevents a stale job from clobbering a newly-started one.
      if (epoch === sessionEpochRef.current) {
        activeJobIdRef.current = null;
        localStorage.removeItem(ACTIVE_JOB_KEY);
        setHasActiveJob(false);
      }
      if (epoch !== sessionEpochRef.current) return;
      if ("type" in response && response.type === "answer") {
        pushMessage({ role: "assistant", content: response.reply, calculationExample: response.calculationExample });
      } else if ("document" in response) {
        applyRow(response, response.commentary?.trim() || summarize(response.document));
      }
    },
    onError: (err, _vars, epoch) => {
      if (epoch === sessionEpochRef.current) {
        activeJobIdRef.current = null;
        localStorage.removeItem(ACTIVE_JOB_KEY);
        setHasActiveJob(false);
      }
      if (epoch !== sessionEpochRef.current) return;
      // CancelledError is handled by stopGeneration — don't show an error message.
      if (err instanceof CancelledError) return;
      fail(err);
    },
  });

  const refineMutation = useMutation({
    mutationFn: (message: string) => refineProposal(activeProposalBase!.proposal!, message, expertMode, phdMode),
    onSuccess: ({ proposal, reply }) => {
      pushMessage({
        role: "assistant",
        content:
          reply?.trim() ||
          "I've updated the proposed task. Review it below — ask for more changes or approve it to build the calculation.",
        proposal,
      });
    },
    onError: fail,
  });

  const send = useCallback((prompt: string) => {
    if (historicalVersion) return;
    const text = prompt.trim();
    if (!text) return;
    // Capture history BEFORE pushing the current message so the AI receives
    // the prior conversation, not the message it's about to respond to.
    const chatHistory: ChatHistoryItem[] = messagesRef.current
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    pushMessage({ role: "user", content: text });
    if (activeProposalBase) refineMutation.mutate(text);
    else sendMutation.mutate({ prompt: text, requestId: crypto.randomUUID(), chatHistory });
  }, [sendMutation, refineMutation, activeProposalBase, pushMessage, historicalVersion]);

  /**
   * Always routes to the calculation-update path (sendMutation), bypassing the
   * refine flow even when a proposal is pending. Used when the user has turned
   * plan mode OFF and wants to modify the calculation directly.
   */
  const sendDirect = useCallback((prompt: string) => {
    if (historicalVersion) return;
    const text = prompt.trim();
    if (!text) return;
    const chatHistory: ChatHistoryItem[] = messagesRef.current
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    pushMessage({ role: "user", content: text });
    sendMutation.mutate({ prompt: text, requestId: crypto.randomUUID(), chatHistory });
  }, [sendMutation, pushMessage, historicalVersion]);

  const planMutation = useMutation({
    mutationFn: (text: string) => planFromText(text, expertMode, phdMode),
    onSuccess: ({ proposal, reply }) => {
      pushMessage({
        role: "assistant",
        content:
          reply?.trim() ||
          "I drafted a calculation plan. Review it below — ask me to change anything, or approve it to build the full calculation.",
        proposal,
      });
    },
    onError: fail,
  });

  const examplePlanMutation = useMutation({
    mutationFn: (example: GeniusCalculationExampleContext) => planCalculationExample(example, expertMode, phdMode),
    onSuccess: ({ proposal, reply }) => {
      pushMessage({
        role: "assistant",
        content: reply?.trim() || "Here is a reviewable calculation example. AI-supplied assumptions are listed below—review or edit them before approving the build.",
        proposal,
      });
    },
    onError: (error: Error) => {
      fail(new Error(`I couldn't prepare that calculation example. ${error.message}`));
    },
  });

  const plan = useCallback((text: string) => {
    if (historicalVersion) return;
    if (!text.trim()) return;
    pushMessage({ role: "user", content: text });
    planMutation.mutate(text);
  }, [planMutation, pushMessage, historicalVersion]);

  const uploadMutation = useMutation({
    mutationFn: ({ file, prompt }: { file: File; prompt?: string }) =>
      uploadDocument(file, prompt, expertMode, phdMode),
    onSuccess: ({ attachment, proposal, reply }) => {
      setMessages((m) => {
        const copy = [...m];
        // Attach the stored file info to the optimistic user message.
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === "user" && copy[i].attachment) {
            copy[i] = { ...copy[i], attachment };
            break;
          }
        }
        return copy;
      });
      pushMessage({
        role: "assistant",
        content:
          reply?.trim() ||
          "I read your document and drafted a calculation task. Review it below — ask me to change anything, or approve it to build the full calculation.",
        proposal,
      });
    },
    onError: fail,
  });

  const upload = useCallback((file: File, prompt?: string) => {
    if (historicalVersion) return;
    const kind = file.type === "application/pdf" ? ("pdf" as const) : ("image" as const);
    const userContent = prompt?.trim()
      ? `${prompt.trim()}\n\n[Attached: ${file.name}]`
      : `Uploaded ${file.name}`;
    pushMessage({
      role: "user",
      content: userContent,
      attachment: { id: "local", kind, name: file.name, url: "", mimeType: file.type, size: file.size },
    });
    uploadMutation.mutate({ file, prompt });
  }, [uploadMutation, pushMessage, historicalVersion]);

  const buildMutation = useMutation<
    GeniusCalculationRow,
    Error,
    { proposal: GeniusTaskProposal; requestId: string; chatHistory?: ChatHistoryItem[] },
    number
  >({
    mutationFn: ({ proposal, requestId, chatHistory }) => {
      const controller = new AbortController();
      activeAbortRef.current = controller;
      const captureJobId = (id: string) => {
        activeJobIdRef.current = id;
        localStorage.setItem(ACTIVE_JOB_KEY, id);
        if (controller.signal.aborted) {
          cancelJobRequest(id).catch(() => {});
        }
      };
      const requestEpoch = sessionEpochRef.current;
      const showVerified = (row: GeniusCalculationRow) => {
        if (requestEpoch === sessionEpochRef.current) applyRow(row);
      };
      return buildFromProposal(proposal, webSearch, expertMode, phdMode, requestId, captureJobId, controller.signal, chatHistory, showVerified);
    },
    onMutate: () => {
      setHasActiveJob(true);
      return ++sessionEpochRef.current;
    },
    onSuccess: (row, _vars, epoch) => {
      if (epoch === sessionEpochRef.current) {
        activeJobIdRef.current = null;
        localStorage.removeItem(ACTIVE_JOB_KEY);
        setHasActiveJob(false);
      }
      if (epoch !== sessionEpochRef.current) return;
      applyRow(row, row.commentary?.trim() || summarize(row.document));
    },
    onError: (err, _vars, epoch) => {
      if (epoch === sessionEpochRef.current) {
        activeJobIdRef.current = null;
        localStorage.removeItem(ACTIVE_JOB_KEY);
        setHasActiveJob(false);
      }
      if (epoch !== sessionEpochRef.current) return;
      if (err instanceof CancelledError) return;
      fail(err);
    },
  });

  const createCalculationExample = useCallback((messageId: string, example: GeniusCalculationExampleContext) => {
    if (
      historicalVersion ||
      exampleCreatedIds.has(messageId) ||
      sendMutation.isPending ||
      buildMutation.isPending ||
      planMutation.isPending ||
      examplePlanMutation.isPending
    ) return;
    setExampleCreatedIds((previous) => new Set(Array.from(previous).concat(messageId)));
    examplePlanMutation.mutate(example, {
      onError: () => setExampleCreatedIds((previous) => {
        const next = new Set(previous);
        next.delete(messageId);
        return next;
      }),
    });
  }, [historicalVersion, exampleCreatedIds, sendMutation.isPending, buildMutation.isPending, planMutation.isPending, examplePlanMutation]);

  const explainStepMutation = useMutation<
    GeniusAnswerResponse,
    Error,
    { step: GeniusStep; question: string },
    number
  >({
    mutationFn: ({ step, question }) => {
      if (calcId == null) throw new Error("Open a calculation before asking about a step.");
      const controller = new AbortController();
      activeAbortRef.current = controller;
      const captureJobId = (id: string) => {
        activeJobIdRef.current = id;
        if (controller.signal.aborted) cancelJobRequest(id).catch(() => {});
      };
      return explainCalculationStep(calcId, step.id, question, expertMode, phdMode, captureJobId, controller.signal);
    },
    onMutate: () => {
      setHasActiveJob(true);
      return ++sessionEpochRef.current;
    },
    onSuccess: (response, _vars, epoch) => {
      if (epoch !== sessionEpochRef.current) return;
      activeJobIdRef.current = null;
      localStorage.removeItem(ACTIVE_JOB_KEY);
      setHasActiveJob(false);
      pushMessage({ role: "assistant", content: response.reply });
    },
    onError: (err, _vars, epoch) => {
      if (epoch !== sessionEpochRef.current) return;
      activeJobIdRef.current = null;
      setHasActiveJob(false);
      if (err instanceof CancelledError) return;
      fail(err);
    },
  });

  const explainStep = useCallback((step: GeniusStep) => {
    if (historicalVersion || calcId == null || sendMutation.isPending || buildMutation.isPending || explainStepMutation.isPending) return;
    const question = `Explain the “${step.title}” calculation step.`;
    pushMessage({ role: "user", content: question });
    explainStepMutation.mutate({ step, question });
  }, [calcId, sendMutation.isPending, buildMutation.isPending, explainStepMutation, pushMessage, historicalVersion]);

  /**
   * Approve a specific proposal (by value). Any non-discarded card can be approved.
   */
  const approveProposal = useCallback((proposal: GeniusTaskProposal) => {
    if (historicalVersion || buildMutation.isPending) return;
    // Capture the plan/upload/refine conversation that led to this proposal
    // BEFORE pushing the approval message, so the server can persist the
    // real original history against the resulting calculation.
    const chatHistory: ChatHistoryItem[] = messagesRef.current
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    pushMessage({ role: "user", content: "Approved — build the calculation." });
    buildMutation.mutate({ proposal, requestId: crypto.randomUUID(), chatHistory });
  }, [buildMutation, pushMessage, historicalVersion]);

  /**
   * Discard a specific proposal identified by its message ID.
   * The message stays in the list; only its action buttons are removed.
   */
  const discardProposal = useCallback((messageId: string) => {
    if (historicalVersion) return;
    setDiscardedProposalIds((prev) => new Set(Array.from(prev).concat(messageId)));
  }, [historicalVersion]);

  const recalcMutation = useMutation({
    mutationFn: async (next: GeniusCalculationDoc) => {
      if (calcId == null) return saveCalc(next);
      return recalcCalc(calcId, next);
    },
    onSuccess: (row) => applyRow(row, row.commentary?.trim()),
    onError: fail,
  });

  const loadMutation = useMutation({
    mutationFn: async (id: number): Promise<GeniusCalculationRow> => apiRequest(`/api/genius/${id}`),
    onSuccess: (row) => {
      sessionEpochRef.current++;
      setCalcId(row.id);
      setDoc(row.document);
      latestDocRef.current = row.document;
      setHistoricalVersion(null);
      setStepComments(row.comments ?? []);
      setDiscardedProposalIds(new Set());
      setExampleCreatedIds(new Set());
      // Restore the real original conversation when one was recorded; older
      // calculations saved before history tracking fall back to a placeholder.
      if (row.chatHistory && row.chatHistory.length > 0) {
        setMessages(row.chatHistory.map((m) => ({ id: nextMsgId(), role: m.role, content: m.content })));
      } else {
        setMessages([
          { id: nextMsgId(), role: "assistant", content: `Loaded "${row.document.projectTitle}". Ask a follow-up or edit any input.` },
        ]);
      }
    },
    onError: fail,
  });

  const startNew = useCallback(() => {
    sessionEpochRef.current++;
    setCalcId(null);
    setDoc(EMPTY_DOC);
    setMessages([]);
    setDiscardedProposalIds(new Set());
    setExampleCreatedIds(new Set());
    latestDocRef.current = EMPTY_DOC;
    setHistoricalVersion(null);
    setStepComments([]);
  }, []);

  /**
   * Cancel the currently-running generation job.
   * Aborts the client-side polling loop immediately, fires-and-forgets the
   * server DELETE, clears busy state, and adds a neutral "Calculation stopped."
   * message. The epoch bump ensures any stale onSuccess/onError from the old
   * job cannot touch the new session's state.
   */
  const stopGeneration = useCallback(() => {
    if (historicalVersion) return;
    // Abort client-side polling immediately — no need to wait for next timer tick.
    activeAbortRef.current?.abort();
    activeAbortRef.current = null;

    const jobId = activeJobIdRef.current;
    if (jobId) {
      // Best-effort server-side cancel — don't await so UI is instant.
      cancelJobRequest(jobId);
      activeJobIdRef.current = null;
    }
    setHasActiveJob(false);
    // Bump epoch so stale onSuccess/onError handlers skip all state changes.
    sessionEpochRef.current++;
    // Reset mutation state so the send button appears immediately.
    sendMutation.reset();
    buildMutation.reset();
    explainStepMutation.reset();
    pushMessage({ role: "assistant", content: "Calculation stopped." });
  }, [pushMessage, sendMutation, buildMutation, explainStepMutation, historicalVersion]);

  const versionMutation = useMutation({
    mutationFn: (version: number) => {
      if (calcId == null) throw new Error("Open a calculation before viewing its history.");
      return getCalculationVersion(calcId, version);
    },
    onSuccess: (snapshot) => {
      setDoc(snapshot.document);
      setHistoricalVersion({
        version: snapshot.version,
        summary: snapshot.summary,
        createdAt: snapshot.createdAt,
      });
    },
    onError: fail,
  });

  const openVersion = useCallback((version: number) => {
    if (calcId != null) versionMutation.mutate(version);
  }, [calcId, versionMutation]);

  const returnToLatest = useCallback(() => {
    setDoc(latestDocRef.current);
    setHistoricalVersion(null);
  }, []);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCalc(id),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/genius"] });
      if (id === calcId) startNew();
    },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { title?: string; pinned?: boolean } }) =>
      patchCalc(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/genius"] }),
  });

  const detailsMutation = useMutation<GeniusCalculationDoc, Error, { calculationId: number; details: CalculationDetails }>({
    mutationFn: ({ calculationId, details }) => {
      return saveCalculationDetails(calculationId, details);
    },
    onSuccess: (savedDoc, { calculationId }) => {
      // A response belonging to a calculation the user has since left must
      // not replace either the document or the latest-document cache.
      if (calcIdRef.current !== calculationId) return;
      latestDocRef.current = savedDoc;
      // A save begun before opening history may finish afterwards. Keep its
      // data for "Return to latest" without replacing the historical snapshot.
      if (!historicalVersionRef.current) setDoc(savedDoc);
      queryClient.invalidateQueries({ queryKey: ["/api/genius"] });
    },
  });
  const createStepCommentMutation = useMutation({ mutationFn: ({ calculationId, stepId, content }: { calculationId: number; stepId: string; content: string }) => createStepComment(calculationId, stepId, content), onSuccess: (comment) => setStepComments((comments) => [...comments, comment]) });
  const updateStepCommentMutation = useMutation({ mutationFn: ({ calculationId, stepId, commentId, content }: { calculationId: number; stepId: string; commentId: number; content: string }) => updateStepComment(calculationId, stepId, commentId, content), onSuccess: (updated) => setStepComments((comments) => comments.map((comment) => comment.id === updated.id ? updated : comment)) });
  const deleteStepCommentMutation = useMutation({ mutationFn: ({ calculationId, stepId, commentId }: { calculationId: number; stepId: string; commentId: number }) => deleteStepComment(calculationId, stepId, commentId), onSuccess: (_result, variables) => setStepComments((comments) => comments.filter((comment) => comment.id !== variables.commentId)) });

  const busyPhase: BusyPhase = uploadMutation.isPending || planMutation.isPending || examplePlanMutation.isPending
    ? "upload"
    : refineMutation.isPending
      ? "refine"
      : buildMutation.isPending
        ? "build"
        : explainStepMutation.isPending
          ? "question"
        : sendMutation.isPending
          ? "generate"
          : null;

  return {
    calcId,
    calculationUpdateToken,
    doc,
    setDoc,
    versions,
    stepComments,
    historicalVersion,
    isHistorical: historicalVersion !== null,
    openVersion,
    returnToLatest,
    isLoadingVersion: versionMutation.isPending,
    messages,
    history,
    addStepComment: async (stepId: string, content: string) => {
      if (calcId == null || historicalVersion) throw new Error("Open the current calculation before adding a comment.");
      return createStepCommentMutation.mutateAsync({ calculationId: calcId, stepId, content });
    },
    updateStepComment: async (stepId: string, commentId: number, content: string) => {
      if (calcId == null || historicalVersion) throw new Error("Open the current calculation before editing a comment.");
      return updateStepCommentMutation.mutateAsync({ calculationId: calcId, stepId, commentId, content });
    },
    deleteStepComment: async (stepId: string, commentId: number) => {
      if (calcId == null || historicalVersion) throw new Error("Open the current calculation before deleting a comment.");
      return deleteStepCommentMutation.mutateAsync({ calculationId: calcId, stepId, commentId });
    },
    isSavingStepComment: createStepCommentMutation.isPending,
    isUpdatingStepComment: updateStepCommentMutation.isPending,
    isDeletingStepComment: deleteStepCommentMutation.isPending,
    send,
    sendDirect,
    explainStep,
    isSending: busyPhase !== null,
    busyPhase,
    /** True while a cancellable background job is actively polling. */
    hasActiveJob,
    stopGeneration,
    webSearch,
    toggleWebSearch,
    expertMode,
    toggleExpertMode,
    phdMode,
    togglePhdMode,
    plan,
    isPlanning: planMutation.isPending,
    createCalculationExample,
    isCreatingCalculationExample: examplePlanMutation.isPending,
    exampleCreatedIds,
    upload,
    isUploading: uploadMutation.isPending,
    /** True when there is at least one non-discarded proposal (refine mode active). */
    hasPendingProposal: activeProposalBase !== null,
    /** True when there are proposals but every one has been discarded. */
    allProposalsDiscarded,
    discardedProposalIds,
    approveProposal,
    discardProposal,
    recalculate: (next: GeniusCalculationDoc) => { if (!historicalVersion) recalcMutation.mutate(next); },
    isRecalculating: recalcMutation.isPending,
    loadCalc: (id: number) => loadMutation.mutate(id),
    deleteCalc: (id: number) => { if (!historicalVersion) deleteMutation.mutate(id); },
    renameCalc: (id: number, title: string) => { if (!historicalVersion) patchMutation.mutate({ id, patch: { title } }); },
    pinCalc: (id: number, pinned: boolean) => { if (!historicalVersion) patchMutation.mutate({ id, patch: { pinned } }); },
    saveDetails: async (details: CalculationDetails, calculationId: number) => {
      if (historicalVersion) throw new Error("Historical calculation versions cannot be changed.");
      if (calcIdRef.current !== calculationId) throw new Error("This calculation is no longer open.");
      return detailsMutation.mutateAsync({ calculationId, details });
    },
    startNew,
  };
}
