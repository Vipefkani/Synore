import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { db, hashPasswordSync, uploadsDir } from './db.ts';
import {
  AuthenticatedRequest,
  logAudit,
  rateLimit,
  requireAuth,
  requireWorkspaceMember,
  resolvePermissions,
  ROLE_DEFAULT_PERMISSIONS,
  signToken,
  verifyPassword,
} from './auth.ts';
import { broadcastToWorkspace, getOnlineUserIds, sendToUserInWorkspace } from './ws.ts';
import { runSynoraAi, type AiMode } from './ai.ts';
import type { WorkspaceRole } from '../src/types/synore.ts';

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const safeBase = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
      const wsId = (req.params.id || 'ws').replace(/[^a-zA-Z0-9_-]/g, '');
      cb(null, `${wsId}_${crypto.randomUUID().slice(0, 10)}_${safeBase}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

function formatUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    title: row.title,
    department: row.department,
    avatarUrl: row.avatar_url || '',
    status: row.status || 'Available',
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at,
  };
}

function getWorkspacesForUser(userId: string) {
  const rows = db
    .prepare(`
      SELECT w.*, wm.role, wm.permissions_json
      FROM workspaces w
      JOIN workspace_memberships wm ON wm.workspace_id = w.id
      WHERE wm.user_id = ?
      ORDER BY w.created_at ASC
    `)
    .all(userId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    type: r.type,
    logoColor: r.logo_color,
    ownerId: r.owner_id,
    plan: r.plan,
    storageQuotaBytes: r.storage_quota_bytes,
    billingEmail: r.billing_email,
    role: r.role as WorkspaceRole,
    permissions: resolvePermissions(r.role as WorkspaceRole, String(r.permissions_json || '')),
    createdAt: r.created_at,
  }));
}

function formatMessage(row: Record<string, unknown>) {
  const reactionsRows = db
    .prepare('SELECT emoji, user_id FROM message_reactions WHERE message_id = ?')
    .all(row.id) as Array<{ emoji: string; user_id: string }>;

  const reactionMap = new Map<string, string[]>();
  for (const r of reactionsRows) {
    const list = reactionMap.get(r.emoji) || [];
    list.push(r.user_id);
    reactionMap.set(r.emoji, list);
  }

  const replyCount = (
    db.prepare('SELECT COUNT(*) as c FROM messages WHERE parent_message_id = ? AND is_deleted = 0').get(row.id) as {
      c: number;
    }
  ).c;

  let replyPreview: { senderName: string; content: string } | null = null;
  if (row.parent_message_id) {
    const parent = db
      .prepare('SELECT m.content, u.full_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?')
      .get(row.parent_message_id) as { content: string; full_name: string } | undefined;
    if (parent) {
      replyPreview = { senderName: parent.full_name, content: parent.content.slice(0, 90) };
    }
  }

  let attachments = [];
  let readBy = [];
  try {
    attachments = JSON.parse(String(row.attachments_json || '[]'));
  } catch {
    attachments = [];
  }
  try {
    readBy = JSON.parse(String(row.read_by_json || '[]'));
  } catch {
    readBy = [];
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id || null,
    threadId: row.thread_id || null,
    parentMessageId: row.parent_message_id || null,
    senderId: row.sender_id,
    senderName: row.sender_name,
    senderAvatar: row.sender_avatar || '',
    senderTitle: row.sender_title || '',
    content: row.is_deleted ? 'This message was deleted.' : row.content,
    attachments,
    isPinned: Boolean(row.is_pinned),
    isEdited: Boolean(row.is_edited),
    isDeleted: Boolean(row.is_deleted),
    readBy,
    reactions: Array.from(reactionMap.entries()).map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      userIds,
    })),
    replyCount,
    replyPreview,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recalculateProjectProgress(projectId: string, workspaceId: string) {
  const counts = db
    .prepare(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END) as done
      FROM tasks WHERE project_id = ? AND workspace_id = ?
    `)
    .get(projectId, workspaceId) as { total: number; done: number | null };

  const total = counts.total || 0;
  const done = counts.done || 0;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);
  db.prepare('UPDATE projects SET progress = ? WHERE id = ? AND workspace_id = ?').run(progress, projectId, workspaceId);
  return { total, done, progress };
}

