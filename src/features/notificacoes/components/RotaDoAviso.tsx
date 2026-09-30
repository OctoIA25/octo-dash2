/**
 * De quem veio e para quem foi — a linha que abre cada aviso, na lista e no
 * aviso na tela. É o que a área de Comunicados existe para responder, então
 * ocupa o lugar das antigas etiquetas soltas.
 */
import { ArrowRight, Bot } from 'lucide-react';
import type { NotificationItem } from '@/contexts/NotificationsContext';
import { CLASSES_DO_TOM, rotaDe, tipoDe } from '../notificationKinds';

/** Diretoria em índigo, o resto da gestão em azul: dá para saber de quem é antes de ler. */
const corDoPapel = (papel?: string) =>
  papel?.toLowerCase().startsWith('diret') ? 'bg-indigo-600' : 'bg-blue-600';

export function AvatarDoAviso({ item, pequeno = false }: { item: NotificationItem; pequeno?: boolean }) {
  const { origem } = rotaDe(item);
  const tamanho = pequeno ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-xs';
  const base = `flex ${tamanho} shrink-0 items-center justify-center rounded-full font-semibold`;

  if (origem.tipo === 'usuario') {
    return <span className={`${base} ${corDoPapel(origem.papel)} text-white`} aria-hidden>{origem.iniciais}</span>;
  }
  if (origem.tipo === 'lia') {
    return <span className={`${base} bg-violet-600 text-white`} aria-hidden><Bot className="h-4 w-4" /></span>;
  }
  const tipo = tipoDe(item.type);
  const Icone = tipo.icone;
  return (
    <span className={`${base} ${CLASSES_DO_TOM[tipo.tom].fundo}`} aria-hidden>
      <Icone className={`h-4 w-4 ${CLASSES_DO_TOM[tipo.tom].icone}`} />
    </span>
  );
}

/** Nome em destaque e, ao lado, cargo e equipe em tom mais baixo. O sufixo cola no fim, sem espaço. */
function PessoaNaRota({ nome, detalhe, forte = false, sufixo }: { nome: string; detalhe?: string; forte?: boolean; sufixo?: string }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <span className={forte ? 'font-semibold text-slate-800 dark:text-slate-200' : 'font-medium text-slate-700 dark:text-slate-300'}>
        {nome}{!detalhe && sufixo}
      </span>
      {detalhe && <span>{detalhe}{sufixo}</span>}
    </span>
  );
}

export function LinhaDeRota({ item, compacta = false }: { item: NotificationItem; compacta?: boolean }) {
  const { origem, destino, sobre } = rotaDe(item);
  const detalheDaOrigem = origem.tipo === 'usuario' ? origem.detalhe : undefined;
  return (
    <p className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-slate-500 dark:text-slate-400 ${compacta ? 'text-xs' : 'text-[13px] leading-5'}`}>
      <PessoaNaRota nome={origem.nome} detalhe={detalheDaOrigem} forte />
      {destino && (
        <>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden />
          <span className="sr-only">para</span>
          {/* Na cópia do gestor, o que importa é sobre quem: o gestor fica só com o nome. */}
          <PessoaNaRota nome={destino.nome} detalhe={sobre ? undefined : destino.detalhe} sufixo={sobre ? ',' : undefined} />
        </>
      )}
      {sobre && (
        <>
          <span>sobre</span>
          <PessoaNaRota nome={sobre.nome} detalhe={sobre.detalhe} />
        </>
      )}
    </p>
  );
}
