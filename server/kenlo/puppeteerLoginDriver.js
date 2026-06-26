/**
 * Adaptador fino do login Kenlo via browser headless. Encapsula o fluxo
 * multi-etapa do signin (LoginCheck → ExecuteLogin → login-valida.aspx) e captura
 * o JWT que o painel de leads usa. Browser sobe SÓ aqui e SÓ no passo de login.
 *
 * Sem teste unitário (I/O de browser real). Validado no smoke manual (README do
 * módulo). A interface { login(email,password): Promise<string> } é o contrato
 * que o KenloAuthService consome; nos testes ela é substituída por um fake.
 *
 * Fluxo confirmado no smoke (server/kenlo/README):
 *   1. goto signin.valuegaia.com.br/?provider=imob
 *   2. preenche #email/#password, clica #enter-login → redireciona p/ o painel admin
 *   3. navega p/ #/leads — só AÍ o painel emite requests autenticados a
 *      leads.ingaia.com.br; interceptamos o header Authorization (JWT RS256).
 *
 * ponytail: provider 'imob' fixo — é o único em uso hoje. Vira env se surgir outro.
 * KENLO_CHROME_PATH aponta um Chrome do sistema quando o Chromium do puppeteer
 * não está disponível (ex.: dev local com download corrompido).
 */
const LOGIN_TIMEOUT_MS = Number(process.env.KENLO_LOGIN_TIMEOUT_MS) || 60000;
const PROVIDER = process.env.KENLO_PROVIDER || 'imob';
const LEADS_PANEL_URL = 'https://imob.valuegaia.com.br/admin/default.aspx#/leads';

async function login(email, password) {
  const puppeteer = (await import('puppeteer')).default;
  const launchOpts = { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (process.env.KENLO_CHROME_PATH) launchOpts.executablePath = process.env.KENLO_CHROME_PATH;
  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    let captured = null;
    page.on('request', (req) => {
      const auth = req.headers()['authorization'];
      if (!captured && auth && /^Bearer\s+.+/i.test(auth) && req.url().includes('leads.ingaia.com.br')) {
        captured = auth.replace(/^Bearer\s+/i, '');
      }
    });
    await page.goto(`https://signin.valuegaia.com.br/?provider=${PROVIDER}`, { waitUntil: 'networkidle2', timeout: LOGIN_TIMEOUT_MS });
    await page.type('#email', email, { delay: 12 });
    await page.type('#password', password, { delay: 12 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: LOGIN_TIMEOUT_MS }).catch(() => {}),
      page.click('#enter-login'),
    ]);
    // O token só é emitido quando a área de leads carrega.
    await page.goto(LEADS_PANEL_URL, { waitUntil: 'networkidle2', timeout: LOGIN_TIMEOUT_MS }).catch(() => {});
    const start = Date.now();
    while (!captured && Date.now() - start < LOGIN_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!captured) throw new Error('não foi possível capturar o token Kenlo no login');
    return captured;
  } finally {
    await browser.close();
  }
}

export default { login };