function formatTask(row: Record<string, unknown>) {
  const subtasks = db
    .prepare('SELECT id, task_id, title, is_completed, position FROM subtasks WHERE task_id = ? ORDER BY position ASC')
    .all(row.id) as Array<{ id: string; task_id: string; title: string; is_completed: number; position: number }>;

  const commentCount = (
    db.prepare("SELECT COUNT(*) as c FROM comments WHERE entity_type = 'task' AND entity_id = ?").get(row.id) as {
      c: number;
    }
  ).c;

  let labels: string[] = [];
  try {
    labels = JSON.parse(String(row.labels_json || '[]'));
  } catch {
    labels = [];
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    projectName: row.project_name || '',
    title: row.title,
    description: row.description || '',
    status: row.status,
    priority: row.priority,
    assigneeId: row.assignee_id || null,
    assigneeName: row.assignee_name || null,
    assigneeAvatar: row.assignee_avatar || null,
    creatorId: row.creator_id,
    creatorName: row.creator_name || '',
    startDate: row.start_date || null,
    dueDate: row.due_date || null,
    labels,
    position: row.position,
    subtasks: subtasks.map((s) => ({
      id: s.id,
      taskId: s.task_id,
      title: s.title,
      isCompleted: Boolean(s.is_completed),
      position: s.position,
    })),
    commentCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createNotification(
  workspaceId: string,
  userId: string,
  type: string,
  title: string,
  body: string,
  linkView: string,
  linkId: string | null = null
) {
  const id = uid('ntf');
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO notifications (id, workspace_id, user_id, type, title, body, link_view, link_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(id, workspaceId, userId, type, title, body, linkView, linkId, createdAt);

  sendToUserInWorkspace(workspaceId, userId, 'notification:created', {
    id,
    workspaceId,
    userId,
    type,
    title,
    body,
    linkView,
    linkId,
    isRead: false,
    createdAt,
  });
}

// ==========================================
// AUTHENTICATION & USER PROFILE ROUTES
// ==========================================

router.post('/auth/register', rateLimit(15, 60_000), (req, res) => {
  const { email, password, fullName, title, department } = req.body || {};
  if (!email || typeof email !== 'string' || !password || typeof password !== 'string' || !fullName || typeof fullName !== 'string') {
    return res.status(400).json({ error: 'Full name, valid email, and password (min 8 chars) are required.' });
  }
  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const userId = uid('usr');
  const verificationToken = crypto.randomBytes(16).toString('hex');
  const createdAt = new Date().toISOString();
  const passwordHash = hashPasswordSync(password);

  db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, title, department, avatar_url, status, email_verified, verification_token, created_at)
    VALUES (?, ?, ?, ?, ?, ?, '', 'Available', 0, ?, ?)
  `).run(userId, cleanEmail, passwordHash, fullName.trim(), (title || 'Workspace Member').trim(), (department || 'General').trim(), verificationToken, createdAt);

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>;
  const token = signToken({ sub: userId, email: cleanEmail });

  res.status(201).json({
    token,
    user: formatUser(row),
    workspaces: [],
    verificationToken,
  });
});

router.post('/auth/login', rateLimit(20, 60_000), (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const cleanEmail = String(email).trim().toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as Record<string, unknown> | undefined;
  if (!row || !verifyPassword(String(password), String(row.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = signToken({ sub: String(row.id), email: cleanEmail });
  const workspaces = getWorkspacesForUser(String(row.id));

  res.json({
    token,
    user: formatUser(row),
    workspaces,
  });
});

router.post('/auth/verify-email', (req, res) => {
  const { token, email } = req.body || {};
  if (!token && !email) return res.status(400).json({ error: 'Verification token is required.' });
  const user = token
    ? (db.prepare('SELECT * FROM users WHERE verification_token = ?').get(String(token)) as Record<string, unknown> | undefined)
    : (db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase()) as Record<string, unknown> | undefined);

  if (!user) return res.status(404).json({ error: 'Invalid verification token.' });
  db.prepare('UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?').run(user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as Record<string, unknown>;
  res.json({ user: formatUser(updated) });
});

router.post('/auth/forgot-password', rateLimit(10, 60_000), (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  const cleanEmail = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail) as { id: string } | undefined;
  if (!user) {
    return res.json({ message: 'If an account matches that email, a password reset code has been issued.' });
  }
  const resetToken = crypto.randomBytes(6).toString('hex').toUpperCase();
  const expires = new Date(Date.now() + 30 * 60_000).toISOString();
  db.prepare('UPDATE users SET reset_token = ?, reset_expires_at = ? WHERE id = ?').run(resetToken, expires, user.id);
  res.json({
    message: 'Password reset code generated.',
    resetCodePreview: resetToken,
  });
});

router.post('/auth/reset-password', rateLimit(10, 60_000), (req, res) => {
  const { email, resetCode, newPassword } = req.body || {};
  if (!email || !resetCode || !newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'Email, reset code, and new password (8+ chars) are required.' });
  }
  const user = db
    .prepare('SELECT id, reset_token, reset_expires_at FROM users WHERE email = ?')
    .get(String(email).trim().toLowerCase()) as { id: string; reset_token: string | null; reset_expires_at: string | null } | undefined;

  if (!user || !user.reset_token || user.reset_token !== String(resetCode).trim().toUpperCase()) {
    return res.status(400).json({ error: 'Invalid reset code.' });
  }
  if (user.reset_expires_at && user.reset_expires_at < new Date().toISOString()) {
    return res.status(400).json({ error: 'Reset code has expired.' });
  }
  db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires_at = NULL WHERE id = ?').run(
    hashPasswordSync(String(newPassword)),
    user.id
  );
  res.json({ message: 'Password updated successfully. You can now sign in.' });
});

router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as Record<string, unknown>;
  const workspaces = getWorkspacesForUser(req.user!.id);
  res.json({
    user: formatUser(row),
    workspaces,
    notificationPrefs: JSON.parse(String(row.notification_prefs_json || '{}')),
  });
});

router.patch('/auth/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const { fullName, title, department, status, avatarUrl, notificationPrefs } = req.body || {};
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as Record<string, unknown>;
  db.prepare(`
    UPDATE users SET full_name = ?, title = ?, department = ?, status = ?, avatar_url = ?, notification_prefs_json = ?
    WHERE id = ?
  `).run(
    typeof fullName === 'string' && fullName.trim() ? fullName.trim() : current.full_name,
    typeof title === 'string' ? title.trim() : current.title,
    typeof department === 'string' ? department.trim() : current.department,
    typeof status === 'string' ? status.trim() : current.status,
    typeof avatarUrl === 'string' && (avatarUrl === '' || avatarUrl.startsWith('/src/') || avatarUrl.startsWith('data:image/')) ? avatarUrl : current.avatar_url,
    notificationPrefs ? JSON.stringify(notificationPrefs) : current.notification_prefs_json,
    req.user!.id
  );
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as Record<string, unknown>;
  res.json({
    user: formatUser(updated),
    notificationPrefs: JSON.parse(String(updated.notification_prefs_json || '{}')),
  });
});

// ==========================================
// WORKSPACE & ONBOARDING ROUTES
// ==========================================

router.get('/workspaces', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ workspaces: getWorkspacesForUser(req.user!.id) });
});

router.post('/workspaces', requireAuth, (req: AuthenticatedRequest, res) => {
  const { name, type, logoColor, invites, firstProject } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Workspace name is required.' });
  }

  const wsId = uid('ws');
  const slugBase = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'workspace';
  const slug = `${slugBase}-${crypto.randomBytes(2).toString('hex')}`;
  const createdAt = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO workspaces (id, name, slug, type, logo_color, owner_id, plan, storage_quota_bytes, billing_email, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'FREE', 5368709120, ?, ?)
    `).run(wsId, name.trim(), slug, (type || 'Technology Startup').trim(), logoColor || '#2563EB', req.user!.id, req.user!.email, createdAt);

    db.prepare(`
      INSERT INTO workspace_memberships (id, workspace_id, user_id, role, permissions_json, joined_at)
      VALUES (?, ?, ?, 'Owner', '{}', ?)
    `).run(uid('mem'), wsId, req.user!.id, createdAt);

    db.prepare(`
      INSERT INTO subscriptions (id, workspace_id, plan, status, billing_cycle, seat_limit, storage_limit_bytes, current_period_end, updated_at)
      VALUES (?, ?, 'FREE', 'active', 'monthly', 5, 5368709120, ?, ?)
    `).run(uid('sub'), wsId, new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10), createdAt);

    // Default channels
    const genId = uid('ch');
    const annId = uid('ch');
    db.prepare(`INSERT INTO channels (id, workspace_id, name, description, is_private, is_announcement, created_by, created_at) VALUES (?, ?, 'general', 'Team-wide communication and daily alignment', 0, 0, ?, ?)`)
      .run(genId, wsId, req.user!.id, createdAt);
    db.prepare(`INSERT INTO channels (id, workspace_id, name, description, is_private, is_announcement, created_by, created_at) VALUES (?, ?, 'announcements', 'Official updates and milestones', 0, 1, ?, ?)`)
      .run(annId, wsId, req.user!.id, createdAt);
    db.prepare(`INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)`).run(genId, req.user!.id, createdAt);
    db.prepare(`INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)`).run(annId, req.user!.id, createdAt);

    // Welcome message
    db.prepare(`
      INSERT INTO messages (id, workspace_id, channel_id, sender_id, content, is_pinned, read_by_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(uid('msg'), wsId, genId, req.user!.id, `Welcome to ${name.trim()}! Use this channel for real-time team collaboration.`, JSON.stringify([req.user!.id]), createdAt, createdAt);

    // Default KB collection & doc
    const colId = uid('col');
    db.prepare(`INSERT INTO document_collections (id, workspace_id, name, description, created_at) VALUES (?, ?, 'Getting Started', 'Workspace handbook and onboarding guides', ?)`)
      .run(colId, wsId, createdAt);
    db.prepare(`INSERT INTO documents (id, workspace_id, collection_id, title, content, is_pinned, author_id, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`)
      .run(uid('doc'), wsId, colId, `${name.trim()} Workspace Charter`, `<h1>Welcome to ${name.trim()}</h1><p>Document goals, rituals, and technical decisions here.</p>`, req.user!.id, req.user!.id, createdAt, createdAt);

    // Optional onboarding invites
    if (Array.isArray(invites)) {
      for (const inv of invites) {
        if (!inv?.email || typeof inv.email !== 'string') continue;
        const cleanInvEmail = inv.email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanInvEmail) || cleanInvEmail === req.user!.email) continue;
        let targetUser = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanInvEmail) as { id: string } | undefined;
        if (!targetUser) {
          const newUid = uid('usr');
          const placeholderName = cleanInvEmail.split('@')[0].replace(/[._-]/g, ' ');
          db.prepare(`
            INSERT INTO users (id, email, password_hash, full_name, title, department, avatar_url, status, email_verified, created_at)
            VALUES (?, ?, ?, ?, 'Invited Member', 'General', '', 'Pending Invite', 0, ?)
          `).run(newUid, cleanInvEmail, hashPasswordSync(crypto.randomBytes(16).toString('hex')), placeholderName, createdAt);
          targetUser = { id: newUid };
        }
        const role: WorkspaceRole = ['Administrator', 'Manager', 'Member', 'Guest'].includes(inv.role) ? inv.role : 'Member';
        db.prepare(`INSERT OR IGNORE INTO workspace_memberships (id, workspace_id, user_id, role, permissions_json, joined_at) VALUES (?, ?, ?, ?, '{}', ?)`)
          .run(uid('mem'), wsId, targetUser.id, role, createdAt);
        db.prepare(`INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)`).run(genId, targetUser.id, createdAt);
      }
    }

    // Optional onboarding first project
    if (firstProject && typeof firstProject.name === 'string' && firstProject.name.trim()) {
      const projId = uid('proj');
      const deadline = firstProject.deadline || new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
      db.prepare(`
        INSERT INTO projects (id, workspace_id, name, description, status, priority, owner_id, deadline, progress, color, created_at)
        VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, 0, '#2563EB', ?)
      `).run(projId, wsId, firstProject.name.trim(), firstProject.description || 'Initial workspace kickoff project.', firstProject.priority || 'High', req.user!.id, deadline, createdAt);
      db.prepare(`INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'Lead')`).run(projId, req.user!.id);

      db.prepare(`
        INSERT INTO tasks (id, workspace_id, project_id, title, description, status, priority, assignee_id, creator_id, due_date, labels_json, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'To Do', 'High', ?, ?, ?, '["Kickoff"]', 0, ?, ?)
      `).run(uid('tsk'), wsId, projId, `Define milestones for ${firstProject.name.trim()}`, 'Break down initial deliverables across the Kanban board.', req.user!.id, req.user!.id, deadline, createdAt, createdAt);
    }

    logAudit(wsId, req.user!.id, 'workspace.created', 'workspace', wsId, { name: name.trim() }, req.ip);
  });

  tx();
  const workspaces = getWorkspacesForUser(req.user!.id);
  const created = workspaces.find((w) => w.id === wsId);
  res.status(201).json({ workspace: created, workspaces });
});

router.patch('/workspaces/:id', requireAuth, requireWorkspaceMember('manageSettings'), (req: AuthenticatedRequest, res) => {
  const { name, type, logoColor, billingEmail } = req.body || {};
  const wsId = req.params.id;
  const current = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(wsId) as Record<string, unknown>;
  db.prepare(`UPDATE workspaces SET name = ?, type = ?, logo_color = ?, billing_email = ? WHERE id = ?`).run(
    typeof name === 'string' && name.trim() ? name.trim() : current.name,
    typeof type === 'string' && type.trim() ? type.trim() : current.type,
    typeof logoColor === 'string' ? logoColor : current.logo_color,
    typeof billingEmail === 'string' ? billingEmail.trim() : current.billing_email,
    wsId
  );
  logAudit(wsId, req.user!.id, 'workspace.updated', 'workspace', wsId, { name }, req.ip);
  const workspaces = getWorkspacesForUser(req.user!.id);
  res.json({ workspace: workspaces.find((w) => w.id === wsId), workspaces });
});

router.get('/workspaces/:id/audit-logs', requireAuth, requireWorkspaceMember('manageSettings'), (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(`
      SELECT a.*, u.full_name as user_name
      FROM audit_logs a
      JOIN users u ON u.id = a.user_id
      WHERE a.workspace_id = ?
      ORDER BY a.created_at DESC LIMIT 100
    `)
    .all(req.params.id) as Array<Record<string, unknown>>;
  res.json({
    logs: rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      userId: r.user_id,
      userName: r.user_name,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      details: String(r.details_json || '{}'),
      createdAt: r.created_at,
    })),
  });
});

// ==========================================
// TEAM, DEPARTMENTS & RBAC ROUTES
// ==========================================

router.get('/workspaces/:id/members', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(`
      SELECT wm.id, wm.workspace_id, wm.user_id, wm.role, wm.department_id, wm.permissions_json, wm.joined_at,
             u.full_name, u.email, u.title, u.department, u.avatar_url, u.status
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ?
      ORDER BY wm.joined_at ASC
    `)
    .all(req.params.id) as Array<Record<string, unknown>>;

  const departments = db
    .prepare(`
      SELECT d.*, (SELECT COUNT(*) FROM workspace_memberships wm WHERE wm.department_id = d.id) as member_count
      FROM departments d WHERE d.workspace_id = ? ORDER BY d.name ASC
    `)
    .all(req.params.id) as Array<Record<string, unknown>>;

  res.json({
    members: rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      userId: r.user_id,
      fullName: r.full_name,
      email: r.email,
      title: r.title,
      department: r.department,
      departmentId: r.department_id || null,
      avatarUrl: r.avatar_url || '',
      status: r.status || 'Available',
      role: r.role as WorkspaceRole,
      permissions: resolvePermissions(r.role as WorkspaceRole, String(r.permissions_json || '')),
      joinedAt: r.joined_at,
    })),
    departments: departments.map((d) => ({
      id: d.id,
      workspaceId: d.workspace_id,
      name: d.name,
      description: d.description,
      leadId: d.lead_id || null,
      memberCount: d.member_count || 0,
      createdAt: d.created_at,
    })),
    onlineUserIds: getOnlineUserIds(req.params.id),
    roleDefaults: ROLE_DEFAULT_PERMISSIONS,
  });
});

router.post('/workspaces/:id/members/invite', requireAuth, requireWorkspaceMember('manageMembers'), (req: AuthenticatedRequest, res) => {
  const { email, fullName, role, departmentId, title } = req.body || {};
  const wsId = req.params.id;
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Valid email address is required.' });
  }
  const cleanEmail = email.trim().toLowerCase();
  const targetRole: WorkspaceRole = ['Administrator', 'Manager', 'Member', 'Guest'].includes(role) ? role : 'Member';

  // Enforce subscription seat limit
  const sub = db.prepare('SELECT seat_limit FROM subscriptions WHERE workspace_id = ?').get(wsId) as { seat_limit: number } | undefined;
  const currentSeats = (db.prepare('SELECT COUNT(*) as c FROM workspace_memberships WHERE workspace_id = ?').get(wsId) as { c: number }).c;
  if (sub && currentSeats >= sub.seat_limit) {
    return res.status(403).json({ error: `Seat limit (${sub.seat_limit}) reached on your current plan. Upgrade in Settings > Billing.` });
  }

  let userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail) as Record<string, unknown> | undefined;
  const now = new Date().toISOString();
  if (!userRow) {
    const newUid = uid('usr');
    db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, title, department, avatar_url, status, email_verified, created_at)
      VALUES (?, ?, ?, ?, ?, 'Operations', '', 'Invited', 0, ?)
    `).run(newUid, cleanEmail, hashPasswordSync('SynoreDemo!2026'), (fullName || cleanEmail.split('@')[0]).trim(), (title || 'Team Member').trim(), now);
    userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(newUid) as Record<string, unknown>;
  }

  const existingMem = db.prepare('SELECT id FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?').get(wsId, userRow.id);
  if (existingMem) {
    return res.status(409).json({ error: 'User is already a member of this workspace.' });
  }

  const memId = uid('mem');
  db.prepare(`
    INSERT INTO workspace_memberships (id, workspace_id, user_id, role, department_id, permissions_json, joined_at)
    VALUES (?, ?, ?, ?, ?, '{}', ?)
  `).run(memId, wsId, userRow.id, targetRole, departmentId || null, now);

  // Add to public channels automatically
  const publicChannels = db.prepare('SELECT id FROM channels WHERE workspace_id = ? AND is_private = 0').all(wsId) as Array<{ id: string }>;
  for (const ch of publicChannels) {
    db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)').run(ch.id, userRow.id, now);
  }

  logAudit(wsId, req.user!.id, 'member.invited', 'membership', memId, { email: cleanEmail, role: targetRole }, req.ip);
  res.status(201).json({
    member: {
      id: memId,
      workspaceId: wsId,
      userId: userRow.id,
      fullName: userRow.full_name,
      email: userRow.email,
      title: userRow.title,
      department: userRow.department,
      departmentId: departmentId || null,
      avatarUrl: userRow.avatar_url || '',
      status: userRow.status,
      role: targetRole,
      permissions: resolvePermissions(targetRole, '{}'),
      joinedAt: now,
    },
  });
});

