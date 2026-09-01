/**
 * Comissionamento — calculadora das Regras de Comissão Lotus v1.5.
 * Rota: /metricas/comissionamento (área Comercial).
 *
 * A tela é só entrada e leitura: toda a regra vive em `commissionRules.ts`.
 * Quando o motor bloqueia (L003/L007), nenhum valor é exibido — o caso vai
 * para decisão do broker, e mostrar um número "provisório" só induziria erro.
 *
 * ponytail: nada é persistido. O audit log do §7 entra quando o cálculo estiver
 * amarrado a uma proposta real, não a um formulário avulso.
 */

import { useMemo, useState } from 'react';
import { AlertTriangle, Calculator } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useCaptadores, type Captador } from '@/features/imoveis/hooks/useCaptadores';
import {
  NIVEIS,
  calcularComissao,
  totaisPorParte,
  type Corretor,
  type Entrada,
  type IndicacaoTipo,
  type Nivel,
  type Operacao,
  type Papel,
} from '../commissionRules';

const NIVEL_IDS = Object.keys(NIVEIS) as Nivel[];

const parseMoeda = (value: string) => {
  const parsed = Number(value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatMoeda = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(value || 0);

const PAPEL_LABEL: Record<Papel, string> = {
  corretor: 'Corretor',
  lider: 'Líder Direto',
  lotus: 'Casa',
  parceiro: 'Parceiro externo',
  indicador: 'Indicador',
};

/** Rascunho de um corretor no formulário. Nome vazio = ponta sem corretor. */
interface CorretorDraft {
  nome: string;
  nivel: Nivel;
  liderNome: string;
  liderNivel: Nivel;
}

interface OperacaoDraft {
  tipo: 'revenda' | 'lancamento';
  comissaoTotal: string;
  captacao: CorretorDraft;
  intermediacao: CorretorDraft;
  temParceria: boolean;
  parceiroNome: string;
  parceiroTipo: 'imobiliaria' | 'corretor_autonomo';
  contratoFormal: boolean;
  pontaDaLotus: 'captacao' | 'intermediacao';
  temIndicacao: boolean;
  indicadorNome: string;
  indicacaoTipo: IndicacaoTipo;
}

const corretorVazio = (): CorretorDraft => ({ nome: '', nivel: 'junior', liderNome: '', liderNivel: 'coordenador' });

const operacaoVazia = (): OperacaoDraft => ({
  tipo: 'revenda',
  comissaoTotal: '',
  captacao: corretorVazio(),
  intermediacao: corretorVazio(),
  temParceria: false,
  parceiroNome: '',
  parceiroTipo: 'imobiliaria',
  contratoFormal: true,
  pontaDaLotus: 'captacao',
  temIndicacao: false,
  indicadorNome: '',
  indicacaoTipo: 'cliente_comprador',
});

const toCorretor = (draft: CorretorDraft): Corretor | null => {
  const nome = draft.nome.trim();
  if (!nome) return null;
  const liderNome = draft.liderNome.trim();
  return {
    nome,
    nivel: draft.nivel,
    liderDireto: liderNome ? { nome: liderNome, nivel: draft.liderNivel } : null,
  };
};

const toOperacao = (draft: OperacaoDraft): Operacao => ({
  tipo: draft.tipo,
  comissaoTotal: parseMoeda(draft.comissaoTotal),
  captacao: draft.tipo === 'revenda' ? toCorretor(draft.captacao) : null,
  intermediacao: toCorretor(draft.intermediacao),
  parceiro: draft.temParceria
    ? { tipo: draft.parceiroTipo, nome: draft.parceiroNome.trim() || undefined, contratoFormal: draft.contratoFormal }
    : null,
  pontaDaLotus: draft.pontaDaLotus,
  indicacao:
    draft.temIndicacao && draft.indicadorNome.trim()
      ? {
          indicador: draft.indicadorNome.trim(),
          // Lançamento só tem Intermediação — indicação ali é sempre de comprador.
          tipo: draft.tipo === 'lancamento' ? 'cliente_comprador' : draft.indicacaoTipo,
        }
      : null,
});

const CARD = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4';

const SEM_PESSOA = '__sem__';

/**
 * Corretor / Líder Direto vêm da equipe do tenant (mesma fonte do captador de
 * imóveis: RPC get_tenant_members + nome de tenant_brokers). React Query
 * deduplica — as 4 instâncias do formulário compartilham uma busca só.
 *
 * Ao escolher alguém, o nível configurado em Gestão de Equipe (permissions.
 * nivel_comissao) vem junto e pré-preenche o select de nível — que segue
 * editável, porque o §3.7 usa o nível vigente na DATA DO FECHAMENTO.
 *
 * ponytail: cai para texto livre quando a lista vem vazia (sem tenant, RPC
 * fora do ar) — dropdown sem opção travaria a calculadora.
 */
function PessoaSelect({
  value,
  onChange,
  vazioLabel,
}: {
  value: string;
  onChange: (nome: string, membro?: Captador) => void;
  vazioLabel: string;
}) {
  const { user } = useAuth();
  const { data: membros = [] } = useCaptadores(user?.tenantId);

  const nomes = useMemo(() => {
    const lista = membros.map((m) => m.nome).filter(Boolean);
    // Nome já escolhido que sumiu da equipe continua selecionável.
    if (value && !lista.includes(value)) lista.push(value);
    return Array.from(new Set(lista));
  }, [membros, value]);

  if (nomes.length === 0) {
    return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={vazioLabel} />;
  }

  const selecionar = (nome: string) => onChange(nome, membros.find((m) => m.nome === nome));

  return (
    <Select value={value || SEM_PESSOA} onValueChange={(v) => selecionar(v === SEM_PESSOA ? '' : v)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={SEM_PESSOA}>{vazioLabel}</SelectItem>
        {nomes.map((nome) => (
          <SelectItem key={nome} value={nome}>{nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CorretorFields({
  titulo,
  value,
  onChange,
}: {
  titulo: string;
  value: CorretorDraft;
  onChange: (patch: Partial<CorretorDraft>) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">{titulo}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label className="text-[11.5px] text-slate-500">Corretor</Label>
          <PessoaSelect
            value={value.nome}
            onChange={(nome, membro) =>
              onChange({
                nome,
                ...(membro?.nivel ? { nivel: membro.nivel } : {}),
                // Líder Direto da Gestão de Equipe vem junto (segue editável).
                ...(membro
                  ? {
                      liderNome: membro.lider?.nome ?? '',
                      ...(membro.lider?.nivel ? { liderNivel: membro.lider.nivel } : {}),
                    }
                  : {}),
              })
            }
            vazioLabel="Ponta da casa (sem corretor)"
          />
        </div>
        <div>
          <Label className="text-[11.5px] text-slate-500">Nível no fechamento</Label>
          <Select value={value.nivel} onValueChange={(v) => onChange({ nivel: v as Nivel })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {NIVEL_IDS.map((id) => (
                <SelectItem key={id} value={id}>{`${NIVEIS[id].label} — ${NIVEIS[id].percentual}%`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11.5px] text-slate-500">Líder Direto</Label>
          <PessoaSelect
            value={value.liderNome}
            onChange={(liderNome, membro) => onChange({ liderNome, ...(membro?.nivel ? { liderNivel: membro.nivel } : {}) })}
            vazioLabel="Sem líder (o próprio é o líder)"
          />
        </div>
        <div>
          <Label className="text-[11.5px] text-slate-500">Nível do Líder Direto</Label>
          <Select value={value.liderNivel} onValueChange={(v) => onChange({ liderNivel: v as Nivel })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {NIVEL_IDS.map((id) => (
                <SelectItem key={id} value={id}>{`${NIVEIS[id].label} — ${NIVEIS[id].percentual}%`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function OperacaoForm({
  titulo,
  value,
  onChange,
}: {
  titulo: string;
  value: OperacaoDraft;
  onChange: (patch: Partial<OperacaoDraft>) => void;
}) {
  // Em revenda com parceria cada lado leva uma ponta inteira: a ponta do
  // parceiro não tem corretor da casa, então some do formulário em vez de
  // aceitar um nome que o cálculo ignoraria.
  const pontaDoParceiro = value.tipo === 'revenda' && value.temParceria ? (value.pontaDaLotus === 'captacao' ? 'intermediacao' : 'captacao') : null;

  return (
    <div className={`${CARD} space-y-4`}>
      <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100">{titulo}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <Label className="text-[11.5px] text-slate-500">Tipo de operação</Label>
          <Select value={value.tipo} onValueChange={(v) => onChange({ tipo: v as OperacaoDraft['tipo'] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="revenda">Revenda / Terceiros</SelectItem>
              <SelectItem value="lancamento">Lançamento</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[11.5px] text-slate-500">Comissão total (R$)</Label>
          <Input
            inputMode="decimal"
            value={value.comissaoTotal}
            onChange={(e) => onChange({ comissaoTotal: e.target.value })}
            placeholder="10.000,00"
          />
        </div>
      </div>

      {value.tipo !== 'revenda' && (
        <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
          Lançamento não tem ponta de captação — ela é direta entre construtora e casa.
        </p>
      )}

      {value.tipo === 'revenda' && pontaDoParceiro !== 'captacao' && (
        <CorretorFields
          titulo="Ponta de Captação (50%)"
          value={value.captacao}
          onChange={(patch) => onChange({ captacao: { ...value.captacao, ...patch } })}
        />
      )}

      {pontaDoParceiro !== 'intermediacao' && (
        <CorretorFields
          titulo={value.tipo === 'revenda' ? 'Ponta de Intermediação (50%)' : 'Ponta de Intermediação (100%)'}
          value={value.intermediacao}
          onChange={(patch) => onChange({ intermediacao: { ...value.intermediacao, ...patch } })}
        />
      )}

      {pontaDoParceiro && (
        <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
          A ponta de {pontaDoParceiro === 'captacao' ? 'Captação' : 'Intermediação'} ficou inteira com o parceiro externo.
        </p>
      )}

      <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch checked={value.temIndicacao} onCheckedChange={(v) => onChange({ temIndicacao: v })} />
          <span className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">Houve indicação entre corretores</span>
        </label>

        {value.temIndicacao && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-[11.5px] text-slate-500">Indicador</Label>
                <PessoaSelect
                  value={value.indicadorNome}
                  onChange={(indicadorNome) => onChange({ indicadorNome })}
                  vazioLabel="Quem indicou o cliente"
                />
              </div>
              {value.tipo === 'revenda' && (
                <div>
                  <Label className="text-[11.5px] text-slate-500">O que foi indicado</Label>
                  <Select value={value.indicacaoTipo} onValueChange={(v) => onChange({ indicacaoTipo: v as IndicacaoTipo })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cliente_comprador">Cliente comprador — ponta de Intermediação</SelectItem>
                      <SelectItem value="cliente_vendedor">Cliente vendedor — ponta de Captação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
              O indicador recebe 10% da ponta indicada, descontados do corretor que atendeu. Líder Direto e casa não são afetados.
            </p>
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <Switch checked={value.temParceria} onCheckedChange={(v) => onChange({ temParceria: v })} />
          <span className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">Parceria com outra imobiliária / corretor</span>
        </label>

        {value.temParceria && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[11.5px] text-slate-500">Parceiro</Label>
              <Input value={value.parceiroNome} onChange={(e) => onChange({ parceiroNome: e.target.value })} placeholder="Parceiro Externo" />
            </div>
            <div>
              <Label className="text-[11.5px] text-slate-500">Tipo do parceiro</Label>
              <Select value={value.parceiroTipo} onValueChange={(v) => onChange({ parceiroTipo: v as OperacaoDraft['parceiroTipo'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="imobiliaria">Imobiliária (PJ)</SelectItem>
                  <SelectItem value="corretor_autonomo">Corretor autônomo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {value.tipo === 'revenda' && (
              <div>
                <Label className="text-[11.5px] text-slate-500">Ponta que ficou com a casa</Label>
                <Select value={value.pontaDaLotus} onValueChange={(v) => onChange({ pontaDaLotus: v as OperacaoDraft['pontaDaLotus'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="captacao">Captação</SelectItem>
                    <SelectItem value="intermediacao">Intermediação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
              <Switch checked={value.contratoFormal} onCheckedChange={(v) => onChange({ contratoFormal: v })} />
              <span className="text-[12.5px] text-slate-600 dark:text-slate-300">Contrato formal assinado antes da operação</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

export function ComissionamentoPage() {
  const [ehPermuta, setEhPermuta] = useState(false);
  const [temTorna, setTemTorna] = useState(false);
  const [opA, setOpA] = useState<OperacaoDraft>(operacaoVazia);
  const [opB, setOpB] = useState<OperacaoDraft>(operacaoVazia);

  const entrada: Entrada = useMemo(
    () =>
      ehPermuta
        ? { tipo: 'permuta', temDiferencaMonetaria: temTorna, imovelA: toOperacao(opA), imovelB: toOperacao(opB) }
        : toOperacao(opA),
    [ehPermuta, temTorna, opA, opB],
  );

  const resultado = useMemo(() => calcularComissao(entrada), [entrada]);
  const consolidado = useMemo(() => totaisPorParte(resultado), [resultado]);
  const semValor = resultado.total <= 0;

  return (
    <div className="px-6 py-5">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-start gap-3 mb-5">
          <Calculator className="h-5 w-5 text-slate-400 shrink-0 mt-1" strokeWidth={2} />
          <div>
            <h1 className="text-[22px] font-bold text-slate-900 dark:text-slate-100 leading-tight tracking-tight">
              Comissionamento
            </h1>
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
              Divisão da comissão por ponta, nível de carreira e Líder Direto — Regras de Comissão v1.5.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
          <div className="space-y-4">
            <div className={`${CARD} flex flex-wrap items-center gap-x-6 gap-y-3`}>
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={ehPermuta} onCheckedChange={setEhPermuta} />
                <span className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">Permuta (dois imóveis)</span>
              </label>
              {ehPermuta && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={temTorna} onCheckedChange={setTemTorna} />
                  <span className="text-[12.5px] text-slate-600 dark:text-slate-300">Há diferença monetária (torna)</span>
                </label>
              )}
            </div>

            <OperacaoForm
              titulo={ehPermuta ? 'Imóvel A' : 'Operação'}
              value={opA}
              onChange={(patch) => setOpA((c) => ({ ...c, ...patch }))}
            />
            {ehPermuta && (
              <OperacaoForm titulo="Imóvel B" value={opB} onChange={(patch) => setOpB((c) => ({ ...c, ...patch }))} />
            )}
          </div>

          <div className={`${CARD} space-y-4 lg:sticky lg:top-4`}>
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100">Resultado</p>
              <span className="text-[11.5px] text-slate-400">{resultado.cenario}</span>
            </div>

            {resultado.bloqueio ? (
              <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-3">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4" strokeWidth={2} />
                  Bloqueado — escalar broker ({resultado.bloqueio.codigo})
                </div>
                <p className="text-[12px] text-amber-700 dark:text-amber-400 mt-1.5">{resultado.bloqueio.motivo}</p>
              </div>
            ) : semValor ? (
              <p className="text-[12.5px] text-slate-400">Informe a comissão total para ver a divisão.</p>
            ) : (
              <>
                <div>
                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400">Comissão total</p>
                  <p className="text-[22px] font-bold text-slate-900 dark:text-slate-100 leading-tight">
                    {formatMoeda(resultado.total)}
                  </p>
                </div>

                <div className="space-y-1.5">
                  {consolidado.map((linha) => (
                    // parte+papel: com indicação, a mesma pessoa pode ter linha de
                    // corretor E de indicador (naturezas de pagamento distintas, §3.8).
                    <div key={`${linha.parte}-${linha.papel}`} className="flex items-baseline justify-between gap-3">
                      <span className="text-[12.5px] text-slate-700 dark:text-slate-200 truncate">
                        {linha.parte}
                        <span className="text-[11px] text-slate-400 ml-1.5">
                          {PAPEL_LABEL[linha.papel]}
                          {linha.nivel ? ` · ${NIVEIS[linha.nivel].label}` : ''}
                        </span>
                      </span>
                      <span className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">
                        {formatMoeda(linha.valor)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-1">
                  <p className="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Detalhe por ponta</p>
                  {resultado.linhas.map((linha, i) => (
                    <div key={`${linha.ponta}-${linha.parte}-${i}`} className="flex items-baseline justify-between gap-3">
                      <span className="text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                        {linha.ponta} · {linha.parte} ({linha.nivel ? `${NIVEIS[linha.nivel].label}, ` : ''}{linha.percentual}%)
                      </span>
                      <span className="text-[11.5px] text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                        {formatMoeda(linha.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
