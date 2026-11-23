import React, { useEffect, useState } from 'react';
import { Plus, Shield, Trash2, UserPlus, Users, X } from 'lucide-react';
import { UserAvatar } from '../SynoreLogo';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { Department, WorkspaceMember, WorkspaceRole } from '../../types/synore';

const PERMISSION_KEYS: Array<{ key: string; label: string }> = [
  { key: 'manageSettings', label: 'Workspace Settings' },
  { key: 'manageMembers', label: 'Manage Members' },
  { key: 'createProjects', label: 'Create Projects' },
  { key: 'manageChannels', label: 'Manage Channels' },
  { key: 'accessDocuments', label: 'Access Docs' },
  { key: 'editDocuments', label: 'Edit Docs' },
  { key: 'shareFiles', label: 'Share Files' },
  { key: 'manageBilling', label: 'Manage Billing' },
];

export function TeamModule() {
  const { activeWorkspace, onlineUserIds, apiFetch, refreshMembers, refreshWorkspaces, notify } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roleDefaults, setRoleDefaults] = useState<Record<WorkspaceRole, Record<string, boolean>> | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [invRole, setInvRole] = useState<WorkspaceRole>('Member');
  const [invDept, setInvDept] = useState('');

  const [deptOpen, setDeptOpen] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [deptDesc, setDeptDesc] = useState('');

  const [selectedPermMember, setSelectedPermMember] = useState<WorkspaceMember | null>(null);

  const loadTeam = async () => {
    if (!activeWorkspace) return;
    const res = await apiFetch<{
      members: WorkspaceMember[];
      departments: Department[];
      roleDefaults: Record<WorkspaceRole, Record<string, boolean>>;
    }>(`/api/workspaces/${activeWorkspace.id}/members`);
    setMembers(res.members);
    setDepartments(res.departments);
    setRoleDefaults(res.roleDefaults);
  };

  useEffect(() => {
    loadTeam().catch(() => {});
  }, [activeWorkspace?.id]);

  const canManage = Boolean(activeWorkspace?.permissions.manageMembers);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !invEmail.trim()) return;
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/members/invite`, {
        method: 'POST',
        body: JSON.stringify({
          email: invEmail.trim(),
          fullName: invName.trim(),
          role: invRole,
          departmentId: invDept || null,
        }),
      });
      await loadTeam();
      await refreshMembers();
      setInviteOpen(false);
      setInvEmail('');
      setInvName('');
      notify('success', 'Team member invited');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Invite failed');
    }
  };

  const handleRoleChange = async (member: WorkspaceMember, nextRole: WorkspaceRole) => {
    if (!activeWorkspace || !canManage) return;
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/members/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      await loadTeam();
      await refreshMembers();
      await refreshWorkspaces();
      notify('success', `Updated ${member.fullName} to ${nextRole}`);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Role update failed');
    }
  };

  const handleToggleCustomPerm = async (member: WorkspaceMember, key: string) => {
    if (!activeWorkspace || !canManage) return;
    const nextPerms = { ...member.permissions, [key]: !member.permissions[key] };
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/members/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions: nextPerms }),
      });
      setSelectedPermMember({ ...member, permissions: nextPerms });
      await loadTeam();
      await refreshWorkspaces();
      notify('success', 'Permission updated');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Permission update failed');
    }
  };

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !deptName.trim()) return;
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/departments`, {
        method: 'POST',
        body: JSON.stringify({ name: deptName.trim(), description: deptDesc.trim() }),
      });
      await loadTeam();
      setDeptOpen(false);
      setDeptName('');
      setDeptDesc('');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to create department');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="font-display text-xl font-bold">Team, Departments & RBAC</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Enforce Owner, Administrator, Manager, Member, and Guest permissions across workspace resources.
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeptOpen(true)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> New Department
            </button>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" /> Invite Member
            </button>
          </div>
        )}
      </div>

      {/* Departments Strip */}
      {departments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {departments.map((d) => (
            <div
              key={d.id}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F]"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{d.name}</span>
                <span className="text-xs font-mono tabular-nums text-slate-500">{d.memberCount} members</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{d.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Members Directory */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
            <tr>
              <th className="py-3 px-4 font-semibold">Member</th>
              <th className="py-3 px-4 font-semibold">Title & Department</th>
              <th className="py-3 px-4 font-semibold">Role</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold text-right">Permissions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map((m) => {
              const isOnline = onlineUserIds.includes(m.userId);
              return (
                <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={m.fullName} avatarUrl={m.avatarUrl} size="sm" online={isOnline} />
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{m.fullName}</div>
                        <div className="text-[11px] text-slate-500">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div>{m.title}</div>
                    <div className="text-[11px] text-slate-500">{m.department}</div>
                  </td>
                  <td className="py-3 px-4">
                    {canManage && m.role !== 'Owner' ? (
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m, e.target.value as WorkspaceRole)}
                        className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs font-medium"
                      >
                        <option value="Administrator">Administrator</option>
                        <option value="Manager">Manager</option>
                        <option value="Member">Member</option>
                        <option value="Guest">Guest</option>
                      </select>
                    ) : (
                      <span className="font-semibold">{m.role}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-500">{isOnline ? 'Online' : m.status}</td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPermMember(m)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 text-xs"
                    >
                      <Shield className="w-3 h-3" /> Matrix
                    </button>
                    {canManage && m.role !== 'Owner' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/workspaces/${activeWorkspace!.id}/members/${m.id}`, {
                            method: 'DELETE',
                          });
                          await loadTeam();
                          await refreshMembers();
                          notify('success', `Removed ${m.fullName}`);
                        }}
                        className="p-1.5 rounded text-slate-400 hover:text-red-500"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Role Permissions Reference Matrix */}
      {roleDefaults && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] overflow-x-auto">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display text-sm font-semibold">Workspace Role Permission Matrix</h2>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Capability</th>
                {(['Owner', 'Administrator', 'Manager', 'Member', 'Guest'] as WorkspaceRole[]).map((r) => (
                  <th key={r} className="py-2.5 px-4 font-semibold text-center">
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {PERMISSION_KEYS.map((pk) => (
                <tr key={pk.key}>
                  <td className="py-2.5 px-4 font-medium">{pk.label}</td>
                  {(['Owner', 'Administrator', 'Manager', 'Member', 'Guest'] as WorkspaceRole[]).map((r) => (
                    <td key={r} className="py-2.5 px-4 text-center font-mono">
                      {roleDefaults[r]?.[pk.key] ? (
                        <span className="text-emerald-500 font-semibold">Allow</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Custom Member Permission Modal */}
      {selectedPermMember && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold">{selectedPermMember.fullName}</h3>
                <p className="text-xs text-slate-500">Role: {selectedPermMember.role}</p>
              </div>
              <button type="button" onClick={() => setSelectedPermMember(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              {PERMISSION_KEYS.map((pk) => {
                const enabled = Boolean(selectedPermMember.permissions[pk.key]);
                return (
                  <label
                    key={pk.key}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <span>{pk.label}</span>
                    <input
                      type="checkbox"
                      disabled={!canManage || selectedPermMember.role === 'Owner'}
                      checked={enabled}
                      onChange={() => handleToggleCustomPerm(selectedPermMember, pk.key)}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleInvite}
            className="w-full max-w-md bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Invite Member</h3>
              <button type="button" onClick={() => setInviteOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="email"
              required
              value={invEmail}
              onChange={(e) => setInvEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
            />
            <input
              type="text"
              value={invName}
              onChange={(e) => setInvName(e.target.value)}
              placeholder="Full Name"
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={invRole}
                onChange={(e) => setInvRole(e.target.value as WorkspaceRole)}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
              >
                <option value="Administrator">Administrator</option>
                <option value="Manager">Manager</option>
                <option value="Member">Member</option>
                <option value="Guest">Guest</option>
              </select>
              <select
                value={invDept}
                onChange={(e) => setInvDept(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
              >
                <option value="">No Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                Send Invite
              </button>
            </div>
          </form>
        </div>
      )}

      {/* New Department Modal */}
      {deptOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateDept}
            className="w-full max-w-sm bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="font-display text-base font-bold">New Department</h3>
            <input
              type="text"
              required
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              placeholder="Department name"
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
            />
            <input
              type="text"
              value={deptDesc}
              onChange={(e) => setDeptDesc(e.target.value)}
              placeholder="Purpose or charter"
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeptOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
