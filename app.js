// 遊戲指南網頁：公開版（GitHub Pages，從轉接站讀資料包）與電腦版（localhost:8780，管理員）共用
const APP_VERSION = '1.0.2';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = m => { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2800); };
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
const fmt = n => n == null ? '—' : Number(n).toLocaleString();
const S = (() => { try { return JSON.parse(localStorage.getItem('gg') || '{}'); } catch { return {}; } })();
const saveS = () => { try { localStorage.setItem('gg', JSON.stringify(S)); } catch {} };
// 電腦版（管理員）：網址是 localhost:8780；公開版：讀轉接站。配對過的手機也算管理員（可以請電腦版跑 AI）
const LOCAL = location.port === '8780';
const RELAY = window.GAME_RELAY || '';
const ADMIN = () => LOCAL || !!S.token;
let D = null, tab = S.tab || 'home';

// ---------- 讀資料包（公開版存在手機裡，離線也能看） ----------
function idb() { return new Promise((res, rej) => { const r = indexedDB.open('gameguide', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbGet(k) { const d = await idb(); return new Promise(res => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result ?? null); q.onerror = () => res(null); }); }
async function idbPut(k, v) { const d = await idb(); return new Promise(res => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = res; }); }
async function load(force = false) {
  try {
    if (LOCAL) { D = await (await fetch('/api/snapshot', { cache: 'no-store' })).json(); }
    else {
      const meta = await (await fetch(`${RELAY}/game/meta`, { cache: 'no-store' })).json();
      if (!meta.updatedAt) throw new Error('還沒有資料');
      if (force || !D || meta.updatedAt !== D.generatedAt) { D = await (await fetch(`${RELAY}/game`, { cache: 'no-store' })).json(); idbPut('snap', D).catch(() => {}); }
    }
    $('offline').hidden = true;
  } catch (e) {
    if (D) { $('offline').hidden = false; $('offline').textContent = `離線中，顯示 ${String(D.generatedAt).slice(5, 16)} 的資料`; }
    else { $('main').innerHTML = `<p class="empty">讀不到資料：${esc(e.message)}</p>`; return; }
  }
  $('upd').textContent = D.generatedAt ? `${D.generatedAt.slice(5, 16)} 更新` : '';
  render();
}

// ---------- 共用 ----------
const G = id => D?.games?.[id] || null;
const imgOf = g => g?.hdr || g?.cover || '';
const isUpcoming = g => g?.rel ? g.rel > today() : !!g?.steam?.soon;
const priceOf = g => g?.steam?.price ?? g?.ps?.price ?? null;
function priceHtml(g) {
  const s = g.steam, p = g.ps;
  if (s?.price === 0) return '<span class="price"><b>免費</b></span>';
  const v = s?.price ?? p?.price, base = s?.price != null ? s.base : p?.base, disc = s?.price != null ? s.disc : (p?.disc ? Number(String(p.disc).replace(/[^\d]/g, '')) : 0);
  if (v == null) return '';
  return `<span class="price"><b>NT$${fmt(v)}</b>${disc ? ` <s>${fmt(base)}</s> <span class="disc">-${disc}%</span>` : ''}</span>`;
}
const platsHtml = ps => `<span class="plats">${(ps || []).slice(0, 5).map(p => `<span class="pl ${esc(p.replace(/\s/g, ''))}">${esc(p)}</span>`).join('')}</span>`;
const relTxt = g => g.rel ? (isUpcoming(g) ? `${g.rel} 上市` : g.rel) : (g.steam?.relText || '上市日未定');
function card(id, extra = '') {
  const g = G(id); if (!g) return '';
  return `<div class="card" data-g="${id}"><div class="img" style="background-image:url('${esc(imgOf(g))}')">${extra}${isUpcoming(g) ? '<span class="badge">即將上市</span>' : ''}</div>
    <div class="b"><div class="t">${esc(g.n)}</div><div class="m">${esc(relTxt(g))}${g.zh ? ' <span class="zh">中文</span>' : ''}</div>${platsHtml(g.plats)}<div class="p">${priceHtml(g)}${g.steam?.rev ? ` <span class="muted small">${g.steam.rev.pct}% 好評</span>` : ''}</div></div></div>`;
}
document.addEventListener('click', e => { const c = e.target.closest('[data-g]'); if (c && !e.target.closest('a,button:not([data-g])')) openGame(c.dataset.g); });
function md(src) {
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = []; let list = null, table = null;
  const flush = () => { if (list) { out.push('</ul>'); list = null; } if (table) { out.push(`<table>${table.map((r, i) => `<tr>${r.map(c => i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join('')}</tr>`).join('')}</table>`); table = null; } };
  for (const raw of String(src || '').split('\n')) {
    const l = raw.trimEnd(); let m;
    if (/^\|.*\|$/.test(l.trim())) { if (/^\|[\s:|-]+\|$/.test(l.trim())) continue; if (list) { out.push('</ul>'); list = null; } (table ||= []).push(l.trim().slice(1, -1).split('|').map(c => c.trim())); continue; }
    if (table) flush();
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) { flush(); out.push(`<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`); }
    else if ((m = l.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)/))) { if (!list) { out.push('<ul>'); list = 1; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (!l.trim()) flush(); else { flush(); out.push(`<p>${inline(l)}</p>`); }
  }
  flush(); return out.join('');
}

// ---------- 分頁 ----------
function go(t) {
  if (t === 'more') { openMore(); return; }
  tab = t; S.tab = t; saveS();
  document.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-current', b.dataset.t === t ? 'page' : 'false'));
  render(); window.scrollTo(0, 0);
}
document.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => go(b.dataset.t)));
function render() {
  if (!D) return;
  $('adminTab').hidden = !LOCAL;
  if (tab === 'home') renderHome(); else if (tab === 'rank') renderRank(); else if (tab === 'find') renderFind(); else if (tab === 'admin' && LOCAL) renderAdmin(); else renderHome();
}

