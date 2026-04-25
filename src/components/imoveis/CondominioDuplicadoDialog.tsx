/**
 * Modal de aviso de condomínio duplicado.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, MapPin } from 'lucide-react';
import type { CondominioDuplicadoMatch } from '@/features/imoveis/services/condominioService';

interface CondominioDuplicadoDialogProps {
  open: boolean;
  matches: CondominioDuplicadoMatch[];
  nome: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** Callback opcional: usuário decidiu carregar/editar o condomínio existente */
  onCarregarExistente?: (match: CondominioDuplicadoMatch) => void;
}

const MOTIVO_LABEL: Record<CondominioDuplicadoMatch['motivo'], string> = {
  mesmo_nome: 'Mesmo nome',
  mesmo_endereco: 'Mesmo endereço',
};

export function CondominioDuplicadoDialog({
  open,
  matches,
  nome,
  onCancel,
  onConfirm,
  onCarregarExistente,
}: CondominioDuplicadoDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent className="z-[10001]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Condomínio possivelmente duplicado
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Encontramos {matches.length === 1 ? 'um condomínio' : `${matches.length} condomínios`}{' '}
                já cadastrado{matches.length === 1 ? '' : 's'} com dados parecidos com{' '}
                <strong>“{nome || 'este condomínio'}”</strong>:
              </p>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {matches.map((m) => {
                  const endereco = [m.logradouro, m.numero].filter(Boolean).join(', ');
                  const local = [m.bairro, m.cidade].filter(Boolean).join(' · ');
                  return (
                    <div key={m.id} className="border rounded-md p-3 bg-muted/30 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-foreground line-clamp-1">{m.nome}</div>
                        <Badge variant="secondary" className="text-[11px] shrink-0">
                          {MOTIVO_LABEL[m.motivo]}
                        </Badge>
                      </div>
                      {(endereco || local) && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>
                            {endereco}
                            {endereco && local ? ' — ' : ''}
                            {local}
                          </span>
                        </div>
                      )}
                      {onCarregarExistente && (
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline mt-1"
                          onClick={() => onCarregarExistente(m)}
                        >
                          Editar este em vez de criar novo →
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                Se for um condomínio diferente, você pode prosseguir mesmo assim.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            Cadastrar mesmo assim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
