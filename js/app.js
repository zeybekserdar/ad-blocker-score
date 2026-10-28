import { CATEGORIES, CONTROL, buildTests } from './tests.js';
import { probe, runControl, testScript, testImage, runPool } from './network.js';
import { runCosmetic } from './cosmetic.js';
import { tally, percent, weightedScore, level, isBlocked, isCounted } from './score.js';
import { detectProfile } from './profile.js';
import { loadLists, badgesFor, detectLists, cnameOf } from './lists.js';
import { buildRules, defaultFormat, RULE_FORMATS } from './rules.js';
import { loadRuns, addRun, updateRun, deleteRun, clearRuns, diffRuns, resultKey } from './history.js';
import { estimateSavings } from './savings.js';
import { t, getLang, setLang, applyI18n } from './i18n.js';
import { store } from './storage.js';

const CONCURRENCY = 6;
const RING_LENGTH = 326.73; // 2πr, r = 52
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

const tests = buildTests();
// bölgesel paketler de skora girdiği için ana kartlarla birlikte
const mainCats = CATEGORIES.filter((c) => c.scored !== 'content');
const contentCats = CATEGORIES.filter((c) => c.scored === 'content');
const testByKey = new Map(tests.map((x) => [resultKey(x), x]));

const results = new Map();
let running = false;
let control = null;
let profile = null;
let listData = null;
let listResult = null;
let customResult = null;
let filter = 'all';
let isBrave = false;
let rulesFormat = null; // null ise profile göre seçiliyor
let rulesContent = false;
let rulesText = '';
let historySel = { a: null, b: null };
// kullanıcının bilerek engellemediği kategoriler: test ediliyor ama skora girmiyor
const excludable = new Set(mainCats.filter((c) => c.weight).map((c) => c.id));
const excluded = new Set((store.get('excluded') || '').split(',').filter((id) => excludable.has(id)));

const $ = (id) => document.getElementById(id);
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const groupName = (group) => (group.nameKey ? t(group.nameKey) : group.name);
const target = (test) => test.url || test.src || test.label;
const detail = (r) => (r.detailKey ? t(r.detailKey, r.detailVars) : r.error || '');
const statusClass = (r) => (r ? r.status : running ? 'running' : '');
const contentEnabled = () => $('content-toggle').checked;
const regionalEnabled = () => $('regional-toggle').checked;
const isActiveCat = (cat) => cat.scored === 'main'
  || (cat.scored === 'content' && contentEnabled())
  || (cat.scored === 'regional' && regionalEnabled());
const activeTests = () => tests.filter((x) => isActiveCat(x.cat));
const isScoredCat = (cat) => isActiveCat(cat) && !excluded.has(cat.id);
const scoredTests = () => tests.filter((x) => isScoredCat(x.cat));
const kb = (bytes) => Math.max(1, Math.round(bytes / 1024));
const testsOf = (cat) => tests.filter((x) => x.cat === cat);
const matchesFilter = (r) => filter === 'all' || (filter === 'blocked' ? isBlocked(r) : r.status === 'allowed');

const badgesHtml = (host) => {
  const badges = badgesFor(listData, host);
  return badges.length
    ? `<span class="badges">${badges.map((b) => `<span class="badge ${b.kind}">${esc(b.label)}</span>`).join('')}</span>`
    : '';
};

