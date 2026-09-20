/**
 * Configuração do plantão da LIA (P2.4): quem recebe, e quanto tempo pode esperar.
 *
 * O CAMPO NÃO VEM SOZINHO. Ao lado dele a tela mostra o que aquela régua teria
 * feito com o plantão real da imobiliária nos últimos 90 dias. O padrão do plano
 * é 30 minutos; medido em produção, só 31,6% das 1.498 respostas vieram nesse
 * prazo (mediana 2h43). Sem esse número na frente, o gestor escolhe a régua no
 * escuro e a tela de Aguardando nasce vermelha sem ele entender por quê.
 *
 * Quem RECEBE é valor consultado pela LIA, não regra executada aqui — mesma
 * divisão do P1.1: a LIA distribui, o Octo responde.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import {
  CONFIG_PADRAO, DESTINOS, carregarConfig, salvarConfig, simularRegua,
  type ConfigDoPlantao, type DestinoDoPlantao,
} from '../services/plantaoService';

interface Props {
  tenantId?: string | null;
  isAdmin: boolean;
}

interface Membro {
  user_id: string;
  name?: string;
  email?: string;
}

export function PlantaoConfigPanel({ tenantId, isAdmin }: Props) {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<ConfigDoPlantao>(CONFIG_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** A régua só é medida quando o gestor para de digitar. */
  const [minutosSimulados, setMinutosSimulados] = useState(CONFIG_PADRAO.espera_maxima_minutos);

  useEffect(() => {
    if (!tenantId || tenantId === 'owner') {
      setCarregando(false);
      return;
    }
    let cancelado = false;
    carregarConfig(tenantId)
      .then((c) => {
        if (cancelado) return;
        setCfg(c);
        setMinutosSimulados(c.espera_maxima_minutos);
      })
      .catch((e) => !cancelado && setErro((e as Error).message))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [tenantId]);

  useEffect(() => {
    const id = setTimeout(() => setMinutosSimulados(cfg.espera_maxima_minutos), 500);
    return () => clearTimeout(id);
  }, [cfg.espera_maxima_minutos]);

  const { data: regua, isFetching: medindo } = useQuery({
    queryKey: ['plantao-regua', tenantId, minutosSimulados],
    queryFn: () => simularRegua(tenantId!, minutosSimulados),
    enabled: !!tenantId && tenantId !== 'owner' && minutosSimulados > 0,
    staleTime: 5 * 60_000,
  });

  const { data: membros } = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_tenant_members', { p_tenant_id: tenantId });
      if (error) throw error;
      return (data ?? []) as Membro[];
    },
    enabled: !!tenantId && tenantId !== 'owner' && cfg.destino === 'plantonista',
  });

  const gravar = async () => {
    if (!tenantId) return;
    setSalvando(true);
    try {
      await salvarConfig(tenantId, cfg);
      toast({ title: 'Plantão configurado' });
    } catch (e) {
      toast({ title: 'Não deu para salvar', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </p>
    );
  }
  if (erro) return <p className="text-sm text-rose-600">Não deu para ler a configuração: {erro}</p>;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Espera máxima</label>
        <div className="mt-1 flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={10080}
            disabled={!isAdmin}
            className="w-28"
            value={cfg.espera_maxima_minutos}
            onChange={(e) =>
              setCfg({ ...cfg, espera_maxima_minutos: Math.max(1, Number(e.target.value) || 1) })
            }
          />
          <span className="text-sm text-muted-foreground">minutos</span>
        </div>
        <ReguaMedida medindo={medindo} regua={regua ?? null} />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Quem recebe a pergunta</legend>
        <div className="mt-1 space-y-1">
          {DESTINOS.map((d) => (
            <label key={d.valor} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                className="mt-1"
                disabled={!isAdmin}
                checked={cfg.destino === d.valor}
                onChange={() => setCfg({ ...cfg, destino: d.valor as DestinoDoPlantao })}
              />
              <span>
                {d.rotulo}
                <span className="block text-xs text-muted-foreground">{d.ajuda}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {cfg.destino === 'plantonista' && (
        <label className="block text-sm">
          Plantonista
          <select
            disabled={!isAdmin}
            className="mt-1 block w-full rounded-md border bg-background p-2 text-sm"
            value={cfg.plantonista_id ?? ''}
            onChange={(e) => setCfg({ ...cfg, plantonista_id: e.target.value || null })}
          >
            <option value="">Escolha alguém</option>
            {(membros ?? []).map((m) => (
              /* Nome quando existe, e-mail quando não — UUID nunca. */
              <option key={m.user_id} value={m.user_id}>
                {m.name || m.email || m.user_id.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="text-xs text-muted-foreground">
        Quem envia a pergunta ao corretor é a LIA. Esta configuração é o que ela consulta para
        decidir — mudar aqui só vale depois que a LIA estiver lendo.
      </p>

      {isAdmin && (
        <button
          onClick={gravar}
          disabled={salvando || (cfg.destino === 'plantonista' && !cfg.plantonista_id)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar
        </button>
      )}
    </div>
  );
}

/**
 * O que a régua escolhida teria feito. Sem amostra diz que não sabe — nunca
 * "0% cumpriram", que leria como equipe ruim onde houve ausência de dado.
 */
function ReguaMedida({
  medindo,
  regua,
}: {
  medindo: boolean;
  regua: Awaited<ReturnType<typeof simularRegua>>;
}) {
  if (medindo) {
    return <p className="mt-1 text-xs text-muted-foreground">Medindo no seu histórico…</p>;
  }
  if (!regua) return null;
  if (regua.respondidas === 0) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        Sem plantão respondido nos últimos {regua.dias} dias — não há histórico para medir esta régua.
      </p>
    );
  }
  const fora = regua.respondidas - regua.dentro_do_prazo;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Nos últimos {regua.dias} dias, {regua.pct_dentro}% das {regua.respondidas} respostas vieram
      dentro de {regua.minutos} min
      {fora > 0 && ` — ${fora} teriam estourado`}. Sua mediana é de {regua.mediana_minutos} min.
    </p>
  );
}
