/* CAPES-Lattes Área 39 — leitura do Currículo Lattes e interface.
 * Fluxo: extrairArtigos() -> classify() [rules.js] -> selos + painel.
 * Estrutura do parser inspirada em CAPES-Lattes Área 27 (NEPECON/UnB, licença MIT).
 */
(() => {
  'use strict';
  const DB = globalThis.CPRI39_DATA;
  const R = globalThis.CPRI39_RULES;
  if (!DB || !R) return;

  const VERSION = chrome.runtime.getManifest().version;
  const state = { arts: [], researcher: { name: '', id: '' }, ini: 2025, fim: 2028, bonus: new Set() };

  // ---------- utilidades ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  function isLattesCV() {
    const t = document.body?.innerText || '';
    return /ID\s+Lattes\s*:/i.test(t) || /Artigos\s+completos\s+publicados\s+em\s+peri[óo]dicos/i.test(t);
  }

  // ---------- extração ----------
  function fromCvuri(node) {
    for (const cv of node.querySelectorAll('[cvuri]')) {
      const raw = String(cv.getAttribute('cvuri') || '').replace(/&amp;/g, '&');
      const q = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
      const p = new URLSearchParams(q);
      const issn = R.normIssn(p.get('issn'));
      const journal = clean(p.get('nomePeriodico') || '');
      if (issn || journal) return { issn, journal };
    }
    return { issn: '', journal: '' };
  }

  function citationText(node) {
    // Remove numeração, metadados ocultos de ordenação e selos antes de ler o texto.
    const c = node.cloneNode(true);
    c.querySelectorAll('.informacao-artigo,.text-align-right,[cvuri],.a39-badge,script,style,img')
      .forEach(x => x.remove());
    return clean((c.textContent || '').replace(/Cita[çc][õo]es:.*$/is, ' '));
  }

  function yearOf(node, text) {
    const s = node.querySelector('[data-tipo-ordenacao="ano"]');
    const y = s ? parseInt(clean(s.textContent), 10) : NaN;
    if (y >= 1950 && y <= 2100) return y;
    const all = [...text.matchAll(/\b(?:19[5-9]\d|20\d{2})\b/g)].map(m => +m[0]);
    return all.length ? all[all.length - 1] : null;
  }

  function journalFromCitation(text) {
    const s = text.replace(/\bJCR\b/g, ' ');
    for (const re of [/,\s*v\.\s*[A-Za-z0-9]/i, /,\s*n\.\s*[A-Za-z0-9]/i, /,\s*p\.\s*[A-Za-z0-9]/i]) {
      const ix = s.search(re);
      if (ix > 0) {
        // último ". " fora de parênteses: "Título. DADOS (Rio de Janeiro. Impresso), v. 1"
        const head = s.slice(0, ix);
        let depth = 0, cut = 0;
        for (let i = head.length - 1; i > 0; i--) {
          const ch = head[i];
          if (ch === ')') depth++;
          else if (ch === '(') depth = Math.max(0, depth - 1);
          else if (depth === 0 && /\s/.test(ch) && head[i - 1] === '.') { cut = i; break; }
        }
        const j = clean(head.slice(cut));
        if (j.length > 2 && j.length < 200) return j;
      }
    }
    return '';
  }

  /** Lattes moderno: cada artigo é div.artigo-completo. Fallback heurístico abaixo. */
  function articleNodes() {
    const nodes = [...document.querySelectorAll('.artigo-completo')];
    if (nodes.length) return nodes;
    // Fallback: blocos da seção "Artigos completos publicados em periódicos"
    const head = [...document.querySelectorAll('b,strong,div,span,h1,h2,h3,h4')]
      .find(e => /^Artigos completos publicados em peri[óo]dicos$/i.test(clean(e.textContent)));
    if (!head) return [];
    let sec = head.parentElement;
    for (let i = 0; i < 6 && sec; i++, sec = sec.parentElement) {
      const t = sec.innerText || '';
      if (t.length > 200 && !/Cap[íi]tulos de livros publicados/i.test(t)) break;
    }
    if (!sec) return [];
    const looks = t => t.length > 55 && t.length < 2500 && /\b(19|20)\d{2}\b/.test(t) &&
      !/\bIn:\s|\bISBN\b|\bEditora\b/i.test(t) && /,\s*v\.\s*\w|,\s*p\.\s*\w/i.test(t);
    let cand = [...sec.querySelectorAll('div,li,p')].filter(e => looks(clean(e.innerText)));
    cand = cand.filter(e => ![...e.querySelectorAll(':scope > div,:scope > li,:scope > p')]
      .some(ch => looks(clean(ch.innerText))));
    return cand;
  }

  function extrairArtigos() {
    const out = [], seen = new Set();
    for (const node of articleNodes()) {
      const text = citationText(node);
      const year = yearOf(node, text);
      if (!year) continue;
      const cv = fromCvuri(node);
      const journal = cv.journal || journalFromCitation(text);
      const doi = (text.match(/10\.\d{4,9}\/[^\s]+/i) || [])[0] || '';
      const key = doi ? 'doi:' + doi.toLowerCase() : year + '|' + R.normTitle(text).slice(0, 160);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ node, text, year, issn: cv.issn, journal, doi });
    }
    return out;
  }

  function researcher() {
    const body = document.body.innerText || '';
    const id = (body.match(/ID\s+Lattes:\s*(\d{10,20})/i) || [])[1] || '';
    const nome = clean(document.querySelector('.infpessoa h2.nome, h2.nome, .nome')?.textContent || '') ||
      clean(document.title.replace(/Curr[íi]culo do Sistema de Curr[íi]culos Lattes/i, '').replace(/[()]/g, ''));
    return { name: nome || 'Pesquisador(a)', id };
  }

  // ---------- selos ----------
  function tier(e) {
    if (e === 'ND') return 'nd';
    if (e === 'B') return 'b';
    return R.SUPERIORES.has(e) ? 'sup' : 'inf';
  }

  function badge(a) {
    const c = a.c;
    const b = el('span', 'a39-badge a39-' + tier(c.estrato));
    const label = c.estrato === 'ND' ? 'A39 · não localizado' :
      `A39 · ${c.estrato} est. · ${c.pontos} pts${c.bonus ? ' (+50 Scopus)' : ''}`;
    b.textContent = label;
    b.title = c.estrato === 'ND'
      ? 'Periódico não encontrado na lista Qualis 2021–2024 da Área 39 (por ISSN nem por título).'
      : `Estrato estimado ${c.estrato} (Ficha 2025–2028) a partir do Qualis 2021–2024 ${c.qualis}.\n` +
        `Periódico: ${c.titulo} — ISSN ${c.issn}\nCorrespondência por ${c.metodo}.` +
        (R.SUPERIORES.has(c.estrato) ? '\nEstrato superior: pode ser indicado pelo docente (IPArDo).' : '');
    return b;
  }

  function placeBadges() {
    document.querySelectorAll('.a39-badge').forEach(x => x.remove());
    for (const a of state.arts) {
      const host = a.node.querySelector('.layout-cell-pad-5:not(.text-align-right)') || a.node;
      const b = badge(a);
      if (!R.inPeriod(a, state.ini, state.fim)) b.classList.add('a39-out');
      host.appendChild(b);
    }
  }

  // ---------- painel ----------
  function barsSVG(rows, max, color) {
    const h = 22, w = 360, lw = 54;
    const m = Math.max(1, max);
    const body = rows.map((r, i) => {
      const bw = Math.round((r.v / m) * (w - lw - 50));
      return `<g transform="translate(0,${i * h})">
        <text x="0" y="15" class="a39-ax">${esc(r.k)}</text>
        <rect x="${lw}" y="4" width="${Math.max(bw, r.v ? 2 : 0)}" height="14" rx="3" fill="${r.color || color}"/>
        <text x="${lw + bw + 6}" y="15" class="a39-val">${r.v}</text></g>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${rows.length * h}" width="100%" role="img">${body}</svg>`;
  }

  const COR = { sup: '#1f5f99', inf: '#6a8fb5', b: '#9a6b16', nd: '#8b95a1' };

  function renderPanel() {
    document.querySelector('.a39-backdrop')?.remove();
    const s = R.summarize(state.arts, state.ini, state.fim);
    const back = el('div', 'a39-backdrop');
    const anos = [...new Set(state.arts.map(a => a.year))].sort();
    const minY = Math.min(2017, ...anos), maxY = Math.max(2028, ...anos);
    const opts = sel => { let o = ''; for (let y = minY; y <= maxY; y++) o += `<option ${y === sel ? 'selected' : ''}>${y}</option>`; return o; };

    const distRows = [...R.ESTRATOS, 'ND'].map(e => ({ k: e === 'ND' ? 'não loc.' : e, v: s.dist[e] || 0, color: COR[tier(e)] }));
    const anoRows = Object.entries(s.porAno).map(([k, v]) => ({ k, v }));

    const linhas = state.arts
      .filter(a => R.inPeriod(a, state.ini, state.fim))
      .sort((x, y) => y.year - x.year || y.c.pontos - x.c.pontos)
      .map(a => `<tr>
        <td>${a.year}</td>
        <td><span class="a39-chip a39-${tier(a.c.estrato)}">${a.c.estrato === 'ND' ? '—' : a.c.estrato}</span></td>
        <td class="num">${a.c.pontos}${a.c.bonus ? '<sup title="Bônus Scopus">+</sup>' : ''}</td>
        <td><div class="a39-ref">${esc(a.text.slice(0, 260))}${a.text.length > 260 ? '…' : ''}</div>
            <div class="a39-meta">${esc(a.c.titulo || a.journal || 'periódico não identificado')}${a.c.issn ? ' · ISSN ' + a.c.issn : ''}${a.c.qualis ? ' · Qualis 21–24: ' + a.c.qualis : ''} · ${esc(a.c.metodo)}</div></td>
      </tr>`).join('');

    const ind = s.indicados.length
      ? s.indicados.map(a => `<li><b>${a.c.estrato} · ${a.c.pontos} pts</b> — ${esc(a.c.titulo)} (${a.year})<div class="a39-ref">${esc(a.text.slice(0, 200))}…</div></li>`).join('')
      : '<li>Nenhum artigo A1–A4 no período.</li>';

    back.innerHTML = `
      <div class="a39-modal" role="dialog" aria-label="Painel Área 39">
        <header>
          <div><h2>${esc(state.researcher.name)}</h2>
          <p>CAPES-Lattes Área 39 v${VERSION} · Ciência Política e Relações Internacionais · estimativa pela Ficha 2025–2028</p></div>
          <button class="a39-close" aria-label="Fechar">✕</button>
        </header>
        <main>
          <div class="a39-controls">
            <label>De <select id="a39ini">${opts(state.ini)}</select></label>
            <label>até <select id="a39fim">${opts(state.fim)}</select></label>
            <button id="a39quad" class="sec">Quadriênio 2025–2028</button>
            <button id="a39csv" class="sec">Exportar CSV</button>
          </div>
          <div class="a39-kpis">
            <div><span>Artigos no período</span><b>${s.total}</b></div>
            <div><span>Localizados na base</span><b>${s.localizados}</b></div>
            <div><span>Estratos A1–A4</span><b>${s.superiores}</b></div>
            <div><span>Pontos (todos os estratos)</span><b>${s.pontos}</b></div>
            <div><span>Melhores 2 (A1–A4)</span><b>${s.ipardo}</b></div>
          </div>
          <div class="a39-grid">
            <section><h3>Distribuição por estrato</h3>${barsSVG(distRows, Math.max(...distRows.map(r => r.v)), COR.sup)}</section>
            <section><h3>Pontos por ano</h3>${barsSVG(anoRows, Math.max(...anoRows.map(r => r.v)), COR.sup)}</section>
          </div>
          <section><h3>Sugestão de indicação do docente (até 2 artigos A1–A4)</h3>
            <p class="a39-note">Item 2.4.2a: cada docente permanente indica até dois artigos do quadriênio; só contam A1–A4. A soma acima é a contribuição desse docente ao numerador do IPArDo.</p>
            <ol class="a39-ind">${ind}</ol></section>
          <section><h3>Artigos do período</h3>
            <table class="a39-table"><thead><tr><th>Ano</th><th>Estrato</th><th>Pts</th><th>Referência</th></tr></thead>
            <tbody>${linhas || '<tr><td colspan="4">Nenhum artigo no período.</td></tr>'}</tbody></table></section>
          <p class="a39-disclaimer"><b>Estimativa, não classificação oficial.</b> O estrato 2025–2028 é estimado convertendo o Qualis 2021–2024 da Área 39
          (A1→A1 … B1→A5, B2→A6, B3→A7, B4→A8, C→B). A Ficha prevê estratos por percentis do h5 do Google Scholar calculados em 2029.
          Pesos: A1=100, A2=85, A3=70, A4=55, A5=25, A6=20, A7=10, A8=5, B=0; +50 para periódicos no top 20% da Scopus (lista configurável nas opções).
          Ferramenta independente, sem vínculo com CAPES ou CNPq. Fonte: ${esc(DB.fonte)}.</p>
        </main>
      </div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.querySelector('.a39-close').onclick = close;
    back.addEventListener('click', e => { if (e.target === back) close(); });
    const upd = () => {
      state.ini = +back.querySelector('#a39ini').value;
      state.fim = +back.querySelector('#a39fim').value;
      if (state.fim < state.ini) [state.ini, state.fim] = [state.fim, state.ini];
      placeBadges(); updateLauncher(); renderPanel();
    };
    back.querySelector('#a39ini').onchange = upd;
    back.querySelector('#a39fim').onchange = upd;
    back.querySelector('#a39quad').onclick = () => { state.ini = 2025; state.fim = 2028; placeBadges(); updateLauncher(); renderPanel(); };
    back.querySelector('#a39csv').onclick = exportCSV;
  }

  function exportCSV() {
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['ano', 'estrato_estimado', 'pontos', 'bonus_scopus', 'qualis_2021_2024', 'periodico', 'issn', 'correspondencia', 'doi', 'referencia']];
    for (const a of state.arts) rows.push([a.year, a.c.estrato, a.c.pontos, a.c.bonus ? 1 : 0, a.c.qualis, a.c.titulo || a.journal, a.c.issn, a.c.metodo, a.doi, a.text]);
    const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const link = el('a'); link.href = URL.createObjectURL(blob);
    link.download = `area39_${state.researcher.id || 'lattes'}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }

  // ---------- lançador ----------
  function updateLauncher() {
    let box = document.querySelector('.a39-launcher');
    if (!box) {
      box = el('div', 'a39-launcher');
      box.innerHTML = '<div><b>Área 39</b><span class="a39-lmeta"></span></div><button>Abrir painel</button>';
      box.querySelector('button').onclick = renderPanel;
      document.body.appendChild(box);
    }
    const s = R.summarize(state.arts, state.ini, state.fim);
    box.querySelector('.a39-lmeta').textContent =
      `${state.ini}–${state.fim}: ${s.total} artigo(s) · ${s.superiores} em A1–A4 · ${s.pontos} pts`;
  }

  // ---------- execução ----------
  async function run() {
    const st = await chrome.storage.local.get({ a39BonusIssns: [], a39Ini: 2025, a39Fim: 2028 });
    state.bonus = new Set((st.a39BonusIssns || []).map(R.normIssn).filter(Boolean));
    state.ini = st.a39Ini; state.fim = st.a39Fim;
    state.researcher = researcher();
    state.arts = extrairArtigos().map(a => ({ ...a, c: R.classify(a, DB, state.bonus) }));
    placeBadges();
    updateLauncher();
    const s = R.summarize(state.arts, state.ini, state.fim);
    await chrome.storage.local.set({
      a39UltimoCV: {
        nome: state.researcher.name, id: state.researcher.id, quando: new Date().toISOString(),
        artigos: state.arts.length, periodo: [state.ini, state.fim], resumo: { total: s.total, superiores: s.superiores, pontos: s.pontos, ipardo: s.ipardo }
      }
    });
  }

  chrome.runtime.onMessage.addListener((m, _s, send) => {
    if (m?.type === 'A39_RUN') { run().then(() => send({ ok: true })); return true; }
    if (m?.type === 'A39_PANEL') { renderPanel(); send({ ok: true }); }
  });

  if (isLattesCV()) run();
})();
