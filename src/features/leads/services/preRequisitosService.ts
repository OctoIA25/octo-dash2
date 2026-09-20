/**
 * O que se sabe de UM lead na hora de mover de etapa (P1.6).
 *
 * Roda no arrastar e no seletor do modal — um lead de cada vez, nunca o
 * quadro inteiro. Por isso pode buscar à vontade: não é o N+1 que o P0.7
 * tirou da Central, é uma ação do usuário sobre um lead só.
 *
 * SÓ BUSCA O QUE A CHAVE LIGADA PRECISA. Com tudo desligado — que é o padrão
 * — não vai nenhuma consulta ao banco, e arrastar continua custando o que
 * custava antes deste item existir.
 */

import { supabase } from '@/lib/supabaseClient';
import type { ChavesDeEtapa, ContextoDoLead } from '../utils/preRequisitos';

const BUCKET_DOCUMENTOS = 'lead-documentos';

/**
 * Reúne o contexto do lead para a regra de pré-requisitos.
 *
 * Nunca lança: a etapa muda de qualquer jeito, e uma falha de leitura não
 * pode impedir o corretor de trabalhar. O que se perde numa falha é o aviso,
 * e isso é o lado certo de errar.
 */
export async function contextoDoLead(
  tenantId: string,
  leadId: string,
  relato: string | null | undefined,
  chaves: ChavesDeEtapa
): Promise<ContextoDoLead> {
  const ctx: ContextoDoLead = { relato: relato ?? null, documentos: 0 };
  if (!tenantId || tenantId === 'owner' || !leadId) return ctx;

  const precisaVisita = chaves.exigir_visita_agendada;
  const precisaProposta = chaves.exigir_dados_da_proposta || chaves.registrar_hora_da_assinatura;
  const precisaDocumento = chaves.exigir_proposta_assinada;

  const tarefas: Array<Promise<void>> = [];

  if (precisaVisita) {
    tarefas.push(
      (async () => {
        // A visita mora em `agenda_eventos`, e NÃO em `leads.visit_date`:
        // aquela coluna está vazia em 100% da base e nenhuma tela a escreve.
        const { data } = await supabase
          .from('agenda_eventos')
          .select('data, imovel_ref')
          .eq('tenant_id', tenantId)
          .eq('lead_uuid', leadId)
          .eq('tipo', 'visita_agendada')
          .order('data', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) ctx.visita = { data: data.data ?? null, imovelRef: data.imovel_ref ?? null };
      })().catch(() => { /* sem aviso é melhor que aviso inventado */ })
    );
  }

  if (precisaProposta) {
    tarefas.push(
      (async () => {
        const { data } = await supabase
          .from('proposals')
          .select('value, property_reference, payment_method, signed_at')
          .eq('tenant_id', tenantId)
          .eq('lead_id', leadId)
          .maybeSingle();
        if (data) ctx.proposta = data;
      })().catch(() => {})
    );
  }

  if (precisaDocumento) {
    tarefas.push(
      (async () => {
        const { data } = await supabase.storage
          .from(BUCKET_DOCUMENTOS)
          .list(`${tenantId}/${leadId}`);
        // O Storage devolve uma entrada de marcação em pasta vazia; ela não é
        // documento, e contá-la faria a chave passar sem nenhum anexo.
        ctx.documentos = (data ?? []).filter((f) => f?.id).length;
      })().catch(() => {})
    );
  }

  await Promise.all(tarefas);
  return ctx;
}