router.patch('/workspaces/:id/members/:memberId', requireAuth, requireWorkspaceMember('manageMembers'), (req: AuthenticatedRequest, res) => {
  const { role, departmentId, permissions } = req.body || {};
  const wsId = req.params.id;
  const target = db.prepare('SELECT * FROM workspace_memberships WHERE id = ? AND workspace_id = ?').get(req.params.memberId, wsId) as Record<string, unknown> | undefined;
  if (!target) return res.status(404).json({ error: 'Member not found.' });
  if (target.role === 'Owner' && req.membership!.role !== 'Owner') {
    return res.status(403).json({ error: 'Only an Owner can modify another Owner.' });
  }

  const nextRole: WorkspaceRole = ['Owner', 'Administrator', 'Manager', 'Member', 'Guest'].includes(role) ? role : (target.role as WorkspaceRole);
  if (nextRole === 'Owner' && req.membership!.role !== 'Owner') {
    return res.status(403).json({ error: 'Only an Owner can assign the Owner role.' });
  }

  const nextPermsJson = permissions && typeof permissions === 'object' ? JSON.stringify(permissions) : String(target.permissions_json || '{}');
  db.prepare('UPDATE workspace_memberships SET role = ?, department_id = ?, permissions_json = ? WHERE id = ? AND workspace_id = ?').run(
    nextRole,
    departmentId !== undefined ? departmentId : target.department_id,
    nextPermsJson,
    req.params.memberId,
    wsId
  );

  logAudit(wsId, req.user!.id, 'member.updated', 'membership', req.params.memberId, { role: nextRole }, req.ip);
  res.json({ ok: true, role: nextRole, permissions: resolvePermissions(nextRole, nextPermsJson) });
});

router.delete('/workspaces/:id/members/:memberId', requireAuth, requireWorkspaceMember('manageMembers'), (req: AuthenticatedRequest, res) => {
  const wsId = req.params.id;
  const target = db.prepare('SELECT * FROM workspace_memberships WHERE id = ? AND workspace_id = ?').get(req.params.memberId, wsId) as Record<string, unknown> | undefined;
  if (!target) return res.status(404).json({ error: 'Member not found.' });
  if (target.role === 'Owner') return res.status(403).json({ error: 'Cannot remove workspace Owner.' });
  db.prepare('DELETE FROM workspace_memberships WHERE id = ? AND workspace_id = ?').run(req.params.memberId, wsId);
  logAudit(wsId, req.user!.id, 'member.removed', 'membership', req.params.memberId, {}, req.ip);
  res.json({ ok: true });
});

router.post('/workspaces/:id/departments', requireAuth, requireWorkspaceMember('manageMembers'), (req: AuthenticatedRequest, res) => {
  const { name, description, leadId } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Department name is required.' });
  const id = uid('dept');
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO departments (id, workspace_id, name, description, lead_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, name.trim(), (description || '').trim(), leadId || null, createdAt);
  res.status(201).json({
    department: { id, workspaceId: req.params.id, name: name.trim(), description: (description || '').trim(), leadId: leadId || null, memberCount: 0, createdAt },
  });
});

// ==========================================
// CHANNELS & DIRECT MESSAGES (REAL-TIME WS)
// ==========================================

router.get('/workspaces/:id/channels', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(`
      SELECT c.*,
             (SELECT COUNT(*) FROM channel_members cm WHERE cm.channel_id = c.id) as member_count,
             EXISTS(SELECT 1 FROM channel_members cm2 WHERE cm2.channel_id = c.id AND cm2.user_id = ?) as is_member
      FROM channels c
      WHERE c.workspace_id = ?
      ORDER BY c.is_announcement DESC, c.name ASC
    `)
    .all(req.user!.id, req.params.id) as Array<Record<string, unknown>>;

  const visible = rows.filter((r) => !r.is_private || r.is_member || req.membership!.role === 'Owner' || req.membership!.role === 'Administrator');
  res.json({
    channels: visible.map((c) => ({
      id: c.id,
      workspaceId: c.workspace_id,
      name: c.name,
      description: c.description,
      isPrivate: Boolean(c.is_private),
      isAnnouncement: Boolean(c.is_announcement),
      createdBy: c.created_by,
      memberCount: c.member_count || 0,
      createdAt: c.created_at,
    })),
  });
});

router.post('/workspaces/:id/channels', requireAuth, requireWorkspaceMember('manageChannels'), (req: AuthenticatedRequest, res) => {
  const { name, description, isPrivate, isAnnouncement, memberIds } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Channel name is required.' });
  const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  const id = uid('ch');
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO channels (id, workspace_id, name, description, is_private, is_announcement, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, cleanName, (description || '').trim(), isPrivate ? 1 : 0, isAnnouncement ? 1 : 0, req.user!.id, createdAt);

  const joinIds = new Set<string>([req.user!.id]);
  if (!isPrivate) {
    const allMems = db.prepare('SELECT user_id FROM workspace_memberships WHERE workspace_id = ?').all(req.params.id) as Array<{ user_id: string }>;
    for (const m of allMems) joinIds.add(m.user_id);
  } else if (Array.isArray(memberIds)) {
    for (const mid of memberIds) joinIds.add(String(mid));
  }
  for (const uidJoin of joinIds) {
    db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)').run(id, uidJoin, createdAt);
  }

  const channel = {
    id,
    workspaceId: req.params.id,
    name: cleanName,
    description: (description || '').trim(),
    isPrivate: Boolean(isPrivate),
    isAnnouncement: Boolean(isAnnouncement),
    createdBy: req.user!.id,
    memberCount: joinIds.size,
    createdAt,
  };
  broadcastToWorkspace(req.params.id, 'channel:created', channel);
  logAudit(req.params.id, req.user!.id, 'channel.created', 'channel', id, { name: cleanName }, req.ip);
  res.status(201).json({ channel });
});