function cardHtml(cat) {
  const groups = cat.groups.map((group, gi) => {
    const key = `${cat.id}:${gi}`;
    const groupTests = tests.filter((x) => x.groupKey === key);
    return `
      <details class="group" data-key="${key}">
        <summary>
          <span class="group-name">${esc(groupName(group))}</span>
          <span class="group-dots">${groupTests.map((x) => `<span class="dot" data-dot="${x.id}"></span>`).join('')}</span>
          <span class="group-count" data-count="${key}"></span>
        </summary>
        <ul class="items">
          ${groupTests.map((x) => {
            const cname = x.cat.id === 'cname' && cnameOf(listData, x.host);
            return `<li data-item="${x.id}"><span class="dot"></span><code>${esc(x.label)}</code>${x.host ? badgesHtml(x.host) : ''}${cname ? `<span class="cname">→ ${esc(cname)}</span>` : ''}</li>`;
          }).join('')}
        </ul>
      </details>`;
  }).join('');

  const weight = cat.weight ? `<span class="cat-weight">${esc(t('card.weight', { n: cat.weight }))}</span>` : '';
  const toggle = excludable.has(cat.id)
    ? `<label class="check cat-toggle"><input type="checkbox" data-score-toggle="${cat.id}"${excluded.has(cat.id) ? '' : ' checked'}><span>${esc(t('card.inScore'))}</span></label>`
    : '';
  return `
    <article class="card" data-cat="${cat.id}">
      <div class="card-head">
        <div class="card-title"><h3>${esc(t(`cat.${cat.id}`))}</h3>${weight}</div>
        <span class="cat-score" data-score="${cat.id}">-</span>
      </div>
      ${toggle}
      <p class="muted small">${esc(t(`cat.${cat.id}.desc`))}</p>
      <div class="bar"><span data-bar="${cat.id}"></span></div>
      <p class="small muted" data-summary="${cat.id}"></p>
      <div class="groups">${groups}</div>
    </article>`;
}

function buildCategories() {
  // dil değişince açık gruplar kapanmasın
  const open = new Set([...document.querySelectorAll('.group[open]')].map((el) => el.dataset.key));
  $('categories-main').innerHTML = mainCats.map(cardHtml).join('');
  $('categories-content').innerHTML = contentCats.map(cardHtml).join('');
  document.querySelectorAll('.group').forEach((el) => { el.open = open.has(el.dataset.key); });
  $('badges-hint').hidden = !listData;
  update();
}

let updateQueued = false;
function scheduleUpdate() {
  if (updateQueued) return;
  updateQueued = true;
  requestAnimationFrame(() => {
    updateQueued = false;
    update();
  });
}

function update() {
  const root = $('results');

  for (const test of tests) {
    const r = results.get(test.id);
    const cls = statusClass(r);
    const tip = r ? `${t(`status.${r.status}`)}${detail(r) ? `: ${detail(r)}` : ''}` : t('status.pending');
    root.querySelector(`[data-dot="${test.id}"]`).className = `dot ${cls}`;
    const li = root.querySelector(`[data-item="${test.id}"]`);
    li.className = cls;
    li.title = tip;
    li.firstElementChild.className = `dot ${cls}`;
  }

  for (const cat of CATEGORIES) {
    cat.groups.forEach((group, gi) => {
      const key = `${cat.id}:${gi}`;
      const s = tally(tests.filter((x) => x.groupKey === key), results);
      root.querySelector(`[data-count="${key}"]`).textContent = s.counted ? `${s.blocked}/${s.counted}` : `-/${s.total}`;
    });

    const s = tally(testsOf(cat), results);
    const pct = percent(s);
    const card = root.querySelector(`[data-cat="${cat.id}"]`);
    card.dataset.level = level(pct);
    card.hidden = cat.scored === 'regional' && !regionalEnabled();
    card.classList.toggle('excluded', excluded.has(cat.id));
    root.querySelector(`[data-score="${cat.id}"]`).textContent = pct === null ? '-' : `${pct}%`;
    root.querySelector(`[data-bar="${cat.id}"]`).style.width = `${pct ?? 0}%`;
    root.querySelector(`[data-summary="${cat.id}"]`).textContent = s.done
      ? t('card.summary', { blocked: s.blocked, total: s.counted }) + (s.unreachable ? t('card.unreachable', { n: s.unreachable }) : '')
      : '';
  }

  const contentPct = percent(tally(tests.filter((x) => x.cat.scored === 'content'), results));
  $('content-score').textContent = contentPct === null ? '' : t('section.contentScore', { pct: contentPct });
  $('content-section').hidden = !contentEnabled();

  updateScore();
  updateButton();
  updateExpandButton();
  updateDev();
  renderAnalysis();
}

