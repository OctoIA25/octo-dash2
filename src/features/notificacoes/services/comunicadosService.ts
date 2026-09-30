/**
 * Enviar comunicado pela tela: uma RPC. Quem recebe, o remetente e as
 * etiquetas saem do banco (enviar_comunicado → publicar_comunicado); aqui só
 * se valida o óbvio para o botão, e se traduz o erro.
 */
import { supabase } from '@/integrations/supabase/client';

export const LIMITES = { titulo: 120, mensagem: 2000 } as const;

export interface NovoComunicado {
  tenantId: string;
  titulo: string;
  mensagem: string;
  importante: boolean;
  publico: 'todos' | 'equipes';
  equipeIds: string[];
  /** Uma por abertura do compositor: clicar duas vezes não duplica. */
  idempotencyKey: string;
}

type Rascunho = Pick<NovoComunicado, 'titulo' | 'mensagem' | 'publico' | 'equipeIds'>;

export function podeEnviar(c: Rascunho): boolean {
  const t = c.titulo.trim().length;
  const m = c.mensagem.trim().length;
  return t > 0 && t <= LIMITES.titulo && m > 0 && m <= LIMITES.mensagem
    && (c.publico === 'todos' || c.equipeIds.length > 0);
}

const MENSAGENS = new Map<string, string>([
  ['sem_permissao', 'Você só pode enviar para as equipes que lidera.'],
  ['sem_destinatarios', 'Essas equipes ainda não têm ninguém.'],
  ['equipe_invalida', 'Escolha ao menos uma equipe.'],
]);

export function mensagemDoErro(codigo?: string): string {
  return (codigo && MENSAGENS.get(codigo)) || 'Não deu para enviar. Tente de novo.';
}

/** Devolve quantas pessoas receberam. */
export async function enviarComunicado(c: NovoComunicado): Promise<number> {
  const { data, error } = await supabase.rpc('enviar_comunicado', {
    p_tenant_id: c.tenantId,
    p_titulo: c.titulo.trim(),
    p_mensagem: c.mensagem.trim(),
    p_prioridade: c.importante ? 'importante' : 'normal',
    p_publico_tipo: c.publico,
    p_equipe_ids: c.publico === 'equipes' ? c.equipeIds : [],
    p_idempotency_key: c.idempotencyKey,
  });
  if (error) throw new Error(mensagemDoErro(error.message));
  const linha = Array.isArray(data) ? data[0] : data;
  return Number(linha?.destinatarios ?? 0);
}
