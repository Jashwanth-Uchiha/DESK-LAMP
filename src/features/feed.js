// Shared realtime "feed" logic for chat messages and discussion posts.
// Each item is its own record (push id), so concurrent writes never clobber each other,
// and each vote is its own key (votes/{uid}: true), so voting is conflict-free.

import { ref, query, orderByChild, limitToLast, onValue, push, set, remove, serverTimestamp } from 'firebase/database';

/** Subscribe to the newest `limit` items at `path`. Returns an unsubscribe function. */
export function subscribeFeed(db, path, limit, onItems, onError) {
  const q = query(ref(db, path), orderByChild('createdAt'), limitToLast(limit));
  return onValue(q, (snap) => {
    const items = [];
    snap.forEach((child) => { items.push(toItem(child.key, child.val())); });
    onItems(items);
  }, onError);
}

export function toItem(id, v) {
  const votes = v && typeof v.votes === 'object' && v.votes ? v.votes : {};
  return {
    id,
    uid: v?.uid,
    name: typeof v?.name === 'string' ? v.name : 'Unknown',
    text: typeof v?.text === 'string' ? v.text : '',
    createdAt: typeof v?.createdAt === 'number' ? v.createdAt : 0,
    hidden: !!v?.hidden,
    votes,
    voteCount: Object.keys(votes).length,
  };
}

export function sortItems(items, mode) {
  const copy = [...items];
  if (mode === 'top') copy.sort((a, b) => b.voteCount - a.voteCount || b.createdAt - a.createdAt);
  else copy.sort((a, b) => b.createdAt - a.createdAt);
  return copy;
}

export function addItem(db, path, { uid, name, text }) {
  return push(ref(db, path), { uid, name, text, createdAt: serverTimestamp() });
}

export function setVote(db, path, itemId, uid, on) {
  const r = ref(db, `${path}/${itemId}/votes/${uid}`);
  return on ? set(r, true) : remove(r);
}
