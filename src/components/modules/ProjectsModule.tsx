import React, { useEffect, useState } from 'react';
import {
  Calendar as CalIcon,
  CheckSquare,
  Columns,
  GanttChart,
  List,
  MessageSquare,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { UserAvatar } from '../SynoreLogo';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { Comment, Project, Task, TaskPriority } from '../../types/synore';

export function ProjectsModule() {
  const { activeWorkspace, members, focusedEntityId, apiFetch, subscribeWs, notify, setActiveView } = useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'calendar' | 'timeline'>('kanban');
  const [loading, setLoading] = useState(true);

  // Drag & Drop state
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // Modals & Drawers
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projPriority, setProjPriority] = useState<TaskPriority>('High');
  const [projDeadline, setProjDeadline] = useState(
    new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10)
  );
  const [projColumnsInput, setProjColumnsInput] = useState('Backlog, To Do, In Progress, Review, Done');

  const [newTaskColumn, setNewTaskColumn] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('Medium');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskDue, setTaskDue] = useState('');

  // Project discussion & AI report
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadData = async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const [pRes, tRes] = await Promise.all([
        apiFetch<{ projects: Project[] }>(`/api/workspaces/${activeWorkspace.id}/projects`),
        apiFetch<{ tasks: Task[] }>(`/api/workspaces/${activeWorkspace.id}/tasks`),
      ]);
      setProjects(pRes.projects);
      setTasks(tRes.tasks);
      if (focusedEntityId && pRes.projects.some((p) => p.id === focusedEntityId)) {
        setSelectedProjectId(focusedEntityId);
      } else if (!selectedProjectId && pRes.projects.length > 0) {
        setSelectedProjectId(pRes.projects[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedProjectId(null);
    loadData().catch(() => {});
  }, [activeWorkspace?.id]);

  // Real-time WebSocket updates for Projects & Kanban Tasks
  useEffect(() => {
    return subscribeWs((wsMsg) => {
      if (wsMsg.workspaceId !== activeWorkspace?.id) return;

      if (wsMsg.event === 'project:created') {
        const p = wsMsg.payload as Project;
        setProjects((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev]));
      }
      if (wsMsg.event === 'project:updated' || wsMsg.event === 'project:deleted') {
        loadData().catch(() => {});
      }
      if (wsMsg.event === 'task:created') {
        const { task, projectProgress } = wsMsg.payload as {
          task: Task;
          projectProgress: { projectId: string; total: number; done: number; progress: number };
        };
        setTasks((prev) => (prev.some((x) => x.id === task.id) ? prev : [task, ...prev]));
        if (projectProgress) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === projectProgress.projectId
                ? {
                    ...p,
                    progress: projectProgress.progress,
                    taskCounts: { total: projectProgress.total, done: projectProgress.done },
                  }
                : p
            )
          );
        }
      }
      if (wsMsg.event === 'task:updated') {
        const { task, projectProgress } = wsMsg.payload as {
          task: Task;
          projectProgress: { projectId: string; total: number; done: number; progress: number };
        };
        setTasks((prev) => prev.map((x) => (x.id === task.id ? task : x)));
        if (projectProgress) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === projectProgress.projectId
                ? {
                    ...p,
                    progress: projectProgress.progress,
                    taskCounts: { total: projectProgress.total, done: projectProgress.done },
                  }
                : p
            )
          );
        }
      }
      if (wsMsg.event === 'task:deleted') {
        const { id } = wsMsg.payload as { id: string };
        setTasks((prev) => prev.filter((x) => x.id !== id));
      }
    });
  }, [activeWorkspace?.id]);

  const activeProject = projects.find((p) => p.id === selectedProjectId) || projects[0] || null;
  const projectTasks = tasks.filter((t) => t.projectId === activeProject?.id);
  const columns = activeProject?.columns || ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'];

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !projName.trim()) return;
    const cols = projColumnsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const res = await apiFetch<{ project: Project }>(`/api/workspaces/${activeWorkspace.id}/projects`, {
        method: 'POST',
        body: JSON.stringify({
          name: projName,
          description: projDesc,
          priority: projPriority,
          deadline: projDeadline,
          columns: cols.length >= 2 ? cols : undefined,
        }),
      });
      setProjects((prev) => (prev.some((x) => x.id === res.project.id) ? prev : [res.project, ...prev]));
      setSelectedProjectId(res.project.id);
      setNewProjectOpen(false);
      setProjName('');
      setProjDesc('');
      notify('success', `Project "${res.project.name}" created`);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to create project');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !activeProject || !taskTitle.trim()) return;
    try {
      const res = await apiFetch<{ task: Task }>(`/api/workspaces/${activeWorkspace.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          projectId: activeProject.id,
          title: taskTitle,
          description: taskDesc,
          status: newTaskColumn || columns[0],
          priority: taskPriority,
          assigneeId: taskAssignee || null,
          dueDate: taskDue || null,
        }),
      });
      setTasks((prev) => (prev.some((x) => x.id === res.task.id) ? prev : [res.task, ...prev]));
      setNewTaskColumn(null);
      setTaskTitle('');
      setTaskDesc('');
      setTaskAssignee('');
      setTaskDue('');
      notify('success', 'Task added to Kanban board');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to create task');
    }
  };

  const handleDropOnColumn = async (targetColumn: string) => {
    if (!activeWorkspace || !draggingTaskId) return;
    const dragged = tasks.find((t) => t.id === draggingTaskId);
    setDragOverColumn(null);
    setDraggingTaskId(null);
    if (!dragged || dragged.status === targetColumn) return;

    // Optimistic update
    const prevTasks = tasks;
    setTasks((curr) => curr.map((t) => (t.id === dragged.id ? { ...t, status: targetColumn } : t)));
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/tasks/${dragged.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetColumn }),
      });
    } catch (err: unknown) {
      setTasks(prevTasks);
      notify('error', err instanceof Error ? err.message : 'Could not move task');
    }
  };

  const handleDeleteProject = async (projId: string) => {
    if (!activeWorkspace) return;
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/projects/${projId}`, { method: 'DELETE' });
      setProjects((prev) => prev.filter((p) => p.id !== projId));
      setDeleteConfirmId(null);
      setSelectedProjectId(null);
      notify('success', 'Project deleted');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to delete project');
    }
  };

  const handleOpenDiscussion = async () => {
    if (!activeWorkspace || !activeProject) return;
    setDiscussionOpen(true);
    const res = await apiFetch<{ comments: Comment[] }>(
      `/api/workspaces/${activeWorkspace.id}/comments?entityType=project&entityId=${activeProject.id}`
    );
    setComments(res.comments);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !activeProject || !commentText.trim()) return;
    const res = await apiFetch<{ comment: Comment }>(`/api/workspaces/${activeWorkspace.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ entityType: 'project', entityId: activeProject.id, content: commentText.trim() }),
    });
    setComments((prev) => [...prev, res.comment]);
    setCommentText('');
  };

  const handleGenerateReport = async () => {
    if (!activeWorkspace || !activeProject) return;
    setAiLoading(true);
    try {
      const res = await apiFetch<{ text: string }>(`/api/workspaces/${activeWorkspace.id}/ai`, {
        method: 'POST',
        body: JSON.stringify({
          mode: 'project_report',
          targetId: activeProject.id,
          prompt: 'Generate an executive progress report, risk analysis, and next actions for this project.',
        }),
      });
      setAiReport(res.text);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-5 h-full flex flex-col">
      {/* Top Project Selector + Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={activeProject?.id || ''}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3.5 py-2 rounded-lg bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 text-sm font-semibold min-w-[240px]"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.progress}%)
              </option>
            ))}
          </select>

          {activeProject && (
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <span>{activeProject.status}</span>
              <span aria-hidden="true">·</span>
              <span>Priority: {activeProject.priority}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Due {activeProject.deadline}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Segmented Switcher */}
          <div className="flex items-center p-1 rounded-lg bg-slate-200/70 dark:bg-[#13161F] border border-slate-200 dark:border-slate-800">
            {(
              [
                ['kanban', 'Kanban', Columns],
                ['list', 'List', List],
                ['calendar', 'Calendar', CalIcon],
                ['timeline', 'Timeline', GanttChart],
              ] as const
            ).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  viewMode === mode
                    ? 'bg-white dark:bg-[#1F2536] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {activeProject && (
            <>
              <button
                type="button"
                onClick={handleOpenDiscussion}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Discussion
              </button>
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={aiLoading}
                className="px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-600/10 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" /> {aiLoading ? 'Generating...' : 'AI Report'}
              </button>
            </>
          )}

          {activeWorkspace?.permissions.createProjects && (
            <button
              type="button"
              onClick={() => setNewProjectOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" /> New Project
            </button>
          )}
          {activeProject && activeWorkspace?.permissions.deleteResources && (
            <button
              type="button"
              onClick={() => setDeleteConfirmId(activeProject.id)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-500"
              title="Delete project"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {aiReport && (
        <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-600/5 text-xs relative">
          <button type="button" onClick={() => setAiReport(null)} className="absolute right-3 top-3 text-slate-400">
            <X className="w-4 h-4" />
          </button>
          <div className="font-semibold text-blue-600 dark:text-blue-400 mb-1.5">Synora AI Project Report</div>
          <div className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300">{aiReport}</div>
        </div>
      )}

      {/* Main Project View */}
      {loading ? (
        <div className="p-8 text-sm text-slate-500">Loading projects and tasks...</div>
      ) : !activeProject ? (
        <div className="p-12 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          <p className="text-sm font-medium">No projects in this workspace yet.</p>
          {activeWorkspace?.permissions.createProjects && (
            <button
              type="button"
              onClick={() => setNewProjectOpen(true)}
              className="mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
            >
              Create First Project
            </button>
          )}
        </div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN BOARD WITH REAL DRAG & DROP + WEBSOCKET SYNC */
        <div className="flex-1 overflow-x-auto pb-2">
          <div className="flex gap-4 min-h-[480px] items-start">
            {columns.map((col) => {
              const colTasks = projectTasks.filter((t) => t.status === col);
              const isDropTarget = dragOverColumn === col;
              return (
                <div
                  key={col}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverColumn(col);
                  }}
                  onDragLeave={() => setDragOverColumn(null)}
                  onDrop={() => handleDropOnColumn(col)}
                  className={`w-72 shrink-0 rounded-xl border p-3 transition-colors ${
                    isDropTarget
                      ? 'border-blue-500 bg-blue-600/5'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-[#10131B]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{col}</span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-500">{colTasks.length}</span>
                    </div>
                    {activeWorkspace?.role !== 'Guest' && (
                      <button
                        type="button"
                        onClick={() => setNewTaskColumn(col)}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
                        title={`Add task to ${col}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5 min-h-[120px]">
                    {colTasks.map((task) => (
                      <div
                        key={task.id}
                        draggable={activeWorkspace?.role !== 'Guest'}
                        onDragStart={() => setDraggingTaskId(task.id)}
                        onDragEnd={() => {
                          setDraggingTaskId(null);
                          setDragOverColumn(null);
                        }}
                        onClick={() => setActiveView('tasks', task.id)}
                        className={`p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#151924] cursor-grab active:cursor-grabbing hover:border-blue-500/40 transition-all ${
                          draggingTaskId === task.id ? 'opacity-50 scale-[0.98]' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 mb-1.5">
                          <span
                            className={`font-medium ${
                              task.priority === 'Urgent'
                                ? 'text-red-500'
                                : task.priority === 'High'
                                ? 'text-amber-500'
                                : 'text-slate-500'
                            }`}
                          >
                            {task.priority}
                          </span>
                          {task.dueDate && <span className="font-mono tabular-nums">{task.dueDate}</span>}
                        </div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                          {task.title}
                        </div>
                        {task.labels.length > 0 && (
                          <div className="mt-2 text-[11px] text-slate-500 truncate">
                            {task.labels.join(' · ')}
                          </div>
                        )}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono tabular-nums">
                            {task.subtasks.length > 0 && (
                              <span className="flex items-center gap-1">
                                <CheckSquare className="w-3 h-3" />
                                {task.subtasks.filter((s) => s.isCompleted).length}/{task.subtasks.length}
                              </span>
                            )}
                            {task.commentCount > 0 && <span>{task.commentCount} cmt</span>}
                          </div>
                          {task.assigneeName ? (
                            <UserAvatar name={task.assigneeName} avatarUrl={task.assigneeAvatar} size="xs" />
                          ) : (
                            <span className="text-[10px] text-slate-400">Unassigned</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : viewMode === 'list' ? (
        /* LIST VIEW */
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-3 px-4 font-semibold">Task</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Priority</th>
                <th className="py-3 px-4 font-semibold">Assignee</th>
                <th className="py-3 px-4 font-semibold text-right">Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {projectTasks.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setActiveView('tasks', t.id)}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                >
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">{t.title}</td>
                  <td className="py-3 px-4">
                    <select
                      value={t.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={async (e) => {
                        const next = e.target.value;
                        await apiFetch(`/api/workspaces/${activeWorkspace!.id}/tasks/${t.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ status: next }),
                        });
                      }}
                      className="px-2 py-1 rounded bg-slate-100 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
                    >
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4">{t.priority}</td>
                  <td className="py-3 px-4">{t.assigneeName || 'Unassigned'}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{t.dueDate || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : viewMode === 'calendar' ? (
        /* PROJECT CALENDAR VIEW */
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] p-5">
          <div className="text-xs font-semibold mb-4">Project Deliverables by Due Date</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {projectTasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveView('tasks', t.id)}
                className="text-left p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/50"
              >
                <div className="text-[11px] font-mono tabular-nums text-blue-500">{t.dueDate || 'Unscheduled'}</div>
                <div className="text-xs font-semibold mt-1">{t.title}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {t.status} · {t.assigneeName || 'Unassigned'}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* TIMELINE VIEW */
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] p-5 space-y-3">
          <div className="text-xs font-semibold mb-2">Execution Timeline</div>
          {projectTasks.map((t, idx) => {
            const leftPct = (idx * 11) % 55;
            const widthPct = t.status === 'Done' ? 35 : 28;
            return (
              <div key={t.id} className="grid grid-cols-12 items-center gap-3 text-xs">
                <div className="col-span-4 truncate font-medium">{t.title}</div>
                <div className="col-span-6 h-6 rounded-md bg-slate-100 dark:bg-[#0B0D12] relative overflow-hidden">
                  <div
                    style={{ left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: activeProject.color }}
                    className="absolute top-1 bottom-1 rounded text-[10px] text-white px-2 flex items-center truncate"
                  >
                    {t.status}
                  </div>
                </div>
                <div className="col-span-2 text-right font-mono tabular-nums text-[11px] text-slate-500">
                  {t.dueDate || 'TBD'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Project Modal */}
      {newProjectOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateProject}
            className="w-full max-w-md bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Create Project</h3>
              <button type="button" onClick={() => setNewProjectOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Project Name</label>
              <input
                type="text"
                required
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                placeholder="e.g. Mobile Client Beta"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Description</label>
              <textarea
                rows={2}
                value={projDesc}
                onChange={(e) => setProjDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1">Priority</label>
                <select
                  value={projPriority}
                  onChange={(e) => setProjPriority(e.target.value as TaskPriority)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
                >
                  <option value="Urgent">Urgent</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Deadline</label>
                <input
                  type="date"
                  value={projDeadline}
                  onChange={(e) => setProjDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Kanban Columns (comma-separated)</label>
              <input
                type="text"
                value={projColumnsInput}
                onChange={(e) => setProjColumnsInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewProjectOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                Create Project
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick Add Task Modal */}
      {newTaskColumn && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTask}
            className="w-full max-w-md bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Add Task · {newTaskColumn}</h3>
              <button type="button" onClick={() => setNewTaskColumn(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Task Title</label>
              <input
                type="text"
                required
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Describe the deliverable..."
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Description</label>
              <textarea
                rows={2}
                value={taskDesc}
                onChange={(e) => setTaskDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs font-medium mb-1">Priority</label>
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <option value="Urgent">Urgent</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Assignee</label>
                <select
                  value={taskAssignee}
                  onChange={(e) => setTaskAssignee(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Due Date</label>
                <input
                  type="date"
                  value={taskDue}
                  onChange={(e) => setTaskDue(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewTaskColumn(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                Add Task
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Project Discussion Drawer */}
      {discussionOpen && activeProject && (
        <div className="fixed inset-y-0 right-0 z-50 w-96 bg-white dark:bg-[#13161F] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
          <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-sm font-semibold truncate">{activeProject.name} · Discussion</span>
            <button type="button" onClick={() => setDiscussionOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {comments.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">No project comments yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-xs font-semibold">{c.authorName}</div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{c.content}</p>
                </div>
              ))
            )}
          </div>
          <form onSubmit={handleAddComment} className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Post project update..."
              className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
            />
            <button type="submit" className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
              Post
            </button>
          </form>
        </div>
      )}

      {/* Delete Project Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-base font-bold">Delete Project?</h3>
            <p className="text-xs text-slate-500">
              This will permanently remove the project and all its tasks. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteProject(deleteConfirmId)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold"
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
