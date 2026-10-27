// results: Map<test.id, { status }>

export const isBlocked = (r) => r.status === 'blocked' || r.status === 'timeout';
// ölü domainler hesaba katılmıyor
export const isCounted = (r) => r.status !== 'unreachable';

export function tally(list, results) {
  const s = { total: list.length, done: 0, counted: 0, blocked: 0, allowed: 0, timeout: 0, unreachable: 0 };
  for (const test of list) {
    const r = results.get(test.id);
    if (!r) continue;
    s.done++;
    s[r.status]++;
    if (isCounted(r)) s.counted++;
  }
  // timeout da engellendi sayılıyor
  s.blocked += s.timeout;
  return s;
}

export const percent = (s) => (s.counted ? Math.round((s.blocked / s.counted) * 100) : null);

// her kategori weight kadar puan. sonucu olmayanlar (kapalı paketler, bitmemiş testler)
// paydaya girmiyor, skor yine 100 üzerinden çıkıyor
export function weightedScore(categories, tests, results) {
  let points = 0;
  let weights = 0;
  for (const cat of categories) {
    if (!cat.weight) continue;
    const s = tally(tests.filter((x) => x.cat === cat), results);
    if (!s.counted) continue;
    points += cat.weight * (s.blocked / s.counted);
    weights += cat.weight;
  }
  return weights ? Math.round((points / weights) * 100) : null;
}

export function level(pct) {
  if (pct === null) return '';
  if (pct >= 90) return 'great';
  if (pct >= 70) return 'good';
  if (pct >= 40) return 'partial';
  return 'weak';
}
