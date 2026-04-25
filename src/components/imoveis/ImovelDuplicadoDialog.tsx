/**
 * Modal exibido quando, ao salvar, o sistema detecta que o imóvel
 * parece já estar cadastrado para o mesmo proprietário.
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
import type { ImovelDuplicadoMatch } from '@/features/imoveis/services/proprietarioService';

interface ImovelDuplicadoDialogProps {
  open: boolean;
  matches: ImovelDuplicadoMatch[];
  proprietarioNome: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const MOTIVO_LABEL: Record<ImovelDuplicadoMatch['motivo'], string> = {
  mesmo_endereco: 'Mesmo endereço',
  caracteristicas_iguais: 'Características quase idênticas',
};

export function ImovelDuplicadoDialog({
  open,
  matches,
  proprietarioNome,
  onCancel,
  onConfirm,
}: ImovelDuplicadoDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <AlertDialogContent className="z-[10000]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Imóvel possivelmente duplicado
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                Encontramos {matches.length === 1 ? 'um imóvel' : `${matches.length} imóveis`} já
                cadastrado{matches.length === 1 ? '' : 's'} para{' '}
                <strong>{proprietarioNome || 'este proprietário'}</strong> com dados parecidos:
              </p>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {matches.map((m) => {
                  const endereco = [m.logradouro, m.numero].filter(Boolean).join(', ');
                  const local = [m.bairro, m.cidade].filter(Boolean).join(' · ');
                  return (
                    <div
                      key={m.codigo_imovel}
                      className="border rounded-md p-3 bg-muted/30 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="font-mono">
                          {m.codigo_imovel}
                        </Badge>
                        <Badge variant="secondary" className="text-[11px]">
                          {MOTIVO_LABEL[m.motivo]}
                        </Badge>
                      </div>
                      {m.titulo && (
                        <div className="font-medium text-foreground line-clamp-1">{m.titulo}</div>
                      )}
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
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground">
                Se for um imóvel diferente, você pode prosseguir mesmo assim.
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