// kapalı paketlerin ve skordan çıkarılan kategorilerin sonuçları skora karışmasın
const currentScore = () => weightedScore(CATEGORIES, scoredTests(), results);

function updateScore() {
  const s = tally(scoredTests().filter((x) => x.cat.scored !== 'content'), results);
  const score = currentScore();
  const lvl = level(score);

  document.querySelector('.score-card').dataset.level = lvl;
  $('score-num').textContent = score === null ? '-' : String(score);
  $('ring-value').style.strokeDashoffset = RING_LENGTH * (1 - (score ?? 0) / 100);
  $('rating').textContent = score === null ? t('score.idle') : t(`rating.${lvl}`);
  $('rating-desc').textContent = score === null
    ? t('score.idleDesc')
    : t('score.summary', { blocked: s.blocked, counted: s.counted });
  const nExcluded = mainCats.filter((c) => isActiveCat(c) && excluded.has(c.id)).length;
  $('score-note').hidden = !nExcluded;
  $('score-note').textContent = nExcluded ? t('score.excluded', { n: nExcluded }) : '';

  $('count-blocked').textContent = s.blocked - s.timeout;
  $('count-allowed').textContent = s.allowed;
  $('count-timeout').textContent = s.timeout;
  $('count-unreachable').textContent = s.unreachable;
}

function updateButton() {
  $('start-btn').disabled = running;
  $('content-toggle').disabled = running;
  $('regional-toggle').disabled = running;
  $('start-label').textContent = running
    ? t('btn.running', { done: results.size, total: activeTests().length })
    : t(results.size ? 'btn.rerun' : 'btn.start');
}

function renderControl() {
  const box = $('control-msg');
  const key = control?.state === 'offline' ? 'control.offline' : control?.state === 'local' ? 'control.local' : null;
  box.hidden = !key;
  box.textContent = key ? t(key) : '';

  $('control-info').textContent = control
    ? t('control.info', {
      ok: control.results.filter((r) => r.status === 'allowed').length,
      total: control.results.length,
      median: control.median,
      fast: control.fastMs,
    })
    : '';
}

function setFilter(next) {
  filter = next;
  $('results').dataset.filter = next;
  document.querySelectorAll('.segmented [data-filter]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.filter === next));
  });
  // filtre açıkken kapalı gruplar boş görünüyor
  if (next !== 'all') document.querySelectorAll('.group').forEach((el) => { el.open = true; });
  updateExpandButton();
  updateDev();
}

const allGroupsOpen = () => [...document.querySelectorAll('.group')].every((el) => el.open);

function updateExpandButton() {
  $('expand-btn').textContent = t(allGroupsOpen() ? 'filter.collapse' : 'filter.expand');
}

function toggleAllGroups() {
  const open = !allGroupsOpen();
  document.querySelectorAll('.group').forEach((el) => { el.open = open; });
  updateExpandButton();
}

