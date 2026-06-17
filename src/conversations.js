// 💬 Conversation history — persists chat sessions per workspace so the user can
// reopen past conversations instead of losing them when the process restarts or
// the page reloads. One row per conversation in the `conversations` collection:
// { id, title, messages: [{role,content}], createdAt, updatedAt }.
import { read, write, cuid } from './store.js';

const COLLECTION = 'conversations';
const MAX_KEEP = 100; // cap stored conversations to keep the file lean

// Derive a short human title from the first user turn.
function titleFrom(messages) {
  const first = (messages || []).find((m) => m.role === 'user');
  const t = (first?.content || '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 60) : 'New conversation';
}

// Lightweight list for the sidebar (no message bodies), newest first.
export function listConversations() {
  return read(COLLECTION, [])
    .slice()
    .reverse()
    .map((cv) => ({
      id: cv.id,
      title: cv.title || titleFrom(cv.messages),
      turns: Math.floor((cv.messages || []).length / 2),
      createdAt: cv.createdAt,
      updatedAt: cv.updatedAt || cv.createdAt,
    }));
}

export function getConversation(id) {
  return read(COLLECTION, []).find((cv) => cv.id === id) || null;
}

// Upsert a conversation's messages. Returns the stored row.
export function saveConversation(id, messages, title) {
  if (!id || !messages?.length) return null;
  const list = read(COLLECTION, []);
  const now = new Date().toISOString();
  const idx = list.findIndex((cv) => cv.id === id);
  const row = {
    id,
    title: title || (idx >= 0 ? list[idx].title : '') || titleFrom(messages),
    messages,
    createdAt: idx >= 0 ? list[idx].createdAt : now,
    updatedAt: now,
  };
  if (idx >= 0) list[idx] = row;
  else list.push(row);
  write(COLLECTION, list.slice(-MAX_KEEP));
  return row;
}

export function deleteConversation(id) {
  const list = read(COLLECTION, []);
  const next = list.filter((cv) => cv.id !== id);
  write(COLLECTION, next);
  return list.length - next.length;
}

export const newId = cuid;
