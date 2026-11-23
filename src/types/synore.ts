export type WorkspaceRole = 'Owner' | 'Administrator' | 'Manager' | 'Member' | 'Guest';

export type TaskStatus = 'Backlog' | 'To Do' | 'In Progress' | 'Review' | 'Done';
export type TaskPriority = 'Low' | 'Medium' | 'High' | 'Urgent';
export type ProjectStatus = 'Planning' | 'Active' | 'At Risk' | 'Completed';
export type BillingPlan = 'FREE' | 'PRO' | 'BUSINESS';

export interface User {
  id: string;
  email: string;
  fullName: string;
  title: string;
  department: string;
  avatarUrl: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  type: string;
  logoColor: string;
  ownerId: string;
  plan: BillingPlan;
  storageQuotaBytes: number;
  billingEmail: string;
  role: WorkspaceRole;
  permissions: Record<string, boolean>;
  createdAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  fullName: string;
  email: string;
  title: string;
  department: string;
  departmentId: string | null;
  avatarUrl: string;
  status: string;
  role: WorkspaceRole;
  permissions: Record<string, boolean>;
  joinedAt: string;
}

export interface Department {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  leadId: string | null;
  memberCount: number;
  createdAt: string;
}

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  isPrivate: boolean;
  isAnnouncement: boolean;
  createdBy: string;
  memberCount: number;
  unreadCount?: number;
  createdAt: string;
}

export interface DirectThread {
  id: string;
  workspaceId: string;
  name: string;
  isGroup: boolean;
  participants: Array<{
    userId: string;
    fullName: string;
    avatarUrl: string;
    title: string;
  }>;
  lastMessage?: string;
  lastMessageAt?: string;
  createdAt: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ChatMessage {
  id: string;
  workspaceId: string;
  channelId: string | null;
  threadId: string | null;
  parentMessageId: string | null;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderTitle: string;
  content: string;
  attachments: Array<{ id: string; name: string; sizeBytes: number; mimeType: string; url: string }>;
  isPinned: boolean;
  isEdited: boolean;
  isDeleted: boolean;
  readBy: string[];
  reactions: MessageReaction[];
  replyCount: number;
  replyPreview?: { senderName: string; content: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: TaskPriority;
  ownerId: string;
  ownerName: string;
  deadline: string;
  progress: number;
  color: string;
  columns: string[];
  memberIds: string[];
  taskCounts: {
    total: number;
    done: number;
  };
  createdAt: string;
}

export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  isCompleted: boolean;
  position: number;
}

export interface Task {
  id: string;
  workspaceId: string;
  projectId: string;
  projectName?: string;
  title: string;
  description: string;
  status: string;
  priority: TaskPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  creatorId: string;
  creatorName: string;
  startDate: string | null;
  dueDate: string | null;
  labels: string[];
  position: number;
  subtasks: Subtask[];
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  workspaceId: string;
  entityType: 'task' | 'project' | 'document';
  entityId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  content: string;
  createdAt: string;
}

export interface DocumentCollection {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface WorkspaceDocument {
  id: string;
  workspaceId: string;
  collectionId: string | null;
  parentDocId: string | null;
  title: string;
  content: string;
  isPinned: boolean;
  authorId: string;
  authorName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  title: string;
  content: string;
  editedByName: string;
  createdAt: string;
}

export interface Folder {
  id: string;
  workspaceId: string;
  parentId: string | null;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface WorkspaceFile {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedByName: string;
  version: number;
  isShared: boolean;
  permissionsLevel: 'workspace' | 'managers' | 'private';
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  eventType: 'meeting' | 'deadline' | 'team' | 'reminder';
  projectId: string | null;
  meetingRoomId: string | null;
  participants: string[];
  reminderMinutes: number;
  createdBy: string;
  createdAt: string;
}

export interface Meeting {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  scheduledAt: string;
  durationMinutes: number;
  roomCode: string;
  joinUrl: string;
  hostId: string;
  hostName: string;
  participants: string[];
  status: 'Scheduled' | 'Live' | 'Ended';
  notes: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  linkView: string;
  linkId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogItem {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: string;
  createdAt: string;
}
