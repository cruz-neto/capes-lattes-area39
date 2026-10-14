// Teste ponta a ponta: carrega a extensão no Chromium e abre um currículo simulado.
// Uso: npm install playwright && node tests/e2e.js
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PW || 'playwright');

(async () => {
  const ext = path.resolve(__dirname, '../extension');
  const fixture = fs.readFileSync(path.join(__dirname, 'lattes_fixture.html'), 'utf8');
  const ctx = await chromium.launchPersistentContext('', {
    headless: true, channel: 'chromium',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    viewport: { width: 1200, height: 900 }
  });
  await ctx.route('**/buscatextual.cnpq.br/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixture }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('https://buscatextual.cnpq.br/buscatextual/visualizacv.do?id=K0000000');
  await page.waitForSelector('.a39-badge', { timeout: 10000 });
  const badges = await page.$$eval('.a39-badge', b => b.map(x => x.textContent));
  console.log('Selos:', badges.length); badges.forEach(b => console.log('  ' + b));
  console.log('Lançador:', await page.textContent('.a39-launcher'));
  await page.screenshot({ path: path.join(__dirname, 'shot_cv.png'), fullPage: true });
  await page.click('.a39-launcher button');
  await page.waitForSelector('.a39-modal');
  const kpis = await page.$$eval('.a39-kpis div', d => d.map(x => x.innerText.replace(/\n/g, ': ')));
  console.log('KPIs:', kpis.join(' | '));
  console.log('Indicados:', await page.$$eval('.a39-ind li b', l => l.map(x => x.textContent)));
  await page.screenshot({ path: path.join(__dirname, 'shot_panel.png'), fullPage: true });
  // muda período para incluir 2019
  await page.selectOption('#a39ini', '2019');
  await page.waitForTimeout(300);
  console.log('Após 2019–2028:', await page.$$eval('.a39-kpis div b', d => d.map(x => x.textContent)));
  console.log('Erros JS:', errors.length ? errors : 'nenhum');
  await ctx.close();
})();
