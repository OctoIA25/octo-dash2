/**
 * Demandas de marketing (P3.7) — leitura, escrita e anexos.
 *
 * O histórico NÃO é gravado daqui: quem grava é um gatilho no banco. Uma tela
 * que grava histórico esquece no dia em que o status muda por outro caminho, e
 * histórico com buraco parece completo.
 */

import { supabase } from '@/lib/supabaseClient';
import { createNotification } from '@/features/notificacoes/services/notificationsService';
import { fetchTenantMembers } from '@/features/corretores/services/tenantMembersService';
import { avisoDeAprovacao, quemAvisar, type Anexo, type Demanda, type Status } from './demandas';

const BUCKET = 'mkt-demandas';

export async function carregarQuadro(tenantId: string): Promise<Demanda[]> {
  if (!tenantId || tenantId === 'owner') return [];
  const { data, error } = await supabase.rpc('mkt_quadro_de_demandas', {
    p_tenant_id: tenantId,
    p_publicados_desde: null,
  });
  if (error) throw error;
  return ((data as { demandas: Demanda[] })?.demandas ?? []) as Demanda[];
}

export interface PassoDoHistorico {
  de: string | null;
  para: string;
  em: string;
  por: string | null;
}

export async function carregarHistorico(
  tenantId: string,
  demandaId: string
): Promise<PassoDoHistorico[]> {
  if (!tenantId || !demandaId) return [];
  const { data, error } = await supabase.rpc('mkt_historico_da_demanda', {
    p_tenant_id: tenantId,
    p_demanda_id: demandaId,
  });
  if (error) throw error;
  return (data as PassoDoHistorico[]) ?? [];
}

export async function criarDemanda(
  tenantId: string,
  d: Partial<Demanda> & { titulo: string; prazo: string }
): Promise<Demanda> {
  const { data: sessao } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('mkt_demandas')
    .insert({
      tenant_id: tenantId,
      titulo: d.titulo.trim(),
      tipo: d.tipo ?? 'post',
      lancamento_id: d.lancamento_id ?? null,
      solicitante_id: sessao?.user?.id ?? null,
      responsavel_id: d.responsavel_id ?? null,
      objetivo: d.objetivo ?? '',
      publico: d.publico ?? '',
      formato: d.formato ?? '',
      texto_base: d.texto_base ?? '',
      referencias: d.referencias ?? [],
      anexos: d.anexos ?? [],
      prazo: d.prazo,
      prioridade: d.prioridade ?? 'media',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as unknown as Demanda;
}

/**
 * Move ou edita, e dispara os avisos que o plano pede.
 *
 * Os avisos saem DEPOIS de o banco confirmar: notificar alguém sobre uma
 * mudança que não foi gravada é pior do que não notificar.
 */
export async function salvarDemanda(
  tenantId: string,
  antes: Demanda,
  mudancas: Partial<Demanda>
): Promise<Demanda> {
  const { data: sessao } = await supabase.auth.getUser();
  const quemMexeu = sessao?.user?.id ?? null;

  const { data, error } = await supabase
    .from('mkt_demandas')
    .update(mudancas)
    .eq('id', antes.id)
    .select('*')
    .single();
  if (error) throw error;

  const depois = { ...antes, ...(data as unknown as Demanda) };

  const avisos = quemAvisar(antes, depois, quemMexeu);
  const aprovacao = avisoDeAprovacao(antes, depois, quemMexeu);
  if (aprovacao) avisos.push(aprovacao);

  for (const a of avisos) {
    // Falhar em notificar NÃO desfaz a mudança: a demanda já andou, e um
    // throw aqui faria a tela dizer que não salvou quando salvou.
    try {
      await createNotification({
        tenant_id: tenantId,
        user_id: a.userId,
        title: a.titulo,
        body: a.corpo,
        type: 'info',
        link_type: 'mkt_demanda',
        link_id: antes.id,
      });
    } catch (e) {
      console.error('[demandas] não deu para notificar:', e);
    }
  }

  return depois;
}

export async function apagarDemanda(id: string): Promise<void> {
  const { error } = await supabase.from('mkt_demandas').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Sobe um anexo.
 *
 * O caminho começa pelo tenant porque é dele que a política do bucket tira o
 * recorte: `tenant/demanda/arquivo`. Mudar essa forma abriria o anexo de uma
 * imobiliária para outra.
 */
export async function subirAnexo(
  tenantId: string,
  demandaId: string,
  arquivo: File
): Promise<Anexo> {
  // Nome higienizado: acento e espaço no caminho do Storage viram %XX e
  // quebram o link depois. O nome original fica guardado no jsonb.
  const limpo = arquivo.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]/g, '_');
  const caminho = `${tenantId}/${demandaId}/${Date.now()}-${limpo}`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    contentType: arquivo.type || undefined,
    upsert: false,
  });
  if (error) throw error;
  return { nome: arquivo.name, caminho, tipo: arquivo.type, tamanho: arquivo.size };
}

/**
 * O endereço para baixar um anexo.
 *
 * Assinado, e com validade curta: o bucket é privado porque peça em produção é
 * material não publicado da casa — preço, lançamento não anunciado, arte antes
 * da aprovação.
 */
export async function linkDoAnexo(caminho: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 300);
  if (error) {
    console.error('[demandas] não deu para assinar o link do anexo:', error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

export async function apagarAnexo(caminho: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([caminho]);
  if (error) throw error;
}

/**
 * Os membros do tenant, para escolher o responsável.
 *
 * Usa `fetchTenantMembers`, que é o caminho que a tela de equipe já usa
 * (tenant_memberships + tenant_brokers para o e-mail).
 *
 * NÃO usa a RPC `get_tenant_members_with_email`: ela está QUEBRADA no banco —
 * declara `member_email text` e `auth.users.email` é `character varying(255)`,
 * então toda chamada de usuário autenticado morre com 42804 (a chamada anônima
 * escapa porque a função retorna antes). Nenhum código deste repo a usa, e ela
 * não está em migration nenhuma daqui: veio do dump. Anotada para o chefe.
 */
export async function listarMembros(
  tenantId: string
): Promise<Array<{ id: string; nome: string }>> {
  if (!tenantId || tenantId === 'owner') return [];
  const membros = await fetchTenantMembers(tenantId);
  // O e-mail é o rótulo: é a chave que o resto da Dash usa para identificar
  // pessoa, e o card de membro já o mostra assim.
  return membros.map((m) => ({ id: m.user_id, nome: m.email || m.user_id }));
}

export async function moverPara(
  tenantId: string,
  demanda: Demanda,
  status: Status,
  ordem: number
): Promise<Demanda> {
  return salvarDemanda(tenantId, demanda, { status, ordem });
}
