import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { NotificationItem, User, Workspace, WorkspaceMember } from '../types/synore';

export type AppView =
  | 'home'
  | 'messages'
  | 'channels'
  | 'projects'
  | 'tasks'
  | 'documents'
  | 'knowledge'
  | 'calendar'
  | 'files'
  | 'meetings'
  | 'team'
  | 'analytics'
  | 'settings';

export interface WsEventMessage {
  event: string;
  workspaceId: string;
  payload: unknown;
  timestamp: string;
}

interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface WorkspaceContextValue {
  token: string | null;
  user: User | null;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  members: WorkspaceMember[];
  onlineUserIds: string[];
  notifications: NotificationItem[];
  activeView: AppView;
  focusedEntityId: string | null;
  theme: 'dark' | 'light';
  wsConnected: boolean;
  setActiveView: (view: AppView, entityId?: string | null) => void;
  toggleTheme: () => void;
  setSession: (token: string, user: User, workspaces: Workspace[]) => void;
  logout: () => void;
  switchWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  apiFetch: <T = unknown>(url: string, options?: RequestInit) => Promise<T>;
  sendWs: (payload: Record<string, unknown>) => void;
  subscribeWs: (listener: (msg: WsEventMessage) => void) => () => void;
  notify: (type: 'success' | 'error' | 'info', text: string) => void;
  updateCurrentUser: (user: User) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeView, setActiveViewState] = useState<AppView>('home');
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [wsConnected, setWsConnected] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<(msg: WsEventMessage) => void>>(new Set());

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0] || null;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const notify = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const apiFetch = useCallback(
    async <T = unknown,>(url: string, options: RequestInit = {}): Promise<T> => {
      const headers = new Headers(options.headers || {});
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }
      const res = await fetch(url, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      return data as T;
    },
    [token]
  );

  const setActiveView = useCallback((view: AppView, entityId: string | null = null) => {
    setActiveViewState(view);
    setFocusedEntityId(entityId);
  }, []);

  const setSession = useCallback((newToken: string, newUser: User, newWorkspaces: Workspace[]) => {
    setToken(newToken);
    setUser(newUser);
    setWorkspaces(newWorkspaces);
    if (newWorkspaces.length > 0) {
      setActiveWorkspaceId((prev) => (prev && newWorkspaces.some((w) => w.id === prev) ? prev : newWorkspaces[0].id));
    } else {
      setActiveWorkspaceId(null);
    }
  }, []);

  const logout = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    setMembers([]);
    setOnlineUserIds([]);
    setNotifications([]);
    setActiveViewState('home');
  }, []);

  const switchWorkspace = useCallback((workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    setActiveViewState('home');
    setFocusedEntityId(null);
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    if (!token) return;
    const data = await apiFetch<{ workspaces: Workspace[] }>('/api/workspaces');
    setWorkspaces(data.workspaces);
    if (data.workspaces.length > 0 && !data.workspaces.some((w) => w.id === activeWorkspaceId)) {
      setActiveWorkspaceId(data.workspaces[0].id);
    }
  }, [token, apiFetch, activeWorkspaceId]);

  const refreshMembers = useCallback(async () => {
    if (!token || !activeWorkspace) return;
    const data = await apiFetch<{ members: WorkspaceMember[]; onlineUserIds: string[] }>(
      `/api/workspaces/${activeWorkspace.id}/members`
    );
    setMembers(data.members);
    setOnlineUserIds(data.onlineUserIds || []);
  }, [token, activeWorkspace, apiFetch]);

  const refreshNotifications = useCallback(async () => {
    if (!token || !activeWorkspace) return;
    const data = await apiFetch<{ notifications: NotificationItem[] }>(
      `/api/workspaces/${activeWorkspace.id}/notifications`
    );
    setNotifications(data.notifications);
  }, [token, activeWorkspace, apiFetch]);

  useEffect(() => {
    if (token && activeWorkspace) {
      refreshMembers().catch(() => {});
      refreshNotifications().catch(() => {});
    }
  }, [token, activeWorkspace?.id]);

  // Real-time WebSocket connection
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsConnected(true);
        if (activeWorkspace?.id) {
          socket.send(JSON.stringify({ type: 'workspace:join', workspaceId: activeWorkspace.id }));
        }
      };

      socket.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as WsEventMessage;
          if (msg.event === 'presence:update' && msg.workspaceId === activeWorkspace?.id) {
            const payload = msg.payload as { onlineUserIds: string[] };
            setOnlineUserIds(payload.onlineUserIds || []);
          }
          if (msg.event === 'notification:created' && msg.workspaceId === activeWorkspace?.id) {
            const notif = msg.payload as NotificationItem;
            setNotifications((prev) => (prev.some((n) => n.id === notif.id) ? prev : [notif, ...prev]));
          }
          for (const listener of listenersRef.current) {
            listener(msg);
          }
        } catch {
          // ignore malformed messages
        }
      };

      socket.onclose = () => {
        setWsConnected(false);
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 2500);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && activeWorkspace?.id) {
      wsRef.current.send(JSON.stringify({ type: 'workspace:join', workspaceId: activeWorkspace.id }));
    }
  }, [activeWorkspace?.id]);

  const sendWs = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const subscribeWs = useCallback((listener: (msg: WsEventMessage) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const updateCurrentUser = useCallback((updated: User) => {
    setUser(updated);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        token,
        user,
        workspaces,
        activeWorkspace,
        members,
        onlineUserIds,
        notifications,
        activeView,
        focusedEntityId,
        theme,
        wsConnected,
        setActiveView,
        toggleTheme,
        setSession,
        logout,
        switchWorkspace,
        refreshWorkspaces,
        refreshMembers,
        refreshNotifications,
        apiFetch,
        sendWs,
        subscribeWs,
        notify,
        updateCurrentUser,
      }}
    >
      {children}
      {/* Toast stack */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-2.5 rounded-lg border text-sm font-medium shadow-lg transition-all ${
              t.type === 'error'
                ? 'bg-red-950/95 border-red-800 text-red-100'
                : t.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-800 text-emerald-100'
                : 'bg-slate-900/95 border-slate-700 text-slate-100'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
