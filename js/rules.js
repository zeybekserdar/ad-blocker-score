export const RULE_FORMATS = ['adblock', 'domains', 'hosts'];

// bu listelerdekiler zaten yaygın engelleniyor, kırma riski düşük
const SAFE_LISTS = new Set(['light', 'normal', 'pro', 'oisd-small', 'oisd-big']);

const DEFAULT_LABELS = {
  title: 'Ad Blocker Score',
  safe: 'Common block targets (on HaGeZi Light-PRO or OISD)',
  risky: 'Aggressive or unlisted, check before adding (may break sites)',
  cosmetic: 'Cosmetic rules',
};

export function defaultFormat(profileId) {
  return profileId === 'dns' ? 'domains' : 'adblock';
}

const isSafe = (listData, host) => (listData?.domains?.[host] || []).some((id) => SAFE_LISTS.has(id));

// selectors: geçen kozmetik testlerin css seçicileri
export function buildRules({ hosts, selectors = [], format, listData = null, date = new Date(), labels = {} }) {
  const L = { ...DEFAULT_LABELS, ...labels };
  const c = format === 'adblock' ? '!' : '#';
  const line = (h) => {
    if (format === 'adblock') return `||${h}^`;
    if (format === 'hosts') return `0.0.0.0 ${h}`;
    return h;
  };

  const unique = [...new Set(hosts)].sort();
  // liste verisi yoksa ayıramıyoruz, hepsi tek blok
  const safe = listData ? unique.filter((h) => isSafe(listData, h)) : unique;
  const risky = listData ? unique.filter((h) => !isSafe(listData, h)) : [];
  const cosmetic = format === 'adblock' ? [...new Set(selectors)] : [];

  // sv-SE -> yerel saatle YYYY-MM-DD
  const out = [`${c} ${L.title} (${date.toLocaleDateString('sv-SE')})`];
  if (safe.length) out.push('', `${c} ${L.safe}`, ...safe.map(line));
  if (risky.length) out.push('', `${c} ${L.risky}`, ...risky.map(line));
  if (cosmetic.length) out.push('', `${c} ${L.cosmetic}`, ...cosmetic.map((s) => `##${s}`));
  return `${out.join('\n')}\n`;
}
