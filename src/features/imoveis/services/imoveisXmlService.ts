import { Imovel } from '../services/kenloService';
import { supabase } from '@/lib/supabaseClient';

const XML_URL_STORAGE_KEY_PREFIX = 'xml_imoveis_url__tenant__';
const IMOVEIS_STORAGE_KEY_PREFIX = 'xml_imoveis_data__tenant__';
const CORRETORES_STORAGE_KEY_PREFIX = 'xml_corretores_data__tenant__';

export const getXmlUrlStorageKey = (tenantId: string) => `${XML_URL_STORAGE_KEY_PREFIX}${tenantId}`;
export const getImoveisStorageKey = (tenantId: string) => `${IMOVEIS_STORAGE_KEY_PREFIX}${tenantId}`;
export const getCorretoresStorageKey = (tenantId: string) => `${CORRETORES_STORAGE_KEY_PREFIX}${tenantId}`;

export type TenantCorretor = {
  nome: string;
  email?: string;
  telefone?: string;
  foto?: string;
  imoveisCount: number;
  codigosImoveis?: string[]; // Códigos dos imóveis que o corretor é responsável
};

export const getTenantXmlUrl = (tenantId: string): string => {
  if (!tenantId) return '';
  return localStorage.getItem(getXmlUrlStorageKey(tenantId)) || '';
};

export const setTenantXmlUrl = (tenantId: string, url: string) => {
  if (!tenantId) return;
  localStorage.setItem(getXmlUrlStorageKey(tenantId), url);
};

// ========== SUPABASE PERSISTENCE ==========
// Imóveis são carregados por SESSÃO (localStorage)
// Apenas URL do XML e backup diário são persistidos no Supabase

/**
 * Salva a configuração XML no Supabase (por tenant)
 */
