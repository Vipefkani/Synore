import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { verifyToken } from './auth.ts';
import { db } from './db.ts';

interface ClientMeta {
  ws: WebSocket;
  userId: string;
  fullName: string;
  workspaceIds: Set<string>;
  activeRoom: string | null;
}

const clients = new Map<WebSocket, ClientMeta>();
const onlineUsersByWorkspace = new Map<string, Set<string>>();

export function getOnlineUserIds(workspaceId: string): string[] {
  return Array.from(onlineUsersByWorkspace.get(workspaceId) || []);
}

export function broadcastToWorkspace(workspaceId: string, event: string, payload: unknown, excludeUserId?: string) {
  const message = JSON.stringify({ event, workspaceId, payload, timestamp: new Date().toISOString() });
  for (const meta of clients.values()) {
    if (meta.workspaceIds.has(workspaceId) && meta.ws.readyState === WebSocket.OPEN) {
      if (excludeUserId && meta.userId === excludeUserId) continue;
      meta.ws.send(message);
    }
  }
}

export function sendToUserInWorkspace(workspaceId: string, userId: string, event: string, payload: unknown) {
  const message = JSON.stringify({ event, workspaceId, payload, timestamp: new Date().toISOString() });
  for (const meta of clients.values()) {
    if (meta.userId === userId && meta.workspaceIds.has(workspaceId) && meta.ws.readyState === WebSocket.OPEN) {
      meta.ws.send(message);
    }
  }
}

function syncWorkspacePresence(workspaceId: string) {
  const active = new Set<string>();
  for (const meta of clients.values()) {
    if (meta.workspaceIds.has(workspaceId) && meta.ws.readyState === WebSocket.OPEN) {
      active.add(meta.userId);
    }
  }
  onlineUsersByWorkspace.set(workspaceId, active);
  broadcastToWorkspace(workspaceId, 'presence:update', {
    onlineUserIds: Array.from(active),
  });
}

export function attachWebSocketServer(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname !== '/ws') {
      return; // Let Vite HMR or other upgrade handlers pass if any
    }
    const token = url.searchParams.get('token') || '';
    const decoded = verifyToken(token);
    if (!decoded) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, decoded.sub);
    });
  });

  wss.on('connection', (ws: WebSocket, userId: string) => {
    const userRow = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(userId) as
      | { id: string; full_name: string }
      | undefined;
    if (!userRow) {
      ws.close();
      return;
    }

    const memberships = db
      .prepare('SELECT workspace_id FROM workspace_memberships WHERE user_id = ?')
      .all(userId) as Array<{ workspace_id: string }>;

    const workspaceIds = new Set(memberships.map((m) => m.workspace_id));
    const meta: ClientMeta = {
      ws,
      userId,
      fullName: userRow.full_name,
      workspaceIds,
      activeRoom: null,
    };
    clients.set(ws, meta);

    for (const wsId of workspaceIds) {
      syncWorkspacePresence(wsId);
    }

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (!data || typeof data !== 'object') return;

        if (data.type === 'workspace:join' && typeof data.workspaceId === 'string') {
          const isMember = db
            .prepare('SELECT 1 FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?')
            .get(data.workspaceId, userId);
          if (isMember) {
            meta.workspaceIds.add(data.workspaceId);
            syncWorkspacePresence(data.workspaceId);
          }
        }

        if (data.type === 'room:join' && typeof data.room === 'string') {
          meta.activeRoom = data.room;
        }

        if ((data.type === 'typing:start' || data.type === 'typing:stop') && typeof data.workspaceId === 'string') {
          if (!meta.workspaceIds.has(data.workspaceId)) return;
          broadcastToWorkspace(
            data.workspaceId,
            data.type,
            {
              userId: meta.userId,
              userName: meta.fullName,
              channelId: data.channelId || null,
              threadId: data.threadId || null,
            },
            meta.userId
          );
        }
      } catch {
        // Ignore malformed client WS messages
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      for (const wsId of meta.workspaceIds) {
        syncWorkspacePresence(wsId);
      }
    });
  });

  return wss;
}
