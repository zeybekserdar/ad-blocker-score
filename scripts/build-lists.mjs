// HaGeZi/OISD listelerinden data/lists.json üretir. node 20+, bağımlılık yok.

import { Resolver } from 'node:dns/promises';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import https from 'node:https';
import { CATEGORIES, hostOf } from '../js/tests.js';

const OUT = new URL('../data/lists.json', import.meta.url);
const HAGEZI = 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main';

const hagezi = (id, file, name, short, kind) => ({
  id, name, short, kind,
  src: `${HAGEZI}/wildcard/${file}-onlydomains.txt`,
  url: `${HAGEZI}/adblock/${file}.txt`,
});

// kademeler düşükten yükseğe, id'ler js/lists.js'teki HAGEZI_TIERS ile aynı olmalı
const LISTS = [
  hagezi('light', 'light', 'HaGeZi Light', 'Light', 'tier'),
  hagezi('normal', 'multi', 'HaGeZi Normal', 'Normal', 'tier'),
  hagezi('pro', 'pro', 'HaGeZi PRO', 'PRO', 'tier'),
  hagezi('proplus', 'pro.plus', 'HaGeZi PRO++', 'PRO++', 'tier'),
  hagezi('ultimate', 'ultimate', 'HaGeZi ULTIMATE', 'ULTIMATE', 'tier'),
  { id: 'oisd-small', name: 'OISD Small', short: 'OISD S', kind: 'oisd', src: 'https://small.oisd.nl/domainswild2', url: 'https://small.oisd.nl/' },
  { id: 'oisd-big', name: 'OISD Big', short: 'OISD', kind: 'oisd', src: 'https://big.oisd.nl/domainswild2', url: 'https://big.oisd.nl/' },
  hagezi('tif', 'tif', 'HaGeZi Threat Intelligence Feeds', 'TIF', 'extra'),
  hagezi('popupads', 'popupads', 'HaGeZi Pop-Up Ads', 'Pop-Up', 'extra'),
  hagezi('dyndns', 'dyndns', 'HaGeZi Dynamic DNS', 'DynDNS', 'extra'),
  hagezi('doh', 'doh', 'HaGeZi DoH/DNS Bypass', 'DoH', 'extra'),
  hagezi('bypass', 'doh-vpn-proxy-bypass', 'HaGeZi DoH/VPN/TOR/Proxy Bypass', 'Bypass', 'extra'),
  hagezi('gambling', 'gambling', 'HaGeZi Gambling', 'Gambling', 'extra'),
  hagezi('social', 'social', 'HaGeZi Social Networks', 'Social', 'extra'),
  hagezi('antipiracy', 'anti.piracy', 'HaGeZi Anti-Piracy', 'Piracy', 'extra'),
  hagezi('urlshortener', 'urlshortener', 'HaGeZi URL Shortener', 'Shortener', 'extra'),
];

const hosts = [...new Set(CATEGORIES.flatMap((cat) => cat.groups
  .filter((g) => (g.method || 'fetch') === 'fetch')
  .flatMap((g) => g.items.map(hostOf))))].sort();
const payloadUrls = [...new Set(CATEGORIES.flatMap((cat) => cat.groups.flatMap((g) => g.payloads || [])))].sort();

// makinedeki DNS filtresi (pi-hole vs.) sonuçları bozmasın
const resolver = new Resolver({ timeout: 3000, tries: 2 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);

async function download(list) {
  const res = await fetch(list.src);
  if (!res.ok) throw new Error(`${list.id}: HTTP ${res.status}`);
  const text = await res.text();
  const set = new Set();
  for (const line of text.split('\n')) {
    const d = line.trim().toLowerCase();
    if (d && !d.startsWith('#')) set.add(d);
  }
  return set;
}

// wildcard format: example.com alt domainleri de kapsıyor
function contains(set, host) {
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (set.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

async function cnameOf(host) {
  try {
    const [target] = await resolver.resolveCname(host);
    return target || null;
  } catch {
    return null;
  }
}

// sıkıştırılmış aktarım boyutu, redirect'leri takip ediyor
function transferSize(url, redirects = 3) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      headers: { 'accept-encoding': 'gzip, br', 'user-agent': 'Mozilla/5.0 (adblocker-tester size probe)' },
      timeout: 10000,
      lookup: (hostname, options, cb) => {
        resolver.resolve4(hostname)
          .then((addrs) => (options.all ? cb(null, addrs.map((address) => ({ address, family: 4 }))) : cb(null, addrs[0], 4)))
          .catch((err) => cb(err));
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        resolve(transferSize(new URL(res.headers.location, url).href, redirects - 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let bytes = 0;
      res.on('data', (chunk) => { bytes += chunk.length; });
      res.on('end', () => resolve(bytes));
      res.on('error', () => resolve(null));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

async function isDead(host) {
  for (const rr of ['resolve4', 'resolve6']) {
    try {
      await resolver[rr](host);
      return false;
    } catch (err) {
      if (!['ENOTFOUND', 'ENODATA'].includes(err.code)) return false; // timeout vs. ise ölü sayma
    }
  }
  return true;
}

async function main() {
  const domains = Object.fromEntries(hosts.map((h) => [h, []]));

  for (const list of LISTS) {
    const set = await download(list);
    let hits = 0;
    for (const host of hosts) {
      if (contains(set, host)) {
        domains[host].push(list.id);
        hits++;
      }
    }
    console.log(`${list.id.padEnd(13)} ${String(set.size).padStart(9)} entries, ${hits} test hosts`);
  }

  const dead = [];
  const cnames = {};
  for (const host of hosts) {
    if (await isDead(host)) dead.push(host);
    const target = await cnameOf(host);
    if (target) cnames[host] = target;
  }
  if (dead.length) console.log(`Dead hosts: ${dead.join(', ')}`);
  console.log(`CNAMEs: ${Object.keys(cnames).length} hosts`);

  const payloads = {};
  for (const url of payloadUrls) {
    const bytes = await transferSize(url);
    if (bytes) payloads[url] = bytes;
    console.log(`payload ${String(bytes ?? 'FAIL').padStart(7)}  ${url}`);
  }

  const data = {
    updated: new Date().toISOString(),
    lists: LISTS.map(({ src, ...meta }) => meta),
    domains,
    dead,
    cnames,
    payloads,
  };

  // değişiklik yoksa yazma, action boş commit atmasın. betik boyutları her gün biraz
  // oynuyor, ~%10'dan küçük farkları sayma
  try {
    const old = JSON.parse(await readFile(OUT, 'utf8'));
    const roughSizes = (p = {}) => Object.fromEntries(Object.entries(p).map(([u, b]) => [u, Math.round(Math.log(b) * 10)]));
    const same = (d) => JSON.stringify({ ...d, updated: null, payloads: roughSizes(d.payloads) });
    if (same(old) === same(data)) {
      console.log('No changes.');
      return;
    }
  } catch { /* ilk çalıştırma */ }

  await mkdir(new URL('.', OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(data, null, 1)}\n`);
  console.log(`Wrote data/lists.json (${hosts.length} hosts).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
