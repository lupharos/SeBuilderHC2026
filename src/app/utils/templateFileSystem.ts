import type { Template } from '../components/types/templates';

// ── Minimal File System Access API types ─────────────────────────────────────
export interface FSFileHandle {
  kind: 'file';
  name: string;
  queryPermission(desc: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission(desc: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}
interface ShowSavePickerOpts {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
  startIn?: string;
}
declare global {
  interface Window {
    showSaveFilePicker?(opts?: ShowSavePickerOpts): Promise<FSFileHandle>;
  }
}

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
const DB = 'hc_wizard_fs';
const STORE = 'handles';
const KEY = 'templates';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getStoredHandle(): Promise<FSFileHandle | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as FSFileHandle) ?? null);
      req.onerror  = () => resolve(null);
    });
  } catch { return null; }
}

async function storeHandle(h: FSFileHandle): Promise<void> {
  try {
    const db = await openIDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(h, KEY);
      tx.oncomplete = () => resolve();
    });
  } catch { /* ignore */ }
}

export async function clearStoredHandle(): Promise<void> {
  try {
    const db = await openIDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
    });
  } catch { /* ignore */ }
}

// ── Public API ────────────────────────────────────────────────────────────────
export const isSupported = () => typeof window.showSaveFilePicker === 'function';

function buildPayload(templates: Template[]) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: '1.0',
    totalTemplates: templates.length,
    totalQuestions: templates.reduce((s, t) => s + t.questions.length, 0),
    templates,
  }, null, 2);
}

export type SaveResult =
  | { ok: true; filename: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; error: string };

export async function saveTemplates(templates: Template[]): Promise<SaveResult> {
  if (!isSupported()) return { ok: false, error: 'File System Access API not supported in this browser.' };

  let handle = await getStoredHandle();

  // verify / re-request write permission on existing handle
  if (handle) {
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'prompt') {
      try { perm = await handle.requestPermission({ mode: 'readwrite' }); } catch { handle = null; }
    }
    if (perm !== 'granted') handle = null;
  }

  // no usable handle → open picker
  if (!handle) {
    try {
      handle = await window.showSaveFilePicker!({
        suggestedName: 'hc-rule-engine.json',
        types: [{ description: 'JSON Configuration', accept: { 'application/json': ['.json'] } }],
        startIn: 'documents',
      });
      await storeHandle(handle);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return { ok: false, cancelled: true };
      return { ok: false, error: String(e) };
    }
  }

  try {
    const w = await handle.createWritable();
    await w.write(buildPayload(templates));
    await w.close();
    return { ok: true, filename: handle.name };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export type LoadResult =
  | { status: 'loaded'; templates: Template[]; filename: string }
  | { status: 'needs-permission'; handle: FSFileHandle }
  | { status: 'no-file' }
  | { status: 'error'; error: string };

async function readHandle(handle: FSFileHandle): Promise<LoadResult> {
  try {
    const file = await handle.getFile();
    const text = await file.text();
    const raw  = JSON.parse(text) as { templates?: unknown; [k: string]: unknown };
    const arr  = Array.isArray(raw) ? raw : raw?.templates;
    if (!Array.isArray(arr) || arr.length === 0) return { status: 'error', error: 'Invalid file format.' };
    return { status: 'loaded', templates: arr as Template[], filename: handle.name };
  } catch (e) {
    return { status: 'error', error: String(e) };
  }
}

/** Called on mount — no user gesture required if already granted. */
export async function autoLoad(): Promise<LoadResult> {
  if (!isSupported()) return { status: 'no-file' };
  const handle = await getStoredHandle();
  if (!handle) return { status: 'no-file' };

  const perm = await handle.queryPermission({ mode: 'read' });
  if (perm === 'granted') return readHandle(handle);
  if (perm === 'prompt')  return { status: 'needs-permission', handle };
  return { status: 'no-file' }; // denied
}

/** Called on user click — requests permission then reads. */
export async function requestAndLoad(handle: FSFileHandle): Promise<LoadResult> {
  try {
    const perm = await handle.requestPermission({ mode: 'read' });
    if (perm !== 'granted') return { status: 'error', error: 'Permission denied.' };
    return readHandle(handle);
  } catch (e) {
    return { status: 'error', error: String(e) };
  }
}
