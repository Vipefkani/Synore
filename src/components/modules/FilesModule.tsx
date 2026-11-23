import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Eye,
  File,
  Folder,
  FolderPlus,
  Lock,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { Folder as FolderType, WorkspaceFile } from '../../types/synore';

export function FilesModule() {
  const { activeWorkspace, token, apiFetch, notify } = useWorkspace();
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [storage, setStorage] = useState({ usedBytes: 0, limitBytes: 5368709120 });
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [previewFile, setPreviewFile] = useState<WorkspaceFile | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [deleteFileId, setDeleteFileId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadFiles = async () => {
    if (!activeWorkspace) return;
    const res = await apiFetch<{
      folders: FolderType[];
      files: WorkspaceFile[];
      storage: { usedBytes: number; limitBytes: number };
    }>(`/api/workspaces/${activeWorkspace.id}/files`);
    setFolders(res.folders);
    setFiles(res.files);
    setStorage(res.storage);
  };

  useEffect(() => {
    setCurrentFolderId(null);
    loadFiles().catch(() => {});
  }, [activeWorkspace?.id]);

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || !activeWorkspace) return;
    setUploading(true);
    try {
      for (const f of Array.from(fileList)) {
        const form = new FormData();
        form.append('file', f);
        if (currentFolderId) form.append('folderId', currentFolderId);
        await apiFetch(`/api/workspaces/${activeWorkspace.id}/files/upload`, {
          method: 'POST',
          body: form,
        });
      }
      await loadFiles();
      notify('success', 'File(s) uploaded to workspace storage');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !folderName.trim()) return;
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/folders`, {
        method: 'POST',
        body: JSON.stringify({ name: folderName.trim(), parentId: currentFolderId }),
      });
      await loadFiles();
      setNewFolderOpen(false);
      setFolderName('');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to create folder');
    }
  };

  const handleDownload = async (file: WorkspaceFile) => {
    if (!activeWorkspace || !token) return;
    const res = await fetch(`/api/workspaces/${activeWorkspace.id}/files/${file.id}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      notify('error', 'Download failed');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.originalName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async (file: WorkspaceFile) => {
    if (!activeWorkspace || !token) return;
    setPreviewFile(file);
    setPreviewText(null);
    if (file.mimeType.startsWith('text/') || file.mimeType.includes('json') || file.name.endsWith('.md')) {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/files/${file.id}/download?inline=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setPreviewText(await res.text());
      }
    }
  };

  const handleToggleShare = async (file: WorkspaceFile) => {
    if (!activeWorkspace) return;
    const nextPerm =
      file.permissionsLevel === 'workspace'
        ? 'managers'
        : file.permissionsLevel === 'managers'
        ? 'private'
        : 'workspace';
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/files/${file.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ permissionsLevel: nextPerm }),
      });
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, permissionsLevel: nextPerm } : f)));
      notify('info', `Access set to ${nextPerm}`);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Permission denied');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!activeWorkspace) return;
    try {
      await apiFetch(`/api/workspaces/${activeWorkspace.id}/files/${fileId}`, { method: 'DELETE' });
      await loadFiles();
      setDeleteFileId(null);
      notify('success', 'File deleted');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Unable to delete file');
    }
  };

  const canShare = Boolean(activeWorkspace?.permissions.shareFiles);
  const currentFolder = folders.find((f) => f.id === currentFolderId) || null;
  const visibleFolders = folders.filter((f) => f.parentId === currentFolderId && f.name.toLowerCase().includes(search.toLowerCase()));
  const visibleFiles = files.filter((f) => {
    if (search.trim()) return f.name.toLowerCase().includes(search.toLowerCase());
    return f.folderId === currentFolderId;
  });

  const usagePct = Math.min(100, Math.round((storage.usedBytes / Math.max(1, storage.limitBytes)) * 100));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button type="button" onClick={() => setCurrentFolderId(null)} className="hover:text-blue-500 font-medium">
              Root Storage
            </button>
            {currentFolder && (
              <>
                <span>/</span>
                <span className="font-semibold text-slate-900 dark:text-white">{currentFolder.name}</span>
              </>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="w-44 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div className="h-full bg-blue-600" style={{ width: `${Math.max(2, usagePct)}%` }} />
            </div>
            <span className="text-[11px] font-mono tabular-nums text-slate-500">
              {(storage.usedBytes / (1024 * 1024)).toFixed(2)} MB / {(storage.limitBytes / (1024 * 1024 * 1024)).toFixed(0)} GB
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files..."
              className="pl-8 pr-3 py-2 rounded-lg bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 text-xs"
            />
          </div>
          {canShare && (
            <>
              <button
                type="button"
                onClick={() => setNewFolderOpen(true)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium flex items-center gap-1.5"
              >
                <FolderPlus className="w-3.5 h-3.5" /> New Folder
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => handleUploadFiles(e.target.files)}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" /> {uploading ? 'Uploading...' : 'Upload File'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Folders Grid */}
      {visibleFolders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {visibleFolders.map((fld) => (
            <button
              key={fld.id}
              type="button"
              onClick={() => setCurrentFolderId(fld.id)}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] hover:border-blue-500/40 text-left flex items-center gap-2.5"
            >
              <Folder className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-xs font-semibold truncate">{fld.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Files Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#13161F] overflow-x-auto">
        {visibleFiles.length === 0 ? (
          <div className="p-10 text-center">
            <File className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium">No files in this folder</p>
            <p className="text-xs text-slate-500 mt-1">Upload files to share securely with your workspace.</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-3 px-4 font-semibold">Name</th>
                <th className="py-3 px-4 font-semibold">Type</th>
                <th className="py-3 px-4 font-semibold">Size</th>
                <th className="py-3 px-4 font-semibold">Access</th>
                <th className="py-3 px-4 font-semibold">Uploaded By</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleFiles.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                    {f.name} · <span className="font-mono text-[11px] text-slate-500">v{f.version}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 font-mono">{f.mimeType}</td>
                  <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                    {(f.sizeBytes / 1024).toFixed(1)} KB
                  </td>
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      disabled={!canShare}
                      onClick={() => handleToggleShare(f)}
                      className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-500"
                    >
                      {f.permissionsLevel === 'private' ? <Lock className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
                      {f.permissionsLevel}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-slate-500">{f.uploadedByName}</td>
                  <td className="py-3 px-4 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() => handlePreview(f)}
                      className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
                      title="Preview"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(f)}
                      className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
                      title="Download"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    {canShare && (
                      <button
                        type="button"
                        onClick={() => setDeleteFileId(f.id)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-500"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-sm font-semibold">{previewFile.name}</span>
              <button type="button" onClick={() => setPreviewFile(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 max-h-[65vh] overflow-y-auto">
              {previewText !== null ? (
                <pre className="p-4 rounded-xl bg-slate-950 text-slate-100 text-xs font-mono whitespace-pre-wrap">
                  {previewText}
                </pre>
              ) : (
                <div className="text-center py-8 space-y-3">
                  <p className="text-xs text-slate-500">
                    Binary file ({previewFile.mimeType}, {(previewFile.sizeBytes / 1024).toFixed(1)} KB)
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDownload(previewFile)}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                  >
                    Download File
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      {newFolderOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateFolder}
            className="w-full max-w-sm bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="font-display text-base font-bold">New Folder</h3>
            <input
              type="text"
              required
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Folder name..."
              className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-slate-800 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFolderOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold">
                Create Folder
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteFileId && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-[#13161F] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-base font-bold">Delete File?</h3>
            <p className="text-xs text-slate-500">This removes the file permanently from workspace storage.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteFileId(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteFile(deleteFileId)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
