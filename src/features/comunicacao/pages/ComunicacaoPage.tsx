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

import { useParams, useNavigate } from 'react-router-dom';
import { Megaphone, Users, FileText, Rocket, History, Settings, type LucideIcon } from 'lucide-react';
import { DisparadorChat } from '../components/DisparadorChat';
import { HistoricoDisparos } from '../components/HistoricoDisparos';
import { PublicosManager } from '../components/PublicosManager';
import { TemplatesManager } from '../components/TemplatesManager';

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
  { id: 'campanhas', label: 'Campanhas', icon: Megaphone, available: false },
  { id: 'historico', label: 'Histórico', icon: History, available: true },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, available: false },
];

export function ComunicacaoPage() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <div className="flex flex-col h-full min-h-0" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Sub-navegação das seções de Comunicação. */}
      <nav className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800 px-4 py-2 shrink-0">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const active = s.id === current.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => s.available && navigate(`/comunicacao/${s.id}`)}
              disabled={!s.available}
              aria-current={active ? 'page' : undefined}
              title={s.available ? undefined : 'Em breve'}
              className={[
                'inline-flex items-center gap-1.5 shrink-0 h-8 px-3 rounded-lg text-[12.5px] font-semibold transition-colors',
                active
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                s.available ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2} />
              {s.label}
              {!s.available && <span className="text-[10px] font-medium opacity-80">• em breve</span>}
            </button>
          );
        })}
      </nav>

      {/* Conteúdo da seção ativa. */}
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
  if (sectionId === 'historico') return <HistoricoDisparos />;

  const meta = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0];
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6 py-16">
      <meta.icon className="w-8 h-8 text-slate-300 dark:text-slate-600" strokeWidth={1.75} />
      <p className="text-[15px] font-semibold text-slate-700 dark:text-slate-200">{meta.label}</p>
      <p className="text-[12.5px] text-slate-400 dark:text-slate-500 max-w-sm">
        Em breve nesta área de Comunicação.
      </p>
    </div>
  );
}

export default ComunicacaoPage;