export const saveXmlConfigToSupabase = async (
  tenantId: string,
  xmlUrl: string,
  imoveisCount: number = 0
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('tenant_xml_config')
      .upsert({
        tenant_id: tenantId,
        xml_url: xmlUrl,
        imoveis_count: imoveisCount,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'tenant_id'
      });

    if (error) {
      console.error('❌ Erro ao salvar config XML:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
};

/**
 * Busca a configuração XML do Supabase (por tenant)
 */
export const fetchXmlConfigFromSupabase = async (
  tenantId: string
): Promise<{ config: { xml_url: string; imoveis_count: number; backup_data: Imovel[] | null; backup_at: string | null } | null; error?: string }> => {
  try {
    const { data, error } = await supabase
      .from('tenant_xml_config')
      .select('xml_url, imoveis_count, last_sync_at, backup_data, backup_at')
      .eq('tenant_id', tenantId)
      .maybeSingle(); // Usar maybeSingle() em vez de single() para evitar erro 406 quando não há dados

    if (error) {
      console.error('❌ Erro ao buscar config XML:', error);
      return { config: null, error: error.message };
    }

    return { config: data };
  } catch (error) {
    return { 
      config: null, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
};

/**
 * Salva backup diário dos imóveis no Supabase (apenas 1x por dia)
 * Usado como fallback quando não consegue carregar do XML
 */
export const saveBackupToSupabase = async (
  tenantId: string,
  imoveis: Imovel[]
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Verificar se já fez backup hoje
    const { config } = await fetchXmlConfigFromSupabase(tenantId);
    if (config?.backup_at) {
      const lastBackup = new Date(config.backup_at);
      const now = new Date();
      const diffHours = (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60);
      
      // Só faz backup se passou mais de 24 horas
      if (diffHours < 24) {
        return { success: true };
      }
    }

    const { error } = await supabase
      .from('tenant_xml_config')
      .update({
        backup_data: imoveis,
        backup_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('❌ Erro ao salvar backup:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
};

/**
 * Carrega a configuração XML do Supabase
 * Imóveis são carregados do XML em tempo real (por sessão)
 * Se falhar, usa backup do Supabase como fallback
 */
export const loadXmlDataFromSupabase = async (tenantId: string): Promise<boolean> => {
  if (!tenantId) return false;

  try {
    // 1. Carregar configuração XML (apenas URL)
    const { config } = await fetchXmlConfigFromSupabase(tenantId);
    if (config?.xml_url) {
      localStorage.setItem(getXmlUrlStorageKey(tenantId), config.xml_url);
      
      // 2. Verificar se já tem imóveis na sessão
      const imoveisExistentes = getTenantImoveis(tenantId);
      if (imoveisExistentes.length === 0 && config.backup_data && Array.isArray(config.backup_data)) {
        // Usar backup como fallback apenas se não tiver dados na sessão
        localStorage.setItem(getImoveisStorageKey(tenantId), JSON.stringify(config.backup_data));
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Erro ao carregar dados XML do Supabase:', error);
    return false;
  }
};

export const getTenantImoveis = (tenantId: string): Imovel[] => {
  if (!tenantId) return [];
  const raw = localStorage.getItem(getImoveisStorageKey(tenantId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Imovel[]) : [];
  } catch {
    return [];
  }
};

export const setTenantImoveis = (tenantId: string, imoveis: Imovel[]) => {
  if (!tenantId) return;
  localStorage.setItem(getImoveisStorageKey(tenantId), JSON.stringify(imoveis));
};

export const getTenantCorretores = (tenantId: string): TenantCorretor[] => {
  if (!tenantId) return [];
  const raw = localStorage.getItem(getCorretoresStorageKey(tenantId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TenantCorretor[]) : [];
  } catch {
    return [];
  }
};

export const setTenantCorretores = (tenantId: string, corretores: TenantCorretor[]) => {
  if (!tenantId) return;
  localStorage.setItem(getCorretoresStorageKey(tenantId), JSON.stringify(corretores));
};

const normalizeKey = (value: string) => value.trim().toLowerCase();

export const extractCorretoresFromImoveis = (imoveis: Imovel[]): TenantCorretor[] => {
  const map = new Map<string, TenantCorretor>();

  for (const imovel of imoveis) {
    const nome = (imovel.corretor_nome || '').trim();
    const email = (imovel.corretor_email || '').trim();
    const telefone = (imovel.corretor_numero || '').trim();
    const foto = (imovel.corretor_foto || '').trim();
    const codigoImovel = (imovel.referencia || '').trim().toUpperCase();
    if (!nome && !email) continue;

    const key = email ? `email:${normalizeKey(email)}` : `nome:${normalizeKey(nome)}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        nome: nome || email,
        email: email || undefined,
        telefone: telefone || undefined,
        foto: foto || undefined,
        imoveisCount: 1,
        codigosImoveis: codigoImovel ? [codigoImovel] : [],
      });
      continue;
    }

    existing.imoveisCount += 1;
    if (!existing.nome && nome) existing.nome = nome;
    if (!existing.email && email) existing.email = email;
    if (!existing.telefone && telefone) existing.telefone = telefone;
    if (!existing.foto && foto) existing.foto = foto;
    // Adicionar código do imóvel à lista do corretor
    if (codigoImovel && !existing.codigosImoveis?.includes(codigoImovel)) {
      existing.codigosImoveis = existing.codigosImoveis || [];
      existing.codigosImoveis.push(codigoImovel);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
};

export const previewTenantCorretoresFromImoveis = (tenantId: string): TenantCorretor[] => {
  const imoveis = getTenantImoveis(tenantId);
  return extractCorretoresFromImoveis(imoveis);
};

export const syncMeusImoveisAssignmentsFromXml = async (
  tenantId: string
): Promise<{ ok: boolean; error?: string; summary?: any }> => {
  try {
    if (!tenantId) return { ok: false, error: 'TenantId inválido' };

    const imoveis = getTenantImoveis(tenantId);
    if (!imoveis || imoveis.length === 0) {
      return { ok: false, error: 'Nenhum imóvel carregado do XML' };
    }

    const corretores = extractCorretoresFromImoveis(imoveis);
    const corretoresValidos = corretores
      .map((c) => ({
        nome: c.nome,
        email: c.email,
        telefone: c.telefone,
        foto: c.foto,
        codigosImoveis: c.codigosImoveis || []
      }))
      .filter((c) => Boolean(c.nome));

    if (corretoresValidos.length === 0) {
      return { ok: false, error: 'Nenhum corretor encontrado no XML' };
    }

    const payload = {
      tenantId,
      corretores: corretoresValidos
    };

    const { data, error } = await supabase.functions.invoke('xml-create-broker-access', {
      body: payload
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data?.ok) {
      return { ok: false, error: data?.error || 'Falha ao sincronizar Meus Imóveis' };
    }

    return { ok: true, summary: data?.summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro desconhecido' };
  }
};

const stripCdata = (value: string) => value.replace(/<!\[CDATA\[|\]\]>/g, '').trim();

const matchTag = (xml: string, tag: string): string => {
  const regex = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? stripCdata(match[1]) : '';
};

const matchAnyTag = (xml: string, tags: string[]): string => {
  for (const tag of tags) {
    const v = matchTag(xml, tag);
    if (v) return v;
  }
  return '';
};

const toNumber = (value: string): number => {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d.,-]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const getTipoSimplificado = (tipo: string, referencia: string): Imovel['tipoSimplificado'] => {
  const ref = (referencia || '').toUpperCase();
  if (ref.startsWith('CA')) return 'casa';
  if (ref.startsWith('AP')) return 'apartamento';
  if (ref.startsWith('TE')) return 'terreno';
  if (ref.startsWith('SA') || ref.startsWith('GA')) return 'comercial';
  if (ref.startsWith('CH') || ref.startsWith('SI')) return 'rural';

  const t = (tipo || '').toLowerCase();
  if (t.includes('casa') || t.includes('sobrado')) return 'casa';
  if (t.includes('apartamento') || t.includes('cobertura')) return 'apartamento';
  if (t.includes('terreno') || t.includes('lote')) return 'terreno';
  if (t.includes('comercial') || t.includes('sala') || t.includes('loja')) return 'comercial';
  if (t.includes('chácara') || t.includes('sítio') || t.includes('fazenda')) return 'rural';

  return 'outro';
};

const extractFotos = (imovelXml: string): string[] => {
  const fotosBlockMatch = imovelXml.match(/<Fotos>[\s\S]*?<\/Fotos>/i);
  const block = fotosBlockMatch ? fotosBlockMatch[0] : imovelXml;

  const urls: string[] = [];
  const re = /<URLArquivo>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/URLArquivo>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const url = stripCdata(m[1]);
    if (url) urls.push(url);
  }

  return urls;
};

export const fetchXmlTextViaProxy = async (xmlUrl: string): Promise<string> => {
  const url = xmlUrl.trim();
  if (!url) throw new Error('URL do XML não informada');

  const proxyUrl = `/api/kenlo?url=${encodeURIComponent(url)}`;

  const doFetch = async (method: 'GET' | 'POST') => {
    const res = await fetch(proxyUrl, {
      method,
      headers: {
        'Accept': 'application/xml, text/xml, */*',
        ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
      },
      body: method === 'POST' ? '' : undefined
    });
    return res;
  };

  let response = await doFetch('GET');
  if (!response.ok) {
    response = await doFetch('POST');
  }

  if (!response.ok) {
    const preview = await response.text().catch(() => '');
    throw new Error(`Falha ao buscar XML (HTTP ${response.status}). ${preview ? `Resposta: ${preview.substring(0, 200)}` : ''}`);
  }

  return response.text();
};

export const parseImoveisFromXml = (xmlText: string): Imovel[] => {
  const matches = xmlText.match(/<Imovel>[\s\S]*?<\/Imovel>/gi) || [];
  const imoveis: Imovel[] = [];
  
  // Estatísticas de corretor
  let corretorStats = { total: 0, comNome: 0, comEmail: 0, comTelefone: 0 };

  for (const imovelXml of matches) {
    const referencia = matchTag(imovelXml, 'CodigoImovel') || matchTag(imovelXml, 'CodigoImovelAuxiliar');
    if (!referencia) continue;

    const tipo = matchTag(imovelXml, 'TipoImovel') || 'Imóvel';

    const valorVenda = toNumber(matchTag(imovelXml, 'PrecoVenda'));
    const valorLocacao = toNumber(matchTag(imovelXml, 'PrecoLocacao'));

    const finalidade: Imovel['finalidade'] =
      valorVenda > 0 && valorLocacao > 0
        ? 'venda_locacao'
        : valorLocacao > 0
          ? 'locacao'
          : 'venda';

    const corretorBlock = matchTag(imovelXml, 'corretor');
    const corretor_nome = matchAnyTag(corretorBlock || imovelXml, [
      'nome',
      'NomeCorretor',
      'CorretorNome',
      'CorretorResponsavel',
      'NomeCorretorResponsavel',
      'NomeResponsavel',
      'Responsavel',
      'NomeAgente',
      'AgenteNome'
    ]);

    const corretor_numero = matchAnyTag(corretorBlock || imovelXml, [
      'celular',
      'telefone',
      'CodigoCorretor',
      'NumeroCorretor',
      'CorretorCodigo',
      'CorretorId',
      'CodigoResponsavel',
      'IdResponsavel',
      'AgenteId',
      'AgenteCodigo'
    ]);

    const corretor_email = matchAnyTag(corretorBlock || imovelXml, [
      'email',
      'EmailCorretor',
      'CorretorEmail',
      'EmailResponsavel',
      'AgenteEmail'
    ]);

    const corretor_foto = matchAnyTag(corretorBlock || imovelXml, [
      'foto',
      'FotoCorretor',
      'CorretorFoto',
      'FotoResponsavel',
      'AgenteFoto'
    ]);

    // Estatísticas de corretor
    corretorStats.total++;
    if (corretor_nome) corretorStats.comNome++;
    if (corretor_email && corretor_email.includes('@')) corretorStats.comEmail++;
    if (corretor_numero) corretorStats.comTelefone++;

    const imovel: Imovel = {
      referencia,
      titulo: matchTag(imovelXml, 'TituloImovel') || referencia,
      tipo,
      tipoSimplificado: getTipoSimplificado(tipo, referencia),
      bairro: matchTag(imovelXml, 'Bairro') || matchTag(imovelXml, 'BairroOficial') || 'Sem Bairro',
      cidade: matchTag(imovelXml, 'Cidade') || 'Sem Cidade',
      estado: matchTag(imovelXml, 'Estado') || 'Sem UF',
      latitude: toNumber(matchTag(imovelXml, 'Latitude')) || undefined,
      longitude: toNumber(matchTag(imovelXml, 'Longitude')) || undefined,
      cep: matchTag(imovelXml, 'CEP') || matchTag(imovelXml, 'Cep') || undefined,
      endereco:
        matchTag(imovelXml, 'Endereco') ||
        matchTag(imovelXml, 'Logradouro') ||
        matchTag(imovelXml, 'Rua') ||
        undefined,
      numero: matchTag(imovelXml, 'Numero') || undefined,
      nome_condominio:
        matchTag(imovelXml, 'NomeCondominio') ||
        matchTag(imovelXml, 'NomeEmpreendimento') ||
        matchTag(imovelXml, 'Empreendimento') ||
        undefined,
      ...(corretor_nome ? { corretor_nome } : {}),
      ...(corretor_numero ? { corretor_numero } : {}),
      ...(corretor_email ? { corretor_email } : {}),
      ...(corretor_foto ? { corretor_foto } : {}),
      valor_venda: valorVenda,
      valor_locacao: valorLocacao,
      finalidade,
      valor_iptu: toNumber(matchTag(imovelXml, 'PrecoIptu')),
      valor_condominio: toNumber(matchTag(imovelXml, 'PrecoCondominio')),
      area_total: toNumber(matchTag(imovelXml, 'AreaTotal')),
      area_util: toNumber(matchTag(imovelXml, 'AreaUtil')),
      quartos: toNumber(matchTag(imovelXml, 'QtdDormitorios')),
      suites: toNumber(matchTag(imovelXml, 'QtdSuites')),
      garagem: toNumber(matchTag(imovelXml, 'QtdVagas')),
      banheiro: toNumber(matchTag(imovelXml, 'QtdBanheiros')),
      salas: toNumber(matchTag(imovelXml, 'QtdSalas')),
      descricao: matchTag(imovelXml, 'Observacao'),
      fotos: extractFotos(imovelXml),
      videos: [matchTag(imovelXml, 'LinkVideo'), matchTag(imovelXml, 'TourVirtual')].filter(Boolean),
      area_comum: [],
      area_privativa: []
    };

    imoveis.push(imovel);
  }

  // Log estatísticas de corretor

  return imoveis;
};

export const syncTenantImoveisFromXml = async (tenantId: string): Promise<{ count: number }> => {
  if (!tenantId) throw new Error('TenantId inválido');

  const xmlUrl = getTenantXmlUrl(tenantId);
  if (!xmlUrl) throw new Error('URL do XML não configurada');

  const xmlText = await fetchXmlTextViaProxy(xmlUrl);
  const imoveis = parseImoveisFromXml(xmlText);
  
  // Salvar no localStorage (para uso na sessão atual)
  setTenantImoveis(tenantId, imoveis);
  
  // Salvar URL e contagem no Supabase
  await saveXmlConfigToSupabase(tenantId, xmlUrl, imoveis.length);
  
  // Fazer backup diário (apenas 1x por dia como fallback)
  await saveBackupToSupabase(tenantId, imoveis);

  // Sincronizar automaticamente os responsáveis pelos imóveis na tabela imoveis_corretores
  // (alimentando a aba "Meus Imóveis" de cada corretor)
  await syncMeusImoveisAssignmentsFromXml(tenantId);
  
  return { count: imoveis.length };
};

export const saveTenantCorretoresFromImoveis = (tenantId: string): { count: number } => {
  const corretores = previewTenantCorretoresFromImoveis(tenantId);
  setTenantCorretores(tenantId, corretores);
  return { count: corretores.length };
};

/**
 * Busca um imóvel pelo código de referência
 * @param tenantId - ID do tenant
 * @param codigoImovel - Código de referência do imóvel (ex: CA0099, AP0123)
 * @returns Imóvel encontrado ou null
 */
export const getImovelByCodigo = (tenantId: string, codigoImovel: string): Imovel | null => {
  if (!tenantId || !codigoImovel) return null;
  
  const imoveis = getTenantImoveis(tenantId);
  const codigoNormalizado = codigoImovel.trim().toUpperCase();
  
  return imoveis.find(imovel => 
    imovel.referencia?.toUpperCase() === codigoNormalizado
  ) || null;
};

/**
 * Busca o corretor responsável pelo imóvel através do código de referência
 * @param tenantId - ID do tenant
 * @param codigoImovel - Código de referência do imóvel (ex: CA0099, AP0123)
 * @returns Nome do corretor ou null se não encontrado
 */
export const getCorretorByCodigoImovel = (tenantId: string, codigoImovel: string): string | null => {
  const imovel = getImovelByCodigo(tenantId, codigoImovel);
  
  if (!imovel) return null;
  
  return imovel.corretor_nome || null;
};

/**
 * Busca imóveis que correspondem parcialmente ao código digitado (para autocomplete)
 * @param tenantId - ID do tenant
 * @param termo - Termo de busca (código parcial)
 * @param limite - Número máximo de resultados (padrão: 10)
 * @returns Lista de imóveis correspondentes
 */
export const searchImoveisByCodigo = (tenantId: string, termo: string, limite: number = 10): Imovel[] => {
  if (!tenantId || !termo || termo.length < 2) return [];
  
  const imoveis = getTenantImoveis(tenantId);
  const termoNormalizado = termo.trim().toUpperCase();
  
  return imoveis
    .filter(imovel => imovel.referencia?.toUpperCase().includes(termoNormalizado))
    .slice(0, limite);
};

/**
 * Retorna todos os corretores únicos extraídos diretamente dos imóveis
 * @param tenantId - ID do tenant
 * @returns Lista de corretores únicos com contagem de imóveis
 */
export const getCorretoresFromImoveis = (tenantId: string): TenantCorretor[] => {
  if (!tenantId) return [];
  
  const imoveis = getTenantImoveis(tenantId);
  if (imoveis.length === 0) return [];
  
  // Extrair corretores únicos dos imóveis
  const corretoresMap = new Map<string, TenantCorretor>();
  
  for (const imovel of imoveis) {
    const nome = (imovel.corretor_nome || '').trim();
    if (!nome) continue;
    
    const key = nome.toLowerCase();
    const existing = corretoresMap.get(key);
    
    if (existing) {
      existing.imoveisCount = (existing.imoveisCount || 0) + 1;
    } else {
      corretoresMap.set(key, {
        nome,
        email: imovel.corretor_email || undefined,
        telefone: imovel.corretor_numero || undefined,
        foto: imovel.corretor_foto || undefined,
        imoveisCount: 1
      });
    }
  }
  
  // Ordenar por quantidade de imóveis (mais imóveis primeiro)
  return Array.from(corretoresMap.values())
    .sort((a, b) => (b.imoveisCount || 0) - (a.imoveisCount || 0));
};

