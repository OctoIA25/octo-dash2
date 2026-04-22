// Script simples que abre o navegador padrão do sistema
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function abrirContaGoogle() {
  const url = 'https://accounts.google.com/signup/v2/webcreateaccount?flowName=GlifWebSignIn&flowEntry=SignUp';
  
  console.log('🚀 Abrindo navegador padrão...');
  console.log('📱 Navegando para a página de criação de conta Google...');
  
  try {
    // No Windows, usa o comando 'start' com aspas para proteger a URL
    const isWindows = process.platform === 'win32';
    const command = isWindows 
      ? `start "" "${url}"`
      : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
    
    await execAsync(command);
    console.log('✅ Navegador aberto!');
    console.log('👤 Agora você pode preencher o formulário para criar sua conta Google.');
  } catch (error) {
    console.error('❌ Erro ao abrir navegador:', error.message);
    console.log('\n💡 Você pode abrir manualmente no seu navegador:');
    console.log(`   ${url}`);
  }
}

abrirContaGoogle();

