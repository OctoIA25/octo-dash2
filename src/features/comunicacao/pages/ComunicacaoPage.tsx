/**
 * ComunicacaoPage — shell da área de Comunicação (/comunicacao/:section?).
 *
 * Reúne, sob um único módulo, os canais de comunicação com a base de leads:
 * Disparador (envio guiado por IA), e — em breve — Públicos, Templates,
 * Campanhas, Histórico e Configurações.
 *
 * Esta é a casca: sub-navegação + roteamento por `section`. O conteúdo de cada
 * seção é plugado incrementalmente (o Disparador é ligado na Task 9). As seções
 * ainda não implementadas mostram um placeholder "Em breve", desabilitado.
 */

import { useParams } from 'react-router-dom';
import { Megaphone, Users, FileText, Rocket, History, Settings, type LucideIcon } from 'lucide-react';
import { DisparadorChat } from '../components/DisparadorChat';
import { HistoricoDisparos } from '../components/HistoricoDisparos';
import { PublicosManager } from '../components/PublicosManager';
import { TemplatesManager } from '../components/TemplatesManager';
import { CampanhasManager } from '../components/CampanhasManager';

interface CommSection {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Seções ainda não implementadas ficam visíveis porém desabilitadas. */
  available: boolean;
}

/** A ordem aqui é a ordem da sub-navegação. 'disparador' é o default. */
const SECTIONS: CommSection[] = [
  { id: 'disparador', label: 'Disparador', icon: Rocket, available: true },
  { id: 'publicos', label: 'Públicos', icon: Users, available: true },
  { id: 'templates', label: 'Templates', icon: FileText, available: true },
  { id: 'campanhas', label: 'Campanhas', icon: Megaphone, available: true },
  { id: 'historico', label: 'Histórico', icon: History, available: true },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, available: false },
];

export function ComunicacaoPage() {
  const { section } = useParams<{ section?: string }>();

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <div className="flex flex-col h-full min-h-0 bg-theme-primary">
      <div className="flex-1 min-h-0">
        <SectionContent sectionId={current.id} />
      </div>
    </div>
  );
}

/**
 * Renderiza o conteúdo da seção. O Disparador é o componente real; as demais
 * seções mostram um placeholder "Em breve".
 */
function SectionContent({ sectionId }: { sectionId: string }) {
  if (sectionId === 'disparador') return <DisparadorChat />;
  if (sectionId === 'publicos') return <PublicosManager />;
  if (sectionId === 'templates') return <TemplatesManager />;
  if (sectionId === 'campanhas') return <CampanhasManager />;
  if (sectionId === 'historico') return <HistoricoDisparos />;

  const meta = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0];
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-8 py-10 max-w-sm">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800/60">
          <meta.icon className="w-6 h-6 text-slate-400 dark:text-slate-500" strokeWidth={1.75} />
        </div>
        <p className="text-[15px] font-semibold text-slate-800 dark:text-slate-100">{meta.label}</p>
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
          Configurações de Comunicação chegam em breve.
        </p>
      </div>
    </div>
  );
}

export default ComunicacaoPage;
