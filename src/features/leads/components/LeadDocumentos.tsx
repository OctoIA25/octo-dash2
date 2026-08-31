/**
 * Upload e listagem de documentos do lead — seção "Documentação" do modal de
 * edição do Kanban, visível a partir da etapa de Propostas.
 *
 * Sem tabela própria: o Storage É a lista (bucket privado `lead-documentos`,
 * path `tenant/lead/arquivo`). Download sai por signed URL — nunca URL pública,
 * são documentos pessoais (RG, CPF, comprovantes).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useToast } from '@/hooks/use-toast';

const BUCKET = 'lead-documentos';
const MAX_SIZE = 20 * 1024 * 1024; // espelha o file_size_limit do bucket
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx';

interface StoredDoc {
  name: string;
  size: number | null;
}

interface LeadDocumentosProps {
  tenantId: string | undefined | null;
  leadId: string;
  canEdit: boolean;
}

const safeFilename = (name: string) => name.replace(/[^\w.-]+/g, '_').slice(0, 120);

const formatSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const LeadDocumentos = ({ tenantId, leadId, canEdit }: LeadDocumentosProps) => {
  const [docs, setDocs] = useState<StoredDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const folder = `${tenantId}/${leadId}`;

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(folder, { sortBy: { column: 'created_at', order: 'desc' } });
    if (error) {
      // Bucket ainda não criado (migration pendente) cai aqui — lista vazia + aviso no console.
      console.warn('⚠️ Não foi possível listar documentos do lead:', error.message);
      setDocs([]);
    } else {
      setDocs(
        (data ?? [])
          .filter((f) => f.name !== '.emptyFolderPlaceholder')
          .map((f) => ({ name: f.name, size: (f.metadata?.size as number) ?? null })),
      );
    }
    setIsLoading(false);
  }, [folder]);

  useEffect(() => {
    setIsLoading(true);
    refresh();
  }, [refresh]);

  const handleUpload = async (file: File) => {
    if (file.size > MAX_SIZE) {
      toast({
        title: 'Arquivo muito grande',
        description: `${(file.size / 1024 / 1024).toFixed(1)}MB — o limite é 20MB.`,
        variant: 'destructive',
      });
      return;
    }
    setIsUploading(true);
    const path = `${folder}/${Date.now()}-${safeFilename(file.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });
    setIsUploading(false);
    if (error) {
      toast({ title: 'Falha no upload', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: '📎 Documento anexado', description: file.name });
    refresh();
  };

  const handleDownload = async (name: string) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(`${folder}/${name}`, 300);
    if (error || !data?.signedUrl) {
      toast({
        title: 'Falha ao abrir documento',
        description: error?.message ?? 'URL não gerada.',
        variant: 'destructive',
      });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const handleDelete = async (name: string) => {
    const { error } = await supabase.storage.from(BUCKET).remove([`${folder}/${name}`]);
    if (error) {
      toast({ title: 'Falha ao remover', description: error.message, variant: 'destructive' });
      return;
    }
    setDocs((prev) => prev.filter((d) => d.name !== name));
  };

  return (
    <div>
      {isLoading ? (
        <p className="text-xs text-slate-400 py-1.5">Carregando documentos…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-slate-400 py-1.5">Nenhum documento anexado.</p>
      ) : (
        <ul className="space-y-1.5 mb-2">
          {docs.map((doc) => (
            <li
              key={doc.name}
              className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              <button
                type="button"
                onClick={() => handleDownload(doc.name)}
                className="flex-1 min-w-0 text-left text-xs text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                title={doc.name}
              >
                {/* remove o prefixo de timestamp do path — o usuário vê o nome original */}
                {doc.name.replace(/^\d+-/, '')}
              </button>
              <span className="text-[10px] text-slate-400 shrink-0">{formatSize(doc.size)}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(doc.name)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                  aria-label={`Remover ${doc.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <>
          {/* input nativo escondido — NÃO usar sr-only em input aqui (quebra layout) */}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = ''; // permite reenviar o mesmo arquivo
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 bg-white dark:bg-slate-900 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {isUploading ? 'Enviando…' : 'Anexar documento (PDF, imagem, Word — até 20MB)'}
          </button>
        </>
      )}
    </div>
  );
};