function renderAnalysis() {
  const show = !running && profile !== null;
  $('analysis').hidden = !show;
  if (!show) return;

  $('profile-card').innerHTML = `
    <span class="panel-kicker">${esc(t('profile.title'))}</span>
    <span class="profile-name">${esc(t(`profile.${profile.id}`))}</span>
    <p class="muted small">${esc(t(`profile.${profile.id}.desc`))}</p>
    <p class="small">${esc(t('profile.stats', profile.stats))}</p>
    ${profile.tips.length ? `<ul class="tips">${profile.tips.map((key) => `<li>${esc(t(key))}</li>`).join('')}</ul>` : ''}`;

  renderSavings();
  renderRules();

  const card = $('lists-card');
  card.hidden = !listResult;
  if (!listResult) return;

  const tierName = listResult.activeTier
    ? listData.lists.find((l) => l.id === listResult.activeTier).name
    : null;
  const rows = listResult.lists.map((l) => `
    <tr>
      <td>${esc(l.name)}</td>
      <td><span class="list-status ${l.status}">${esc(t(`lists.status.${l.status}`))}</span>${l.weak ? ` <span class="muted small">(${esc(t('lists.weak'))})</span>` : ''}</td>
      <td class="num">${l.tested ? `${l.blocked}/${l.tested}` : '-'}</td>
      <td>${l.status === 'active' ? '' : `<button type="button" class="link-btn" data-copy="${esc(l.url)}">${esc(t('lists.copy'))}</button>`}</td>
    </tr>`).join('');

  card.innerHTML = `
    <span class="panel-kicker">${esc(t('lists.title'))}</span>
    <span class="profile-name">${esc(tierName ? t('lists.tier', { tier: tierName }) : t('lists.noTier'))}</span>
    <p class="muted small">${esc(t('lists.lead'))}</p>
    ${profile.id === 'extension' || profile.id === 'brave' ? `<p class="notice">${esc(t('lists.extensionNote'))}</p>` : ''}
    <div class="table-wrap">
      <table class="lists-table">
        <thead><tr>
          <th>${esc(t('lists.th.list'))}</th><th>${esc(t('lists.th.status'))}</th>
          <th>${esc(t('lists.th.coverage'))}</th><th>${esc(t('lists.th.add'))}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="muted small">${esc(t('lists.updated', { date: new Date(listData.updated).toLocaleDateString(getLang()) }))}</p>`;
}

function renderSavings() {
  const card = $('savings-card');
  const s = estimateSavings(activeTests(), results, listData);
  card.hidden = !s;
  if (!s) return;
  card.innerHTML = `
    <span class="panel-kicker">${esc(t('savings.title'))}</span>
    <div><span class="big-number">${esc(t('savings.kb', { kb: s.blockedBytes ? kb(s.blockedBytes) : 0 }))}</span>
      <span class="muted">${esc(t('savings.headline'))}</span></div>
    <ul class="stat-list">
      <li><span class="muted">${esc(t('savings.requests'))}</span><strong>${s.blockedRequests}</strong></li>
      <li><span class="muted">${esc(t('savings.loaded'))}</span><strong>${esc(t('savings.kb', { kb: s.loadedBytes ? kb(s.loadedBytes) : 0 }))}</strong></li>
      <li><span class="muted">${esc(t('savings.time'))}</span><strong>${esc(t('savings.seconds', { s: s.seconds.toFixed(1) }))}</strong></li>
    </ul>
    <p class="muted small panel-note">${esc(t('savings.note'))}</p>`;
}

function passedForRules() {
  // skordan çıkarılan kategoriler bilerek açık bırakılmış, kurala dönüşmesin
  const active = activeTests().filter((x) => !excluded.has(x.cat.id));
  const passed = (x) => results.get(x.id)?.status === 'allowed';
  return {
    hosts: active.filter((x) => x.method === 'fetch' && passed(x) && (rulesContent || x.cat.scored !== 'content')).map((x) => x.host),
    selectors: active.filter((x) => x.method === 'cosmetic' && passed(x)).map((x) => x.spec.label),
    hasContent: active.some((x) => x.method === 'fetch' && x.cat.scored === 'content' && passed(x)),
  };
}

