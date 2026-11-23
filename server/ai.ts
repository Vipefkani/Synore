import { GoogleGenAI } from '@google/genai';
import { db } from './db.ts';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export type AiMode =
  | 'ask_workspace'
  | 'summarize_channel'
  | 'summarize_project'
  | 'draft_document'
  | 'extract_actions'
  | 'overdue_brief'
  | 'project_report';

export async function runSynoraAi(params: {
  workspaceId: string;
  mode: AiMode;
  prompt?: string;
  targetId?: string;
  notes?: string;
}): Promise<{ text: string }> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }

  const workspace = db
    .prepare('SELECT name, type FROM workspaces WHERE id = ?')
    .get(params.workspaceId) as { name: string; type: string } | undefined;

  const projects = db
    .prepare('SELECT id, name, status, priority, deadline, progress, description FROM projects WHERE workspace_id = ?')
    .all(params.workspaceId) as Array<Record<string, unknown>>;

  const tasks = db
    .prepare(`
      SELECT t.id, t.title, t.status, t.priority, t.due_date, u.full_name as assignee_name, p.name as project_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_id
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.workspace_id = ?
      ORDER BY t.updated_at DESC LIMIT 40
    `)
    .all(params.workspaceId) as Array<Record<string, unknown>>;

  const docs = db
    .prepare('SELECT id, title, content FROM documents WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 12')
    .all(params.workspaceId) as Array<{ id: string; title: string; content: string }>;

  let focusedContext = '';
  if (params.mode === 'summarize_channel' && params.targetId) {
    const msgs = db
      .prepare(`
        SELECT m.content, u.full_name as sender, m.created_at
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        WHERE m.workspace_id = ? AND m.channel_id = ? AND m.is_deleted = 0
        ORDER BY m.created_at DESC LIMIT 30
      `)
      .all(params.workspaceId, params.targetId) as Array<Record<string, unknown>>;
    focusedContext = `Channel Messages (newest first):\n${JSON.stringify(msgs, null, 2)}`;
  } else if ((params.mode === 'summarize_project' || params.mode === 'project_report') && params.targetId) {
    const proj = projects.find((p) => p.id === params.targetId);
    const projTasks = tasks.filter((t) => t.project_name === proj?.name);
    focusedContext = `Target Project:\n${JSON.stringify(proj, null, 2)}\nProject Tasks:\n${JSON.stringify(projTasks, null, 2)}`;
  } else if (params.mode === 'extract_actions') {
    focusedContext = `Meeting Notes:\n${params.notes || params.prompt || ''}`;
  } else if (params.mode === 'overdue_brief') {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = tasks.filter((t) => t.due_date && String(t.due_date) < today && t.status !== 'Done');
    focusedContext = `Today: ${today}\nOverdue Tasks:\n${JSON.stringify(overdue, null, 2)}`;
  }

  const systemInstruction = `You are Synora AI, the built-in intelligence layer for the "${workspace?.name || 'Synore'}" workspace (${workspace?.type || 'SaaS'}).
Be concise, executive-ready, accurate, and grounded strictly in the provided workspace context. Never invent tasks, dates, or people not present in the context. Format cleanly with headings and bullet points.`;

  const userContent = [
    `Mode: ${params.mode}`,
    params.prompt ? `User Request: ${params.prompt}` : '',
    focusedContext,
    `Workspace Projects Summary:\n${JSON.stringify(projects.slice(0, 10))}`,
    `Workspace Tasks Snapshot:\n${JSON.stringify(tasks.slice(0, 25))}`,
    `Knowledge Base Titles:\n${docs.map((d) => `- ${d.title}: ${d.content.replace(/<[^>]+>/g, ' ').slice(0, 260)}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: userContent,
    config: {
      systemInstruction,
    },
  });

  return { text: response.text || 'No response generated.' };
}
