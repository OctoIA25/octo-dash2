#!/usr/bin/env node

/**
 * Script de Migração para Estrutura Modular
 * 
 * Este script automatiza a migração dos componentes para a nova estrutura modular
 * Execute: node scripts/migrate-to-modules.js
 */

const fs = require('fs');
const path = require('path');

// Cores para output no terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg) => console.log(`\n${colors.cyan}${colors.bright}${msg}${colors.reset}\n`),
};

// Configuração de migração
const migrationConfig = {
  // Módulo: Funil Cliente Interessado
  'funil-cliente-interessado': {
    components: [
      'LeadsTabOptimized.tsx',
      'LeadsFunnelChart.tsx',
      'LeadsMetricsChart.tsx',
      'LeadsConversionChart.tsx',
      'LeadsTemperatureChart.tsx',
      'LeadsOriginChart.tsx',
      'LeadsPerformanceChart.tsx',
      'LeadsChartsSection.tsx',
    ],
    charts: [
      'charts/LeadTypesAdvancedChart.tsx',
    ],
    destination: 'src/modules/funil-cliente-interessado/components',
  },
  
  // Módulo: Funil Cliente Proprietário
  'funil-cliente-proprietario': {
    components: [
      'VendedoresFunnelChart.tsx',
    ],
    charts: [
      'charts/VendedoresValoresChart.tsx',
      'charts/VendedoresTiposChart.tsx',
      'charts/VendedoresTemperaturaChart.tsx',
      'charts/EstudoMercadoChart.tsx',
      'charts/BairrosChart.tsx',
      'charts/CondominiosChart.tsx',
      'charts/TaxaExclusividadeChart.tsx',
    ],
    destination: 'src/modules/funil-cliente-proprietario/components',
  },
  
  // Módulo: Corretores
  'corretores': {
    components: [
      'CorretoresTabOptimized.tsx',
      'CorretoresFunnelChart.tsx',
      'CorretoresPerformanceSimple.tsx',
      'CorretoresRankingSimple.tsx',
      'CorretoresSimpleChart.tsx',
      'CorretoresPerformanceChart.tsx',
      'CorretoresRankingChart.tsx',
    ],
    charts: [
      'charts/CorretoresLineChart.tsx',
      'charts/CorretoresPipelineChart.tsx',
      'charts/CorretoresEfficiencyChart.tsx',
      'charts/CorretoresActivityChart.tsx',
    ],
    destination: 'src/modules/corretores/components',
  },
  
  // Módulo: Imóveis
  'imoveis': {
    components: [
      'ImoveisTabOptimized.tsx',
      'ImoveisSimpleChart.tsx',
      'ImoveisTiposChart.tsx',
      'ImoveisTiposSimple.tsx',
      'ImoveisValoresChart.tsx',
      'ImoveisMarketAnalysis.tsx',
      'CodigoImovelInterestChart.tsx',
    ],
    charts: [
      'charts/ImoveisPortfolioChart.tsx',
      'charts/ImoveisRegionChart.tsx',
      'charts/ImoveisValueChart.tsx',
      'charts/ImoveisTrendChart.tsx',
    ],
    destination: 'src/modules/imoveis/components',
  },
};

