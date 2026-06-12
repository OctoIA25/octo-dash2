import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  DOCUMENT_PAGE_CHARS_PER_LINE,
  paginateDocumentContent,
  type GeneratedDocument,
} from '@/features/leads/utils/proposalDocuments';

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: GeneratedDocument | null;
  buildError?: string | null;
  subtitle?: string;
  onDownload?: () => void;
}

interface PreviewErrorBoundaryProps {
  children: ReactNode;
}

interface PreviewErrorBoundaryState {
  hasError: boolean;
}

// Última linha de defesa: se algo inesperado quebrar o render das folhas,
// mostra uma mensagem amigável em vez de derrubar a página de propostas.
class PreviewErrorBoundary extends Component<PreviewErrorBoundaryProps, PreviewErrorBoundaryState> {
  state: PreviewErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PreviewErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <PreviewMessage
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Não foi possível exibir a pré-visualização"
          description="Ocorreu um erro ao desenhar o documento. Feche a janela e tente novamente; se persistir, revise os dados da proposta."
        />
      );
    }
    return this.props.children;
  }
}

const PreviewMessage = ({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300">
      {icon}
    </span>
    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
    <p className="max-w-md text-[13px] leading-5 text-slate-500 dark:text-slate-400">{description}</p>
  </div>
);

export const DocumentPreviewDialog = ({
  open,
  onOpenChange,
  document,
  buildError,
  subtitle,
  onDownload,
}: DocumentPreviewDialogProps) => {
  const content = document?.content ?? null;
  // `content` é comparado por valor: enquanto os dados da proposta não mudam,
  // a paginação (e as folhas) não é recalculada, mesmo que o pai re-renderize.
  const pages = useMemo(() => (content !== null ? paginateDocumentContent(content) : []), [content]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    setCurrentPage(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [content, open]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const marker = container.scrollTop + container.clientHeight * 0.3;
    let index = 0;
    pageRefs.current.forEach((element, pageIndex) => {
      if (element && element.offsetTop <= marker) index = pageIndex;
    });
    setCurrentPage(index);
  };

  const goToPage = (index: number) => {
    const target = pageRefs.current[Math.max(0, Math.min(index, pages.length - 1))];
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const missingFields = document?.missingFields ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,920px)] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <DialogTitle className="text-base text-slate-950 dark:text-slate-50">
            {document?.title ?? 'Pré-visualização do documento'}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {subtitle ?? 'Pré-visualização fiel do arquivo que será gerado.'}
          </DialogDescription>
        </DialogHeader>

        {document && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-6 py-2 dark:border-slate-800 dark:bg-slate-900">
            <span className="truncate text-[12px] text-slate-500 dark:text-slate-400">{document.fileName}</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                disabled={currentPage <= 0}
                onClick={() => goToPage(currentPage - 1)}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[110px] text-center text-[12px] font-medium text-slate-600 dark:text-slate-300">
                Página {Math.min(currentPage + 1, pages.length)} de {pages.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                disabled={currentPage >= pages.length - 1}
                onClick={() => goToPage(currentPage + 1)}
                aria-label="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {missingFields.length > 0 && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-200">
              Dados pendentes — o documento usa textos provisórios nos campos abaixo:
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {missingFields.map((field) => (
                <li key={field.id} className="text-[12px] leading-5 text-amber-700 dark:text-amber-300">
                  • <span className="font-medium">{field.label}</span>
                  {field.hint ? <span className="text-amber-600/90 dark:text-amber-400"> — {field.hint}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="relative flex-1 overflow-y-auto bg-slate-200/70 px-4 py-6 dark:bg-slate-950"
        >
          {buildError ? (
            <PreviewMessage
              icon={<FileWarning className="h-6 w-6" />}
              title="Não foi possível gerar o documento"
              description={buildError}
            />
          ) : !document ? (
            <PreviewMessage
              icon={<FileWarning className="h-6 w-6" />}
              title="Nenhum documento para visualizar"
              description="Selecione uma proposta para gerar a pré-visualização."
            />
          ) : (
            <PreviewErrorBoundary key={content ?? ''}>
              {pages.map((page, index) => (
                <div
                  key={page.number}
                  ref={(element) => {
                    pageRefs.current[index] = element;
                  }}
                  className="mx-auto mb-6 w-fit max-w-full last:mb-0"
                >
                  <div
                    className="max-w-full overflow-x-auto rounded-sm border border-slate-300 bg-white shadow-md dark:border-slate-700"
                    style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 1020px' }}
                  >
                    <div
                      className={cn('px-10 py-12 font-mono text-[12.5px] leading-[19px] text-slate-900')}
                      style={{ width: `calc(${DOCUMENT_PAGE_CHARS_PER_LINE}ch + 5rem)` }}
                    >
                      {page.lines.map((line, lineIndex) => (
                        <div key={lineIndex} className="whitespace-pre">
                          {line || ' '}
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 text-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Página {page.number} de {pages.length}
                  </p>
                </div>
              ))}
            </PreviewErrorBoundary>
          )}
        </div>

        <DialogFooter className="border-t border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {onDownload && document && !buildError && (
            <Button type="button" className="bg-blue-600 text-white hover:bg-blue-700" onClick={onDownload}>
              <Download className="mr-2 h-4 w-4" />
              Baixar .txt
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
