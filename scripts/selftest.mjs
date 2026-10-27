// node scripts/selftest.mjs

import assert from 'node:assert/strict';
import { CATEGORIES, buildTests } from '../js/tests.js';
import { tally, percent, weightedScore } from '../js/score.js';
import { detectProfile } from '../js/profile.js';
import { detectLists } from '../js/lists.js';
import { buildRules, defaultFormat } from '../js/rules.js';
import { diffRuns, resultKey } from '../js/history.js';
import { estimateSavings } from '../js/savings.js';

const tests = buildTests();
let passed = 0;

function check(name, fn) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

function scenario(fn) {
  const results = new Map();
  for (const test of tests) results.set(test.id, { status: fn(test), ms: 0 });
  return results;
}

check('ana kategori ağırlıkları toplamı 100', () => {
  const total = CATEGORIES.filter((c) => c.scored === 'main').reduce((sum, c) => sum + c.weight, 0);
  assert.equal(total, 100);
});

check('test kimlikleri benzersiz ve sıralı', () => {
  tests.forEach((x, i) => assert.equal(x.id, i));
});

check('hiçbir şey engellenmedi → 0 puan, profil "none"', () => {
  const r = scenario(() => 'allowed');
  assert.equal(weightedScore(CATEGORIES, tests, r), 0);
  const p = detectProfile(tests, r);
  assert.equal(p.id, 'none');
  assert.ok(p.tips.includes('tip.noneChecks'));
});

check('her şey engellendi → 100 puan, profil "extension"', () => {
  const r = scenario(() => 'blocked');
  assert.equal(weightedScore(CATEGORIES, tests, r), 100);
  assert.equal(detectProfile(tests, r).id, 'extension');
});

check('yalnızca alan adları engellendi → profil "dns", NXDOMAIN ipucu', () => {
  const r = scenario((x) => (x.method === 'fetch' ? (x.id % 3 === 0 ? 'timeout' : 'blocked') : 'allowed'));
  const p = detectProfile(tests, r);
  assert.equal(p.id, 'dns');
  assert.ok(p.tips.includes('tip.nxdomain'));
  assert.ok(p.tips.includes('tip.dnsNoCosmetic'));
});

check('Brave her durumda "brave"', () => {
  const r = scenario(() => 'allowed');
  assert.equal(detectProfile(tests, r, { isBrave: true }).id, 'brave');
});

check('yalnızca içerik filtreleri engellendi → ISS ipucu', () => {
  const r = scenario((x) => (x.cat.scored === 'content' ? 'blocked' : 'allowed'));
  const p = detectProfile(tests, r);
  assert.equal(p.id, 'none');
  assert.ok(p.tips.includes('tip.isp'));
  assert.equal(weightedScore(CATEGORIES, tests, r), 0);
});

check('ulaşılamayan alan adları skordan çıkar', () => {
  const ads = CATEGORIES.find((c) => c.id === 'ads');
  const adTests = tests.filter((x) => x.cat === ads);
  const keep = adTests[0].id;
  const r = scenario((x) => (x.cat !== ads ? 'allowed' : x.id === keep ? 'blocked' : 'unreachable'));
  const s = tally(adTests, r);
  assert.equal(s.counted, 1);
  assert.equal(percent(s), 100);
  const allWeights = CATEGORIES.reduce((sum, c) => sum + (c.weight || 0), 0);
  assert.equal(weightedScore(CATEGORIES, tests, r), Math.round((ads.weight / allWeights) * 100));
});

check('bölgesel paket kapalıyken skor yine 100 üzerinden', () => {
  const r = scenario(() => 'blocked');
  for (const x of tests) if (x.cat.scored === 'regional') r.delete(x.id);
  assert.equal(weightedScore(CATEGORIES, tests, r), 100);
  const onlyRegional = scenario((x) => (x.cat.scored === 'regional' ? 'blocked' : 'allowed'));
  const turkey = CATEGORIES.find((c) => c.id === 'turkey');
  const mainWeights = CATEGORIES.filter((c) => c.scored === 'main').reduce((sum, c) => sum + c.weight, 0);
  assert.equal(weightedScore(CATEGORIES, tests, onlyRegional), Math.round((turkey.weight / (mainWeights + turkey.weight)) * 100));
});

check('eklenti CNAME izleyicilerini kaçırıyorsa CNAME ipucu', () => {
  const r = scenario((x) => (x.cat.id === 'cname' ? 'allowed' : 'blocked'));
  const p = detectProfile(tests, r);
  assert.equal(p.id, 'extension');
  assert.ok(p.tips.includes('tip.cname'));
  assert.ok(!detectProfile(tests, scenario(() => 'blocked')).tips.includes('tip.cname'));
});

check('içerik filtreleri ana skoru etkilemez', () => {
  const r = scenario((x) => (x.cat.scored !== 'content' ? 'blocked' : 'allowed'));
  assert.equal(weightedScore(CATEGORIES, tests, r), 100);
});

