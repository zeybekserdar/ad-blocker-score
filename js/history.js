import { store } from './storage.js';

const KEY = 'history';
const MAX_RUNS = 10;

// test listesi değişse de eski kayıtlar eşleşsin diye numara yerine hedef
export const resultKey = (test) => `${test.cat.id}|${test.url || test.src || test.label}`;

export function loadRuns() {
  try {
    const runs = JSON.parse(store.get(KEY) || '[]');
    return Array.isArray(runs) ? runs : [];
  } catch {
    return [];
  }
}

function saveRuns(runs) {
  store.set(KEY, JSON.stringify(runs.slice(-MAX_RUNS)));
}

export function addRun(run) {
  saveRuns([...loadRuns(), run]);
}

export function updateRun(id, patch) {
  saveRuns(loadRuns().map((run) => (run.id === id ? { ...run, ...patch } : run)));
}

export function deleteRun(id) {
  saveRuns(loadRuns().filter((run) => run.id !== id));
}

export function clearRuns() {
  saveRuns([]);
}

const blockedish = (status) => status === 'blocked' || status === 'timeout';

// a önceki, b sonraki. sadece iki kayıtta da olan ve ulaşılabilen testler
export function diffRuns(a, b) {
  const newlyBlocked = [];
  const newlyAllowed = [];
  for (const [key, after] of Object.entries(b.results)) {
    const before = a.results[key];
    if (!before || before === 'unreachable' || after === 'unreachable') continue;
    if (!blockedish(before) && blockedish(after)) newlyBlocked.push(key);
    else if (blockedish(before) && !blockedish(after)) newlyAllowed.push(key);
  }

  const catDeltas = {};
  for (const [id, pct] of Object.entries(b.cats)) {
    if (pct !== null && a.cats[id] != null) catDeltas[id] = pct - a.cats[id];
  }

  return {
    scoreDelta: a.score != null && b.score != null ? b.score - a.score : null,
    catDeltas,
    newlyBlocked,
    newlyAllowed,
  };
}
