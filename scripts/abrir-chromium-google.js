import { chromium } from 'playwright';

async function abrirChromiumGoogle() {
  console.log('🚀 Iniciando Chromium do Playwright...');
  console.log('⏳ Isso pode levar alguns segundos na primeira vez...');
  
  let browser;
  
  try {
    // Configuração otimizada para Windows
    browser = await chromium.launch({
      headless: false,
      timeout: 180000, // 3 minutos de timeout
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    console.log('✅ Chromium iniciado!');

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: 'pt-BR',
    });

    const page = await context.newPage();

    console.log('📱 Carregando página de criação de conta Google...');
    
    await page.goto('https://accounts.google.com/signup/v2/webcreateaccount?flowName=GlifWebSignIn&flowEntry=SignUp', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    console.log('');
    console.log('✅ Chromium aberto e página carregada!');
    console.log('');
    console.log('👤 Agora você pode preencher o formulário para criar sua conta Google.');
    console.log('💡 O navegador permanecerá aberto.');
    console.log('⏸️  Feche o navegador quando terminar ou pressione Ctrl+C aqui.');
    console.log('');

    // Mantém o navegador aberto
    // Aguarda até a página ser fechada ou o processo ser interrompido
    const keepAlive = setInterval(() => {
      if (page.isClosed()) {
        clearInterval(keepAlive);
        console.log('📄 Navegador foi fechado.');
        if (browser) browser.close();
        process.exit(0);
      }
    }, 2000);

    // Aguarda indefinidamente
    await new Promise(() => {});

  } catch (error) {
    console.error('');
    console.error('❌ Erro ao iniciar Chromium:', error.message);
    console.error('');
    
    if (error.message.includes('Timeout')) {
      console.error('💡 O Chromium está demorando muito para iniciar.');
      console.error('   Isso pode ser causado por:');
      console.error('   - Antivírus bloqueando');
      console.error('   - Muitos programas abertos');
      console.error('   - Permissões insuficientes');
      console.error('');
      console.error('🔄 Tente:');
      console.error('   1. Fechar outros programas');
      console.error('   2. Executar como administrador');
      console.error('   3. Verificar configurações do antivírus');
    }
    
    process.exit(1);
  }
}

// Tratamento de sinais para fechar corretamente
process.on('SIGINT', () => {
  console.log('\n\n👋 Encerrando...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Encerrando...');
  process.exit(0);
});

abrirChromiumGoogle();

