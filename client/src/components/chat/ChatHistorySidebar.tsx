import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import {
  Plus,
  MessageSquare,
  Trash2,
  Home,
  User,
  History,
  LogOut,
  Heart,
  Pin,
  PinOff,
  Pencil,
  SlidersHorizontal,
  Building2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatSession {
  id: number;
  userId: string;
  title: string | null;
  lastQuery: string | null;
  isPinned: boolean | null;
  createdAt: string;
  updatedAt: string;
}

interface SessionsPage {
  sessions: ChatSession[];
  nextCursor: number | null;
}

interface ChatHistorySidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  activeSessionId: number | null;
  onSelectSession: (sessionId: number) => void;
  onNewChat: () => void;
  onDeleteSession?: (sessionId: number) => void;
}

type TabType = 'home' | 'account';

const SESSIONS_PAGE_SIZE = 20;

export default function ChatHistorySidebar({
  isOpen,
  onToggle,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}: ChatHistorySidebarProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: number } | null>(null);
  const [renamingSession, setRenamingSession] = useState<{ id: number; title: string } | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { data: buildInfo } = useQuery<{ deployedAt: string; version: string }>({
    queryKey: ['/api/build-info'],
    staleTime: Infinity,
  });

  const sessionsQuery = useInfiniteQuery<SessionsPage>({
    queryKey: ["/api/chat/sessions"],
    enabled: !!user,
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as number | undefined;
      const url = cursor
        ? `/api/chat/sessions?limit=${SESSIONS_PAGE_SIZE}&cursor=${cursor}`
        : `/api/chat/sessions?limit=${SESSIONS_PAGE_SIZE}`;
      const res = await apiRequest(url);
      // Tolerate the legacy raw-array response shape.
      if (Array.isArray(res)) return { sessions: res, nextCursor: null };
      return { sessions: res?.sessions || [], nextCursor: res?.nextCursor ?? null };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const sessions = useMemo<ChatSession[]>(
    () => sessionsQuery.data?.pages.flatMap((p) => p.sessions) ?? [],
    [sessionsQuery.data],
  );

  // Backend already returns pinned-first; keep an additional client-side
  // ordering pass so optimistic updates from pin/rename mutations stay correct.
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }),
    [sessions],
  );

  // Bottom sentinel → load next page.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !sessionsQuery.hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible && !sessionsQuery.isFetchingNextPage) {
          sessionsQuery.fetchNextPage();
        }
      },
      { root: null, rootMargin: "0px 0px 100px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [sessionsQuery.hasNextPage, sessionsQuery.isFetchingNextPage, sessionsQuery.fetchNextPage, sortedSessions.length]);

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      return apiRequest(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
    },
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      if (onDeleteSession) onDeleteSession(sessionId);
      setContextMenu(null);
    },
  });

  const pinSessionMutation = useMutation({
    mutationFn: async ({ sessionId, isPinned }: { sessionId: number; isPinned: boolean }) => {
      return apiRequest(`/api/chat/sessions/${sessionId}/pin`, {
        method: "PATCH",
        body: JSON.stringify({ isPinned }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      setContextMenu(null);
    },
  });

  const renameSessionMutation = useMutation({
    mutationFn: async ({ sessionId, title }: { sessionId: number; title: string }) => {
      return apiRequest(`/api/chat/sessions/${sessionId}/rename`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      setRenamingSession(null);
    },
  });

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, sessionId: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, sessionId });
  };

  const handleTabClick = (tab: TabType) => {
    if (tab === 'home') {
      setLocation('/home');
    } else if (tab === 'account') {
      setLocation(user ? '/myspace' : '/auth');
    }
  };

  const getUserDisplayName = () => {
    if (!user) return 'Account';
    if (user.firstName) return user.firstName;
    if (user.email) return user.email.split('@')[0];
    return 'Account';
  };

  const tabs = [
    { id: 'home' as TabType, label: 'Home', icon: Home },
    { id: 'account' as TabType, label: getUserDisplayName(), icon: User },
  ];

  const isInitialLoading = sessionsQuery.isLoading;
  const isFetchingNextPage = sessionsQuery.isFetchingNextPage;

  return (
    <>
      <div
        className={cn(
          "fixed left-0 z-[200] transition-transform duration-300 ease-in-out",
          "w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 shadow-xl",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ top: "72px", height: "calc(100vh - 72px)" }}
      >
        <div className="flex flex-col h-full">
          <div className="flex flex-col border-b border-gray-200 dark:border-gray-800 pt-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabClick(tab.id)}
                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-l-2 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white border-l-transparent"
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="p-3 border-b border-gray-200 dark:border-gray-800">
            <Button
              onClick={() => {
                if (user) onNewChat();
                else setLocation('/deepsearch');
              }}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              New DeepSearch
            </Button>
          </div>

          <div className="flex flex-col border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setLocation('/favorites')}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-l-2 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white border-l-transparent"
            >
              <Heart className="w-4 h-4" />
              Favorites
            </button>
          </div>

          <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800">
            <History className="w-3 h-3" />
            History
          </div>

          <ScrollArea className="flex-1 p-2">
            {!user ? (
              <div className="text-center py-8 px-4">
                <MessageSquare className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Sign in to view history</p>
                <div className="flex flex-col gap-2 mt-3">
                  <Button onClick={() => setLocation('/auth')} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                    Sign In
                  </Button>
                  <Button
                    onClick={() => setLocation('/auth?mode=register')}
                    variant="outline"
                    size="sm"
                    className="bg-black text-white hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 dark:text-white border-0"
                  >
                    Join
                  </Button>
                </div>
              </div>
            ) : isInitialLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full" />
              </div>
            ) : sortedSessions.length === 0 ? (
              <div className="text-center py-8 px-4">
                <MessageSquare className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No chat history yet</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start a new search to begin</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {sortedSessions.map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      "group relative flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors",
                      activeSessionId === session.id
                        ? "bg-purple-100 dark:bg-purple-900/30"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    )}
                    onClick={() => {
                      if (renamingSession?.id !== session.id) onSelectSession(session.id);
                    }}
                    onContextMenu={(e) => handleContextMenu(e, session.id)}
                  >
                    {session.isPinned && (
                      <Pin className="w-3 h-3 text-purple-500 dark:text-purple-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      {renamingSession?.id === session.id ? (
                        <input
                          type="text"
                          value={renamingSession.title}
                          onChange={(e) => setRenamingSession({ ...renamingSession, title: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              renameSessionMutation.mutate({ sessionId: session.id, title: renamingSession.title });
                            } else if (e.key === 'Escape') {
                              setRenamingSession(null);
                            }
                          }}
                          onBlur={() => {
                            if (renamingSession.title.trim()) {
                              renameSessionMutation.mutate({ sessionId: session.id, title: renamingSession.title });
                            } else {
                              setRenamingSession(null);
                            }
                          }}
                          autoFocus
                          onFocus={(e) => {
                            e.currentTarget.select();
                            e.currentTarget.scrollLeft = 0;
                          }}
                          className="w-full text-xs font-medium bg-white dark:bg-gray-700 border border-purple-300 dark:border-purple-600 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-purple-500"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <p className={cn(
                          "text-xs font-medium truncate",
                          activeSessionId === session.id
                            ? "text-purple-700 dark:text-purple-300"
                            : "text-gray-700 dark:text-gray-300"
                        )}>
                          {session.title || "New Search"}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Bottom sentinel for infinite scroll */}
                {sessionsQuery.hasNextPage && (
                  <div ref={sentinelRef} className="flex items-center justify-center py-3">
                    {isFetchingNextPage ? (
                      <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                    ) : (
                      <span className="text-[10px] text-gray-400">Scroll for more</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <div className="p-3 border-t border-gray-200 dark:border-gray-800 mt-auto space-y-1">
            {user?.role === 'admin' && (
              <a href="/admin" className="block">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                  size="sm"
                >
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  Admin
                </Button>
              </a>
            )}
            {user?.role === 'admin' && user?.companyId && (
              <a href={`/companies/${user.companyId}`} className="block">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                  size="sm"
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  Company Page
                </Button>
              </a>
            )}
            {user && (
              <Button
                onClick={async () => {
                  try {
                    await apiRequest('/api/auth/logout', { method: 'POST' });
                    queryClient.invalidateQueries({ queryKey: ['/api/user'] });
                    window.location.href = '/auth';
                  } catch (error) {
                    console.error('Logout error:', error);
                  }
                }}
                variant="ghost"
                className="w-full justify-start text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                size="sm"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Log Out
              </Button>
            )}
            {buildInfo?.deployedAt && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-2">
                Version: {buildInfo.version} · {new Date(buildInfo.deployedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            )}
            <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center mt-1">
              © 2026 DeepFolder. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-[199]" onClick={onToggle} />
      )}

      {contextMenu && (() => {
        const session = sessions.find((s) => s.id === contextMenu.sessionId);
        const isPinned = session?.isPinned;
        return (
          <div
            className="fixed z-[300] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[120px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => pinSessionMutation.mutate({ sessionId: contextMenu.sessionId, isPinned: !isPinned })}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              {isPinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              onClick={() => {
                setRenamingSession({ id: contextMenu.sessionId, title: session?.title || '' });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Rename
            </button>
            <button
              onClick={() => deleteSessionMutation.mutate(contextMenu.sessionId)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        );
      })()}
    </>
  );
}
