const $ = s => document.querySelector(s);
const R = globalThis.CPRI39_RULES;
$('#fonte').textContent = `${globalThis.CPRI39_DATA.fonte} · ${Object.keys(globalThis.CPRI39_DATA.issn).length} ISSNs`;

function parse() {
  return [...new Set($('#bonus').value.split(/[\s,;]+/).map(R.normIssn).filter(Boolean))];
}

(async () => {
  const st = await chrome.storage.local.get({ a39BonusIssns: [], a39Ini: 2025, a39Fim: 2028 });
  $('#ini').value = st.a39Ini; $('#fim').value = st.a39Fim;
  $('#bonus').value = st.a39BonusIssns.map(R.fmtIssn).join('\n');
  $('#count').textContent = `${st.a39BonusIssns.length} ISSN(s) com bônus.`;
})();

$('#save').onclick = async () => {
  const list = parse();
  let ini = +$('#ini').value || 2025, fim = +$('#fim').value || 2028;
  if (fim < ini) [ini, fim] = [fim, ini];
  await chrome.storage.local.set({ a39BonusIssns: list, a39Ini: ini, a39Fim: fim });
  $('#count').textContent = `${list.length} ISSN(s) com bônus.`;
  $('#ok').textContent = 'Salvo. Recarregue o currículo para aplicar.';
};
