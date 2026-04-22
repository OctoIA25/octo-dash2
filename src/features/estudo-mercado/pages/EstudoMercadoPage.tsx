/**
 * EstudoMercadoPage - Ferramenta de Avaliação Imobiliária
 * Análise de mercado com amostras de imóveis concorrentes
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Star,
  Send,
  Pencil,
  Trash2,
  Plus,
  ToggleLeft,
  ToggleRight,
  Ruler,
  Calculator,
  BarChart3,
  Zap,
  X,
  Loader2,
  ChevronDown,
  MapPin,
  Home,
  Image as ImageIcon,
  ExternalLink,
  Settings,
  User,
  FileText,
  Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { generateReport } from '@/utils/generateReport';
import { useAuth } from '@/hooks/useAuth';
import {
  salvarEstudo,
  uploadFotoAmostra,
  type SalvarEstudoPayload,
  type AmostraPayload,
} from '../services/estudoMercadoService';
import { supabase } from '@/lib/supabaseClient';

// ============================================================================
// Constants
// ============================================================================

const WEBHOOK_URL = '/api/v1/scrape-imovel';

// ============================================================================
// Types
// ============================================================================

interface AmostraImovel {
  id: string;
  link: string;
  valorTotal: number;
  metragem: number;
  estado: string;
  cidade: string;
  bairro: string;
  condominio: string;
  rua: string;
  isLoading?: boolean;
  // Campos extras do webhook
  imagem?: string;
  imagemZapImoveis?: string;
  diferenciais?: string;
  localizacaoCompleta?: string;
  tipo?: string;
}

// Resposta esperada do webhook (baseada no screenshot)
interface WebhookResponseItem {
  rua?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  'Valor Total (R$)'?: number;
  'Metragem (m²)'?: number;
  imagem?: string;
  diferenciais?: string;
  localizacao_completa?: string | null;
  imagemzapimoveis?: string;
  condominio?: string | null;
  tipo?: string;
}

// Pode vir como array ou objeto único
type WebhookResponse = WebhookResponseItem | WebhookResponseItem[];

interface AvaliacaoConfig {
  metragemImovel: number;
  correcaoMercado: number;
  margemExclusividade: number;
}

interface DadosClienteImovel {
  nomeCliente: string;
  emailCliente: string;
  enderecoImovel: string;
  observacoes: string;
}

// ============================================================================
// Helpers
// ============================================================================

const createEmptyAmostra = (): AmostraImovel => ({
  id: crypto.randomUUID(),
  link: '',
  valorTotal: 0,
  metragem: 0,
  estado: '',
  cidade: '',
  bairro: '',
  condominio: '',
  rua: '',
  isLoading: false,
});

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// ============================================================================
// Component
// ============================================================================

interface DadosCorretor {
  nome: string;
  email: string;
  telefone: string;
  foto: string;
  equipe: string;
  role: string;
}

export const EstudoMercadoPage = () => {
  // Auth - dados do corretor logado
  const { user } = useAuth();

  // Dados completos do corretor (buscados do tenant_brokers)
  const [dadosCorretor, setDadosCorretor] = useState<DadosCorretor>({
    nome: '', email: '', telefone: '', foto: '', equipe: '', role: '',
  });

  // Buscar dados do corretor ao carregar
  useEffect(() => {
    if (!user) return;

    const fetchCorretor = async () => {
      // Buscar dados do tenant_brokers
      try {
        const { data: broker } = await supabase
          .from('tenant_brokers')
          .select('name, email, phone, photo_url')
          .eq('auth_user_id', user.id)
          .eq('tenant_id', user.tenantId)
          .maybeSingle();

        setDadosCorretor({
          nome: broker?.name || user.name || user.email,
          email: broker?.email || user.email,
          telefone: broker?.phone || '',
          foto: broker?.photo_url || '',
          equipe: user.equipe || '',
          role: user.systemRole || user.role || '',
        });
      } catch {
        // Fallback para dados do useAuth
        setDadosCorretor({
          nome: user.name || user.email,
          email: user.email,
          telefone: '',
          foto: '',
          equipe: user.equipe || '',
          role: user.systemRole || user.role || '',
        });
      }
    };

    fetchCorretor();
  }, [user]);

  // Estado das amostras - inicia com 5 linhas padrão
  const [amostras, setAmostras] = useState<AmostraImovel[]>(() =>
    Array.from({ length: 5 }, () => createEmptyAmostra())
  );

  // Estado da sidebar de avaliação
  const [config, setConfig] = useState<AvaliacaoConfig>({
    metragemImovel: 0,
    correcaoMercado: -5,
    margemExclusividade: 0,
  });

  // Toggle de preenchimento automático (visual apenas por enquanto)
  const [autoFill, setAutoFill] = useState(false);

  // Estados para inputs de porcentagem (permite digitar livremente)
  const [correcaoInput, setCorrecaoInput] = useState('-5');
  const [margemInput, setMargemInput] = useState('');

  // Estado para expandir/recolher o resumo dos cálculos
  const [resumoAberto, setResumoAberto] = useState(false);

  // Estado para o modal de detalhes do imóvel
  const [modalImovel, setModalImovel] = useState<AmostraImovel | null>(null);

  // Estado para dados do cliente e imóvel (relatório final)
  const [dadosCliente, setDadosCliente] = useState<DadosClienteImovel>({
    nomeCliente: '',
    emailCliente: '',
    enderecoImovel: '',
    observacoes: '',
  });
  const [modalClienteAberto, setModalClienteAberto] = useState(false);

  // Estado de persistência no banco
  const [estudoId, setEstudoId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ---- Fila sequencial de processamento de links ----
  // Cada item: { id: amostraId, link: string, tentativas: number }
  const queueRef = useRef<Array<{ id: string; link: string }>>([]);
  const isProcessingRef = useRef(false);
  const [queueIds, setQueueIds] = useState<Set<string>>(new Set()); // IDs aguardando na fila

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return;
    if (queueRef.current.length === 0) return;

    isProcessingRef.current = true;

    while (queueRef.current.length > 0) {
      const item = queueRef.current[0];

      if (!item.link || !item.link.trim()) {
        queueRef.current.shift();
        setQueueIds(prev => { const s = new Set(prev); s.delete(item.id); return s; });
        continue;
      }

      // Marcar como loading
      setAmostras(prev => prev.map(a => a.id === item.id ? { ...a, isLoading: true } : a));
      setQueueIds(prev => { const s = new Set(prev); s.delete(item.id); return s; });

      let success = false;
      while (!success) {
        try {
          const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: item.link }),
          });

          if (!response.ok) throw new Error(`Erro: ${response.status}`);

          const rawData = await response.json();
          const data: WebhookResponseItem = Array.isArray(rawData) ? rawData[0] : rawData;
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

          setAmostras(prev => prev.map(a => {
            if (a.id !== item.id) return a;
            return {
              ...a,
              isLoading: false,
              rua: getString(data.rua, a.rua),
              bairro: getString(data.bairro, a.bairro),
              cidade: getString(data.cidade, a.cidade),
              estado: getString(data.estado, a.estado),
              valorTotal: parseNumber(data['Valor Total (R$)']) || a.valorTotal,
              metragem: parseNumber(data['Metragem (m\u00b2)']) || a.metragem,
              condominio: getString(data.condominio, a.condominio),
              imagem: getString(data.imagem, a.imagem),
              imagemZapImoveis: getString(data.imagemzapimoveis, a.imagemZapImoveis),
              diferenciais: getString(data.diferenciais, a.diferenciais),
              localizacaoCompleta: getString(data.localizacao_completa, a.localizacaoCompleta),
              tipo: getString(data.tipo, a.tipo),
            };
          }));

          toast.success('Imóvel preenchido!');
          success = true;
          queueRef.current.shift();
        } catch (err) {
          console.warn('⚠️ Falha no webhook, tentando novamente em 4s...', err);
          setAmostras(prev => prev.map(a => a.id === item.id ? { ...a, isLoading: true } : a));
          await new Promise(r => setTimeout(r, 4000));
        }
      }
    }

    isProcessingRef.current = false;
  }, []);

  const enqueueLink = useCallback((id: string, link: string) => {
    if (!link || !link.trim()) return;
    // Substituir item existente na fila ou adicionar novo
    const idx = queueRef.current.findIndex(q => q.id === id);
    if (idx >= 0) {
      queueRef.current[idx].link = link;
    } else {
      queueRef.current.push({ id, link });
      setQueueIds(prev => new Set([...prev, id]));
    }
    processQueue();
  }, [processQueue]);

  // ---- Cálculos reativos ----
  const calculos = useMemo(() => {
    const validas = amostras.filter(
      (a) => a.valorTotal > 0 && a.metragem > 0
    );

    // Média do preço por m² de todas as amostras válidas
    const mediaPorM2 =
      validas.length > 0
        ? validas.reduce((sum, a) => sum + a.valorTotal / a.metragem, 0) /
          validas.length
        : 0;

    // Valor Base = preço médio por m² × metragem do imóvel alvo (SEM correção)
    const valorBase =
      config.metragemImovel > 0 && mediaPorM2 > 0
        ? mediaPorM2 * config.metragemImovel
        : 0;

    // Valor de Mercado = Valor Base × (1 + Correção%) - correção aplicada no valor total
    const valorMercado =
      valorBase > 0
        ? valorBase * (1 + config.correcaoMercado / 100)
        : 0;

    // Valor com Exclusividade = valor base (média pura) + margem (sem correção mercadológica)
    const valorExclusividade =
      valorBase > 0
        ? valorBase * (1 + config.margemExclusividade / 100)
        : 0;

    return {
      imoveisAnalisados: validas.length,
      mediaPorM2,
      valorBase,
      valorMercado,
      valorExclusividade,
    };
  }, [amostras, config]);

  // ---- Handlers ----
  const handleUpdateAmostra = useCallback(
    (id: string, field: keyof AmostraImovel, value: string | number) => {
      setAmostras((prev) =>
        prev.map((a) => (a.id === id ? { ...a, [field]: value } : a))
      );
    },
    []
  );

  const handleAddAmostra = useCallback(() => {
    setAmostras((prev) => [...prev, createEmptyAmostra()]);
  }, []);

  const handleRemoveAmostra = useCallback((id: string) => {
    setAmostras((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleClearAll = useCallback(() => {
    setAmostras(Array.from({ length: 5 }, () => createEmptyAmostra()));
    setConfig({ metragemImovel: 0, correcaoMercado: -5, margemExclusividade: 0 });
    setCorrecaoInput('-5');
    setMargemInput('');
  }, []);

  // Enviar link para o webhook e preencher automaticamente
  const handleFetchImovelData = useCallback(async (id: string, link: string) => {
    if (!link || !link.trim()) {
      toast.error('Insira um link válido antes de enviar');
      return;
    }

    // Marcar como loading
    setAmostras((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isLoading: true } : a))
    );

    try {
      const response = await fetch(WEBHOOK_URL, {
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
      const data: WebhookResponseItem = Array.isArray(rawData) ? rawData[0] : rawData;
      
      if (!data) {
        throw new Error('Resposta vazia do webhook');
      }
      

      // Mapear resposta do webhook para os campos da amostra
      setAmostras((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          
          // Extrair valor numérico de strings se necessário
          const parseNumber = (val: unknown): number => {
            if (typeof val === 'number') return val;
            if (typeof val === 'string') {
              const cleaned = val.replace(/[^\d.,]/g, '').replace(',', '.');
              return parseFloat(cleaned) || 0;
            }
            return 0;
          };
          
          // Helper para tratar valores null/undefined
          const getString = (val: string | null | undefined, fallback: string): string => {
            return val && val !== 'null' ? val : fallback;
          };

          const updatedAmostra = {
            ...a,
            isLoading: false,
            rua: getString(data.rua, a.rua),
            bairro: getString(data.bairro, a.bairro),
            cidade: getString(data.cidade, a.cidade),
            estado: getString(data.estado, a.estado),
            valorTotal: parseNumber(data['Valor Total (R$)']) || a.valorTotal,
            metragem: parseNumber(data['Metragem (m²)']) || a.metragem,
            condominio: getString(data.condominio, a.condominio),
            // Campos extras
            imagem: getString(data.imagem, a.imagem),
            imagemZapImoveis: getString(data.imagemzapimoveis, a.imagemZapImoveis),
            diferenciais: getString(data.diferenciais, a.diferenciais),
            localizacaoCompleta: getString(data.localizacao_completa, a.localizacaoCompleta),
            tipo: getString(data.tipo, a.tipo),
          };


          return updatedAmostra;
        })
      );

      toast.success('Dados do imóvel preenchidos com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao buscar dados do imóvel:', error);
      
      // Remover loading
      setAmostras((prev) =>
        prev.map((a) => (a.id === id ? { ...a, isLoading: false } : a))
      );

      toast.error('Erro ao buscar dados do imóvel. Tente novamente.');
    }
  }, []);

  // ---- Salvar estudo no banco ----
  const handleSalvarEstudo = useCallback(
    async (status: 'rascunho' | 'finalizado', htmlRelatorio?: string) => {
      if (!user) {
        toast.error('Você precisa estar logado para salvar o estudo.');
        return null;
      }

      setIsSaving(true);
      try {
        // Preparar amostras válidas com upload de fotos base64
        const validas = amostras.filter(
          (a) => a.link || a.valorTotal > 0 || a.metragem > 0
        );

        const amostrasPayload: AmostraPayload[] = [];

        for (let i = 0; i < validas.length; i++) {
          const a = validas[i];
          let imagemUrl = a.imagem || '';
          let imagemZap = a.imagemZapImoveis || '';

          // Se a imagem é base64 (data URL), fazer upload para o Storage
          if (imagemUrl && imagemUrl.startsWith('data:')) {
            const path = `${user.tenantId}/${estudoId || 'new'}/${a.id}.jpg`;
            const publicUrl = await uploadFotoAmostra(imagemUrl, path);
            if (publicUrl) {
              imagemUrl = publicUrl;
            }
          }

          amostrasPayload.push({
            ordem: i,
            link: a.link,
            valorTotal: a.valorTotal,
            metragem: a.metragem,
            estado: a.estado,
            cidade: a.cidade,
            bairro: a.bairro,
            condominio: a.condominio,
            rua: a.rua,
            tipo: a.tipo,
            diferenciais: a.diferenciais,
            imagemUrl,
            imagemZapImoveis: imagemZap,
          });
        }

        // Calcular valor final
        const valorFinal =
          calculos.valorExclusividade > 0 && config.margemExclusividade !== 0
            ? calculos.valorExclusividade
            : calculos.valorMercado;

        const payload: SalvarEstudoPayload = {
          tenantId: user.tenantId,
          corretorId: user.id,
          corretorNome: user.name,
          corretorEmail: user.email,
          corretorEquipe: user.equipe || undefined,
          corretorRole: user.systemRole || undefined,
          nomeCliente: dadosCliente.nomeCliente,
          emailCliente: dadosCliente.emailCliente,
          enderecoImovel: dadosCliente.enderecoImovel,
          observacoes: dadosCliente.observacoes,
          metragemImovel: config.metragemImovel,
          correcaoMercado: config.correcaoMercado,
          margemExclusividade: config.margemExclusividade,
          mediaPorM2: calculos.mediaPorM2,
          valorBase: calculos.valorBase,
          valorMercado: calculos.valorMercado,
          valorExclusividade: calculos.valorExclusividade,
          valorFinal,
          relatorioHtml: htmlRelatorio || null,
          status,
          amostras: amostrasPayload,
        };

        const result = await salvarEstudo(payload, estudoId || undefined);

        if (result.error) {
          toast.error(`Erro ao salvar: ${result.error}`);
          return null;
        }

        // Atualizar o estudoId para futuras edições
        if (!estudoId && result.id) {
          setEstudoId(result.id);
        }

        return result.id;
      } catch (err: any) {
        console.error('❌ Erro ao salvar estudo:', err);
        toast.error('Erro inesperado ao salvar o estudo.');
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [user, amostras, calculos, config, dadosCliente, estudoId]
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-full w-full bg-slate-50 dark:bg-slate-950">
      {/* Conteúdo */}
      <div className="px-4 lg:px-6 py-5 w-full max-w-[1600px] mx-auto">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 w-full overflow-hidden">

          {/* ================================================================ */}
          {/* COLUNA PRINCIPAL - Seleção das amostras                          */}
          {/* ================================================================ */}
          <div className="flex-1 min-w-0 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent transition-all duration-300">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-800 overflow-hidden">
              {/* Header da seção */}
              {/* Toolbar slim — sem título, foco direto no que o corretor faz */}
              <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-400 dark:text-slate-500">
                  <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100 font-semibold">{amostras.length.toString().padStart(2, '0')}</span>
                  <span className="text-slate-400 dark:text-slate-500">amostras</span>
                  <span className="w-px h-3 bg-slate-200 mx-1" />
                  <button
                    onClick={() => setAutoFill(!autoFill)}
                    className="flex items-center gap-1.5 hover:text-slate-900 dark:text-slate-100 transition-colors focus:outline-none"
                    title="Liga/desliga preenchimento automático ao colar links"
                  >
                    {autoFill ? (
                      <ToggleRight className="w-5 h-5 text-blue-600" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                    )}
                    <span>Preenchimento automático</span>
                  </button>
                </div>

                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors focus:outline-none"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpar tudo
                </button>
              </div>

              {/* Tabela */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
                      <th className="pl-5 pr-2 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        Link do imóvel
                      </th>
                      <th className="px-2 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 whitespace-nowrap border-l border-slate-100 dark:border-slate-800">
                        Valor (R$)
                      </th>
                      <th className="px-2 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        Área (m²)
                      </th>
                      <th className="px-2 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300 whitespace-nowrap bg-blue-50/40 dark:bg-blue-950/30">
                        R$/m²
                      </th>
                      <th className="px-2 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 whitespace-nowrap border-l border-slate-100 dark:border-slate-800">
                        Estado
                      </th>
                      <th className="px-2 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        Cidade
                      </th>
                      <th className="px-2 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        Bairro
                      </th>
                      <th className="px-2 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        Condomínio
                      </th>
                      <th className="px-2 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-500 whitespace-nowrap">
                        Rua
                      </th>
                      <th className="px-2 py-2.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {amostras.map((amostra, index) => (
                      <tr
                        key={amostra.id}
                        className={`border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group relative ${
                          amostra.isLoading ? 'bg-blue-50/50 dark:bg-blue-950/30 animate-pulse' : ''
                        }`}
                      >
                        {/* Link do Imóvel */}
                        <td className="pl-5 pr-2 py-2.5 relative">
                          <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="flex items-center gap-1.5">
                            {/* Thumbnail da imagem (se tiver) */}
                            {(amostra.imagemZapImoveis || amostra.imagem) ? (
                              <button
                                onClick={() => setModalImovel(amostra)}
                                className="w-8 h-8 rounded overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-800 hover:border-blue-400 transition-colors"
                                title="Ver detalhes do imóvel"
                              >
                                <img
                                  src={amostra.imagemZapImoveis || amostra.imagem}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              </button>
                            ) : (
                              <button
                                onClick={() => setModalImovel(amostra)}
                                className="rounded bg-blue-100 dark:bg-blue-950/50 border border-blue-300 dark:border-blue-800 flex items-center justify-center flex-shrink-0 hover:bg-blue-200 dark:hover:bg-blue-900/60 hover:border-blue-400 dark:hover:border-blue-700 transition-colors"
                                style={{ width: '32px', height: '32px', minWidth: '32px', minHeight: '32px' }}
                                title="Ver detalhes do imóvel"
                              >
                                <Pencil style={{ width: '18px', height: '18px', minWidth: '18px', minHeight: '18px' }} className="text-blue-600" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (!amostra.isLoading && !queueIds.has(amostra.id) && amostra.link) {
                                  enqueueLink(amostra.id, amostra.link);
                                }
                              }}
                              className="rounded flex items-center justify-center flex-shrink-0 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-500 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:border-blue-400 dark:hover:border-blue-700 transition-colors"
                              style={{
                                width: '32px', height: '32px', minWidth: '32px', minHeight: '32px',
                                cursor: amostra.isLoading || queueIds.has(amostra.id) || !amostra.link ? 'not-allowed' : 'pointer',
                              }}
                              title={amostra.isLoading ? 'Buscando dados...' : queueIds.has(amostra.id) ? 'Aguardando na fila...' : 'Buscar dados do imóvel'}
                            >
                              {amostra.isLoading ? (
                                <Loader2 style={{ width: '18px', height: '18px', minWidth: '18px', minHeight: '18px', color: '#3b82f6' }} className="animate-spin" />
                              ) : queueIds.has(amostra.id) ? (
                                <Loader2 style={{ width: '18px', height: '18px', minWidth: '18px', minHeight: '18px', color: '#f59e0b' }} className="animate-spin" />
                              ) : (
                                <Send style={{ width: '18px', height: '18px', minWidth: '18px', minHeight: '18px', color: '#3b82f6' }} />
                              )}
                            </button>
                            <input
                              type="text"
                              value={amostra.link}
                              onChange={(e) =>
                                handleUpdateAmostra(amostra.id, 'link', e.target.value)
                              }
                              onPaste={(e) => {
                                const pasted = e.clipboardData.getData('text');
                                if (pasted && pasted.trim()) {
                                  // Aguardar o onChange aplicar o valor antes de enfileirar
                                  setTimeout(() => enqueueLink(amostra.id, pasted.trim()), 50);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && amostra.link && !amostra.isLoading && !queueIds.has(amostra.id)) {
                                  enqueueLink(amostra.id, amostra.link);
                                }
                              }}
                              placeholder={queueIds.has(amostra.id) ? '⏳ Aguardando na fila...' : 'Cole o link aqui (envia automático)'}
                              className="w-full min-w-[130px] text-sm text-slate-700 dark:text-slate-300 placeholder-gray-400 bg-transparent border-0 outline-none focus:ring-0 p-0"
                              disabled={amostra.isLoading}
                            />
                          </div>
                        </td>

                        {/* Valor Total */}
                        <td className="px-2 py-2.5 border-l border-slate-100 dark:border-slate-800">
                          <input
                            type="number"
                            value={amostra.valorTotal || ''}
                            onChange={(e) =>
                              handleUpdateAmostra(
                                amostra.id,
                                'valorTotal',
                                Number(e.target.value)
                              )
                            }
                            placeholder="450000"
                            className="w-full min-w-[75px] text-[13px] text-slate-900 dark:text-slate-100 placeholder-slate-300 bg-transparent border-0 outline-none focus:ring-0 p-0 text-right tabular-nums font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>

                        {/* Metragem */}
                        <td className="px-2 py-2.5">
                          <input
                            type="number"
                            value={amostra.metragem || ''}
                            onChange={(e) =>
                              handleUpdateAmostra(
                                amostra.id,
                                'metragem',
                                Number(e.target.value)
                              )
                            }
                            placeholder="85"
                            className="w-full min-w-[50px] text-[13px] text-slate-900 dark:text-slate-100 placeholder-slate-300 bg-transparent border-0 outline-none focus:ring-0 p-0 text-right tabular-nums font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>

                        {/* Valor por m² (calculado) */}
                        <td className="px-2 py-2.5 bg-blue-50/30 dark:bg-blue-950/20 text-right">
                          <span className="text-[13px] font-semibold text-blue-700 tabular-nums">
                            {amostra.valorTotal > 0 && amostra.metragem > 0
                              ? formatCurrency(amostra.valorTotal / amostra.metragem)
                              : <span className="text-slate-300">—</span>}
                          </span>
                        </td>

                        {/* Estado */}
                        <td className="px-2 py-2.5 border-l border-slate-100 dark:border-slate-800">
                          <input
                            type="text"
                            value={amostra.estado}
                            onChange={(e) =>
                              handleUpdateAmostra(amostra.id, 'estado', e.target.value)
                            }
                            placeholder="Estado"
                            className="w-full min-w-[45px] text-sm text-slate-700 dark:text-slate-300 placeholder-gray-400 bg-transparent border-0 outline-none focus:ring-0 p-0"
                          />
                        </td>

                        {/* Cidade */}
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={amostra.cidade}
                            onChange={(e) =>
                              handleUpdateAmostra(amostra.id, 'cidade', e.target.value)
                            }
                            placeholder="Cidade"
                            className="w-full min-w-[50px] text-sm text-slate-700 dark:text-slate-300 placeholder-gray-400 bg-transparent border-0 outline-none focus:ring-0 p-0"
                          />
                        </td>

                        {/* Bairro */}
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={amostra.bairro}
                            onChange={(e) =>
                              handleUpdateAmostra(amostra.id, 'bairro', e.target.value)
                            }
                            placeholder="Bairro"
                            className="w-full min-w-[50px] text-sm text-slate-700 dark:text-slate-300 placeholder-gray-400 bg-transparent border-0 outline-none focus:ring-0 p-0"
                          />
                        </td>

                        {/* Condomínio */}
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={amostra.condominio}
                            onChange={(e) =>
                              handleUpdateAmostra(amostra.id, 'condominio', e.target.value)
                            }
                            placeholder="Condomínio"
                            className="w-full min-w-[60px] text-sm text-slate-700 dark:text-slate-300 placeholder-gray-400 bg-transparent border-0 outline-none focus:ring-0 p-0"
                          />
                        </td>

                        {/* Rua */}
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={amostra.rua}
                            onChange={(e) =>
                              handleUpdateAmostra(amostra.id, 'rua', e.target.value)
                            }
                            placeholder="Endereço"
                            className="w-full min-w-[55px] text-sm text-slate-700 dark:text-slate-300 placeholder-gray-400 bg-transparent border-0 outline-none focus:ring-0 p-0"
                          />
                        </td>

                        {/* Remover */}
                        <td className="px-1 py-2">
                          <button
                            onClick={() => handleRemoveAmostra(amostra.id)}
                            className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Remover imóvel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Botão Adicionar */}
              <div className="px-6 py-4">
                <button
                  onClick={handleAddAmostra}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 border-2 border-blue-300 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-700 rounded-xl transition-all shadow-sm hover:shadow-md"
                >
                  <Plus className="w-5 h-5" />
                  Adicionar Imóvel
                </button>
              </div>
            </div>

            {/* Cards Cliente & Imóvel + Corretor lado a lado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">

              {/* CARD ESQUERDA — Cliente & Imóvel */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-800 p-5 flex flex-col">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <Home className="w-4 h-4 text-blue-600" strokeWidth={2} />
                  <h3 className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Cliente & Imóvel</h3>
                </div>

                {/* Preview / vazio */}
                <div className="py-4 flex-1">
                  {(dadosCliente.nomeCliente || dadosCliente.emailCliente || dadosCliente.enderecoImovel) ? (
                    <div className="space-y-2.5">
                      {dadosCliente.nomeCliente && (
                        <div className="flex items-start gap-2.5 text-[12.5px]">
                          <User className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-[10.5px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">Nome</p>
                            <p className="text-slate-700 dark:text-slate-300 truncate">{dadosCliente.nomeCliente}</p>
                          </div>
                        </div>
                      )}
                      {dadosCliente.emailCliente && (
                        <div className="flex items-start gap-2.5 text-[12.5px]">
                          <Mail className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-[10.5px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">Email</p>
                            <p className="text-slate-700 dark:text-slate-300 truncate">{dadosCliente.emailCliente}</p>
                          </div>
                        </div>
                      )}
                      {dadosCliente.enderecoImovel && (
                        <div className="flex items-start gap-2.5 text-[12.5px]">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-[10.5px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">Endereço</p>
                            <p className="text-slate-700 dark:text-slate-300">{dadosCliente.enderecoImovel}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-4">
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
                        <User className="w-5 h-5 text-slate-400 dark:text-slate-500" strokeWidth={1.8} />
                      </div>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 dark:text-slate-500 max-w-[240px]">
                        Nenhum cliente cadastrado. Configure os dados que serão incluídos no relatório final.
                      </p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setModalClienteAberto(true)}
                  className="w-full h-9 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {dadosCliente.nomeCliente || dadosCliente.enderecoImovel ? 'Editar dados' : 'Configurar dados'}
                </button>
              </div>

              {/* CARD DIREITA — Corretor responsável */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-800 p-5 flex flex-col">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <User className="w-4 h-4 text-blue-600" strokeWidth={2} />
                  <h3 className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Corretor responsável</h3>
                </div>

                <div className="py-4 flex-1 flex flex-col items-center text-center">
                  {dadosCorretor.foto ? (
                    <img
                      src={dadosCorretor.foto}
                      alt={dadosCorretor.nome}
                      className="w-16 h-16 rounded-full object-cover ring-4 ring-blue-50"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center ring-4 ring-blue-50">
                      <User className="w-7 h-7 text-white" strokeWidth={1.8} />
                    </div>
                  )}
                  <p className="mt-3 text-[14px] font-semibold text-slate-900 dark:text-slate-100">{dadosCorretor.nome || 'Sem nome'}</p>
                  {dadosCorretor.role && (
                    <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10.5px] font-semibold capitalize">
                      {dadosCorretor.role}
                    </span>
                  )}
                  {dadosCorretor.email && (
                    <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400 dark:text-slate-500 truncate max-w-full">{dadosCorretor.email}</p>
                  )}
                  {dadosCorretor.telefone && (
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 dark:text-slate-500">{dadosCorretor.telefone}</p>
                  )}
                  {dadosCorretor.equipe && (
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                      <Star className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                      Equipe <span className="capitalize">{dadosCorretor.equipe}</span>
                    </span>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* ================================================================ */}
          {/* SIDEBAR DIREITA - Cálculos de avaliação                          */}
          {/* ================================================================ */}
          <div className="w-full lg:w-[280px] lg:min-w-[280px] flex-shrink-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto flex flex-col gap-4 pb-20 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
            {/* Card 1: Metragem do Imóvel */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-800 p-5 pt-6">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3 mb-3 -mt-1">
                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                  <Ruler className="w-5 h-5 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                </span>
                Metragem do imóvel (m²)
              </h3>
              <input
                type="number"
                value={config.metragemImovel || ''}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    metragemImovel: Number(e.target.value),
                  }))
                }
                placeholder="Ex: 85"
                className="w-full h-11 px-4 text-sm text-slate-700 dark:text-slate-300 placeholder-gray-400 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950/50 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>

            {/* Card 2: Cálculo da Média */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-800 p-5 pt-6">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-3 mb-3 -mt-1">
                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                </span>
                Cálculo da média
              </h3>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-blue-600">
                  Imóveis analisados
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                  {calculos.imoveisAnalisados} imóveis
                </p>
                <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Preço médio por m²</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {calculos.mediaPorM2 > 0 ? formatCurrency(calculos.mediaPorM2) : 'R$ 0,00'}
                  </p>
                  {calculos.imoveisAnalisados === 0 && (
                    <p className="text-xs text-orange-500 mt-1">
                      Preencha valor e metragem dos imóveis
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: Valor de Mercado */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-800 p-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                Valor de Mercado
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500 block mb-1.5">
                    Correção Mercadológica (%)
                  </label>
                  <input
                    type="number"
                    value={correcaoInput}
                    onChange={(e) => {
                      setCorrecaoInput(e.target.value);
                      setConfig((prev) => ({
                        ...prev,
                        correcaoMercado: e.target.value === '' ? 0 : Number(e.target.value),
                      }));
                    }}
                    placeholder="0"
                    className="w-full h-11 px-4 text-sm text-slate-700 dark:text-slate-300 placeholder-gray-400 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950/50 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                
                {/* Valor com correção - badge verde */}
                {calculos.valorMercado > 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 mt-1">
                    <p className="text-xs text-green-600 font-semibold mb-0.5">
                      Valor com correção ({config.correcaoMercado >= 0 ? '+' : ''}{config.correcaoMercado}%)
                    </p>
                    <p className="text-xl font-bold text-green-700">
                      {formatCurrency(calculos.valorMercado)}
                    </p>
                    {calculos.valorBase > 0 && (
                      <p className="text-xs text-green-500 mt-0.5">
                        {formatCurrency(calculos.mediaPorM2)}/m² × {config.metragemImovel}m² = {formatCurrency(calculos.valorBase)}
                        {calculos.valorBase !== calculos.valorMercado && (
                          <> {config.correcaoMercado >= 0 ? '+' : ''}{formatCurrency(calculos.valorMercado - calculos.valorBase)}</>
                        )}
                      </p>
                    )}
                  </div>
                ) : config.metragemImovel === 0 && calculos.mediaPorM2 > 0 ? (
                  <p className="text-xs text-orange-500 pt-2">
                    Preencha a metragem do imóvel acima para ver o valor total
                  </p>
                ) : null}
              </div>
            </div>

            {/* Card 4: Margem para Exclusividade */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 dark:border-slate-800 p-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-slate-500 dark:text-slate-400 dark:text-slate-500" />
                Margem para Exclusividade
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500 block mb-1.5">
                    Margem para Exclusividade (%)
                  </label>
                  <input
                    type="number"
                    value={margemInput}
                    onChange={(e) => {
                      setMargemInput(e.target.value);
                      setConfig((prev) => ({
                        ...prev,
                        margemExclusividade: e.target.value === '' ? 0 : Number(e.target.value),
                      }));
                    }}
                    placeholder="0 - Digite a margem de exclusividade"
                    className="w-full h-11 px-4 text-sm text-slate-700 dark:text-slate-300 placeholder-gray-400 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950/50 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                {calculos.valorExclusividade > 0 && config.margemExclusividade !== 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 mt-1">
                    <p className="text-xs text-red-600 font-semibold mb-0.5">
                      Valor com exclusividade ({config.margemExclusividade >= 0 ? '+' : ''}{config.margemExclusividade}%)
                    </p>
                    <p className="text-xl font-bold text-red-700">
                      {formatCurrency(calculos.valorExclusividade)}
                    </p>
                    {calculos.valorBase > 0 && (
                      <p className="text-xs text-red-500 mt-0.5">
                        {formatCurrency(calculos.mediaPorM2)}/m² × {config.metragemImovel}m² = {formatCurrency(calculos.valorBase)} {config.margemExclusividade >= 0 ? '+' : ''}{formatCurrency(calculos.valorExclusividade - calculos.valorBase)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Valor Final do Relatório */}
            {(calculos.valorMercado > 0 || calculos.valorExclusividade > 0) && (
              <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 text-center">
                <p className="text-xs font-bold text-green-600 uppercase tracking-wider mb-1">Valor Final do Relatório</p>
                <p className="text-2xl font-black text-green-700">
                  {formatCurrency(calculos.valorMercado)}
                </p>
                <p className="text-xs text-green-600/80 mt-1">
                  {`Mercado ${config.correcaoMercado !== 0 ? `(${config.correcaoMercado >= 0 ? '+' : ''}${config.correcaoMercado}%)` : ''}`}
                </p>
              </div>
            )}

            {/* Botão Gerar Relatório */}
            <button
              onClick={async () => {
                const validas = amostras.filter(a => a.valorTotal > 0 && a.metragem > 0);
                if (validas.length === 0) {
                  toast.error('Preencha pelo menos um imóvel com valor e metragem para gerar o relatório.');
                  return;
                }
                if (config.metragemImovel <= 0) {
                  toast.error('Preencha a metragem do imóvel avaliado antes de gerar o relatório.');
                  return;
                }

                // 1. Gerar o HTML do relatório (sem download ainda)
                const htmlRelatorio = generateReport({
                  amostras: validas.map(a => ({
                    link: a.link,
                    valorTotal: a.valorTotal,
                    metragem: a.metragem,
                    estado: a.estado,
                    cidade: a.cidade,
                    bairro: a.bairro,
                    condominio: a.condominio,
                    rua: a.rua,
                    imagem: a.imagem,
                    imagemZapImoveis: a.imagemZapImoveis,
                    diferenciais: a.diferenciais,
                    tipo: a.tipo,
                  })),
                  metragemImovel: config.metragemImovel,
                  correcaoMercado: config.correcaoMercado,
                  margemExclusividade: config.margemExclusividade,
                  nomeCliente: dadosCliente.nomeCliente,
                  enderecoImovel: dadosCliente.enderecoImovel,
                  observacoes: dadosCliente.observacoes,
                  mediaPorM2: calculos.mediaPorM2,
                  valorBase: calculos.valorBase,
                  valorMercado: calculos.valorMercado,
                  valorExclusividade: calculos.valorExclusividade,
                  corretorNome: dadosCorretor.nome,
                  corretorEmail: dadosCorretor.email,
                  corretorTelefone: dadosCorretor.telefone,
                  corretorEquipe: dadosCorretor.equipe,
                  corretorRole: dadosCorretor.role,
                  corretorFoto: dadosCorretor.foto,
                }, { skipDownload: true });

                if (!htmlRelatorio) return;

                // 2. Salvar tudo no banco de dados (estudo + amostras + HTML)
                const id = await handleSalvarEstudo('finalizado', htmlRelatorio);

                // 3. Fazer download do HTML
                const blob = new Blob([htmlRelatorio], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `relatorio-avaliacao-${new Date().toISOString().slice(0, 10)}.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                if (id) {
                  toast.success('Relatório gerado e salvo no banco de dados!');
                } else {
                  toast.success('Relatório gerado! O download foi iniciado.');
                  toast.warning('Não foi possível salvar no banco de dados.');
                }
              }}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <FileText className="w-5 h-5" />
              )}
              {isSaving ? 'Salvando e gerando...' : 'Gerar Relatório'}
            </button>

          </div>


        </div>
      </div>

      {/* Modal Editar Imóvel (Pop-up) */}
      {modalImovel && createPortal(
        <div
          data-modal-overlay
          onClick={() => setModalImovel(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            maxWidth: 'none',
            backgroundColor: 'rgba(15, 23, 42, 0.35)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl overflow-hidden"
            style={{ maxWidth: '28rem', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-3.5 flex items-center justify-between flex-shrink-0">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Home className="w-4 h-4" />
                Editar Imóvel
              </h3>
              <button
                onClick={() => setModalImovel(null)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo com scroll */}
            <div className="overflow-y-auto flex-1">
              {/* Imagem do Imóvel */}
              <div className="relative group">
                {(modalImovel.imagemZapImoveis || modalImovel.imagem) ? (
                  <>
                    <img
                      src={modalImovel.imagemZapImoveis || modalImovel.imagem}
                      alt="Foto do imóvel"
                      className="w-full h-48 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://via.placeholder.com/448x192?text=Erro+ao+carregar';
                      }}
                    />
                    {modalImovel.imagemZapImoveis && (
                      <span className="absolute top-2 left-2 bg-orange-500 text-white text-xs font-semibold px-2 py-0.5 rounded">
                        ZAP Imóveis
                      </span>
                    )}
                    {/* Botões sobre a imagem */}
                    <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <label
                        className="p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg cursor-pointer"
                        title="Trocar imagem"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const dataUrl = ev.target?.result as string;
                                handleUpdateAmostra(modalImovel.id, 'imagem', dataUrl);
                                handleUpdateAmostra(modalImovel.id, 'imagemZapImoveis', '');
                                setModalImovel({ ...modalImovel, imagem: dataUrl, imagemZapImoveis: '' });
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                      <button
                        onClick={() => {
                          handleUpdateAmostra(modalImovel.id, 'imagem', '');
                          handleUpdateAmostra(modalImovel.id, 'imagemZapImoveis', '');
                          setModalImovel({ ...modalImovel, imagem: '', imagemZapImoveis: '' });
                        }}
                        className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg"
                        title="Remover imagem"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <label className="w-full h-40 flex flex-col items-center justify-center gap-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-blue-50/50 transition-colors">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <Plus className="w-6 h-6 text-blue-500" />
                    </div>
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500">Clique para enviar uma foto</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">JPG, PNG ou WEBP</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const dataUrl = ev.target?.result as string;
                            handleUpdateAmostra(modalImovel.id, 'imagem', dataUrl);
                            setModalImovel({ ...modalImovel, imagem: dataUrl });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Formulário Editável */}
              <div className="p-5 space-y-4">
                {/* Tipo */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500 block mb-1">Tipo</label>
                  <input
                    type="text"
                    value={modalImovel.tipo || ''}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      handleUpdateAmostra(modalImovel.id, 'tipo', newValue);
                      setModalImovel({ ...modalImovel, tipo: newValue });
                    }}
                    placeholder="Ex: Casa, Apartamento..."
                    className="w-full h-9 px-3 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950/50 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Valores */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500 block mb-1">Valor (R$)</label>
                    <input
                      type="number"
                      value={modalImovel.valorTotal || ''}
                      onChange={(e) => {
                        const newValue = Number(e.target.value);
                        handleUpdateAmostra(modalImovel.id, 'valorTotal', newValue);
                        setModalImovel({ ...modalImovel, valorTotal: newValue });
                      }}
                      placeholder="0"
                      className="w-full h-9 px-3 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg bg-green-50/50 outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500 block mb-1">Área (m²)</label>
                    <input
                      type="number"
                      value={modalImovel.metragem || ''}
                      onChange={(e) => {
                        const newValue = Number(e.target.value);
                        handleUpdateAmostra(modalImovel.id, 'metragem', newValue);
                        setModalImovel({ ...modalImovel, metragem: newValue });
                      }}
                      placeholder="0"
                      className="w-full h-9 px-3 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg bg-blue-50/50 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>

                {/* Preço por m² (calculado) */}
                <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">Preço por m² (calculado)</p>
                  <p className="text-lg font-bold text-slate-800">
                    {modalImovel.valorTotal > 0 && modalImovel.metragem > 0
                      ? formatCurrency(modalImovel.valorTotal / modalImovel.metragem)
                      : '-'}
                  </p>
                </div>

                {/* Localização */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-red-500" />
                    Localização
                  </div>
                  <input
                    type="text"
                    value={modalImovel.rua || ''}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      handleUpdateAmostra(modalImovel.id, 'rua', newValue);
                      setModalImovel({ ...modalImovel, rua: newValue });
                    }}
                    placeholder="Endereço / Rua"
                    className="w-full h-9 px-3 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950/50 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <input
                    type="text"
                    value={modalImovel.bairro || ''}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      handleUpdateAmostra(modalImovel.id, 'bairro', newValue);
                      setModalImovel({ ...modalImovel, bairro: newValue });
                    }}
                    placeholder="Bairro"
                    className="w-full h-9 px-3 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950/50 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={modalImovel.cidade || ''}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleUpdateAmostra(modalImovel.id, 'cidade', newValue);
                        setModalImovel({ ...modalImovel, cidade: newValue });
                      }}
                      placeholder="Cidade"
                      className="w-full h-9 px-3 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950/50 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <input
                      type="text"
                      value={modalImovel.estado || ''}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        handleUpdateAmostra(modalImovel.id, 'estado', newValue);
                        setModalImovel({ ...modalImovel, estado: newValue });
                      }}
                      placeholder="UF"
                      className="w-full h-9 px-3 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950/50 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <input
                    type="text"
                    value={modalImovel.condominio || ''}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      handleUpdateAmostra(modalImovel.id, 'condominio', newValue);
                      setModalImovel({ ...modalImovel, condominio: newValue });
                    }}
                    placeholder="Condomínio (opcional)"
                    className="w-full h-9 px-3 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950/50 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Diferenciais */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500 block mb-1">Diferenciais</label>
                  <textarea
                    value={modalImovel.diferenciais || ''}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      handleUpdateAmostra(modalImovel.id, 'diferenciais', newValue);
                      setModalImovel({ ...modalImovel, diferenciais: newValue });
                    }}
                    placeholder="Descrição e diferenciais do imóvel..."
                    rows={3}
                    className="w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-950/50 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </div>

                {/* Link Original */}
                {modalImovel.link && (
                  <a
                    href={modalImovel.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Ver Anúncio Original
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Configurar Dados do Cliente */}
      {modalClienteAberto && createPortal(
        <div 
          data-modal-overlay
          onClick={() => setModalClienteAberto(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            maxWidth: 'none',
            backgroundColor: 'rgba(15, 23, 42, 0.35)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl overflow-hidden"
            style={{ maxWidth: '54rem', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header limpo (sem gradient pesado) */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Configurar estudo</h2>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Dados do cliente, imóvel e corretor responsável</p>
              </div>
              <button
                onClick={() => setModalClienteAberto(false)}
                className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-lg transition-colors focus:outline-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo em 2 colunas (Cliente/Imóvel + Corretor) */}
            <div className="p-5 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* CARD 1 — Cliente & Imóvel */}
                <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col gap-3.5">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                    <Home className="w-4 h-4 text-blue-600" strokeWidth={2} />
                    <h3 className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Cliente & Imóvel</h3>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mb-1.5">
                      <User className="w-3 h-3" /> Nome do cliente
                    </label>
                    <input
                      type="text"
                      value={dadosCliente.nomeCliente}
                      onChange={(e) => setDadosCliente({ ...dadosCliente, nomeCliente: e.target.value })}
                      placeholder="Ex: João da Silva"
                      className="w-full h-10 px-3 text-[13px] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mb-1.5">
                      <Mail className="w-3 h-3" /> Email
                    </label>
                    <input
                      type="email"
                      value={dadosCliente.emailCliente}
                      onChange={(e) => setDadosCliente({ ...dadosCliente, emailCliente: e.target.value })}
                      placeholder="joao@email.com"
                      className="w-full h-10 px-3 text-[13px] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mb-1.5">
                      <MapPin className="w-3 h-3" /> Endereço completo do imóvel
                    </label>
                    <input
                      type="text"
                      value={dadosCliente.enderecoImovel}
                      onChange={(e) => setDadosCliente({ ...dadosCliente, enderecoImovel: e.target.value })}
                      placeholder="Rua das Flores, 123 — Centro, SP"
                      className="w-full h-10 px-3 text-[13px] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-colors"
                    />
                  </div>

                  <div className="flex-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mb-1.5">
                      <FileText className="w-3 h-3" /> Observações
                    </label>
                    <textarea
                      value={dadosCliente.observacoes}
                      onChange={(e) => setDadosCliente({ ...dadosCliente, observacoes: e.target.value })}
                      placeholder="Observações adicionais (opcional)..."
                      rows={3}
                      className="w-full px-3 py-2 text-[13px] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none transition-colors"
                    />
                  </div>
                </div>

                {/* CARD 2 — Corretor Responsável */}
                <div className="bg-white border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 mb-4">
                    <User className="w-4 h-4 text-blue-600" strokeWidth={2} />
                    <h3 className="text-[12.5px] font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wider">Corretor responsável</h3>
                  </div>

                  {/* Foto + identidade */}
                  <div className="flex flex-col items-center text-center pb-5 mb-4 border-b border-slate-100 dark:border-slate-800">
                    {dadosCorretor.foto ? (
                      <img
                        src={dadosCorretor.foto}
                        alt={dadosCorretor.nome}
                        className="w-20 h-20 rounded-full object-cover ring-4 ring-blue-50"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center ring-4 ring-blue-50">
                        <User className="w-9 h-9 text-white" strokeWidth={1.8} />
                      </div>
                    )}
                    <p className="mt-3 text-[14px] font-semibold text-slate-900 dark:text-slate-100">{dadosCorretor.nome || 'Sem nome'}</p>
                    {dadosCorretor.role && (
                      <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10.5px] font-semibold capitalize">
                        {dadosCorretor.role}
                      </span>
                    )}
                  </div>

                  {/* Linhas de info */}
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5 text-[12.5px]">
                      <Mail className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[10.5px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">Email</p>
                        <p className="text-slate-700 dark:text-slate-300 truncate">{dadosCorretor.email || '—'}</p>
                      </div>
                    </div>
                    {dadosCorretor.telefone && (
                      <div className="flex items-start gap-2.5 text-[12.5px]">
                        <span className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5 text-center text-xs">☎</span>
                        <div>
                          <p className="text-[10.5px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">Telefone</p>
                          <p className="text-slate-700 dark:text-slate-300">{dadosCorretor.telefone}</p>
                        </div>
                      </div>
                    )}
                    {dadosCorretor.equipe && (
                      <div className="flex items-start gap-2.5 text-[12.5px]">
                        <Star className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10.5px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">Equipe</p>
                          <p className="text-slate-700 dark:text-slate-300 capitalize">{dadosCorretor.equipe}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Footer com botões */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 flex-shrink-0 bg-slate-50 dark:bg-slate-950/50">
              <button
                onClick={() => setModalClienteAberto(false)}
                className="h-9 px-4 text-[12.5px] font-semibold text-slate-600 dark:text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 dark:bg-slate-800 rounded-lg transition-colors focus:outline-none"
              >
                Cancelar
              </button>
              <button
                onClick={() => setModalClienteAberto(false)}
                className="h-9 px-4 text-[12.5px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none"
              >
                Salvar e continuar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default EstudoMercadoPage;
