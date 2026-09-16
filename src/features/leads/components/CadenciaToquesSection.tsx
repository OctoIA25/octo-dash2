/**
 * Cadência do lead — 10 quadrados, um por toque com o cliente.
 *
 * Responde de relance: quantas vezes já se tentou este cliente, por qual canal
 * (cor), com que resultado (ícone) e quem fez. O corretor registra o toque
 * clicando no próximo quadrado vazio; data/hora e autor são automáticos.
 *
 * Os toques da LIA entram nos mesmos quadrados, vindos da cadência que o modal
 * já carregou (`timelineLia`) — buscar de novo aqui dobraria as consultas.
 *
 * useState/useEffect, não React Query: mesmo motivo de useCadenciaLead — o
 * modal é montado em telas cujos testes não têm QueryClientProvider.
 */
import { useEffect, useMemo, useState } from 'react';
import { Ban, Check, Clock, ListChecks, Loader2, Minus, Plus, Undo2, X, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CadenciaEvento } from '../services/cadenciaService';
import {
  desfazerToque,
  fetchToques,
  registrarToque,
  type CanalToque,
  type ResultadoToque,
  type ToqueCorretor,
} from '../services/toquesService';
import {
  CANAIS,
  RESULTADOS,
  TOTAL_QUADRADOS,
  estiloDoCanal,
  montarQuadrados,
  nomeCurto,
  proximoToque,
  rotuloDoResultado,
  type Quadrado,
} from '../utils/cadenciaToques';
import { dataCurta } from './cadenciaLabels';
import { tenantReal } from '../hooks/useCadenciaLead';

const ICONE_RESULTADO: Record<ResultadoToque, typeof Check> = {
  respondeu: Check,
  nao_respondeu: Minus,
  numero_errado: X,
  nao_contatar: Ban,
};

type Proximo = '' | 'amanha' | 'tres_dias' | 'data' | 'nenhum';

const PROXIMOS: { value: Exclude<Proximo, ''>; label: string }[] = [
  { value: 'amanha', label: 'Amanhã' },
  { value: 'tres_dias', label: 'Em 3 dias' },
  { value: 'data', label: 'Escolher data' },
  { value: 'nenhum', label: 'Sem próximo' },
];

interface FormToque {
  canal: CanalToque | '';
  resultado: ResultadoToque | '';
  proximo: Proximo;
  /** valor do <input type="datetime-local"> quando proximo = 'data' */
  data: string;
  /** "HH:MM" de "Amanhã" e "Em 3 dias" — é a hora em que o corretor será avisado. */
  hora: string;
  observacao: string;
}

const FORM_VAZIO: FormToque = { canal: '', resultado: '', proximo: '', data: '', hora: '09:00', observacao: '' };

