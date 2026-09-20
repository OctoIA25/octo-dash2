/**
 * As chaves de pré-requisito por etapa, em Configurações (P1.6).
 *
 * O PONTO DESTA TELA não são os interruptores: é o número ao lado deles.
 * Cada chave mostra quantos leads REPROVARIAM hoje se fosse ligada — com os
 * dados que a base tem agora, não em tese. Ligar uma chave às cegas foi como
 * meia dúzia de contadores desta Dash passaram meses mentindo.
 *
 * Tudo nasce desligado, e falta de pré-requisito AVISA sem bloquear: o card
 * anda, o corretor lê o que faltou e o extrato do lead registra.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';
import { CHAVES_PADRAO, type ChavesDeEtapa } from '../utils/preRequisitos';
import { buscarChavesDeEtapa, salvarChavesDeEtapa } from '../services/etapaConfigService';

interface Props {
  tenantId?: string | null;
  isAdmin?: boolean;
}

/** Quantos leads de cada etapa hoje não teriam o que a chave exige. */
interface Previa {
  visita: { total: number; reprovariam: number };
  proposta: { total: number; reprovariam: number };
  assinada: { total: number; reprovariam: number };
}

const ETAPAS_DE_PROPOSTA = ['Proposta Criada', 'Proposta Enviada', 'Proposta Assinada'];

/**
 * A prévia é uma CONTAGEM, não a regra rodando lead a lead.
 *
 * Rodar a regra de verdade em 1.700 leads pediria uma consulta por lead. Aqui
 * basta a ordem de grandeza para o gestor decidir, e por isso a tela diz
 * "reprovariam hoje" — não promete o número exato de amanhã.
 *
 * FALHA DE LEITURA NÃO VIRA NÚMERO. A primeira versão disto mandava os
 * centenas de ids numa URL só, a consulta falhava por tamanho, e o código lia
 * a resposta vazia como "nenhum lead tem o dado" — a tela anunciava
 * "328 de 328 reprovariam" quando na verdade não tinha conferido nada.
 * É a mesma família de defeito que fez "Visitas" mostrar zero por meses.
 * Agora os ids vão em lotes, e qualquer erro sobe.
 */

/** Ids por consulta. Centenas de uma vez estouram o tamanho da URL. */
const LOTE = 150;

async function emLotes<T>(ids: string[], fn: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const saida: T[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    saida.push(...(await fn(ids.slice(i, i + LOTE))));
  }
  return saida;
}

async function carregarPrevia(tenantId: string): Promise<Previa> {
  const emEtapa = async (status: string[]) => {
    const { data, error } = await supabase
      .from('leads')
      .select('id')
      .eq('tenant_id', tenantId)
      .is('archived_at', null)
      .in('status', status);
    if (error) throw error;
    return (data ?? []).map((l) => l.id as string);
  };

  const [idsVisita, idsProposta, idsAssinada] = await Promise.all([
    emEtapa(['Visita Agendada']),
    emEtapa(ETAPAS_DE_PROPOSTA),
    emEtapa(['Proposta Assinada']),
  ]);

  const comVisitaNaAgenda = async (ids: string[]) => {
    if (ids.length === 0) return 0;
    const linhas = await emLotes(ids, async (lote) => {
      const { data, error } = await supabase
        .from('agenda_eventos')
        .select('lead_uuid')
        .eq('tenant_id', tenantId)
        .eq('tipo', 'visita_agendada')
        .not('data', 'is', null)
        .not('imovel_ref', 'is', null)
        .in('lead_uuid', lote);
      if (error) throw error;
      return (data ?? []) as Array<{ lead_uuid: string }>;
    });
    return new Set(linhas.map((r) => r.lead_uuid)).size;
  };

  const comPropostaCompleta = async (ids: string[]) => {
    if (ids.length === 0) return 0;
    const linhas = await emLotes(ids, async (lote) => {
      const { data, error } = await supabase
        .from('proposals')
        .select('lead_id, value, property_reference, payment_method')
        .eq('tenant_id', tenantId)
        .in('lead_id', lote);
      if (error) throw error;
      return (data ?? []) as Array<{
        lead_id: string; value: number | null;
        property_reference: string | null; payment_method: string | null;
      }>;
    });
    return linhas.filter((p) => {
      const pgto = String(p.payment_method ?? '').trim().toLowerCase();
      return Number(p.value) > 0
        && String(p.property_reference ?? '').trim() !== ''
        && pgto !== '' && pgto !== 'compra e venda';
    }).length;
  };

  const [okVisita, okProposta] = await Promise.all([
    comVisitaNaAgenda(idsVisita),
    comPropostaCompleta(idsProposta),
  ]);

  return {
    visita: { total: idsVisita.length, reprovariam: idsVisita.length - okVisita },
    proposta: { total: idsProposta.length, reprovariam: idsProposta.length - okProposta },
    // O anexo mora no Storage, e contá-lo por lead seria uma chamada por lead.
    // A tela diz o total e é honesta sobre não ter medido.
    assinada: { total: idsAssinada.length, reprovariam: -1 },
  };
}

