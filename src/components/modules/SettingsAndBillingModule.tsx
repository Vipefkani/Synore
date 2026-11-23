import React, { useEffect, useState } from 'react';
import { Check, CreditCard, ShieldAlert, User as UserIcon } from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { AuditLogItem, BillingPlan, User } from '../../types/synore';

const AVATAR_PRESETS = [
  '/src/assets/images/avatar_elena_1795432559024.jpg',
  '/src/assets/images/avatar_marcus_1795432558771.jpg',
  '/src/assets/images/avatar_priya_1795432558822.jpg',
  '/src/assets/images/avatar_david_1795432559097.jpg',
];

export function SettingsAndBillingModule() {
  const { user, activeWorkspace, apiFetch, updateCurrentUser, refreshWorkspaces, notify } = useWorkspace();
  const [tab, setTab] = useState<'profile' | 'workspace' | 'billing' | 'audit'>('profile');

  // Profile form
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [title, setTitle] = useState(user?.title || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [status, setStatus] = useState(user?.status || 'Available');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [notifPrefs, setNotifPrefs] = useState({
    messages: true,
    tasks: true,
    mentions: true,
    meetings: true,
    emailDigest: true,
  });

  // Workspace form
  const [wsName, setWsName] = useState(activeWorkspace?.name || '');
  const [wsType, setWsType] = useState(activeWorkspace?.type || '');
  const [wsBillingEmail, setWsBillingEmail] = useState(activeWorkspace?.billingEmail || '');

  // Billing state
  const [billingData, setBillingData] = useState<{
    subscription: {
      plan: BillingPlan;
      status: string;
      billingCycle: string;
      seatLimit: number;
      storageLimitBytes: number;
      currentPeriodEnd: string;
      stripeConfigured: boolean;
      mpesaConfigured: boolean;
    } | null;
    usage: { seatCount: number; storageUsedBytes: number };
    payments: Array<{
      id: string;
      amountCents: number;
      currency: string;
      provider: string;
      status: string;
      invoiceNumber: string;
      createdAt: string;
    }>;
  } | null>(null);
  const [provider, setProvider] = useState<'Stripe' | 'M-Pesa'>('Stripe');
  const [mpesaPhone, setMpesaPhone] = useState('+254700000000');

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  useEffect(() => {
    setWsName(activeWorkspace?.name || '');
    setWsType(activeWorkspace?.type || '');
    setWsBillingEmail(activeWorkspace?.billingEmail || '');
  }, [activeWorkspace?.id]);

  useEffect(() => {
    apiFetch<{
      notificationPrefs: {
        messages: boolean;
        tasks: boolean;
        mentions: boolean;
        meetings: boolean;
        emailDigest: boolean;
      };
    }>('/api/auth/me')
      .then((res) => {
        if (res.notificationPrefs) setNotifPrefs(res.notificationPrefs);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeWorkspace) return;
    if (tab === 'billing') {
      apiFetch<typeof billingData>(`/api/workspaces/${activeWorkspace.id}/billing`)
        .then(setBillingData)
        .catch(() => {});
    }
    if (tab === 'audit' && activeWorkspace.permissions.manageSettings) {
      apiFetch<{ logs: AuditLogItem[] }>(`/api/workspaces/${activeWorkspace.id}/audit-logs`)
        .then((res) => setAuditLogs(res.logs))
        .catch(() => {});
    }
  }, [tab, activeWorkspace?.id]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ user: User }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ fullName, title, department, status, avatarUrl, notificationPrefs: notifPrefs }),
      });
      updateCurrentUser(res.user);
      notify('success', 'Profile & notification preferences saved');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to save profile');
    }
  };

  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace) return;
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: wsName, type: wsType, billingEmail: wsBillingEmail }),
      });
      await refreshWorkspaces();
      notify('success', 'Workspace settings updated');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Permission denied');
    }
  };

  const handleUpgradePlan = async (plan: BillingPlan) => {
    if (!activeWorkspace) return;
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/billing/upgrade`, {
        method: 'POST',
        body: JSON.stringify({ plan, provider, billingCycle: 'monthly', mpesaPhone }),
      });
      const refreshed = await apiFetch<typeof billingData>(`/api/workspaces/${activeWorkspace.id}/billing`);
      setBillingData(refreshed);
      await refreshWorkspaces();
      notify('success', `Workspace plan switched to ${plan}`);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Billing update failed');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="font-display text-xl font-bold">Settings & Administration</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your profile, workspace isolation, subscriptions, and security audit trail.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-[#13161F] border border-slate-200 dark:border-slate-800">
          {(
            [
              ['profile', 'Account & Alerts'],
              ['workspace', 'Workspace'],
              ['billing', 'Subscription & Billing'],
              ['audit', 'Audit Logs'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
                tab === id
                  ? 'bg-white dark:bg-[#1F2536] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] p-6 space-y-5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UserIcon className="w-4 h-4 text-blue-500" /> Personal Profile
            </div>
            <span className="text-xs text-slate-500">
              {user?.emailVerified ? 'Email Verified' : 'Pending Verification'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium mb-2">Profile Picture</label>
            <div className="flex items-center gap-3">
              {AVATAR_PRESETS.map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setAvatarUrl(src)}
                  className={`rounded-full p-0.5 border-2 ${
                    avatarUrl === src ? 'border-blue-600' : 'border-transparent'
                  }`}
                >
                  <img src={src} alt="Avatar preset" className="w-10 h-10 rounded-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Job Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Availability Status</label>
              <input
                type="text"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="text-xs font-semibold mb-3">Notification Preferences</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              {(
                [
                  ['messages', 'Direct & Channel Messages'],
                  ['tasks', 'Task Assignments & Due Dates'],
                  ['mentions', 'Workspace Mentions'],
                  ['meetings', 'Meeting Invitations'],
                  ['emailDigest', 'Email Digest Alerts'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={notifPrefs[k]}
                    onChange={(e) => setNotifPrefs((prev) => ({ ...prev, [k]: e.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className="px-5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
              Save Changes
            </button>
          </div>
        </form>
      )}

      {tab === 'workspace' && (
        <form
          onSubmit={handleSaveWorkspace}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] p-6 space-y-4"
        >
          <h2 className="font-display text-base font-bold">Workspace Configuration</h2>
          {!activeWorkspace?.permissions.manageSettings && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-500">
              Read-only view: Only Owners or Administrators can update workspace settings.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Workspace Name</label>
              <input
                type="text"
                disabled={!activeWorkspace?.permissions.manageSettings}
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Organization Type</label>
              <input
                type="text"
                disabled={!activeWorkspace?.permissions.manageSettings}
                value={wsType}
                onChange={(e) => setWsType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Billing Email</label>
              <input
                type="email"
                disabled={!activeWorkspace?.permissions.manageSettings}
                value={wsBillingEmail}
                onChange={(e) => setWsBillingEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
          </div>
          {activeWorkspace?.permissions.manageSettings && (
            <div className="flex justify-end">
              <button type="submit" className="px-5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                Update Workspace
              </button>
            </div>
          )}
        </form>
      )}

      {tab === 'billing' && billingData && (
        <div className="space-y-6">
          {/* Usage & Payment Gateway Selector */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500">Current Subscription</div>
              <div className="font-display text-lg font-bold mt-0.5">
                {billingData.subscription?.plan} Plan ·{' '}
                <span className="font-mono tabular-nums text-sm font-normal text-slate-500">
                  {billingData.usage.seatCount}/{billingData.subscription?.seatLimit} seats used
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800">
                {(['Stripe', 'M-Pesa'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className={`px-3 py-1 rounded-md text-xs font-medium ${
                      provider === p ? 'bg-white dark:bg-[#1F2536] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              {provider === 'M-Pesa' && (
                <input
                  type="text"
                  value={mpesaPhone}
                  onChange={(e) => setMpesaPhone(e.target.value)}
                  placeholder="+254..."
                  className="px-3 py-1.5 w-36 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
              )}
            </div>
          </div>

          {/* Plan Tiers */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(
              [
                {
                  plan: 'FREE' as BillingPlan,
                  audience: 'For early-stage teams',
                  price: '$0 / mo',
                  limits: ['Up to 5 workspace members', '5 GB file storage', 'Core Kanban & channels'],
                },
                {
                  plan: 'PRO' as BillingPlan,
                  audience: 'For scaling operations',
                  price: '$49 / mo',
                  limits: ['Up to 25 workspace members', '100 GB file storage', 'Analytics, versioning & AI briefs'],
                },
                {
                  plan: 'BUSINESS' as BillingPlan,
                  audience: 'For enterprise governance',
                  price: '$149 / mo',
                  limits: ['Up to 250 members', '1 TB storage', 'Custom RBAC overrides & audit logs'],
                },
              ]
            ).map((tier) => {
              const current = billingData.subscription?.plan === tier.plan;
              return (
                <div
                  key={tier.plan}
                  className={`p-5 rounded-xl border bg-white dark:bg-[#13161F] flex flex-col justify-between ${
                    current ? 'border-blue-600' : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div>
                    <div className="text-xs text-slate-500">{tier.audience}</div>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="font-display text-lg font-bold">{tier.plan}</span>
                      <span className="font-mono tabular-nums text-sm font-semibold">{tier.price}</span>
                    </div>
                    <ul className="mt-4 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                      {tier.limits.map((l) => (
                        <li key={l} className="flex items-center gap-2">
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{l}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    disabled={current || !activeWorkspace?.permissions.manageBilling}
                    onClick={() => handleUpgradePlan(tier.plan)}
                    className={`mt-5 w-full py-2 rounded-lg text-xs font-semibold ${
                      current
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        : 'bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40'
                    }`}
                  >
                    {current ? 'Current Plan' : `Switch to ${tier.plan} via ${provider}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Invoices */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] overflow-x-auto">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-semibold">
              <CreditCard className="w-4 h-4 text-blue-500" /> Payment & Invoice History
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-2.5 px-4">Invoice</th>
                  <th className="py-2.5 px-4">Provider</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {billingData.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 px-4 font-mono">{p.invoiceNumber}</td>
                    <td className="py-2.5 px-4">{p.provider}</td>
                    <td className="py-2.5 px-4 text-emerald-500 font-medium">{p.status}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                      {(p.amountCents / 100).toFixed(2)} {p.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] overflow-x-auto">
          {!activeWorkspace?.permissions.manageSettings ? (
            <div className="p-8 text-center text-xs text-slate-500">
              <ShieldAlert className="w-7 h-7 mx-auto mb-2 text-amber-500" />
              Audit logs are restricted to Workspace Owners and Administrators.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Resource</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">
                      {new Date(l.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 font-medium">{l.userName}</td>
                    <td className="py-2.5 px-4 font-mono">{l.action}</td>
                    <td className="py-2.5 px-4 text-slate-500">
                      {l.resourceType} ({l.resourceId})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
