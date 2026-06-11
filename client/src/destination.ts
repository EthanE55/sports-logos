// Where every "Save" / "Export all" / "Set up file structure" button
// writes its files on the user's own machine. Two paths depending on
// browser support:
//
//   - **File System Access API** (Chrome / Edge / Brave / Opera, ~75%
//     of desktop traffic): `showDirectoryPicker()` shows a native folder
//     dialog. The returned FileSystemDirectoryHandle is stored in
//     IndexedDB so it persists across page loads. On reload we re-ask
//     for permission via `queryPermission/requestPermission` — the
//     browser usually grants it silently.
//
//   - **Fallback** (Safari, Firefox, headless contexts): no handle.
//     Exports trigger a normal ZIP download via the browser's default
//     download folder.

import { useEffect, useState } from 'react';
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'sports-logos';
const STORE_NAME = 'handles';
const KEY = 'export-destination';

export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

let dbPromise: Promise<IDBPDatabase<unknown>> | null = null;
function getDb(): Promise<IDBPDatabase<unknown>> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

async function loadStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker()) return null;
  const db = await getDb();
  const handle = (await db.get(STORE_NAME, KEY)) as FileSystemDirectoryHandle | undefined;
  return handle ?? null;
}

async function storeHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  const db = await getDb();
  if (handle) {
    await db.put(STORE_NAME, handle, KEY);
  } else {
    await db.delete(STORE_NAME, KEY);
  }
}

// Re-ask the browser for write permission. After a page reload, even a
// stored handle has its permission revoked from JS's perspective until
// the user re-grants — usually a single auto-approve click. Safe to call
// any time before a write.
export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  // The TS DOM lib doesn't declare these methods yet on
  // FileSystemDirectoryHandle — they're part of the File System Access
  // spec. Loosen the type just for the calls.
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission: (opts: { mode: 'readwrite' }) => Promise<PermissionState>;
    requestPermission: (opts: { mode: 'readwrite' }) => Promise<PermissionState>;
  };
  const current = await h.queryPermission({ mode: 'readwrite' });
  if (current === 'granted') return true;
  const next = await h.requestPermission({ mode: 'readwrite' });
  return next === 'granted';
}

let listeners: Array<(handle: FileSystemDirectoryHandle | null) => void> = [];

export async function pickDestination(): Promise<FileSystemDirectoryHandle | null> {
  if (!supportsDirectoryPicker()) return null;
  try {
    const handle = await (
      window as unknown as {
        showDirectoryPicker: (opts: {
          mode: 'readwrite';
          startIn?: 'documents' | 'downloads' | 'desktop';
        }) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
    await storeHandle(handle);
    for (const fn of listeners) fn(handle);
    return handle;
  } catch {
    // User cancelled the picker — leave existing handle alone.
    return null;
  }
}

export async function clearDestination(): Promise<void> {
  await storeHandle(null);
  for (const fn of listeners) fn(null);
}

export function useDestinationHandle(): {
  handle: FileSystemDirectoryHandle | null;
  loading: boolean;
} {
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadStoredHandle()
      .then((h) => {
        if (!alive) return;
        setHandle(h);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
      });
    const fn = (h: FileSystemDirectoryHandle | null) => setHandle(h);
    listeners.push(fn);
    return () => {
      alive = false;
      listeners = listeners.filter((x) => x !== fn);
    };
  }, []);

  return { handle, loading };
}