function renderRules() {
  const card = $('rules-card');
  const { hosts, selectors, hasContent } = passedForRules();
  card.hidden = !hosts.length && !selectors.length && !hasContent;
  if (card.hidden) return;

  const format = rulesFormat || defaultFormat(profile.id);
  rulesText = buildRules({
    hosts,
    selectors,
    format,
    listData,
    labels: {
      title: t('rules.header.title'),
      safe: t('rules.header.safe'),
      risky: t('rules.header.risky'),
      cosmetic: t('rules.header.cosmetic'),
    },
  });

  card.innerHTML = `
    <span class="panel-kicker">${esc(t('rules.title'))}</span>
    <p class="muted small">${esc(t('rules.lead', { hosts: new Set(hosts).size, selectors: selectors.length }))}</p>
    <div class="rules-toolbar">
      <div class="segmented" role="group">
        ${RULE_FORMATS.map((f) => `<button type="button" data-format="${f}" aria-pressed="${f === format}">${esc(t(`rules.format.${f}`))}</button>`).join('')}
      </div>
      ${hasContent ? `<label class="check"><input type="checkbox" data-rules-content${rulesContent ? ' checked' : ''}><span>${esc(t('rules.includeContent'))}</span></label>` : ''}
    </div>
    <textarea class="rules-text" readonly spellcheck="false">${esc(rulesText)}</textarea>
    <div class="btn-row">
      <button type="button" class="btn-secondary" data-rules-copy>${esc(t('rules.copy'))}</button>
      <button type="button" class="btn-secondary" data-rules-download>${esc(t('rules.download'))}</button>
    </div>
    <p class="muted small">${esc(t('rules.warning'))}</p>`;
}

