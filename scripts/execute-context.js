#!/usr/bin/env node

/**
 * Script para processar context.md e gerar configurações
 * Uso: node scripts/execute-context.js [caminho-para-context.md]
 * 
 * Este script:
 * - Lê o arquivo context.md
 * - Extrai configurações importantes (URLs de webhook, estruturas de dados, etc.)
 * - Gera config/context.json para uso do backend/frontend
 * - Valida o formato e estrutura dos dados
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Função principal
function executeContext(contextPath = 'context.md') {
  try {
    console.log('🔄 Processando context.md...');
    console.log('📁 Arquivo:', contextPath);
    
    // Verificar se o arquivo existe
    if (!fs.existsSync(contextPath)) {
      throw new Error(`Arquivo não encontrado: ${contextPath}`);
    }
    
    // Ler o arquivo context.md
    const md = fs.readFileSync(contextPath, 'utf8');
    
    // Extrair configurações do markdown
    const config = extractConfigFromMarkdown(md);
    
    // Validar configurações extraídas
    validateConfig(config);
    
    // Criar diretório config se não existir
    const configDir = path.join(__dirname, '../config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
      console.log('📁 Diretório config/ criado');
    }
    
    // Salvar configurações em JSON
    const configPath = path.join(configDir, 'context.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    console.log('✅ context.json criado em /config');
    console.log('📊 Configurações extraídas:');
    console.log(`   - Webhook Principal: ${config.WEBHOOK_DOWNLOAD_URL}`);
    console.log(`   - Webhook Backup: ${config.WEBHOOK_CRM_URL}`);
    console.log(`   - Total de Leads: ${config.TOTAL_LEADS}`);
    console.log(`   - Estrutura de Lead: ${Object.keys(config.LEAD_STRUCTURE).length} campos`);
    console.log(`   - Cores de Status: ${Object.keys(config.STATUS_COLORS).length} definidas`);
    
    return config;
    
  } catch (error) {
    console.error('❌ Erro ao processar context.md:', error.message);
    process.exit(1);
  }
}

// Extrair configurações do markdown
function extractConfigFromMarkdown(md) {
  const config = {
    // URLs dos Webhooks
    WEBHOOK_DOWNLOAD_URL: 'https://webhook.octoia.org/webhook/Dowload',
    WEBHOOK_CRM_URL: 'https://webhook.octoia.org/webhook/CRM',
    
    // Configurações básicas
    TOTAL_LEADS: 498,
    AUTO_REFRESH_INTERVAL: 60000, // 1 minuto
    
    // Estrutura de Lead (extraída do TypeScript interface)
    LEAD_STRUCTURE: {},
    
    // Cores de Status
    STATUS_COLORS: {},
    
    // Cores de Interface
    UI_COLORS: {},
    
    // Etapas do Funil
    FUNNEL_STAGES: [],
    
    // Valores Padrão
    DEFAULT_VALUES: {},
    
    // Configurações de Performance
    PERFORMANCE: {
      MIN_LOADING_TIME: 1000, // 1 segundo mínimo de loading
      DEBOUNCE_DELAY: 300,
      LAZY_LOADING: true
    }
  };
  
  // Extrair URLs dos webhooks
  const webhookDownloadMatch = md.match(/\*\*URL Download:\*\* `([^`]+)`/);
  if (webhookDownloadMatch) {
    config.WEBHOOK_DOWNLOAD_URL = webhookDownloadMatch[1];
  }
  
  const webhookCrmMatch = md.match(/\*\*URL Principal:\*\* `([^`]+)`/);
  if (webhookCrmMatch) {
    config.WEBHOOK_CRM_URL = webhookCrmMatch[1];
  }
  
  // Extrair total de leads
  const totalLeadsMatch = md.match(/\*\*Total de Leads:\*\* [~]?(\d+)/);
  if (totalLeadsMatch) {
    config.TOTAL_LEADS = parseInt(totalLeadsMatch[1]);
  }
  
  // Extrair estrutura de Lead do TypeScript interface
  const interfaceMatch = md.match(/interface Lead \{([\s\S]*?)\}/);
  if (interfaceMatch) {
    const interfaceContent = interfaceMatch[1];
    const fields = interfaceContent.match(/(\w+):\s*([^;]+);/g);
    if (fields) {
      fields.forEach(field => {
        const [, name, type] = field.match(/(\w+):\s*([^;]+);/) || [];
        if (name && type) {
          config.LEAD_STRUCTURE[name] = type.trim();
        }
      });
    }
  }
  
  // Extrair cores de status
  const statusColorsSection = md.match(/### Cores de Status([\s\S]*?)###/);
  if (statusColorsSection) {
    const colorMatches = statusColorsSection[1].match(/\*\*(\w+):\*\* `([^`]+)`/g);
    if (colorMatches) {
      colorMatches.forEach(match => {
        const [, status, color] = match.match(/\*\*(\w+):\*\* `([^`]+)`/) || [];
        if (status && color) {
          config.STATUS_COLORS[status.toUpperCase()] = color;
        }
      });
    }
  }
  
  // Extrair cores de interface
  const uiColorsSection = md.match(/### Cores de Interface([\s\S]*?)###/);
  if (uiColorsSection) {
    const colorMatches = uiColorsSection[1].match(/\*\*([^:]+):\*\* `([^`]+)`/g);
    if (colorMatches) {
      colorMatches.forEach(match => {
        const [, name, colors] = match.match(/\*\*([^:]+):\*\* `([^`]+)`/) || [];
        if (name && colors) {
          config.UI_COLORS[name.toUpperCase().replace(/\s+/g, '_')] = colors.split(', ');
        }
      });
    }
  }
  
  // Extrair etapas do funil
  const funnelSection = md.match(/### Etapas do Funil([\s\S]*?)###/);
  if (funnelSection) {
    const stages = funnelSection[1].match(/^\d+\.\s*(.+)$/gm);
    if (stages) {
      config.FUNNEL_STAGES = stages.map(stage => 
        stage.replace(/^\d+\.\s*/, '').trim()
      );
    }
  }
  
  // Extrair valores padrão
  const defaultsSection = md.match(/### Valores Padrão([\s\S]*?)###/);
  if (defaultsSection) {
    const defaultMatches = defaultsSection[1].match(/\*\*([^:]+):\*\* "([^"]+)"/g);
    if (defaultMatches) {
      defaultMatches.forEach(match => {
        const [, key, value] = match.match(/\*\*([^:]+):\*\* "([^"]+)"/) || [];
        if (key && value) {
          config.DEFAULT_VALUES[key.toLowerCase().replace(/\s+/g, '_')] = value;
        }
      });
    }
  }
  
  return config;
}

// Validar configurações extraídas
function validateConfig(config) {
  const required = ['WEBHOOK_DOWNLOAD_URL', 'WEBHOOK_CRM_URL', 'TOTAL_LEADS'];
  
  for (const key of required) {
    if (!config[key]) {
      throw new Error(`Configuração obrigatória não encontrada: ${key}`);
    }
  }
  
  // Validar URLs
  if (!config.WEBHOOK_DOWNLOAD_URL.startsWith('http')) {
    throw new Error('WEBHOOK_DOWNLOAD_URL deve ser uma URL válida');
  }
  
  if (!config.WEBHOOK_CRM_URL.startsWith('http')) {
    throw new Error('WEBHOOK_CRM_URL deve ser uma URL válida');
  }
  
  // Validar total de leads
  if (typeof config.TOTAL_LEADS !== 'number' || config.TOTAL_LEADS <= 0) {
    throw new Error('TOTAL_LEADS deve ser um número positivo');
  }
  
  console.log('✅ Configurações validadas com sucesso');
}

// Executar se chamado diretamente - sempre executar para teste
const contextPath = process.argv[2] || 'context.md';
executeContext(contextPath);

export { executeContext };
