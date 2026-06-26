/**
 * Drawer lateral com o perfil completo de um corretor (drill-down do admin).
 * Reusa as Sections premium do fluxo do corretor — zero render novo. Substitui os
 * modais aninhados (Statistics → resumo → modal individual).
 */

import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { usePerfilDoCorretor } from '../usePerfilDoCorretor';
import { DiscSection } from '@/features/personalidade/components/DiscSection';
import { MbtiSection } from '@/features/personalidade/components/MbtiSection';
import { EneagramaSection } from '@/features/personalidade/components/EneagramaSection';
import { DesenvolvimentoSection } from '@/features/personalidade/components/DesenvolvimentoSection';

interface CorretorPainelProps {
  corretorId: number | null;
  corretorNome: string;
  onClose: () => void;
}

export function CorretorPainel({ corretorId, corretorNome, onClose }: CorretorPainelProps) {
  const { loading, perfil } = usePerfilDoCorretor(corretorId);
  const vazio = !perfil.disc && !perfil.eneagrama && !perfil.mbti;

  return (
    <Sheet open={corretorId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto p-6"
        style={{ backgroundColor: 'hsl(var(--bg-primary))', borderColor: 'hsl(var(--border))' }}
      >
        <SheetHeader className="mb-6 text-left">
          <SheetTitle style={{ color: 'hsl(var(--text-primary))' }}>{corretorNome}</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'hsl(var(--text-secondary))' }} />
          </div>
        ) : vazio ? (
          <p className="text-sm py-10 text-center" style={{ color: 'hsl(var(--text-secondary))' }}>
            Este corretor ainda não tem resultados.
          </p>
        ) : (
          <div className="space-y-8">
            {perfil.disc && <DiscSection disc={perfil.disc} />}
            {perfil.mbti && <MbtiSection mbti={perfil.mbti} />}
            {perfil.eneagrama && <EneagramaSection eneagrama={perfil.eneagrama} />}
            {perfil.eneagrama && <DesenvolvimentoSection eneagrama={perfil.eneagrama} />}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
