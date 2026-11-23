import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckSquare, MessageSquare, Plus, Search, Trash2, X } from 'lucide-react';
import { UserAvatar } from '../SynoreLogo';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { Comment, Project, Task, TaskPriority } from '../../types/synore';

type TaskFilterTab = 'my' | 'assigned_by_me' | 'upcoming' | 'overdue' | 'completed' | 'all';

export function TasksModule() {
  const { user, activeWorkspace, members, focusedEntityId, apiFetch, subscribeWs, notify } = useWorkspace();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<TaskFilterTab>('my');
  const [search, setSearch] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('Medium');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDue, setNewDue] = useState('');

  const loadTasks = async () => {
    if (!activeWorkspace) return;
    const [tRes, pRes] = await Promise.all([
      apiFetch<{ tasks: Task[] }>(`/api/workspaces/${activeWorkspace.id}/tasks`),
      apiFetch<{ projects: Project[] }>(`/api/workspaces/${activeWorkspace.id}/projects`),
    ]);
    setTasks(tRes.tasks);
    setProjects(pRes.projects);
    if (!newProjectId && pRes.projects.length > 0) {
      setNewProjectId(pRes.projects[0].id);
    }
    if (focusedEntityId) {
      const match = tRes.tasks.find((t) => t.id === focusedEntityId);
      if (match) {
        setTab('all');
        openTaskDetail(match);
      }
    }
  };

  useEffect(() => {
    loadTasks().catch(() => {});
  }, [activeWorkspace?.id]);

  useEffect(() => {
    return subscribeWs((wsMsg) => {
      if (wsMsg.workspaceId !== activeWorkspace?.id) return;
      if (wsMsg.event === 'task:created') {
        const { task } = wsMsg.payload as { task: Task };
        setTasks((prev) => (prev.some((x) => x.id === task.id) ? prev : [task, ...prev]));
      }
      if (wsMsg.event === 'task:updated') {
        const { task } = wsMsg.payload as { task: Task };
        setTasks((prev) => prev.map((x) => (x.id === task.id ? task : x)));
        setSelectedTask((curr) => (curr?.id === task.id ? task : curr));
      }
      if (wsMsg.event === 'task:deleted') {
        const { id } = wsMsg.payload as { id: string };
        setTasks((prev) => prev.filter((x) => x.id !== id));
        setSelectedTask((curr) => (curr?.id === id ? null : curr));
      }
    });
  }, [activeWorkspace?.id]);

  const openTaskDetail = async (task: Task) => {
    setSelectedTask(task);
    if (!activeWorkspace) return;
    const res = await apiFetch<{ comments: Comment[] }>(
      `/api/workspaces/${activeWorkspace.id}/comments?entityType=task&entityId=${task.id}`
    );
    setComments(res.comments);
  };

  const today = new Date().toISOString().slice(0, 10);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (search.trim() && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (tab === 'my') return t.assigneeId === user?.id && t.status !== 'Done';
      if (tab === 'assigned_by_me') return t.creatorId === user?.id;
      if (tab === 'upcoming') return t.status !== 'Done' && t.dueDate && t.dueDate >= today;
      if (tab === 'overdue') return t.status !== 'Done' && t.dueDate && t.dueDate < today;
      if (tab === 'completed') return t.status === 'Done';
      return true;
    });
  }, [tasks, tab, search, user?.id, today]);

  const handlePatchTask = async (taskId: string, patch: Record<string, unknown>) => {
    if (!activeWorkspace) return;
    try {
      const res = await apiFetch<{ task: Task }>(`/api/workspaces/${activeWorkspace.id}/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? res.task : t)));
      if (selectedTask?.id === taskId) setSelectedTask(res.task);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to update task');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !newProjectId || !newTitle.trim()) return;
    try {
      const res = await apiFetch<{ task: Task }>(`/api/workspaces/${activeWorkspace.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          projectId: newProjectId,
          title: newTitle,
          priority: newPriority,
          assigneeId: newAssignee || user?.id,
          dueDate: newDue || null,
          status: 'To Do',
        }),
      });
      setTasks((prev) => (prev.some((x) => x.id === res.task.id) ? prev : [res.task, ...prev]));
      setCreateOpen(false);
      setNewTitle('');
      notify('success', 'Task created');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to create task');
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !selectedTask || !newSubtaskTitle.trim()) return;
    const res = await apiFetch<{ subtask: { id: string; taskId: string; title: string; isCompleted: boolean; position: number } }>(
      `/api/workspaces/${activeWorkspace.id}/tasks/${selectedTask.id}/subtasks`,
      { method: 'POST', body: JSON.stringify({ title: newSubtaskTitle.trim() }) }
    );
    const updated = { ...selectedTask, subtasks: [...selectedTask.subtasks, res.subtask] };
    setSelectedTask(updated);
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setNewSubtaskTitle('');
  };

  const handleToggleSubtask = async (subId: string, currentDone: boolean) => {
    if (!activeWorkspace || !selectedTask) return;
    await apiFetch(`/api/workspaces/${activeWorkspace.id}/subtasks/${subId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isCompleted: !currentDone }),
    });
    const updated = {
      ...selectedTask,
      subtasks: selectedTask.subtasks.map((s) => (s.id === subId ? { ...s, isCompleted: !currentDone } : s)),
    };
    setSelectedTask(updated);
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !selectedTask || !commentText.trim()) return;
    const res = await apiFetch<{ comment: Comment }>(`/api/workspaces/${activeWorkspace.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ entityType: 'task', entityId: selectedTask.id, content: commentText.trim() }),
    });
    setComments((prev) => [...prev, res.comment]);
    setCommentText('');
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!activeWorkspace) return;
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/tasks/${taskId}`, { method: 'DELETE' });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (selectedTask?.id === taskId) setSelectedTask(null);
      setDeleteId(null);
      notify('success', 'Task deleted');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to delete task');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 overflow-x-auto">
          {(
            [
              ['my', 'My Tasks'],
              ['assigned_by_me', 'Assigned by Me'],
              ['upcoming', 'Upcoming'],
              ['overdue', 'Overdue'],
              ['completed', 'Completed'],
              ['all', 'All Workspace'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                tab === id
                  ? 'bg-white dark:bg-[#1F2536] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter tasks..."
              className="pl-8 pr-3 py-2 rounded-lg bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 text-xs"
            />
          </div>
          {activeWorkspace?.role !== 'Guest' && projects.length > 0 && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" /> New Task
            </button>
          )}
        </div>
      </div>

      {/* Tasks Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] overflow-x-auto">
        {filteredTasks.length === 0 ? (
          <div className="p-10 text-center">
            <CheckSquare className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium">No tasks match this filter</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-3 px-4 w-8"></th>
                <th className="py-3 px-4 font-semibold">Title</th>
                <th className="py-3 px-4 font-semibold">Project</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Priority</th>
                <th className="py-3 px-4 font-semibold">Assignee</th>
                <th className="py-3 px-4 font-semibold text-right">Due Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTasks.map((t) => {
                const isOverdue = t.status !== 'Done' && t.dueDate && t.dueDate < today;
                return (
                  <tr
                    key={t.id}
                    onClick={() => openTaskDetail(t)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handlePatchTask(t.id, { status: t.status === 'Done' ? 'To Do' : 'Done' })}
                        className={`w-4 h-4 rounded border flex items-center justify-center ${
                          t.status === 'Done'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {t.status === 'Done' && <Check className="w-3 h-3" />}
                      </button>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                      <span className={t.status === 'Done' ? 'line-through text-slate-400' : ''}>{t.title}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">{t.projectName}</td>
                    <td className="py-3 px-4">{t.status}</td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          t.priority === 'Urgent'
                            ? 'text-red-500 font-semibold'
                            : t.priority === 'High'
                            ? 'text-amber-500 font-medium'
                            : ''
                        }
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {t.assigneeName ? (
                        <div className="flex items-center gap-2">
                          <UserAvatar name={t.assigneeName} avatarUrl={t.assigneeAvatar} size="xs" />
                          <span>{t.assigneeName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums ${
                        isOverdue ? 'text-red-500 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      {t.dueDate || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Task Detail Drawer */}
      {selectedTask && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white dark:bg-[#13161F] border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
          <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-mono text-slate-500">{selectedTask.projectName}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDeleteId(selectedTask.id)}
                className="p-1.5 rounded text-slate-400 hover:text-red-500"
                title="Delete task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setSelectedTask(null)} className="text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <input
              type="text"
              value={selectedTask.title}
              onChange={(e) => setSelectedTask({ ...selectedTask, title: e.target.value })}
              onBlur={() => handlePatchTask(selectedTask.id, { title: selectedTask.title })}
              className="w-full font-display text-lg font-bold bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none pb-1"
            />

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Status</label>
                <select
                  value={selectedTask.status}
                  onChange={(e) => handlePatchTask(selectedTask.id, { status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800"
                >
                  {['Backlog', 'To Do', 'In Progress', 'Review', 'Done'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Priority</label>
                <select
                  value={selectedTask.priority}
                  onChange={(e) => handlePatchTask(selectedTask.id, { priority: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800"
                >
                  {['Low', 'Medium', 'High', 'Urgent'].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Assignee</label>
                <select
                  value={selectedTask.assigneeId || ''}
                  onChange={(e) => handlePatchTask(selectedTask.id, { assigneeId: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800"
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
                <label className="block text-slate-500 mb-1">Due Date</label>
                <input
                  type="date"
                  value={selectedTask.dueDate || ''}
                  onChange={(e) => handlePatchTask(selectedTask.id, { dueDate: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Description</label>
              <textarea
                rows={3}
                value={selectedTask.description}
                onChange={(e) => setSelectedTask({ ...selectedTask, description: e.target.value })}
                onBlur={() => handlePatchTask(selectedTask.id, { description: selectedTask.description })}
                className="w-full p-3 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>

            {/* Subtasks */}
            <div>
              <div className="text-xs font-semibold mb-2">
                Subtasks ({selectedTask.subtasks.filter((s) => s.isCompleted).length}/{selectedTask.subtasks.length})
              </div>
              <div className="space-y-1.5 mb-2">
                {selectedTask.subtasks.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={s.isCompleted}
                      onChange={() => handleToggleSubtask(s.id, s.isCompleted)}
                    />
                    <span className={s.isCompleted ? 'line-through text-slate-400' : ''}>{s.title}</span>
                  </label>
                ))}
              </div>
              <form onSubmit={handleAddSubtask} className="flex gap-2">
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Add subtask..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
                />
                <button type="submit" className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium">
                  Add
                </button>
              </form>
            </div>

            {/* Comments */}
            <div>
              <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Comments ({comments.length})
              </div>
              <div className="space-y-2.5 mb-3">
                {comments.map((c) => (
                  <div key={c.id} className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs">
                    <div className="font-semibold">{c.authorName}</div>
                    <p className="text-slate-600 dark:text-slate-300 mt-1">{c.content}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
                />
                <button type="submit" className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                  Comment
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateTask}
            className="w-full max-w-md bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">New Task</h3>
              <button type="button" onClick={() => setCreateOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Project</label>
              <select
                value={newProjectId}
                onChange={(e) => setNewProjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Title</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                className="px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
              <select
                value={newAssignee}
                onChange={(e) => setNewAssignee(e.target.value)}
                className="px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
              >
                <option value="">Assign to me</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.fullName}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                Create Task
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-base font-bold">Delete Task?</h3>
            <p className="text-xs text-slate-500">This task and its subtasks will be permanently deleted.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteTask(deleteId)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