// Componentes compartilhados
const sharedComponents = {
  layout: [
    'AppSidebar.tsx',
    'MainLayout.tsx',
  ],
  tables: [
    'LeadsTable.tsx',
    'LeadsTableStandalone.tsx',
  ],
  popups: [
    'LeadDetailsPopup.tsx',
    'ConversationPopup.tsx',
    'ConversationHistory.tsx',
    'PropertyDetailsPopup.tsx',
    'VisitDetailsPopup.tsx',
    'SimpleLeadPopup.tsx',
  ],
  common: [
    'AnimatedNumber.tsx',
    'ErrorBoundary.tsx',
    'LoadingOverlay.tsx',
    'MetricCard.tsx',
    'SectionMetrics.tsx',
    'SessionInfo.tsx',
    'MonthlyMetrics.tsx',
    'MonthlyChart.tsx',
    'MonthlyReport.tsx',
    'MonthlyDownloadButton.tsx',
    'MonthlyLeadsChart.tsx',
    'ExportButton.tsx',
    'ExportSpreadsheet.tsx',
  ],
  charts: [
    'EnhancedFunnelChart.tsx',
    'FunnelChart.tsx',
    'FunnelSection.tsx',
    'FlexibleFunnelChart.tsx',
    'FunnelStagesBubbleChart.tsx',
    'CustomDoughnutChart.tsx',
    'SimpleBarChart.tsx',
    'SimplePieChart.tsx',
    'CanvasJSStyleFunnel.tsx',
    'AdvancedCanvasCharts.tsx',
  ],
  sections: [
    'sections/GestaoSection.tsx',
    'sections/MeusLeadsSection.tsx',
    'sections/BolsaoSection.tsx',
  ],
  other: [
    'MainMetricsSection.tsx',
    'RealMetricsDisplay.tsx',
    'TotalMetricsDisplay.tsx',
    'AdvancedMetricsSection.tsx',
    'EnhancedChartsSection.tsx',
    'ChartsSection.tsx',
    'BrokerPerformance.tsx',
    'BrokerStats.tsx',
    'ChatComponent.tsx',
    'OrigemChart.tsx',
    'OrigemMetricsChart.tsx',
    'OrigemBackendMetricsChart.tsx',
    'RelatorioGeralChart.tsx',
    'RelatorioTabOptimized.tsx',
    'LeadTypesMetrics.tsx',
    'LeadTypesTable.tsx',
  ],
};

// Criar estrutura de diretórios
function createDirectoryStructure() {
  log.step('📁 Criando estrutura de diretórios...');
  
  const directories = [
    // Módulos
    'src/modules/funil-cliente-interessado/components',
    'src/modules/funil-cliente-interessado/hooks',
    'src/modules/funil-cliente-interessado/utils',
    'src/modules/funil-cliente-proprietario/components',
    'src/modules/funil-cliente-proprietario/hooks',
    'src/modules/funil-cliente-proprietario/utils',
    'src/modules/corretores/components',
    'src/modules/corretores/hooks',
    'src/modules/corretores/utils',
    'src/modules/imoveis/components',
    'src/modules/imoveis/hooks',
    'src/modules/imoveis/utils',
    
    // Shared
    'src/shared/components/layout',
    'src/shared/components/tables',
    'src/shared/components/popups',
    'src/shared/components/common',
    'src/shared/components/charts',
    'src/shared/components/sections',
    'src/shared/components/ui',
    'src/shared/hooks',
    'src/shared/services',
    'src/shared/utils',
    'src/shared/types',
  ];
  
  directories.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      log.success(`Criado: ${dir}`);
    } else {
      log.info(`Já existe: ${dir}`);
    }
  });
}

// Criar arquivo de índice para facilitar imports
function createIndexFiles() {
  log.step('📝 Criando arquivos de índice...');
  
  const indexFiles = [
    'src/modules/funil-cliente-interessado/index.ts',
    'src/modules/funil-cliente-proprietario/index.ts',
    'src/modules/corretores/index.ts',
    'src/modules/imoveis/index.ts',
    'src/shared/components/index.ts',
    'src/shared/hooks/index.ts',
    'src/shared/utils/index.ts',
  ];
  
  indexFiles.forEach(file => {
    const fullPath = path.join(process.cwd(), file);
    if (!fs.existsSync(fullPath)) {
      const content = `// Auto-generated index file\n// Export all components from this module\n`;
      fs.writeFileSync(fullPath, content);
      log.success(`Criado: ${file}`);
    }
  });
}

// Mover componentes compartilhados
function moveSharedComponents() {
  log.step('🔄 Preparando migração de componentes compartilhados...');
  
  const srcComponentsDir = path.join(process.cwd(), 'src/components');
  
  Object.entries(sharedComponents).forEach(([category, files]) => {
    log.info(`\nCategoria: ${category}`);
    
    files.forEach(file => {
      const sourcePath = path.join(srcComponentsDir, file);
      const destDir = path.join(process.cwd(), 'src/shared/components', category);
      const destPath = path.join(destDir, path.basename(file));
      
      if (fs.existsSync(sourcePath)) {
        log.warning(`  📋 Mover: ${file} → shared/components/${category}/`);
      } else {
        log.error(`  ✗ Não encontrado: ${file}`);
      }
    });
  });
  
  log.warning('\n⚠️  Ação manual necessária: Revise e execute a migração dos componentes compartilhados');
}

