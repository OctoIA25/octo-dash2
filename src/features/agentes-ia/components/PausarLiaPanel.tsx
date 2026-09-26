/**
 * Pausar a LIA — o kill switch do P2.8.
 *
 * A tabela `tenant_agente_config` existia desde 21/09 e NINGUÉM a lia ou
 * escrevia: sem um lugar para desligar, o kill switch nunca poderia ser usado.
 * A equipe da LIA já lê a tabela a cada turno; o que faltava era esta chave.
 *
 * LINHA AUSENTE = ATIVA, e é de propósito: a tabela está vazia em todas as
 * casas, e fail-closed aqui calaria a LIA de todo mundo no primeiro deploy.
 * Desligar tem de ser um ato de alguém.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuthContext } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/** O agente que a LIA consulta. Combinado com a equipe deles em 26/09. */
const AGENTE = 'lia';

/**
 * O texto veio da equipe da LIA, e é o comportamento que eles implementaram.
 * Tela e comportamento saem da mesma frase de propósito: foi a falta disso
 * que deixou o interruptor da Meta sem dizer o que fazia.
 */
const O_QUE_PAUSAR_FAZ =
  'Com a LIA pausada, as mensagens dos leads ficam na fila e são respondidas ' +
  'quando ela for religada. Nenhuma mensagem é perdida.';

export function PausarLiaPanel() {
  const { tenantId, isOwner } = useAuthContext();
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const casaValida = !!tenantId && tenantId !== 'owner';

  const config = useQuery({
    queryKey: ['agente-config', tenantId, AGENTE],
    enabled: casaValida,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_agente_config')
        .select('ativo, motivo, alterado_em')
        .eq('tenant_id', tenantId)
        .eq('agente', AGENTE)
        .maybeSingle();
      if (error) throw error;
      // Sem linha = ativa. Ver o cabeçalho.
      return data ?? { ativo: true, motivo: null, alterado_em: null };
    },
  });

  const virar = useMutation({
    mutationFn: async (ativo: boolean) => {
      const { data: sessao } = await supabase.auth.getUser();
      const { error } = await supabase.from('tenant_agente_config').upsert(
        {
          tenant_id: tenantId,
          agente: AGENTE,
          ativo,
          // O porquê só faz sentido quando se desliga; religar limpa.
          motivo: ativo ? null : motivo.trim() || null,
          alterado_por: sessao?.user?.id ?? null,
          alterado_em: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,agente' },
      );
      if (error) throw error;
      return ativo;
    },
    onSuccess: (ativo) => {
      setMotivo('');
      qc.invalidateQueries({ queryKey: ['agente-config', tenantId, AGENTE] });
      toast.success(ativo ? 'LIA religada.' : 'LIA pausada.');
    },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível mudar o estado da LIA'),
  });

  if (!casaValida) return null;

  if (config.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando o estado da LIA…
      </div>
    );
  }

  /*
   * Falha de leitura NÃO vira "está ativa". A tela diz que não sabe — quem
   * lê "ativa" quando a resposta é "não consegui perguntar" toma decisão
   * sobre um estado inventado.
   */
  if (config.isError) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Não foi possível ler se a LIA está ativa — isto <strong>não</strong> quer dizer que
          ela esteja pausada. Recarregue a página.
        </span>
      </div>
    );
  }

  const ativa = config.data?.ativo !== false;

  /*
   * QUEM PODE PAUSAR É SÓ O DONO DA PLATAFORMA.
   *
   * A política de escrita de `tenant_agente_config` é `is_platform_owner()`,
   * e não a do bolsão (admin/líder/dono). Descobri isto pelo 403 ao testar
   * com um admin de imobiliária.
   *
   * Não abri a política por conta própria: pausar a LIA é parar um serviço
   * que a casa paga, e quem pode fazer isso é decisão de negócio, não minha.
   * O que a tela NÃO pode é oferecer um botão que devolve 403 — então ela
   * mostra o estado para todos e os botões só para quem consegue mudá-lo.
   */
  const podeMudar = isOwner;

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Pausar a LIA</h3>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            ativa
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400'
          }`}
        >
          {ativa ? 'Ativa' : 'Pausada'}
        </span>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">{O_QUE_PAUSAR_FAZ}</p>

      {!ativa && config.data?.motivo && (
        <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs">
          <strong>Motivo:</strong> {config.data.motivo}
        </p>
      )}

      {!podeMudar && (
        <p className="text-xs text-muted-foreground">
          Só a Octo pode pausar ou religar a LIA. Fale com a gente se precisar.
        </p>
      )}

      {podeMudar && ativa ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por que está pausando? (opcional)"
            className="h-9 min-w-[220px] flex-1 rounded-md border bg-background px-3 text-sm"
            maxLength={200}
          />
          <button
            type="button"
            onClick={() => virar.mutate(false)}
            disabled={virar.isPending}
            className="h-9 rounded-md bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {virar.isPending ? 'Pausando…' : 'Pausar a LIA'}
          </button>
        </div>
      ) : podeMudar ? (
        <button
          type="button"
          onClick={() => virar.mutate(true)}
          disabled={virar.isPending}
          className="h-9 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {virar.isPending ? 'Religando…' : 'Religar a LIA'}
        </button>
      ) : null}
    </div>
  );
}
