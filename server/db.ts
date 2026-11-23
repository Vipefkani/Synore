import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export const db = new Database(path.join(dataDir, 'synore.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPasswordSync(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Team Member',
      department TEXT NOT NULL DEFAULT 'Operations',
      avatar_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      reset_token TEXT,
      reset_expires_at TEXT,
      notification_prefs_json TEXT NOT NULL DEFAULT '{"messages":true,"tasks":true,"mentions":true,"meetings":true,"emailDigest":true}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'Technology Startup',
      logo_color TEXT NOT NULL DEFAULT '#2563EB',
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'PRO',
      storage_quota_bytes INTEGER NOT NULL DEFAULT 10737418240,
      billing_email TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      lead_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_memberships (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'Member',
      department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
      permissions_json TEXT NOT NULL DEFAULT '{}',
      joined_at TEXT NOT NULL,
      UNIQUE(workspace_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      is_private INTEGER NOT NULL DEFAULT 0,
      is_announcement INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (channel_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS direct_threads (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      is_group INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS direct_thread_members (
      thread_id TEXT NOT NULL REFERENCES direct_threads(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (thread_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE,
      thread_id TEXT REFERENCES direct_threads(id) ON DELETE CASCADE,
      parent_message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_edited INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      read_by_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(message_id, user_id, emoji)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      priority TEXT NOT NULL DEFAULT 'High',
      owner_id TEXT NOT NULL REFERENCES users(id),
      deadline TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#2563EB',
      columns_json TEXT NOT NULL DEFAULT '["Backlog","To Do","In Progress","Review","Done"]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'Contributor',
      PRIMARY KEY (project_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'To Do',
      priority TEXT NOT NULL DEFAULT 'Medium',
      assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      creator_id TEXT NOT NULL REFERENCES users(id),
      start_date TEXT,
      due_date TEXT,
      labels_json TEXT NOT NULL DEFAULT '[]',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_collections (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      collection_id TEXT REFERENCES document_collections(id) ON DELETE SET NULL,
      parent_doc_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      author_id TEXT NOT NULL REFERENCES users(id),
      updated_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      edited_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      storage_path TEXT NOT NULL,
      uploaded_by TEXT NOT NULL REFERENCES users(id),
      version INTEGER NOT NULL DEFAULT 1,
      is_shared INTEGER NOT NULL DEFAULT 1,
      permissions_level TEXT NOT NULL DEFAULT 'workspace',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'meeting',
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      meeting_room_id TEXT,
      participants_json TEXT NOT NULL DEFAULT '[]',
      reminder_minutes INTEGER NOT NULL DEFAULT 15,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      scheduled_at TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 45,
      room_code TEXT NOT NULL UNIQUE,
      join_url TEXT NOT NULL,
      host_id TEXT NOT NULL REFERENCES users(id),
      participants_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'Scheduled',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link_view TEXT NOT NULL DEFAULT 'home',
      link_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'PRO',
      status TEXT NOT NULL DEFAULT 'active',
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      seat_limit INTEGER NOT NULL DEFAULT 25,
      storage_limit_bytes INTEGER NOT NULL DEFAULT 107374182400,
      stripe_customer_id TEXT,
      mpesa_phone TEXT,
      current_period_end TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      provider TEXT NOT NULL DEFAULT 'Stripe',
      status TEXT NOT NULL DEFAULT 'paid',
      invoice_number TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT NOT NULL DEFAULT '127.0.0.1',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_workspace_project ON tasks(workspace_id, project_id, status);
    CREATE INDEX IF NOT EXISTS idx_docs_workspace ON documents(workspace_id, collection_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(workspace_id, user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_logs(workspace_id, created_at);
  `);
}

export function seedDatabase() {
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount > 0) return;

  const now = new Date();
  const iso = (offsetHours = 0) => new Date(now.getTime() + offsetHours * 3600_000).toISOString();
  const dayIso = (offsetDays = 0) => new Date(now.getTime() + offsetDays * 86400_000).toISOString().slice(0, 10);

  const demoPassHash = hashPasswordSync('SynoreDemo!2026');

  const users = [
    {
      id: 'usr_elena',
      email: 'elena@synore.io',
      fullName: 'Elena Rostova',
      title: 'VP of Product',
      department: 'Product & Strategy',
      avatarUrl: '/src/assets/images/avatar_elena_1795432559024.jpg',
      status: 'In deep focus',
    },
    {
      id: 'usr_marcus',
      email: 'marcus@synore.io',
      fullName: 'Marcus Vance',
      title: 'Principal Architect',
      department: 'Platform Engineering',
      avatarUrl: '/src/assets/images/avatar_marcus_1795432558771.jpg',
      status: 'Available',
    },
    {
      id: 'usr_priya',
      email: 'priya@synore.io',
      fullName: 'Priya Nair',
      title: 'Staff Systems Engineer',
      department: 'Platform Engineering',
      avatarUrl: '/src/assets/images/avatar_priya_1795432558822.jpg',
      status: 'Reviewing PRs',
    },
    {
      id: 'usr_david',
      email: 'david@synore.io',
      fullName: 'David Lindqvist',
      title: 'Head of Design',
      department: 'Design Systems',
      avatarUrl: '/src/assets/images/avatar_david_1795432559097.jpg',
      status: 'Available',
    },
  ];

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, title, department, avatar_url, status, email_verified, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  for (const u of users) {
    insertUser.run(u.id, u.email, demoPassHash, u.fullName, u.title, u.department, u.avatarUrl, u.status, iso(-240));
  }

  // Two isolated workspaces to demonstrate true multi-tenancy
  db.prepare(`
    INSERT INTO workspaces (id, name, slug, type, logo_color, owner_id, plan, storage_quota_bytes, billing_email, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('ws_core', 'Synore Core', 'synore-core', 'Technology Startup', '#2563EB', 'usr_elena', 'PRO', 107374182400, 'billing@synore.io', iso(-200));

  db.prepare(`
    INSERT INTO workspaces (id, name, slug, type, logo_color, owner_id, plan, storage_quota_bytes, billing_email, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('ws_vanguard', 'Vanguard Labs', 'vanguard-labs', 'Research & Agency', '#0D9488', 'usr_marcus', 'FREE', 5368709120, 'ops@vanguard.io', iso(-120));

  // Departments in Synore Core
  const depts = [
    ['dept_prod', 'ws_core', 'Product & Strategy', 'Roadmap governance, customer discovery, and quarterly OKRs', 'usr_elena'],
    ['dept_eng', 'ws_core', 'Platform Engineering', 'Core API, real-time infrastructure, security, and reliability', 'usr_marcus'],
    ['dept_des', 'ws_core', 'Design Systems', 'Brand architecture, component tokens, and user research', 'usr_david'],
  ];
  const insertDept = db.prepare(`INSERT INTO departments (id, workspace_id, name, description, lead_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const d of depts) insertDept.run(...d, iso(-190));

  // Memberships
  const memberships = [
    ['mem_1', 'ws_core', 'usr_elena', 'Owner', 'dept_prod'],
    ['mem_2', 'ws_core', 'usr_marcus', 'Administrator', 'dept_eng'],
    ['mem_3', 'ws_core', 'usr_priya', 'Manager', 'dept_eng'],
    ['mem_4', 'ws_core', 'usr_david', 'Member', 'dept_des'],
    ['mem_5', 'ws_vanguard', 'usr_marcus', 'Owner', null],
    ['mem_6', 'ws_vanguard', 'usr_elena', 'Member', null],
  ];
  const insertMem = db.prepare(`INSERT INTO workspace_memberships (id, workspace_id, user_id, role, department_id, permissions_json, joined_at) VALUES (?, ?, ?, ?, ?, '{}', ?)`);
  for (const m of memberships) insertMem.run(...m, iso(-180));

  // Channels
  const channels = [
    ['ch_general', 'ws_core', 'general', 'Company-wide updates, daily standups, and cross-team coordination', 0, 0, 'usr_elena'],
    ['ch_announcements', 'ws_core', 'announcements', 'Official leadership releases, policy updates, and milestone celebrations', 0, 1, 'usr_elena'],
    ['ch_architecture', 'ws_core', 'architecture', 'RFCs, WebSocket scaling, database migrations, and security audits', 1, 0, 'usr_marcus'],
    ['ch_design', 'ws_core', 'design-critique', 'UI reviews, typography scales, and accessibility audits', 0, 0, 'usr_david'],
    ['ch_vg_general', 'ws_vanguard', 'vanguard-ops', 'Isolated workspace channel for Vanguard Labs research', 0, 0, 'usr_marcus'],
  ];
  const insertChannel = db.prepare(`INSERT INTO channels (id, workspace_id, name, description, is_private, is_announcement, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertChMem = db.prepare(`INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)`);
  for (const c of channels) {
    insertChannel.run(...c, iso(-170));
    if (c[1] === 'ws_core') {
      for (const u of users) insertChMem.run(c[0], u.id, iso(-170));
    } else {
      insertChMem.run(c[0], 'usr_marcus', iso(-100));
      insertChMem.run(c[0], 'usr_elena', iso(-100));
    }
  }

  // Direct Message threads
  db.prepare(`INSERT INTO direct_threads (id, workspace_id, name, is_group, created_at) VALUES (?, ?, ?, ?, ?)`).run('dm_elena_marcus', 'ws_core', '', 0, iso(-80));
  db.prepare(`INSERT INTO direct_thread_members (thread_id, user_id) VALUES (?, ?)`).run('dm_elena_marcus', 'usr_elena');
  db.prepare(`INSERT INTO direct_thread_members (thread_id, user_id) VALUES (?, ?)`).run('dm_elena_marcus', 'usr_marcus');

  db.prepare(`INSERT INTO direct_threads (id, workspace_id, name, is_group, created_at) VALUES (?, ?, ?, ?, ?)`).run('dm_launch_squad', 'ws_core', 'Q4 Launch Squad', 1, iso(-50));
  for (const uid of ['usr_elena', 'usr_marcus', 'usr_priya', 'usr_david']) {
    db.prepare(`INSERT INTO direct_thread_members (thread_id, user_id) VALUES (?, ?)`).run('dm_launch_squad', uid);
  }

  // Messages
  const insertMsg = db.prepare(`
    INSERT INTO messages (id, workspace_id, channel_id, thread_id, parent_message_id, sender_id, content, attachments_json, is_pinned, is_edited, is_deleted, read_by_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, 0, 0, ?, ?, ?)
  `);
  insertMsg.run('msg_1', 'ws_core', 'ch_general', null, null, 'usr_elena', 'Welcome to the Q4 sprint cycle. All project roadmaps and Kanban boards are synced with our release milestones.', 1, '["usr_elena","usr_marcus","usr_priya"]', iso(-12), iso(-12));
  insertMsg.run('msg_2', 'ws_core', 'ch_general', null, null, 'usr_marcus', 'WebSocket cluster and multi-tenant isolation checks passed staging verification. Ready for production traffic.', 0, '["usr_elena","usr_marcus"]', iso(-10), iso(-10));
  insertMsg.run('msg_3', 'ws_core', 'ch_general', null, 'msg_2', 'usr_priya', 'Confirmed — latency stayed under 18ms during the 5,000 concurrent socket stress test.', 0, '["usr_marcus","usr_priya"]', iso(-9.5), iso(-9.5));
  insertMsg.run('msg_4', 'ws_core', 'ch_general', null, null, 'usr_david', 'Updated the dark charcoal tokens and tabular-nums alignment across the Analytics and Kanban views.', 0, '["usr_elena","usr_david"]', iso(-4), iso(-4));
  insertMsg.run('msg_5', 'ws_core', 'ch_announcements', null, null, 'usr_elena', 'Synore 2.4 Enterprise Release is scheduled for Friday 14:00 UTC. Please finalize QA sign-offs in the Projects board.', 1, '["usr_elena","usr_marcus","usr_priya","usr_david"]', iso(-24), iso(-24));
  insertMsg.run('msg_6', 'ws_core', null, 'dm_elena_marcus', null, 'usr_marcus', 'Elena, I finalized the security audit doc in Knowledge Base. Can you review section 3 before the board sync?', 0, '["usr_elena","usr_marcus"]', iso(-3), iso(-3));
  insertMsg.run('msg_7', 'ws_core', null, 'dm_elena_marcus', null, 'usr_elena', 'Reviewing right now! Let us also pull Priya into the 2 PM readiness call.', 0, '["usr_elena","usr_marcus"]', iso(-2), iso(-2));
  insertMsg.run('msg_8', 'ws_core', null, 'dm_launch_squad', null, 'usr_priya', 'Deployment checklist is 90% green. Only the billing webhook test remains.', 0, '["usr_elena","usr_priya"]', iso(-1), iso(-1));

  db.prepare(`INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)`).run('rx_1', 'msg_1', 'usr_marcus', '🚀', iso(-11));
  db.prepare(`INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)`).run('rx_2', 'msg_1', 'usr_priya', '🚀', iso(-11));
  db.prepare(`INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)`).run('rx_3', 'msg_2', 'usr_elena', '✅', iso(-9));

  // Projects
  const projects = [
    ['proj_platform', 'ws_core', 'Synore Core Engine v2.4', 'Multi-tenant isolation, real-time WebSocket message bus, and RBAC permission engine.', 'Active', 'Urgent', 'usr_marcus', dayIso(12), 68, '#2563EB'],
    ['proj_design', 'ws_core', 'Unified Workspace Design System', 'Accessible dual-theme tokens, keyboard-first navigation, and responsive Kanban cards.', 'Active', 'High', 'usr_david', dayIso(18), 54, '#0D9488'],
    ['proj_billing', 'ws_core', 'Global Billing & M-Pesa Gateway', 'Stripe subscription lifecycle, usage metering, and regional mobile money readiness.', 'Planning', 'Medium', 'usr_elena', dayIso(28), 30, '#D97706'],
    ['proj_vg', 'ws_vanguard', 'Vanguard Telemetry Pilot', 'Private research pilot for Vanguard Labs.', 'Active', 'High', 'usr_marcus', dayIso(10), 45, '#0D9488'],
  ];
  const insertProj = db.prepare(`INSERT INTO projects (id, workspace_id, name, description, status, priority, owner_id, deadline, progress, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertProjMem = db.prepare(`INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`);
  for (const p of projects) {
    insertProj.run(...p, iso(-140));
    if (p[1] === 'ws_core') {
      for (const u of users) insertProjMem.run(p[0], u.id, u.id === p[6] ? 'Lead' : 'Contributor');
    } else {
      insertProjMem.run(p[0], 'usr_marcus', 'Lead');
    }
  }

  // Tasks
  const tasks = [
    ['tsk_1', 'ws_core', 'proj_platform', 'Implement WebSocket room authorization middleware', 'Verify workspace membership before allowing socket subscriptions to channel or Kanban rooms.', 'Done', 'Urgent', 'usr_marcus', 'usr_elena', dayIso(-5), dayIso(-1), '["Security","WebSocket"]', 0],
    ['tsk_2', 'ws_core', 'proj_platform', 'Add optimistic Kanban drag-and-drop reconciliation', 'Sync card column transitions immediately and broadcast deltas to connected workspace peers.', 'In Progress', 'High', 'usr_priya', 'usr_marcus', dayIso(-2), dayIso(3), '["Frontend","Real-time"]', 0],
    ['tsk_3', 'ws_core', 'proj_platform', 'Rate-limit authentication & password reset routes', 'Protect login, verification, and token reset endpoints against brute-force attempts.', 'Review', 'High', 'usr_marcus', 'usr_elena', dayIso(-3), dayIso(1), '["Security","API"]', 0],
    ['tsk_4', 'ws_core', 'proj_platform', 'Benchmark PostgreSQL / SQLite connection pooling', 'Ensure sub-20ms p95 query response under concurrent workspace searches.', 'To Do', 'Medium', 'usr_priya', 'usr_marcus', dayIso(0), dayIso(5), '["Database","Performance"]', 0],
    ['tsk_5', 'ws_core', 'proj_design', 'Audit WCAG AA contrast in Light & Dark modes', 'Verify 4.5:1 text contrast on all structural surfaces, tables, and focus rings.', 'In Progress', 'High', 'usr_david', 'usr_elena', dayIso(-1), dayIso(2), '["Accessibility","UI"]', 1],
    ['tsk_6', 'ws_core', 'proj_design', 'Design document version history diff drawer', 'Allow side-by-side inspection and one-click restore for collaborative docs.', 'To Do', 'Medium', 'usr_david', 'usr_david', dayIso(1), dayIso(7), '["Docs","UX"]', 1],
    ['tsk_7', 'ws_core', 'proj_billing', 'Implement invoice PDF metadata & usage quota guardrails', 'Track storage consumption per workspace and enforce tier seat limits.', 'Backlog', 'Medium', 'usr_elena', 'usr_elena', dayIso(3), dayIso(14), '["Billing","SaaS"]', 0],
    ['tsk_8', 'ws_core', 'proj_platform', 'Patch stale session token revocation edge case', 'Overdue security task to test immediate logout propagation.', 'To Do', 'Urgent', 'usr_elena', 'usr_marcus', dayIso(-6), dayIso(-2), '["Security","Overdue"]', 2],
  ];
  const insertTask = db.prepare(`
    INSERT INTO tasks (id, workspace_id, project_id, title, description, status, priority, assignee_id, creator_id, start_date, due_date, labels_json, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const t of tasks) insertTask.run(...t, iso(-72), iso(-4));

  // Subtasks
  db.prepare(`INSERT INTO subtasks (id, task_id, title, is_completed, position) VALUES (?, ?, ?, ?, ?)`).run('sub_1', 'tsk_2', 'Wire HTML5 draggable card events', 1, 0);
  db.prepare(`INSERT INTO subtasks (id, task_id, title, is_completed, position) VALUES (?, ?, ?, ?, ?)`).run('sub_2', 'tsk_2', 'Broadcast task:moved over WebSocket channel', 1, 1);
  db.prepare(`INSERT INTO subtasks (id, task_id, title, is_completed, position) VALUES (?, ?, ?, ?, ?)`).run('sub_3', 'tsk_2', 'Add rollback toast on 403 permission rejection', 0, 2);

  // Comments
  db.prepare(`INSERT INTO comments (id, workspace_id, entity_type, entity_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('cmt_1', 'ws_core', 'task', 'tsk_2', 'usr_marcus', 'Looks super responsive. Make sure empty columns remain drop targets.', iso(-3));

  // Document Collections & Knowledge Base Documents
  db.prepare(`INSERT INTO document_collections (id, workspace_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)`).run('col_eng', 'ws_core', 'Engineering Handbook', 'Architecture RFCs, deployment runbooks, and security standards.', iso(-150));
  db.prepare(`INSERT INTO document_collections (id, workspace_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)`).run('col_ops', 'ws_core', 'Company Operations', 'Onboarding playbooks, quarterly goals, and meeting protocols.', iso(-150));

  const doc1Content = `<h1>Synore Multi-Tenant Security Architecture</h1>
<p>Every request entering the Synore API passes through strict workspace boundary verification. Users can belong to multiple workspaces with distinct roles.</p>
<h2>Core Isolation Guarantees</h2>
<ul>
  <li><strong>Workspace-Scoped Queries:</strong> Every SQL statement filters by <code>workspace_id</code> derived from verified membership.</li>
  <li><strong>Role-Based Access Control:</strong> Owner, Administrator, Manager, Member, and Guest permissions are enforced server-side.</li>
  <li><strong>WebSocket Room Guard:</strong> Socket subscriptions validate channel and project membership prior to joining.</li>
</ul>
<table>
  <thead><tr><th>Role</th><th>Manage Members</th><th>Create Projects</th><th>Billing Access</th></tr></thead>
  <tbody>
    <tr><td>Owner</td><td>Full</td><td>Full</td><td>Full</td></tr>
    <tr><td>Administrator</td><td>Full</td><td>Full</td><td>Read-only</td></tr>
    <tr><td>Member</td><td>None</td><td>Assigned</td><td>None</td></tr>
  </tbody>
</table>`;

  const doc2Content = `<h1>Q4 Product & Engineering Roadmap</h1>
<p>Our primary focus for Q4 is unifying real-time team communication with deterministic project execution.</p>
<h2>Key Milestones</h2>
<ul>
  <li>Zero-latency Kanban synchronization across distributed teams</li>
  <li>Versioned collaborative documents with autosave</li>
  <li>Synora AI workspace briefings powered by Gemini</li>
</ul>`;

  const doc3Content = `<h1>New Engineer Onboarding Checklist</h1>
<p>Follow these steps during your first week at Synore Core.</p>
<ul>
  <li>Complete profile setup and verify email</li>
  <li>Join #general, #announcements, and #architecture channels</li>
  <li>Review the Multi-Tenant Security Architecture spec</li>
</ul>`;

  db.prepare(`INSERT INTO documents (id, workspace_id, collection_id, parent_doc_id, title, content, is_pinned, author_id, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('doc_1', 'ws_core', 'col_eng', null, 'Multi-Tenant Security Architecture', doc1Content, 1, 'usr_marcus', 'usr_marcus', iso(-90), iso(-6));
  db.prepare(`INSERT INTO documents (id, workspace_id, collection_id, parent_doc_id, title, content, is_pinned, author_id, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('doc_2', 'ws_core', 'col_ops', null, 'Q4 Product & Engineering Roadmap', doc2Content, 1, 'usr_elena', 'usr_elena', iso(-60), iso(-3));
  db.prepare(`INSERT INTO documents (id, workspace_id, collection_id, parent_doc_id, title, content, is_pinned, author_id, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('doc_3', 'ws_core', 'col_eng', 'doc_1', 'New Engineer Onboarding Checklist', doc3Content, 0, 'usr_priya', 'usr_priya', iso(-30), iso(-10));

  db.prepare(`INSERT INTO document_versions (id, document_id, version_number, title, content, edited_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run('ver_1', 'doc_1', 1, 'Multi-Tenant Security Architecture', '<p>Initial draft of workspace isolation rules.</p>', 'usr_marcus', iso(-90));
  db.prepare(`INSERT INTO document_versions (id, document_id, version_number, title, content, edited_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run('ver_2', 'doc_1', 2, 'Multi-Tenant Security Architecture', doc1Content, 'usr_marcus', iso(-6));

  // Folders & Sample Files (real files written to uploadsDir so downloads & previews actually work!)
  db.prepare(`INSERT INTO folders (id, workspace_id, parent_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run('fld_specs', 'ws_core', null, 'Architecture Specs', 'usr_marcus', iso(-80));
  db.prepare(`INSERT INTO folders (id, workspace_id, parent_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run('fld_brand', 'ws_core', null, 'Brand & Design Assets', 'usr_david', iso(-70));

  const sampleSpecPath = path.join(uploadsDir, 'ws_core_architecture_overview.md');
  const sampleSpecBody = `# Synore Architecture Overview\n\n- Real-time WebSocket Event Bus\n- Multi-tenant Workspace RBAC\n- Encrypted Token Sessions\n`;
  fs.writeFileSync(sampleSpecPath, sampleSpecBody, 'utf8');

  const sampleConfigPath = path.join(uploadsDir, 'ws_core_sla_targets.json');
  const sampleConfigBody = JSON.stringify({ p95LatencyMs: 22, uptimeSlo: '99.95%', maxAttachmentMb: 50 }, null, 2);
  fs.writeFileSync(sampleConfigPath, sampleConfigBody, 'utf8');

  db.prepare(`INSERT INTO files (id, workspace_id, folder_id, name, original_name, mime_type, size_bytes, storage_path, uploaded_by, version, is_shared, permissions_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'workspace', ?)`)
    .run('file_1', 'ws_core', 'fld_specs', 'architecture_overview.md', 'architecture_overview.md', 'text/markdown', Buffer.byteLength(sampleSpecBody), sampleSpecPath, 'usr_marcus', iso(-40));
  db.prepare(`INSERT INTO files (id, workspace_id, folder_id, name, original_name, mime_type, size_bytes, storage_path, uploaded_by, version, is_shared, permissions_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'workspace', ?)`)
    .run('file_2', 'ws_core', 'fld_specs', 'sla_targets.json', 'sla_targets.json', 'application/json', Buffer.byteLength(sampleConfigBody), sampleConfigPath, 'usr_priya', iso(-20));

  // Calendar Events & Meetings
  db.prepare(`INSERT INTO calendar_events (id, workspace_id, title, description, start_time, end_time, event_type, project_id, meeting_room_id, participants_json, reminder_minutes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 15, ?, ?)`)
    .run('evt_1', 'ws_core', 'Q4 Release Readiness Sync', 'Cross-functional review of Kanban blockers and QA telemetry.', iso(2), iso(3), 'meeting', 'proj_platform', 'mtg_1', '["usr_elena","usr_marcus","usr_priya","usr_david"]', 'usr_elena', iso(-24));
  db.prepare(`INSERT INTO calendar_events (id, workspace_id, title, description, start_time, end_time, event_type, project_id, meeting_room_id, participants_json, reminder_minutes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 30, ?, ?)`)
    .run('evt_2', 'ws_core', 'Design Systems Critique', 'Review updated contrast ratios and table densities.', iso(26), iso(27), 'team', 'proj_design', 'mtg_2', '["usr_david","usr_elena"]', 'usr_david', iso(-20));

  db.prepare(`INSERT INTO meetings (id, workspace_id, title, description, scheduled_at, duration_minutes, room_code, join_url, host_id, participants_json, status, notes, created_at) VALUES (?, ?, ?, ?, ?, 45, ?, ?, ?, ?, 'Scheduled', ?, ?)`)
    .run('mtg_1', 'ws_core', 'Q4 Release Readiness Sync', 'Final sign-off on WebSocket rooms, Kanban drag-and-drop, and billing hooks.', iso(2), 'SYN-482-Q4R', '/meetings/SYN-482-Q4R', 'usr_elena', '["usr_elena","usr_marcus","usr_priya","usr_david"]', 'Agenda:\n1. Verify WebSocket reconnection behavior\n2. Assign overdue session token fix\n3. Confirm Friday release window', iso(-24));
  db.prepare(`INSERT INTO meetings (id, workspace_id, title, description, scheduled_at, duration_minutes, room_code, join_url, host_id, participants_json, status, notes, created_at) VALUES (?, ?, ?, ?, ?, 30, ?, ?, ?, ?, 'Scheduled', ?, ?)`)
    .run('mtg_2', 'ws_core', 'Design Systems Critique', 'Audit Kanban card hierarchy and light-mode surface contrast.', iso(26), 'SYN-915-DSC', '/meetings/SYN-915-DSC', 'usr_david', '["usr_david","usr_elena"]', 'Review typography scale and modal focus trapping.', iso(-20));

  // Notifications
  db.prepare(`INSERT INTO notifications (id, workspace_id, user_id, type, title, body, link_view, link_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
    .run('ntf_1', 'ws_core', 'usr_elena', 'task_overdue', 'Task approaching/past deadline', 'Patch stale session token revocation edge case is marked Urgent.', 'tasks', 'tsk_8', iso(-2));
  db.prepare(`INSERT INTO notifications (id, workspace_id, user_id, type, title, body, link_view, link_id, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`)
    .run('ntf_2', 'ws_core', 'usr_elena', 'message_mention', 'New message from Marcus Vance', 'Marcus shared the security audit doc in Direct Messages.', 'messages', 'dm_elena_marcus', iso(-3));

  // Subscription & Payments
  db.prepare(`INSERT INTO subscriptions (id, workspace_id, plan, status, billing_cycle, seat_limit, storage_limit_bytes, stripe_customer_id, current_period_end, updated_at) VALUES (?, ?, 'PRO', 'active', 'monthly', 25, 107374182400, 'cus_synore_demo', ?, ?)`)
    .run('sub_ws_core', 'ws_core', dayIso(24), iso(-100));
  db.prepare(`INSERT INTO subscriptions (id, workspace_id, plan, status, billing_cycle, seat_limit, storage_limit_bytes, current_period_end, updated_at) VALUES (?, ?, 'FREE', 'active', 'monthly', 5, 5368709120, ?, ?)`)
    .run('sub_ws_vg', 'ws_vanguard', dayIso(24), iso(-100));

  db.prepare(`INSERT INTO payments (id, workspace_id, amount_cents, currency, provider, status, invoice_number, created_at) VALUES (?, ?, 4900, 'USD', 'Stripe', 'paid', 'INV-2026-1042', ?)`)
    .run('pay_1', 'ws_core', iso(-240));

  // Audit logs
  db.prepare(`INSERT INTO audit_logs (id, workspace_id, user_id, action, resource_type, resource_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('aud_1', 'ws_core', 'usr_elena', 'workspace.created', 'workspace', 'ws_core', '{"plan":"PRO"}', iso(-200));
  db.prepare(`INSERT INTO audit_logs (id, workspace_id, user_id, action, resource_type, resource_id, details_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('aud_2', 'ws_core', 'usr_marcus', 'channel.created', 'channel', 'ch_architecture', '{"isPrivate":true}', iso(-170));
}
