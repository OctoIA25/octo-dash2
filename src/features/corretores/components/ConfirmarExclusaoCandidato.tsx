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

interface CandidatoMinimo {
  id: string | number;
  nome: string;
}

interface Props {
  /** Quem vai ser apagado; null = diálogo fechado. */
  candidato: CandidatoMinimo | null;
  excluindo?: boolean;
  onConfirmar: (candidato: CandidatoMinimo) => void;
  onCancelar: () => void;
}

/**
 * A confirmação de exclusão, uma só para a lixeira do card e o botão do modal.
 * O DELETE leva `recrut_evento` e `recrut_ativacao_marco` junto (FK em cascata),
 * e é isso que o aviso diz. Só admin/owner chegam aqui: a RLS de
 * recrut_candidato é FOR ALL para eles e ninguém mais.
 */
export const ConfirmarExclusaoCandidato = ({ candidato, excluindo = false, onConfirmar, onCancelar }: Props) => (
  <AlertDialog open={!!candidato} onOpenChange={(open) => { if (!open) onCancelar(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{`Excluir ${candidato?.nome ?? ''}?`}</AlertDialogTitle>
        <AlertDialogDescription>
          Apaga o candidato, o histórico e os marcos. Não dá para desfazer.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
        <AlertDialogAction
          onClick={() => { if (candidato) onConfirmar(candidato); }}
          disabled={excluindo}
          className="bg-rose-600 hover:bg-rose-700 text-white"
        >
          {excluindo ? 'Excluindo…' : 'Excluir'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