function downloadRules() {
  const format = rulesFormat || defaultFormat(profile.id);
  const url = URL.createObjectURL(new Blob([rulesText], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `ad-blocker-score-${format}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function onRulesClick(e) {
  const formatBtn = e.target.closest('[data-format]');
  if (formatBtn) {
    rulesFormat = formatBtn.dataset.format;
    renderRules();
  } else if (e.target.closest('[data-rules-copy]')) {
    copyWithFeedback(e.target.closest('[data-rules-copy]'), rulesText, 'rules.copy');
  } else if (e.target.closest('[data-rules-download]')) {
    downloadRules();
  }
}

function browserName() {
  if (isBrave) return 'Brave';
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return '';
}

function saveCurrentRun() {
  const active = activeTests();
  addRun({
    id: Date.now(),
    date: new Date().toISOString(),
    label: '',
    score: currentScore(),
    contentScore: contentEnabled() ? percent(tally(active.filter((x) => x.cat.scored === 'content'), results)) : null,
    profile: profile.id,
    browser: browserName(),
    regional: regionalEnabled(),
    excluded: [...excluded],
    cats: Object.fromEntries(CATEGORIES.filter(isActiveCat).map((cat) => [cat.id, percent(tally(testsOf(cat), results))])),
    results: Object.fromEntries(active.filter((x) => results.has(x.id)).map((x) => [resultKey(x), results.get(x.id).status])),
  });
  historySel = { a: null, b: null };
}

const runDate = (run) => new Date(run.date).toLocaleString(getLang(), { dateStyle: 'short', timeStyle: 'short' });
const runTitle = (run) => `${runDate(run)} · ${run.label || t('history.unnamed')} · ${run.score ?? '-'}`;

function keyLabel(key) {
  const test = testByKey.get(key);
  const [catId, target] = key.split('|');
  return { cat: t(`cat.${catId}`), target: test ? test.label : target };
}

function deltaHtml(n) {
  if (!n) return '<span class="muted">±0</span>';
  return `<span class="${n > 0 ? 'delta-up' : 'delta-down'}">${n > 0 ? '+' : ''}${n}</span>`;
}

function diffListHtml(title, keys, status) {
  const items = keys.map((key) => {
    const { cat, target } = keyLabel(key);
    return `<li><span class="dot ${status}"></span><code>${esc(target)}</code><span class="muted small">${esc(cat)}</span></li>`;
  }).join('');
  return `<div><strong>${esc(title)}</strong>${keys.length ? `<ul class="diff-list">${items}</ul>` : ''}</div>`;
}

function renderHistory() {
  const body = $('history-body');
  const runs = loadRuns();
  if (!runs.length) {
    body.innerHTML = `<p class="muted small">${esc(t('history.empty'))}</p>`;
    return;
  }

  const byId = new Map(runs.map((r) => [r.id, r]));
  const latest = runs[runs.length - 1];
  if (!byId.has(historySel.b)) historySel.b = latest.id;
  if (!byId.has(historySel.a)) historySel.a = runs.length > 1 ? runs[runs.length - 2].id : null;

  const options = (selected) => [...runs].reverse()
    .map((r) => `<option value="${r.id}"${r.id === selected ? ' selected' : ''}>${esc(runTitle(r))}</option>`).join('');

  let compare = `<p class="muted small">${esc(t('history.single'))}</p>`;
  if (runs.length > 1) {
    const a = byId.get(historySel.a);
    const b = byId.get(historySel.b);
    const d = diffRuns(a, b);
    const chips = Object.entries(d.catDeltas).filter(([, n]) => n)
      .map(([id, n]) => `<span class="chip">${esc(t(`cat.${id}`))} ${deltaHtml(n)}</span>`).join('');
    const changed = d.newlyBlocked.length || d.newlyAllowed.length;
    compare = `
      <div class="history-controls">
        <label>${esc(t('history.before'))} <select data-hist="a">${options(historySel.a)}</select></label>
        <label>${esc(t('history.after'))} <select data-hist="b">${options(historySel.b)}</select></label>
      </div>
      <div class="diff">
        <p class="diff-score">${esc(t('history.score', { a: a.score ?? '-', b: b.score ?? '-' }))} ${d.scoreDelta === null ? '' : deltaHtml(d.scoreDelta)}</p>
        ${chips ? `<div><strong class="small">${esc(t('history.catDeltas'))}</strong><div class="chips">${chips}</div></div>` : ''}
        ${changed ? `<div class="diff-cols">
          ${diffListHtml(t('history.newlyBlocked', { n: d.newlyBlocked.length }), d.newlyBlocked, 'blocked')}
          ${diffListHtml(t('history.newlyAllowed', { n: d.newlyAllowed.length }), d.newlyAllowed, 'allowed')}
        </div>` : `<p class="muted small">${esc(t('history.noChange'))}</p>`}
      </div>`;
  }

  const rows = [...runs].reverse().map((r) => `
    <tr>
      <td>${esc(runDate(r))}</td>
      <td>${esc(r.label || t('history.unnamed'))}${r.browser ? ` <span class="muted small">(${esc(r.browser)})</span>` : ''}</td>
      <td class="num">${r.score ?? '-'}</td>
      <td>${esc(t(`profile.${r.profile}`))}</td>
      <td><button type="button" class="link-btn" data-hist-delete="${r.id}">${esc(t('history.delete'))}</button></td>
    </tr>`).join('');

  body.innerHTML = `
    <div class="history-controls">
      <label>${esc(t('history.labelFor'))}
        <input type="text" data-hist-label="${latest.id}" value="${esc(latest.label)}" placeholder="${esc(t('history.labelPlaceholder'))}" maxlength="60">
      </label>
    </div>
    ${compare}
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>${esc(t('history.th.date'))}</th><th>${esc(t('history.th.label'))}</th>
          <th>${esc(t('history.th.score'))}</th><th>${esc(t('history.th.profile'))}</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div><button type="button" class="btn-secondary" data-hist-clear>${esc(t('history.clear'))}</button></div>`;
}

function onHistoryChange(e) {
  const sel = e.target.closest('[data-hist]');
  if (sel) {
    historySel[sel.dataset.hist] = Number(sel.value);
    renderHistory();
    return;
  }
  const label = e.target.closest('[data-hist-label]');
  if (label) {
    updateRun(Number(label.dataset.histLabel), { label: label.value.trim() });
    renderHistory();
  }
}

function onHistoryClick(e) {
  const del = e.target.closest('[data-hist-delete]');
  if (del) {
    deleteRun(Number(del.dataset.histDelete));
    renderHistory();
  } else if (e.target.closest('[data-hist-clear]')) {
    clearRuns();
    renderHistory();
  }
}

// aynı host birden fazla testte varsa kök url'yi esas al, yol bazlı testler eklentiyi ölçüyor
function hostOutcomes() {
  const outcomes = new Map();
  for (const test of tests) {
    const r = results.get(test.id);
    if (!test.host || !r || !isCounted(r)) continue;
    const isRoot = test.url === `https://${test.host}/`;
    if (!outcomes.has(test.host) || isRoot) outcomes.set(test.host, isBlocked(r) ? 'blocked' : 'allowed');
  }
  return outcomes;
}

function updateDev() {
  const tbody = $('dev-rows');
  if (!results.size) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">${esc(t('dev.empty'))}</td></tr>`;
    return;
  }

  const list = tests.filter((x) => {
    const r = results.get(x.id);
    return r && matchesFilter(r);
  });
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty">${esc(t('dev.noneMatch'))}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((x) => {
    const r = results.get(x.id);
    return `<tr>
      <td>${esc(t(`cat.${x.cat.id}`))}</td>
      <td>${esc(groupName(x.group))}</td>
      <td class="target"><code>${esc(target(x))}</code></td>
      <td>${esc(t(`method.${x.method}`))}</td>
      <td><span class="status"><span class="dot ${r.status}"></span>${esc(t(`status.${r.status}`))}</span></td>
      <td class="num">${r.ms}</td>
      <td>${esc(detail(r))}</td>
    </tr>`;
  }).join('');
}

