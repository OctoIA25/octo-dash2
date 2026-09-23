/**
 * O chip de quem está atendendo, e o botão de assumir (F.1).
 *
 * A LIA roda em servidor próprio: a Dash NÃO intercepta mensagem dela. Assumir
 * a conversa, aqui, é registrar um recado que a LIA consulta antes de falar —
 * a mesma divisão do bloqueio de corretor: a Dash decide, a LIA obedece.
 *
 * Por isso o botão diz "a LIA para de responder", e não "a LIA foi desligada":
 * entre o clique e a próxima consulta dela pode passar uma mensagem. Prometer
 * corte imediato seria prometer o que esta tela não controla.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Hand, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import type { WhatsappMessage } from '../types';
import { contarPorAutor, liaEstaAtendendo } from '../quemEnviou';

interface Props {
  tenantId: string | null;
  leadId: string | null;
  messages: WhatsappMessage[];
}

interface Assumida {
  assumido_por: string;
  assumido_em: string;
}

async function carregarAssumida(tenantId: string, leadId: string): Promise<Assumida | null> {
  const { data, error } = await supabase
    .from('conversa_assumida')
    .select('assumido_por, assumido_em')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .is('devolvido_em', null)
    .maybeSingle();
  if (error) throw error;
  return (data as Assumida) ?? null;
}

export function AssumirConversa({ tenantId, leadId, messages }: Props) {
  const qc = useQueryClient();

  const assumida = useQuery({
    queryKey: ['lia-conversa-assumida', tenantId, leadId],
    queryFn: () => carregarAssumida(tenantId!, leadId!),
    enabled: !!tenantId && !!leadId,
  });

  const alternar = useMutation({
    mutationFn: async (assumir: boolean) => {
      const { data, error } = await supabase.rpc('lia_assumir_conversa', {
        p_tenant_id: tenantId, p_lead_id: leadId, p_assumir: assumir,
      });
      if (error) throw error;
      // `null` = o banco recusou. Silenciar viraria um botão que parece
      // funcionar e não faz nada — que é como a permissão some sem ninguém ver.
      if (!data) throw new Error('Você não tem acesso a esta imobiliária.');
      return data;
    },
    onSuccess: (_d, assumir) => {
      qc.invalidateQueries({ queryKey: ['lia-conversa-assumida', tenantId, leadId] });
      toast.success(assumir
        ? 'Conversa assumida — a LIA para de responder este lead'
        : 'Conversa devolvida para a LIA');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não deu para assumir a conversa'),
  });

  // Sem lead vinculado não há o que assumir: o recado da LIA é por lead, e uma
  // conversa solta não tem onde ser guardada.
  if (!leadId || !tenantId) return null;

  const foiAssumida = !!assumida.data;
  const atendendo = liaEstaAtendendo(messages, foiAssumida);
  const conta = contarPorAutor(messages);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {atendendo && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
          <Bot className="h-3 w-3" /> LIA atendendo
        </span>
      )}
      {foiAssumida && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
          <Hand className="h-3 w-3" /> Conversa assumida
        </span>
      )}
      {conta.nao_registrado > 0 && (
        <span
          className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          title="Enviadas sem registrar quem escreveu. A etiqueta só aparece no que foi marcado na origem."
        >
          {conta.nao_registrado} sem autor
        </span>
      )}

      <Button
        size="sm"
        variant={foiAssumida ? 'outline' : 'secondary'}
        disabled={alternar.isPending || assumida.isLoading}
        onClick={() => alternar.mutate(!foiAssumida)}
      >
        {alternar.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
        {foiAssumida ? 'Devolver para a LIA' : 'Assumir conversa'}
      </Button>
    </div>
  );
}
