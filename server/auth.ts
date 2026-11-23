import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';
import type { WorkspaceRole } from '../src/types/synore.ts';

const TOKEN_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export const ROLE_DEFAULT_PERMISSIONS: Record<WorkspaceRole, Record<string, boolean>> = {
  Owner: {
    manageSettings: true,
    manageMembers: true,
    createProjects: true,
    manageChannels: true,
    accessDocuments: true,
    editDocuments: true,
    shareFiles: true,
    manageBilling: true,
    deleteResources: true,
  },
  Administrator: {
    manageSettings: true,
    manageMembers: true,
    createProjects: true,
    manageChannels: true,
    accessDocuments: true,
    editDocuments: true,
    shareFiles: true,
    manageBilling: false,
    deleteResources: true,
  },
  Manager: {
    manageSettings: false,
    manageMembers: true,
    createProjects: true,
    manageChannels: true,
    accessDocuments: true,
    editDocuments: true,
    shareFiles: true,
    manageBilling: false,
    deleteResources: false,
  },
  Member: {
    manageSettings: false,
    manageMembers: false,
    createProjects: true,
    manageChannels: false,
    accessDocuments: true,
    editDocuments: true,
    shareFiles: true,
    manageBilling: false,
    deleteResources: false,
  },
  Guest: {
    manageSettings: false,
    manageMembers: false,
    createProjects: false,
    manageChannels: false,
    accessDocuments: true,
    editDocuments: false,
    shareFiles: false,
    manageBilling: false,
    deleteResources: false,
  },
};

export function resolvePermissions(role: WorkspaceRole, customJson?: string): Record<string, boolean> {
  const base = { ...(ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS.Member) };
  if (customJson) {
    try {
      const overrides = JSON.parse(customJson);
      if (overrides && typeof overrides === 'object') {
        for (const [k, v] of Object.entries(overrides)) {
          if (typeof v === 'boolean' && k in base) {
            base[k] = v;
          }
        }
      }
    } catch {
      // ignore invalid json
    }
  }
  return base;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signToken(payload: { sub: string; email: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): { sub: string; email: string; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${body}`).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!decoded.sub || !decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string;
    title: string;
    department: string;
  };
  membership?: {
    id: string;
    workspaceId: string;
    role: WorkspaceRole;
    permissions: Record<string, boolean>;
  };
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }
  const userRow = db
    .prepare('SELECT id, email, full_name, avatar_url, title, department FROM users WHERE id = ?')
    .get(decoded.sub) as
    | { id: string; email: string; full_name: string; avatar_url: string; title: string; department: string }
    | undefined;
  if (!userRow) {
    return res.status(401).json({ error: 'User account not found' });
  }
  req.user = {
    id: userRow.id,
    email: userRow.email,
    fullName: userRow.full_name,
    avatarUrl: userRow.avatar_url,
    title: userRow.title,
    department: userRow.department,
  };
  next();
}

export function requireWorkspaceMember(requiredPermission?: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const workspaceId = req.params.id || req.params.workspaceId;
    if (!req.user || !workspaceId) {
      return res.status(401).json({ error: 'Workspace authentication required' });
    }
    const row = db
      .prepare('SELECT id, workspace_id, role, permissions_json FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?')
      .get(workspaceId, req.user.id) as
      | { id: string; workspace_id: string; role: WorkspaceRole; permissions_json: string }
      | undefined;

    if (!row) {
      return res.status(403).json({ error: 'You do not have access to this workspace' });
    }

    const permissions = resolvePermissions(row.role, row.permissions_json);
    if (requiredPermission && !permissions[requiredPermission]) {
      return res.status(403).json({
        error: `Permission denied: your role (${row.role}) does not allow "${requiredPermission}".`,
      });
    }

    req.membership = {
      id: row.id,
      workspaceId: row.workspace_id,
      role: row.role,
      permissions,
    };
    next();
  };
}

const rateLimits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const record = rateLimits.get(key);
    if (!record || record.resetAt < now) {
      rateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (record.count >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests. Please slow down and try again.' });
    }
    record.count += 1;
    next();
  };
}

export function logAudit(
  workspaceId: string,
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  details: Record<string, unknown> = {},
  ip = '127.0.0.1'
) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, workspace_id, user_id, action, resource_type, resource_id, details_json, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `aud_${crypto.randomUUID().slice(0, 12)}`,
      workspaceId,
      userId,
      action,
      resourceType,
      resourceId,
      JSON.stringify(details),
      ip,
      new Date().toISOString()
    );
  } catch {
    // audit log failure should not crash request
  }
}
