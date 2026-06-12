import { ExternalLink, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface PdfPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  /**
   * Object URL do arquivo selecionado nesta sessão. O app persiste apenas o
   * NOME do PDF, então sem o arquivo em memória não há o que renderizar —
   * nesse caso o dialog orienta a anexar novamente.
   */
  fileUrl: string | null;
}

export const PdfPreviewDialog = ({ open, onOpenChange, fileName, fileUrl }: PdfPreviewDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[92vh] w-[min(96vw,920px)] max-w-none flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
        <DialogTitle className="truncate text-base text-slate-950 dark:text-slate-50">
          {fileName || 'Documento PDF'}
        </DialogTitle>
        <DialogDescription className="text-[12px]">
          Pré-visualização do PDF anexado para assinatura eletrônica.
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-hidden bg-slate-200/70 dark:bg-slate-950">
        {fileUrl ? (
          <iframe src={fileUrl} title={fileName || 'Documento PDF'} className="h-[72vh] w-full border-0" />
        ) : (
          <div className="flex h-[40vh] flex-col items-center justify-center gap-3 px-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-950/40 dark:text-amber-300">
              <FileWarning className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Arquivo não disponível nesta sessão
            </p>
            <p className="max-w-md text-[13px] leading-5 text-slate-500 dark:text-slate-400">
              O documento {fileName ? `"${fileName}" ` : ''}foi registrado anteriormente, mas o arquivo não está
              mais carregado no navegador. Anexe o PDF novamente para visualizá-lo.
            </p>
          </div>
        )}
      </div>

      <DialogFooter className="border-t border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
        {fileUrl && (
          <Button
            type="button"
            className="bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Abrir em nova aba
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