function buildReport() {
  const catReport = (cat) => {
    const c = tally(testsOf(cat), results);
    return [cat.id, { score: percent(c), blocked: c.blocked, counted: c.counted, unreachable: c.unreachable, weight: cat.weight, inScore: isScoredCat(cat) }];
  };
  return {
    tool: 'ad-blocker-score',
    generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    score: currentScore(),
    regional: regionalEnabled(),
    excluded: [...excluded],
    savings: estimateSavings(activeTests(), results, listData),
    contentScore: percent(tally(tests.filter((x) => x.cat.scored === 'content'), results)),
    control,
    profile,
    lists: listResult && {
      activeTier: listResult.activeTier,
      dataUpdated: listData.updated,
      lists: listResult.lists.map(({ id, status, blocked, tested, weak }) => ({ id, status, blocked, tested, weak })),
    },
    categories: Object.fromEntries(CATEGORIES.map(catReport)),
    results: tests.filter((x) => results.has(x.id)).map((x) => {
      const r = results.get(x.id);
      return {
        category: x.cat.id,
        group: x.group.name || x.group.nameKey,
        target: target(x),
        method: x.method,
        status: r.status,
        ms: r.ms,
        detail: detail(r) || undefined,
      };
    }),
  };
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http'de clipboard API yok
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

async function copyWithFeedback(btn, text, resetKey) {
  const ok = await copyText(text);
  btn.textContent = t(ok ? 'dev.copied' : 'dev.copyFailed');
  clearTimeout(btn.resetTimer);
  btn.resetTimer = setTimeout(() => { btn.textContent = t(resetKey); }, 2000);
}

function record(test, result) {
  results.set(test.id, result);
  scheduleUpdate();
}

function runTest(test, ctx) {
  if (test.method === 'script') return testScript(test.src, test.flag);
  if (test.method === 'image') return testImage(test.src);
  return probe(test.url, ctx);
}

async function runAll() {
  if (running) return;
  running = true;
  results.clear();
  control = null;
  profile = null;
  listResult = null;
  renderControl();
  update();

  control = await runControl(CONTROL.local, CONTROL.hosts);
  renderControl();

  const active = activeTests();
  const ctx = { fastMs: control.fastMs };
  const cosmetic = active.filter((x) => x.method === 'cosmetic');
  const cosmeticDone = runCosmetic(cosmetic.map((x) => x.spec))
    .then((rs) => rs.forEach((r, i) => record(cosmetic[i], r)));

  const tasks = active
    .filter((x) => x.method !== 'cosmetic')
    .map((x) => () => runTest(x, ctx).then((r) => record(x, r)));

  await Promise.all([runPool(tasks, CONCURRENCY), cosmeticDone]);

  profile = detectProfile(active, results, { isBrave });
  listResult = detectLists(listData, hostOutcomes());
  rulesFormat = null;
  running = false;
  saveCurrentRun();
  update();
  renderHistory();
}

function renderCustom() {
  const out = $('custom-result');
  if (!customResult) {
    out.textContent = '';
    return;
  }
  if (customResult.state === 'invalid') {
    out.textContent = t('custom.invalid');
    return;
  }
  if (customResult.state === 'running') {
    out.textContent = t('custom.running');
    return;
  }
  const { host, r } = customResult;
  out.innerHTML = `<span class="dot ${r.status}"></span><code>${esc(host)}</code>
    <strong>${esc(t(`status.${r.status}`))}</strong>
    <span class="muted">${r.ms} ms${detail(r) ? `, ${esc(detail(r))}` : ''}</span>${badgesHtml(host)}`;
}

async function onCustomSubmit(event) {
  event.preventDefault();
  const host = $('custom-input').value.trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#:].*$/, '');

  if (!HOST_RE.test(host)) {
    customResult = { state: 'invalid' };
    renderCustom();
    return;
  }
  customResult = { state: 'running' };
  renderCustom();
  // fastMs için kontrol grubu lazım
  if (!control) control = await runControl(CONTROL.local, CONTROL.hosts);
  const r = await probe(`https://${host}/`, { fastMs: control.fastMs });
  customResult = { state: 'done', host, r };
  renderCustom();
}

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light');

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('theme', next);
}