router.get('/workspaces/:id/dm-threads', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const threads = db
    .prepare(`
      SELECT dt.*
      FROM direct_threads dt
      JOIN direct_thread_members dtm ON dtm.thread_id = dt.id
      WHERE dt.workspace_id = ? AND dtm.user_id = ?
      ORDER BY dt.created_at DESC
    `)
    .all(req.params.id, req.user!.id) as Array<Record<string, unknown>>;

  const formatted = threads.map((t) => {
    const participants = db
      .prepare(`
        SELECT u.id as userId, u.full_name as fullName, u.avatar_url as avatarUrl, u.title
        FROM direct_thread_members dtm
        JOIN users u ON u.id = dtm.user_id
        WHERE dtm.thread_id = ?
      `)
      .all(t.id) as Array<{ userId: string; fullName: string; avatarUrl: string; title: string }>;

    const lastMsg = db
      .prepare('SELECT content, created_at FROM messages WHERE thread_id = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1')
      .get(t.id) as { content: string; created_at: string } | undefined;

    return {
      id: t.id,
      workspaceId: t.workspace_id,
      name: t.name,
      isGroup: Boolean(t.is_group),
      participants,
      lastMessage: lastMsg?.content || '',
      lastMessageAt: lastMsg?.created_at || t.created_at,
      createdAt: t.created_at,
    };
  });

  res.json({ threads: formatted });
});

router.post('/workspaces/:id/dm-threads', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const { participantIds, name } = req.body || {};
  const wsId = req.params.id;
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return res.status(400).json({ error: 'Select at least one workspace colleague.' });
  }
  const uniqueIds = Array.from(new Set([req.user!.id, ...participantIds.map(String)]));
  const isGroup = uniqueIds.length > 2 || Boolean(name);

  if (!isGroup && uniqueIds.length === 2) {
    const existing = db
      .prepare(`
        SELECT dt.id FROM direct_threads dt
        JOIN direct_thread_members a ON a.thread_id = dt.id AND a.user_id = ?
        JOIN direct_thread_members b ON b.thread_id = dt.id AND b.user_id = ?
        WHERE dt.workspace_id = ? AND dt.is_group = 0
      `)
      .get(uniqueIds[0], uniqueIds[1], wsId) as { id: string } | undefined;
    if (existing) {
      return res.json({ threadId: existing.id, existed: true });
    }
  }

  const threadId = uid('dm');
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO direct_threads (id, workspace_id, name, is_group, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(threadId, wsId, isGroup ? (name || 'Group Conversation').trim() : '', isGroup ? 1 : 0, createdAt);
  for (const pid of uniqueIds) {
    db.prepare('INSERT OR IGNORE INTO direct_thread_members (thread_id, user_id) VALUES (?, ?)').run(threadId, pid);
  }

  res.status(201).json({ threadId, existed: false });
});

router.get('/workspaces/:id/messages', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const { channelId, threadId, parentMessageId, search } = req.query;
  let sql = `
    SELECT m.*, u.full_name as sender_name, u.avatar_url as sender_avatar, u.title as sender_title
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.workspace_id = ?
  `;
  const params: unknown[] = [req.params.id];

  if (channelId) {
    sql += ' AND m.channel_id = ?';
    params.push(String(channelId));
  } else if (threadId) {
    sql += ' AND m.thread_id = ?';
    params.push(String(threadId));
  }
  if (parentMessageId) {
    sql += ' AND m.parent_message_id = ?';
    params.push(String(parentMessageId));
  } else if (!search) {
    sql += ' AND m.parent_message_id IS NULL';
  }
  if (search) {
    sql += ' AND m.content LIKE ?';
    params.push(`%${String(search).trim()}%`);
  }
  sql += ' ORDER BY m.created_at ASC LIMIT 200';

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  res.json({ messages: rows.map(formatMessage) });
});

router.post('/workspaces/:id/messages', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const { channelId, threadId, parentMessageId, content, attachments } = req.body || {};
  const wsId = req.params.id;
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'Message content cannot be empty.' });
  }
  if (!channelId && !threadId) {
    return res.status(400).json({ error: 'channelId or threadId is required.' });
  }

  if (channelId) {
    const ch = db.prepare('SELECT id, is_announcement FROM channels WHERE id = ? AND workspace_id = ?').get(channelId, wsId) as
      | { id: string; is_announcement: number }
      | undefined;
    if (!ch) return res.status(404).json({ error: 'Channel not found in workspace.' });
    if (ch.is_announcement && !['Owner', 'Administrator', 'Manager'].includes(req.membership!.role)) {
      return res.status(403).json({ error: 'Only Owners, Administrators, or Managers can post in announcement channels.' });
    }
  }

  const msgId = uid('msg');
  const now = new Date().toISOString();
  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  db.prepare(`
    INSERT INTO messages (id, workspace_id, channel_id, thread_id, parent_message_id, sender_id, content, attachments_json, is_pinned, is_edited, is_deleted, read_by_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)
  `).run(
    msgId,
    wsId,
    channelId || null,
    threadId || null,
    parentMessageId || null,
    req.user!.id,
    content.trim(),
    JSON.stringify(safeAttachments),
    JSON.stringify([req.user!.id]),
    now,
    now
  );

  const row = db
    .prepare('SELECT m.*, u.full_name as sender_name, u.avatar_url as sender_avatar, u.title as sender_title FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?')
    .get(msgId) as Record<string, unknown>;
  const formatted = formatMessage(row);

  broadcastToWorkspace(wsId, 'message:created', formatted);

  // Notify DM recipients or @mentions
  if (threadId) {
    const members = db.prepare('SELECT user_id FROM direct_thread_members WHERE thread_id = ? AND user_id != ?').all(threadId, req.user!.id) as Array<{ user_id: string }>;
    for (const m of members) {
      createNotification(wsId, m.user_id, 'direct_message', `New message from ${req.user!.fullName}`, content.trim().slice(0, 100), 'messages', String(threadId));
    }
  }

  res.status(201).json({ message: formatted });
});

router.patch('/workspaces/:id/messages/:msgId', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const { content, isPinned, markRead } = req.body || {};
  const wsId = req.params.id;
  const existing = db.prepare('SELECT * FROM messages WHERE id = ? AND workspace_id = ?').get(req.params.msgId, wsId) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'Message not found.' });

  const now = new Date().toISOString();
  if (typeof content === 'string') {
    if (existing.sender_id !== req.user!.id) return res.status(403).json({ error: 'You can only edit your own messages.' });
    db.prepare('UPDATE messages SET content = ?, is_edited = 1, updated_at = ? WHERE id = ?').run(content.trim(), now, req.params.msgId);
  }
  if (typeof isPinned === 'boolean') {
    db.prepare('UPDATE messages SET is_pinned = ?, updated_at = ? WHERE id = ?').run(isPinned ? 1 : 0, now, req.params.msgId);
  }
  if (markRead) {
    const readBy: string[] = JSON.parse(String(existing.read_by_json || '[]'));
    if (!readBy.includes(req.user!.id)) {
      readBy.push(req.user!.id);
      db.prepare('UPDATE messages SET read_by_json = ? WHERE id = ?').run(JSON.stringify(readBy), req.params.msgId);
    }
  }

  const row = db
    .prepare('SELECT m.*, u.full_name as sender_name, u.avatar_url as sender_avatar, u.title as sender_title FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?')
    .get(req.params.msgId) as Record<string, unknown>;
  const formatted = formatMessage(row);
  broadcastToWorkspace(wsId, 'message:updated', formatted);
  res.json({ message: formatted });
});

router.delete('/workspaces/:id/messages/:msgId', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const wsId = req.params.id;
  const existing = db.prepare('SELECT * FROM messages WHERE id = ? AND workspace_id = ?').get(req.params.msgId, wsId) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'Message not found.' });
  if (existing.sender_id !== req.user!.id && !req.membership!.permissions.deleteResources) {
    return res.status(403).json({ error: 'Permission denied to delete this message.' });
  }
  db.prepare('UPDATE messages SET is_deleted = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.msgId);
  broadcastToWorkspace(wsId, 'message:deleted', { id: req.params.msgId, channelId: existing.channel_id, threadId: existing.thread_id });
  res.json({ ok: true });
});

router.post('/workspaces/:id/messages/:msgId/react', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const { emoji } = req.body || {};
  if (!emoji || typeof emoji !== 'string') return res.status(400).json({ error: 'Emoji is required.' });
  const wsId = req.params.id;
  const existing = db
    .prepare('SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?')
    .get(req.params.msgId, req.user!.id, emoji) as { id: string } | undefined;

  if (existing) {
    db.prepare('DELETE FROM message_reactions WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(uid('rx'), req.params.msgId, req.user!.id, emoji, new Date().toISOString());
  }

  const row = db
    .prepare('SELECT m.*, u.full_name as sender_name, u.avatar_url as sender_avatar, u.title as sender_title FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?')
    .get(req.params.msgId) as Record<string, unknown>;
  const formatted = formatMessage(row);
  broadcastToWorkspace(wsId, 'message:updated', formatted);
  res.json({ message: formatted });
});

// ==========================================
// PROJECTS & KANBAN BOARD (REAL-TIME WS)
// ==========================================

