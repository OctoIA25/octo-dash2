// Script alternativo que tenta usar o Chromium diretamente
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

async function criarContaGoogleDireto() {
  const chromiumPath = 'C:\\Users\\mamba\\AppData\\Local\\ms-playwright\\chromium-1200\\chrome-win64\\chrome.exe';
  const url = 'https://accounts.google.com/signup/v2/webcreateaccount?flowName=GlifWebSignIn&flowEntry=SignUp';
  const userDataDir = join(process.cwd(), '.chromium-profile');

  console.log('🚀 Abrindo Chromium diretamente...');
  console.log(`📂 Perfil: ${userDataDir}`);
  
  try {
    // Cria o diretório do perfil se não existir
    const { mkdirSync } = await import('fs');
    try {
      mkdirSync(userDataDir, { recursive: true });
    } catch (e) {
      // Diretório já existe
    }

    // Comando para abrir o Chromium diretamente
    const command = `"${chromiumPath}" --user-data-dir="${userDataDir}" --new-window "${url}"`;
    
    console.log('⏳ Iniciando Chromium...');
    await execAsync(command);
    
    console.log('✅ Chromium aberto!');
    console.log('👤 Agora você pode preencher o formulário para criar sua conta Google.');
    console.log('💡 O navegador permanecerá aberto.');
    
  } catch (error) {
    console.error('❌ Erro ao abrir Chromium:', error.message);
    console.log('\n💡 Tentando com Playwright...');
    
    // Fallback para Playwright
    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({
        headless: false,
        timeout: 120000,
      });
      
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(url);
      
      console.log('✅ Chromium aberto via Playwright!');
      console.log('👤 Preencha o formulário para criar sua conta.');
      
      // Mantém aberto
      while (true) {
        await page.waitForTimeout(10000);
        if (page.isClosed()) break;
      }
    } catch (playwrightError) {
      console.error('❌ Erro também com Playwright:', playwrightError.message);
      throw playwrightError;
    }
  }
}

criarContaGoogleDireto().catch(console.error);

