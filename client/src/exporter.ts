// Client-side bridge between the server (which streams a ZIP) and the
// user's machine. Two paths:
//
//   1. If a FileSystemDirectoryHandle is stored, unpack the ZIP and
//      write each entry into the chosen folder (and into subfolders, if
//      the server included them). Empty directory entries become real
//      empty folders.
//
//   2. Otherwise, trigger a normal browser download of the ZIP — the
//      file lands in the user's default Downloads folder.

import JSZip from 'jszip';
import { ensurePermission } from './destination.ts';

type DirHandle = FileSystemDirectoryHandle;

export type ExportSummary = {
  /** How many files (excluding directory entries) were written/downloaded */
  fileCount: number;
  /** How many empty directory entries were created (only meaningful for setup-league) */
  dirCount: number;
  /** Where the files ended up — folder name for handle mode, "Downloads" for fallback */
  destinationLabel: string;
  /** Which path was taken */
  mode: 'handle' | 'download';
};

/**
 * Walk a ZIP and create the directory hierarchy under `root`, returning
 * the leaf directory handle for the given path. Caches intermediate
 * handles in a map so repeated calls within the same export are cheap.
 */
async function ensureSubdir(
  root: DirHandle,
  segments: string[],
  cache: Map<string, DirHandle>,
): Promise<DirHandle> {
  const key = segments.join('/');
  if (cache.has(key)) return cache.get(key)!;
  let cur: DirHandle = root;
  for (let i = 0; i < segments.length; i++) {
    const prefix = segments.slice(0, i + 1).join('/');
    const cached = cache.get(prefix);
    if (cached) {
      cur = cached;
      continue;
    }
    cur = await cur.getDirectoryHandle(segments[i], { create: true });
    cache.set(prefix, cur);
  }
  return cur;
}

async function writeZipToHandle(
  zipBytes: ArrayBuffer,
  root: DirHandle,
): Promise<{ fileCount: number; dirCount: number }> {
  const zip = await JSZip.loadAsync(zipBytes);
  const cache = new Map<string, DirHandle>();
  let fileCount = 0;
  let dirCount = 0;

  // JSZip iterates in insertion order. We process directories first so
  // their handles get cached before file writes need them.
  const entries = Object.values(zip.files);
  for (const entry of entries) {
    const parts = entry.name.split('/').filter((p) => p.length > 0);
    if (parts.length === 0) continue;
    if (entry.dir) {
      await ensureSubdir(root, parts, cache);
      dirCount++;
    } else {
      const fileName = parts[parts.length - 1];
      const dirSegments = parts.slice(0, -1);
      const dir = dirSegments.length === 0
        ? root
        : await ensureSubdir(root, dirSegments, cache);
      const fileHandle = await dir.getFileHandle(fileName, { create: true });
      const writable = await (
        fileHandle as FileSystemFileHandle & {
          createWritable: () => Promise<{
            write: (data: ArrayBuffer | Blob) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }
      ).createWritable();
      const bytes = await entry.async('arraybuffer');
      await writable.write(bytes);
      await writable.close();
      fileCount++;
    }
  }

  return { fileCount, dirCount };
}

function triggerZipDownload(zipBytes: ArrayBuffer, suggestedName: string): void {
  const blob = new Blob([zipBytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke later so the click has time to dispatch.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * POST to the given export endpoint, receive a ZIP, and route it to the
 * user's chosen destination (or trigger a download if none is set).
 */
export async function runExport(
  endpoint: string,
  handle: FileSystemDirectoryHandle | null,
  fallbackZipName: string,
): Promise<ExportSummary> {
  const res = await fetch(endpoint, { method: 'POST' });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      detail = j.error || detail;
    } catch {
      /* binary body — keep the statusText */
    }
    throw new Error(detail);
  }
  const buf = await res.arrayBuffer();

  if (handle) {
    const ok = await ensurePermission(handle);
    if (!ok) {
      // Permission was revoked — fall back to download so the user still
      // gets their files instead of a silent failure.
      triggerZipDownload(buf, fallbackZipName);
      return {
        fileCount: 0,
        dirCount: 0,
        destinationLabel: 'Downloads (permission denied)',
        mode: 'download',
      };
    }
    const { fileCount, dirCount } = await writeZipToHandle(buf, handle);
    return {
      fileCount,
      dirCount,
      destinationLabel: handle.name,
      mode: 'handle',
    };
  }

  triggerZipDownload(buf, fallbackZipName);
  return {
    fileCount: -1, // unknown — we didn't unpack
    dirCount: 0,
    destinationLabel: 'Downloads',
    mode: 'download',
  };
}

