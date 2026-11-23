# Synore — Connected Multi-Tenant Team Workspace SaaS

Synore unifies real-time team communication, Kanban project delivery, task management, collaborative documents & knowledge base, file storage, calendar & meeting rooms, workspace analytics, RBAC governance, billing, and Synora AI into a single connected platform.

## Architecture Overview

- **Live Runtime (Port 3000)**:
  - **Frontend**: React 19, TypeScript, Tailwind CSS v4 (dark & light mode), Lucide icons
  - **Backend**: Node.js + Express REST API (`/api/*`) + WebSocket server (`/ws` via `ws`)
  - **Database**: Normalized relational SQLite (`data/synore.db`) with WAL mode, foreign keys, indexes, and multi-tenant `workspace_id` isolation
  - **AI Assistant (Synora AI)**: Server-side `@google/genai` (`gemini-4-hydrogen`) grounded in live workspace records
  - **Storage**: Multipart file upload/download with path confinement in `uploads/`
- **Django / PostgreSQL / Channels Reference (`/backend/`)**:
  - Includes reference Django ORM models, RBAC permission classes, Django Channels WebSocket consumers (`ChatConsumer`, `KanbanConsumer`), and Docker Compose setup (`PostgreSQL`, `Redis`, `Daphne/ASGI`, `Celery`).

## Core Modules

1. **Authentication & 7-Step Onboarding**: Sign up, sign in, email verification, password reset, and guided multi-workspace onboarding.
2. **Real-Time Communication (Messages & Channels)**: 1:1 & group DMs, public/private/announcement channels, threads, reactions, pins, edits, file attachments, typing indicators, and live presence.
3. **Projects & Kanban Board**: Drag-and-drop Kanban columns with real-time WebSocket delta sync across clients, plus List, Calendar, and Timeline views.
4. **Tasks**: My Tasks, Assigned by Me, Upcoming, Overdue, Completed, subtasks, and comments.
5. **Documents & Knowledge Base**: Collections, nested pages, rich HTML formatting toolbar, autosave, version history restore, and AI drafting.
6. **File Management**: Folder tree, upload/download, inline preview, access permissions, and storage quota meter.
7. **Calendar & Meeting Rooms**: Month/Week/Day views, meeting rooms with shareable codes, notes, and AI action extraction.
8. **Team, Departments & RBAC**: Owner, Administrator, Manager, Member, and Guest roles with per-member permission matrix overrides enforced server-side.
9. **Analytics, Audit Logs & Billing**: Live metrics, audit trail, and FREE / PRO / BUSINESS plans with Stripe & M-Pesa gateway support.

## Environment Variables

See `.env.example`:
- `GEMINI_API_KEY` — Required for Synora AI server-side calls.
- `APP_URL` — Public application URL.
- `STRIPE_SECRET_KEY`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET` — Optional payment gateway credentials.

## Running Locally

```bash
npm install
npm run dev
```

Demo accounts (password `SynoreDemo!2026`):
- `elena@synore.io` (Owner)
- `marcus@synore.io` (Administrator)
- `priya@synore.io` (Manager)
- `david@synore.io` (Member)