router.get('/workspaces/:id/projects', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(`
      SELECT p.*, u.full_name as owner_name
      FROM projects p
      JOIN users u ON u.id = p.owner_id
      WHERE p.workspace_id = ?
      ORDER BY p.created_at DESC
    `)
    .all(req.params.id) as Array<Record<string, unknown>>;

  const formatted = rows.map((p) => {
    const members = db.prepare('SELECT user_id FROM project_members WHERE project_id = ?').all(p.id) as Array<{ user_id: string }>;
    const counts = db
      .prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END) as done FROM tasks WHERE project_id = ?")
      .get(p.id) as { total: number; done: number | null };
    let columns = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'];
    try {
      columns = JSON.parse(String(p.columns_json || '[]'));
    } catch {
      // default
    }
    return {
      id: p.id,
      workspaceId: p.workspace_id,
      name: p.name,
      description: p.description,
      status: p.status,
      priority: p.priority,
      ownerId: p.owner_id,
      ownerName: p.owner_name,
      deadline: p.deadline,
      progress: p.progress,
      color: p.color,
      columns: columns.length ? columns : ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'],
      memberIds: members.map((m) => m.user_id),
      taskCounts: { total: counts.total || 0, done: counts.done || 0 },
      createdAt: p.created_at,
    };
  });

  res.json({ projects: formatted });
});

router.post('/workspaces/:id/projects', requireAuth, requireWorkspaceMember('createProjects'), (req: AuthenticatedRequest, res) => {
  const { name, description, priority, deadline, color, memberIds, columns } = req.body || {};
  const wsId = req.params.id;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Project name is required.' });
  }
  const projId = uid('proj');
  const now = new Date().toISOString();
  const cols = Array.isArray(columns) && columns.length >= 2 ? columns.map(String) : ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'];
  const deadlineVal = deadline || new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10);

  db.prepare(`
    INSERT INTO projects (id, workspace_id, name, description, status, priority, owner_id, deadline, progress, color, columns_json, created_at)
    VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, 0, ?, ?, ?)
  `).run(projId, wsId, name.trim(), (description || '').trim(), priority || 'High', req.user!.id, deadlineVal, color || '#2563EB', JSON.stringify(cols), now);

  const assignIds = new Set<string>([req.user!.id, ...(Array.isArray(memberIds) ? memberIds.map(String) : [])]);
  for (const mid of assignIds) {
    db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)').run(projId, mid, mid === req.user!.id ? 'Lead' : 'Contributor');
  }

  const project = {
    id: projId,
    workspaceId: wsId,
    name: name.trim(),
    description: (description || '').trim(),
    status: 'Active',
    priority: priority || 'High',
    ownerId: req.user!.id,
    ownerName: req.user!.fullName,
    deadline: deadlineVal,
    progress: 0,
    color: color || '#2563EB',
    columns: cols,
    memberIds: Array.from(assignIds),
    taskCounts: { total: 0, done: 0 },
    createdAt: now,
  };

  broadcastToWorkspace(wsId, 'project:created', project);
  logAudit(wsId, req.user!.id, 'project.created', 'project', projId, { name: name.trim() }, req.ip);
  res.status(201).json({ project });
});

router.patch('/workspaces/:id/projects/:projectId', requireAuth, requireWorkspaceMember('createProjects'), (req: AuthenticatedRequest, res) => {
  const { name, description, status, priority, deadline, columns, color } = req.body || {};
  const wsId = req.params.id;
  const current = db.prepare('SELECT * FROM projects WHERE id = ? AND workspace_id = ?').get(req.params.projectId, wsId) as Record<string, unknown> | undefined;
  if (!current) return res.status(404).json({ error: 'Project not found.' });

  db.prepare(`
    UPDATE projects SET name = ?, description = ?, status = ?, priority = ?, deadline = ?, columns_json = ?, color = ?
    WHERE id = ? AND workspace_id = ?
  `).run(
    typeof name === 'string' && name.trim() ? name.trim() : current.name,
    typeof description === 'string' ? description.trim() : current.description,
    status || current.status,
    priority || current.priority,
    deadline || current.deadline,
    Array.isArray(columns) ? JSON.stringify(columns) : current.columns_json,
    color || current.color,
    req.params.projectId,
    wsId
  );

  broadcastToWorkspace(wsId, 'project:updated', { id: req.params.projectId });
  res.json({ ok: true });
});

router.delete('/workspaces/:id/projects/:projectId', requireAuth, requireWorkspaceMember('deleteResources'), (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM projects WHERE id = ? AND workspace_id = ?').run(req.params.projectId, req.params.id);
  broadcastToWorkspace(req.params.id, 'project:deleted', { id: req.params.projectId });
  logAudit(req.params.id, req.user!.id, 'project.deleted', 'project', req.params.projectId, {}, req.ip);
  res.json({ ok: true });
});

// ==========================================
// TASKS, SUBTASKS & COMMENTS
// ==========================================

router.get('/workspaces/:id/tasks', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const { projectId } = req.query;
  let sql = `
    SELECT t.*, p.name as project_name,
           ua.full_name as assignee_name, ua.avatar_url as assignee_avatar,
           uc.full_name as creator_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN users ua ON ua.id = t.assignee_id
    JOIN users uc ON uc.id = t.creator_id
    WHERE t.workspace_id = ?
  `;
  const params: unknown[] = [req.params.id];
  if (projectId) {
    sql += ' AND t.project_id = ?';
    params.push(String(projectId));
  }
  sql += ' ORDER BY t.position ASC, t.created_at DESC';
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  res.json({ tasks: rows.map(formatTask) });
});

