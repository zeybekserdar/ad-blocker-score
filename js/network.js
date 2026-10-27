// sonuç: { status: 'blocked' | 'allowed' | 'timeout' | 'unreachable', ms, error?, detailKey?, detailVars? }

import { toUrl } from './tests.js';

export const TIMEOUT_MS = 5000;

const elapsed = (start) => Math.round(performance.now() - start);

// no-cors yanıtı okunamıyor ama isteğin gidip gitmediğini anlamaya yetiyor.
// eklenti ya da DNS engeli fetch'i TypeError ile düşürüyor.
export function testUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = performance.now();

  return fetch(url, {
    mode: 'no-cors',
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: controller.signal,
  })
    .then(() => ({ status: 'allowed' }))
    .catch((err) => (controller.signal.aborted
      ? { status: 'timeout', detailKey: 'detail.timeout' }
      : { status: 'blocked', error: `${err.name}: ${err.message}` }))
    .then((result) => {
      clearTimeout(timer);
      return { ...result, ms: elapsed(start) };
    });
}

// başarısız istekleri ölü sunuculardan ayırmak için bir kez daha deniyoruz:
//   ikisi de hızlı düştüyse -> engel (DNS/eklenti anında kesiyor)
//   ikisi de yavaşsa -> sunucu ayakta ama reddediyor (sertifika, CORP, reset), geçti say
//   önce yavaş sonra hızlıysa -> ölü domain (negatif DNS cache), skora katma
export async function probe(url, ctx) {
  const first = await testUrl(url);
  if (first.status !== 'blocked') return first;

  const second = await testUrl(url);
  if (second.status !== 'blocked') return second;

  const fast1 = first.ms < ctx.fastMs;
  const fast2 = second.ms < ctx.fastMs;
  const timing = { first: first.ms, second: second.ms, fast: ctx.fastMs };

  if (!fast1 && fast2) {
    return { status: 'unreachable', ms: first.ms, detailKey: 'detail.dead', detailVars: timing };
  }
  if (!fast1 && !fast2) {
    return { status: 'allowed', ms: first.ms, detailKey: 'detail.refused', detailVars: timing };
  }
  return { status: 'blocked', ms: first.ms, error: first.error };
}

// fastMs: bundan kısa sürede düşen istek "anında reddedildi" sayılıyor
export async function runControl(localPath, hosts) {
  const local = await testUrl(new URL(`${localPath}?r=${Date.now()}`, location.href).href);
  const remote = await Promise.all(hosts.map((host) => testUrl(toUrl(host)).then((r) => ({ host, ...r }))));

  const okMs = remote.filter((r) => r.status === 'allowed').map((r) => r.ms).sort((a, b) => a - b);
  const median = okMs.length ? okMs[Math.floor(okMs.length / 2)] : 0;
  const fastMs = Math.min(250, Math.max(40, Math.round(median * 0.5)));

  let state = 'ok';
  if (local.status !== 'allowed') state = 'local';
  else if (okMs.length * 2 < hosts.length) state = 'offline';

  return { state, fastMs, median, results: remote };
}

// yüklendi ama bayrak set edilmediyse boş bir stub'a yönlendirilmiş demek
export function testScript(src, flag) {
  return new Promise((resolve) => {
    const start = performance.now();
    const el = document.createElement('script');
    const finish = (result) => {
      clearTimeout(timer);
      el.remove();
      resolve({ ...result, ms: elapsed(start) });
    };
    const timer = setTimeout(() => finish({ status: 'timeout', detailKey: 'detail.timeout' }), TIMEOUT_MS);

    if (window.__abtBait) delete window.__abtBait[flag];
    el.src = `${src}?r=${Date.now()}`;
    el.async = true;
    el.onload = () => finish(window.__abtBait?.[flag]
      ? { status: 'allowed' }
      : { status: 'blocked', detailKey: 'detail.redirected' });
    el.onerror = () => finish({ status: 'blocked', error: 'script onerror' });
    document.head.appendChild(el);
  });
}

// bazı engelleyiciler 1x1 şeffaf gif'e yönlendiriyor, boyuta da bak
export function testImage(src) {
  return new Promise((resolve) => {
    const start = performance.now();
    const img = new Image();
    const finish = (result) => {
      clearTimeout(timer);
      resolve({ ...result, ms: elapsed(start) });
    };
    const timer = setTimeout(() => finish({ status: 'timeout', detailKey: 'detail.timeout' }), TIMEOUT_MS);

    img.onload = () => finish(img.naturalWidth > 1
      ? { status: 'allowed' }
      : { status: 'blocked', detailKey: 'detail.redirected' });
    img.onerror = () => finish({ status: 'blocked', error: 'image onerror' });
    img.src = `${src}?r=${Date.now()}`;
  });
}

export async function runPool(tasks, limit) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}
