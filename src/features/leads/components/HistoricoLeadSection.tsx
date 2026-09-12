/**
 * Histórico do lead dentro do card.
 *
 * Responde, sem sair do modal: quando o lead entrou e por onde, quem recebeu,
 * como andou no funil, e o que a LIA fez. Somente leitura — quem grava são os
 * triggers do banco e a rota que a LIA usa.
 *
 * FECHADA POR PADRÃO, DE PROPÓSITO. O Kanban abre e fecha este modal o tempo
 * todo; buscar o histórico em toda abertura seria uma requisição por clique de
 * card. `aberto` é controlado pelo modal, que também é quem liga o hook — o
 * mesmo desenho da seção "Imóveis de interesse".
 *
 * DERIVADO VEM MARCADO. Parte da linha do tempo é reconstruída das colunas do
 * lead (ver server/leadEvents/compute.js) porque a base inteira é anterior aos
 * triggers. Isso é inferência do estado ATUAL, não registro do que aconteceu, e
 * a tela precisa deixar claro qual é qual.
 */
import { ChevronDown, History } from 'lucide-react';
import type { Historico, EventoLead } from '../services/historicoLeadService';
import { descreverEvento } from './eventoLabels';
import { dataCurta } from './cadenciaLabels';

interface Props {
  historico?: Historico;
  carregando: boolean;
  erro: string | null;
  aberto: boolean;
  onToggle: () => void;
}

/** Um acontecimento na linha do tempo. */
const Evento = ({ ev }: { ev: EventoLead }) => {
  const { titulo, detalhe, dot } = descreverEvento(ev);
  return (
    <li className="relative pl-5 pb-3 last:pb-0 before:absolute before:left-1 before:top-0 before:bottom-0 before:w-px before:bg-slate-200 dark:before:bg-slate-700">
      <span className="absolute left-0 top-[5px] w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-900">
        <span
          className={`block w-2 h-2 rounded-full ${dot} ${ev.derivado ? 'opacity-50' : ''}`}
        />
      </span>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 truncate" title={titulo}>
          {titulo}
        </p>
        <span className="shrink-0 text-[10px] text-slate-400 tabular-nums">{dataCurta(ev.quando)}</span>
      </div>
      {(detalhe || ev.derivado) && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {detalhe}
          {detalhe && ev.derivado ? ' · ' : ''}
          {ev.derivado && (
            <span
              className="text-slate-400 italic"
              title="Reconstruído a partir dos dados atuais do lead — anterior ao registro de eventos."
            >
              estimado
            </span>
          )}
        </p>
      )}
    </li>
  );
};

export const HistoricoLeadSection = ({ historico, carregando, erro, aberto, onToggle }: Props) => (
  <div className="mt-5 mb-5">
    <div className="flex items-center justify-between gap-2 mb-2">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <History className="w-3.5 h-3.5" />
        Histórico
        {historico && (
          <span className="font-normal normal-case tracking-normal text-slate-400">
            ({historico.resumo.total})
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        {aberto ? 'Ocultar' : 'Ver histórico'}
      </button>
    </div>

    {aberto && (
      <Conteudo historico={historico} carregando={carregando} erro={erro} />
    )}
  </div>
);

const Conteudo = ({ historico, carregando, erro }: Pick<Props, 'historico' | 'carregando' | 'erro'>) => {
  if (carregando) {
    return (
      <div className="animate-pulse space-y-2" data-testid="historico-carregando">
        <div className="h-4 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-4 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  if (erro) {
    return (
      <p className="text-[11px] text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2">
        {erro}
      </p>
    );
  }

  if (!historico || historico.eventos.length === 0) {
    return (
      <p className="px-3 py-3 text-xs text-slate-500 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
        Nenhum movimento registrado para este lead.
      </p>
    );
  }

  return (
    <>
      <ul className="max-h-72 overflow-y-auto pr-1 ml-1">
        {historico.eventos.map((ev) => (
          <Evento key={ev.id} ev={ev} />
        ))}
      </ul>
      {historico.resumo.truncated && (
        <p className="mt-1 text-[10.5px] text-slate-400">
          Mostrando os movimentos mais recentes — o histórico completo é maior.
        </p>
      )}
    </>
  );
};