router.post('/workspaces/:id/tasks', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  if (req.membership!.role === 'Guest') {
    return res.status(403).json({ error: 'Guests cannot create tasks.' });
  }
  const { projectId, title, description, status, priority, assigneeId, startDate, dueDate, labels } = req.body || {};
  const wsId = req.params.id;
  if (!projectId || !title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Project ID and task title are required.' });
  }
  const proj = db.prepare('SELECT id, name FROM projects WHERE id = ? AND workspace_id = ?').get(projectId, wsId) as { id: string; name: string } | undefined;
  if (!proj) return res.status(404).json({ error: 'Project not found in workspace.' });

  const taskId = uid('tsk');
  const now = new Date().toISOString();
  const taskStatus = status || 'To Do';
  const maxPos = (db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM tasks WHERE project_id = ? AND status = ?').get(projectId, taskStatus) as { m: number }).m;

  db.prepare(`
    INSERT INTO tasks (id, workspace_id, project_id, title, description, status, priority, assignee_id, creator_id, start_date, due_date, labels_json, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    wsId,
    projectId,
    title.trim(),
    (description || '').trim(),
    taskStatus,
    priority || 'Medium',
    assigneeId || null,
    req.user!.id,
    startDate || null,
    dueDate || null,
    JSON.stringify(Array.isArray(labels) ? labels : []),
    maxPos + 1,
    now,
    now
  );

  const stats = recalculateProjectProgress(projectId, wsId);

  const row = db
    .prepare(`
      SELECT t.*, p.name as project_name, ua.full_name as assignee_name, ua.avatar_url as assignee_avatar, uc.full_name as creator_name
      FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN users ua ON ua.id = t.assignee_id JOIN users uc ON uc.id = t.creator_id
      WHERE t.id = ?
    `)
    .get(taskId) as Record<string, unknown>;
  const task = formatTask(row);

  broadcastToWorkspace(wsId, 'task:created', { task, projectProgress: { projectId, ...stats } });

  if (assigneeId && assigneeId !== req.user!.id) {
    createNotification(wsId, String(assigneeId), 'task_assigned', 'New task assigned', `${req.user!.fullName} assigned "${title.trim()}" to you.`, 'tasks', taskId);
  }

  logAudit(wsId, req.user!.id, 'task.created', 'task', taskId, { title: title.trim(), projectId }, req.ip);
  res.status(201).json({ task, projectProgress: stats });
});

router.patch('/workspaces/:id/tasks/:taskId', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  if (req.membership!.role === 'Guest') {
    return res.status(403).json({ error: 'Guests have read-only access to tasks.' });
  }
  const wsId = req.params.id;
  const current = db.prepare('SELECT * FROM tasks WHERE id = ? AND workspace_id = ?').get(req.params.taskId, wsId) as Record<string, unknown> | undefined;
  if (!current) return res.status(404).json({ error: 'Task not found.' });

  const { title, description, status, priority, assigneeId, startDate, dueDate, labels, position } = req.body || {};
  const now = new Date().toISOString();
  const nextStatus = status !== undefined ? String(status) : String(current.status);
  const nextAssignee = assigneeId !== undefined ? assigneeId : current.assignee_id;

  db.prepare(`
    UPDATE tasks
    SET title = ?, description = ?, status = ?, priority = ?, assignee_id = ?, start_date = ?, due_date = ?, labels_json = ?, position = ?, updated_at = ?
    WHERE id = ? AND workspace_id = ?
  `).run(
    typeof title === 'string' && title.trim() ? title.trim() : current.title,
    typeof description === 'string' ? description.trim() : current.description,
    nextStatus,
    priority || current.priority,
    nextAssignee || null,
    startDate !== undefined ? startDate : current.start_date,
    dueDate !== undefined ? dueDate : current.due_date,
    Array.isArray(labels) ? JSON.stringify(labels) : current.labels_json,
    typeof position === 'number' ? position : current.position,
    now,
    req.params.taskId,
    wsId
  );

  const stats = recalculateProjectProgress(String(current.project_id), wsId);

  const row = db
    .prepare(`
      SELECT t.*, p.name as project_name, ua.full_name as assignee_name, ua.avatar_url as assignee_avatar, uc.full_name as creator_name
      FROM tasks t JOIN projects p ON p.id = t.project_id LEFT JOIN users ua ON ua.id = t.assignee_id JOIN users uc ON uc.id = t.creator_id
      WHERE t.id = ?
    `)
    .get(req.params.taskId) as Record<string, unknown>;
  const task = formatTask(row);

  broadcastToWorkspace(wsId, 'task:updated', {
    task,
    projectProgress: { projectId: String(current.project_id), ...stats },
  });

  if (assigneeId && assigneeId !== current.assignee_id && assigneeId !== req.user!.id) {
    createNotification(wsId, String(assigneeId), 'task_assigned', 'Task assigned to you', `${req.user!.fullName} assigned "${task.title}" to you.`, 'tasks', task.id as string);
  }

  res.json({ task, projectProgress: stats });
});

router.delete('/workspaces/:id/tasks/:taskId', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const wsId = req.params.id;
  const current = db.prepare('SELECT project_id, creator_id FROM tasks WHERE id = ? AND workspace_id = ?').get(req.params.taskId, wsId) as
    | { project_id: string; creator_id: string }
    | undefined;
  if (!current) return res.status(404).json({ error: 'Task not found.' });
  if (current.creator_id !== req.user!.id && !req.membership!.permissions.deleteResources) {
    return res.status(403).json({ error: 'Only the task creator or Admins can delete this task.' });
  }
  db.prepare('DELETE FROM tasks WHERE id = ? AND workspace_id = ?').run(req.params.taskId, wsId);
  const stats = recalculateProjectProgress(current.project_id, wsId);
  broadcastToWorkspace(wsId, 'task:deleted', { id: req.params.taskId, projectId: current.project_id, projectProgress: stats });
  res.json({ ok: true, projectProgress: stats });
});

router.post('/workspaces/:id/tasks/:taskId/subtasks', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const { title } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Subtask title is required.' });
  const id = uid('sub');
  const maxPos = (db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM subtasks WHERE task_id = ?').get(req.params.taskId) as { m: number }).m;
  db.prepare('INSERT INTO subtasks (id, task_id, title, is_completed, position) VALUES (?, ?, ?, 0, ?)').run(id, req.params.taskId, title.trim(), maxPos + 1);
  res.status(201).json({ subtask: { id, taskId: req.params.taskId, title: title.trim(), isCompleted: false, position: maxPos + 1 } });
});

router.patch('/workspaces/:id/subtasks/:subId', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const { isCompleted, title } = req.body || {};
  const current = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(req.params.subId) as Record<string, unknown> | undefined;
  if (!current) return res.status(404).json({ error: 'Subtask not found.' });
  db.prepare('UPDATE subtasks SET is_completed = ?, title = ? WHERE id = ?').run(
    typeof isCompleted === 'boolean' ? (isCompleted ? 1 : 0) : current.is_completed,
    typeof title === 'string' && title.trim() ? title.trim() : current.title,
    req.params.subId
  );
  res.json({ ok: true });
});

router.get('/workspaces/:id/comments', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const { entityType, entityId } = req.query;
  const rows = db
    .prepare(`
      SELECT c.*, u.full_name as author_name, u.avatar_url as author_avatar
      FROM comments c JOIN users u ON u.id = c.author_id
      WHERE c.workspace_id = ? AND c.entity_type = ? AND c.entity_id = ?
      ORDER BY c.created_at ASC
    `)
    .all(req.params.id, String(entityType || 'task'), String(entityId || '')) as Array<Record<string, unknown>>;
  res.json({
    comments: rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      authorId: r.author_id,
      authorName: r.author_name,
      authorAvatar: r.author_avatar || '',
      content: r.content,
      createdAt: r.created_at,
    })),
  });
});

router.post('/workspaces/:id/comments', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const { entityType, entityId, content } = req.body || {};
  if (!entityType || !entityId || !content || !String(content).trim()) {
    return res.status(400).json({ error: 'Comment content is required.' });
  }
  const id = uid('cmt');
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO comments (id, workspace_id, entity_type, entity_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, String(entityType), String(entityId), req.user!.id, String(content).trim(), createdAt);

  res.status(201).json({
    comment: {
      id,
      workspaceId: req.params.id,
      entityType,
      entityId,
      authorId: req.user!.id,
      authorName: req.user!.fullName,
      authorAvatar: req.user!.avatarUrl,
      content: String(content).trim(),
      createdAt,
    },
  });
});

// ==========================================
// DOCUMENTS & KNOWLEDGE BASE
// ==========================================

router.get('/workspaces/:id/documents', requireAuth, requireWorkspaceMember('accessDocuments'), (req: AuthenticatedRequest, res) => {
  const collections = db
    .prepare('SELECT * FROM document_collections WHERE workspace_id = ? ORDER BY name ASC')
    .all(req.params.id) as Array<Record<string, unknown>>;

  const docs = db
    .prepare(`
      SELECT d.*, ua.full_name as author_name, uu.full_name as updated_by_name
      FROM documents d
      JOIN users ua ON ua.id = d.author_id
      JOIN users uu ON uu.id = d.updated_by
      WHERE d.workspace_id = ?
      ORDER BY d.is_pinned DESC, d.updated_at DESC
    `)
    .all(req.params.id) as Array<Record<string, unknown>>;

  res.json({
    collections: collections.map((c) => ({
      id: c.id,
      workspaceId: c.workspace_id,
      name: c.name,
      description: c.description,
      createdAt: c.created_at,
    })),
    documents: docs.map((d) => ({
      id: d.id,
      workspaceId: d.workspace_id,
      collectionId: d.collection_id || null,
      parentDocId: d.parent_doc_id || null,
      title: d.title,
      content: d.content,
      isPinned: Boolean(d.is_pinned),
      authorId: d.author_id,
      authorName: d.author_name,
      updatedByName: d.updated_by_name,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    })),
  });
});

router.post('/workspaces/:id/collections', requireAuth, requireWorkspaceMember('editDocuments'), (req: AuthenticatedRequest, res) => {
  const { name, description } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Collection name is required.' });
  const id = uid('col');
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO document_collections (id, workspace_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.params.id, String(name).trim(), String(description || '').trim(), createdAt);
  res.status(201).json({ collection: { id, workspaceId: req.params.id, name: String(name).trim(), description: String(description || '').trim(), createdAt } });
});

router.post('/workspaces/:id/documents', requireAuth, requireWorkspaceMember('editDocuments'), (req: AuthenticatedRequest, res) => {
  const { title, content, collectionId, parentDocId, isPinned } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'Document title is required.' });
  const id = uid('doc');
  const now = new Date().toISOString();
  const body = typeof content === 'string' ? content : '<p>Start writing...</p>';
  db.prepare(`
    INSERT INTO documents (id, workspace_id, collection_id, parent_doc_id, title, content, is_pinned, author_id, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, collectionId || null, parentDocId || null, String(title).trim(), body, isPinned ? 1 : 0, req.user!.id, req.user!.id, now, now);

  db.prepare(`INSERT INTO document_versions (id, document_id, version_number, title, content, edited_by, created_at) VALUES (?, ?, 1, ?, ?, ?, ?)`)
    .run(uid('ver'), id, String(title).trim(), body, req.user!.id, now);

  res.status(201).json({
    document: {
      id,
      workspaceId: req.params.id,
      collectionId: collectionId || null,
      parentDocId: parentDocId || null,
      title: String(title).trim(),
      content: body,
      isPinned: Boolean(isPinned),
      authorId: req.user!.id,
      authorName: req.user!.fullName,
      updatedByName: req.user!.fullName,
      createdAt: now,
      updatedAt: now,
    },
  });
});

router.patch('/workspaces/:id/documents/:docId', requireAuth, requireWorkspaceMember('editDocuments'), (req: AuthenticatedRequest, res) => {
  const { title, content, collectionId, isPinned, saveVersion } = req.body || {};
  const current = db.prepare('SELECT * FROM documents WHERE id = ? AND workspace_id = ?').get(req.params.docId, req.params.id) as Record<string, unknown> | undefined;
  if (!current) return res.status(404).json({ error: 'Document not found.' });

  const now = new Date().toISOString();
  const nextTitle = typeof title === 'string' && title.trim() ? title.trim() : String(current.title);
  const nextContent = typeof content === 'string' ? content : String(current.content);

  db.prepare(`
    UPDATE documents SET title = ?, content = ?, collection_id = ?, is_pinned = ?, updated_by = ?, updated_at = ?
    WHERE id = ? AND workspace_id = ?
  `).run(
    nextTitle,
    nextContent,
    collectionId !== undefined ? collectionId : current.collection_id,
    typeof isPinned === 'boolean' ? (isPinned ? 1 : 0) : current.is_pinned,
    req.user!.id,
    now,
    req.params.docId,
    req.params.id
  );

  if (saveVersion) {
    const maxVer = (db.prepare('SELECT COALESCE(MAX(version_number), 0) as v FROM document_versions WHERE document_id = ?').get(req.params.docId) as { v: number }).v;
    db.prepare('INSERT INTO document_versions (id, document_id, version_number, title, content, edited_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(uid('ver'), req.params.docId, maxVer + 1, nextTitle, nextContent, req.user!.id, now);
  }

  res.json({ ok: true, updatedAt: now });
});

router.get('/workspaces/:id/documents/:docId/versions', requireAuth, requireWorkspaceMember('accessDocuments'), (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(`
      SELECT dv.*, u.full_name as edited_by_name
      FROM document_versions dv JOIN users u ON u.id = dv.edited_by
      WHERE dv.document_id = ?
      ORDER BY dv.version_number DESC
    `)
    .all(req.params.docId) as Array<Record<string, unknown>>;
  res.json({
    versions: rows.map((r) => ({
      id: r.id,
      documentId: r.document_id,
      versionNumber: r.version_number,
      title: r.title,
      content: r.content,
      editedByName: r.edited_by_name,
      createdAt: r.created_at,
    })),
  });
});

router.delete('/workspaces/:id/documents/:docId', requireAuth, requireWorkspaceMember('editDocuments'), (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM documents WHERE id = ? AND workspace_id = ?').run(req.params.docId, req.params.id);
  res.json({ ok: true });
});

// ==========================================
// FILE MANAGEMENT & SECURE UPLOADS
// ==========================================

router.get('/workspaces/:id/files', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const folders = db
    .prepare('SELECT * FROM folders WHERE workspace_id = ? ORDER BY name ASC')
    .all(req.params.id) as Array<Record<string, unknown>>;

  const files = db
    .prepare(`
      SELECT f.*, u.full_name as uploaded_by_name
      FROM files f JOIN users u ON u.id = f.uploaded_by
      WHERE f.workspace_id = ?
      ORDER BY f.created_at DESC
    `)
    .all(req.params.id) as Array<Record<string, unknown>>;

  const sub = db.prepare('SELECT storage_limit_bytes FROM subscriptions WHERE workspace_id = ?').get(req.params.id) as { storage_limit_bytes: number } | undefined;
  const usedBytes = files.reduce((acc, f) => acc + Number(f.size_bytes || 0), 0);

  res.json({
    folders: folders.map((f) => ({
      id: f.id,
      workspaceId: f.workspace_id,
      parentId: f.parent_id || null,
      name: f.name,
      createdBy: f.created_by,
      createdAt: f.created_at,
    })),
    files: files.map((f) => ({
      id: f.id,
      workspaceId: f.workspace_id,
      folderId: f.folder_id || null,
      name: f.name,
      originalName: f.original_name,
      mimeType: f.mime_type,
      sizeBytes: f.size_bytes,
      uploadedBy: f.uploaded_by,
      uploadedByName: f.uploaded_by_name,
      version: f.version,
      isShared: Boolean(f.is_shared),
      permissionsLevel: f.permissions_level,
      createdAt: f.created_at,
    })),
    storage: {
      usedBytes,
      limitBytes: sub?.storage_limit_bytes || 5368709120,
    },
  });
});

router.post('/workspaces/:id/folders', requireAuth, requireWorkspaceMember('shareFiles'), (req: AuthenticatedRequest, res) => {
  const { name, parentId } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Folder name is required.' });
  const id = uid('fld');
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO folders (id, workspace_id, parent_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, req.params.id, parentId || null, String(name).trim(), req.user!.id, createdAt);
  res.status(201).json({ folder: { id, workspaceId: req.params.id, parentId: parentId || null, name: String(name).trim(), createdBy: req.user!.id, createdAt } });
});

router.post('/workspaces/:id/files/upload', requireAuth, requireWorkspaceMember('shareFiles'), upload.single('file'), (req: AuthenticatedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const folderId = req.body?.folderId || null;
  const permissionsLevel = ['workspace', 'managers', 'private'].includes(req.body?.permissionsLevel) ? req.body.permissionsLevel : 'workspace';
  const id = uid('file');
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO files (id, workspace_id, folder_id, name, original_name, mime_type, size_bytes, storage_path, uploaded_by, version, is_shared, permissions_level, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(id, req.params.id, folderId, req.file.originalname, req.file.originalname, req.file.mimetype, req.file.size, req.file.path, req.user!.id, permissionsLevel, createdAt);

  logAudit(req.params.id, req.user!.id, 'file.uploaded', 'file', id, { name: req.file.originalname, size: req.file.size }, req.ip);
  res.status(201).json({
    file: {
      id,
      workspaceId: req.params.id,
      folderId,
      name: req.file.originalname,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      uploadedBy: req.user!.id,
      uploadedByName: req.user!.fullName,
      version: 1,
      isShared: true,
      permissionsLevel,
      createdAt,
    },
  });
});

router.get('/workspaces/:id/files/:fileId/download', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND workspace_id = ?').get(req.params.fileId, req.params.id) as Record<string, unknown> | undefined;
  if (!file) return res.status(404).json({ error: 'File not found.' });
  const resolved = path.resolve(String(file.storage_path));
  const baseDir = path.resolve(uploadsDir);
  if (!resolved.startsWith(baseDir + path.sep) || !fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'File payload not found on storage.' });
  }
  if (req.query.inline === '1') {
    res.setHeader('Content-Type', String(file.mime_type || 'application/octet-stream'));
    return res.sendFile(resolved);
  }
  return res.download(resolved, String(file.original_name));
});

