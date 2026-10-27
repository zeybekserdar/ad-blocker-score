// data/lists.json yoksa rozetler ve liste tespiti gizli kalıyor

export const HAGEZI_TIERS = ['light', 'normal', 'pro', 'proplus', 'ultimate'];
const ACTIVE = 0.7;
const PARTIAL = 0.3;

export async function loadLists(url = 'data/lists.json') {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

const listsOf = (data, host) => data?.domains?.[host] || [];
const lowestTier = (data, host) => HAGEZI_TIERS.findIndex((tier) => listsOf(data, host).includes(tier));

export const cnameOf = (data, host) => data?.cnames?.[host] || null;

// rozetler: en düşük HaGeZi kademesi ("PRO+"), OISD ve diğer listeler
export function badgesFor(data, host) {
  if (!data) return [];
  const ids = listsOf(data, host);
  const meta = Object.fromEntries(data.lists.map((l) => [l.id, l]));
  const badges = [];

  const tier = lowestTier(data, host);
  if (tier >= 0) {
    const short = meta[HAGEZI_TIERS[tier]].short;
    // PRO++ ve ULTIMATE'e ayrıca + eklemiyoruz
    const orHigher = tier < HAGEZI_TIERS.length - 1 && !short.endsWith('+');
    badges.push({ label: orHigher ? `${short}+` : short, kind: 'tier' });
  }
  if (ids.includes('oisd-small')) badges.push({ label: meta['oisd-small'].short, kind: 'oisd' });
  else if (ids.includes('oisd-big')) badges.push({ label: meta['oisd-big'].short, kind: 'oisd' });

  for (const id of ids) {
    if (meta[id]?.kind === 'extra') badges.push({ label: meta[id].short, kind: 'extra' });
  }
  return badges;
}

// outcomes: Map<host, 'blocked' | 'allowed'>, sadece ulaşılabilen hostlar
function judge(hosts, outcomes) {
  const tested = hosts.filter((h) => outcomes.has(h));
  const blocked = tested.filter((h) => outcomes.get(h) === 'blocked').length;
  if (tested.length < 2) return { status: 'unknown', tested: tested.length, blocked };
  const r = blocked / tested.length;
  return { status: r >= ACTIVE ? 'active' : r >= PARTIAL ? 'partial' : 'inactive', tested: tested.length, blocked };
}

// HaGeZi kademeleri iç içe, o yüzden her kademede sadece o kademede ilk kez geçen domainlere
// bakıyoruz; %70'i engellenmişse kademe aktif. diğer listelerde aktif kademenin zaten
// kapsadıkları çıkarılıyor, onlar ayırt edici değil.
export function detectLists(data, outcomes) {
  if (!data) return null;
  const hosts = Object.keys(data.domains);
  const inList = (id) => hosts.filter((h) => listsOf(data, h).includes(id));

  const tierJudgements = HAGEZI_TIERS.map((_, i) => judge(hosts.filter((h) => lowestTier(data, h) === i), outcomes));
  let activeTier = -1;
  tierJudgements.forEach((j, i) => { if (j.status === 'active') activeTier = i; });
  const covered = new Set(hosts.filter((h) => {
    const tier = lowestTier(data, h);
    return tier >= 0 && tier <= activeTier;
  }));

  const smallSet = new Set(inList('oisd-small'));

  const lists = data.lists.map((list) => {
    const tierIndex = HAGEZI_TIERS.indexOf(list.id);
    if (tierIndex >= 0) {
      const j = tierJudgements[tierIndex];
      return { ...list, ...j, status: tierIndex <= activeTier ? 'active' : j.status };
    }

    let members = inList(list.id);
    let distinct = members.filter((h) => !covered.has(h));
    if (list.id === 'oisd-big') distinct = distinct.filter((h) => !smallSet.has(h));

    const j = judge(distinct, outcomes);
    if (j.status !== 'unknown') return { ...list, ...j };
    // ayırt edici domain kalmadıysa tüm üyelerle kaba tahmin
    members = members.filter((h) => outcomes.has(h));
    return { ...list, ...judge(members, outcomes), weak: true };
  });

  return { activeTier: activeTier >= 0 ? HAGEZI_TIERS[activeTier] : null, lists };
}