function updateLangButton() {
  $('lang-btn').textContent = getLang() === 'tr' ? 'EN' : 'TR';
}

function toggleLang() {
  setLang(getLang() === 'tr' ? 'en' : 'tr');
  updateLangButton();
  buildCategories();
  renderControl();
  renderCustom();
  renderHistory();
}

applyI18n();
updateLangButton();
$('ua').textContent = navigator.userAgent;
$('content-toggle').checked = store.get('content') !== '0';
const savedRegional = store.get('regional');
$('regional-toggle').checked = savedRegional === null ? getLang() === 'tr' : savedRegional === '1';
buildCategories();
renderHistory();

navigator.brave?.isBrave?.().then((v) => { isBrave = Boolean(v); }).catch(() => {});
loadLists().then((data) => {
  listData = data;
  if (data) buildCategories();
});

$('start-btn').addEventListener('click', runAll);
$('theme-btn').addEventListener('click', toggleTheme);
$('lang-btn').addEventListener('click', toggleLang);
$('copy-btn').addEventListener('click', (e) => copyWithFeedback(e.currentTarget, JSON.stringify(buildReport(), null, 2), 'dev.copy'));
$('expand-btn').addEventListener('click', toggleAllGroups);
$('custom-form').addEventListener('submit', onCustomSubmit);
$('content-toggle').addEventListener('change', (e) => {
  store.set('content', e.target.checked ? '1' : '0');
  update();
});
$('regional-toggle').addEventListener('change', (e) => {
  store.set('regional', e.target.checked ? '1' : '0');
  update();
});
$('results').addEventListener('change', (e) => {
  const box = e.target.closest('[data-score-toggle]');
  if (!box) return;
  if (box.checked) excluded.delete(box.dataset.scoreToggle);
  else excluded.add(box.dataset.scoreToggle);
  store.set('excluded', [...excluded].join(','));
  update();
});
$('rules-card').addEventListener('click', onRulesClick);
$('rules-card').addEventListener('change', (e) => {
  if (!e.target.matches('[data-rules-content]')) return;
  rulesContent = e.target.checked;
  renderRules();
});
$('history').addEventListener('change', onHistoryChange);
$('history').addEventListener('click', onHistoryClick);
document.querySelector('.segmented').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (btn) setFilter(btn.dataset.filter);
});
$('results').addEventListener('toggle', updateExpandButton, true);
$('lists-card').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (btn) copyWithFeedback(btn, btn.dataset.copy, 'lists.copy');
});
