import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Edit3,
  Hash,
  Lock,
  Megaphone,
  MessageSquare,
  Paperclip,
  Pin,
  Plus,
  Reply,
  Search,
  Send,
  Smile,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { UserAvatar } from '../SynoreLogo';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { Channel, ChatMessage, DirectThread, WorkspaceFile } from '../../types/synore';

const QUICK_EMOJIS = ['👍', '🚀', '✅', '👀', '🎯', '💡'];

export function CommunicationModule({ initialMode }: { initialMode: 'messages' | 'channels' }) {
  const { user, activeWorkspace, members, onlineUserIds, focusedEntityId, apiFetch, sendWs, subscribeWs, notify } =
    useWorkspace();

  const [channels, setChannels] = useState<Channel[]>([]);
  const [threads, setThreads] = useState<DirectThread[]>([]);
  const [selectedKind, setSelectedKind] = useState<'channel' | 'thread'>(
    initialMode === 'channels' ? 'channel' : 'thread'
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [composerText, setComposerText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [threadParent, setThreadParent] = useState<ChatMessage | null>(null);
  const [threadReplies, setThreadReplies] = useState<ChatMessage[]>([]);
  const [threadComposer, setThreadComposer] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null);

  // Modals
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [newChName, setNewChName] = useState('');
  const [newChDesc, setNewChDesc] = useState('');
  const [newChPrivate, setNewChPrivate] = useState(false);
  const [newChAnnounce, setNewChAnnounce] = useState(false);

  const [createDmOpen, setCreateDmOpen] = useState(false);
  const [dmSelectedUsers, setDmSelectedUsers] = useState<string[]>([]);
  const [dmGroupName, setDmGroupName] = useState('');

  // File attachment
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ id: string; name: string; sizeBytes: number; mimeType: string; url: string }>
  >([]);

  // AI summary
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadChannelsAndThreads = async () => {
    if (!activeWorkspace) return;
    const [chRes, dmRes] = await Promise.all([
      apiFetch<{ channels: Channel[] }>(`/api/workspaces/${activeWorkspace.id}/channels`),
      apiFetch<{ threads: DirectThread[] }>(`/api/workspaces/${activeWorkspace.id}/dm-threads`),
    ]);
    setChannels(chRes.channels);
    setThreads(dmRes.threads);

    if (focusedEntityId) {
      if (chRes.channels.some((c) => c.id === focusedEntityId)) {
        setSelectedKind('channel');
        setSelectedId(focusedEntityId);
        return;
      }
      if (dmRes.threads.some((t) => t.id === focusedEntityId)) {
        setSelectedKind('thread');
        setSelectedId(focusedEntityId);
        return;
      }
    }

    if (!selectedId) {
      if (initialMode === 'channels' && chRes.channels.length > 0) {
        setSelectedKind('channel');
        setSelectedId(chRes.channels[0].id);
      } else if (initialMode === 'messages' && dmRes.threads.length > 0) {
        setSelectedKind('thread');
        setSelectedId(dmRes.threads[0].id);
      } else if (chRes.channels.length > 0) {
        setSelectedKind('channel');
        setSelectedId(chRes.channels[0].id);
      }
    }
  };

  useEffect(() => {
    setSelectedKind(initialMode === 'channels' ? 'channel' : 'thread');
    setSelectedId(null);
    setAiSummary(null);
  }, [initialMode, activeWorkspace?.id]);

  useEffect(() => {
    loadChannelsAndThreads().catch(() => {});
  }, [activeWorkspace?.id, initialMode]);

  const loadMessages = async () => {
    if (!activeWorkspace || !selectedId) return;
    setLoadingMessages(true);
    try {
      const param = selectedKind === 'channel' ? `channelId=${selectedId}` : `threadId=${selectedId}`;
      const res = await apiFetch<{ messages: ChatMessage[] }>(
        `/api/workspaces/${activeWorkspace.id}/messages?${param}`
      );
      setMessages(res.messages);
    } catch {
      // ignore
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    loadMessages();
    setThreadParent(null);
    setAiSummary(null);
  }, [selectedId, selectedKind, activeWorkspace?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Real-time WebSocket subscription
  useEffect(() => {
    return subscribeWs((wsMsg) => {
      if (wsMsg.workspaceId !== activeWorkspace?.id) return;

      if (wsMsg.event === 'channel:created') {
        const ch = wsMsg.payload as Channel;
        setChannels((prev) => (prev.some((c) => c.id === ch.id) ? prev : [...prev, ch]));
      }

      if (wsMsg.event === 'message:created') {
        const m = wsMsg.payload as ChatMessage;
        const matchesRoom =
          (selectedKind === 'channel' && m.channelId === selectedId) ||
          (selectedKind === 'thread' && m.threadId === selectedId);
        if (matchesRoom && !m.parentMessageId) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
        if (threadParent && m.parentMessageId === threadParent.id) {
          setThreadReplies((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
      }

      if (wsMsg.event === 'message:updated') {
        const m = wsMsg.payload as ChatMessage;
        setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        setThreadReplies((prev) => prev.map((x) => (x.id === m.id ? m : x)));
      }

      if (wsMsg.event === 'message:deleted') {
        const { id } = wsMsg.payload as { id: string };
        setMessages((prev) =>
          prev.map((x) => (x.id === id ? { ...x, isDeleted: true, content: 'This message was deleted.' } : x))
        );
      }

      if (wsMsg.event === 'typing:start' || wsMsg.event === 'typing:stop') {
        const p = wsMsg.payload as { userId: string; userName: string; channelId: string | null; threadId: string | null };
        const sameTarget =
          (selectedKind === 'channel' && p.channelId === selectedId) ||
          (selectedKind === 'thread' && p.threadId === selectedId);
        if (sameTarget && p.userId !== user?.id) {
          setTypingUsers((prev) => {
            const next = { ...prev };
            if (wsMsg.event === 'typing:start') next[p.userId] = p.userName;
            else delete next[p.userId];
            return next;
          });
        }
      }
    });
  }, [activeWorkspace?.id, selectedId, selectedKind, threadParent?.id, user?.id]);

  const handleTyping = (val: string) => {
    setComposerText(val);
    if (!activeWorkspace || !selectedId) return;
    sendWs({
      type: 'typing:start',
      workspaceId: activeWorkspace.id,
      channelId: selectedKind === 'channel' ? selectedId : null,
      threadId: selectedKind === 'thread' ? selectedId : null,
    });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendWs({
        type: 'typing:stop',
        workspaceId: activeWorkspace.id,
        channelId: selectedKind === 'channel' ? selectedId : null,
        threadId: selectedKind === 'thread' ? selectedId : null,
      });
    }, 1800);
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspace) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await apiFetch<{ file: WorkspaceFile }>(
        `/api/workspaces/${activeWorkspace.id}/files/upload`,
        { method: 'POST', body: form }
      );
      setPendingAttachments((prev) => [
        ...prev,
        {
          id: res.file.id,
          name: res.file.name,
          sizeBytes: res.file.sizeBytes,
          mimeType: res.file.mimeType,
          url: `/api/workspaces/${activeWorkspace.id}/files/${res.file.id}/download`,
        },
      ]);
      notify('success', `Attached ${res.file.name}`);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'File upload failed');
    }
    e.target.value = '';
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !selectedId || (!composerText.trim() && pendingAttachments.length === 0)) return;
    try {
      const res = await apiFetch<{ message: ChatMessage }>(`/api/workspaces/${activeWorkspace.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          channelId: selectedKind === 'channel' ? selectedId : null,
          threadId: selectedKind === 'thread' ? selectedId : null,
          parentMessageId: replyTo?.id || null,
          content: composerText.trim() || `Shared ${pendingAttachments.length} attachment(s)`,
          attachments: pendingAttachments,
        }),
      });
      if (!replyTo) {
        setMessages((prev) => (prev.some((x) => x.id === res.message.id) ? prev : [...prev, res.message]));
      }
      setComposerText('');
      setReplyTo(null);
      setPendingAttachments([]);
      sendWs({
        type: 'typing:stop',
        workspaceId: activeWorkspace.id,
        channelId: selectedKind === 'channel' ? selectedId : null,
        threadId: selectedKind === 'thread' ? selectedId : null,
      });
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  const handleOpenThread = async (msg: ChatMessage) => {
    if (!activeWorkspace) return;
    setThreadParent(msg);
    const res = await apiFetch<{ messages: ChatMessage[] }>(
      `/api/workspaces/${activeWorkspace.id}/messages?parentMessageId=${msg.id}`
    );
    setThreadReplies(res.messages);
  };

  const handleSendThreadReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !threadParent || !threadComposer.trim()) return;
    const res = await apiFetch<{ message: ChatMessage }>(`/api/workspaces/${activeWorkspace.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        channelId: threadParent.channelId,
        threadId: threadParent.threadId,
        parentMessageId: threadParent.id,
        content: threadComposer.trim(),
      }),
    });
    setThreadReplies((prev) => (prev.some((x) => x.id === res.message.id) ? prev : [...prev, res.message]));
    setThreadComposer('');
  };

  const handleReact = async (msgId: string, emoji: string) => {
    if (!activeWorkspace) return;
    const res = await apiFetch<{ message: ChatMessage }>(
      `/api/workspaces/${activeWorkspace.id}/messages/${msgId}/react`,
      { method: 'POST', body: JSON.stringify({ emoji }) }
    );
    setMessages((prev) => prev.map((m) => (m.id === msgId ? res.message : m)));
    setEmojiPickerFor(null);
  };

  const handleTogglePin = async (msg: ChatMessage) => {
    if (!activeWorkspace) return;
    const res = await apiFetch<{ message: ChatMessage }>(
      `/api/workspaces/${activeWorkspace.id}/messages/${msg.id}`,
      { method: 'PATCH', body: JSON.stringify({ isPinned: !msg.isPinned }) }
    );
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? res.message : m)));
  };

  const handleSaveEdit = async (msgId: string) => {
    if (!activeWorkspace || !editDraft.trim()) return;
    const res = await apiFetch<{ message: ChatMessage }>(
      `/api/workspaces/${activeWorkspace.id}/messages/${msgId}`,
      { method: 'PATCH', body: JSON.stringify({ content: editDraft.trim() }) }
    );
    setMessages((prev) => prev.map((m) => (m.id === msgId ? res.message : m)));
    setEditingMsg(null);
  };

  const handleDeleteMsg = async (msgId: string) => {
    if (!activeWorkspace) return;
    await apiFetch(`/api/workspaces/${activeWorkspace.id}/messages/${msgId}`, { method: 'DELETE' });
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, isDeleted: true, content: 'This message was deleted.' } : m))
    );
  };

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !newChName.trim()) return;
    try {
      const res = await apiFetch<{ channel: Channel }>(`/api/workspaces/${activeWorkspace.id}/channels`, {
        method: 'POST',
        body: JSON.stringify({
          name: newChName,
          description: newChDesc,
          isPrivate: newChPrivate,
          isAnnouncement: newChAnnounce,
        }),
      });
      setChannels((prev) => (prev.some((c) => c.id === res.channel.id) ? prev : [...prev, res.channel]));
      setSelectedKind('channel');
      setSelectedId(res.channel.id);
      setCreateChannelOpen(false);
      setNewChName('');
      setNewChDesc('');
      notify('success', `Channel #${res.channel.name} created`);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to create channel');
    }
  };

  const handleCreateDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || dmSelectedUsers.length === 0) return;
    try {
      const res = await apiFetch<{ threadId: string }>(`/api/workspaces/${activeWorkspace.id}/dm-threads`, {
        method: 'POST',
        body: JSON.stringify({ participantIds: dmSelectedUsers, name: dmGroupName }),
      });
      await loadChannelsAndThreads();
      setSelectedKind('thread');
      setSelectedId(res.threadId);
      setCreateDmOpen(false);
      setDmSelectedUsers([]);
      setDmGroupName('');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to start conversation');
    }
  };

  const handleSummarizeChannel = async () => {
    if (!activeWorkspace || !selectedId || selectedKind !== 'channel') return;
    setAiLoading(true);
    try {
      const res = await apiFetch<{ text: string }>(`/api/workspaces/${activeWorkspace.id}/ai`, {
        method: 'POST',
        body: JSON.stringify({
          mode: 'summarize_channel',
          targetId: selectedId,
          prompt: 'Summarize the key decisions, blockers, and action items from this channel.',
        }),
      });
      setAiSummary(res.text);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to summarize channel');
    } finally {
      setAiLoading(false);
    }
  };

  const activeChannel = selectedKind === 'channel' ? channels.find((c) => c.id === selectedId) : null;
  const activeThread = selectedKind === 'thread' ? threads.find((t) => t.id === selectedId) : null;

  const getThreadDisplay = (t: DirectThread) => {
    if (t.isGroup) return t.name || t.participants.map((p) => p.fullName.split(' ')[0]).join(', ');
    const other = t.participants.find((p) => p.userId !== user?.id) || t.participants[0];
    return other?.fullName || 'Direct Message';
  };

  const filteredMessages = useMemo(() => {
    return messages.filter((m) => {
      if (showPinnedOnly && !m.isPinned) return false;
      if (searchTerm.trim() && !m.content.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [messages, showPinnedOnly, searchTerm]);

  const activeTypers = Object.values(typingUsers);

  return (
    <div className="h-full min-h-[560px] flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] overflow-hidden">
      {/* Left Room List */}
      <div className="w-64 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 bg-slate-50/50 dark:bg-[#0F1219]">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {initialMode === 'channels' ? 'Workspace Channels' : 'Direct Messages'}
          </span>
          {initialMode === 'channels' && activeWorkspace?.permissions.manageChannels && (
            <button
              type="button"
              onClick={() => setCreateChannelOpen(true)}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
              title="Create Channel"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          {initialMode === 'messages' && (
            <button
              type="button"
              onClick={() => setCreateDmOpen(true)}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
              title="New Direct Message"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* Channels Section */}
          <div>
            <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold text-slate-400">
              <span>Channels</span>
              {activeWorkspace?.permissions.manageChannels && (
                <button type="button" onClick={() => setCreateChannelOpen(true)} className="hover:text-blue-500">
                  + New
                </button>
              )}
            </div>
            <div className="space-y-0.5 mt-1">
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    setSelectedKind('channel');
                    setSelectedId(ch.id);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                    selectedKind === 'channel' && selectedId === ch.id
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {ch.isAnnouncement ? (
                      <Megaphone className="w-3.5 h-3.5 shrink-0" />
                    ) : ch.isPrivate ? (
                      <Lock className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Hash className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span className="truncate">{ch.name}</span>
                  </span>
                  <span className="text-[10px] font-mono opacity-75">{ch.memberCount}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Direct Messages Section */}
          <div>
            <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold text-slate-400">
              <span>Direct & Group DMs</span>
              <button type="button" onClick={() => setCreateDmOpen(true)} className="hover:text-blue-500">
                + New
              </button>
            </div>
            <div className="space-y-0.5 mt-1">
              {threads.map((t) => {
                const other = t.participants.find((p) => p.userId !== user?.id) || t.participants[0];
                const isOnline = !t.isGroup && other && onlineUserIds.includes(other.userId);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedKind('thread');
                      setSelectedId(t.id);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
                      selectedKind === 'thread' && selectedId === t.id
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    {t.isGroup ? (
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                        <Users className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <UserAvatar
                        name={other?.fullName || 'User'}
                        avatarUrl={other?.avatarUrl}
                        size="xs"
                        online={isOnline}
                      />
                    )}
                    <span className="truncate text-left flex-1">{getThreadDisplay(t)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Message Stream */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Stream Header */}
        <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-sm text-slate-900 dark:text-white truncate">
                {activeChannel
                  ? `# ${activeChannel.name}`
                  : activeThread
                  ? getThreadDisplay(activeThread)
                  : 'Select a conversation'}
              </span>
              {activeChannel?.isPrivate && (
                <span className="text-[11px] text-slate-500">· Private</span>
              )}
            </div>
            {activeChannel?.description && (
              <p className="text-[11px] text-slate-500 truncate">{activeChannel.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="relative hidden sm:block">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter messages..."
                className="pl-8 pr-3 py-1.5 w-44 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowPinnedOnly((v) => !v)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 ${
                showPinnedOnly
                  ? 'border-blue-500 bg-blue-600/10 text-blue-500'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500'
              }`}
            >
              <Pin className="w-3.5 h-3.5" /> Pinned
            </button>
            {activeChannel && (
              <button
                type="button"
                onClick={handleSummarizeChannel}
                disabled={aiLoading}
                className="px-2.5 py-1.5 rounded-lg border border-blue-500/30 bg-blue-600/10 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5" /> {aiLoading ? 'Summarizing...' : 'Summarize'}
              </button>
            )}
          </div>
        </div>

        {/* AI Summary Banner */}
        {aiSummary && (
          <div className="mx-5 mt-3 p-3.5 rounded-xl border border-blue-500/30 bg-blue-600/5 text-xs relative">
            <button
              type="button"
              onClick={() => setAiSummary(null)}
              className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="font-semibold text-blue-600 dark:text-blue-400 mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Synora AI Channel Briefing
            </div>
            <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed">{aiSummary}</div>
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loadingMessages ? (
            <div className="text-xs text-slate-500 text-center py-8">Loading messages...</div>
          ) : filteredMessages.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No messages here yet</p>
              <p className="text-xs text-slate-500 mt-1">Send the first real-time message below.</p>
            </div>
          ) : (
            filteredMessages.map((m) => {
              const isSenderOnline = onlineUserIds.includes(m.senderId);
              const isOwn = m.senderId === user?.id;
              return (
                <div
                  key={m.id}
                  className={`group flex gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${
                    m.isPinned ? 'bg-amber-500/5 border border-amber-500/20' : ''
                  }`}
                >
                  <UserAvatar name={m.senderName} avatarUrl={m.senderAvatar} size="md" online={isSenderOnline} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {m.senderName}
                        </span>
                        <span className="text-[11px] text-slate-500 truncate hidden sm:inline">
                          {m.senderTitle}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {m.isEdited && !m.isDeleted && (
                          <span className="text-[11px] text-slate-400">(edited)</span>
                        )}
                        {m.isPinned && <span className="text-[11px] text-amber-500 font-medium">Pinned</span>}
                      </div>

                      {!m.isDeleted && (
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setEmojiPickerFor(emojiPickerFor === m.id ? null : m.id)}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
                              title="React"
                            >
                              <Smile className="w-3.5 h-3.5" />
                            </button>
                            {emojiPickerFor === m.id && (
                              <div className="absolute right-0 top-full mt-1 z-30 flex items-center gap-1 p-1.5 rounded-lg bg-white dark:bg-[#1A1F2E] border border-slate-200 dark:border-slate-700 shadow-lg">
                                {QUICK_EMOJIS.map((em) => (
                                  <button
                                    key={em}
                                    type="button"
                                    onClick={() => handleReact(m.id, em)}
                                    className="px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-sm"
                                  >
                                    {em}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenThread(m)}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
                            title="Open thread"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTogglePin(m)}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
                            title="Pin message"
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          {isOwn && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMsg(m);
                                setEditDraft(m.content);
                              }}
                              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
                              title="Edit"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(isOwn || activeWorkspace?.permissions.deleteResources) && (
                            <button
                              type="button"
                              onClick={() => handleDeleteMsg(m.id)}
                              className="p-1 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-500"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {editingMsg?.id === m.id ? (
                      <div className="mt-1.5 flex items-center gap-2">
                        <input
                          type="text"
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#0B0D12] border border-slate-300 dark:border-slate-700 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(m.id)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingMsg(null)}
                          className="px-2 py-1.5 text-xs text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p
                        className={`mt-1 text-sm leading-relaxed ${
                          m.isDeleted ? 'italic text-slate-400' : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {m.content}
                      </p>
                    )}

                    {/* Attachments */}
                    {m.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={att.url}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#0B0D12] text-xs hover:border-blue-500"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                            <span>{att.name}</span>
                            <span className="text-[10px] font-mono text-slate-500">
                              {(att.sizeBytes / 1024).toFixed(1)} KB
                            </span>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Reactions & Thread / Read Receipt Row */}
                    <div className="mt-2 flex items-center flex-wrap gap-2">
                      {m.reactions.map((rx) => (
                        <button
                          key={rx.emoji}
                          type="button"
                          onClick={() => handleReact(m.id, rx.emoji)}
                          className={`px-2 py-0.5 rounded-md border text-xs flex items-center gap-1 ${
                            rx.userIds.includes(user?.id || '')
                              ? 'border-blue-500/40 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <span>{rx.emoji}</span>
                          <span className="font-mono tabular-nums text-[11px]">{rx.count}</span>
                        </button>
                      ))}
                      {m.replyCount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleOpenThread(m)}
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {m.replyCount} {m.replyCount === 1 ? 'reply' : 'replies'}
                        </button>
                      )}
                      {isOwn && (
                        <span className="ml-auto text-[11px] text-slate-400 flex items-center gap-1">
                          {m.readBy.length > 1 ? (
                            <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Typing indicator + Composer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F]">
          {activeTypers.length > 0 && (
            <div className="text-[11px] text-slate-500 mb-1.5 font-medium">
              {activeTypers.join(', ')} {activeTypers.length === 1 ? 'is' : 'are'} typing...
            </div>
          )}

          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingAttachments.map((a) => (
                <div
                  key={a.id}
                  className="px-2.5 py-1 rounded-md bg-blue-600/10 border border-blue-500/30 text-xs flex items-center gap-1.5"
                >
                  <span>{a.name}</span>
                  <button
                    type="button"
                    onClick={() => setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" onChange={handleUploadAttachment} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              title="Attach file"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <input
              type="text"
              value={composerText}
              onChange={(e) => handleTyping(e.target.value)}
              placeholder={
                activeChannel
                  ? `Message #${activeChannel.name}...`
                  : activeThread
                  ? `Message ${getThreadDisplay(activeThread)}...`
                  : 'Write a message...'
              }
              className="flex-1 px-4 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={!composerText.trim() && pendingAttachments.length === 0}
              className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" /> Send
            </button>
          </form>
        </div>
      </div>

      {/* Thread Drawer */}
      {threadParent && (
        <div className="w-80 border-l border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-[#0F1219] shrink-0">
          <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold">Thread</span>
            <button type="button" onClick={() => setThreadParent(null)} className="text-slate-400 hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="text-xs font-semibold">{threadParent.senderName}</div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{threadParent.content}</p>
            </div>
            {threadReplies.map((r) => (
              <div key={r.id} className="flex gap-2.5">
                <UserAvatar name={r.senderName} avatarUrl={r.senderAvatar} size="xs" />
                <div>
                  <div className="text-xs font-semibold">{r.senderName}</div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{r.content}</p>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={handleSendThreadReply} className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
            <input
              type="text"
              value={threadComposer}
              onChange={(e) => setThreadComposer(e.target.value)}
              placeholder="Reply in thread..."
              className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 text-xs"
            />
            <button type="submit" className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
              Reply
            </button>
          </form>
        </div>
      )}

      {/* Create Channel Modal */}
      {createChannelOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateChannel}
            className="w-full max-w-md bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Create Channel</h3>
              <button type="button" onClick={() => setCreateChannelOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Channel Name</label>
              <input
                type="text"
                required
                value={newChName}
                onChange={(e) => setNewChName(e.target.value)}
                placeholder="e.g. product-releases"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Description</label>
              <input
                type="text"
                value={newChDesc}
                onChange={(e) => setNewChDesc(e.target.value)}
                placeholder="What is this channel for?"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={newChPrivate} onChange={(e) => setNewChPrivate(e.target.checked)} />
              Private channel (invite-only)
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={newChAnnounce} onChange={(e) => setNewChAnnounce(e.target.checked)} />
              Announcement channel (only Admins/Managers can post)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateChannelOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                Create Channel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create DM Modal */}
      {createDmOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateDm}
            className="w-full max-w-md bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">New Conversation</h3>
              <button type="button" onClick={() => setCreateDmOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Group Name (optional for 2+ colleagues)</label>
              <input
                type="text"
                value={dmGroupName}
                onChange={(e) => setDmGroupName(e.target.value)}
                placeholder="e.g. Incident Response"
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {members
                .filter((m) => m.userId !== user?.id)
                .map((m) => {
                  const checked = dmSelectedUsers.includes(m.userId);
                  return (
                    <label
                      key={m.userId}
                      className="flex items-center gap-3 p-2 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setDmSelectedUsers((prev) =>
                            checked ? prev.filter((id) => id !== m.userId) : [...prev, m.userId]
                          )
                        }
                      />
                      <UserAvatar name={m.fullName} avatarUrl={m.avatarUrl} size="xs" />
                      <div className="text-xs">
                        <div className="font-medium">{m.fullName}</div>
                        <div className="text-slate-500">{m.title}</div>
                      </div>
                    </label>
                  );
                })}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateDmOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={dmSelectedUsers.length === 0}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold disabled:opacity-50"
              >
                Start Chat
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
