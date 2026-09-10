/**
 * Cadência da LIA dentro do card do lead.
 *
 * Responde, sem o corretor precisar abrir a conversa: quantas vezes a IA já
 * cutucou este lead, quando, com que assunto, e se ele respondeu. Somente
 * leitura — quem agenda e dispara é a LIA.
 *
 * DUAS MÉTRICAS SEPARADAS DE PROPÓSITO. "Respondeu" conta quem respondeu a uma
 * cadência que SAIU. "Voltou sozinho" conta o lead que reapareceu antes de a
 * cadência sair (a LIA cancela quando isso acontece). Somar as duas numa taxa
 * só infla o número com mensagem que ninguém mandou.
 */
import { useState } from 'react';
import { ChevronDown, Bot, Clock, AlertTriangle } from 'lucide-react';
import type { Cadencia, CadenciaEvento } from '../services/cadenciaService';
import { rotuloDaTag, estiloDoResultado, duracaoCurta, dataCurta } from './cadenciaLabels';

interface Props {
  cadencia?: Cadencia;
  carregando: boolean;
  erro: string | null;
}

const Kpi = ({ valor, label, destaque }: { valor: string; label: string; destaque?: boolean }) => (
  <div className="min-w-0">
    <p
      className={`text-[18px] font-bold tabular-nums leading-none ${
        destaque ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'
      }`}
    >
      {valor}
    </p>
    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">{label}</p>
  </div>
);

/** Uma tentativa na linha do tempo. */
const Evento = ({ ev }: { ev: CadenciaEvento }) => {
  const estilo = estiloDoResultado(ev.resultado);
  const tempo = duracaoCurta(ev.tempo_ate_resposta_min);
  return (
    <li className="relative pl-5 pb-3 last:pb-0">
      <span className="absolute left-0 top-[5px] w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-900" >
        <span className={`block w-2 h-2 rounded-full ${estilo.dot}`} />
      </span>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 truncate">
          {rotuloDaTag(ev.tag)}
          {ev.attempt_number ? (
            <span className="ml-1.5 font-normal text-slate-400">{ev.attempt_number}ª tentativa</span>
          ) : null}
        </p>
        <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">
          {dataCurta(ev.sent_at ?? ev.scheduled_at)}
        </span>
      </div>
      <p className={`text-[11px] font-medium ${estilo.texto}`}>
        {estilo.label}
        {tempo ? <span className="text-slate-400 font-normal"> · em {tempo}</span> : null}
        {ev.cancelled_reason === 'lead_returned' ? (
          <span className="text-slate-400 font-normal"> · o lead voltou sozinho</span>
        ) : null}
      </p>
      {ev.motivo ? (
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2" title={ev.motivo}>
          {ev.motivo}
        </p>
      ) : null}
    </li>
  );
};

export const CadenciaLiaSection = ({ cadencia, carregando, erro }: Props) => {
  const [verHistorico, setVerHistorico] = useState(false);

  if (carregando) {
    return (
      <div className="mt-5 mb-5" data-testid="cadencia-carregando">
        <Cabecalho />
        <div className="animate-pulse space-y-2">
          <div className="h-12 rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="mt-5 mb-5">
        <Cabecalho />
        <p className="text-[11px] text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
          {erro}
        </p>
      </div>
    );
  }

  const resumo = cadencia?.resumo;
  if (!resumo || resumo.total === 0) {
    return (
      <div className="mt-5 mb-5">
        <Cabecalho />
        <p className="px-3 py-3 text-xs text-slate-500 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
          A LIA ainda não iniciou cadência com este lead.
        </p>
      </div>
    );
  }

  const { proxima } = resumo;

  return (
    <div className="mt-5 mb-5">
      <Cabecalho total={resumo.total} />

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <div className="grid grid-cols-4 gap-2">
          <Kpi valor={String(resumo.enviadas)} label="Enviadas" />
          <Kpi valor={String(resumo.respondidas)} label="Respondeu" destaque={resumo.respondidas > 0} />
          <Kpi
            valor={resumo.taxa_resposta == null ? '—' : `${resumo.taxa_resposta}%`}
            label="Taxa"
          />
          <Kpi
            valor={resumo.dias_em_silencio == null ? '—' : `${resumo.dias_em_silencio}d`}
            label="Silêncio"
          />
        </div>

        {(resumo.retornos_espontaneos > 0 || resumo.tempo_resposta_min.mediana != null) && (
          <p className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            {resumo.retornos_espontaneos > 0 && (
              <>
                <strong className="font-semibold text-slate-700 dark:text-slate-300">
                  {resumo.retornos_espontaneos}
                </strong>{' '}
                {resumo.retornos_espontaneos === 1 ? 'vez o lead voltou' : 'vezes o lead voltou'} antes da
                cadência sair
              </>
            )}
            {resumo.retornos_espontaneos > 0 && resumo.tempo_resposta_min.mediana != null && ' · '}
            {resumo.tempo_resposta_min.mediana != null && (
              <>responde em {duracaoCurta(resumo.tempo_resposta_min.mediana)}, em geral</>
            )}
          </p>
        )}

        {resumo.por_tentativa.length > 1 && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1">
            {resumo.por_tentativa.map((t) => (
              <div key={t.attempt_number} className="flex items-center gap-2 text-[11px]">
                <span className="w-14 shrink-0 text-slate-400">{t.attempt_number}ª tent.</span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${t.enviadas === 0 ? 0 : (t.respondidas / t.enviadas) * 100}%` }}
                  />
                </div>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {t.respondidas}/{t.enviadas}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {proxima && (
        <p
          className={`mt-2 flex items-center gap-1.5 text-[11px] font-medium ${
            proxima.atrasada ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'
          }`}
        >
          {proxima.atrasada ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
          {proxima.atrasada ? 'Cadência atrasada desde' : 'Próxima cadência'} {dataCurta(proxima.scheduled_at)}
          {proxima.attempt_number ? ` · ${proxima.attempt_number}ª tentativa` : ''}
        </p>
      )}

      <button
        type="button"
        onClick={() => setVerHistorico((v) => !v)}
        className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${verHistorico ? 'rotate-180' : ''}`} />
        {verHistorico ? 'Ocultar histórico' : `Ver histórico (${resumo.total})`}
      </button>

      {verHistorico && (
        <>
          <ul className="mt-2 max-h-72 overflow-y-auto pr-1 border-l border-slate-200 dark:border-slate-700 ml-1 pl-0">
            {(cadencia?.timeline ?? []).map((ev) => (
              <Evento key={ev.id} ev={ev} />
            ))}
          </ul>
          {resumo.truncated && (
            <p className="mt-1 text-[10.5px] text-slate-400">
              Mostrando as cadências mais recentes — o histórico completo é maior.
            </p>
          )}
        </>
      )}
    </div>
  );
};

const Cabecalho = ({ total }: { total?: number }) => (
  <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
    <Bot className="w-3.5 h-3.5" />
    Cadência da LIA
    {total != null && <span className="font-normal normal-case tracking-normal text-slate-400">({total})</span>}
  </p>
);