// ---------- 首頁 ----------
function renderHome() {
  const ids = Object.keys(D.games);
  const up = ids.filter(id => isUpcoming(G(id)) && G(id).rel).sort((a, b) => G(a).rel.localeCompare(G(b).rel)).slice(0, 12);
  const month = ids.filter(id => { const g = G(id); return g.rel && g.rel <= today() && g.rel >= new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10); }).sort((a, b) => G(b).rel.localeCompare(G(a).rel)).slice(0, 12);
  const hot = ids.slice(0, 12);
  const p = D.picks;
  $('main').innerHTML = `
    ${p?.sections?.length ? `<h2>AI 推薦 <span class="muted small">${esc(p.at?.slice(5, 10) || '')}</span></h2>${p.intro ? `<p class="muted small" style="margin:-4px 0 8px">${esc(p.intro)}</p>` : ''}
      <div class="chips scroll" id="pickTabs">${p.sections.map((s, i) => `<button class="chip" data-pk="${i}" aria-pressed="${i === (S.pk || 0)}">${esc(s.title)}</button>`).join('')}</div><div id="pickBody" style="margin-top:10px"></div>`
      : (ADMIN() ? `<div class="aibox" style="margin-top:12px">還沒有 AI 推薦。<button class="adminbtn" data-req="picks">產生本週推薦</button></div>` : '')}
    <h2>即將上市 <span class="muted small">依上市日</span></h2><div class="grid">${up.map(id => card(id, `<span class="badge r">${G(id).rel.slice(5).replace('-', '/')}</span>`)).join('') || '<p class="muted small">沒有資料</p>'}</div>
    <h2>最近 45 天新作</h2><div class="grid">${month.map(id => card(id)).join('') || '<p class="muted small">沒有資料</p>'}</div>
    <h2>熱門</h2><div class="grid">${hot.map(id => card(id)).join('')}</div>
    ${D.news?.length ? `<h2>遊戲新聞 <span class="muted small">巴哈姆特 GNN</span></h2><div class="news">${D.news.slice(0, 15).map(n => `<a href="${esc(n.url)}" target="_blank" rel="noopener"><span>${esc(n.date.slice(5, 16))}</span>${esc(n.title)}</a>`).join('')}</div>` : ''}`;
  renderPick();
}
function renderPick() {
  const s = D.picks?.sections?.[S.pk || 0]; if (!s || !$('pickBody')) return;
  $('pickBody').innerHTML = `${s.desc ? `<p class="muted small" style="margin:0 0 8px">${esc(s.desc)}</p>` : ''}<div class="picks">${s.items.map(x => { const g = G(x.id); return g ? `<div class="pick" data-g="${x.id}"><div class="img" style="background-image:url('${esc(imgOf(g))}')"></div><div><b>${esc(g.n)}</b> ${platsHtml(g.plats)}<div class="small">${esc(x.reason)}</div><div class="small">${priceHtml(g)}</div></div></div>` : ''; }).join('')}</div>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-pk]'); if (b) { S.pk = +b.dataset.pk; saveS(); document.querySelectorAll('[data-pk]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderPick(); } });

// ---------- 排行 ----------
const RANKS = [
  ['baha_pre', '台灣預購（巴哈商城）'], ['steam_top', 'Steam 熱銷（台灣）'], ['ps_best', 'PS Store 暢銷（台灣）'], ['steam_played', 'Steam 同時在線'], ['ps_new', 'PS Store 新上架'],
  ['steam_new', 'Steam 新作'], ['steam_coming', 'Steam 即將推出'], ['famitsu', '日本實體銷量（Fami 通）'], ['twitch', 'Twitch 直播熱度'], ['igdb_want', '最多人想玩（IGDB）'],
];
function renderRank() {
  const k = S.rk && D.charts[S.rk] ? S.rk : 'baha_pre';
  const c = D.charts[k], list = Array.isArray(c) ? c : c?.items || [];
  const avail = RANKS.filter(([key]) => { const v = D.charts[key]; return Array.isArray(v) ? v.length : v?.items?.length; });
  const val = x => k === 'steam_played' ? `${fmt(x.peak)} 人${x.last ? ` <span class="${x.last > x.r ? 'up' : x.last < x.r ? 'down' : 'muted'}">${x.last > x.r ? '↑' : x.last < x.r ? '↓' : '－'}</span>` : ''}`
    : k === 'famitsu' ? `${fmt(x.sales)} 套<br><span class="muted small">累計 ${fmt(x.total)}</span>`
    : k === 'baha_pre' ? `${esc(x.date || '')}<br><span class="small ${x.last === 'NEW' ? 'up' : ''}">${x.last === 'NEW' ? 'NEW' : x.last && x.last !== x.r ? (x.last > x.r ? `↑${x.last - x.r}` : `↓${x.r - x.last}`) : ''}</span>`
    : (k === 'ps_best' || k === 'ps_new') && x.price != null ? `NT$${fmt(x.price)}` : (G(x.id) ? priceHtml(G(x.id)) : '');
  $('main').innerHTML = `<div class="chips scroll" style="margin-top:4px">${avail.map(([key, t]) => `<button class="chip" data-rk="${key}" aria-pressed="${key === k}">${t}</button>`).join('')}</div>
    ${k === 'famitsu' && c?.period ? `<p class="muted small">${esc(c.period)}</p>` : ''}${k === 'baha_pre' && c?.title ? `<p class="muted small"><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.title)}</a></p>` : ''}
    <div>${list.map(x => { const g = G(x.id), img = g ? imgOf(g) : x.img || '';
      const inner = `<div class="n">${x.r}</div><div class="img" style="background-image:url('${esc(img)}')"></div><div><div class="t">${esc(g?.n || x.n || '')}</div><div class="s">${g ? `${esc(relTxt(g))} ${platsHtml(g.plats)}` : esc([x.plat, x.maker || x.dev].filter(Boolean).join('・'))}</div></div><div class="v">${val(x)}</div>`;
      return g ? `<div class="rk" data-g="${x.id}">${inner}</div>` : x.url ? `<a class="rk" href="${esc(x.url)}" target="_blank" rel="noopener" style="color:inherit">${inner}</a>` : `<div class="rk">${inner}</div>`; }).join('') || '<p class="empty">沒有資料</p>'}</div>
    <p class="muted small">排行每 6 小時更新；不收網路遊戲、手機遊戲。</p>`;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-rk]'); if (b) { S.rk = b.dataset.rk; saveS(); renderRank(); } });

// ---------- 找遊戲 ----------
const F = { q: '', plat: '', genre: '', zh: false, maxP: '', sort: 'hot', when: '' };
function renderFind() {
  const all = Object.entries(D.games);
  const genres = Object.entries(all.reduce((m, [, g]) => { for (const x of g.g || []) m[x] = (m[x] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k]) => k);
  const q = F.q.trim().toLowerCase();
  let list = all.filter(([, g]) => (!q || `${g.n} ${g.en || ''} ${(g.dev || []).join(' ')} ${(g.pub || []).join(' ')}`.toLowerCase().includes(q))
    && (!F.plat || (g.plats || []).some(p => p === F.plat || (F.plat === 'Switch' && /Switch/.test(p)) || (F.plat === 'Xbox' && /Xbox/.test(p))))
    && (!F.genre || (g.g || []).includes(F.genre)) && (!F.zh || g.zh) && (!F.maxP || (priceOf(g) != null && priceOf(g) <= +F.maxP))
    && (!F.when || (F.when === 'up' ? isUpcoming(g) : !isUpcoming(g))));
  const by = { hot: () => 0, rate: ([, a], [, b]) => (b.steam?.rev?.pct ?? b.rating ?? 0) - (a.steam?.rev?.pct ?? a.rating ?? 0), new: ([, a], [, b]) => String(b.rel || '').localeCompare(String(a.rel || '')), price: ([, a], [, b]) => (priceOf(a) ?? 1e9) - (priceOf(b) ?? 1e9) };
  if (F.sort !== 'hot') list = [...list].sort(by[F.sort]);
  const chip = (k, v, t) => `<button class="chip" data-f="${k}" data-v="${esc(v)}" aria-pressed="${String(F[k]) === String(v)}">${esc(t)}</button>`;
  if (!$('fq')) $('main').innerHTML = `<div class="filters"><input class="search" id="fq" placeholder="搜尋遊戲、公司…" autocomplete="off"><div id="fbar"></div></div><div id="flist"></div>`;
  $('fbar').innerHTML = `<div class="chips scroll">${chip('plat', '', '全部平台')}${['PC', 'PS5', 'Switch', 'Xbox'].map(p => chip('plat', p, p === 'Switch' ? 'Switch／Switch 2' : p)).join('')}</div>
    <div class="chips scroll" style="margin-top:6px">${chip('genre', '', '全部種類')}${genres.map(x => chip('genre', x, x)).join('')}</div>
    <div class="frow" style="margin-top:6px">${chip('when', '', '全部')}${chip('when', 'up', '即將上市')}${chip('when', 'out', '已上市')}
      <label class="chip" style="cursor:pointer"><input type="checkbox" id="fzh" ${F.zh ? 'checked' : ''}> 有中文</label>
      <span>價格</span><select id="fmax"><option value="">不限</option>${[0, 300, 600, 1000, 1500].map(v => `<option value="${v}" ${F.maxP === String(v) ? 'selected' : ''}>${v ? `NT$${v} 以下` : '免費'}</option>`).join('')}</select>
      <span>排序</span><select id="fsort">${[['hot', '熱門'], ['rate', '評價'], ['new', '上市日'], ['price', '價格']].map(([k, t]) => `<option value="${k}" ${F.sort === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
  $('flist').innerHTML = `<p class="muted small">${list.length} 款</p><div class="grid">${list.slice(0, 120).map(([id]) => card(id)).join('')}</div>`;
}
document.addEventListener('click', e => { const c = e.target.closest('[data-f]'); if (c) { F[c.dataset.f] = c.dataset.v; renderFind(); } });
document.addEventListener('input', e => { if (e.target.id === 'fq') { F.q = e.target.value; renderFind(); } });
document.addEventListener('change', e => {
  if (e.target.id === 'fzh') { F.zh = e.target.checked; renderFind(); }
  if (e.target.id === 'fmax') { F.maxP = e.target.value; renderFind(); }
  if (e.target.id === 'fsort') { F.sort = e.target.value; renderFind(); }
});

// ---------- 遊戲頁 ----------
let cur = null;
function storeRows(g) {
  const q = encodeURIComponent(g.n), qe = encodeURIComponent(g.en || g.n), up = isUpcoming(g);
  const rows = [];
  if (g.steam) rows.push(['Steam', `https://store.steampowered.com/app/${g.steam.id}/`, g.steam.price === 0 ? '免費' : g.steam.price != null ? `NT$${fmt(g.steam.price)}${g.steam.disc ? `（-${g.steam.disc}%）` : ''}` : (g.steam.soon ? '尚未開賣' : '—'), up && g.steam.price ? '可預購' : '', '台灣']);
  if (g.ps) rows.push(['PlayStation Store', g.ps.url, `NT$${fmt(g.ps.price)}${g.ps.disc ? `（${esc(g.ps.disc)}）` : ''}`, up ? '可預購' : '', '台灣']);
  else if ((g.plats || []).some(p => /PS/.test(p))) rows.push(['PlayStation Store', `https://store.playstation.com/zh-hant-tw/search/${q}`, '搜尋', '', '台灣']);
  if (g.ns) rows.push(['任天堂 eShop（港台）', g.ns.url, g.ns.price != null ? `HK$${fmt(g.ns.price)}` : '—', up ? '可預購' : '', '港台']);
  else if ((g.plats || []).some(p => /Switch/.test(p))) rows.push(['任天堂 eShop（港台）', `https://store.nintendo.com.hk/catalogsearch/result/?q=${q}`, '搜尋', '', '港台']);
  if (g.gp) rows.push(['Xbox（Game Pass）', g.gp.url, g.gp.price ? `NT$${fmt(g.gp.price)}・Game Pass 可玩` : 'Game Pass 可玩', '', '台灣']);
  else if ((g.plats || []).some(p => /Xbox/.test(p))) rows.push(['Xbox Store', `https://www.xbox.com/zh-TW/search/results/games?q=${qe}`, '搜尋', '', '台灣']);
  return rows;
}
function openGame(id, keep = false) {
  const g = G(id); if (!g) return;
  cur = id;
  if ($('sheet').hidden) history.pushState({ g: id }, '');
  $('sheet').hidden = false; document.body.style.overflow = 'hidden';
  const rv = D.reviews?.[id], gd = D.guides?.[id], up = isUpcoming(g);
  const relRows = Object.entries(g.relBy || {}).sort((a, b) => a[1].localeCompare(b[1]));
  const stores = storeRows(g), consoleGame = (g.plats || []).some(p => /PS|Switch|Xbox/.test(p));
  const twSold = stores.filter(r => r[4] === '台灣' && !/搜尋/.test(r[2])).map(r => r[0].replace(/（.*/, ''));
  const v0 = (g.vids || [])[0];
  $('sheetBody').innerHTML = `
    <div class="hero" style="background-image:url('${esc(g.hdr || g.cover || '')}')"><div class="in">${g.cover ? `<img src="${esc(g.cover)}" alt="">` : '<span></span>'}
      <div><h1>${esc(g.n)}</h1>${g.en ? `<div class="en">${esc(g.en)}</div>` : ''}<div style="margin-top:6px">${platsHtml(g.plats)} ${g.zh ? `<span class="zh">${g.zh === 'voice' ? '中文語音' : '中文字幕'}</span>` : ''} ${up ? '<span class="pre">即將上市</span>' : ''}</div></div></div></div>
    <div class="gb">
      <div class="scores">
        ${g.steam?.rev ? `<a class="score" href="https://store.steampowered.com/app/${g.steam.id}/#app_reviews_hash" target="_blank" rel="noopener"><span>Steam 評價</span><b>${g.steam.rev.pct}%</b><span>${esc(g.steam.rev.desc)}・${fmt(g.steam.rev.total)} 則</span></a>` : ''}
        ${g.steam?.meta ? `<span class="score"><span>Metacritic</span><b>${g.steam.meta}</b></span>` : ''}
        ${g.rating ? `<span class="score"><span>IGDB 評分</span><b>${g.rating}</b><span>${fmt(g.ratingN)} 人</span></span>` : ''}
        ${rv?.s?.avg != null ? `<span class="score"><span>YouTube 評測</span><b>${rv.s.avg}</b><span>${rv.s.recommend}/${rv.s.count} 推薦</span></span>` : ''}
        ${g.hypes ? `<span class="score"><span>期待度</span><b>${fmt(g.hypes)}</b></span>` : ''}
      </div>
      <div class="facts">
        <div class="fact"><span>種類</span>${esc([...(g.g || []), ...(g.th || [])].join('、') || '—')}</div>
        <div class="fact"><span>開發</span>${esc((g.dev || []).join('、') || '—')}</div>
        <div class="fact"><span>發行</span>${esc((g.pub || []).join('、') || '—')}</div>
        <div class="fact"><span>上市日</span>${esc(relTxt(g))}${relRows.length > 1 ? `<div class="small muted">${relRows.map(([p, d]) => `${esc(p)} ${d}`).join('<br>')}</div>` : ''}</div>
        ${g.modes?.length || g.steam?.cats?.length ? `<div class="fact"><span>遊玩方式</span>${esc([...(g.modes || []), ...(g.steam?.cats || [])].filter((x, i, a) => a.indexOf(x) === i).slice(0, 6).join('、'))}</div>` : ''}
        ${g.age ? `<div class="fact"><span>年齡</span>${g.age} 歲以上</div>` : ''}
      </div>
      <h3>哪裡買・價格 <span class="muted small">${twSold.length ? `台灣有賣：${esc([...new Set(twSold)].join('、'))}` : ''}</span></h3>
      <div class="stores">${stores.map(([n, url, price, pre, region]) => `<a class="store" href="${esc(url)}" target="_blank" rel="noopener"><span class="nm">${esc(n)}<small>${esc(region)}</small></span><span>${esc(price)} ${pre ? `<span class="pre">${pre}</span>` : ''}</span><span class="buy">${price === '搜尋' ? '找找看' : '前往'}</span></a>`).join('') || '<p class="muted small">還沒有商店資料。</p>'}</div>
      ${consoleGame ? `<div class="retail"><span class="muted small">實體版：</span>${[['PChome', `https://24h.pchome.com.tw/search/?q=${encodeURIComponent(g.n)}`], ['momo', `https://www.momoshop.com.tw/search/searchShop.jsp?keyword=${encodeURIComponent(g.n)}`], ['蝦皮', `https://shopee.tw/search?keyword=${encodeURIComponent(g.n)}`], ['巴哈商城', `https://buy.gamer.com.tw/search.php?kw=${encodeURIComponent(g.n)}`]].map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join('')}</div>` : ''}
      <h3>介紹</h3><div class="desc">${esc(g.desc || '（沒有介紹）')}</div>${g.site ? `<p class="small"><a href="${esc(g.site)}" target="_blank" rel="noopener">官方網站</a></p>` : ''}
      ${v0 || g.mp4?.length ? `<h3>影片</h3><div class="player" id="player"></div><div class="vids">${(g.vids || []).map(([k, t], i) => `<div class="vid" data-yt="${esc(k)}"><img src="https://i.ytimg.com/vi/${esc(k)}/mqdefault.jpg" alt="" loading="lazy"><div>${esc(t || `影片 ${i + 1}`)}</div></div>`).join('')}${(g.mp4 || []).map(([t, u, th]) => `<div class="vid" data-mp4="${esc(u)}"><img src="${esc(th)}" alt="" loading="lazy"><div>${esc(t || 'Steam 預告')}</div></div>`).join('')}</div>` : ''}
      ${g.shots?.length ? `<h3>畫面</h3><div class="shots">${g.shots.map(s => `<img src="${esc(s)}" loading="lazy" alt="">`).join('')}</div>` : ''}
      <h3>YouTube 評測 AI 整理 ${ADMIN() ? `<button class="adminbtn" data-req="review" data-id="${id}">${rv ? '重新整理' : '開始整理'}</button>` : ''}</h3>
      <div class="aibox">${rv ? `<div class="md">${md(rv.c)}</div>${(rv.v || []).map(([vid, t, ch, views, verdict, score]) => `<a class="vrow" href="https://www.youtube.com/watch?v=${esc(vid)}" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/${esc(vid)}/mqdefault.jpg" alt="" loading="lazy"><span><b>${esc(t)}</b><br><span class="muted small">${esc(ch)}・${fmt(views)} 次觀看</span><br><span class="verdict ${esc(verdict || '')}">${esc(verdict || '')}</span> ${score ?? ''} 分</span></a>`).join('')}<p class="muted small">${esc(rv.at)} 整理</p>`
        : `<p class="muted small" style="margin:0">${up ? '還沒上市，上市後會整理 YouTube 上的評測。' : '還沒有整理。'}${ADMIN() ? '' : '管理員整理後會出現在這裡。'}</p>`}</div>
      ${g.series ? `<h3>系列前作／續作 <span class="muted small">${esc(g.series.name)}</span>${ADMIN() ? `<button class="adminbtn" data-req="guide" data-id="${id}">${gd ? '重新產生導引' : '產生系列導引'}</button>` : ''}</h3>
        <div class="series">${g.series.games.map(s => { const inner = `<span>${esc(s.n)}</span><span class="muted small">${esc(s.y || '')}</span>`; return s.id && G(s.id) && s.id !== id ? `<a data-g="${s.id}">${inner}</a>` : `<span class="it ${s.cur ? 'cur' : ''}">${inner}</span>`; }).join('')}</div>
        ${gd ? `<div class="aibox md" style="margin-top:8px">${md(gd.c)}<p class="muted small">${esc(gd.at)} 整理・前作懶人包會透露前作劇情</p></div>` : `<p class="muted small">${ADMIN() ? '' : '管理員產生系列導引後，這裡會有遊玩順序和前作懶人包。'}</p>`}` : ''}
      ${g.sim?.length ? `<h3>類似的遊戲</h3><div class="grid">${g.sim.map(s => card(s.id)).join('')}</div>` : ''}
    </div>`;
  if (v0) playYt(v0[0]); else if (g.mp4?.length) playMp4(g.mp4[0][1]);
  if (!keep) $('sheet').scrollTop = 0;
}
const playYt = k => { $('player').innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(k)}?playsinline=1&rel=0" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`; };
const playMp4 = u => { $('player').innerHTML = `<video src="${esc(u)}" controls playsinline preload="metadata"></video>`; };
document.addEventListener('click', e => {
  const y = e.target.closest('[data-yt]'); if (y) { playYt(y.dataset.yt); return; }
  const m = e.target.closest('[data-mp4]'); if (m) playMp4(m.dataset.mp4);
});
function closeSheet() { $('sheet').hidden = true; $('sheetBody').innerHTML = ''; document.body.style.overflow = ''; cur = null; }
$('sheetBack').addEventListener('click', () => history.back());
window.addEventListener('popstate', () => { if (!$('sheet').hidden) closeSheet(); });

// ---------- 管理員：請電腦版做 AI 分析 ----------
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-req]'); if (!b) return;
  const type = b.dataset.req, id = b.dataset.id || '';
  const txt = { review: '整理 YouTube 評測（Gemini 看 3～4 支影片，約 5～10 分鐘）', guide: '產生系列導引（約 NT$1～2）', picks: '產生本週 AI 推薦（約 NT$2）' }[type];
  if (!confirm(`${txt}？`)) return;
  b.disabled = true; b.textContent = '已送出…';
  try {
    if (LOCAL) { const r = await fetch('/api/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); toast(type === 'review' ? '已加入評測整理佇列，完成後會自動出現' : '完成'); if (type !== 'review') { await load(true); if (cur) openGame(cur, true); } else pollAdmin(); }
    else { const r = await fetch(`${RELAY}/game/request`, { method: 'POST', headers: { Authorization: `Bearer ${S.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type, id }) }); if (r.status === 401) { S.token = ''; saveS(); throw new Error('管理員連結已失效，請重新配對'); } if (!r.ok) throw new Error('送出失敗'); toast('已請電腦版處理，完成後重新整理就會看到（電腦要開著）'); }
  } catch (err) { toast(err.message); b.disabled = false; b.textContent = '再試一次'; }
});

// ---------- 更多（公開版：關於、管理員登入） ----------
function openMore() {
  $('dlg').hidden = false;
  $('dlgBox').innerHTML = `<b>遊戲指南</b>
    <p class="small muted" style="margin:0">資料來源：Steam、PlayStation Store 台灣、任天堂港台 eShop、Xbox Game Pass、App Store、IGDB、Twitch、Fami 通、巴哈姆特。價格以各商店為準。AI 評測整理是 AI 看 YouTube 評測影片後整理的，僅供參考。</p>
    <p class="small muted" style="margin:0">建議用 Safari「分享 → 加入主畫面」，之後從主畫面打開就像 App 一樣。版本 ${APP_VERSION}・資料 ${esc(D?.generatedAt?.slice(0, 16) || '—')}</p>
    <button class="btn" id="mRefresh">重新整理資料</button>
    ${LOCAL ? '' : S.token ? '<p class="small">✓ 這支手機是管理員，可以在遊戲頁請電腦版做 AI 分析。</p><button class="btn" id="mLogout">取消管理員</button>'
      : `<details><summary class="small muted">管理員</summary><div style="display:grid;gap:8px;margin-top:8px"><input id="mCode" placeholder="8 碼配對碼（電腦版「管理」→「手機配對」產生）" maxlength="8" autocapitalize="characters"><button class="btn primary" id="mPair">連結</button></div></details>`}
    <button class="btn" data-close>關閉</button>`;
  $('mRefresh').onclick = async () => { $('dlg').hidden = true; await load(true); toast('已更新'); };
  if ($('mPair')) $('mPair').onclick = async () => {
    try { const r = await fetch(`${RELAY}/pair/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: $('mCode').value.trim().toUpperCase() }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || '配對失敗'); S.token = j.token; saveS(); $('dlg').hidden = true; toast('已成為管理員'); render(); }
    catch (e) { toast(e.message); }
  };
  if ($('mLogout')) $('mLogout').onclick = () => { S.token = ''; saveS(); $('dlg').hidden = true; render(); };
}
$('dlg').addEventListener('click', e => { if (e.target === $('dlg') || e.target.closest('[data-close]')) $('dlg').hidden = true; });

// ---------- 電腦版的管理頁 ----------
let adminTimer = null;
async function pollAdmin() {
  clearTimeout(adminTimer);
  try {
    const s = await (await fetch('/api/status')).json();
    const box = $('admStatus');
    if (box) box.innerHTML = `<div class="row"><b>${s.refresh.running ? '⏳ ' : ''}資料更新：</b>${esc(s.refresh.step || '—')}${s.refresh.error ? ` <span class="down">${esc(s.refresh.error)}</span>` : ''}<span class="muted small">${esc(s.refresh.finishedAt || '')}・${s.games} 款・IGDB ${s.igdb ? '已設定' : '<span class="down">未設定</span>'}</span></div>
      <div class="row"><b>${s.review.running ? '⏳ ' : ''}評測整理：</b>${s.review.title ? `${esc(s.review.title)}：${esc(s.review.step)}` : '沒有工作'}${s.review.error ? ` <span class="down">${esc(s.review.error)}</span>` : ''}${s.review.queue.length ? `<span class="muted small">排隊 ${s.review.queue.length} 款</span>` : ''}</div>
      ${s.review.items?.length ? `<div class="log">${s.review.items.map(i => `${i.state === 'done' ? '✓' : i.state === 'running' ? '…' : i.state === 'failed' ? '✗' : '・'} ${esc(i.title.slice(0, 40))}　${esc(i.msg)}`).join('\n')}</div>` : ''}
      <div class="row"><b>上傳到公開網頁：</b>${s.upload.lastError ? `<span class="down">${esc(s.upload.lastError)}</span>` : esc(s.upload.lastUpload || '還沒上傳')} <span class="muted small">${s.upload.bytes ? `${Math.round(s.upload.bytes / 1024)} KB` : ''}</span></div>
      ${s.refresh.log?.length ? `<details><summary class="small muted">更新紀錄</summary><div class="log">${s.refresh.log.map(esc).join('\n')}</div></details>` : ''}`;
    if (s.refresh.running || s.review.running) adminTimer = setTimeout(pollAdmin, 3000);
    else if (pollAdmin.was) { pollAdmin.was = false; await load(true); if (cur) openGame(cur, true); }
    pollAdmin.was = s.refresh.running || s.review.running;
  } catch {}
}
async function renderAdmin() {
  const c = await (await fetch('/api/config')).json();
  $('main').innerHTML = `
    <div class="panel"><h3>狀態</h3><div id="admStatus">讀取中…</div>
      <div class="row"><button class="btn" id="aRefresh">立即更新資料</button><button class="btn" id="aUpload">上傳到公開網頁</button><button class="btn" data-req="picks">產生 AI 推薦</button></div></div>
    <div class="panel"><h3>加入遊戲</h3><div class="row"><input type="text" id="aQ" placeholder="遊戲名稱（中文、英文都可以）"><button class="btn" id="aSearch">搜尋</button></div><div id="aRes"></div>
      <p class="muted small">排行榜上的遊戲會自動加入；這裡可以加你想追蹤、但不在排行榜上的遊戲。</p></div>
    <div class="panel"><h3>IGDB 遊戲資料庫（Twitch 開發者金鑰）</h3>
      <div class="row"><span style="width:110px">Client ID</span><input type="text" id="aId" value="${esc(c.igdbClientId)}" autocomplete="off"></div>
      <div class="row"><span style="width:110px">Client Secret</span><input type="password" id="aSec" placeholder="${c.igdbClientSecret ? `已設定 ${esc(c.igdbClientSecret)}` : '貼上 Client Secret'}" autocomplete="off"></div>
      <p class="muted small">申請：到 dev.twitch.tv 用 Twitch 帳號登入 → Your Console → Applications → Register Your Application（名稱隨便取、OAuth Redirect URL 填 http://localhost、類別選 Application Integration、Client Type 選 Confidential）→ Manage → 複製 Client ID，按 New Secret 複製 Client Secret。帳號要先開啟兩步驟驗證。</p>
      <div class="row"><button class="btn primary" id="aSaveKey">儲存並測試</button><span class="small" id="aKeyMsg"></span></div></div>
    <div class="panel"><h3>自動 AI 分析</h3>
      <div class="row"><label><input type="checkbox" id="aPicks" ${c.autoPicks ? 'checked' : ''}> 每週一產生 AI 推薦（約 NT$2）</label></div>
      <div class="row"><label><input type="checkbox" id="aRev" ${c.autoReviews ? 'checked' : ''}> 每週五整理熱門前 3 款新遊戲的 YouTube 評測（Gemini 免費額度）</label></div>
      <div class="row"><label><input type="checkbox" id="aGuide" ${c.autoGuides ? 'checked' : ''}> 每天替 2 款熱門系列作寫系列導引（約 NT$2～4／天）</label></div>
      <div class="row">每款評測看 <input type="number" id="aVids" value="${c.reviewVideos}" min="2" max="8" style="width:60px"> 支影片・遊戲清單最多 <input type="number" id="aMax" value="${c.maxGames}" min="100" max="600" style="width:80px"> 款</div>
      <div class="row"><button class="btn primary" id="aSave">儲存</button><span class="small" id="aMsg"></span></div>
      <p class="small">本月 AI 費用：${c.usage.map(u => `${esc(u.purpose)} ${u.n} 次 NT$${u.twd}`).join('、') || '還沒有'}${c.shared.claude ? '（沿用股票工具的金鑰）' : ''}</p></div>
    <div class="panel"><h3>公開網頁・手機管理員</h3>
      <p class="small">公開網址：<a href="https://rm312560-netizen.github.io/games/" target="_blank" rel="noopener">https://rm312560-netizen.github.io/games/</a>（推上 GitHub 後可用，任何人都能看，不能啟動 AI）</p>
      <p class="muted small">你的手機要當管理員：在公開網頁按「更多 → 管理員」，輸入這裡產生的配對碼。</p>
      <div class="row"><button class="btn" id="aPair">產生配對碼</button><b id="aCode" style="font-size:1.4rem;letter-spacing:3px"></b></div></div>`;
  pollAdmin();
  $('aRefresh').onclick = async () => { await fetch('/api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"force":true}' }); pollAdmin.was = true; pollAdmin(); };
  $('aUpload').onclick = async () => { const r = await (await fetch('/api/upload', { method: 'POST' })).json(); toast(r.lastError || '已上傳'); pollAdmin(); };
  $('aSearch').onclick = async () => {
    const r = await (await fetch(`/api/search?q=${encodeURIComponent($('aQ').value)}`)).json();
    $('aRes').innerHTML = r.items.map(x => `<div class="row"><span>${esc(x.n)} <span class="muted small">${esc(x.y)} ${esc(x.plats.join('/'))}・${x.src}</span></span>${D.games[x.id] ? '<span class="muted small">已在清單</span>' : `<button class="btn" data-pin="${x.id}" data-n="${esc(x.n)}">加入</button>`}</div>`).join('') || '<p class="muted small">找不到</p>';
  };
  $('aRes').onclick = async e => { const b = e.target.closest('[data-pin]'); if (!b) return; await fetch('/api/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.dataset.pin, n: b.dataset.n }) }); b.outerHTML = '<span class="muted small">已加入，更新中…</span>'; pollAdmin.was = true; pollAdmin(); };
  $('aSaveKey').onclick = async () => {
    $('aKeyMsg').textContent = '測試中…';
    const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ igdbClientId: $('aId').value, igdbClientSecret: $('aSec').value }) });
    const j = await r.json(); $('aKeyMsg').innerHTML = r.ok ? '<span class="up">金鑰可以用，開始重新整理資料（約 5～10 分鐘）</span>' : `<span class="down">${esc(j.error)}</span>`; pollAdmin.was = true; pollAdmin();
  };
  $('aSave').onclick = async () => { await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoPicks: $('aPicks').checked, autoReviews: $('aRev').checked, autoGuides: $('aGuide').checked, reviewVideos: $('aVids').value, maxGames: $('aMax').value }) }); $('aMsg').textContent = '已儲存'; };
  $('aPair').onclick = async () => { try { const r = await (await fetch('/api/pair', { method: 'POST' })).json(); $('aCode').textContent = r.code || r.error || ''; } catch (e) { toast(e.message); } };
}

// 標籤列：滑鼠滾輪也可以左右捲動
document.addEventListener('wheel', e => { const c = e.target.closest('.chips.scroll'); if (c && c.scrollWidth > c.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { c.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });

// ---------- 啟動 ----------
(async () => {
  if (!LOCAL) D = await idbGet('snap').catch(() => null);
  if (D) render();
  await load();
  go(LOCAL && tab === 'admin' ? 'admin' : tab === 'admin' ? 'home' : tab);
  const q = new URLSearchParams(location.search).get('g'); if (q && G(q)) openGame(q);
  setInterval(() => { if (!document.hidden) load(); }, 10 * 60e3);
  if (!LOCAL && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
