import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles, Trash2, FileText, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import type { Foto } from './FotosUploader';
import { toast } from 'sonner';

interface Lancamento {
  id: string;
  tenant_id: string;
  nome: string;
  descricao: string | null;
  book_pdf: string | null;
  book_pdf_filename: string | null;
  fotos: Foto[];
  created_at: string;
  updated_at: string;
}

export function LancamentosTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantId = user?.tenantId;

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadLancamentos = useCallback(async () => {
    if (!tenantId) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('lancamentos')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao carregar lançamentos:', error);
      setLancamentos([]);
    } else {
      setLancamentos(
        (data || []).map((row) => ({
          ...row,
          fotos: Array.isArray(row.fotos) ? row.fotos : [],
        })) as Lancamento[],
      );
    }
    setIsLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void loadLancamentos();
  }, [loadLancamentos]);

  // Recarrega as fotos quando o reprocessamento da marca d'água termina, para
  // refletir as URLs novas (marca aplicada/removida) sem refresh manual.
  useEffect(() => {
    const onDone = () => { void loadLancamentos(); };
    window.addEventListener('watermark:reprocess-done', onDone);
    return () => window.removeEventListener('watermark:reprocess-done', onDone);
  }, [loadLancamentos]);

  const handleCreate = async () => {
    const nome = novoNome.trim();
    if (!nome || !tenantId) return;
    setIsSaving(true);
    const { data, error } = await supabase
      .from('lancamentos')
      .insert({ tenant_id: tenantId, nome })
      .select('id')
      .single();

    setIsSaving(false);
    if (error || !data) {
      console.error('Erro ao criar lançamento:', error);
      toast('Não foi possível criar o lançamento. Tente novamente.');
      return;
    }

    setNovoNome('');
    setIsCreateOpen(false);
    navigate(`/imoveis/lancamentos/${data.id}`);
  };

  const handleDelete = async () => {
    if (!confirmDeleteId || !tenantId) return;
    const { error } = await supabase
      .from('lancamentos')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', confirmDeleteId);

    if (error) {
      console.error('Erro ao excluir lançamento:', error);
      alert('Não foi possível excluir o lançamento.');
    } else {
      setLancamentos((prev) => prev.filter((l) => l.id !== confirmDeleteId));
    }
    setConfirmDeleteId(null);
  };

  const capaDe = (l: Lancamento): string | null => {
    if (!l.fotos || l.fotos.length === 0) return null;
    const capa = l.fotos.find((f) => f.isCapa);
    return (capa ?? l.fotos[0])?.url ?? null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Lançamentos
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            Cadastre novos empreendimentos com book em PDF, imagens e descrição.
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Lançamento
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-text-secondary">Carregando lançamentos...</div>
      ) : lancamentos.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl bg-card/40">
          <Sparkles className="h-10 w-10 mx-auto text-text-secondary mb-3" />
          <p className="text-text-primary font-medium">Nenhum lançamento ainda</p>
          <p className="text-sm text-text-secondary mt-1">
            Clique em "Novo Lançamento" para criar o primeiro.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {lancamentos.map((l) => {
            const capa = capaDe(l);
            return (
              <div
                key={l.id}
                onClick={() => navigate(`/imoveis/lancamentos/${l.id}`)}
                className="group relative rounded-xl overflow-hidden border border-border bg-card hover:shadow-lg hover:border-primary/40 transition-all cursor-pointer"
              >
                <div className="aspect-video bg-muted relative overflow-hidden">
                  {capa ? (
                    <img
                      src={capa}
                      alt={l.nome}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-secondary">
                      <Sparkles className="h-10 w-10 opacity-40" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(l.id);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition"
                    aria-label="Excluir lançamento"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="p-3">
                  <h3 className="font-semibold text-text-primary truncate">{l.nome}</h3>
                  <div className="mt-2 flex items-center gap-3 text-xs text-text-secondary">
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {l.fotos?.length ?? 0} foto(s)
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {l.book_pdf ? 'Book' : 'Sem book'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={(open) => !isSaving && setIsCreateOpen(open)}>
        <DialogContent className="max-w-md z-[9999]">
          <DialogHeader>
            <DialogTitle>Novo Lançamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium text-text-primary">Nome do lançamento</label>
            <Input
              autoFocus
              placeholder="Ex: Residencial Vista Mar"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && novoNome.trim() && !isSaving) {
                  void handleCreate();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!novoNome.trim() || isSaving}>
              {isSaving ? 'Criando...' : 'Criar Lançamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O book, as imagens e os textos deste lançamento serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
