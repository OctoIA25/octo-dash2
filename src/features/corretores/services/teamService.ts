import { ProcessedLead } from '@/data/realLeadsProcessor';
import { fetchSupabaseTeamsData, SupabaseTeam } from '@/services/supabaseService';

export interface Team {
  id: string;
  name: string;
  corretores: string[];
  accessDay?: number[]; // 0=domingo, 1=segunda, etc. undefined = sempre
}

export interface TeamAccess {
  canAccessVendas: boolean;
  canAccessLocacao: boolean;
  currentTeam?: string;
  userTeam?: string;
}

// Cache das equipes extraídas
let teamsCache: Team[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

/**
 * Busca equipes reais do Supabase e extrai corretores dos leads
 */
export async function getTeamsFromSupabase(leads: ProcessedLead[]): Promise<Team[]> {
  // Verificar cache
  const now = Date.now();
  if (teamsCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return teamsCache;
  }

  
  try {
    // Buscar dados reais das equipes do Supabase
    const supabaseTeams = await fetchSupabaseTeamsData();
    
    // Extrair todos os corretores únicos dos leads
    const corretoresNosLeads = [...new Set(
      leads
        .map(lead => lead.corretor_responsavel)
        .filter(corretor => corretor && corretor.trim() !== '' && corretor !== 'Não atribuído')
    )].sort();
    
    
    // Converter dados do Supabase para formato interno
    const teams: Team[] = supabaseTeams
      .filter(team => team.ativa !== false)
      .map(supabaseTeam => ({
        id: `equipe-${supabaseTeam.id}`,
        name: supabaseTeam.nome_equipe,
        corretores: supabaseTeam.corretores.filter(corretor => 
          corretoresNosLeads.includes(corretor)
        ),
        accessDay: supabaseTeam.dias_acesso
      }));
    
    // Adicionar corretores que não estão em nenhuma equipe
    const corretoresSemEquipe = corretoresNosLeads.filter(corretor =>
      !teams.some(team => team.corretores.includes(corretor))
    );
    
    if (corretoresSemEquipe.length > 0) {
      
      // Criar equipe "Sem Equipe" para corretores não atribuídos
      teams.push({
        id: 'sem-equipe',
        name: 'Sem Equipe',
        corretores: corretoresSemEquipe,
        accessDay: [1, 2, 3, 4, 5, 6, 0] // Acesso todos os dias
      });
    }
    
    // Adicionar equipe do Bolsão sempre
    teams.push({
      id: 'bolsao',
      name: 'Bolsão de Imóveis',
      corretores: [], // Departamento especial
      accessDay: undefined // Acesso sempre para locação
    });
    
    
    // Atualizar cache
    teamsCache = teams;
    cacheTimestamp = now;
    
    return teams;
    
  } catch (error) {
    console.error('❌ Erro ao buscar equipes do Supabase, usando fallback:', error);
    return extractTeamsFromLeads(leads);
  }
}

/**
 * Extrai equipes automaticamente baseado nos corretores dos leads (fallback)
 */
export function extractTeamsFromLeads(leads: ProcessedLead[]): Team[] {
  
  // Extrair todos os corretores únicos (exceto "Não atribuído")
  const corretoresUnicos = [...new Set(
    leads
      .map(lead => lead.corretor_responsavel)
      .filter(corretor => corretor && corretor.trim() !== '' && corretor !== 'Não atribuído')
  )].sort();


  // Se não há corretores, usar dados padrão
  if (corretoresUnicos.length === 0) {
    return getDefaultTeams();
  }

  // Distribuir corretores em equipes automaticamente
  const teams: Team[] = [];
  const corretoresPorEquipe = Math.ceil(corretoresUnicos.length / 3);
  
  for (let i = 0; i < 3; i++) {
    const startIndex = i * corretoresPorEquipe;
    const endIndex = Math.min(startIndex + corretoresPorEquipe, corretoresUnicos.length);
    const corretoresDaEquipe = corretoresUnicos.slice(startIndex, endIndex);
    
    if (corretoresDaEquipe.length > 0) {
      teams.push({
        id: `equipe-${String.fromCharCode(65 + i).toLowerCase()}`, // equipe-a, equipe-b, equipe-c
        name: `Equipe ${String.fromCharCode(65 + i)}`, // Equipe A, Equipe B, Equipe C
        corretores: corretoresDaEquipe,
        accessDay: getAccessDaysForTeam(i)
      });
    }
  }

  // Adicionar equipe do Bolsão
  teams.push({
    id: 'bolsao',
    name: 'Bolsão de Imóveis',
    corretores: [], // Departamento especial, não corretores específicos
    accessDay: undefined // Acesso sempre para locação
  });

  
  return teams;
}

/**
 * Retorna equipes padrão com sistema de cores
 * VERDE: SEMPRE locação
 * VERMELHA, AMARELA, AZUL: Rodízio semanal para compra
 */
function getDefaultTeams(): Team[] {
  return [
    {
      id: 'equipe-verde',
      name: 'Equipe Verde 🟢',
      corretores: ['Ana Costa', 'João Santos'],
      accessDay: undefined // Sempre para locação
    },
    {
      id: 'equipe-vermelha', 
      name: 'Equipe Vermelha 🔴',
      corretores: ['Pedro Lima', 'Maria Silva'],
      accessDay: [] // Rodízio semanal para compra
    },
    {
      id: 'equipe-amarela',
      name: 'Equipe Amarela 🟡', 
      corretores: ['Carlos Oliveira', 'Fernanda Costa'],
      accessDay: [] // Rodízio semanal para compra
    },
    {
      id: 'equipe-azul',
      name: 'Equipe Azul 🔵',
      corretores: ['Rafael Santos', 'Julia Almeida'],
      accessDay: [] // Rodízio semanal para compra
    },
    {
      id: 'bolsao',
      name: 'Bolsão de Imóveis',
      corretores: [], // Departamento especial
      accessDay: undefined // Acesso sempre para locação
    }
  ];
}

/**
 * Define dias de acesso para cada equipe
 */
function getAccessDaysForTeam(teamIndex: number): number[] {
  const schedules = [
    [1, 4, 0], // Equipe A: Segunda, quinta, domingo
    [2, 5],    // Equipe B: Terça, sexta  
    [3, 6]     // Equipe C: Quarta, sábado
  ];
  
  return schedules[teamIndex] || [];
}

/**
 * Encontra a equipe de um corretor específico
 */
export function findCorretorTeam(corretor: string, teams: Team[]): Team | null {
  return teams.find(team => 
    team.corretores.includes(corretor)
  ) || null;
}

/**
 * Calcula qual semana do ano estamos (1-52)
 */
function getCurrentWeekNumber(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.floor(diff / oneWeek) + 1;
}

/**
 * Retorna qual equipe tem acesso a COMPRA esta semana (rodízio semanal)
 * 🔴 FIXO ESTA SEMANA: EQUIPE VERMELHA
 */
export function getCurrentWeekTeamForCompra(teams: Team[]): Team | null {
  // 🔴 CONFIGURAÇÃO TEMPORÁRIA: Equipe VERMELHA tem acesso fixo esta semana
  const teamId = 'equipe-vermelha';
  const team = teams.find(t => t.id === teamId);
  
  
  return team || null;
  
  /* 
   * CÓDIGO ORIGINAL DO RODÍZIO (comentado temporariamente):
   * const weekNumber = getCurrentWeekNumber();
   * const equipes = ['equipe-vermelha', 'equipe-amarela', 'equipe-azul'];
   * const teamIndex = (weekNumber - 1) % 3;
   * const teamId = equipes[teamIndex];
   */
}

/**
 * Verifica acesso de um corretor ao Bolsão
 * VERDE 🟢: SOMENTE locação (sem acesso a compra)
 * VERMELHA 🔴/AMARELA 🟡/AZUL 🔵: rodízio semanal para compra + locação
 */
export function getCorretorAccess(corretor: string, teams: Team[]): TeamAccess {
  // Encontrar equipe do corretor
  const userTeam = findCorretorTeam(corretor, teams);
  
  // Equipe Verde SOMENTE tem acesso a locação (não a compra)
  const isEquipeVerde = userTeam?.id === 'equipe-verde';
  
  // Equipe da semana para compra
  const currentWeekTeam = getCurrentWeekTeamForCompra(teams);
  
  // VERDE: Sem acesso a compra, sempre locação
  // OUTRAS: Acesso a compra somente na semana delas, sempre locação
  const canAccessVendas = !isEquipeVerde && userTeam?.id === currentWeekTeam?.id;
  const canAccessLocacao = true; // Todas as equipes têm acesso a locação


  return {
    canAccessVendas,
    canAccessLocacao,
    currentTeam: currentWeekTeam?.name,
    userTeam: userTeam?.name
  };
}

/**
 * Obtém a equipe que tem acesso ESTA SEMANA (para compra)
 */
export function getCurrentDayTeam(teams: Team[]): Team | null {
  return getCurrentWeekTeamForCompra(teams);
}

/**
 * Limpa o cache de equipes (para forçar re-extração)
 */
export function clearTeamsCache(): void {
  teamsCache = null;
  cacheTimestamp = 0;
}

/**
 * Extrai lista de corretores únicos dos leads (para usar no sistema de auth)
 */
export function getCorretoresFromLeads(leads: ProcessedLead[]): string[] {
  const corretores = [...new Set(
    leads
      .map(lead => lead.corretor_responsavel)
      .filter(corretor => corretor && corretor.trim() !== '' && corretor !== 'Não atribuído')
  )].sort();
  
  return corretores;
}

/**
 * Obtém lista de corretores das equipes do Supabase
 */
export async function getCorretoresFromSupabase(leads: ProcessedLead[]): Promise<string[]> {
  try {
    const teams = await getTeamsFromSupabase(leads);
    
    // Extrair todos os corretores de todas as equipes
    const corretoresDeEquipes = teams
      .flatMap(team => team.corretores)
      .filter((corretor, index, array) => array.indexOf(corretor) === index) // remover duplicatas
      .sort();
    
    // Também pegar corretores dos leads que não estão em equipes
    const corretoresDosLeads = getCorretoresFromLeads(leads);
    
    // Combinar e remover duplicatas
    const todosCorretores = [...new Set([...corretoresDeEquipes, ...corretoresDosLeads])].sort();
    
    return todosCorretores;
    
  } catch (error) {
    console.error('Erro ao buscar corretores do Supabase:', error);
    return getCorretoresFromLeads(leads);
  }
}

/**
 * Obtém estatísticas das equipes
 */
export function getTeamStats(teams: Team[], leads: ProcessedLead[]) {
  return teams.map(team => {
    const teamLeads = leads.filter(lead => 
      team.corretores.includes(lead.corretor_responsavel)
    );
    
    return {
      teamName: team.name,
      corretoresCount: team.corretores.length,
      leadsCount: teamLeads.length,
      pipeline: teamLeads.reduce((acc, lead) => acc + (lead.valor_imovel || 0), 0),
      leadsQuentes: teamLeads.filter(lead => lead.status_temperatura === 'Quente').length
    };
  });
}
