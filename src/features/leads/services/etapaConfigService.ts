/**
 * As chaves de pré-requisito da imobiliária (P1.6).
 *
 * Mesmo desenho de `tenantBolsaoConfigService`: uma linha por imobiliária,
 * `upsert` por `tenant_id`, e o padrão de volta quando não há linha.
 *
 * O PADRÃO É TUDO DESLIGADO. Imobiliária sem linha na tabela é o caso da
 * maioria hoje, e uma chave que começasse ligada passaria a avisar em quase
 * todo arrastar sem ninguém ter pedido.
 */

import { supabase } from '@/lib/supabaseClient';
import { CHAVES_PADRAO, type ChavesDeEtapa } from '../utils/preRequisitos';

const COLUNAS =
  'exigir_visita_agendada, exigir_dados_da_proposta, exigir_proposta_assinada, relato_minimo_caracteres, registrar_hora_da_assinatura';

export async function buscarChavesDeEtapa(tenantId: string): Promise<ChavesDeEtapa> {
  if (!tenantId || tenantId === 'owner') return CHAVES_PADRAO;

  const { data, error } = await supabase
    .from('tenant_etapa_config')
    .select(COLUNAS)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // Falha de leitura cai no PADRÃO, que é tudo desligado. O lado seguro de
  // errar aqui é não avisar: um aviso inventado por erro de rede mandaria o
  // corretor procurar um dado que não falta.
  if (error || !data) return CHAVES_PADRAO;

  return {
    exigir_visita_agendada: data.exigir_visita_agendada === true,
    exigir_dados_da_proposta: data.exigir_dados_da_proposta === true,
    exigir_proposta_assinada: data.exigir_proposta_assinada === true,
    relato_minimo_caracteres: Number(data.relato_minimo_caracteres ?? CHAVES_PADRAO.relato_minimo_caracteres),
    registrar_hora_da_assinatura: data.registrar_hora_da_assinatura === true,
  };
}

export async function salvarChavesDeEtapa(tenantId: string, chaves: ChavesDeEtapa): Promise<void> {
  if (!tenantId || tenantId === 'owner') throw new Error('sem imobiliária selecionada');

  const { error } = await supabase
    .from('tenant_etapa_config')
    .upsert(
      {
        tenant_id: tenantId,
        exigir_visita_agendada: chaves.exigir_visita_agendada,
        exigir_dados_da_proposta: chaves.exigir_dados_da_proposta,
        exigir_proposta_assinada: chaves.exigir_proposta_assinada,
        relato_minimo_caracteres: chaves.relato_minimo_caracteres,
        registrar_hora_da_assinatura: chaves.registrar_hora_da_assinatura,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id' }
    );

  if (error) throw error;
}
