import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';

interface AnalyticsPayload {
  summary: {
    totalProjects: number;
    activeProjects: number;
    completedTasks: number;
    pendingTasks: number;
    overdueTasks: number;
    memberCount: number;
    messageCount: number;
    docCount: number;
    storageUsedBytes: number;
  };
  statusBreakdown: Array<{ status: string; count: number }>;
  projectRates: Array<{ name: string; progress: number; status: string; deadline: string }>;
  memberVelocity: Array<{ name: string; total: number; completed: number }>;
}

export function AnalyticsModule() {
  const { activeWorkspace, apiFetch } = useWorkspace();
  const [data, setData] = useState<AnalyticsPayload | null>(null);

  useEffect(() => {
    if (!activeWorkspace) return;
    apiFetch<AnalyticsPayload>(`/api/workspaces/${activeWorkspace.id}/analytics`)
      .then(setData)
      .catch(() => {});
  }, [activeWorkspace?.id]);

  if (!data) {
    return <div className="p-8 text-xs text-slate-500">Loading workspace analytics...</div>;
  }

  const maxStatus = Math.max(1, ...data.statusBreakdown.map((s) => s.count));
  const totalTasks = data.summary.completedTasks + data.summary.pendingTasks;
  const completionRate = totalTasks > 0 ? Math.round((data.summary.completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
        <h1 className="font-display text-xl font-bold">Workspace Analytics</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Real-time execution velocity, completion rates, and resource utilization for {activeWorkspace?.name}.
        </p>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Projects', value: data.summary.totalProjects, sub: `${data.summary.activeProjects} active` },
          { label: 'Completed Tasks', value: data.summary.completedTasks, sub: `${completionRate}% completion rate` },
          { label: 'Pending / Overdue', value: `${data.summary.pendingTasks} / ${data.summary.overdueTasks}`, sub: 'Open deliverables' },
          {
            label: 'Workspace Activity',
            value: data.summary.messageCount,
            sub: `${data.summary.docCount} docs · ${(data.summary.storageUsedBytes / (1024 * 1024)).toFixed(2)} MB`,
          },
        ].map((k) => (
          <div
            key={k.label}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F]"
          >
            <div className="text-xs text-slate-500">{k.label}</div>
            <div className="font-display text-2xl font-bold tabular-nums mt-1">{k.value}</div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task Status Bar Chart */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F]">
          <h2 className="font-display text-sm font-semibold mb-4">Task Distribution by Kanban Stage</h2>
          <div className="space-y-3">
            {data.statusBreakdown.map((item) => {
              const pct = Math.round((item.count / maxStatus) * 100);
              return (
                <div key={item.status} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{item.status}</span>
                    <span className="font-mono tabular-nums text-slate-500">{item.count}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 dark:bg-[#0B0D12] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${Math.max(item.count > 0 ? 6 : 0, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Project Completion Rates */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F]">
          <h2 className="font-display text-sm font-semibold mb-4">Project Completion & Deadlines</h2>
          <div className="space-y-3.5">
            {data.projectRates.map((p) => (
              <div key={p.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium truncate pr-2">{p.name}</span>
                  <span className="font-mono tabular-nums text-slate-500 shrink-0">
                    {p.progress}% · Due {p.deadline}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-[#0B0D12] overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${p.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Team Member Velocity Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-sm font-semibold">Team Delivery Breakdown</h2>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
            <tr>
              <th className="py-3 px-4 font-semibold">Team Member</th>
              <th className="py-3 px-4 font-semibold text-right">Assigned</th>
              <th className="py-3 px-4 font-semibold text-right">Completed</th>
              <th className="py-3 px-4 font-semibold text-right">Completion Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.memberVelocity.map((m) => {
              const rate = m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0;
              return (
                <tr key={m.name}>
                  <td className="py-3 px-4 font-medium">{m.name}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{m.total}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">{m.completed}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">{rate}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
