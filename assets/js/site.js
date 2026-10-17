/* ==========================================================================
   Emoji directory — client runtime
   Vanilla ES2020. No dependencies, no build step. Progressive enhancement:
   every page is fully readable with JS disabled.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const PAGE = window.__EMOJI__ || { lang: 'en', page: 'home' };
  const LS = {
    theme: 'ed:theme', tone: 'ed:tone', fav: 'ed:fav', recent: 'ed:recent',
    density: 'ed:density', langDismissed: 'ed:lang-dismissed', tray: 'ed:tray',
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const state = {
    data: null,          // emoji.json
    pack: null,          // locale pack {names, keywords}
    i18n: null,          // all locales' UI strings
    t: {},               // resolved strings for current language
    tone: store.get(LS.tone, 0),
    theme: store.get(LS.theme, 'auto'),
    fav: new Set(store.get(LS.fav, [])),
    recent: store.get(LS.recent, []),
    selectMode: false,
    tonesExpanded: false,
    tray: new Set(store.get(LS.tray, [])),
    view: 'all',         // all | fav | recent | search
    searchIndex: null,
    currentEmoji: null,
    lastFocus: null,
  };

  /* ---------------------------------------------------------------- utils */
  const graphemes = (() => {
    let seg = null;
    try { seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch {}
    return (str) => seg ? Array.from(seg.segment(str), s => s.segment) : Array.from(str);
  })();

  const esc = (s) => String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function t(key, vars) {
    let s = state.t[key] ?? key;
    if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
    return s;
  }

  function toast(msg, glyph, isError) {
    const layer = $('#toasts');
    if (!layer) return;
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' is-error' : '');
    el.setAttribute('role', 'status');
    el.innerHTML = (glyph ? `<span class="t-glyph">${esc(glyph)}</span>` : '') + `<span>${esc(msg)}</span>`;
    layer.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, 1500);
    while (layer.children.length > 3) layer.firstChild.remove();
  }

  const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

  /* Copy, with a fallback ladder.
   *
   * An either/or branch is not enough: sandboxed iframes (in-app previews,
   * embedded browsers) expose navigator.clipboard and report a secure context,
   * but reject the write because the clipboard-write permission is not granted
   * to the frame. So each strategy is attempted in turn, and only if all of
   * them fail do we ask the reader to finish the job by hand — with the text
   * already selected for them. */
  async function copy(text, glyph) {
    // Synchronous first: awaiting anything can consume the transient user
    // activation that execCommand('copy') needs, so the async API must not
    // get a chance to burn it before the fallback runs.
    if (tryLegacyCopy(text)) { toast(t('copied'), glyph); return true; }
    if (await tryAsyncClipboard(text)) { toast(t('copied'), glyph); return true; }
    offerManualCopy(text, glyph);
    return false;
  }

  async function tryAsyncClipboard(text) {
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') return false;
      if (!window.isSecureContext) return false;
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function tryLegacyCopy(text) {
    let ta;
    try {
      ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      // keep it on-screen but invisible: some browsers refuse to copy from a
      // display:none or off-screen element
      ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;' +
                         'padding:0;border:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.focus({ preventScroll: true });
      ta.select();
      ta.setSelectionRange(0, text.length);   // iOS Safari needs this
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      if (ta && ta.parentNode) ta.remove();
      return false;
    }
  }

  /* Last resort: show the text in a small panel, focused and selected, so the
     reader only has to press Ctrl/Cmd+C. */
  function offerManualCopy(text, glyph) {
    let panel = document.getElementById('copy-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'copy-panel';
      panel.className = 'copy-panel';
      panel.setAttribute('role', 'group');
      panel.innerHTML =
        '<span class="cp-hint"></span>' +
        '<input class="cp-field" type="text" readonly aria-label="' + esc(t('copy')) + '">' +
        '<button class="btn btn-sm" type="button" data-cp-close aria-label="' + esc(t('close')) + '">✕</button>';
      document.body.appendChild(panel);
      panel.querySelector('[data-cp-close]').addEventListener('click', () => {
        panel.classList.remove('open');
      });
    }
    const field = panel.querySelector('.cp-field');
    field.value = text;

    // Explain the actual cause when we know it: a sandboxed preview frame is
    // denied clipboard access by policy, and no amount of client code fixes it.
    let inFrame = false;
    try { inFrame = window.self !== window.top; } catch { inFrame = true; }
    const key = inFrame ? 'copy_in_frame' : 'copy_manual';
    panel.querySelector('.cp-hint').textContent =
      t(key).replace('{k}', IS_MAC ? '⌘C' : 'Ctrl+C');
    panel.classList.add('open');

    // focus + select the text for them
    try {
      field.focus({ preventScroll: true });
      field.select();
      field.setSelectionRange(0, text.length);
    } catch {}

    // Informational, not an error: the text is already selected for the
    // reader, so telling them copying "failed" would be misleading.
    toast(t('copy_selected', { k: IS_MAC ? '⌘C' : 'Ctrl+C' }), glyph);
  }

  const idOf = (i) => state.data.emoji[i].c;
  const nameOf = (i) => state.pack.names[i] || state.data.emoji[i].cp;
  const keywordsOf = (i) => state.pack.keywords[i] || [];

  const baseOf = (i) => {
    const e = state.data.emoji[i];
    return e.tv ? (state.tone > 0 ? e.tv[state.tone - 1] : e.c) : e.c;
  };

  /* ---------------------------------------------------------------- theme */
  function applyTheme() {
    const root = document.documentElement;
    const sysDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = state.theme === 'auto' ? (sysDark ? 'dark' : 'light') : state.theme;
    root.dataset.theme = resolved;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0e0e10' : '#ffffff');
    $$('[data-theme-opt]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeOpt === state.theme)));
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'auto') applyTheme();
  });

  /* ------------------------------------------------------------ tone bar */
  function buildTones() {
    const host = $('#tones');
    if (!host) return;
    const t1 = ['tone_default', 'tone_1', 'tone_2', 'tone_3', 'tone_4', 'tone_5'];
    // representative emoji for each swatch: 👍 neutral + 5 tones
    const hand = (i) => { const k = state.data.emoji.findIndex(e => e.c === '👍'); return k; };
    const handIdx = hand();
    const handEmoji = handIdx >= 0 ? state.data.emoji[handIdx] : null;
    const swatch = ['', ...(handEmoji?.tv || ['🏻', '🏼', '🏽', '🏾', '🏿'])];

    host.innerHTML =
      `<span class="tones-label">${esc(t('skin_tone'))}</span>
       <div class="tone-swatches" role="radiogroup" aria-label="${esc(t('skin_tone'))}">` +
      swatch.map((s, i) => {
        const glyph = s || (handEmoji ? handEmoji.c : '✋');
        const label = t(t1[i]);
        return `<button class="tone-btn" role="radio" data-tone="${i}" aria-pressed="${state.tone === i}"
                  aria-label="${esc(label)}" title="${esc(label)}">${esc(glyph)}</button>`;
      }).join('') +
      `</div>
       <button class="chip" id="tone-expand" type="button" aria-pressed="false" hidden>${esc(t('show_tones'))}</button>
       <span class="tones-note">${esc(t('tone_note'))}</span>`;

    host.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-tone]');
      if (!btn) return;
      if (state.tonesExpanded) expandTones(false);
      state.tone = Number(btn.dataset.tone);
      store.set(LS.tone, state.tone);
      $$('[data-tone]', host).forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.tone) === state.tone)));
      repaintTones();
      if (state.currentEmoji !== null) openDetail(state.currentEmoji);
    });

    $('#tone-expand')?.addEventListener('click', () => expandTones(!state.tonesExpanded));
  }

  /* Expand / collapse every skin-tone variant inline — the getemoji-style dense
     view, but only when the reader asks for it so the default page stays light. */
  function expandTones(on) {
    state.tonesExpanded = on;
    const btn = $('#tone-expand');
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? t('hide_tones') : t('show_tones');
    }
    const grid = $('#grid');
    if (!grid) return;
    if (!on) {
      $$('.cell.is-variant', grid).forEach(c => c.remove());
      return;
    }
    // show the untoned base so the five variants read as genuinely different
    if (state.tone !== 0) {
      state.tone = 0;
      store.set(LS.tone, 0);
      const bar = $('#tones');
      if (bar) $$('[data-tone]', bar).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tone === '0')));
      repaintTones();
    }
    $$('.cell[data-toned]', grid).forEach(cell => {
      const i = Number(cell.dataset.i);
      if (!Number.isFinite(i)) return;
      const e = state.data.emoji[i];
      if (!e || !e.tv) return;
      let anchor = cell;
      e.tv.forEach((v, k) => {
        if (v === e.c) return;
        const b = document.createElement('button');
        b.className = 'cell is-variant';
        b.dataset.c = v;
        b.dataset.variant = '1';
        b.textContent = v;
        const label = `${nameOf(i)} — ${t('tone_' + (k + 1))}`;
        b.title = label;
        b.setAttribute('aria-label', label);
        anchor.after(b);
        anchor = b;
      });
    });
  }

  /* Only offer the toggle when the page actually has tone-capable emoji. */
  /* The homepage shows two grids: the curated "Popular emoji" strip and #grid,
     which fills with search results or the full 1,906 set on demand. Showing
     both at once reads as a duplicated page, so one is always hidden. */
  function syncPopular() {
    const sec = document.getElementById('popular-sec');
    const grid = $('#grid');
    if (!sec || !grid) return;
    sec.hidden = !grid.hidden && grid.children.length > 0;
  }

  function syncToneToggle() {
    const btn = $('#tone-expand');
    if (!btn) return;
    // Pointless on a tone page: every cell there is already a variant, and
    // expanding would reset the tone to neutral and contradict the page.
    if (PAGE.page === 'tone') { btn.hidden = true; return; }
    btn.hidden = $$('.cell[data-toned]').length === 0;
  }

  function repaintTones() {
    $$('.cell').forEach(cell => {
      const i = Number(cell.dataset.i);
      if (!Number.isFinite(i)) return;
      const e = state.data.emoji[i];
      if (!e || !e.tv) return;
      cell.textContent = baseOf(i);
      const dot = document.createElement('span');
      dot.className = 'tone-dot';
      dot.setAttribute('aria-hidden', 'true');
      cell.appendChild(dot);
      const nm = nameOf(i);
      cell.setAttribute('aria-label', nm);
      cell.title = nm;
    });
  }

  /* ---------------------------------------------------------------- grid */
  function cellHTML(i) {
    const e = state.data.emoji[i];
    const nm = nameOf(i);
    const sel = state.tray.has(e.c);
    return `<button class="cell${sel ? ' is-selected' : ''}" data-i="${i}" data-c="${esc(e.c)}"
      title="${esc(nm)}" aria-label="${esc(nm)}"
      ${e.tv ? 'data-toned="1"' : ''}>${esc(baseOf(i))}${e.tv ? '<span class="tone-dot" aria-hidden="true"></span>' : ''}</button>`;
  }

  function renderGrid(container, indices) {
    if (!indices.length) return;
    const chunk = 600;
    let at = 0;
    container.innerHTML = '';
    const paint = () => {
      const html = indices.slice(at, at + chunk).map(cellHTML).join('');
      container.insertAdjacentHTML('beforeend', html);
      at += chunk;
      if (at < indices.length) requestAnimationFrame(paint);
    };
    paint();
  }

  /* -------------------------------------------------------------- search */
  function buildIndex() {
    // one lowercased haystack per emoji: name + keywords
    const n = state.data.emoji.length;
    const idx = new Array(n);
    for (let i = 0; i < n; i++) {
      const nm = (state.pack.names[i] || '').toLowerCase();
      const kw = (state.pack.keywords[i] || []).join(' ').toLowerCase();
      idx[i] = nm + ' ' + kw;
    }
    return idx;
  }

  function fold(s) {
    // strip diacritics + Arabic/Devanagari marks for forgiving matching
    return s.normalize('NFD').replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0900-\u0903\u093a-\u094f\u0951-\u0957\u0962-\u0963]/g, '').toLowerCase();
  }

  function searchEmoji(q) {
    const query = q.trim().toLowerCase();
    if (!query) return null;
    const qf = fold(query);
    const terms = query.split(/\s+/).filter(Boolean);
    const termsF = qf.split(/\s+/).filter(Boolean);
    const idx = state.searchIndex || (state.searchIndex = buildIndex());
    const idxF = state.foldIndex || (state.foldIndex = state.searchIndex.map(fold));

    const results = [];
    for (let i = 0; i < idx.length; i++) {
      const hay = idx[i];
      let score = 0, ok = true;
      for (let k = 0; k < terms.length; k++) {
        const term = terms[k], termF = termsF[k];
        let p = hay.indexOf(term);
        if (p === -1) {
          if (idxF[i].includes(termF)) { score += 2; continue; }
          ok = false; break;
        }
        // word-boundary hit beats mid-word hit
        score += (p === 0 || hay[p - 1] === ' ') ? 4 : 2;
      }
      if (!ok) continue;
      const name = (state.pack.names[i] || '').toLowerCase();
      if (name.startsWith(query)) score += 6;
      else if (name.includes(query)) score += 3;
      results.push({ i, score });
    }
    results.sort((a, b) => b.score - a.score || a.i - b.i);

    if (!results.length) {
      // fuzzy fallback: allow one edit on a single term
      const near = fuzzy(query, idx, idxF);
      if (near.length) return { list: near, fuzzy: true, suggestion: state.pack.names[near[0]] };
      return { list: [], fuzzy: false };
    }
    return { list: results.map(r => r.i), fuzzy: false };
  }

  function fuzzy(query, idx, idxF) {
    if (query.length < 4) return [];
    const out = [];
    for (let i = 0; i < idxF.length && out.length < 60; i++) {
      const words = idxF[i].split(/[\s,]+/);
      for (const w of words) {
        if (Math.abs(w.length - query.length) <= 1 && editDistanceAtMost1(w, query)) { out.push(i); break; }
      }
    }
    return out;
  }

  function editDistanceAtMost1(a, b) {
    if (a === b) return true;
    let i = 0, j = 0, edits = 0, la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (la > lb) i++;
      else if (lb > la) j++;
      else { i++; j++; }
    }
    return edits + (la - i) + (lb - j) <= 1;
  }

  /* ------------------------------------------------------------- views */
  function setView(view, opts = {}) {
    state.view = view;
    const grid = $('#grid');
    const note = $('#results-note');
    const empty = $('#empty');
    if (!grid) return;

    $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));

    if (view === 'all') {
      if (empty) empty.hidden = true;
      note && (note.hidden = true);
      restoreServerGrid(!!opts.buildAll);
      syncToneToggle();
      syncPopular();
      return;
    }

    let indices = [];
    if (view === 'fav') indices = allIndices().filter(i => state.fav.has(idOf(i)));
    if (view === 'recent') indices = state.recent.map(c => indexOfChar(c)).filter(i => i >= 0);

    grid.hidden = false;
    if (note) {
      note.hidden = false;
      note.innerHTML = `<b>${escapeHtml(t(view))}</b> · ${indices.length}`;
    }
    if (!indices.length) {
      grid.innerHTML = '';
      grid.hidden = true;
      if (empty) {
        empty.hidden = false;
        empty.innerHTML = `<div class="e-glyph">${view === 'fav' ? '🤍' : '🕘'}</div><p>${esc(t(view + '_empty'))}</p>`;
      }
      syncPopular();
    } else {
      if (empty) empty.hidden = true;
      renderGrid(grid, indices);
      syncPopular();
    }
  }

  function escapeHtml(s) { return esc(s); }
  const indexOfChar = (c) => state.byChar.get(c) ?? -1;
  function allIndices() { return state.allIndices || (state.allIndices = state.data.emoji.map((_, i) => i)); }

  let serverGridHTML = null;
  function restoreServerGrid(buildAll) {
    const grid = $('#grid');
    if (!grid) return;

    if (serverGridHTML && serverGridHTML.trim() !== '') {
      if (grid.innerHTML !== serverGridHTML) grid.innerHTML = serverGridHTML;
      grid.hidden = false;
      return;
    }

    // This page ships no server-rendered grid (the homepage). Building all
    // 1,906 cells is only worth doing when the reader asked for it by name —
    // clearing a search should return them to the curated view, not dump the
    // entire set on screen.
    if (buildAll) {
      renderGrid(grid, allIndices());
      grid.hidden = false;
    } else {
      grid.innerHTML = '';
      grid.hidden = true;
    }
  }

  function runSearch(q) {
    const grid = $('#grid');
    const note = $('#results-note');
    const empty = $('#empty');
    if (!grid) return;
    const searchBox = $('.search');
    searchBox && searchBox.classList.toggle('has-value', !!q);

    if (!q.trim()) { setView('all'); syncPopular(); return; }

    const res = searchEmoji(q);
    const list = res ? res.list : [];
    grid.hidden = !list.length;
    if (empty) empty.hidden = !!list.length;

    if (!list.length) {
      grid.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        empty.innerHTML = `<div class="e-glyph">🔍</div><p><b>${esc(t('no_results'))}</b></p><p>${esc(t('no_results_hint'))}</p>`;
      }
      note && (note.hidden = true);
      syncPopular();
      return;
    }
    if (note) {
      note.hidden = false;
      note.innerHTML = `${res.fuzzy ? esc(t('search_fuzzy')) + ' · ' : ''}` +
        (list.length === 1 ? esc(t('results_one')) : esc(t('results_many', { n: list.length })));
    }
    renderGrid(grid, list);
    syncPopular();
  }

  /* -------------------------------------------------------- detail sheet */
  function openDetail(i) {
    const dlg = $('#detail');
    if (!dlg || !state.data) return;
    const e = state.data.emoji[i];
    const nm = nameOf(i);
    const glyph = baseOf(i);
    state.currentEmoji = i;
    state.lastFocus = document.activeElement;

    const cps = e.cp.split(' ').map(c => 'U+' + c).join(' ');
    const kws = keywordsOf(i);
    const related = relatedTo(i, 12);

    const htmlFor = `&#${e.cp.split(' ')[0]};`;
    const jsonFor = JSON.stringify({ emoji: e.c, name: nm, codepoints: e.cp, keywords: kws }, null, 2);
    const mdFor = e.c;
    const escFor = e.cp.split(' ').map(c => '\\u{' + c.toLowerCase() + '}').join('');

    const segs = graphemes(glyph);
    const count = segs.length;
    const stateName = count <= 150 ? 'fits' : (count <= 280 ? 'tight' : 'long');

    const toneSet = e.tv ? [...new Set([e.c, ...e.tv])] : [];
    const tonesGrid = toneSet.length
      ? `<div class="kv-row"><span class="kv-label">${esc(t('tone_variants'))}</span>
           <div class="mini-grid">` +
        toneSet.map((c, k) => `<button class="mini" data-mini="${esc(c)}" aria-current="${k === 0}"
            title="${esc(nm)}">${esc(c)}</button>`).join('') + `</div></div>`
      : '';
    const mixedGrid = (e.tc && e.tc.length)
      ? `<div class="kv-row"><span class="kv-label">${esc(t('mixed_tones'))}</span>
           <div class="mini-grid">` +
        [...new Set(e.tc)].map(c => `<button class="mini" data-mini="${esc(c)}"
            title="${esc(nm)}">${esc(c)}</button>`).join('') + `</div></div>`
      : '';

    $('#detail-body').innerHTML = `
      <div class="detail-top">
        <div class="detail-glyph" id="detail-glyph">${esc(glyph)}</div>
        <div class="actions">
          <button class="btn btn-primary" id="detail-copy">${esc(t('copy'))}</button>
          <button class="btn" id="detail-fav" aria-pressed="${state.fav.has(e.c)}">
            ${state.fav.has(e.c) ? '★' : '☆'} ${esc(t('favourites'))}
          </button>
        </div>
      </div>

      <div class="kv">
        <div class="kv-row">
          <span class="kv-label">${esc(t('count_label'))}</span>
          <div class="counter" data-state="${stateName === 'fits' ? '' : stateName}">
            <span class="nums">${count} ${esc(t('count_graphemes'))}</span>
            <span class="msg">${esc(t('count_' + stateName))}</span>
          </div>
        </div>

        ${tonesGrid}
        ${mixedGrid}

        ${kws.length ? `<div class="kv-row"><span class="kv-label">${esc(t('keywords'))}</span>
          <div class="tag-list">${kws.map(k => `<span class="tag">${esc(k)}</span>`).join('')}</div></div>` : ''}

        <div class="kv-row"><span class="kv-label">${esc(t('codepoints'))}</span>
          <div class="cp-line">${e.cp.split(' ').map(c => `<span class="cp">U+${esc(c)}</span>`).join('')}
          <span class="cp">${esc('e' + e.e)}</span></div></div>

        <div class="kv-row"><span class="kv-label">${esc(t('copy_as'))}</span>
          <div class="copy-row">
            <button class="btn btn-sm" data-copyas="html">${esc(t('copy_html'))}</button>
            <button class="btn btn-sm" data-copyas="json">${esc(t('copy_json'))}</button>
            <button class="btn btn-sm" data-copyas="markdown">${esc(t('copy_markdown'))}</button>
            <button class="btn btn-sm" data-copyas="unicode">${esc(t('copy_unicode'))}</button>
          </div></div>

        <div class="kv-row"><span class="kv-label">${esc(t('platform'))}</span>
          <div class="platforms">
            ${['Apple', 'Android', 'Windows'].map(p => `<div class="platform">
              <div class="p-glyph">${esc(glyph)}</div><div class="p-name">${esc(p)}</div></div>`).join('')}
          </div>
          <p class="platform-note">${esc(t('platform_note'))}</p></div>

        ${related.length ? `<div class="kv-row"><span class="kv-label">${esc(t('related'))}</span>
          <div class="mini-grid">${related.map(r => `<button class="mini" data-goto="${r}"
            title="${esc(nameOf(r))}">${esc(state.data.emoji[r].c)}</button>`).join('')}</div></div>` : ''}
      </div>`;

    // wire up
    $('#detail-copy').addEventListener('click', () => copy(glyph, glyph));
    $('#detail-fav').addEventListener('click', (ev) => {
      toggleFav(i); openDetail(i);
    });
    $('#detail-body').addEventListener('click', (ev) => {
      const mini = ev.target.closest('[data-mini]');
      if (mini) { copy(mini.dataset.mini, mini.dataset.mini); return; }
      const go = ev.target.closest('[data-goto]');
      if (go) { openDetail(Number(go.dataset.goto)); return; }
      const ca = ev.target.closest('[data-copyas]');
      if (ca) {
        const map = { html: htmlFor, json: jsonFor, markdown: mdFor, unicode: escFor };
        copy(map[ca.dataset.copyas], glyph);
      }
    });
    $('#detail-body').scrollTop = 0;

    const title = $('#detail-title');
    if (title) title.textContent = nm;

    if (!dlg.open) dlg.showModal();
    // move focus into the dialog for keyboard users
    $('#detail-copy').focus({ preventScroll: true });
  }

  function relatedTo(i, limit) {
    const group = state.data.emoji[i].g;
    const mine = new Set(keywordsOf(i).map(k => k.toLowerCase()));
    const scored = [];
    for (let j = 0; j < state.data.emoji.length; j++) {
      if (j === i || state.data.emoji[j].g !== group) continue;
      let s = 0;
      for (const k of keywordsOf(j)) if (mine.has(k.toLowerCase())) s++;
      if (s) scored.push([s, j]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    return scored.slice(0, limit).map(x => x[1]);
  }

  function toggleFav(i) {
    const c = idOf(i);
    if (state.fav.has(c)) state.fav.delete(c); else state.fav.add(c);
    store.set(LS.fav, [...state.fav]);
    updateCounts();
  }

  function pushRecent(i) {
    const c = idOf(i);
    state.recent = [c, ...state.recent.filter(x => x !== c)].slice(0, 120);
    store.set(LS.recent, state.recent);
    updateCounts();
  }

  function updateCounts() {
    const fb = $('#fav-count');
    if (fb) { fb.textContent = state.fav.size; fb.hidden = !state.fav.size; }
    const tb = $('#tray-count');
    if (tb) { tb.textContent = state.tray.size; tb.hidden = !state.tray.size; }
    const fn = $('#fav-n');
    if (fn) fn.textContent = state.fav.size;
  }

  /* --------------------------------------------------------------- tray */
  function renderTray() {
    const el = $('#tray');
    if (!el) return;
    el.dataset.open = String(state.tray.size > 0);
    const body = $('#tray-body');
    const items = [...state.tray];
    body.innerHTML = items.length
      ? items.map(c => `<button class="tray-item" data-tray-c="${esc(c)}" title="${esc(t('remove'))}" aria-label="${esc(t('remove'))}">${esc(c)}</button>`).join('')
      : `<span class="tray-empty">${esc(t('tray_empty'))}</span>`;
    updateCounts();
  }

  function toggleTray(idx) {
    const c = idOf(idx);
    if (state.tray.has(c)) state.tray.delete(c); else state.tray.add(c);
    store.set(LS.tray, [...state.tray]);
    const cell = $(`.cell[data-i="${idx}"]`);
    if (cell) cell.classList.toggle('is-selected', state.tray.has(c));
    renderTray();
  }

  /* --------------------------------------------------------------- init */
  async function loadJSON(url) {
    const r = await fetch(url, { cache: 'force-cache' });
    if (!r.ok) throw new Error(url + ' → ' + r.status);
    return r.json();
  }

  async function init() {
    const base = document.body.dataset.base || '/';

    try {
      const [data, pack, i18n] = await Promise.all([
        loadJSON(base + 'data/emoji.json'),
        loadJSON(base + 'data/locales/' + PAGE.lang + '.json'),
        loadJSON(base + 'data/i18n.json'),
      ]);
      state.data = data;
      state.pack = pack;
      state.i18n = i18n;
      state.t = (i18n.ui && i18n.ui[PAGE.lang]) || (i18n.ui && i18n.ui.en) || {};
    } catch (err) {
      console.warn('[emoji] data unavailable, running static-only', err);
      return;
    }

    state.byChar = new Map(state.data.emoji.map((e, i) => [e.c, i]));

    /* On a skin-tone page the cells are rendered in that tone, so the active
       tone must match — otherwise the glyph on screen and the glyph copied to
       the clipboard disagree (you would see 👋🏿 and paste 👋). The page index
       wins over the remembered preference for the length of the visit. */
    if (typeof PAGE.tone === 'number' && PAGE.tone >= 0) {
      state.tone = PAGE.tone;
      store.set(LS.tone, PAGE.tone);
    }
    // Snapshot the server-rendered grid now. Capturing it lazily inside
    // restoreServerGrid() would record whatever a search had just put there.
    const gEl = $('#grid');
    if (gEl) serverGridHTML = gEl.innerHTML;

    applyTheme();
    buildTones();
    renderTray();
    updateCounts();
    if (PAGE.page === 'home') syncToneToggle();   // grid renders on demand here
    else setView('all');
    enablePWA();
    suggestLanguage();

    /* --- global click handling for cells (delegated) --- */
    document.addEventListener('click', (ev) => {
      const cell = ev.target.closest('.cell');
      if (cell) {
        if (cell.dataset.variant) {
          const g = cell.dataset.c;
          copy(g, g).then((ok) => {
            if (!ok) return;
            cell.classList.add('is-copied');
            setTimeout(() => cell.classList.remove('is-copied'), 420);
          });
          return;
        }
        const i = Number(cell.dataset.i);
        if (!Number.isFinite(i)) return;
        if (state.selectMode || ev.metaKey || ev.ctrlKey) {
          toggleTray(i); pushRecent(i); return;
        }
        const g = baseOf(i);
        copy(g, g).then((ok) => {
          if (!ok) return;
          cell.classList.add('is-copied');
          setTimeout(() => cell.classList.remove('is-copied'), 420);
          pushRecent(i);
        });
        return;
      }

      const tb = ev.target.closest('[data-tray-c]');
      if (tb) {
        const c = tb.dataset.trayC;
        state.tray.delete(c);
        store.set(LS.tray, [...state.tray]);
        const i = indexOfChar(c);
        const cell = $(`.cell[data-i="${i}"]`);
        if (cell) cell.classList.remove('is-selected');
        renderTray();
      }
    });

    /* --- long-press / hover-info opens the detail sheet --- */
    let pressTimer = null;
    document.addEventListener('pointerdown', (ev) => {
      const cell = ev.target.closest('.cell');
      if (!cell || ev.pointerType === 'mouse') return;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        navigator.vibrate && navigator.vibrate(8);
        openDetail(Number(cell.dataset.i));
      }, 460);
    }, { passive: true });
    ['pointerup', 'pointercancel', 'pointermove'].forEach(evt =>
      document.addEventListener(evt, () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } }, { passive: true }));

    document.addEventListener('keydown', (ev) => {
      const cell = ev.target.closest && ev.target.closest('.cell');
      if (cell && ev.key === ' ') { ev.preventDefault(); openDetail(Number(cell.dataset.i)); }
      if (ev.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        ev.preventDefault(); $('#q')?.focus();
      }
    });

    /* --- detail dialog --- */
    const dlg = $('#detail');
    if (dlg) {
      $('#detail-close')?.addEventListener('click', () => dlg.close());
      dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });
      dlg.addEventListener('close', () => {
        state.currentEmoji = null;
        if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus({ preventScroll: true });
      });
    }

    /* --- search box --- */
    const input = $('#q');
    if (input) {
      let debounce = null;
      input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => runSearch(input.value), 110);
      });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { input.value = ''; runSearch(''); return; }
        if (ev.key === 'Enter') {
          const first = $('#grid .cell');
          if (first) { ev.preventDefault(); first.click(); }
        }
      });
      $('#q-clear')?.addEventListener('click', () => {
        input.value = ''; runSearch(''); input.focus();
      });
      // prefill from ?q= for shareable searches
      const qp = new URLSearchParams(location.search).get('q');
      if (qp) { input.value = qp; runSearch(qp); }
    }

    /* --- view chips, toolbars, menus --- */
    $$('[data-view]').forEach(b => b.addEventListener('click',
      () => setView(b.dataset.view, { buildAll: b.dataset.view === 'all' })));

    $('#select-toggle')?.addEventListener('click', (ev) => {
      state.selectMode = !state.selectMode;
      ev.currentTarget.setAttribute('aria-pressed', String(state.selectMode));
      document.body.classList.toggle('is-selecting', state.selectMode);
    });
    $('#tray-copy')?.addEventListener('click', () => {
      const all = [...state.tray].join('');
      copy(all, null);
    });
    $('#tray-clear')?.addEventListener('click', () => {
      state.tray.clear(); store.set(LS.tray, []);
      $$('.cell.is-selected').forEach(c => c.classList.remove('is-selected'));
      renderTray();
    });

    $('#theme-toggle')?.addEventListener('click', () => {
      const order = ['auto', 'light', 'dark'];
      state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
      store.set(LS.theme, state.theme);
      applyTheme();
    });
    $$('[data-theme-opt]').forEach(b => b.addEventListener('click', () => {
      state.theme = b.dataset.themeOpt; store.set(LS.theme, state.theme); applyTheme();
    }));

    // dropdown menus
    $$('.menu > button').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const menu = btn.parentElement;
        const open = menu.dataset.open === 'true';
        $$('.menu').forEach(m => m.dataset.open = 'false');
        menu.dataset.open = String(!open);
      });
    });
    document.addEventListener('click', () => $$('.menu').forEach(m => m.dataset.open = 'false'));
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') $$('.menu').forEach(m => m.dataset.open = 'false'); });

    // language menu: preserve current path when switching
    $$('[data-lang-go]').forEach(a => a.addEventListener('click', () => {
      const target = a.dataset.langGo;
      const path = location.pathname
        .replace(/^\/(hi|es|ar|pt|fr|de|id)(?=\/|$)/, '') || '/';
      location.href = target === 'en' ? path : '/' + target + path;
    }));

    // deep link: #e=😀
    const m = location.hash.match(/^#e=(.+)$/);
    if (m) {
      const i = indexOfChar(decodeURIComponent(m[1]));
      if (i >= 0) openDetail(i);
    }
  }

  /* ------------------------------------------------------------ language */
  function suggestLanguage() {
    const bar = $('#lang-bar');
    if (!bar || PAGE.lang !== 'en') return;
    const dismissed = store.get(LS.langDismissed, null);
    if (dismissed && Date.now() - dismissed < 30 * 864e5) return;
    const langs = state.i18n.langs.map(l => l.code);
    const wanted = (navigator.languages || [navigator.language || 'en'])
      .map(l => String(l).toLowerCase().split('-')[0])
      .find(c => c !== 'en' && langs.includes(c));
    if (!wanted) return;
    const meta = state.i18n.langs.find(l => l.code === wanted);
    bar.innerHTML = `<span>${esc(t('lang_suggest', { lang: meta.native }))}</span>
      <span class="spacer"></span>
      <button class="btn btn-sm btn-primary" data-lang-accept>${esc(t('lang_switch_yes'))}</button>
      <button class="btn btn-sm" data-lang-dismiss>${esc(t('lang_switch_no'))}</button>`;
    bar.dataset.show = 'true';
    $('[data-lang-accept]', bar).addEventListener('click', () => {
      const path = location.pathname.replace(/^\/(hi|es|ar|pt|fr|de|id)(?=\/|$)/, '') || '/';
      location.href = '/' + wanted + path;
    });
    $('[data-lang-dismiss]', bar).addEventListener('click', () => {
      store.set(LS.langDismissed, Date.now());
      bar.dataset.show = 'false';
    });
  }

  /* ----------------------------------------------------------------- PWA */
  function enablePWA() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register((document.body.dataset.base || '/') + 'sw.js')
        .then((reg) => {
          // If a newer worker takes over, reload once so the reader is on the
          // current build rather than a page the previous worker cached.
          let reloaded = false;
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloaded) return;
            reloaded = true;
            location.reload();
          });
          // Check for an updated worker on every load, and re-check when a tab
          // regains focus (covers long-lived preview sessions).
          reg.update().catch(() => {});
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) reg.update().catch(() => {});
          });
        })
        .catch(() => {});
    });
  }

  /* ------------------------------------------------------------------ go */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // expose a tiny surface for inline handlers / debugging
  window.EmojiDirectory = {
    state, openDetail, setView, runSearch, toast,
    /* Which clipboard route does this browser allow?
       Run in the console:  EmojiDirectory.clipboardReport()  */
    async clipboardReport() {
      let inFrame = false;
      try { inFrame = window.self !== window.top; } catch { inFrame = true; }
      const report = {
        inFrame,
        secureContext: window.isSecureContext,
        hasAsyncApi: !!(navigator.clipboard && navigator.clipboard.writeText),
        localStorageWritable: (() => {
          try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
          catch { return false; }
        })(),
        legacyExecCommand: (() => {
          try {
            const ta = document.createElement('textarea');
            ta.value = 'x';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
          } catch { return false; }
        })(),
      };
      console.table(report);
      return report;
    },
  };
})();
