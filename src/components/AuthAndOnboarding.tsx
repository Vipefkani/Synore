import React, { useState } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FolderPlus,
  KeyRound,
  MailCheck,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { SynoreLogo } from './SynoreLogo';
import { useWorkspace } from '../context/WorkspaceContext';
import type { User, Workspace, WorkspaceRole } from '../types/synore';

const WORKSPACE_TYPES = [
  'Technology Startup',
  'Design & Creative Agency',
  'Enterprise Operations',
  'School & Research Lab',
  'Product & Engineering Team',
  'Consulting Firm',
];

const WORKSPACE_COLORS = ['#2563EB', '#0D9488', '#4F46E5', '#D97706', '#DC2626', '#334155'];

export function AuthScreen() {
  const { setSession, toggleTheme, theme, notify } = useWorkspace();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('elena@synore.io');
  const [password, setPassword] = useState('SynoreDemo!2026');
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetPreview, setResetPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingVerify, setPendingVerify] = useState<{ token: string; email: string } | null>(null);

  const handleLogin = async (loginEmail: string, loginPass: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign in failed');
      setSession(data.token, data.user, data.workspaces);
      notify('success', `Signed in as ${data.user.fullName}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setPendingVerify({ token: data.verificationToken, email: data.user.email });
      setSession(data.token, data.user, data.workspaces);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      if (data.resetCodePreview) setResetPreview(data.resetCodePreview);
      setMode('reset');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error requesting reset');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resetCode, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      notify('success', 'Password reset. Please sign in.');
      setMode('login');
      setPassword(newPassword);
      setResetPreview(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B0D12] text-slate-900 dark:text-slate-100">
      {/* Left Narrative Column */}
      <div className="hidden lg:flex lg:w-[46%] flex-col justify-between p-12 border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0F1219]">
        <div className="flex items-center justify-between">
          <SynoreLogo size={32} />
          <button
            type="button"
            onClick={toggleTheme}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
          >
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>

        <div className="max-w-lg space-y-6">
          <h1 className="font-display text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.15] text-balance">
            One connected workspace for communication, execution, and institutional knowledge.
          </h1>
          <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
            Synore brings real-time messaging, Kanban project delivery, collaborative documentation, file governance, and workspace analytics into a single multi-tenant architecture.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Real-Time Channels</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                WebSocket DMs, threaded discussions, typing indicators, and live team presence.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Multi-Tenant RBAC</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Strict workspace isolation across Owner, Admin, Manager, Member, and Guest roles.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Synced Kanban & Tasks</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Drag-and-drop project boards with live progress updates across connected clients.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Synora AI Briefing</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Server-side intelligence for channel summaries, document drafting, and action extraction.
              </p>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-500 flex items-center gap-4">
          <span>Multi-Tenant Workspace Architecture</span>
          <span aria-hidden="true">·</span>
          <span>End-to-End Authenticated Sessions</span>
        </div>
      </div>

      {/* Right Auth Column */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex items-center justify-between mb-4">
            <SynoreLogo size={28} />
            <button
              type="button"
              onClick={toggleTheme}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800"
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>

          <div className="bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-xl p-7 shadow-sm">
            <div className="mb-6">
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {mode === 'login'
                  ? 'Sign in to Synore'
                  : mode === 'register'
                  ? 'Create your Synore account'
                  : mode === 'forgot'
                  ? 'Recover your password'
                  : 'Set a new password'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {mode === 'login'
                  ? 'Enter your credentials or choose a demo workspace role below.'
                  : mode === 'register'
                  ? 'Start with a guided 7-step workspace setup.'
                  : 'We will issue a recovery verification code.'}
              </p>
            </div>

            {error && (
              <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {mode === 'login' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleLogin(email, password);
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Work Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setMode('forgot');
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 pr-10 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label="Toggle password visibility"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Job Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Operations Lead"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Work Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@company.com"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Password (8+ characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {loading ? 'Creating account...' : 'Create Account & Setup Workspace'}
                </button>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Account Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                >
                  {loading ? 'Issuing code...' : 'Send Reset Code'}
                </button>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleReset} className="space-y-3.5">
                {resetPreview && (
                  <div className="px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-500/30 text-xs text-blue-600 dark:text-blue-300 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 shrink-0" />
                    <span>
                      Recovery code: <strong className="font-mono">{resetPreview}</strong>
                    </span>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Reset Code</label>
                  <input
                    type="text"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="Enter recovery code"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                >
                  Update Password
                </button>
              </form>
            )}

            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              {mode === 'login' ? (
                <>
                  <span className="text-slate-500 dark:text-slate-400">New to Synore?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setEmail('');
                      setPassword('');
                      setMode('register');
                    }}
                    className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  <span className="text-slate-500 dark:text-slate-400">Already have an account?</span>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setEmail('elena@synore.io');
                      setPassword('SynoreDemo!2026');
                      setMode('login');
                    }}
                    className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Back to Sign In
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Quick Demo Account Switcher */}
          {mode === 'login' && (
            <div className="bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Instant Demo Workspace Access
                </span>
                <span className="text-[11px] text-slate-500 font-mono">Synore Core</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'Elena Rostova', role: 'Owner', email: 'elena@synore.io' },
                  { name: 'Marcus Vance', role: 'Administrator', email: 'marcus@synore.io' },
                  { name: 'Priya Nair', role: 'Manager', email: 'priya@synore.io' },
                  { name: 'David Lindqvist', role: 'Member', email: 'david@synore.io' },
                ].map((demo) => (
                  <button
                    key={demo.email}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setEmail(demo.email);
                      setPassword('SynoreDemo!2026');
                      handleLogin(demo.email, 'SynoreDemo!2026');
                    }}
                    className="text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{demo.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{demo.role}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {pendingVerify && (
            <div className="text-xs text-slate-500 text-center">
              Verification pending for {pendingVerify.email}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function OnboardingWizard({
  onCancel,
  allowCancel = false,
}: {
  onCancel?: () => void;
  allowCancel?: boolean;
}) {
  const { user, apiFetch, refreshWorkspaces, updateCurrentUser, switchWorkspace, notify } = useWorkspace();
  const [step, setStep] = useState(1);
  const [wsName, setWsName] = useState('');
  const [wsType, setWsType] = useState(WORKSPACE_TYPES[0]);
  const [wsColor, setWsColor] = useState(WORKSPACE_COLORS[0]);
  const [profileName, setProfileName] = useState(user?.fullName || '');
  const [profileTitle, setProfileTitle] = useState(user?.title || 'Founder & Lead');
  const [profileDept, setProfileDept] = useState(user?.department || 'Operations');
  const [invites, setInvites] = useState<Array<{ email: string; role: WorkspaceRole }>>([
    { email: '', role: 'Member' },
  ]);
  const [projName, setProjName] = useState('');
  const [projPriority, setProjPriority] = useState<'High' | 'Urgent' | 'Medium'>('High');
  const [projDeadline, setProjDeadline] = useState(
    new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10)
  );
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleVerifyNow = async () => {
    if (!user) return;
    setVerifying(true);
    try {
      const data = await apiFetch<{ user: User }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email: user.email }),
      });
      updateCurrentUser(data.user);
      notify('success', 'Email verified.');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleFinish = async () => {
    if (!wsName.trim()) {
      setError('Workspace name is required.');
      setStep(2);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const profileRes = await apiFetch<{ user: User }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: profileName,
          title: profileTitle,
          department: profileDept,
        }),
      });
      updateCurrentUser(profileRes.user);

      const wsRes = await apiFetch<{ workspace: Workspace }>('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({
          name: wsName.trim(),
          type: wsType,
          logoColor: wsColor,
          invites: invites.filter((i) => i.email.trim()),
          firstProject: projName.trim()
            ? { name: projName.trim(), priority: projPriority, deadline: projDeadline }
            : null,
        }),
      });
      await refreshWorkspaces();
      switchWorkspace(wsRes.workspace.id);
      notify('success', `Workspace "${wsRes.workspace.name}" is ready.`);
      onCancel?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to provision workspace');
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    'Create Workspace',
    'Workspace Name',
    'Workspace Type',
    'Your Profile',
    'Invite Team',
    'First Project',
    'Launch',
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B0D12] p-6">
      <div className="w-full max-w-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <SynoreLogo size={26} />
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Step {step} of 7 · {steps[step - 1]}
            </span>
            {allowCancel && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-7 gap-1.5 mb-8">
          {steps.map((label, idx) => (
            <div
              key={label}
              className={`h-1.5 rounded-full transition-colors ${
                idx + 1 <= step ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-800'
              }`}
            />
          ))}
        </div>

        {user && !user.emailVerified && (
          <div className="mb-5 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-amber-700 dark:text-amber-300">
              <MailCheck className="w-4 h-4 shrink-0" />
              <span>Verify your email ({user.email}) to activate workspace alerts.</span>
            </div>
            <button
              type="button"
              disabled={verifying}
              onClick={handleVerifyNow}
              className="px-3 py-1 rounded-md bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 whitespace-nowrap"
            >
              {verifying ? 'Verifying...' : 'Verify Email'}
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-500">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Create your connected workspace
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Workspaces in Synore are completely isolated multi-tenant environments. Each workspace maintains its own channels, projects, documents, files, permissions, and billing plan.
            </p>
            <div className="grid grid-cols-3 gap-3 pt-2">
              {[
                { title: 'Isolated Data', desc: 'Workspace-scoped permissions and audit history' },
                { title: 'Real-Time Sync', desc: 'Instant WebSocket channels and Kanban boards' },
                { title: 'Unified Knowledge', desc: 'Docs, files, and calendar linked to projects' },
              ].map((card) => (
                <div
                  key={card.title}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0B0D12]/60"
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{card.title}</div>
                  <div className="text-[11px] text-slate-500 mt-1">{card.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Name your workspace
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                This appears in the workspace switcher and team invitations.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Workspace Name
              </label>
              <input
                type="text"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="e.g. Northstar Robotics"
                className="w-full px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                Workspace Accent Mark
              </label>
              <div className="flex items-center gap-3">
                {WORKSPACE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setWsColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-white transition-transform ${
                      wsColor === c ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-[#13161F] scale-105' : ''
                    }`}
                  >
                    {wsColor === c && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Select workspace type
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Helps tailor default channels, knowledge templates, and reporting.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {WORKSPACE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setWsType(t)}
                  className={`text-left p-3.5 rounded-xl border text-sm font-medium transition-colors ${
                    wsType === t
                      ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Set up your member profile
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                How colleagues see you across channels, tasks, and documents.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Job Title</label>
                <input
                  type="text"
                  value={profileTitle}
                  onChange={(e) => setProfileTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Department</label>
                <input
                  type="text"
                  value={profileDept}
                  onChange={(e) => setProfileDept(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  Invite team members
                </h2>
                <p className="text-sm text-slate-500 mt-1">Optional — you can also invite members later.</p>
              </div>
              <button
                type="button"
                onClick={() => setInvites((prev) => [...prev, { email: '', role: 'Member' }])}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>
            </div>
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {invites.map((inv, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="email"
                    value={inv.email}
                    onChange={(e) =>
                      setInvites((prev) => prev.map((r, i) => (i === idx ? { ...r, email: e.target.value } : r)))
                    }
                    placeholder="colleague@company.com"
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
                  />
                  <select
                    value={inv.role}
                    onChange={(e) =>
                      setInvites((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, role: e.target.value as WorkspaceRole } : r))
                      )
                    }
                    className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
                  >
                    <option value="Administrator">Administrator</option>
                    <option value="Manager">Manager</option>
                    <option value="Member">Member</option>
                    <option value="Guest">Guest</option>
                  </select>
                  {invites.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setInvites((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                Create your first project
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Sets up an initial Kanban board, task list, and project timeline.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Project Name</label>
              <input
                type="text"
                value={projName}
                onChange={(e) => setProjName(e.target.value)}
                placeholder="e.g. Q1 Platform Launch"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Priority</label>
                <select
                  value={projPriority}
                  onChange={(e) => setProjPriority(e.target.value as 'High' | 'Urgent' | 'Medium')}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
                >
                  <option value="Urgent">Urgent</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Target Deadline
                </label>
                <input
                  type="date"
                  value={projDeadline}
                  onChange={(e) => setProjDeadline(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  Ready to enter {wsName || 'your workspace'}
                </h2>
                <p className="text-sm text-slate-500">Review your configuration before launching.</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              <div className="px-4 py-3 flex justify-between">
                <span className="text-slate-500">Workspace</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {wsName || 'Untitled'} · {wsType}
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-slate-500">Owner Profile</span>
                <span className="font-medium">
                  {profileName} ({profileTitle})
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-slate-500">Invited Members</span>
                <span className="font-mono tabular-nums">
                  {invites.filter((i) => i.email.trim()).length} colleague(s)
                </span>
              </div>
              <div className="px-4 py-3 flex justify-between">
                <span className="text-slate-500">First Project</span>
                <span className="font-medium">{projName.trim() || 'Skipped (create anytime)'}</span>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-sm font-medium disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Back
          </button>

          {step < 7 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 2 && !wsName.trim()) {
                  setError('Please enter a workspace name to continue.');
                  return;
                }
                setError(null);
                setStep((s) => Math.min(7, s + 1));
              }}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleFinish}
              className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
            >
              {submitting ? 'Provisioning...' : 'Enter Workspace Dashboard'}
              <ShieldCheck className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
