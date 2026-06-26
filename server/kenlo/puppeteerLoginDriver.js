/**
 * Adaptador fino do login Kenlo via browser headless. Encapsula o fluxo
 * multi-etapa do signin (LoginCheck → ExecuteLogin → login-valida.aspx) e captura
 * o JWT que o painel de leads usa. Browser sobe SÓ aqui e SÓ no passo de login.
 *
 * Sem teste unitário (I/O de browser real). Validado no smoke manual (README do
 * módulo). A interface { login(email,password): Promise<string> } é o contrato
 * que o KenloAuthService consome; nos testes ela é substituída por um fake.
 *
 * ponytail: seletores e ponto de captura confirmados no smoke (Task 11.5), não em
 * teste — DOM externo, só validável contra o site real.
 */
const LOGIN_TIMEOUT_MS = Number(process.env.KENLO_LOGIN_TIMEOUT_MS) || 60000;

async function login(email, password) {
  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    let captured = null;
    page.on('request', (req) => {
      const auth = req.headers()['authorization'];
      if (!captured && auth && /^Bearer\s+.+/i.test(auth) && req.url().includes('leads.ingaia.com.br')) {
        captured = auth.replace(/^Bearer\s+/i, '');
      }
    });
    await page.goto('https://signin.valuegaia.com.br/', { waitUntil: 'networkidle2', timeout: LOGIN_TIMEOUT_MS });
    await page.type('#email', email, { delay: 10 });
    await page.type('#password', password, { delay: 10 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: LOGIN_TIMEOUT_MS }).catch(() => {}),
      page.click('#loginForm button[type="submit"], #loginForm [type="submit"]'),
    ]);
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
