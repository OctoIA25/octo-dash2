import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Save,
  Trash2,
  Upload,
  Loader2,
  Download,
  Pencil,
  Check,
  X as XIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { uploadFotoComMarca } from '@/lib/watermarkUpload';
import { useAuth } from '@/hooks/useAuth';
import { normalizeSiteUrl } from '@/lib/normalizeSiteUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { OctoDashLoader } from '@/components/ui/OctoDashLoader';
import { FotosUploader, type Foto } from '@/components/imoveis/FotosUploader';

interface Lancamento {
  id: string;
  tenant_id: string;
  nome: string;
  descricao: string | null;
  endereco_plantao: string | null;
  site_url: string | null;
  book_pdf: string | null;
  book_pdf_filename: string | null;
  fotos: Foto[];
  // Campos do Portal público (cards de empreendimento)
  cidade: string | null;
  bairro: string | null;
  estagio: string | null;
  construtora: string | null;
  dormitorios: string | null;
  specs: string | null;
  preco_texto: string | null;
  exclusivo: boolean;
  publicar_site: boolean;
}

const MAX_PDF_MB = 200;
const BUCKET = 'lancamentos-arquivos';

const isDataUrl = (s: string | null | undefined): s is string =>
  typeof s === 'string' && s.startsWith('data:');

const guessExtFromBlob = (blob: Blob, fallback = 'bin'): string => {
  const mime = blob.type || '';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return fallback;
};

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl);
  return res.blob();
};

const uploadBlobToStorage = async (
  blob: Blob,
  path: string,
): Promise<string | null> => {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: blob.type || 'application/octet-stream',
      upsert: true,
    });

  if (error) {
    console.error('Erro ao subir arquivo para Storage:', error);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl ?? null;
};

interface PendingPdf {
  blob: Blob;
  filename: string;
  previewUrl: string;
}

