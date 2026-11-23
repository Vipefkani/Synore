import React, { useEffect, useState } from 'react';
import {
  Calendar as CalIcon,
  Copy,
  Mic,
  MicOff,
  Plus,
  Sparkles,
  Trash2,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import { UserAvatar } from '../SynoreLogo';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { CalendarEvent, Meeting, Project } from '../../types/synore';

export function CalendarAndMeetingsModule({ mode }: { mode: 'calendar' | 'meetings' }) {
  const { activeWorkspace, members, apiFetch, notify } = useWorkspace();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [calView, setCalView] = useState<'month' | 'week' | 'day'>('month');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  // Modals
  const [newEventOpen, setNewEventOpen] = useState(false);
  const [evTitle, setEvTitle] = useState('');
  const [evType, setEvType] = useState<'meeting' | 'deadline' | 'team' | 'reminder'>('meeting');
  const [evStart, setEvStart] = useState(new Date(Date.now() + 3600_000).toISOString().slice(0, 16));
  const [evEnd, setEvEnd] = useState(new Date(Date.now() + 7200_000).toISOString().slice(0, 16));

  const [newMeetingOpen, setNewMeetingOpen] = useState(false);
  const [mtgTitle, setMtgTitle] = useState('');
  const [mtgDesc, setMtgDesc] = useState('');
  const [mtgAt, setMtgAt] = useState(new Date(Date.now() + 3600_000).toISOString().slice(0, 16));
  const [mtgDur, setMtgDur] = useState(45);

  // Active meeting room stage
  const [activeRoom, setActiveRoom] = useState<Meeting | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [roomNotes, setRoomNotes] = useState('');
  const [aiActions, setAiActions] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  const loadAll = async () => {
    if (!activeWorkspace) return;
    const [eRes, mRes, pRes] = await Promise.all([
      apiFetch<{ events: CalendarEvent[] }>(`/api/workspaces/${activeWorkspace.id}/events`),
      apiFetch<{ meetings: Meeting[] }>(`/api/workspaces/${activeWorkspace.id}/meetings`),
      apiFetch<{ projects: Project[] }>(`/api/workspaces/${activeWorkspace.id}/projects`),
    ]);
    setEvents(eRes.events);
    setMeetings(mRes.meetings);
    setProjects(pRes.projects);
  };

  useEffect(() => {
    setActiveRoom(null);
    loadAll().catch(() => {});
  }, [activeWorkspace?.id]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !evTitle.trim()) return;
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/events`, {
        method: 'POST',
        body: JSON.stringify({
          title: evTitle,
          eventType: evType,
          startTime: new Date(evStart).toISOString(),
          endTime: new Date(evEnd).toISOString(),
        }),
      });
      await loadAll();
      setNewEventOpen(false);
      setEvTitle('');
      notify('success', 'Calendar event scheduled');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to create event');
    }
  };

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !mtgTitle.trim()) return;
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/meetings`, {
        method: 'POST',
        body: JSON.stringify({
          title: mtgTitle,
          description: mtgDesc,
          scheduledAt: new Date(mtgAt).toISOString(),
          durationMinutes: mtgDur,
          participants: members.map((m) => m.userId),
        }),
      });
      await loadAll();
      setNewMeetingOpen(false);
      setMtgTitle('');
      setMtgDesc('');
      notify('success', 'Meeting room created & invites sent');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to schedule meeting');
    }
  };

  const handleExtractActions = async () => {
    if (!activeWorkspace || !roomNotes.trim()) return;
    setExtracting(true);
    try {
      const res = await apiFetch<{ text: string }>(`/api/workspaces/${activeWorkspace.id}/ai`, {
        method: 'POST',
        body: JSON.stringify({
          mode: 'extract_actions',
          notes: roomNotes,
          prompt: 'Extract clear action items, owners, and suggested deadlines from these meeting notes.',
        }),
      });
      setAiActions(res.text);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'AI extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  // Build current month days
  const baseDate = new Date(selectedDate + 'T00:00:00');
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarCells: Array<{ day: number | null; iso: string }> = [];
  for (let i = 0; i < firstDayOfMonth; i++) calendarCells.push({ day: null, iso: '' });
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({ day: d, iso });
  }

  if (mode === 'meetings') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="font-display text-xl font-bold">Meeting Rooms</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Scheduled rooms, shareable join codes, live agendas, and WebRTC-ready staging.
            </p>
          </div>
          {activeWorkspace?.role !== 'Guest' && (
            <button
              type="button"
              onClick={() => setNewMeetingOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Schedule Meeting
            </button>
          )}
        </div>

        {activeRoom ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{activeRoom.title}</div>
                <div className="text-[11px] font-mono text-slate-500">
                  Room {activeRoom.roomCode} · Host: {activeRoom.hostName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveRoom(null)}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold"
              >
                Leave Room
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3">
              {/* Stage */}
              <div className="lg:col-span-2 p-6 bg-slate-950 text-white flex flex-col justify-between min-h-[380px]">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {members.slice(0, 4).map((m) => (
                    <div
                      key={m.id}
                      className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center gap-2.5 aspect-video"
                    >
                      <UserAvatar name={m.fullName} avatarUrl={m.avatarUrl} size="lg" />
                      <div className="text-xs font-medium truncate max-w-full">{m.fullName}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-3 pt-6">
                  <button
                    type="button"
                    onClick={() => setMicOn((v) => !v)}
                    className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
                      micOn ? 'bg-slate-800 text-white' : 'bg-red-600 text-white'
                    }`}
                  >
                    {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    {micOn ? 'Mic Ready' : 'Muted'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCamOn((v) => !v)}
                    className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 ${
                      camOn ? 'bg-slate-800 text-white' : 'bg-red-600 text-white'
                    }`}
                  >
                    {camOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                    {camOn ? 'Camera Ready' : 'Camera Off'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(`${window.location.origin}${activeRoom.joinUrl}`);
                      notify('success', 'Meeting invite link copied');
                    }}
                    className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-medium flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" /> Copy Invite Link
                  </button>
                </div>
              </div>

              {/* Shared Meeting Notes & AI Action Extraction */}
              <div className="p-5 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 flex flex-col gap-3">
                <div className="text-xs font-semibold">Collaborative Meeting Notes</div>
                <textarea
                  rows={8}
                  value={roomNotes}
                  onChange={(e) => setRoomNotes(e.target.value)}
                  onBlur={async () => {
                    await apiFetch(`/api/workspaces/${activeWorkspace!.id}/meetings/${activeRoom.id}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ notes: roomNotes }),
                    });
                  }}
                  placeholder="Capture decisions and action items..."
                  className="w-full p-3 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs"
                />
                <button
                  type="button"
                  onClick={handleExtractActions}
                  disabled={extracting || !roomNotes.trim()}
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" /> {extracting ? 'Extracting...' : 'Extract Action Items (AI)'}
                </button>
                {aiActions && (
                  <div className="p-3 rounded-lg bg-blue-600/5 border border-blue-500/30 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {aiActions}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {meetings.map((m) => (
              <div
                key={m.id}
                className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                    <span>{m.roomCode}</span>
                    <span className="tabular-nums">
                      {new Date(m.scheduledAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {m.durationMinutes}m
                    </span>
                  </div>
                  <h3 className="font-display text-base font-bold mt-1.5">{m.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{m.description}</p>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> {m.participants.length} invited
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(`${window.location.origin}${m.joinUrl}`);
                        notify('success', 'Invite URL copied');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
                    >
                      Copy Link
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveRoom(m);
                        setRoomNotes(m.notes || '');
                        setAiActions(null);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                    >
                      Enter Room
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {newMeetingOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <form
              onSubmit={handleCreateMeeting}
              className="w-full max-w-md bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold">Schedule Meeting Room</h3>
                <button type="button" onClick={() => setNewMeetingOpen(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                required
                value={mtgTitle}
                onChange={(e) => setMtgTitle(e.target.value)}
                placeholder="Meeting title..."
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
              <textarea
                rows={2}
                value={mtgDesc}
                onChange={(e) => setMtgDesc(e.target.value)}
                placeholder="Agenda or description..."
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="datetime-local"
                  value={mtgAt}
                  onChange={(e) => setMtgAt(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
                <input
                  type="number"
                  min={15}
                  max={240}
                  value={mtgDur}
                  onChange={(e) => setMtgDur(Number(e.target.value))}
                  className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs font-mono"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewMeetingOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                  Create Room
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // CALENDAR VIEW
  const eventsForDay = (iso: string) => {
    const evs = events.filter((e) => e.startTime.slice(0, 10) === iso);
    const dead = projects
      .filter((p) => p.deadline === iso)
      .map((p) => ({ id: p.id, title: `Deadline: ${p.name}`, type: 'deadline' as const }));
    return [...evs.map((e) => ({ id: e.id, title: e.title, type: e.eventType })), ...dead];
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl font-bold">
            {baseDate.toLocaleDateString([], { month: 'long', year: 'numeric' })}
          </h1>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 text-xs font-mono"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-lg bg-slate-200/70 dark:bg-[#13161F] border border-slate-200 dark:border-slate-800">
            {(['month', 'week', 'day'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setCalView(v)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize ${
                  calView === v ? 'bg-white dark:bg-[#1F2536] text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {activeWorkspace?.role !== 'Guest' && (
            <button
              type="button"
              onClick={() => setNewEventOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> New Event
            </button>
          )}
        </div>
      </div>

      {calView === 'month' ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 text-center text-[11px] font-semibold text-slate-500 py-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 dark:divide-slate-800">
            {calendarCells.map((cell, i) => {
              const items = cell.iso ? eventsForDay(cell.iso) : [];
              return (
                <div
                  key={i}
                  onClick={() => cell.iso && setSelectedDate(cell.iso)}
                  className={`min-h-[96px] p-2 text-xs cursor-pointer ${
                    cell.iso === selectedDate ? 'bg-blue-600/5' : ''
                  }`}
                >
                  {cell.day && (
                    <div className="font-mono tabular-nums text-[11px] text-slate-500 mb-1">{cell.day}</div>
                  )}
                  <div className="space-y-1">
                    {items.slice(0, 3).map((it) => (
                      <div
                        key={it.id}
                        className={`px-1.5 py-0.5 rounded text-[11px] truncate ${
                          it.type === 'deadline'
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-blue-600/15 text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {it.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] p-5 space-y-3">
          <div className="text-xs font-semibold">
            {calView === 'day' ? `Events on ${selectedDate}` : 'Upcoming Scheduled Events & Deadlines'}
          </div>
          {events
            .filter((e) => (calView === 'day' ? e.startTime.slice(0, 10) === selectedDate : true))
            .map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800"
              >
                <div>
                  <div className="text-sm font-semibold">{ev.title}</div>
                  <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                    {new Date(ev.startTime).toLocaleString()} · {ev.eventType} · Reminder {ev.reminderMinutes}m
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/workspaces/${activeWorkspace!.id}/events/${ev.id}`, { method: 'DELETE' });
                    loadAll();
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          {events.length === 0 && <p className="text-xs text-slate-500">No events scheduled.</p>}
        </div>
      )}

      {newEventOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateEvent}
            className="w-full max-w-md bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">New Calendar Event</h3>
              <button type="button" onClick={() => setNewEventOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              required
              value={evTitle}
              onChange={(e) => setEvTitle(e.target.value)}
              placeholder="Event title..."
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
            />
            <select
              value={evType}
              onChange={(e) => setEvType(e.target.value as 'meeting' | 'deadline' | 'team' | 'reminder')}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
            >
              <option value="meeting">Meeting</option>
              <option value="team">Team Event</option>
              <option value="deadline">Milestone Deadline</option>
              <option value="reminder">Reminder</option>
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="datetime-local"
                value={evStart}
                onChange={(e) => setEvStart(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs font-mono"
              />
              <input
                type="datetime-local"
                value={evEnd}
                onChange={(e) => setEvEnd(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewEventOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                Save Event
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
