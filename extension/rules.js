/* Regras da Área 39 — Ficha de Avaliação 2025–2028 (itens 2.3.1 e 2.4.2a).
 * Funções puras: não tocam no DOM, podem ser testadas em Node.
 * Tudo que for específico da área fica AQUI. Para adaptar a outra área,
 * troque este arquivo e o data.js.
 */
(function (root) {
  'use strict';

  const ESTRATOS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'B'];
  const SUPERIORES = new Set(['A1', 'A2', 'A3', 'A4']);   // únicos que contam no IPArDo
  const PONTOS = { A1: 100, A2: 85, A3: 70, A4: 55, A5: 25, A6: 20, A7: 10, A8: 5, B: 0, ND: 0 };
  const BONUS_SCOPUS = 50;                                   // top 20% Scopus (CP&RI, Sociologia e CP, Adm. Pública)
  const MAX_INDICADOS_DOCENTE = 2;

  function normIssn(v) {
    const s = String(v || '').toUpperCase().replace(/[^0-9X]/g, '');
    return s.length === 8 ? s : '';
  }
  function fmtIssn(s) { return s ? s.slice(0, 4) + '-' + s.slice(4) : ''; }

  function normTitle(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/\((impresso|online|print|on line|en linea)\)/g, ' ')
      .replace(/\b(online|impresso|print)\b\s*$/g, ' ')
      .replace(/[^0-9a-z]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** Mesmas variações usadas em tools/build_base.py. */
  function titleVariants(s) {
    s = String(s || '');
    const noPar = s.replace(/\([^)]*\)/g, ' ');
    const out = [normTitle(s), normTitle(noPar)];
    if (s.includes(' - ')) out.push(normTitle(s.split(' - ')[0].replace(/\([^)]*\)/g, ' ')));
    return out.filter((v, i) => v && out.indexOf(v) === i);
  }

  /** Classifica um artigo. art = {issn, journal, text}. bonusSet = Set de ISSNs (8 dígitos). */
  function classify(art, db, bonusSet) {
    const issn = normIssn(art.issn);
    let hit = null, metodo = '';
    if (issn && db.issn[issn]) { hit = db.issn[issn]; metodo = 'ISSN'; }

    let issnUsado = issn;
    if (!hit && art.journal) {
      for (const k of titleVariants(art.journal)) {
        const i = db.titulo[k];
        if (i) { hit = db.issn[i]; metodo = 'título'; issnUsado = i; break; }
      }
    }
    if (!hit) {
      return {
        estrato: 'ND', qualis: '', titulo: art.journal || '', issn: fmtIssn(issn),
        metodo: 'não localizado', bonus: false, pontos: 0
      };
    }
    const bonus = !!(hit.s || (bonusSet && bonusSet.has(issnUsado))) && hit.e !== 'B';
    return {
      estrato: hit.e, qualis: hit.q, titulo: hit.t, issn: fmtIssn(issnUsado),
      metodo, bonus, pontos: PONTOS[hit.e] + (bonus ? BONUS_SCOPUS : 0)
    };
  }

  function inPeriod(a, ini, fim) { return a.year >= ini && a.year <= fim; }

  /** Resumo dos artigos no período. arts = [{year, c:classificação, ...}] */
  function summarize(arts, ini, fim) {
    const sel = arts.filter(a => inPeriod(a, ini, fim));
    const dist = Object.fromEntries([...ESTRATOS, 'ND'].map(e => [e, 0]));
    const porAno = {};
    let pontos = 0;
    for (let y = ini; y <= fim; y++) porAno[y] = 0;
    for (const a of sel) {
      dist[a.c.estrato] = (dist[a.c.estrato] || 0) + 1;
      pontos += a.c.pontos;
      porAno[a.year] = (porAno[a.year] || 0) + a.c.pontos;
    }
    const indicados = sel
      .filter(a => SUPERIORES.has(a.c.estrato))
      .sort((x, y) => y.c.pontos - x.c.pontos || y.year - x.year)
      .slice(0, MAX_INDICADOS_DOCENTE);
    return {
      total: sel.length,
      localizados: sel.filter(a => a.c.estrato !== 'ND').length,
      superiores: sel.filter(a => SUPERIORES.has(a.c.estrato)).length,
      pontos, dist, porAno, indicados,
      ipardo: indicados.reduce((s, a) => s + a.c.pontos, 0)
    };
  }

  root.CPRI39_RULES = { ESTRATOS, SUPERIORES, PONTOS, BONUS_SCOPUS, MAX_INDICADOS_DOCENTE,
    normIssn, fmtIssn, normTitle, classify, summarize, inPeriod };
})(typeof globalThis !== 'undefined' ? globalThis : this);
