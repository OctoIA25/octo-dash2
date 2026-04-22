/**
 * Página de Edição de Estudo de Mercado
 * Sub-aba para editar estudos salvos
 * 
 * Fluxo:
 * 1. Lista estudos salvos para seleção
 * 2. Ao selecionar, abre tela split: Preview (esquerda) + Edição acordeão (direita)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  listarEstudos,
  carregarEstudo,
  salvarEstudo,
  salvarRelatorioHtml,
  uploadFotoAmostra,
  type EstudoMercadoRow,
  type EstudoComAmostras,
  type AmostraRow,
} from '../services/estudoMercadoService';
import { generateReport } from '@/utils/generateReport';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  FileText,
  Calendar,
  User,
  MapPin,
  Home,
  Ruler,
  BarChart3,
  Star,
  Save,
  Loader2,
  Search,
  Trash2,
  Download,
  ExternalLink,
  Send,
  Image as ImageIcon,
  Upload,
  X,
} from 'lucide-react';

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// ============================================================================
// Componente Accordion Section
// ============================================================================
interface AccordionProps {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const AccordionSection = ({ title, icon, badge, children, defaultOpen = false }: AccordionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="text-base font-bold text-gray-800 dark:text-slate-200">{title}</span>
          {badge && (
            <span className="text-xs bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300 px-2 py-0.5 rounded-full font-semibold">{badge}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400 dark:text-slate-500" /> : <ChevronDown className="w-5 h-5 text-gray-400 dark:text-slate-500" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-gray-100 dark:border-slate-800 pt-4">{children}</div>}
    </div>
  );
};

// ============================================================================
// Input Field reutilizável
// ============================================================================
const Field = ({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string | number; onChange: (v: string) => void; placeholder?: string; type?: string;
}) => (
  <div>
    <label className="text-xs font-semibold text-gray-600 dark:text-slate-400 block mb-1.5">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-11 px-4 text-sm text-gray-700 dark:text-slate-300 placeholder-gray-400 dark:placeholder-slate-500 border border-gray-200 dark:border-slate-800 rounded-xl bg-gray-50/50 dark:bg-slate-950 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
    />
  </div>
);

// ============================================================================
// Componente Principal
// ============================================================================
export const EstudoMercadoAgentePage = () => {
  const { user } = useAuthContext();
  const tenantId = user?.tenantId || '';

  // Estado: lista ou edição
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [estudos, setEstudos] = useState<EstudoComAmostras[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Estado da edição
  const [estudo, setEstudo] = useState<EstudoComAmostras | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Campos editáveis
  const [corretorNome, setCorretorNome] = useState('');
  const [corretorCreci, setCorretorCreci] = useState('');
  const [nomeCliente, setNomeCliente] = useState('');
  const [telefoneCliente, setTelefoneCliente] = useState('');
  const [emailCliente, setEmailCliente] = useState('');
  const [enderecoImovel, setEnderecoImovel] = useState('');
  const [tipoImovel, setTipoImovel] = useState('');
  const [metragemImovel, setMetragemImovel] = useState(0);
  const [correcaoMercado, setCorrecaoMercado] = useState(0);
  const [margemExclusividade, setMargemExclusividade] = useState(0);
  const [observacoes, setObservacoes] = useState('');
  const [amostras, setAmostras] = useState<AmostraRow[]>([]);
  const [amostraLoading, setAmostraLoading] = useState<Record<number, boolean>>({});
  const [uploadLoading, setUploadLoading] = useState<Record<number, boolean>>({});
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Carregar lista de estudos
  const fetchEstudos = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const data = await listarEstudos(tenantId);
    // Carregar amostras para cada estudo
    const estudosComAmostras = await Promise.all(
      data.map(async (estudo) => {
        const estudoCompleto = await carregarEstudo(estudo.id);
        return estudoCompleto || { ...estudo, amostras: [] };
      })
    );
    setEstudos(estudosComAmostras);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchEstudos(); }, [fetchEstudos]);

  // Selecionar estudo para edição
  const handleSelectEstudo = async (id: string) => {
    setLoading(true);
    const data = await carregarEstudo(id);
    if (data) {
      setEstudo(data);
      setCorretorNome(data.corretor_nome || '');
      setCorretorCreci(data.corretor_creci || '');
      setNomeCliente(data.nome_cliente || '');
      setTelefoneCliente(data.corretor_telefone || '');
      setEmailCliente(data.email_cliente || '');
      setEnderecoImovel(data.endereco_imovel || '');
      setTipoImovel('');
      setMetragemImovel(data.metragem_imovel || 0);
      setCorrecaoMercado(data.correcao_mercado || 0);
      setMargemExclusividade(data.margem_exclusividade || 0);
      setObservacoes(data.observacoes || '');
      setAmostras(data.amostras || []);
      setView('edit');
    }
    setLoading(false);
  };

  // Salvar alterações
  const handleSave = async () => {
    if (!estudo || !tenantId) return;
    setSaving(true);
    setSaveMsg('');

    const mediaPorM2 = amostras.length > 0
      ? amostras.reduce((sum, a) => sum + (a.metragem > 0 ? a.valor_total / a.metragem : 0), 0) / amostras.filter(a => a.metragem > 0).length || 0
      : estudo.media_por_m2;
    const valorBase = mediaPorM2 * metragemImovel;
    const valorMercado = valorBase * (1 + correcaoMercado / 100);
    const valorExclusividade = valorMercado * (1 + margemExclusividade / 100);

    const result = await salvarEstudo({
      tenantId,
      corretorId: estudo.corretor_id,
      corretorNome,
      corretorEmail: estudo.corretor_email || '',
      nomeCliente,
      emailCliente,
      enderecoImovel,
      observacoes,
      metragemImovel,
      correcaoMercado,
      margemExclusividade,
      mediaPorM2,
      valorBase,
      valorMercado,
      valorExclusividade,
      valorFinal: valorExclusividade > 0 ? valorExclusividade : valorMercado,
      relatorioHtml: estudo.relatorio_html,
      status: estudo.status,
      amostras: amostras.map((a, i) => ({
        ordem: i + 1,
        link: a.link || '',
        valorTotal: a.valor_total,
        metragem: a.metragem,
        estado: a.estado || '',
        cidade: a.cidade || '',
        bairro: a.bairro || '',
        condominio: a.condominio || '',
        rua: a.rua || '',
        tipo: a.tipo || '',
        diferenciais: a.diferenciais || '',
        imagemUrl: a.imagem_url || '',
        imagemZapImoveis: a.imagem_zap_imoveis || '',
      })),
    }, estudo.id);

    setSaving(false);
    if (result.error) {
      setSaveMsg(`Erro: ${result.error}`);
    } else {
      setSaveMsg('Salvo com sucesso!');
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  // Baixar relatório com alterações
  const handleDownload = () => {
    if (!estudo) return;

    const mediaPorM2 = amostras.length > 0
      ? amostras.reduce((sum, a) => sum + (a.metragem > 0 ? a.valor_total / a.metragem : 0), 0) / (amostras.filter(a => a.metragem > 0).length || 1)
      : estudo.media_por_m2;
    const valorBase = mediaPorM2 * metragemImovel;
    const valorMercado = valorBase * (1 + correcaoMercado / 100);
    const valorExclusividade = valorMercado * (1 + margemExclusividade / 100);

    const html = generateReport({
      amostras: amostras.map(a => ({
        link: a.link || '',
        valorTotal: a.valor_total,
        metragem: a.metragem,
        estado: a.estado || '',
        cidade: a.cidade || '',
        bairro: a.bairro || '',
        condominio: a.condominio || '',
        rua: a.rua || '',
        imagem: a.imagem_url || undefined,
        imagemZapImoveis: a.imagem_zap_imoveis || undefined,
        diferenciais: a.diferenciais || undefined,
        tipo: a.tipo || undefined,
      })),
      metragemImovel,
      correcaoMercado,
      margemExclusividade,
      nomeCliente,
      enderecoImovel,
      observacoes,
      mediaPorM2,
      valorBase,
      valorMercado,
      valorExclusividade,
      corretorNome,
      corretorEmail: estudo.corretor_email || '',
      corretorTelefone: telefoneCliente,
    }, { skipDownload: true });

    if (!html) return;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Relatorio_${nomeCliente || 'estudo'}_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Enviar link para o webhook e preencher automaticamente
  const handleFetchImovelData = useCallback(async (estudoId: string, link: string) => {
    if (!link || !link.trim()) {
      alert('Insira um link válido antes de enviar');
      return;
    }

    // Verificar se é link do Imóvel Web
    if (link.toLowerCase().includes('imovelweb')) {
      alert('Links do Imóvel Web estão em manutenção no preenchimento automático. Por favor, preencha os dados manualmente ou utilize links de outros portais.');
      return;
    }

    try {
      const response = await fetch('/api/v1/scrape-imovel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: link }),
      });

      if (!response.ok) {
        throw new Error(`Erro na requisição: ${response.status}`);
      }

      const rawData = await response.json();

      // Normalizar resposta - pode vir como array ou objeto único
      const data = Array.isArray(rawData) ? rawData[0] : rawData;
      
      if (!data) {
        throw new Error('Resposta vazia do webhook');
      }

      // Atualizar a primeira amostra do estudo com os dados do webhook
      setEstudos(prev => prev.map(estudo => {
        if (estudo.id !== estudoId) return estudo;
        const amostrasAtualizadas = estudo.amostras.map((amostra, idx) => {
          if (idx !== 0) return amostra;
          
          // Extrair valor numérico de strings se necessário
          const parseNumber = (val: unknown): number => {
            if (typeof val === 'number') return val;
            if (typeof val === 'string') {
              const cleaned = val.replace(/[^\d.,]/g, '').replace(',', '.');
              return parseFloat(cleaned) || 0;
            }
            return 0;
          };

          return {
            ...amostra,
            valor_total: parseNumber(data.valor_total) || amostra.valor_total,
            metragem: parseNumber(data.metragem) || amostra.metragem,
            estado: data.estado || amostra.estado,
            cidade: data.cidade || amostra.cidade,
            bairro: data.bairro || amostra.bairro,
            condominio: data.condominio || amostra.condominio,
            rua: data.rua || amostra.rua,
            tipo: data.tipo || amostra.tipo,
            diferenciais: data.diferenciais || amostra.diferenciais,
            imagem_url: data.imagem_url || amostra.imagem_url,
            imagem_zap_imoveis: data.imagem_zap_imoveis || amostra.imagem_zap_imoveis,
          };
        });
        
        return { ...estudo, amostras: amostrasAtualizadas };
      }));

      alert('Dados do imóvel preenchidos com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao buscar dados do imóvel:', error);
      alert('Erro ao buscar dados do imóvel. Tente novamente.');
    }
  }, []);

  // Upload de foto do PC
  const handleUploadFoto = useCallback(async (idx: number, file: File) => {
    if (!estudo) return;
    setUploadLoading(prev => ({ ...prev, [idx]: true }));
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        const path = `${tenantId}/${estudo.id}/amostra-${idx}.jpg`;
        const publicUrl = await uploadFotoAmostra(dataUrl, path);
        const novaFoto = publicUrl || dataUrl;
        // Limpar imagem_zap_imoveis para que o relatório use a nova foto do PC
        setAmostras(prev => prev.map((a, i) =>
          i === idx ? { ...a, imagem_url: novaFoto, imagem_zap_imoveis: '' } : a
        ));
        setUploadLoading(prev => ({ ...prev, [idx]: false }));
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadLoading(prev => ({ ...prev, [idx]: false }));
    }
  }, [estudo, tenantId]);

  // Remover foto
  const handleRemoverFoto = useCallback((idx: number) => {
    setAmostras(prev => prev.map((a, i) =>
      i === idx ? { ...a, imagem_url: '', imagem_zap_imoveis: '' } : a
    ));
  }, []);

  // Enviar link de uma amostra específica (modo edição) para o webhook
  const handleFetchAmostraData = useCallback(async (idx: number, link: string) => {
    if (!link || !link.trim()) {
      alert('Insira um link válido antes de enviar');
      return;
    }
    if (link.toLowerCase().includes('imovelweb')) {
      alert('Links do Imóvel Web estão em manutenção. Use links de outros portais.');
      return;
    }

    setAmostraLoading(prev => ({ ...prev, [idx]: true }));

    try {
      const WEBHOOK_URL = '/api/v1/scrape-imovel';
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link }),
      });

      if (!response.ok) throw new Error(`Erro: ${response.status}`);

      const rawData = await response.json();
      const data = Array.isArray(rawData) ? rawData[0] : rawData;
      if (!data) throw new Error('Resposta vazia');

      const parseNumber = (val: unknown): number => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          const cleaned = val.replace(/[^\d.,]/g, '').replace(',', '.');
          return parseFloat(cleaned) || 0;
        }
        return 0;
      };

      const getString = (val: string | null | undefined, fallback: string): string =>
        val && val !== 'null' ? val : fallback;

      setAmostras(prev => prev.map((a, i) => {
        if (i !== idx) return a;
        return {
          ...a,
          link: link,
          valor_total: parseNumber(data['Valor Total (R$)']) || a.valor_total,
          metragem: parseNumber(data['Metragem (m²)']) || a.metragem,
          estado: getString(data.estado, a.estado || ''),
          cidade: getString(data.cidade, a.cidade || ''),
          bairro: getString(data.bairro, a.bairro || ''),
          condominio: getString(data.condominio, a.condominio || ''),
          rua: getString(data.rua, a.rua || ''),
          tipo: getString(data.tipo, a.tipo || ''),
          diferenciais: getString(data.diferenciais, a.diferenciais || ''),
          imagem_url: getString(data.imagem, a.imagem_url || ''),
          imagem_zap_imoveis: getString(data.imagemzapimoveis, a.imagem_zap_imoveis || ''),
        };
      }));
    } catch (error) {
      console.error('❌ Erro ao buscar dados:', error);
      alert('Erro ao buscar dados do imóvel. Tente novamente.');
    } finally {
      setAmostraLoading(prev => ({ ...prev, [idx]: false }));
    }
  }, []);

  // Atualizar amostra
  const updateAmostra = (index: number, field: keyof AmostraRow, value: string | number) => {
    setAmostras(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  };

  // Filtrar estudos
  const filtered = estudos.filter(e => {
    const term = searchTerm.toLowerCase();
    return (
      (e.nome_cliente || '').toLowerCase().includes(term) ||
      (e.endereco_imovel || '').toLowerCase().includes(term) ||
      (e.corretor_nome || '').toLowerCase().includes(term)
    );
  });

  // ============================================================================
  // RENDER: Tela de Listagem
  // ============================================================================
  if (view === 'list') {
    return (
      <div className="h-full w-full overflow-y-auto" style={{ backgroundColor: 'var(--bg-secondary, #f5f6fa)' }}>
        <div className="max-w-5xl mx-auto p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Editar Estudo de Mercado</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Selecione um estudo para visualizar e editar</p>
          </div>

          {/* Busca */}
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cliente, endereço ou corretor..."
              className="w-full h-11 pl-11 pr-4 text-sm border border-gray-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>

          {/* Lista de estudos */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20">
              <FileText className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-slate-400 font-medium">
                {searchTerm ? 'Nenhum estudo encontrado' : 'Nenhum estudo salvo ainda'}
              </p>
              <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">
                {searchTerm ? 'Tente outra busca' : 'Crie um estudo na aba "Avaliação" primeiro'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((e) => {
                // Buscar primeira amostra para foto e link
                const primeiraAmostra = e.amostras && e.amostras.length > 0 ? e.amostras[0] : null;
                const fotoUrl = primeiraAmostra?.imagem_url || primeiraAmostra?.imagem_zap_imoveis;
                const linkImovel = primeiraAmostra?.link;
                
                return (
                  <div
                    key={e.id}
                    className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden hover:border-blue-300 hover:shadow-md transition-all group"
                  >
                    <div className="flex">
                      {/* Foto do imóvel */}
                      <div className="w-24 h-24 bg-gray-100 dark:bg-slate-800 flex-shrink-0 relative">
                        {fotoUrl ? (
                          <img
                            src={fotoUrl}
                            alt="Foto do imóvel"
                            className="w-full h-full object-cover"
                            onError={(ev) => {
                              ev.currentTarget.style.display = 'none';
                              ev.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        {!fotoUrl && (
                          <div className="flex items-center justify-center h-full text-gray-400 dark:text-slate-500">
                            <ImageIcon className="w-8 h-8" />
                          </div>
                        )}
                      </div>
                      
                      {/* Conteúdo principal */}
                      <div className="flex-1 p-4 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                e.status === 'finalizado' ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-300'
                              }`}>
                                {e.status === 'finalizado' ? 'Finalizado' : 'Rascunho'}
                              </span>
                              <span className="text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(e.created_at)}
                              </span>
                            </div>
                            <p className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">
                              {e.nome_cliente || 'Cliente não informado'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-slate-400 truncate mt-0.5">
                              {e.endereco_imovel || 'Endereço não informado'}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 dark:text-slate-500">
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {e.corretor_nome}
                              </span>
                              <span className="flex items-center gap-1">
                                <Ruler className="w-3 h-3" />
                                {e.metragem_imovel}m²
                              </span>
                            </div>
                          </div>
                          <div className="text-right ml-4 flex-shrink-0">
                            <p className="text-lg font-bold text-green-600 dark:text-green-400">
                              {formatCurrency(e.valor_final || e.valor_mercado || 0)}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-slate-500">Valor final</p>
                          </div>
                        </div>

                        {/* Link e ações */}
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
                          {linkImovel ? (
                            <a
                              href={linkImovel}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(ev) => ev.stopPropagation()}
                              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Ver imóvel
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-slate-500">Sem link</span>
                          )}
                          <div className="flex items-center gap-2">
                            {linkImovel && (
                              <button
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  handleFetchImovelData(e.id, linkImovel);
                                }}
                                className="rounded bg-blue-100 border border-blue-300 flex items-center justify-center flex-shrink-0 hover:bg-blue-200 hover:border-blue-400 transition-colors"
                                style={{ width: '32px', height: '32px', minWidth: '32px', minHeight: '32px' }}
                                title="Buscar dados do imóvel"
                              >
                                <Send style={{ width: '18px', height: '18px', minWidth: '18px', minHeight: '18px' }} className="text-blue-600" />
                              </button>
                            )}
                            <button
                              onClick={() => handleSelectEstudo(e.id)}
                              className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                            >
                              Editar estudo
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // RENDER: Tela de Edição (split: preview + formulário)
  // ============================================================================
  return (
    <div className="h-full w-full flex flex-col" style={{ backgroundColor: 'var(--bg-secondary, #f5f6fa)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800 flex-shrink-0">
        <button
          onClick={() => { setView('list'); setEstudo(null); }}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para lista
        </button>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span className={`text-xs font-semibold ${saveMsg.startsWith('Erro') ? 'text-red-500' : 'text-green-500'}`}>
              {saveMsg}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Alterações
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-950/60 hover:bg-green-200 dark:hover:bg-green-900/60 border border-green-300 dark:border-green-800 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Baixar Relatório
          </button>
        </div>
      </div>

      {/* Split layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Preview do relatório */}
        <div className="flex-1 flex flex-col border-r border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="px-4 py-2 bg-gray-50 dark:bg-slate-950 border-b border-gray-200 dark:border-slate-800 flex-shrink-0">
            <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Pré-visualização</p>
          </div>
          <div className="flex-1 overflow-hidden">
            {estudo?.relatorio_html ? (
              <iframe
                ref={iframeRef}
                srcDoc={estudo.relatorio_html}
                className="w-full h-full border-0"
                title="Preview do relatório"
                sandbox="allow-same-origin"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 dark:text-slate-500">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-slate-600" />
                  <p className="font-medium">Nenhum relatório gerado</p>
                  <p className="text-sm mt-1">Gere o relatório na aba "Avaliação" primeiro</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Formulário de edição */}
        <div className="w-[420px] flex-shrink-0 overflow-y-auto p-4 space-y-3">
          <p className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-2">Editar Informações</p>

          {/* Dados do Corretor */}
          <AccordionSection
            title="Dados do Corretor"
            icon={<User className="w-5 h-5 text-blue-500" />}
          >
            <Field label="Nome do Corretor" value={corretorNome} onChange={setCorretorNome} placeholder="Nome completo" />
            <Field label="CRECI" value={corretorCreci} onChange={setCorretorCreci} placeholder="Ex: 123456" />
          </AccordionSection>

          {/* Dados do Cliente */}
          <AccordionSection
            title="Dados do Cliente"
            icon={<User className="w-5 h-5 text-orange-500" />}
          >
            <Field label="Nome do Cliente" value={nomeCliente} onChange={setNomeCliente} placeholder="Nome do cliente" />
            <Field label="Telefone" value={telefoneCliente} onChange={setTelefoneCliente} placeholder="(11) 99999-9999" />
            <Field label="E-mail" value={emailCliente} onChange={setEmailCliente} placeholder="Ex: cliente@email.com" />
          </AccordionSection>

          {/* Dados do Imóvel */}
          <AccordionSection
            title="Dados do Imóvel"
            icon={<MapPin className="w-5 h-5 text-green-500" />}
          >
            <Field label="Endereço" value={enderecoImovel} onChange={setEnderecoImovel} placeholder="Endereço completo" />
            <Field label="Tipo" value={tipoImovel} onChange={setTipoImovel} placeholder="Ex: Apartamento" />
            <Field label="Observações" value={observacoes} onChange={setObservacoes} placeholder="Observações sobre o imóvel" />
          </AccordionSection>

          {/* Área do Imóvel */}
          <AccordionSection
            title="Área do Imóvel"
            icon={<Ruler className="w-5 h-5 text-purple-500" />}
          >
            <Field label="Metragem (m²)" value={metragemImovel || ''} onChange={(v) => setMetragemImovel(Number(v) || 0)} placeholder="Ex: 89" type="number" />
          </AccordionSection>

          {/* Correção Mercadológica */}
          <AccordionSection
            title="Correção Mercadológica"
            icon={<BarChart3 className="w-5 h-5 text-red-500" />}
          >
            <Field label="Correção (%)" value={correcaoMercado || ''} onChange={(v) => setCorrecaoMercado(Number(v) || 0)} placeholder="Ex: 5" type="number" />
            <Field label="Margem Exclusividade (%)" value={margemExclusividade || ''} onChange={(v) => setMargemExclusividade(Number(v) || 0)} placeholder="Ex: 10" type="number" />
          </AccordionSection>

          {/* Propriedades Comparáveis */}
          <AccordionSection
            title="Propriedades Comparáveis"
            icon={<Star className="w-5 h-5 text-yellow-500" />}
            badge={`${amostras.length} propriedades`}
          >
            {amostras.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-3">Nenhuma amostra cadastrada</p>
            ) : (
              <div className="space-y-4">
                {amostras.map((amostra, idx) => (
                  <div key={amostra.id} className="bg-gray-50 dark:bg-slate-950 rounded-lg border border-gray-100 dark:border-slate-800 overflow-hidden">
                    {/* Header com foto e info */}
                    <div className="flex p-3 gap-3">
                      {/* Foto do imóvel + upload/remover */}
                      <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        {/* Input de arquivo oculto */}
                        <input
                          ref={el => { fileInputRefs.current[idx] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadFoto(idx, file);
                            e.target.value = '';
                          }}
                        />
                        {/* Thumbnail */}
                        <div className="w-16 h-16 bg-gray-200 dark:bg-slate-800 rounded-lg overflow-hidden">
                          {uploadLoading[idx] ? (
                            <div className="flex items-center justify-center h-full">
                              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                            </div>
                          ) : (amostra.imagem_url || amostra.imagem_zap_imoveis) ? (
                            <img
                              src={amostra.imagem_url || amostra.imagem_zap_imoveis}
                              alt={`Foto da amostra ${idx + 1}`}
                              className="w-full h-full object-cover"
                              onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-gray-400 dark:text-slate-500">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        {/* Botões Trocar e Tirar */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => fileInputRefs.current[idx]?.click()}
                            className="flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                            title="Selecionar foto do PC"
                          >
                            <Upload className="w-3 h-3" />
                            Trocar
                          </button>
                          {(amostra.imagem_url || amostra.imagem_zap_imoveis) && (
                            <>
                              <span className="text-gray-300 dark:text-slate-600 text-xs">|</span>
                              <button
                                onClick={() => handleRemoverFoto(idx)}
                                className="flex items-center gap-0.5 text-xs text-red-500 hover:text-red-600 transition-colors"
                                title="Remover foto"
                              >
                                <X className="w-3 h-3" />
                                Tirar
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Info e link editável */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-bold text-gray-500 dark:text-slate-400">Amostra {idx + 1}</p>
                          {amostra.link && (
                            <a
                              href={amostra.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Ver
                            </a>
                          )}
                        </div>
                        {/* Input de link + botão webhook */}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={amostra.link || ''}
                            onChange={(e) => updateAmostra(idx, 'link', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && amostra.link && !amostraLoading[idx]) {
                                handleFetchAmostraData(idx, amostra.link);
                              }
                            }}
                            placeholder="Cole o link do imóvel aqui..."
                            className="flex-1 h-8 px-3 text-xs text-gray-700 dark:text-slate-300 placeholder-gray-400 dark:placeholder-slate-500 border border-gray-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all min-w-0"
                          />
                          <button
                            onClick={() => {
                              if (amostra.link && !amostraLoading[idx]) {
                                handleFetchAmostraData(idx, amostra.link);
                              }
                            }}
                            className="rounded bg-blue-100 border border-blue-300 flex items-center justify-center flex-shrink-0 hover:bg-blue-200 transition-colors"
                            style={{ width: '32px', height: '32px', minWidth: '32px', minHeight: '32px' }}
                            title="Buscar dados do imóvel automaticamente"
                          >
                            {amostraLoading[idx]
                              ? <Loader2 style={{ width: '16px', height: '16px' }} className="text-blue-600 animate-spin" />
                              : <Send style={{ width: '16px', height: '16px', minWidth: '16px', minHeight: '16px' }} className="text-blue-600" />
                            }
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Campos editáveis */}
                    <div className="p-3 pt-0 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Field
                          label="Valor Total (R$)"
                          value={amostra.valor_total || ''}
                          onChange={(v) => updateAmostra(idx, 'valor_total', Number(v) || 0)}
                          type="number"
                        />
                        <Field
                          label="Metragem (m²)"
                          value={amostra.metragem || ''}
                          onChange={(v) => updateAmostra(idx, 'metragem', Number(v) || 0)}
                          type="number"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Cidade" value={amostra.cidade || ''} onChange={(v) => updateAmostra(idx, 'cidade', v)} />
                        <Field label="Bairro" value={amostra.bairro || ''} onChange={(v) => updateAmostra(idx, 'bairro', v)} />
                      </div>
                      <Field label="Rua" value={amostra.rua || ''} onChange={(v) => updateAmostra(idx, 'rua', v)} />
                      <Field label="Condomínio" value={amostra.condominio || ''} onChange={(v) => updateAmostra(idx, 'condominio', v)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AccordionSection>
        </div>
      </div>
    </div>
  );
};
