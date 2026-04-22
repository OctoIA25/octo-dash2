import { chromium } from 'playwright';
import { join } from 'path';
import { mkdirSync } from 'fs';

async function criarContaGoogle() {
  console.log('🚀 Iniciando Chromium...');
  
  let browser;
  
  try {
    // Cria um diretório para o perfil do usuário
    const userDataDir = join(process.cwd(), '.chromium-profile');
    try {
      mkdirSync(userDataDir, { recursive: true });
    } catch (e) {
      // Diretório já existe, tudo bem
    }

    console.log('⏳ Aguardando inicialização do Chromium (isso pode levar alguns segundos)...');
    
    // Abre o navegador Chromium com configurações otimizadas
    browser = await chromium.launch({
      headless: false, // Mostra o navegador
      channel: undefined, // Força usar o Chromium do Playwright, não Chrome instalado
      timeout: 120000, // Timeout de 2 minutos
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--user-data-dir=' + userDataDir,
      ],
    });

    console.log('✅ Chromium iniciado com sucesso!');

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      permissions: ['geolocation'],
    });

    const page = await context.newPage();

    // Remove indicadores de automação
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    console.log('📱 Navegando para a página de criação de conta Google...');
    
    // Navega para a página de criação de conta do Google
    await page.goto('https://accounts.google.com/signup/v2/webcreateaccount?flowName=GlifWebSignIn&flowEntry=SignUp', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    console.log('✅ Página carregada!');
    console.log('');
    console.log('👤 Agora você pode preencher o formulário manualmente.');
    console.log('💡 O navegador Chromium permanecerá aberto para você interagir.');
    console.log('⏸️  Pressione Ctrl+C no terminal para fechar o navegador quando terminar.');
    console.log('');

    // Aguarda o usuário interagir - mantém o navegador aberto
    // Usa um loop infinito com pequenos intervalos para permitir Ctrl+C
    while (true) {
      await page.waitForTimeout(10000); // Verifica a cada 10 segundos
      // Verifica se a página ainda está aberta
      if (page.isClosed()) {
        console.log('📄 Página foi fechada.');
        break;
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    
    if (error.message.includes('Timeout') || error.message.includes('launch')) {
      console.error('');
      console.error('⏱️  O Chromium demorou muito para iniciar.');
      console.error('');
      console.error('💡 Possíveis soluções:');
      console.error('   1. Feche outros programas que possam estar usando muitos recursos');
      console.error('   2. Verifique se o antivírus não está bloqueando');
      console.error('   3. Tente executar como administrador');
      console.error('   4. Reinicie o computador se necessário');
      console.error('');
      console.error('🔄 Tentando novamente com configurações alternativas...');
      
      // Tenta uma segunda vez com configurações mínimas
      try {
        console.log('🔄 Segunda tentativa...');
        browser = await chromium.launch({
          headless: false,
          timeout: 180000, // 3 minutos
        });
        
        const context = await browser.newContext();
        const page = await context.newPage();
        
        await page.goto('https://accounts.google.com/signup/v2/webcreateaccount?flowName=GlifWebSignIn&flowEntry=SignUp');
        console.log('✅ Sucesso na segunda tentativa!');
        console.log('👤 Preencha o formulário para criar sua conta.');
        
        while (true) {
          await page.waitForTimeout(10000);
          if (page.isClosed()) break;
        }
      } catch (err2) {
        console.error('❌ Segunda tentativa também falhou:', err2.message);
        throw err2;
      }
    } else {
      throw error;
    }
  } finally {
    // Não fecha automaticamente - deixa o usuário fechar quando quiser
    // Se quiser fechar automaticamente, descomente a linha abaixo:
    // if (browser) await browser.close();
  }
}

// Executa a função
criarContaGoogle().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