// Mover componentes dos módulos
function prepareMigrationPlan() {
  log.step('📦 Criando plano de migração dos módulos...');
  
  const srcComponentsDir = path.join(process.cwd(), 'src/components');
  
  Object.entries(migrationConfig).forEach(([moduleName, config]) => {
    log.info(`\n📁 Módulo: ${moduleName}`);
    
    // Componentes principais
    if (config.components) {
      config.components.forEach(file => {
        const sourcePath = path.join(srcComponentsDir, file);
        if (fs.existsSync(sourcePath)) {
          log.warning(`  📋 Mover: ${file} → modules/${moduleName}/components/`);
        } else {
          log.error(`  ✗ Não encontrado: ${file}`);
        }
      });
    }
    
    // Charts
    if (config.charts) {
      config.charts.forEach(file => {
        const sourcePath = path.join(srcComponentsDir, file);
        if (fs.existsSync(sourcePath)) {
          log.warning(`  📊 Mover: ${file} → modules/${moduleName}/components/charts/`);
        } else {
          log.error(`  ✗ Não encontrado: ${file}`);
        }
      });
    }
  });
  
  log.warning('\n⚠️  Ação manual necessária: Revise e execute a migração dos componentes dos módulos');
}

// Mover hooks compartilhados
function moveSharedHooks() {
  log.step('🪝 Preparando migração de hooks compartilhados...');
  
  const hooks = [
    'src/hooks/useAuth.ts',
    'src/hooks/useLeadsData.ts',
    'src/hooks/useOptimizedData.ts',
    'src/hooks/use-toast.ts',
    'src/hooks/use-mobile.tsx',
  ];
  
  hooks.forEach(hook => {
    const sourcePath = path.join(process.cwd(), hook);
    if (fs.existsSync(sourcePath)) {
      log.warning(`  📋 Mover: ${hook} → shared/hooks/`);
    } else {
      log.error(`  ✗ Não encontrado: ${hook}`);
    }
  });
  
  log.warning('\n⚠️  Ação manual necessária: Revise e execute a migração dos hooks');
}

// Mover services
function moveServices() {
  log.step('⚙️  Preparando migração de services...');
  
  const services = [
    'src/services/supabaseService.ts',
    'src/services/teamService.ts',
    'src/services/updateLeadService.ts',
  ];
  
  services.forEach(service => {
    const sourcePath = path.join(process.cwd(), service);
    if (fs.existsSync(sourcePath)) {
      log.warning(`  📋 Mover: ${service} → shared/services/`);
    } else {
      log.error(`  ✗ Não encontrado: ${service}`);
    }
  });
  
  log.warning('\n⚠️  Ação manual necessária: Revise e execute a migração dos services');
}

// Mover utils
function moveUtils() {
  log.step('🛠️  Preparando migração de utils...');
  
  const utils = [
    'src/utils/dateUtils.ts',
    'src/utils/metrics.ts',
    'src/utils/monthlyMetrics.ts',
    'src/utils/conversationParser.ts',
    'src/utils/encryption.ts',
  ];
  
  utils.forEach(util => {
    const sourcePath = path.join(process.cwd(), util);
    if (fs.existsSync(sourcePath)) {
      log.warning(`  📋 Mover: ${util} → shared/utils/`);
    } else {
      log.error(`  ✗ Não encontrado: ${util}`);
    }
  });
  
  log.warning('\n⚠️  Ação manual necessária: Revise e execute a migração dos utils');
}

// Criar arquivo de tipos compartilhados
function createSharedTypes() {
  log.step('📐 Criando arquivo de tipos compartilhados...');
  
  const typesContent = `/**
 * Tipos compartilhados do projeto
 */

// Re-exportar tipos de ProcessedLead
export type { ProcessedLead } from '@/data/realLeadsProcessor';

// Tipos de navegação
export type SidebarSection = 'gestao' | 'meus-leads' | 'bolsao';
export type DashboardSubSection = 'leads' | 'proprietarios' | 'corretores' | 'imoveis' | 'geral';
export type LeadsSubSection = 'todos' | 'venda' | 'locacao';
export type ProprietariosSubSection = 'vendedor' | 'locatario';
export type ClienteInteressadoSubSection = 'pre-atendimento' | 'atendimento';
export type ClienteProprietarioSubSection = 'cliente-proprietario' | 'estudo-mercado';

// Tipos de métricas
export interface MetricCard {
  label: string;
  value: number | string;
  icon?: React.ComponentType;
  color?: string;
  trend?: number;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
  }[];
}
`;
  
  const typesPath = path.join(process.cwd(), 'src/shared/types/index.ts');
  fs.writeFileSync(typesPath, typesContent);
  log.success('Criado: src/shared/types/index.ts');
}