router.patch('/workspaces/:id/files/:fileId', requireAuth, requireWorkspaceMember('shareFiles'), (req: AuthenticatedRequest, res) => {
  const { isShared, permissionsLevel, name } = req.body || {};
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND workspace_id = ?').get(req.params.fileId, req.params.id) as Record<string, unknown> | undefined;
  if (!file) return res.status(404).json({ error: 'File not found.' });
  db.prepare('UPDATE files SET is_shared = ?, permissions_level = ?, name = ? WHERE id = ? AND workspace_id = ?').run(
    typeof isShared === 'boolean' ? (isShared ? 1 : 0) : file.is_shared,
    permissionsLevel || file.permissions_level,
    typeof name === 'string' && name.trim() ? name.trim() : file.name,
    req.params.fileId,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/workspaces/:id/files/:fileId', requireAuth, requireWorkspaceMember('shareFiles'), (req: AuthenticatedRequest, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND workspace_id = ?').get(req.params.fileId, req.params.id) as Record<string, unknown> | undefined;
  if (!file) return res.status(404).json({ error: 'File not found.' });
  const resolved = path.resolve(String(file.storage_path));
  const baseDir = path.resolve(uploadsDir);
  if (resolved.startsWith(baseDir + path.sep) && fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
  }
  db.prepare('DELETE FROM files WHERE id = ? AND workspace_id = ?').run(req.params.fileId, req.params.id);
  res.json({ ok: true });
});

// ==========================================
// CALENDAR EVENTS & MEETINGS
// ==========================================

router.get('/workspaces/:id/events', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM calendar_events WHERE workspace_id = ? ORDER BY start_time ASC')
    .all(req.params.id) as Array<Record<string, unknown>>;
  res.json({
    events: rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      title: r.title,
      description: r.description,
      startTime: r.start_time,
      endTime: r.end_time,
      eventType: r.event_type,
      projectId: r.project_id || null,
      meetingRoomId: r.meeting_room_id || null,
      participants: JSON.parse(String(r.participants_json || '[]')),
      reminderMinutes: r.reminder_minutes,
      createdBy: r.created_by,
      createdAt: r.created_at,
    })),
  });
});

router.post('/workspaces/:id/events', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  if (req.membership!.role === 'Guest') return res.status(403).json({ error: 'Guests cannot create calendar events.' });
  const { title, description, startTime, endTime, eventType, projectId, participants, reminderMinutes } = req.body || {};
  if (!title || !startTime || !endTime) return res.status(400).json({ error: 'Title, start time, and end time are required.' });
  const id = uid('evt');
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO calendar_events (id, workspace_id, title, description, start_time, end_time, event_type, project_id, participants_json, reminder_minutes, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.params.id,
    String(title).trim(),
    String(description || '').trim(),
    startTime,
    endTime,
    eventType || 'meeting',
    projectId || null,
    JSON.stringify(Array.isArray(participants) ? participants : [req.user!.id]),
    Number(reminderMinutes || 15),
    req.user!.id,
    createdAt
  );
  res.status(201).json({ ok: true, id });
});

router.delete('/workspaces/:id/events/:eventId', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  db.prepare('DELETE FROM calendar_events WHERE id = ? AND workspace_id = ?').run(req.params.eventId, req.params.id);
  res.json({ ok: true });
});

router.get('/workspaces/:id/meetings', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare(`
      SELECT m.*, u.full_name as host_name
      FROM meetings m JOIN users u ON u.id = m.host_id
      WHERE m.workspace_id = ?
      ORDER BY m.scheduled_at DESC
    `)
    .all(req.params.id) as Array<Record<string, unknown>>;
  res.json({
    meetings: rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      title: r.title,
      description: r.description,
      scheduledAt: r.scheduled_at,
      durationMinutes: r.duration_minutes,
      roomCode: r.room_code,
      joinUrl: r.join_url,
      hostId: r.host_id,
      hostName: r.host_name,
      participants: JSON.parse(String(r.participants_json || '[]')),
      status: r.status,
      notes: r.notes || '',
      createdAt: r.created_at,
    })),
  });
});

