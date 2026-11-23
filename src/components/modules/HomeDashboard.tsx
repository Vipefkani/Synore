import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckSquare,
  FolderOpen,
  Hash,
  MessageSquare,
  Plus,
  Users,
  Video,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { Project, Task, WorkspaceDocument } from '../../types/synore';

export function HomeDashboard() {
  const { user, activeWorkspace, members, onlineUserIds, setActiveView, apiFetch } = useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [docs, setDocs] = useState<WorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspace) return;
    setLoading(true);
    Promise.all([
      apiFetch<{ projects: Project[] }>(`/api/workspaces/${activeWorkspace.id}/projects`),
      apiFetch<{ tasks: Task[] }>(`/api/workspaces/${activeWorkspace.id}/tasks`),
      apiFetch<{ documents: WorkspaceDocument[] }>(`/api/workspaces/${activeWorkspace.id}/documents`),
    ])
      .then(([pRes, tRes, dRes]) => {
        setProjects(pRes.projects);
        setTasks(tRes.tasks);
        setDocs(dRes.documents);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeWorkspace?.id]);

  const today = new Date().toISOString().slice(0, 10);
  const openTasks = tasks.filter((t) => t.status !== 'Done');
  const overdueTasks = openTasks.filter((t) => t.dueDate && t.dueDate < today);
  const completedTasks = tasks.filter((t) => t.status === 'Done');

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Executive Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Welcome back, {user?.fullName.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {activeWorkspace?.name} · {activeWorkspace?.type} · Role: {activeWorkspace?.role}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveView('channels')}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap"
          >
            <Hash className="w-3.5 h-3.5" /> Open Channels
          </button>
          {activeWorkspace?.permissions.createProjects && (
            <button
              type="button"
              onClick={() => setActiveView('projects')}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" /> Open Kanban Board
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Projects', value: projects.filter((p) => p.status === 'Active').length, sub: `${projects.length} total` },
          { label: 'Open Tasks', value: openTasks.length, sub: `${completedTasks.length} completed` },
          { label: 'Overdue Items', value: overdueTasks.length, sub: overdueTasks.length ? 'Needs attention' : 'On schedule', alert: overdueTasks.length > 0 },
          { label: 'Team Online', value: onlineUserIds.length, sub: `of ${members.length} members` },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F]"
          >
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</div>
            <div
              className={`mt-1.5 font-display text-2xl font-bold tabular-nums ${
                kpi.alert ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'
              }`}
            >
              {loading ? '—' : kpi.value}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick Navigation Modules */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { view: 'messages' as const, label: 'Direct Messages', desc: '1:1 & group chats', icon: MessageSquare },
          { view: 'tasks' as const, label: 'My Task Queue', desc: 'Subtasks & deadlines', icon: CheckSquare },
          { view: 'knowledge' as const, label: 'Knowledge Base', desc: 'Docs & runbooks', icon: BookOpen },
          { view: 'meetings' as const, label: 'Meeting Rooms', desc: 'Schedule & notes', icon: Video },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => setActiveView(item.view)}
              className="text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] hover:border-blue-500/40 transition-colors"
            >
              <Icon className="w-4 h-4 text-blue-500 mb-2" />
              <div className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Main Split: Active Projects + Recent Knowledge */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F]">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Active Workspace Projects
            </h2>
            <button
              type="button"
              onClick={() => setActiveView('projects')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              All Projects <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <div className="p-6 text-xs text-slate-500">Loading projects...</div>
            ) : projects.length === 0 ? (
              <div className="p-8 text-center">
                <FolderOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No projects yet</p>
                <p className="text-xs text-slate-500 mt-1">Create your first project to unlock Kanban boards.</p>
              </div>
            ) : (
              projects.slice(0, 5).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveView('projects', p.id)}
                  className="w-full text-left px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {p.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <span>{p.status}</span>
                      <span aria-hidden="true">·</span>
                      <span>Owner: {p.ownerName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Due {p.deadline}</span>
                    </div>
                  </div>
                  <div className="w-32 shrink-0">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-1">
                      <span className="text-slate-500">
                        {p.taskCounts.done}/{p.taskCounts.total}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white">{p.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${p.progress}%`, backgroundColor: p.color }}
                      />
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Recent Knowledge Docs */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F]">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Pinned & Recent Docs
            </h2>
            <button
              type="button"
              onClick={() => setActiveView('documents')}
              className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Open Docs
            </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {docs.slice(0, 5).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setActiveView('documents', d.id)}
                className="w-full text-left px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {d.isPinned ? 'Pinned · ' : ''}
                  {d.title}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Updated by {d.updatedByName}
                </div>
              </button>
            ))}
            {docs.length === 0 && !loading && (
              <div className="p-6 text-xs text-slate-500 text-center">No documents yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