// Criar README para cada módulo
function createModuleReadmes() {
  log.step('📚 Criando READMEs dos módulos...');
  
  const readmeTemplate = (moduleName, description) => `# ${moduleName}

## Descrição
${description}

## Estrutura
\`\`\`
${moduleName}/
├── components/     # Componentes React do módulo
├── hooks/         # Hooks customizados do módulo
├── utils/         # Funções utilitárias do módulo
└── index.ts       # Exports principais do módulo
\`\`\`

## Componentes Principais
- Lista os componentes principais aqui

## Hooks
- Lista os hooks aqui

## Utils
- Lista as funções utilitárias aqui

## Como Usar
\`\`\`typescript
import { ComponentName } from '@/modules/${moduleName}';
\`\`\`

## Desenvolvedor Responsável
- [ ] Dev 1
- [ ] Dev 2
`;
  
  const modules = {
    'funil-cliente-interessado': 'Módulo responsável pelo funil de Cliente Interessado (Pré-Atendimento e Atendimento)',
    'funil-cliente-proprietario': 'Módulo responsável pelo funil de Cliente Proprietário e Estudo de Mercado',
    'corretores': 'Módulo responsável pelas métricas e análises de Corretores',
    'imoveis': 'Módulo responsável pelas métricas e análises de Imóveis',
  };
  
  Object.entries(modules).forEach(([moduleName, description]) => {
    const readmePath = path.join(process.cwd(), `src/modules/${moduleName}/README.md`);
    fs.writeFileSync(readmePath, readmeTemplate(moduleName, description));
    log.success(`Criado: src/modules/${moduleName}/README.md`);
  });
}

