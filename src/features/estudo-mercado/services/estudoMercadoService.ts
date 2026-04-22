/**
 * 📊 SERVIÇO DE ESTUDOS DE MERCADO (Multi-tenant)
 *
 * CRUD para estudos de mercado + upload de fotos para Storage.
 * Tabelas: estudos_mercado, estudos_mercado_amostras
 * Bucket: estudos-fotos
 */

import { supabase } from '@/lib/supabaseClient';

// ============================================================================
// Types
// ============================================================================

export interface EstudoMercadoRow {
  id: string;
  tenant_id: string;
  corretor_id: string;
  corretor_nome: string;
  corretor_email: string | null;
  corretor_telefone: string | null;
  corretor_foto: string | null;
  corretor_equipe: string | null;
  corretor_role: string | null;
  corretor_creci: string | null;
  nome_cliente: string | null;
  email_cliente: string | null;
  endereco_imovel: string | null;
  observacoes: string | null;
  metragem_imovel: number;
  correcao_mercado: number;
  margem_exclusividade: number;
  media_por_m2: number;
  valor_base: number;
  valor_mercado: number;
  valor_exclusividade: number;
  valor_final: number;
  relatorio_html: string | null;
  status: 'rascunho' | 'finalizado';
  created_at: string;
  updated_at: string;
}

export interface AmostraRow {
  id: string;
  estudo_id: string;
  tenant_id: string;
  ordem: number;
  link: string | null;
  valor_total: number;
  metragem: number;
  estado: string | null;
  cidade: string | null;
  bairro: string | null;
  condominio: string | null;
  rua: string | null;
  tipo: string | null;
  diferenciais: string | null;
  imagem_url: string | null;
  imagem_zap_imoveis: string | null;
  created_at: string;
}

export interface EstudoComAmostras extends EstudoMercadoRow {
  amostras: AmostraRow[];
}

// Payload para criar/atualizar estudo
export interface SalvarEstudoPayload {
  // Identificação
  tenantId: string;
  corretorId: string;
  corretorNome: string;
  corretorEmail: string;
  corretorEquipe?: string;
  corretorRole?: string;
  // Dados do estudo
  nomeCliente: string;
  emailCliente: string;
  enderecoImovel: string;
  observacoes: string;
  metragemImovel: number;
  correcaoMercado: number;
  margemExclusividade: number;
  mediaPorM2: number;
  valorBase: number;
  valorMercado: number;
  valorExclusividade: number;
  valorFinal: number;
  relatorioHtml: string | null;
  status: 'rascunho' | 'finalizado';
  // Amostras
  amostras: AmostraPayload[];
}

export interface AmostraPayload {
  ordem: number;
  link: string;
  valorTotal: number;
  metragem: number;
  estado: string;
  cidade: string;
  bairro: string;
  condominio: string;
  rua: string;
  tipo?: string;
  diferenciais?: string;
  imagemUrl?: string;
  imagemZapImoveis?: string;
}

// ============================================================================
// Salvar Estudo (insert ou update)
// ============================================================================

/**
 * Salva um estudo de mercado completo (estudo + amostras).
 * Se `estudoId` for fornecido, atualiza; caso contrário, cria novo.
 * Retorna o ID do estudo salvo.
 */