export const LancamentoViewPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const tenantId = user?.tenantId;

  const [lancamento, setLancamento] = useState<Lancamento | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [nome, setNome] = useState('');
  const [editandoNome, setEditandoNome] = useState(false);
  const [descricao, setDescricao] = useState('');
  const [enderecoPlantao, setEnderecoPlantao] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [cidade, setCidade] = useState('');
  const [bairro, setBairro] = useState('');
  const [estagio, setEstagio] = useState('');
  const [construtora, setConstrutora] = useState('');
  const [dormitorios, setDormitorios] = useState('');
  const [specs, setSpecs] = useState('');
  const [precoTexto, setPrecoTexto] = useState('');
  const [exclusivo, setExclusivo] = useState(false);
  const [publicarSite, setPublicarSite] = useState(true);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [bookPdf, setBookPdf] = useState<string | null>(null);
  const [bookFilename, setBookFilename] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  // PDF selecionado mas ainda não enviado pro Storage. Só vira URL pública no Save.
  const pendingPdfRef = useRef<PendingPdf | null>(null);

  const load = useCallback(async () => {
    if (!id || !tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('lancamentos')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const normalized: Lancamento = {
      ...data,
      fotos: Array.isArray(data.fotos) ? (data.fotos as Foto[]) : [],
    };
    setLancamento(normalized);
    setNome(normalized.nome);
    setDescricao(normalized.descricao ?? '');
    setEnderecoPlantao(normalized.endereco_plantao ?? '');
    setSiteUrl(normalized.site_url ?? '');
    setCidade(normalized.cidade ?? '');
    setBairro(normalized.bairro ?? '');
    setEstagio(normalized.estagio ?? '');
    setConstrutora(normalized.construtora ?? '');
    setDormitorios(normalized.dormitorios ?? '');
    setSpecs(normalized.specs ?? '');
    setPrecoTexto(normalized.preco_texto ?? '');
    setExclusivo(normalized.exclusivo ?? false);
    setPublicarSite(normalized.publicar_site ?? true);
    setFotos(normalized.fotos);
    setBookPdf(normalized.book_pdf);
    setBookFilename(normalized.book_pdf_filename);
    setLoading(false);
  }, [id, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handlePdfSelected = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Selecione um arquivo PDF.');
      return;
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      alert(`O PDF excede o limite de ${MAX_PDF_MB}MB.`);
      return;
    }
    // Preview local imediato (não vai pro banco). O upload pro Storage
    // acontece no Save, mantendo o UPDATE da tabela pequeno.
    if (pendingPdfRef.current?.previewUrl) {
      URL.revokeObjectURL(pendingPdfRef.current.previewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setBookPdf(previewUrl);
    setBookFilename(file.name);
    pendingPdfRef.current = { blob: file, filename: file.name, previewUrl };
  };

  const handleRemovePdf = () => {
    if (pendingPdfRef.current?.previewUrl) {
      URL.revokeObjectURL(pendingPdfRef.current.previewUrl);
    }
    pendingPdfRef.current = null;
    setBookPdf(null);
    setBookFilename(null);
    if (pdfInputRef.current) pdfInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!id || !tenantId) return;
    const nomeTrim = nome.trim();
    if (!nomeTrim) {
      alert('Informe o nome do lançamento.');
      return;
    }
    const siteUrlNormalizado = normalizeSiteUrl(siteUrl);
    if (siteUrlNormalizado === undefined) {
      alert('O link do site do lançamento é inválido. Use um endereço como https://seusite.com.br/lancamento.');
      return;
    }
    setIsSaving(true);

    try {
      // 1) PDF: se há um pendente (selecionado nesta sessão), envia pro Storage.
      let bookPdfUrl = bookPdf;
      let bookPdfName = bookFilename;
      const pending = pendingPdfRef.current;
      if (pending) {
        const ext = guessExtFromBlob(pending.blob, 'pdf');
        const path = `${tenantId}/${id}/book-${Date.now()}.${ext}`;
        const publicUrl = await uploadBlobToStorage(pending.blob, path);
        if (!publicUrl) {
          alert('Falha ao enviar o PDF para o storage. Tente novamente.');
          setIsSaving(false);
          return;
        }
        bookPdfUrl = publicUrl;
        bookPdfName = pending.filename;
      }

      // 2) Fotos: imagens novas chegam como data URL (vindo do FotosUploader).
      //    Sobe cada uma pro Storage e substitui pela URL pública.
      const fotosFinais: Foto[] = [];
      for (let i = 0; i < fotos.length; i++) {
        const f = fotos[i];
        if (isDataUrl(f.url)) {
          const blob = await dataUrlToBlob(f.url);
          const ext = guessExtFromBlob(blob, 'jpg');
          const path = `${tenantId}/${id}/foto-${Date.now()}-${i}.${ext}`;
          // Pipeline de marca d'água (fallback: upload cru). Só fotos — o book/PDF não passa aqui.
          const { url: publicUrl, id: photoId } = await uploadFotoComMarca({
            blob,
            tenantId,
            propertyId: id,
            rawUpload: () => uploadBlobToStorage(blob, path),
          });
          if (!publicUrl) {
            alert(`Falha ao enviar a imagem ${i + 1}. Tente novamente.`);
            setIsSaving(false);
            return;
          }
          fotosFinais.push({ ...f, url: publicUrl, id: photoId });
        } else {
          fotosFinais.push(f);
        }
      }

      // 3) Agora o UPDATE só carrega texto e URLs — payload pequeno.
      const { error } = await supabase
        .from('lancamentos')
        .update({
          nome: nomeTrim,
          descricao: descricao || null,
          endereco_plantao: enderecoPlantao.trim() || null,
          site_url: siteUrlNormalizado,
          cidade: cidade.trim() || null,
          bairro: bairro.trim() || null,
          estagio: estagio.trim() || null,
          construtora: construtora.trim() || null,
          dormitorios: dormitorios.trim() || null,
          specs: specs.trim() || null,
          preco_texto: precoTexto.trim() || null,
          exclusivo: exclusivo,
          publicar_site: publicarSite,
          book_pdf: bookPdfUrl,
          book_pdf_filename: bookPdfName,
          fotos: fotosFinais,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('Erro ao salvar lançamento:', error);
        alert('Não foi possível salvar. Tente novamente.');
        setIsSaving(false);
        return;
      }

      // Atualiza estado local com URLs persistentes e limpa o pending.
      if (pending) {
        URL.revokeObjectURL(pending.previewUrl);
        pendingPdfRef.current = null;
      }
      setBookPdf(bookPdfUrl);
      setBookFilename(bookPdfName);
      setFotos(fotosFinais);
      setSiteUrl(siteUrlNormalizado ?? '');
      setEditandoNome(false);
      setSavedAt(new Date());
    } catch (err) {
      console.error('Erro inesperado ao salvar lançamento:', err);
      alert('Erro inesperado ao salvar. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <OctoDashLoader message="Carregando lançamento..." size="lg" />
      </div>
    );
  }

  if (notFound || !lancamento) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-text-primary font-medium">Lançamento não encontrado.</p>
        <Button variant="outline" onClick={() => navigate('/imoveis?tab=lancamentos')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para Lançamentos
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate('/imoveis?tab=lancamentos')}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {editandoNome ? (
            <div className="flex items-center gap-2 min-w-0">
              <Input
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="h-10 text-xl font-bold min-w-[280px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setEditandoNome(false);
                  if (e.key === 'Escape') {
                    setNome(lancamento.nome);
                    setEditandoNome(false);
                  }
                }}
              />
              <Button size="icon" variant="ghost" onClick={() => setEditandoNome(false)}>
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setNome(lancamento.nome);
                  setEditandoNome(false);
                }}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-2xl font-bold text-text-primary truncate">{nome}</h1>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditandoNome(true)}
                aria-label="Editar nome"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-xs text-text-secondary">
              Salvo às {savedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" /> Salvar
              </>
            )}
          </Button>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-text-primary">Book do Lançamento (PDF)</h2>
        </div>
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            void handlePdfSelected(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {bookPdf ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
              <FileText className="h-8 w-8 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text-primary truncate">
                  {bookFilename || 'book.pdf'}
                </p>
                <p className="text-xs text-text-secondary">PDF carregado</p>
              </div>
              <a
                href={bookPdf}
                download={bookFilename || 'book.pdf'}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <Download className="h-4 w-4" /> Baixar
              </a>
              <Button variant="outline" size="sm" onClick={() => pdfInputRef.current?.click()}>
                Substituir
              </Button>
              <Button variant="ghost" size="icon" onClick={handleRemovePdf} aria-label="Remover PDF">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <div className="rounded-lg overflow-hidden border border-border">
              <iframe src={bookPdf} title="Book do lançamento" className="w-full h-[600px]" />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            className="w-full border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors"
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-text-primary">Clique para enviar o PDF do book</p>
            <p className="text-xs text-text-secondary mt-1">Até {MAX_PDF_MB}MB</p>
          </button>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">Descrição</h2>
        <Textarea
          placeholder="Escreva detalhes sobre o lançamento: diferenciais, localização, tipologias, prazos..."
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          rows={8}
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Dados do Portal</h2>
          <p className="text-xs text-text-secondary mt-1">
            Informações exibidas nos cards de empreendimento do site público. Deixe em branco
            para omitir do card.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="lanc-cidade" className="text-sm font-medium text-text-primary">Cidade</label>
            <Input
              id="lanc-cidade"
              placeholder="Ex: São Paulo"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lanc-bairro" className="text-sm font-medium text-text-primary">Bairro</label>
            <Input
              id="lanc-bairro"
              placeholder="Ex: Vila Mariana"
              value={bairro}
              onChange={(e) => setBairro(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lanc-estagio" className="text-sm font-medium text-text-primary">Estágio</label>
            <Input
              id="lanc-estagio"
              placeholder="Ex: Em obras / Lançamento / Pronto"
              value={estagio}
              onChange={(e) => setEstagio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lanc-construtora" className="text-sm font-medium text-text-primary">Construtora</label>
            <Input
              id="lanc-construtora"
              placeholder="Ex: Incorporadora XYZ"
              value={construtora}
              onChange={(e) => setConstrutora(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lanc-dormitorios" className="text-sm font-medium text-text-primary">Dormitórios</label>
            <Input
              id="lanc-dormitorios"
              placeholder="Ex: 2 e 3 dorms"
              value={dormitorios}
              onChange={(e) => setDormitorios(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lanc-preco" className="text-sm font-medium text-text-primary">Preço (texto)</label>
            <Input
              id="lanc-preco"
              placeholder="Ex: Consultar valor / a partir de R$ 500 mil"
              value={precoTexto}
              onChange={(e) => setPrecoTexto(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="lanc-specs" className="text-sm font-medium text-text-primary">Specs</label>
            <Input
              id="lanc-specs"
              placeholder="Ex: 58–105 m² · 2 e 3 dorms"
              value={specs}
              onChange={(e) => setSpecs(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 pt-1">
          <label
            htmlFor="lanc-exclusivo"
            className="flex items-start gap-3 rounded-lg border border-transparent p-3 -mx-1 hover:bg-muted/40 hover:border-border transition-colors cursor-pointer"
          >
            <Checkbox
              id="lanc-exclusivo"
              checked={exclusivo}
              onCheckedChange={(v) => setExclusivo(v === true)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-text-primary">Destaque</span>
              <span className="block text-xs text-text-secondary">
                Exibe um selo de destaque no card do site.
              </span>
            </span>
          </label>
          <label
            htmlFor="lanc-publicar"
            className="flex items-start gap-3 rounded-lg border border-transparent p-3 -mx-1 hover:bg-muted/40 hover:border-border transition-colors cursor-pointer"
          >
            <Checkbox
              id="lanc-publicar"
              checked={publicarSite}
              onCheckedChange={(v) => setPublicarSite(v === true)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-text-primary">Publicar no site</span>
              <span className="block text-xs text-text-secondary">
                Quando desmarcado, o lançamento não aparece no site público.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Link do site do lançamento{' '}
            <span className="text-sm font-normal text-text-secondary">(opcional)</span>
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Landing page do empreendimento. A Lia envia esse link para o cliente nos atendimentos.
            Se ficar em branco, ela não oferece o link.
          </p>
        </div>
        <Input
          type="url"
          inputMode="url"
          placeholder="Ex: https://seusite.com.br/residencial-vista-mar"
          value={siteUrl}
          onChange={(e) => setSiteUrl(e.target.value)}
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            Endereço do plantão{' '}
            <span className="text-sm font-normal text-text-secondary">(opcional)</span>
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Endereço do estande de vendas do lançamento. Se ficar em branco, a Lia informa ao
            cliente que o corretor entrará em contato para passar o endereço e combinar a melhor data.
          </p>
        </div>
        <Input
          placeholder="Ex: Av. Brasil, 1000 — Centro, São Paulo/SP"
          value={enderecoPlantao}
          onChange={(e) => setEnderecoPlantao(e.target.value)}
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Imagens</h2>
          <p className="text-xs text-text-secondary mt-1">
            Envie várias imagens de uma vez. Em cada uma, preencha a legenda com o cômodo
            (ex: Sala, Cozinha, Banheiro).
          </p>
        </div>
        <FotosUploader fotos={fotos} onChange={setFotos} inputId="lancamento-fotos" />
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} size="lg">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" /> Salvar lançamento
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default LancamentoViewPage;