// Criar guia de migração
function createMigrationGuide() {
  log.step('📖 Criando guia de migração...');
  
  const guideContent = `# Guia de Migração - Passo a Passo

## ⚠️ IMPORTANTE: Leia antes de começar

Este guia detalha o processo de migração da estrutura atual para a nova estrutura modular.

## 🔧 Pré-requisitos

1. Fazer backup do código atual
\`\`\`bash
git checkout -b backup/pre-migration
git push origin backup/pre-migration
\`\`\`

2. Garantir que todos os testes estão passando
\`\`\`bash
npm run test
\`\`\`

3. Criar branch de migração
\`\`\`bash
git checkout -b refactor/modular-structure
\`\`\`

## 📋 Checklist de Migração

### Fase 1: Estrutura Base ✅
- [x] Criar estrutura de diretórios
- [x] Criar arquivos de índice
- [x] Criar READMEs dos módulos
- [x] Criar tipos compartilhados

### Fase 2: Shared Components (2-3 horas)
- [ ] Mover componentes de UI para src/shared/components/ui/
- [ ] Mover layout para src/shared/components/layout/
- [ ] Mover tabelas para src/shared/components/tables/
- [ ] Mover popups para src/shared/components/popups/
- [ ] Mover components comuns para src/shared/components/common/
- [ ] Mover charts compartilhados para src/shared/components/charts/
- [ ] Atualizar imports em todos os arquivos

### Fase 3: Shared Hooks (1 hora)
- [ ] Mover useAuth.ts para src/shared/hooks/
- [ ] Mover useLeadsData.ts para src/shared/hooks/
- [ ] Mover useOptimizedData.ts para src/shared/hooks/
- [ ] Mover use-toast.ts para src/shared/hooks/
- [ ] Mover use-mobile.tsx para src/shared/hooks/
- [ ] Atualizar imports

### Fase 4: Shared Services (1 hora)
- [ ] Mover supabaseService.ts para src/shared/services/
- [ ] Mover teamService.ts para src/shared/services/
- [ ] Mover updateLeadService.ts para src/shared/services/
- [ ] Atualizar imports

### Fase 5: Shared Utils (1 hora)
- [ ] Mover dateUtils.ts para src/shared/utils/
- [ ] Mover metrics.ts para src/shared/utils/
- [ ] Mover monthlyMetrics.ts para src/shared/utils/
- [ ] Mover conversationParser.ts para src/shared/utils/
- [ ] Mover encryption.ts para src/shared/utils/
- [ ] Atualizar imports

### Fase 6: Módulo Funil Cliente Interessado (4-6 horas) - DEV 1
- [ ] Mover LeadsTabOptimized.tsx
- [ ] Mover LeadsFunnelChart.tsx
- [ ] Mover LeadsMetricsChart.tsx
- [ ] Mover LeadsConversionChart.tsx
- [ ] Mover LeadsTemperatureChart.tsx
- [ ] Mover LeadsOriginChart.tsx
- [ ] Mover LeadsPerformanceChart.tsx
- [ ] Mover LeadsChartsSection.tsx
- [ ] Criar hooks específicos
- [ ] Criar utils específicos
- [ ] Atualizar imports
- [ ] Testar funcionalidade

### Fase 7: Módulo Funil Cliente Proprietário (4-6 horas) - DEV 2
- [ ] Mover VendedoresFunnelChart.tsx
- [ ] Mover VendedoresValoresChart.tsx
- [ ] Mover VendedoresTiposChart.tsx
- [ ] Mover VendedoresTemperaturaChart.tsx
- [ ] Mover EstudoMercadoChart.tsx
- [ ] Mover BairrosChart.tsx
- [ ] Mover CondominiosChart.tsx
- [ ] Mover TaxaExclusividadeChart.tsx
- [ ] Criar hooks específicos
- [ ] Criar utils específicos
- [ ] Atualizar imports
- [ ] Testar funcionalidade

### Fase 8: Módulo Corretores (4-6 horas) - DEV 1
- [ ] Mover CorretoresTabOptimized.tsx
- [ ] Mover CorretoresFunnelChart.tsx
- [ ] Mover CorretoresPerformanceSimple.tsx
- [ ] Mover CorretoresRankingSimple.tsx
- [ ] Mover CorretoresSimpleChart.tsx
- [ ] Mover CorretoresPerformanceChart.tsx
- [ ] Mover CorretoresRankingChart.tsx
- [ ] Mover charts/Corretores*.tsx
- [ ] Criar hooks específicos
- [ ] Criar utils específicos
- [ ] Atualizar imports
- [ ] Testar funcionalidade

### Fase 9: Módulo Imóveis (4-6 horas) - DEV 2
- [ ] Mover ImoveisTabOptimized.tsx
- [ ] Mover ImoveisSimpleChart.tsx
- [ ] Mover ImoveisTiposChart.tsx
- [ ] Mover ImoveisTiposSimple.tsx
- [ ] Mover ImoveisValoresChart.tsx
- [ ] Mover ImoveisMarketAnalysis.tsx
- [ ] Mover CodigoImovelInterestChart.tsx
- [ ] Mover charts/Imoveis*.tsx
- [ ] Criar hooks específicos
- [ ] Criar utils específicos
- [ ] Atualizar imports
- [ ] Testar funcionalidade

### Fase 10: Atualizar Referências Principais (2-3 horas)
- [ ] Atualizar MainMetricsSection.tsx
- [ ] Atualizar GestaoSection.tsx
- [ ] Atualizar MainLayout.tsx
- [ ] Atualizar AppSidebar.tsx
- [ ] Atualizar Index.tsx
- [ ] Atualizar App.tsx

### Fase 11: Configuração de Build (1-2 horas)
- [ ] Atualizar tsconfig.json com path aliases
- [ ] Atualizar vite.config.ts se necessário
- [ ] Atualizar package.json scripts
- [ ] Testar build de produção

### Fase 12: Testes e Validação (2-3 horas)
- [ ] Executar todos os testes
- [ ] Testar login e autenticação
- [ ] Testar navegação entre abas
- [ ] Testar carregamento de dados
- [ ] Testar todos os gráficos
- [ ] Testar tabelas e filtros
- [ ] Verificar performance
- [ ] Verificar console (sem errors/warnings)

### Fase 13: Documentação (1-2 horas)
- [ ] Atualizar README principal
- [ ] Documentar novos path aliases
- [ ] Atualizar guia de contribuição
- [ ] Documentar estrutura de módulos

### Fase 14: Deploy (1-2 horas)
- [ ] Build de produção
- [ ] Deploy para staging
- [ ] Testes em staging
- [ ] Deploy para produção

## 🔍 Comandos Úteis

### Atualizar imports automaticamente
\`\`\`bash
# Exemplo: substituir imports antigos por novos
find src -name "*.tsx" -o -name "*.ts" | xargs sed -i 's|@/components/LeadsTable|@/shared/components/tables/LeadsTable|g'
\`\`\`

### Verificar imports quebrados
\`\`\`bash
npm run build
\`\`\`

### Executar testes
\`\`\`bash
npm run test
\`\`\`

## 🚨 Resolução de Problemas

### Imports quebrados
1. Verificar path alias no tsconfig.json
2. Verificar se o arquivo foi movido corretamente
3. Atualizar import para novo caminho

### Componentes não renderizando
1. Verificar se todos os imports foram atualizados
2. Verificar console do navegador
3. Verificar se tipos foram atualizados

### Performance degradada
1. Verificar se lazy loading está funcionando
2. Verificar se memoization está correta
3. Usar React DevTools Profiler

## 📞 Suporte

- Criar issue no GitHub
- Consultar ORGANIZACAO-PROJETO.md
- Falar com o outro desenvolvedor antes de mexer em shared/
`;
  
  const guidePath = path.join(process.cwd(), 'MIGRATION-GUIDE.md');
  fs.writeFileSync(guidePath, guideContent);
  log.success('Criado: MIGRATION-GUIDE.md');
}