export async function salvarEstudo(
  payload: SalvarEstudoPayload,
  estudoId?: string
): Promise<{ id: string; error?: string }> {
  try {
    // ---- 0. Buscar dados completos do corretor no tenant_brokers ----
    let corretorTelefone: string | null = null;
    let corretorFoto: string | null = null;
    let corretorEquipe: string | null = payload.corretorEquipe || null;
    let corretorRole: string | null = payload.corretorRole || null;
    let corretorCreci: string | null = null;
    let corretorNomeFull = payload.corretorNome;
    let corretorEmailFull = payload.corretorEmail;

    // Buscar dados completos do corretor em tenant_brokers
    try {
      const { data: brokerData } = await supabase
        .from('tenant_brokers')
        .select('name, email, phone, photo_url, status')
        .eq('auth_user_id', payload.corretorId)
        .eq('tenant_id', payload.tenantId)
        .maybeSingle();

      if (brokerData) {
        corretorNomeFull = brokerData.name || corretorNomeFull;
        corretorEmailFull = brokerData.email || corretorEmailFull;
        corretorTelefone = brokerData.phone || null;
        corretorFoto = brokerData.photo_url || null;
      }
    } catch {
    }

    // Buscar role do membership (se não veio no payload)
    if (!corretorRole) {
      try {
        const { data: memberData } = await supabase
          .from('tenant_memberships')
          .select('role')
          .eq('user_id', payload.corretorId)
          .eq('tenant_id', payload.tenantId)
          .maybeSingle();

        if (memberData) {
          corretorRole = memberData.role || null;
        }
      } catch {
      }
    }

    // ---- 1. Upsert do estudo principal ----
    const estudoData = {
      tenant_id: payload.tenantId,
      corretor_id: payload.corretorId,
      corretor_nome: corretorNomeFull,
      corretor_email: corretorEmailFull,
      corretor_telefone: corretorTelefone,
      corretor_foto: corretorFoto,
      corretor_equipe: corretorEquipe,
      corretor_role: corretorRole,
      corretor_creci: corretorCreci,
      nome_cliente: payload.nomeCliente || null,
      email_cliente: payload.emailCliente || null,
      endereco_imovel: payload.enderecoImovel || null,
      observacoes: payload.observacoes || null,
      metragem_imovel: payload.metragemImovel,
      correcao_mercado: payload.correcaoMercado,
      margem_exclusividade: payload.margemExclusividade,
      media_por_m2: payload.mediaPorM2,
      valor_base: payload.valorBase,
      valor_mercado: payload.valorMercado,
      valor_exclusividade: payload.valorExclusividade,
      valor_final: payload.valorFinal,
      relatorio_html: payload.relatorioHtml,
      status: payload.status,
      updated_at: new Date().toISOString(),
    };

    let savedEstudoId: string;

    if (estudoId) {
      // Update
      const { error } = await supabase
        .from('estudos_mercado')
        .update(estudoData)
        .eq('id', estudoId);

      if (error) {
        console.error('❌ Erro ao atualizar estudo:', error);
        return { id: '', error: error.message };
      }
      savedEstudoId = estudoId;
    } else {
      // Insert
      const { data, error } = await supabase
        .from('estudos_mercado')
        .insert(estudoData)
        .select('id')
        .single();

      if (error || !data) {
        console.error('❌ Erro ao criar estudo:', error);
        return { id: '', error: error?.message || 'Erro ao criar estudo' };
      }
      savedEstudoId = data.id;
    }

    // ---- 2. Substituir amostras (delete + insert) ----
    // Deletar amostras existentes deste estudo
    if (estudoId) {
      const { error: delError } = await supabase
        .from('estudos_mercado_amostras')
        .delete()
        .eq('estudo_id', savedEstudoId);

      if (delError) {
        console.warn('⚠️ Erro ao limpar amostras antigas:', delError.message);
      }
    }

    // Inserir novas amostras
    if (payload.amostras.length > 0) {
      const amostrasData = payload.amostras.map((a) => ({
        estudo_id: savedEstudoId,
        tenant_id: payload.tenantId,
        ordem: a.ordem,
        link: a.link || null,
        valor_total: a.valorTotal,
        metragem: a.metragem,
        estado: a.estado || null,
        cidade: a.cidade || null,
        bairro: a.bairro || null,
        condominio: a.condominio || null,
        rua: a.rua || null,
        tipo: a.tipo || null,
        diferenciais: a.diferenciais || null,
        imagem_url: a.imagemUrl || null,
        imagem_zap_imoveis: a.imagemZapImoveis || null,
      }));

      const { error: insertError } = await supabase
        .from('estudos_mercado_amostras')
        .insert(amostrasData);

      if (insertError) {
        console.error('❌ Erro ao inserir amostras:', insertError);
        return { id: savedEstudoId, error: `Estudo salvo, mas erro nas amostras: ${insertError.message}` };
      }
    }

    return { id: savedEstudoId };
  } catch (err: any) {
    console.error('❌ Erro inesperado ao salvar estudo:', err);
    return { id: '', error: err.message || 'Erro inesperado' };
  }
}

