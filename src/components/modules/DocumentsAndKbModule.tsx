import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Code,
  FileText,
  FolderPlus,
  Heading1,
  Heading2,
  History,
  List,
  MessageSquare,
  Pin,
  Plus,
  Search,
  Sparkles,
  Table,
  Trash2,
  X,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { Comment, DocumentCollection, DocumentVersion, WorkspaceDocument } from '../../types/synore';

export function DocumentsAndKbModule({ mode }: { mode: 'documents' | 'knowledge' }) {
  const { activeWorkspace, focusedEntityId, apiFetch, notify } = useWorkspace();
  const [collections, setCollections] = useState<DocumentCollection[]>([]);
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Editor state
  const [titleDraft, setTitleDraft] = useState('');
  const [contentDraft, setContentDraft] = useState('');
  const [saveState, setSaveState] = useState<'Saved' | 'Saving...' | 'Unsaved'>('Saved');
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [colName, setColName] = useState('');
  const [aiDrafting, setAiDrafting] = useState(false);

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDocs = async () => {
    if (!activeWorkspace) return;
    const res = await apiFetch<{ collections: DocumentCollection[]; documents: WorkspaceDocument[] }>(
      `/api/workspaces/${activeWorkspace.id}/documents`
    );
    setCollections(res.collections);
    setDocuments(res.documents);

    const target =
      (focusedEntityId && res.documents.find((d) => d.id === focusedEntityId)) ||
      res.documents[0] ||
      null;
    if (target && !selectedDocId) {
      setSelectedDocId(target.id);
      setTitleDraft(target.title);
      setContentDraft(target.content);
    }
  };

  useEffect(() => {
    setSelectedDocId(null);
    loadDocs().catch(() => {});
  }, [activeWorkspace?.id]);

  const activeDoc = documents.find((d) => d.id === selectedDocId) || null;
  const canEdit = Boolean(activeWorkspace?.permissions.editDocuments);

  const selectDocument = (doc: WorkspaceDocument) => {
    setSelectedDocId(doc.id);
    setTitleDraft(doc.title);
    setContentDraft(doc.content);
    setSaveState('Saved');
    setVersionsOpen(false);
    setCommentsOpen(false);
  };

  const persistDocument = async (docId: string, nextTitle: string, nextContent: string, saveVersion = false) => {
    if (!activeWorkspace || !canEdit) return;
    setSaveState('Saving...');
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/documents/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: nextTitle, content: nextContent, saveVersion }),
      });
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId ? { ...d, title: nextTitle, content: nextContent, updatedAt: new Date().toISOString() } : d
        )
      );
      setSaveState('Saved');
    } catch {
      setSaveState('Unsaved');
    }
  };

  const scheduleAutosave = (nextTitle: string, nextContent: string) => {
    if (!activeDoc || !canEdit) return;
    setSaveState('Unsaved');
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      persistDocument(activeDoc.id, nextTitle, nextContent, false);
    }, 900);
  };

  const insertSnippet = (snippet: string) => {
    if (!canEdit) return;
    const next = `${contentDraft}\n${snippet}`;
    setContentDraft(next);
    scheduleAutosave(titleDraft, next);
  };

  const handleCreateDoc = async (parentDocId: string | null = null) => {
    if (!activeWorkspace || !canEdit) return;
    try {
      const res = await apiFetch<{ document: WorkspaceDocument }>(
        `/api/workspaces/${activeWorkspace.id}/documents`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: parentDocId ? 'Untitled Nested Page' : 'Untitled Document',
            content: '<h2>Overview</h2><p>Capture specifications, decisions, and references here.</p>',
            collectionId: selectedCollectionId,
            parentDocId,
          }),
        }
      );
      setDocuments((prev) => [res.document, ...prev]);
      selectDocument(res.document);
      notify('success', 'Document created');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to create document');
    }
  };

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !colName.trim()) return;
    const res = await apiFetch<{ collection: DocumentCollection }>(
      `/api/workspaces/${activeWorkspace.id}/collections`,
      { method: 'POST', body: JSON.stringify({ name: colName.trim() }) }
    );
    setCollections((prev) => [...prev, res.collection]);
    setSelectedCollectionId(res.collection.id);
    setNewCollectionOpen(false);
    setColName('');
  };

  const handleOpenVersions = async () => {
    if (!activeWorkspace || !activeDoc) return;
    setVersionsOpen(true);
    const res = await apiFetch<{ versions: DocumentVersion[] }>(
      `/api/workspaces/${activeWorkspace.id}/documents/${activeDoc.id}/versions`
    );
    setVersions(res.versions);
  };

  const handleOpenComments = async () => {
    if (!activeWorkspace || !activeDoc) return;
    setCommentsOpen(true);
    const res = await apiFetch<{ comments: Comment[] }>(
      `/api/workspaces/${activeWorkspace.id}/comments?entityType=document&entityId=${activeDoc.id}`
    );
    setComments(res.comments);
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !activeDoc || !commentText.trim()) return;
    const res = await apiFetch<{ comment: Comment }>(`/api/workspaces/${activeWorkspace.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ entityType: 'document', entityId: activeDoc.id, content: commentText.trim() }),
    });
    setComments((prev) => [...prev, res.comment]);
    setCommentText('');
  };

  const handleAiDraft = async () => {
    if (!activeWorkspace || !activeDoc || !canEdit) return;
    setAiDrafting(true);
    try {
      const res = await apiFetch<{ text: string }>(`/api/workspaces/${activeWorkspace.id}/ai`, {
        method: 'POST',
        body: JSON.stringify({
          mode: 'draft_document',
          prompt: `Draft structured documentation titled "${titleDraft}" grounded in our workspace context. Format as clean HTML sections (<h2>, <p>, <ul><li>).`,
        }),
      });
      const next = `${contentDraft}\n${res.text}`;
      setContentDraft(next);
      await persistDocument(activeDoc.id, titleDraft, next, true);
      notify('success', 'Synora AI draft appended & saved');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'AI draft failed');
    } finally {
      setAiDrafting(false);
    }
  };

  const filteredDocs = documents.filter((d) => {
    if (selectedCollectionId && d.collectionId !== selectedCollectionId) return false;
    if (search.trim() && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const rootDocs = filteredDocs.filter((d) => !d.parentDocId || !filteredDocs.some((p) => p.id === d.parentDocId));

  return (
    <div className="h-full min-h-[560px] flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] overflow-hidden">
      {/* Left Knowledge Base / Documents Sidebar */}
      <div className="w-72 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-[#0F1219] shrink-0">
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-xs font-semibold flex items-center gap-1.5">
            {mode === 'knowledge' ? <BookOpen className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            {mode === 'knowledge' ? 'Knowledge Base' : 'Documents'}
          </span>
          {canEdit && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setNewCollectionOpen(true)}
                title="New Collection"
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleCreateDoc(null)}
                title="New Document"
                className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="p-2.5 border-b border-slate-200 dark:border-slate-800">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pages..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 text-xs"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {/* Collections Filter */}
          <div>
            <div className="px-2 py-1 text-[11px] font-semibold text-slate-400">Collections</div>
            <button
              type="button"
              onClick={() => setSelectedCollectionId(null)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs ${
                !selectedCollectionId ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400 font-semibold' : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              All Pages ({documents.length})
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCollectionId(c.id)}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs truncate ${
                  selectedCollectionId === c.id
                    ? 'bg-blue-600/10 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Nested Pages Tree */}
          <div>
            <div className="px-2 py-1 text-[11px] font-semibold text-slate-400">Pages</div>
            <div className="space-y-0.5">
              {rootDocs.map((doc) => {
                const children = filteredDocs.filter((c) => c.parentDocId === doc.id);
                return (
                  <div key={doc.id}>
                    <button
                      type="button"
                      onClick={() => selectDocument(doc)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between gap-2 ${
                        selectedDocId === doc.id
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="truncate">{doc.title}</span>
                      {doc.isPinned && <Pin className="w-3 h-3 shrink-0 opacity-75" />}
                    </button>
                    {children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => selectDocument(child)}
                        className={`w-full text-left pl-6 pr-2.5 py-1.5 rounded-lg text-xs truncate ${
                          selectedDocId === child.id
                            ? 'bg-blue-600/80 text-white font-semibold'
                            : 'text-slate-500 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        ↳ {child.title}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Document Editor */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeDoc ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <FileText className="w-9 h-9 text-slate-400 mb-2" />
            <p className="text-sm font-medium">Select or create a document</p>
            {canEdit && (
              <button
                type="button"
                onClick={() => handleCreateDoc(null)}
                className="mt-3 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
              >
                New Document
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="h-14 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 overflow-x-auto">
              <div className="flex items-center gap-1">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => insertSnippet('<h1>Heading 1</h1>')}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                      title="Heading 1"
                    >
                      <Heading1 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertSnippet('<h2>Section Heading</h2>')}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                      title="Heading 2"
                    >
                      <Heading2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertSnippet('<ul><li>Action item one</li><li>Action item two</li></ul>')}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                      title="Bullet List"
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        insertSnippet('<table><thead><tr><th>Column A</th><th>Column B</th></tr></thead><tbody><tr><td>Value 1</td><td>Value 2</td></tr></tbody></table>')
                      }
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                      title="Insert Table"
                    >
                      <Table className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertSnippet('<pre><code>const status = "verified";</code></pre>')}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                      title="Code Block"
                    >
                      <Code className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateDoc(activeDoc.id)}
                      className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 text-xs font-medium ml-1 whitespace-nowrap"
                    >
                      + Nested Page
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-mono text-slate-400">{saveState}</span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => persistDocument(activeDoc.id, titleDraft, contentDraft, true)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium whitespace-nowrap"
                  >
                    Save Version
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleOpenVersions}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500"
                  title="Version History"
                >
                  <History className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleOpenComments}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500"
                  title="Comments"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={handleAiDraft}
                    disabled={aiDrafting}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> {aiDrafting ? 'Drafting...' : 'AI Draft'}
                  </button>
                )}
              </div>
            </div>

            {/* Editor + Live Preview Split */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <input
                  type="text"
                  readOnly={!canEdit}
                  value={titleDraft}
                  onChange={(e) => {
                    setTitleDraft(e.target.value);
                    scheduleAutosave(e.target.value, contentDraft);
                  }}
                  className="flex-1 font-display text-2xl font-bold bg-transparent focus:outline-none text-slate-900 dark:text-white"
                />
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/workspaces/${activeWorkspace!.id}/documents/${activeDoc.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ isPinned: !activeDoc.isPinned }),
                        });
                        setDocuments((prev) =>
                          prev.map((d) => (d.id === activeDoc.id ? { ...d, isPinned: !d.isPinned } : d))
                        );
                      }}
                      className={`px-2.5 py-1 rounded-lg border text-xs ${
                        activeDoc.isPinned ? 'border-amber-500 text-amber-500' : 'border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                    >
                      {activeDoc.isPinned ? 'Pinned' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/workspaces/${activeWorkspace!.id}/documents/${activeDoc.id}`, {
                          method: 'DELETE',
                        });
                        setDocuments((prev) => prev.filter((d) => d.id !== activeDoc.id));
                        setSelectedDocId(null);
                        notify('success', 'Document deleted');
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500 flex items-center gap-2">
                <span>Author: {activeDoc.authorName}</span>
                <span aria-hidden="true">·</span>
                <span>Last updated by {activeDoc.updatedByName}</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 mb-2">Source Editor (HTML / Rich Text)</div>
                  <textarea
                    rows={18}
                    readOnly={!canEdit}
                    value={contentDraft}
                    onChange={(e) => {
                      setContentDraft(e.target.value);
                      scheduleAutosave(titleDraft, e.target.value);
                    }}
                    className="w-full p-4 rounded-xl bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 mb-2">Rendered Document</div>
                  <div
                    className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-[#0F1219] text-sm leading-relaxed space-y-3 [&_h1]:font-display [&_h1]:text-xl [&_h1]:font-bold [&_h2]:font-display [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:text-xs [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-700 [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:border-slate-700 [&_td]:p-2"
                    dangerouslySetInnerHTML={{
                      __html: contentDraft.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ''),
                    }}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Version History Drawer */}
      {versionsOpen && activeDoc && (
        <div className="w-80 border-l border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-[#0F1219] shrink-0">
          <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold">Version History</span>
            <button type="button" onClick={() => setVersionsOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {versions.map((v) => (
              <div key={v.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F]">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="font-mono">v{v.versionNumber}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={async () => {
                        setTitleDraft(v.title);
                        setContentDraft(v.content);
                        await persistDocument(activeDoc.id, v.title, v.content, true);
                        notify('success', `Restored v${v.versionNumber}`);
                      }}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Restore
                    </button>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {v.editedByName} · {new Date(v.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document Comments Drawer */}
      {commentsOpen && activeDoc && (
        <div className="w-80 border-l border-slate-200 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-[#0F1219] shrink-0">
          <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold">Document Comments</span>
            <button type="button" onClick={() => setCommentsOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] text-xs">
                <div className="font-semibold">{c.authorName}</div>
                <p className="text-slate-600 dark:text-slate-300 mt-1">{c.content}</p>
              </div>
            ))}
          </div>
          <form onSubmit={handleAddComment} className="p-3 border-t border-slate-200 dark:border-slate-800 flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Add comment..."
              className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 text-xs"
            />
            <button type="submit" className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
              Post
            </button>
          </form>
        </div>
      )}

      {/* New Collection Modal */}
      {newCollectionOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateCollection}
            className="w-full max-w-sm bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="font-display text-base font-bold">Create Collection</h3>
            <input
              type="text"
              required
              value={colName}
              onChange={(e) => setColName(e.target.value)}
              placeholder="e.g. Security Policies"
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewCollectionOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
