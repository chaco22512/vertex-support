// "Unread" tracking for the Inbox accent bar (§7.2). The schema has no per-staff
// read flag, so Phase 1 tracks locally which escalations this browser has opened.
const KEY = 'vertex.admin.seen';

function read(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function isSeen(id: string): boolean {
  return read().has(id);
}

export function markSeen(id: string): void {
  const set = read();
  if (set.has(id)) return;
  set.add(id);
  localStorage.setItem(KEY, JSON.stringify([...set]));
}