// ============================================================================
// Listar Estudos
// ============================================================================

/**
 * Lista todos os estudos de mercado do tenant.
 */
export async function listarEstudos(tenantId: string): Promise<EstudoMercadoRow[]> {
  const { data, error } = await supabase
    .from('estudos_mercado')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Erro ao listar estudos:', error);
    return [];
  }

  return (data || []) as EstudoMercadoRow[];
}

// ============================================================================
// Carregar Estudo com Amostras
// ============================================================================

/**
 * Carrega um estudo de mercado completo (estudo + amostras).
 */
export async function carregarEstudo(estudoId: string): Promise<EstudoComAmostras | null> {
  const { data: estudo, error: estudoError } = await supabase
    .from('estudos_mercado')
    .select('*')
    .eq('id', estudoId)
    .maybeSingle();

  if (estudoError || !estudo) {
    console.error('❌ Erro ao carregar estudo:', estudoError);
    return null;
  }

  const { data: amostras, error: amostrasError } = await supabase
    .from('estudos_mercado_amostras')
    .select('*')
    .eq('estudo_id', estudoId)
    .order('ordem', { ascending: true });

  if (amostrasError) {
    console.warn('⚠️ Erro ao carregar amostras:', amostrasError);
  }

  return {
    ...(estudo as EstudoMercadoRow),
    amostras: (amostras || []) as AmostraRow[],
  };
}

// ============================================================================
// Excluir Estudo
// ============================================================================

/**
 * Exclui um estudo de mercado (amostras são removidas via CASCADE).
 */
export async function excluirEstudo(estudoId: string): Promise<boolean> {
  const { error } = await supabase
    .from('estudos_mercado')
    .delete()
    .eq('id', estudoId);

  if (error) {
    console.error('❌ Erro ao excluir estudo:', error);
    return false;
  }

  return true;
}

// ============================================================================
// Upload de Foto para Storage
// ============================================================================

/**
 * Faz upload de uma foto (base64 data URL) para o Storage e retorna a URL pública.
 * @param dataUrl - Data URL (base64) da imagem
 * @param path - Caminho no bucket (ex: "tenant-id/estudo-id/amostra-0.jpg")
 */
export async function uploadFotoAmostra(
  dataUrl: string,
  path: string
): Promise<string | null> {
  try {
    // Converter data URL para Blob
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    // Determinar content type
    const contentType = blob.type || 'image/jpeg';

    const { error } = await supabase.storage
      .from('estudos-fotos')
      .upload(path, blob, {
        contentType,
        upsert: true,
      });

    if (error) {
      console.error('❌ Erro no upload da foto:', error);
      return null;
    }

    // Retornar URL pública
    const { data: urlData } = supabase.storage
      .from('estudos-fotos')
      .getPublicUrl(path);

    return urlData?.publicUrl || null;
  } catch (err) {
    console.error('❌ Erro ao fazer upload da foto:', err);
    return null;
  }
}

// ============================================================================
// Salvar Relatório HTML
// ============================================================================

/**
 * Atualiza o campo relatorio_html de um estudo existente.
 */
export async function salvarRelatorioHtml(
  estudoId: string,
  html: string
): Promise<boolean> {
  const { error } = await supabase
    .from('estudos_mercado')
    .update({
      relatorio_html: html,
      status: 'finalizado',
      updated_at: new Date().toISOString(),
    })
    .eq('id', estudoId);

  if (error) {
    console.error('❌ Erro ao salvar relatório HTML:', error);
    return false;
  }

  return true;
}
