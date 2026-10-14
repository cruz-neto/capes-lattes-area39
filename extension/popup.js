const $ = s => document.querySelector(s);

async function load() {
  const { a39UltimoCV: cv } = await chrome.storage.local.get('a39UltimoCV');
  if (cv) {
    const r = cv.resumo;
    $('#cv').innerHTML = '';
    const b = document.createElement('b'); b.textContent = cv.nome; $('#cv').appendChild(b);
    $('#cv').appendChild(document.createElement('br'));
    $('#cv').appendChild(document.createTextNode(
      `${cv.periodo[0]}–${cv.periodo[1]}: ${r.total} artigo(s), ${r.superiores} em A1–A4, ${r.pontos} pts. Melhores 2: ${r.ipardo} pts.`));
  }
}

async function send(type) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.tabs.sendMessage(tab.id, { type });
    $('#msg').textContent = '';
    if (type === 'A39_PANEL') window.close();
    else setTimeout(load, 600);
  } catch (e) {
    $('#msg').textContent = 'Abra um Currículo Lattes nesta aba e tente de novo.';
  }
}

$('#panel').onclick = () => send('A39_PANEL');
$('#run').onclick = () => send('A39_RUN');
$('#opts').onclick = () => chrome.runtime.openOptionsPage();
load();