router.post('/workspaces/:id/meetings', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  if (req.membership!.role === 'Guest') return res.status(403).json({ error: 'Guests cannot schedule meetings.' });
  const { title, description, scheduledAt, durationMinutes, participants, notes } = req.body || {};
  if (!title || !scheduledAt) return res.status(400).json({ error: 'Meeting title and schedule time are required.' });
  const id = uid('mtg');
  const roomCode = `SYN-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const joinUrl = `/meetings/${roomCode}`;
  const createdAt = new Date().toISOString();
  const participantList = Array.isArray(participants) && participants.length ? participants : [req.user!.id];

  db.prepare(`
    INSERT INTO meetings (id, workspace_id, title, description, scheduled_at, duration_minutes, room_code, join_url, host_id, participants_json, status, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled', ?, ?)
  `).run(id, req.params.id, String(title).trim(), String(description || '').trim(), scheduledAt, Number(durationMinutes || 45), roomCode, joinUrl, req.user!.id, JSON.stringify(participantList), String(notes || ''), createdAt);

  // Also add to calendar events
  const endIso = new Date(new Date(scheduledAt).getTime() + Number(durationMinutes || 45) * 60_000).toISOString();
  db.prepare(`
    INSERT INTO calendar_events (id, workspace_id, title, description, start_time, end_time, event_type, meeting_room_id, participants_json, reminder_minutes, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'meeting', ?, ?, 15, ?, ?)
  `).run(uid('evt'), req.params.id, String(title).trim(), String(description || '').trim(), scheduledAt, endIso, id, JSON.stringify(participantList), req.user!.id, createdAt);

  for (const pid of participantList) {
    if (pid !== req.user!.id) {
      createNotification(req.params.id, String(pid), 'meeting_invite', 'Meeting invitation', `${req.user!.fullName} invited you to "${String(title).trim()}".`, 'meetings', id);
    }
  }

  res.status(201).json({ ok: true, id, roomCode, joinUrl });
});

router.patch('/workspaces/:id/meetings/:meetingId', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const { status, notes } = req.body || {};
  const current = db.prepare('SELECT * FROM meetings WHERE id = ? AND workspace_id = ?').get(req.params.meetingId, req.params.id) as Record<string, unknown> | undefined;
  if (!current) return res.status(404).json({ error: 'Meeting not found.' });
  db.prepare('UPDATE meetings SET status = ?, notes = ? WHERE id = ? AND workspace_id = ?').run(
    status || current.status,
    typeof notes === 'string' ? notes : current.notes,
    req.params.meetingId,
    req.params.id
  );
  res.json({ ok: true });
});

// ==========================================
// NOTIFICATIONS, GLOBAL SEARCH, ANALYTICS, BILLING & AI
// ==========================================

router.get('/workspaces/:id/notifications', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.params.id, req.user!.id) as Array<Record<string, unknown>>;
  res.json({
    notifications: rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      body: r.body,
      linkView: r.link_view,
      linkId: r.link_id || null,
      isRead: Boolean(r.is_read),
      createdAt: r.created_at,
    })),
  });
});

router.patch('/workspaces/:id/notifications/:notifId/read', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND workspace_id = ? AND user_id = ?').run(req.params.notifId, req.params.id, req.user!.id);
  res.json({ ok: true });
});

router.post('/workspaces/:id/notifications/read-all', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE workspace_id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

router.get('/workspaces/:id/search', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const q = String(req.query.q || '').trim();
  const wsId = req.params.id;
  if (!q) return res.json({ results: { messages: [], channels: [], projects: [], tasks: [], documents: [], files: [], members: [] } });
  const like = `%${q}%`;

  const messages = db
    .prepare(`SELECT m.id, m.content, m.channel_id, m.thread_id, m.created_at, u.full_name as sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.workspace_id = ? AND m.is_deleted = 0 AND m.content LIKE ? LIMIT 10`)
    .all(wsId, like);
  const channels = db.prepare(`SELECT id, name, description FROM channels WHERE workspace_id = ? AND (name LIKE ? OR description LIKE ?) LIMIT 8`).all(wsId, like, like);
  const projects = db.prepare(`SELECT id, name, status, progress FROM projects WHERE workspace_id = ? AND (name LIKE ? OR description LIKE ?) LIMIT 8`).all(wsId, like, like);
  const tasks = db.prepare(`SELECT id, title, status, priority, project_id FROM tasks WHERE workspace_id = ? AND (title LIKE ? OR description LIKE ?) LIMIT 12`).all(wsId, like, like);
  const documents = db.prepare(`SELECT id, title, updated_at FROM documents WHERE workspace_id = ? AND (title LIKE ? OR content LIKE ?) LIMIT 10`).all(wsId, like, like);
  const files = db.prepare(`SELECT id, name, mime_type, size_bytes FROM files WHERE workspace_id = ? AND name LIKE ? LIMIT 10`).all(wsId, like);
  const members = db
    .prepare(`SELECT u.id, u.full_name, u.email, u.title, wm.role FROM workspace_memberships wm JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = ? AND (u.full_name LIKE ? OR u.email LIKE ? OR u.title LIKE ?) LIMIT 10`)
    .all(wsId, like, like, like);

  res.json({ results: { messages, channels, projects, tasks, documents, files, members } });
});

router.get('/workspaces/:id/analytics', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const wsId = req.params.id;
  const today = new Date().toISOString().slice(0, 10);

  const projects = db.prepare('SELECT id, name, status, progress, deadline FROM projects WHERE workspace_id = ?').all(wsId) as Array<Record<string, unknown>>;
  const tasks = db.prepare('SELECT id, status, priority, due_date, assignee_id FROM tasks WHERE workspace_id = ?').all(wsId) as Array<Record<string, unknown>>;
  const memberCount = (db.prepare('SELECT COUNT(*) as c FROM workspace_memberships WHERE workspace_id = ?').get(wsId) as { c: number }).c;
  const messageCount = (db.prepare('SELECT COUNT(*) as c FROM messages WHERE workspace_id = ? AND is_deleted = 0').get(wsId) as { c: number }).c;
  const docCount = (db.prepare('SELECT COUNT(*) as c FROM documents WHERE workspace_id = ?').get(wsId) as { c: number }).c;
  const storageUsed = (db.prepare('SELECT COALESCE(SUM(size_bytes), 0) as s FROM files WHERE workspace_id = ?').get(wsId) as { s: number }).s;

  const statusBreakdown = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'].map((st) => ({
    status: st,
    count: tasks.filter((t) => t.status === st).length,
  }));

  const memberVelocity = db
    .prepare(`
      SELECT u.full_name as name,
             COUNT(t.id) as total,
             SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) as completed
      FROM workspace_memberships wm
      JOIN users u ON u.id = wm.user_id
      LEFT JOIN tasks t ON t.assignee_id = u.id AND t.workspace_id = wm.workspace_id
      WHERE wm.workspace_id = ?
      GROUP BY u.id
    `)
    .all(wsId);

  res.json({
    summary: {
      totalProjects: projects.length,
      activeProjects: projects.filter((p) => p.status === 'Active').length,
      completedTasks: tasks.filter((t) => t.status === 'Done').length,
      pendingTasks: tasks.filter((t) => t.status !== 'Done').length,
      overdueTasks: tasks.filter((t) => t.due_date && String(t.due_date) < today && t.status !== 'Done').length,
      memberCount,
      messageCount,
      docCount,
      storageUsedBytes: storageUsed,
    },
    statusBreakdown,
    projectRates: projects.map((p) => ({ name: p.name, progress: p.progress, status: p.status, deadline: p.deadline })),
    memberVelocity,
  });
});

router.get('/workspaces/:id/billing', requireAuth, requireWorkspaceMember(), (req: AuthenticatedRequest, res) => {
  const wsId = req.params.id;
  const sub = db.prepare('SELECT * FROM subscriptions WHERE workspace_id = ?').get(wsId) as Record<string, unknown> | undefined;
  const payments = db.prepare('SELECT * FROM payments WHERE workspace_id = ? ORDER BY created_at DESC').all(wsId) as Array<Record<string, unknown>>;
  const seatCount = (db.prepare('SELECT COUNT(*) as c FROM workspace_memberships WHERE workspace_id = ?').get(wsId) as { c: number }).c;
  const storageUsedBytes = (db.prepare('SELECT COALESCE(SUM(size_bytes), 0) as s FROM files WHERE workspace_id = ?').get(wsId) as { s: number }).s;

  res.json({
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status,
          billingCycle: sub.billing_cycle,
          seatLimit: sub.seat_limit,
          storageLimitBytes: sub.storage_limit_bytes,
          currentPeriodEnd: sub.current_period_end,
          stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
          mpesaConfigured: Boolean(process.env.MPESA_CONSUMER_KEY),
        }
      : null,
    usage: { seatCount, storageUsedBytes },
    payments: payments.map((p) => ({
      id: p.id,
      amountCents: p.amount_cents,
      currency: p.currency,
      provider: p.provider,
      status: p.status,
      invoiceNumber: p.invoice_number,
      createdAt: p.created_at,
    })),
  });
});

router.post('/workspaces/:id/billing/upgrade', requireAuth, requireWorkspaceMember('manageBilling'), (req: AuthenticatedRequest, res) => {
  const { plan, provider, billingCycle, mpesaPhone } = req.body || {};
  const wsId = req.params.id;
  if (!['FREE', 'PRO', 'BUSINESS'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid subscription plan.' });
  }
  const seatLimit = plan === 'BUSINESS' ? 250 : plan === 'PRO' ? 25 : 5;
  const storageLimit = plan === 'BUSINESS' ? 1099511627776 : plan === 'PRO' ? 107374182400 : 5368709120;
  const amountCents = plan === 'BUSINESS' ? (billingCycle === 'annual' ? 149000 : 14900) : plan === 'PRO' ? (billingCycle === 'annual' ? 49000 : 4900) : 0;
  const now = new Date().toISOString();
  const nextPeriod = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  db.prepare(`
    UPDATE subscriptions
    SET plan = ?, billing_cycle = ?, seat_limit = ?, storage_limit_bytes = ?, mpesa_phone = ?, current_period_end = ?, updated_at = ?
    WHERE workspace_id = ?
  `).run(plan, billingCycle || 'monthly', seatLimit, storageLimit, mpesaPhone || null, nextPeriod, now, wsId);

  db.prepare('UPDATE workspaces SET plan = ?, storage_quota_bytes = ? WHERE id = ?').run(plan, storageLimit, wsId);

  if (amountCents > 0) {
    db.prepare(`
      INSERT INTO payments (id, workspace_id, amount_cents, currency, provider, status, invoice_number, created_at)
      VALUES (?, ?, ?, ?, ?, 'paid', ?, ?)
    `).run(uid('pay'), wsId, amountCents, provider === 'M-Pesa' ? 'KES' : 'USD', provider === 'M-Pesa' ? 'M-Pesa' : 'Stripe', `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`, now);
  }

  logAudit(wsId, req.user!.id, 'billing.plan_changed', 'subscription', wsId, { plan, provider }, req.ip);
  res.json({ ok: true, plan });
});

router.post('/workspaces/:id/ai', requireAuth, requireWorkspaceMember(), rateLimit(20, 60_000), async (req: AuthenticatedRequest, res) => {
  const { mode, prompt, targetId, notes } = req.body || {};
  try {
    const result = await runSynoraAi({
      workspaceId: req.params.id,
      mode: (mode || 'ask_workspace') as AiMode,
      prompt,
      targetId,
      notes,
    });
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Synora AI request failed.';
    res.status(500).json({ error: message });
  }
});

export default router;
