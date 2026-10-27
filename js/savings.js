// payload boyutları data/lists.json'dan geliyor (build-lists.mjs ölçüyor)

import { isBlocked, isCounted } from './score.js';

const SLOW_MBPS = 10; // yavaş 4G

export function estimateSavings(tests, results, listData) {
  const sizes = listData?.payloads;
  if (!sizes || !Object.keys(sizes).length) return null;

  const groups = new Map();
  let blockedRequests = 0;
  for (const test of tests) {
    if (test.method !== 'fetch') continue;
    const r = results.get(test.id);
    if (!r || !isCounted(r)) continue;
    if (isBlocked(r)) blockedRequests++;
    if (!test.group.payloads) continue;
    const g = groups.get(test.groupKey) || { group: test.group, counted: 0, blocked: 0 };
    g.counted++;
    if (isBlocked(r)) g.blocked++;
    groups.set(test.groupKey, g);
  }

  let blockedBytes = 0;
  let loadedBytes = 0;
  for (const { group, counted, blocked } of groups.values()) {
    const bytes = group.payloads.reduce((sum, url) => sum + (sizes[url] || 0), 0);
    if (blocked / counted >= 0.5) blockedBytes += bytes;
    else loadedBytes += bytes;
  }
  if (!blockedBytes && !loadedBytes) return null;

  return {
    blockedBytes,
    loadedBytes,
    blockedRequests,
    seconds: (blockedBytes * 8) / (SLOW_MBPS * 1e6),
  };
}