const Aviso = ({ p }: { p: { total: number; reprovariam: number } }) => {
  if (p.total === 0) {
    return <span className="text-[11.5px] text-text-secondary">nenhum lead nesta etapa hoje</span>;
  }
  if (p.reprovariam < 0) {
    return (
      <span className="text-[11.5px] text-text-secondary">
        {p.total} lead(s) nesta etapa — o anexo só dá para conferir ao mover
      </span>
    );
  }
  if (p.reprovariam === 0) {
    return <span className="text-[11.5px] text-emerald-600 dark:text-emerald-400">
      nenhum dos {p.total} lead(s) nesta etapa reprovaria
    </span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-3 w-3" />
      {p.reprovariam} de {p.total} lead(s) nesta etapa reprovariam hoje
    </span>
  );
};

/**
 * O que a tela diz quando não conseguiu contar.
 *
 * Nunca um número: "0 reprovariam" e "não consegui conferir" se parecem na
 * tela e significam o oposto, e é assim que um painel quebrado passa por
 * painel saudável.
 */
const NaoConferiu = () => (
  <span className="text-[11.5px] text-text-secondary italic">
    não foi possível conferir quantos leads reprovariam agora
  </span>
);

const Chave = ({ titulo, descricao, ligado, onToggle, disabled, children }: {
  titulo: string; descricao: string; ligado: boolean;
  onToggle: () => void; disabled?: boolean; children?: React.ReactNode;
}) => (
  <div className="flex items-start justify-between gap-4 border-b border-border py-3 last:border-0">
    <div className="min-w-0">
      <p className="text-[13.5px] font-medium">{titulo}</p>
      <p className="mt-0.5 text-[12px] text-text-secondary">{descricao}</p>
      <div className="mt-1">{children}</div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={titulo}
      disabled={disabled}
      onClick={onToggle}
      className={`mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        ligado ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-white transition-transform ${
          ligado ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  </div>
);

export function EtapaConfigPanel({ tenantId, isAdmin }: Props) {
  const { toast } = useToast();
  const [chaves, setChaves] = useState<ChavesDeEtapa>(CHAVES_PADRAO);
  const [previa, setPrevia] = useState<Previa | null>(null);
  // Prévia que falhou NÃO é prévia zerada: a tela diz que não conferiu.
  const [previaFalhou, setPreviaFalhou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!tenantId || tenantId === 'owner') { setCarregando(false); return; }
    let cancelado = false;
    setCarregando(true);
    Promise.all([
      buscarChavesDeEtapa(tenantId),
      carregarPrevia(tenantId).catch(() => null),
    ])
      .then(([c, p]) => {
        if (cancelado) return;
        setChaves(c);
        setPrevia(p);
        setPreviaFalhou(p === null);
      })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [tenantId]);

  const salvar = async () => {
    if (!tenantId) return;
    setSalvando(true);
    try {
      await salvarChavesDeEtapa(tenantId, chaves);
      toast({ title: 'Pré-requisitos salvos', className: 'bg-green-500/10 border-green-500/50' });
    } catch (e) {
      toast({
        title: 'Não foi possível salvar',
        description: (e as { message?: string })?.message ?? 'erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSalvando(false);
    }
  };

  if (!tenantId || tenantId === 'owner') {
    return <p className="p-6 text-sm text-text-secondary">Selecione uma imobiliária.</p>;
  }

  if (carregando) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-text-secondary">
        <Loader2 className="h-4 w-4 animate-spin" /> carregando…
      </div>
    );
  }

  const trava = !isAdmin || salvando;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <p className="text-[13px] text-text-secondary">
          O que cada etapa exige antes de receber um lead. Faltando alguma coisa, o card{' '}
          <strong>anda mesmo assim</strong> — o corretor vê o que faltou e fica registrado no
          histórico do lead. Nada aqui bloqueia ninguém.
        </p>

        <div className="mt-4">
          <Chave
            titulo="Visita Agendada exige data e imóvel"
            descricao="Tem de haver uma visita agendada na agenda do lead, com data e com o imóvel preenchido."
            ligado={chaves.exigir_visita_agendada}
            disabled={trava}
            onToggle={() => setChaves((c) => ({ ...c, exigir_visita_agendada: !c.exigir_visita_agendada }))}
          >
            {previa ? <Aviso p={previa.visita} /> : previaFalhou ? <NaoConferiu /> : null}
          </Chave>

          <Chave
            titulo="Proposta exige valor, código e forma de pagamento"
            descricao="Vale para Proposta Criada, Enviada e Assinada. “Compra e venda” não conta como forma de pagamento: é o que o sistema preenche sozinho."
            ligado={chaves.exigir_dados_da_proposta}
            disabled={trava}
            onToggle={() => setChaves((c) => ({ ...c, exigir_dados_da_proposta: !c.exigir_dados_da_proposta }))}
          >
            {previa ? <Aviso p={previa.proposta} /> : previaFalhou ? <NaoConferiu /> : null}
          </Chave>

          <Chave
            titulo="Proposta Assinada exige documento anexado e relato"
            descricao="Um documento anexado ao lead e uma observação com o mínimo de caracteres abaixo."
            ligado={chaves.exigir_proposta_assinada}
            disabled={trava}
            onToggle={() => setChaves((c) => ({ ...c, exigir_proposta_assinada: !c.exigir_proposta_assinada }))}
          >
            {previa ? <Aviso p={previa.assinada} /> : previaFalhou ? <NaoConferiu /> : null}
          </Chave>

          <div className="flex items-center justify-between gap-4 border-b border-border py-3">
            <div>
              <label htmlFor="relato-minimo" className="text-[13.5px] font-medium">
                Relato mínimo
              </label>
              <p className="mt-0.5 text-[12px] text-text-secondary">
                Quantos caracteres a observação precisa ter. Zero desliga só essa exigência.
              </p>
            </div>
            <input
              id="relato-minimo"
              type="number"
              min={0}
              max={2000}
              disabled={trava}
              value={chaves.relato_minimo_caracteres}
              onChange={(e) =>
                setChaves((c) => ({
                  ...c,
                  relato_minimo_caracteres: Math.max(0, Math.min(2000, Number(e.target.value) || 0)),
                }))
              }
              className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-50"
            />
          </div>

          <Chave
            titulo="Carimbar a hora da assinatura"
            descricao="Ao mover para Proposta Assinada, grava a hora na proposta. Nunca regrava: se já houver hora, ela é mantida."
            ligado={chaves.registrar_hora_da_assinatura}
            disabled={trava}
            onToggle={() => setChaves((c) => ({ ...c, registrar_hora_da_assinatura: !c.registrar_hora_da_assinatura }))}
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={salvar}
            disabled={trava}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
          {!isAdmin && (
            <span className="text-[12px] text-text-secondary">
              Só quem administra a imobiliária muda estas chaves.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
