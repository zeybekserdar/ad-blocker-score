// genel gizleme kuralları yeni eklenen elementlere biraz geç uygulanıyor, o yüzden bekliyoruz

const WAIT_MS = 1500;

function createBait(spec) {
  const el = document.createElement(spec.tag || 'div');
  if (spec.id) el.id = spec.id;
  if (spec.className) el.className = spec.className;
  for (const [name, value] of Object.entries(spec.attrs || {})) el.setAttribute(name, value);
  el.textContent = ' ';
  return el;
}

function inspect(el, sandbox) {
  if (!el.isConnected || el.parentNode !== sandbox) {
    return { status: 'blocked', detailKey: 'detail.removed' };
  }
  const style = getComputedStyle(el);
  let how = null;
  if (style.display === 'none') how = 'display: none';
  else if (style.visibility === 'hidden') how = 'visibility: hidden';
  else if (Number(style.opacity) === 0) how = 'opacity: 0';
  else if (el.offsetHeight === 0 || el.offsetWidth === 0) how = 'size: 0';

  return how
    ? { status: 'blocked', detailKey: 'detail.hidden', detailVars: { how } }
    : { status: 'allowed', detailKey: 'detail.visible' };
}

export async function runCosmetic(specs) {
  const sandbox = document.getElementById('test-sandbox');
  sandbox.replaceChildren();
  const start = performance.now();
  const els = specs.map((spec) => sandbox.appendChild(createBait(spec)));

  await new Promise((resolve) => setTimeout(resolve, WAIT_MS));

  const ms = Math.round(performance.now() - start);
  const results = els.map((el) => ({ ...inspect(el, sandbox), ms }));
  sandbox.replaceChildren();
  return results;
}