// liste tespiti
const TIERS = ['light', 'normal', 'pro', 'proplus', 'ultimate'];
const tiersFrom = (tier) => TIERS.slice(TIERS.indexOf(tier));
const data = {
  lists: [...TIERS, 'oisd-small', 'oisd-big', 'tif'].map((id) => ({ id, name: id, short: id, kind: 'x', url: `https://example.com/${id}` })),
  domains: {},
};
for (const tier of TIERS) {
  for (let i = 1; i <= 3; i++) data.domains[`${tier}${i}.test`] = tiersFrom(tier);
}
data.domains['o1.test'] = ['oisd-big'];
data.domains['o2.test'] = ['oisd-big'];
data.domains['o3.test'] = ['oisd-big'];
data.domains['os1.test'] = ['oisd-small', 'oisd-big'];
data.domains['os2.test'] = ['oisd-small', 'oisd-big'];
data.domains['t1.test'] = ['tif'];
data.domains['t2.test'] = ['tif'];

const outcomesFor = (blockedPrefixes) => new Map(Object.keys(data.domains)
  .map((h) => [h, blockedPrefixes.some((p) => h.startsWith(p)) ? 'blocked' : 'allowed']));
const statusOf = (res, id) => res.lists.find((l) => l.id === id).status;

check('HaGeZi PRO + TIF aktif, OISD değil', () => {
  const res = detectLists(data, outcomesFor(['light', 'normal', 'pro1', 'pro2', 'pro3', 't']));
  assert.equal(res.activeTier, 'pro');
  assert.equal(statusOf(res, 'light'), 'active');
  assert.equal(statusOf(res, 'pro'), 'active');
  assert.equal(statusOf(res, 'proplus'), 'inactive');
  assert.equal(statusOf(res, 'ultimate'), 'inactive');
  assert.equal(statusOf(res, 'tif'), 'active');
  assert.equal(statusOf(res, 'oisd-big'), 'inactive');
});

check('yalnızca OISD Big aktif', () => {
  const res = detectLists(data, outcomesFor(['o1', 'o2', 'o3', 'os']));
  assert.equal(res.activeTier, null);
  assert.equal(statusOf(res, 'oisd-big'), 'active');
  assert.equal(statusOf(res, 'oisd-small'), 'active');
  assert.equal(statusOf(res, 'light'), 'inactive');
});

check('liste verisi yoksa tespit yapılmaz', () => {
  assert.equal(detectLists(null, new Map()), null);
});

// kural üretici
const ruleData = { domains: { 'safe.test': ['light'], 'risky.test': ['ultimate'], 'unlisted.test': [] } };
const ruleInput = { hosts: ['risky.test', 'safe.test', 'unlisted.test', 'safe.test'], selectors: ['.ad-banner'], listData: ruleData, date: new Date('2026-01-02') };

check('kural formatları ve güvenli/agresif ayrımı', () => {
  const adblock = buildRules({ ...ruleInput, format: 'adblock' });
  assert.ok(adblock.startsWith('! '));
  assert.ok(adblock.includes('2026-01-02'));
  assert.ok(adblock.indexOf('||safe.test^') < adblock.indexOf('||risky.test^'), 'güvenli blok önce');
  assert.ok(adblock.includes('||unlisted.test^'));
  assert.equal(adblock.match(/\|\|safe\.test\^/g).length, 1, 'tekrarlar ayıklanır');
  assert.ok(adblock.includes('##.ad-banner'));

  const domains = buildRules({ ...ruleInput, format: 'domains' });
  assert.ok(domains.split('\n').includes('safe.test'));
  assert.ok(!domains.includes('##'), 'kozmetik yalnızca adblock formatında');

  const hosts = buildRules({ ...ruleInput, format: 'hosts' });
  assert.ok(hosts.includes('0.0.0.0 risky.test'));
  assert.ok(hosts.startsWith('# '));
});

check('varsayılan kural formatı profile göre', () => {
  assert.equal(defaultFormat('dns'), 'domains');
  assert.equal(defaultFormat('extension'), 'adblock');
  assert.equal(defaultFormat('none'), 'adblock');
});

// geçmiş
check('iki çalıştırma arasındaki fark', () => {
  const a = { score: 60, cats: { ads: 50, cname: null }, results: { 'ads|x': 'allowed', 'ads|y': 'blocked', 'ads|z': 'unreachable', 'ads|old': 'blocked' } };
  const b = { score: 75, cats: { ads: 80, cname: 10 }, results: { 'ads|x': 'timeout', 'ads|y': 'allowed', 'ads|z': 'blocked', 'ads|new': 'blocked' } };
  const d = diffRuns(a, b);
  assert.equal(d.scoreDelta, 15);
  assert.deepEqual(d.catDeltas, { ads: 30 });
  assert.deepEqual(d.newlyBlocked, ['ads|x']);
  assert.deepEqual(d.newlyAllowed, ['ads|y']);
  assert.ok(resultKey(tests[0]).startsWith('ads|'));
});

// tasarruf
check('tasarruf tahmini', () => {
  const google = tests.find((x) => x.group.name === 'Google Ads');
  const googleKey = google.groupKey;
  const sizes = Object.fromEntries(CATEGORIES.flatMap((c) => c.groups.flatMap((g) => g.payloads || [])).map((u) => [u, 1000]));
  const r = scenario((x) => (x.groupKey === googleKey ? 'blocked' : 'allowed'));
  const s = estimateSavings(tests, r, { payloads: sizes });
  assert.equal(s.blockedBytes, google.group.payloads.length * 1000);
  assert.ok(s.loadedBytes > 0);
  assert.equal(s.blockedRequests, tests.filter((x) => x.groupKey === googleKey).length);
  assert.equal(estimateSavings(tests, r, null), null);
});

console.log(`\n${passed} test geçti`);