/** Dia daqui a N dias, na hora escolhida, no fuso de quem registra. */
function diasAFrente(dias: number, hora: string): string {
  const [h, m] = hora.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function proximoEmISO(form: FormToque): string | null {
  if (form.proximo === 'amanha') return diasAFrente(1, form.hora);
  if (form.proximo === 'tres_dias') return diasAFrente(3, form.hora);
  if (form.proximo === 'data') return form.data ? new Date(form.data).toISOString() : null;
  return null;
}

/** "2026-09-16T14:30" no fuso local, para o `min` do datetime-local. */
function agoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const descrever = (q: Quadrado) =>
  `${q.numero}º toque · ${estiloDoCanal(q.canal).label} · ${rotuloDoResultado(q.resultado)} · ${dataCurta(q.em)} · ${q.quem}`;

interface Props {
  leadId: string;
  tenantId: string | null | undefined;
  /** Quem está logado — só ele desfaz o próprio último toque. */
  userId: string | undefined;
  timelineLia: CadenciaEvento[] | undefined;
  ativo: boolean;
}

export const CadenciaToquesSection = ({ leadId, tenantId, userId, timelineLia, ativo }: Props) => {
  const { toast } = useToast();
  const [toques, setToques] = useState<ToqueCorretor[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState(false);
  const [form, setForm] = useState<FormToque>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);

  useEffect(() => {
    setSelecionado(null);
    setRegistrando(false);
    setForm(FORM_VAZIO);
    if (!ativo || !leadId || !tenantReal(tenantId)) {
      setToques([]);
      setErro(null);
      return undefined;
    }
    // Trocar de lead com a busca em voo escreveria os toques no lead errado.
    let atual = true;
    setCarregando(true);
    setErro(null);
    fetchToques(leadId, tenantId)
      .then((lista) => { if (atual) setToques(lista); })
      .catch((e: unknown) => {
        if (atual) setErro(e instanceof Error ? e.message : 'Falha ao carregar a cadência.');
      })
      .finally(() => { if (atual) setCarregando(false); });
    return () => { atual = false; };
  }, [leadId, tenantId, ativo]);

  const quadrados = useMemo(() => montarQuadrados(toques, timelineLia), [toques, timelineLia]);
  const proximo = proximoToque(quadrados);
  const proximoAtrasado = proximo != null && Date.parse(proximo) < Date.now();
  const ultimoDoCorretor = [...quadrados].reverse().find((q) => q.origem === 'corretor');
  const detalhe = quadrados.find((q) => q.chave === selecionado) ?? null;
  const excedentes = Math.max(0, quadrados.length - TOTAL_QUADRADOS);

  const abrirRegistro = () => {
    setSelecionado(null);
    setErroForm(null);
    setRegistrando(true);
  };

  const salvar = async () => {
    if (!form.canal || !form.resultado || !form.proximo) {
      setErroForm('Escolha canal, resultado e próximo toque.');
      return;
    }
    if (form.proximo === 'data' && !form.data) {
      setErroForm('Escolha a data do próximo toque.');
      return;
    }
    if ((form.proximo === 'amanha' || form.proximo === 'tres_dias') && !/^\d{2}:\d{2}$/.test(form.hora)) {
      setErroForm('Escolha o horário do próximo toque.');
      return;
    }
    setSalvando(true);
    setErroForm(null);
    try {
      const novo = await registrarToque(leadId, tenantId, {
        canal: form.canal,
        resultado: form.resultado,
        observacao: form.observacao.trim() || undefined,
        proximo_toque_em: proximoEmISO(form),
      });
      setToques((prev) => [...prev, novo]);
      setRegistrando(false);
      setForm(FORM_VAZIO);
      toast({ title: 'Toque registrado' });
    } catch (e: unknown) {
      setErroForm(e instanceof Error ? e.message : 'Não foi possível registrar o toque.');
    } finally {
      setSalvando(false);
    }
  };

  const desfazer = async (q: Quadrado) => {
    if (!q.toque || !window.confirm(`Desfazer o ${q.numero}º toque?`)) return;
    setDesfazendo(true);
    try {
      await desfazerToque(leadId, tenantId, q.toque.id);
      setToques((prev) => prev.filter((t) => t.id !== q.toque?.id));
      setSelecionado(null);
    } catch (e: unknown) {
      toast({
        title: 'Não foi possível desfazer',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setDesfazendo(false);
    }
  };

  return (
    <div className="mt-5 mb-5" data-testid="cadencia-toques">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <ListChecks className="w-3.5 h-3.5" />
          Cadência
          <span className="font-normal normal-case tracking-normal text-slate-400">
            ({Math.min(quadrados.length, TOTAL_QUADRADOS)} de {TOTAL_QUADRADOS})
          </span>
        </p>
        {proximo && (
          <p
            className={`flex items-center gap-1 text-[11px] font-medium ${
              proximoAtrasado ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {proximoAtrasado ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {proximoAtrasado ? 'Próximo toque atrasado:' : 'Próximo toque:'} {dataCurta(proximo)}
          </p>
        )}
      </div>

      {erro ? (
        <p className="text-[11px] text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
          {erro}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
            {Array.from({ length: TOTAL_QUADRADOS }, (_, i) => {
              const q = quadrados[i];
              if (q) {
                const Icone = ICONE_RESULTADO[q.resultado] ?? Minus;
                const ativoQ = selecionado === q.chave;
                return (
                  <button
                    key={q.chave}
                    type="button"
                    title={descrever(q)}
                    aria-label={descrever(q)}
                    aria-pressed={ativoQ}
                    onClick={() => { setRegistrando(false); setSelecionado(ativoQ ? null : q.chave); }}
                    className="flex min-w-0 flex-col items-center gap-1"
                  >
                    <span
                      className={`relative flex w-full aspect-square items-center justify-center rounded-md text-white ${
                        estiloDoCanal(q.canal).fundo
                      } ${ativoQ ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-slate-900' : ''}`}
                    >
                      <span className="absolute left-1 top-0.5 text-[9px] font-semibold tabular-nums opacity-80">
                        {q.numero}
                      </span>
                      <Icone className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <span className="w-full truncate text-center text-[9.5px] text-slate-500 dark:text-slate-400">
                      {q.origem === 'lia' ? 'LIA' : nomeCurto(q.quem)}
                    </span>
                  </button>
                );
              }
              const ehProximo = i === quadrados.length && !carregando;
              return ehProximo ? (
                <button
                  key={`vazio-${i}`}
                  type="button"
                  onClick={abrirRegistro}
                  aria-label={`Registrar ${i + 1}º toque`}
                  title={`Registrar ${i + 1}º toque`}
                  className="flex min-w-0 flex-col items-center gap-1"
                >
                  <span className="flex w-full aspect-square items-center justify-center rounded-md border-2 border-dashed border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-600 dark:border-slate-600 dark:hover:border-slate-400">
                    <Plus className="h-4 w-4" />
                  </span>
                  <span className="text-[9.5px] text-transparent select-none">.</span>
                </button>
              ) : (
                <div key={`vazio-${i}`} className="flex min-w-0 flex-col items-center gap-1" aria-hidden>
                  <span
                    className={`relative flex w-full aspect-square rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 ${
                      carregando ? 'animate-pulse' : ''
                    }`}
                  >
                    <span className="absolute left-1 top-0.5 text-[9px] tabular-nums text-slate-300 dark:text-slate-600">
                      {i + 1}
                    </span>
                  </span>
                  <span className="text-[9.5px] text-transparent select-none">.</span>
                </div>
              );
            })}
          </div>

          {/* Com os 10 cheios não há quadrado "+": o registro continua por aqui. */}
          {quadrados.length >= TOTAL_QUADRADOS && (
            <p className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>
                {excedentes > 0 && `+${excedentes} ${excedentes === 1 ? 'toque' : 'toques'} além do ${TOTAL_QUADRADOS}º`}
              </span>
              {!registrando && (
                <button type="button" onClick={abrirRegistro} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                  Registrar toque
                </button>
              )}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-slate-500 dark:text-slate-400">
            {CANAIS.map((c) => (
              <span key={c.value} className="inline-flex items-center gap-1">
                <span className={`h-2.5 w-2.5 rounded-sm ${c.fundo}`} />
                {c.label}
              </span>
            ))}
            <span className="text-slate-300 dark:text-slate-600" aria-hidden>|</span>
            {RESULTADOS.map((r) => {
              const Icone = ICONE_RESULTADO[r.value];
              return (
                <span key={r.value} className="inline-flex items-center gap-1">
                  <Icone className="h-3 w-3" strokeWidth={2.5} />
                  {r.label}
                </span>
              );
            })}
          </div>
        </>
      )}

      {detalhe && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-[11px] dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              {detalhe.numero}º toque · {estiloDoCanal(detalhe.canal).label} · {rotuloDoResultado(detalhe.resultado)}
            </p>
            {detalhe.toque && detalhe.chave === ultimoDoCorretor?.chave && detalhe.toque.executado_por === userId && (
              <button
                type="button"
                onClick={() => desfazer(detalhe)}
                disabled={desfazendo}
                className="inline-flex shrink-0 items-center gap-1 font-semibold text-rose-600 hover:underline disabled:opacity-50 dark:text-rose-400"
              >
                {desfazendo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                Desfazer
              </button>
            )}
          </div>
          <p className="mt-0.5 text-slate-500 dark:text-slate-400">
            {dataCurta(detalhe.em)} · {detalhe.origem === 'lia' ? 'LIA (automático)' : `por ${detalhe.quem}`}
            {detalhe.origem === 'corretor' &&
              ` · próximo: ${detalhe.proximo_toque_em ? dataCurta(detalhe.proximo_toque_em) : 'sem próximo'}`}
          </p>
          {detalhe.observacao && <p className="mt-1 text-slate-600 dark:text-slate-300">{detalhe.observacao}</p>}
        </div>
      )}

      {registrando && (
        <div className="mt-2 space-y-3 rounded-lg border border-border p-3">
          <Escolha
            titulo="Como foi o toque?"
            opcoes={CANAIS.map((c) => ({
              value: c.value,
              label: c.label,
              marca: <span className={`h-3 w-3 rounded-sm ${c.fundo}`} />,
            }))}
            valor={form.canal}
            onChange={(canal) => setForm((f) => ({ ...f, canal: canal as CanalToque }))}
          />
          <Escolha
            titulo="Resultado"
            opcoes={RESULTADOS.map((r) => {
              const Icone = ICONE_RESULTADO[r.value];
              return { value: r.value, label: r.label, marca: <Icone className="h-3 w-3" strokeWidth={2.5} /> };
            })}
            valor={form.resultado}
            onChange={(resultado) => setForm((f) => ({ ...f, resultado: resultado as ResultadoToque }))}
          />
          <Escolha
            titulo="Próximo toque"
            opcoes={PROXIMOS.map((p) => ({ value: p.value, label: p.label }))}
            valor={form.proximo}
            onChange={(p) => setForm((f) => ({ ...f, proximo: p as Proximo }))}
          />
          {form.proximo === 'data' && (
            <Input
              type="datetime-local"
              min={agoraLocal()}
              value={form.data}
              onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
              className="h-9 text-xs"
              aria-label="Data e hora do próximo toque"
            />
          )}
          {(form.proximo === 'amanha' || form.proximo === 'tres_dias') && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-foreground">Horário</span>
              <Input
                type="time"
                value={form.hora}
                onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                className="h-9 w-28 text-xs"
                aria-label="Horário do próximo toque"
              />
            </div>
          )}
          {form.proximo && form.proximo !== 'nenhum' && (
            <p className="text-[10.5px] text-muted-foreground">Você será avisado nesse horário.</p>
          )}
          <div>
            <p className="mb-1 text-[11px] font-semibold text-foreground">
              Observação <span className="font-normal text-muted-foreground">(opcional)</span>
            </p>
            <Textarea
              value={form.observacao}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              placeholder="Ex: atendeu a esposa, pediu para ligar depois das 18h"
              rows={2}
              maxLength={1000}
              className="resize-none text-xs"
            />
          </div>
          {erroForm && <p className="text-[11px] text-rose-600 dark:text-rose-400">{erroForm}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={salvar} disabled={salvando} className="h-8 flex-1 text-xs">
              {salvando && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Salvar {quadrados.length + 1}º toque
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setRegistrando(false); setForm(FORM_VAZIO); setErroForm(null); }}
              disabled={salvando}
              className="h-8 text-xs"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

interface EscolhaProps {
  titulo: string;
  opcoes: { value: string; label: string; marca?: React.ReactNode }[];
  valor: string;
  onChange: (v: string) => void;
}

/** Grupo de opções no mesmo desenho das atividades do lead. */
const Escolha = ({ titulo, opcoes, valor, onChange }: EscolhaProps) => (
  <div role="radiogroup" aria-label={titulo}>
    <p className="mb-1.5 text-[11px] font-semibold text-foreground">{titulo}</p>
    {/* 2 colunas sempre: a seção vive numa coluna estreita do modal e "Pediu para não contatar" cortava em 4. */}
    <div className="grid grid-cols-2 gap-1.5">
      {opcoes.map((o) => {
        const escolhido = valor === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={escolhido}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
              escolhido ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border hover:bg-muted'
            }`}
          >
            {o.marca}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);