// Atualizar tsconfig com path aliases
function updateTsConfig() {
  log.step('⚙️  Atualizando tsconfig.json...');
  
  const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
  
  if (!fs.existsSync(tsconfigPath)) {
    log.error('tsconfig.json não encontrado');
    return;
  }
  
  try {
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    
    // Adicionar path aliases
    if (!tsconfig.compilerOptions) {
      tsconfig.compilerOptions = {};
    }
    
    if (!tsconfig.compilerOptions.paths) {
      tsconfig.compilerOptions.paths = {};
    }
    
    tsconfig.compilerOptions.paths = {
      ...tsconfig.compilerOptions.paths,
      '@/modules/*': ['./src/modules/*'],
      '@/shared/*': ['./src/shared/*'],
    };
    
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));
    log.success('tsconfig.json atualizado com path aliases');
  } catch (error) {
    log.error(`Erro ao atualizar tsconfig.json: ${error.message}`);
  }
}

// Main execution
function main() {
  console.log(`
${colors.cyan}${colors.bright}
╔═══════════════════════════════════════════════════╗
║  🚀 Script de Migração para Estrutura Modular    ║
║                                                   ║
║  Este script prepara o projeto para a nova       ║
║  estrutura modular e facilita o trabalho         ║
║  colaborativo entre desenvolvedores              ║
╚═══════════════════════════════════════════════════╝
${colors.reset}
  `);
  
  try {
    // Executar todas as etapas
    createDirectoryStructure();
    createIndexFiles();
    createSharedTypes();
    createModuleReadmes();
    createMigrationGuide();
    updateTsConfig();
    
    // Preparar planos de migração (não move arquivos ainda)
    moveSharedComponents();
    prepareMigrationPlan();
    moveSharedHooks();
    moveServices();
    moveUtils();
    
    log.step('✅ Setup inicial concluído!');
    
    console.log(`
${colors.green}${colors.bright}
╔═══════════════════════════════════════════════════╗
║  ✅ Estrutura base criada com sucesso!           ║
╚═══════════════════════════════════════════════════╝
${colors.reset}

${colors.cyan}Próximos Passos:${colors.reset}

1. ${colors.yellow}Revisar${colors.reset} os arquivos criados:
   - ORGANIZACAO-PROJETO.md (já existente)
   - MIGRATION-GUIDE.md (novo)
   - README.md de cada módulo

2. ${colors.yellow}Definir${colors.reset} responsabilidades entre Dev 1 e Dev 2

3. ${colors.yellow}Executar${colors.reset} a migração manualmente seguindo o MIGRATION-GUIDE.md

4. ${colors.yellow}Testar${colors.reset} cada módulo após a migração

${colors.blue}${colors.bright}📚 Documentação criada:${colors.reset}
   - ${colors.green}✓${colors.reset} ORGANIZACAO-PROJETO.md
   - ${colors.green}✓${colors.reset} MIGRATION-GUIDE.md
   - ${colors.green}✓${colors.reset} READMEs dos módulos
   - ${colors.green}✓${colors.reset} Tipos compartilhados

${colors.cyan}${colors.bright}Happy coding! 🎉${colors.reset}
    `);
    
  } catch (error) {
    log.error(`Erro durante execução: ${error.message}`);
    process.exit(1);
  }
}

// Executar script
main();

