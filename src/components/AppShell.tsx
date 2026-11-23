import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Hash,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Users,
  Video,
  X,
} from 'lucide-react';
import { SynoreLogo, UserAvatar } from './SynoreLogo';
import { useWorkspace, type AppView } from '../context/WorkspaceContext';
import type { CalendarEvent, Task } from '../types/synore';

const NAV_ITEMS: Array<{ id: AppView; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'channels', label: 'Channels', icon: Hash },
  { id: 'projects', label: 'Projects', icon: FolderOpen },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'meetings', label: 'Meetings', icon: Video },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function AppShell({
  children,
  onStartNewWorkspace,
}: {
  children: React.ReactNode;
  onStartNewWorkspace: () => void;
}) {
  const {
    user,
    workspaces,
    activeWorkspace,
    members,
    onlineUserIds,
    notifications,
    activeView,
    theme,
    wsConnected,
    setActiveView,
    toggleTheme,
    logout,
    switchWorkspace,
    refreshNotifications,
    apiFetch,
    notify,
  } = useWorkspace();

  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  // Right sidebar live data
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);

  // Global search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Record<string, Array<Record<string, unknown>>> | null>(null);
  const [searching, setSearching] = useState(false);

  // Synora AI panel state
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiMode, setAiMode] = useState<'ask_workspace' | 'overdue_brief' | 'draft_document'>('ask_workspace');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const activeNav = NAV_ITEMS.find((n) => n.id === activeView) || NAV_ITEMS[0];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!activeWorkspace || !user) return;
    apiFetch<{ tasks: Task[] }>(`/api/workspaces/${activeWorkspace.id}/tasks`)
      .then((res) => {
        setMyTasks(res.tasks.filter((t) => t.assigneeId === user.id && t.status !== 'Done').slice(0, 5));
      })
      .catch(() => {});
    apiFetch<{ events: CalendarEvent[] }>(`/api/workspaces/${activeWorkspace.id}/events`)
      .then((res) => {
        setUpcomingEvents(res.events.slice(0, 4));
      })
      .catch(() => {});
  }, [activeWorkspace?.id, user?.id, activeView]);

  useEffect(() => {
    if (!searchOpen || !activeWorkspace) return;
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiFetch<{ results: Record<string, Array<Record<string, unknown>>> }>(
          `/api/workspaces/${activeWorkspace.id}/search?q=${encodeURIComponent(searchQuery)}`
        );
        setSearchResults(res.results);
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen, activeWorkspace?.id]);

  const handleMarkAllRead = async () => {
    if (!activeWorkspace) return;
    await apiFetch(`/api/workspaces/${activeWorkspace.id}/notifications/read-all`, { method: 'POST' });
    await refreshNotifications();
  };

  const handleToggleQuickTask = async (task: Task) => {
    if (!activeWorkspace) return;
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'Done' }),
      });
      setMyTasks((prev) => prev.filter((t) => t.id !== task.id));
      notify('success', `Completed "${task.title}"`);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to update task');
    }
  };

  const handleRunAi = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeWorkspace) return;
    setAiLoading(true);
    try {
      const res = await apiFetch<{ text: string }>(`/api/workspaces/${activeWorkspace.id}/ai`, {
        method: 'POST',
        body: JSON.stringify({
          mode: aiMode,
          prompt: aiPrompt || (aiMode === 'overdue_brief' ? 'Summarize overdue and urgent tasks' : 'Give a status overview of our workspace'),
        }),
      });
      setAiResponse(res.text);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Synora AI unavailable');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="h-screen w-full overflow-hidden flex bg-slate-50 dark:bg-[#0B0D12] text-slate-900 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* LEFT SIDEBAR */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#10131B] transition-all duration-200 ${
          leftCollapsed ? 'w-[68px]' : 'w-[248px]'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 shrink-0">
          <SynoreLogo collapsed={leftCollapsed} size={26} />
          <button
            type="button"
            onClick={() => setLeftCollapsed((v) => !v)}
            aria-label="Toggle left sidebar"
            className="hidden lg:flex p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60"
          >
            {leftCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Workspace Switcher */}
        <div className="p-2.5 border-b border-slate-200 dark:border-slate-800/80 relative">
          <button
            type="button"
            onClick={() => setWsDropdownOpen((v) => !v)}
            className={`w-full flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
              leftCollapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                style={{ backgroundColor: activeWorkspace?.logoColor || '#2563EB' }}
                className="w-6 h-6 rounded-md text-white text-xs font-bold flex items-center justify-center shrink-0"
              >
                {(activeWorkspace?.name || 'S')[0].toUpperCase()}
              </div>
              {!leftCollapsed && (
                <div className="text-left min-w-0">
                  <div className="text-xs font-semibold truncate text-slate-900 dark:text-slate-100">
                    {activeWorkspace?.name}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {activeWorkspace?.role} · {activeWorkspace?.plan}
                  </div>
                </div>
              )}
            </div>
            {!leftCollapsed && <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          </button>

          {wsDropdownOpen && (
            <div className="absolute left-2.5 right-2.5 top-full mt-1 z-50 bg-white dark:bg-[#171B26] border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-1.5 min-w-[216px]">
              <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400">Workspaces</div>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => {
                    switchWorkspace(ws.id);
                    setWsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                    ws.id === activeWorkspace?.id
                      ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">{ws.name}</span>
                  <span className="text-[11px] opacity-70">{ws.role}</span>
                </button>
              ))}
              <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
              <button
                type="button"
                onClick={() => {
                  setWsDropdownOpen(false);
                  onStartNewWorkspace();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-600/10"
              >
                <Plus className="w-3.5 h-3.5" /> Create Workspace
              </button>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={leftCollapsed ? item.label : undefined}
                onClick={() => {
                  setActiveView(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                } ${leftCollapsed ? 'justify-center px-2' : ''}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!leftCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Connection footer */}
        {!leftCollapsed && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}
              />
              {wsConnected ? 'Live sync active' : 'Reconnecting...'}
            </span>
            <span className="font-mono">{activeWorkspace?.plan}</span>
          </div>
        )}
      </aside>

      {/* CENTER COLUMN: TOP BAR + MAIN VIEWPORT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER BAR (3-Zone Contract) */}
        <header className="h-14 px-4 lg:px-6 border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#10131B] flex items-center justify-between gap-4 shrink-0">
          {/* Left Zone: Mobile menu + Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 dark:text-slate-400 truncate hidden sm:inline">
                {activeWorkspace?.name}
              </span>
              <span className="text-slate-400 hidden sm:inline">/</span>
              <span className="font-display font-semibold text-slate-900 dark:text-white truncate">
                {activeNav.label}
              </span>
            </div>
          </div>

          {/* Center Zone: Global Search Trigger */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center justify-between gap-3 w-72 lg:w-96 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs text-slate-500 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5" />
              Search messages, projects, tasks, docs...
            </span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              ⌘K
            </kbd>
          </button>

          {/* Right Zone: Actions + Profile */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-600/10 text-blue-600 dark:text-blue-400 text-xs font-semibold hover:bg-blue-600/15 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Synora AI</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Notifications"
                className="relative p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-mono tabular-nums flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-[#171B26] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">All caught up.</div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={async () => {
                            if (!n.isRead && activeWorkspace) {
                              await apiFetch(`/api/workspaces/${activeWorkspace.id}/notifications/${n.id}/read`, {
                                method: 'PATCH',
                              });
                              refreshNotifications();
                            }
                            setActiveView((n.linkView as AppView) || 'home', n.linkId);
                            setNotifOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                            !n.isRead ? 'bg-blue-600/5' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{n.title}</span>
                            {!n.isRead && <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />}
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setRightCollapsed((v) => !v)}
              aria-label="Toggle right context panel"
              className="hidden xl:flex p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {rightCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>

            {/* Profile Menu */}
            <div className="relative pl-1">
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <UserAvatar name={user?.fullName || 'User'} avatarUrl={user?.avatarUrl} size="sm" online={wsConnected} />
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-[#171B26] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 p-1.5">
                  <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{user?.fullName}</div>
                    <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveView('settings');
                      setProfileOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 mt-1"
                  >
                    Account & Workspace Settings
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* BODY: MAIN + RIGHT SIDEBAR */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <main className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6">{children}</main>

          {/* RIGHT CONTEXTUAL SIDEBAR */}
          {!rightCollapsed && (
            <aside className="hidden xl:flex w-[290px] flex-col border-l border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#10131B] overflow-y-auto shrink-0">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">Team Availability</span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500">
                    {onlineUserIds.length}/{members.length} online
                  </span>
                </div>
                <div className="space-y-2.5">
                  {members.slice(0, 6).map((m) => {
                    const isOnline = onlineUserIds.includes(m.userId);
                    return (
                      <div key={m.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <UserAvatar name={m.fullName} avatarUrl={m.avatarUrl} size="sm" online={isOnline} />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                              {m.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {isOnline ? m.status || 'Available' : 'Offline'}
                            </div>
                          </div>
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">{m.role}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 border-b border-slate-200 dark:border-slate-800/80">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">Assigned to Me</span>
                  <button
                    type="button"
                    onClick={() => setActiveView('tasks')}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    View all
                  </button>
                </div>
                {myTasks.length === 0 ? (
                  <p className="text-xs text-slate-500">No open tasks assigned to you.</p>
                ) : (
                  <div className="space-y-2">
                    {myTasks.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-start gap-2.5 p-2 rounded-lg border border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleQuickTask(t)}
                          title="Mark Done"
                          className="mt-0.5 w-4 h-4 rounded border border-slate-300 dark:border-slate-600 hover:border-blue-500 shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => setActiveView('tasks', t.id)}
                          className="text-left min-w-0 flex-1"
                        >
                          <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                            {t.title}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                            {t.priority} · {t.dueDate || 'No due date'}
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">Upcoming Events</span>
                  <button
                    type="button"
                    onClick={() => setActiveView('calendar')}
                    className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Calendar
                  </button>
                </div>
                {upcomingEvents.length === 0 ? (
                  <p className="text-xs text-slate-500">No upcoming events.</p>
                ) : (
                  <div className="space-y-2.5">
                    {upcomingEvents.map((ev) => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setActiveView('calendar')}
                        className="w-full text-left p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                          {ev.title}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                          {new Date(ev.startTime).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* GLOBAL SEARCH MODAL */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-20 p-4"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search across messages, channels, projects, tasks, docs, files, team..."
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
              <button type="button" onClick={() => setSearchOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-4 space-y-4">
              {!searchQuery.trim() && (
                <p className="text-xs text-slate-500 text-center py-6">
                  Type a keyword to search all workspace records.
                </p>
              )}
              {searching && <p className="text-xs text-slate-500 text-center py-4">Searching workspace...</p>}
              {searchResults &&
                (
                  [
                    ['Projects', 'projects', 'projects'],
                    ['Tasks', 'tasks', 'tasks'],
                    ['Documents', 'documents', 'documents'],
                    ['Channels', 'channels', 'channels'],
                    ['Messages', 'messages', 'channels'],
                    ['Files', 'files', 'files'],
                    ['Members', 'members', 'team'],
                  ] as Array<[string, string, AppView]>
                ).map(([label, key, targetView]) => {
                  const list = searchResults[key] || [];
                  if (!list.length) return null;
                  return (
                    <div key={key}>
                      <div className="text-[11px] font-semibold text-slate-400 mb-1.5">{label}</div>
                      <div className="space-y-1">
                        {list.map((item, i) => (
                          <button
                            key={String(item.id || i)}
                            type="button"
                            onClick={() => {
                              setActiveView(targetView, String(item.id || ''));
                              setSearchOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                          >
                            <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {String(item.title || item.name || item.full_name || item.content)}
                            </span>
                            <span className="text-[11px] text-slate-500 shrink-0 ml-3">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* SYNORA AI DRAWER */}
      {aiOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-[#13161F] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
          <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              <span className="font-display font-semibold text-sm">Synora AI Assistant</span>
            </div>
            <button type="button" onClick={() => setAiOpen(false)} className="text-slate-400 hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0D12]">
              {(
                [
                  ['ask_workspace', 'Ask Workspace'],
                  ['overdue_brief', 'Overdue Audit'],
                  ['draft_document', 'Draft Spec'],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setAiMode(m)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    aiMode === m ? 'bg-white dark:bg-[#1A1F2E] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleRunAi} className="space-y-3">
              <textarea
                rows={3}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={
                  aiMode === 'overdue_brief'
                    ? 'Optional focus area (or click Generate to scan overdue tasks)...'
                    : aiMode === 'draft_document'
                    ? 'Describe the policy, RFC, or guide you want Synora AI to draft...'
                    : 'Ask anything about your projects, tasks, or Knowledge Base...'
                }
                className="w-full p-3 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="submit"
                disabled={aiLoading}
                className="w-full py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-60"
              >
                {aiLoading ? 'Analyzing workspace...' : 'Run Synora AI'}
              </button>
            </form>

            {aiResponse && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D12] text-xs leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                {aiResponse}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
