/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * IntegracoesPage - Área de Integrações do CRM
 * 
 * Esta página será responsável por gerenciar as integrações
 * que trazem leads para o CRM
 * 
 * Abas:
 * - Integrações: Kenlo, webhooks, etc.
 * - API: Gerenciamento de API Keys e documentação
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Plug, 
  CheckCircle2, 
  XCircle, 
  Eye,
  EyeOff,
  Loader2,
  ArrowRight,
  ExternalLink,
  Zap,
  Code,
  Key,
  Copy,
  Check,
  Building2,
  Users,
  RefreshCw,
  ImagePlus,
  Pencil,
  Save
} from 'lucide-react';

/**
 * ORIGENS DO LEAD (FONTES) - Importado da ApiDocsPage
 * Todas as 32 origens disponíveis para integração
 */
const LEAD_SOURCES = [
  { id: 0, name: 'Lia Serhant', shortName: 'Lia Serhant', category: 'ai', icon: '🤖', description: 'Assistente IA da OctoIA' },
  { id: 1, name: 'WhatsApp', shortName: 'WhatsApp', category: 'channels', icon: '💬', description: 'Business API e Link direto' },
  { id: 2, name: 'Facebook Lead Ads', shortName: 'Facebook Ads', category: 'channels', icon: '📘', description: 'Formulários de captação' },
  { id: 3, name: 'Instagram Ads', shortName: 'Instagram', category: 'channels', icon: '📸', description: 'Formulários e Direct' },
  { id: 4, name: 'Google Ads', shortName: 'Google Ads', category: 'channels', icon: '🔍', description: 'Extensão de formulário e Pesquisa' },
  { id: 5, name: 'LinkedIn Ads', shortName: 'LinkedIn', category: 'channels', icon: '💼', description: 'Formulários e anúncios' },
  { id: 6, name: 'Site da Imobiliária', shortName: 'Site', category: 'channels', icon: '🌐', description: 'Formulários Fale Conosco' },
  { id: 7, name: 'E-mail', shortName: 'E-mail', category: 'channels', icon: '📧', description: 'Leitura automática de leads' },
  { id: 8, name: 'Landing Pages', shortName: 'Landing Pages', category: 'channels', icon: '📄', description: 'Páginas de captura' },
  { id: 9, name: 'API Customizada', shortName: 'API Custom', category: 'channels', icon: '🔗', description: 'CRMs e ferramentas externas' },
  { id: 10, name: 'Zap Imóveis', shortName: 'Zap Imóveis', category: 'portal', icon: '🏢', description: 'Portal Grupo ZAP' },
  { id: 11, name: 'Viva Real', shortName: 'Viva Real', category: 'portal', icon: '🏘️', description: 'Portal Grupo ZAP' },
  { id: 12, name: 'Imovelweb', shortName: 'Imovelweb', category: 'portal', icon: '🏠', description: 'Portal Imovelweb' },
  { id: 13, name: 'OLX Imóveis', shortName: 'OLX', category: 'portal', icon: '📦', description: 'Classificados OLX' },
  { id: 14, name: 'Mercado Livre', shortName: 'Mercado Livre', category: 'portal', icon: '🛒', description: 'Categoria Imóveis' },
  { id: 15, name: 'Casa Mineira', shortName: 'Casa Mineira', category: 'portal', icon: '🏡', description: 'Portal Casa Mineira' },
  { id: 16, name: 'Chaves Na Mão', shortName: 'Chaves Na Mão', category: 'portal', icon: '🔑', description: 'Portal Chaves na Mão' },
  { id: 17, name: 'Dream Casa', shortName: 'Dream Casa', category: 'portal', icon: '✨', description: 'Portal Dream Casa' },
  { id: 18, name: '123i', shortName: '123i', category: 'portal', icon: '🔢', description: 'Portal 123i' },
  { id: 19, name: 'Moving Imóveis', shortName: 'Moving', category: 'portal', icon: '🚚', description: 'Portal Moving Imóveis' },
  { id: 20, name: 'DF Imóveis', shortName: 'DF Imóveis', category: 'portal', icon: '🏛️', description: 'Portal DF Imóveis' },
  { id: 21, name: 'Wimoveis', shortName: 'Wimoveis', category: 'portal', icon: '🏘️', description: 'Portal Wimoveis' },
  { id: 22, name: 'Homer', shortName: 'Homer', category: 'portal', icon: '🏚️', description: 'Portal Homer' },
  { id: 23, name: 'Buskaza', shortName: 'Buskaza', category: 'portal', icon: '🔎', description: 'Portal Buskaza' },
  { id: 24, name: 'Órulo', shortName: 'Órulo', category: 'portal', icon: '🎯', description: 'Portal Órulo' },
  { id: 25, name: 'Lugar Certo', shortName: 'Lugar Certo', category: 'portal', icon: '📍', description: 'Portal Lugar Certo' },
  { id: 26, name: 'ImovoMAP', shortName: 'ImovoMAP', category: 'portal', icon: '🗺️', description: 'Portal ImovoMAP' },
  { id: 27, name: 'MGF Imóveis', shortName: 'MGF Imóveis', category: 'portal', icon: '🏗️', description: 'Portal MGF Imóveis' },
  { id: 28, name: 'Portal RJ Imóveis', shortName: 'RJ Imóveis', category: 'portal', icon: '🌆', description: 'Portal RJ Imóveis' },
  { id: 29, name: '321achei', shortName: '321achei', category: 'portal', icon: '🔍', description: 'Portal 321achei' },
  { id: 30, name: 'Compre Alugue Agora', shortName: 'Compre Alugue', category: 'portal', icon: '📝', description: 'Portal Compre Alugue Agora' },
  { id: 31, name: 'Arbo Imóveis', shortName: 'Arbo', category: 'portal', icon: '🏢', description: 'Via integração de sistema' }
] as const;

type SourceImage = { [sourceId: number]: string };
import { useAuth } from "@/hooks/useAuth";
import { previewTenantCorretoresFromImoveis, getTenantCorretores, getTenantXmlUrl, setTenantXmlUrl, syncTenantImoveisFromXml, loadXmlDataFromSupabase, saveXmlConfigToSupabase } from '@/features/imoveis/services/imoveisXmlService';
import { syncImoveisForAllCorretores } from '@/features/imoveis/services/xmlSyncService';
import { supabase } from '@/lib/supabaseClient';
import { 
  saveKenloLeads, 
  saveKenloIntegration, 
  fetchKenloIntegration,
  fetchKenloLeads,
  disconnectKenloIntegration 
} from '@/features/imoveis/services/kenloLeadsService';
import { ApiIntegrationTab } from '@/components/integrations/ApiIntegrationTab';

type ActiveTab = 'integrations' | 'api' | 'xml';

// Componente principal da página
export const IntegracoesPage: React.FC = () => {
  const { tenantId } = useAuth();
  const location = useLocation();

  // Aba ativa via URL (?tab=integrations|xml|api)
  const activeTab = useMemo<ActiveTab>(() => {
    const t = new URLSearchParams(location.search).get('tab');
    if (t === 'xml' || t === 'api' || t === 'integrations') return t;
    return 'integrations';
  }, [location.search]);

  const [copiedKenlo, setCopiedKenlo] = useState(false);
  const [xmlUrl, setXmlUrl] = useState('');
  const [isSyncingXml, setIsSyncingXml] = useState(false);
  const [xmlStatus, setXmlStatus] = useState<'idle' | 'saved' | 'synced' | 'error'>('idle');
  const [xmlErrorMessage, setXmlErrorMessage] = useState('');
  const [xmlCorretoresPreview, setXmlCorretoresPreview] = useState<ReturnType<typeof previewTenantCorretoresFromImoveis>>([]);
  const [isCreatingAccess, setIsCreatingAccess] = useState(false);
  const [isSyncingAllBrokers, setIsSyncingAllBrokers] = useState(false);
  const [syncAllBrokersResult, setSyncAllBrokersResult] = useState<{ ok: boolean; summary?: any; error?: string } | null>(null);
  const [createAccessResult, setCreateAccessResult] = useState<
    | null
    | {
        summary: { created: number; exists: number; skipped: number; error: number };
        results: Array<{ email?: string; nome?: string; status: string; reason?: string }>;
      }
  >(null);
  
  // Estados do formulário Kenlo
  const [kenloEmail, setKenloEmail] = useState('');
  const [kenloSenha, setKenloSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [kenloStatus, setKenloStatus] = useState<'inativo' | 'ativo' | 'erro'>('inativo');
  const [kenloLeads, setKenloLeads] = useState(0);

  // Estados para imagens customizadas das origens
  const [sourceImages, setSourceImages] = useState<SourceImage>({
    0: 'https://i.ibb.co/R44Rg4P3/518026148-1580198479439723-6027837477854414912-n.jpg',
    1: 'https://i.ibb.co/QjcnJ0rW/24b31ec39fc0d2b7ccddd7c7917615b1.jpg',
    3: 'https://i.ibb.co/7dLzZdkn/instagram-fundo-em-cores-gradientes-23-2147823814-1.avif',
    5: 'https://i.ibb.co/mZvkJ6t/2496097.png',
    6: 'https://i.ibb.co/BHtr3cyN/web-site-www-icon-logo-png-seeklogo-446764.png',
    7: 'https://i.ibb.co/6cKKfmRy/images-1.png',
    8: 'https://i.ibb.co/V0mStf9b/3867462.png',
    9: 'https://i.ibb.co/sJp0S7d3/360-F-597374605-tph8v-B4-Rrk-Kv-N2-MT1g-Ke-JUKer-CR8-LYu8.jpg',
    11: 'https://i.ibb.co/bM2gsYQS/images-3.png',
    12: 'https://i.ibb.co/4ggWZwqZ/659bd829-6022-4624-aef9-00e5ca18936a.png',
    14: 'https://i.ibb.co/gLg8WbFV/mercado-libre-thumbnail-1538x1510-b612412b.webp',
    15: 'https://i.ibb.co/xSZmLnXH/casa-mineira-imoveis.webp',
    16: 'https://i.ibb.co/1fgY9ryV/5e39cf71-f528-45eb-831a-5504cee6dede.png',
    17: 'https://i.ibb.co/mVy4Jwy4/logo-dreamcasa-zp-Ex-GK.png',
    18: 'https://i.ibb.co/Tqd3my1H/123i.png',
    19: 'https://i.ibb.co/prZpmpLr/360-F-230623592-c-QY0-Ybs-Qb523d3b0yq-VFupo-Ox-IRGwt-EO.jpg',
    20: 'https://i.ibb.co/SD1DYTR8/c8ae75f7-199e-4739-8003-b3fe5205d5e6.png',
    21: 'https://i.ibb.co/fzHMBLxS/images-4.png',
    22: 'https://i.ibb.co/MxtvBJtj/Case-Homer-Jokerman-Belem-Design-grafico-Marca-Logo-3.webp',
    23: 'https://i.ibb.co/Nd7PNPLQ/1da08323-3af9-4de4-8f50-f58ecfec0175.png',
    24: 'https://i.ibb.co/PzCw1P5X/empresa-parceira-orulo.webp',
    25: 'https://i.ibb.co/nqx914XW/20150120185443870492i.jpg',
    26: 'https://i.ibb.co/mCcPL7hX/imagem-2026-02-10-115003662.png',
    27: 'https://i.ibb.co/Tqbk9jcV/mgfimoveisbr-512x512-v1.png',
    28: 'https://i.ibb.co/nssyMdSx/imagem-2026-02-10-120110867.png',
    29: 'https://i.ibb.co/Hf1JqTm9/icone-social.png',
    30: 'https://i.ibb.co/ccM9H6r8/metataglogocaa.png',
    31: 'https://i.ibb.co/S4L8nCMn/arbo-verde.png'
  });
  const [editingSourceId, setEditingSourceId] = useState<number | null>(null);
  const [tempImageUrl, setTempImageUrl] = useState('');
  const [hoveredSourceId, setHoveredSourceId] = useState<number | null>(null);

  // Carregar imagens salvas do Supabase
  useEffect(() => {
    const loadSourceImages = async () => {
      if (!tenantId) return;
      const { data, error } = await supabase
        .from('tenant_source_images')
        .select('source_id, image_url')
        .eq('tenant_id', tenantId);
      
      if (!error && data) {
        const images: SourceImage = {};
        data.forEach((item: { source_id: number; image_url: string }) => {
          images[item.source_id] = item.image_url;
        });
        setSourceImages((prev) => ({ ...prev, ...images }));
      }
    };
    loadSourceImages();
  }, [tenantId]);

  // Salvar imagem de uma origem
  const saveSourceImage = async (sourceId: number, imageUrl: string) => {
    if (!tenantId) return;
    
    const { error } = await supabase
      .from('tenant_source_images')
      .upsert({
        tenant_id: tenantId,
        source_id: sourceId,
        image_url: imageUrl,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'tenant_id,source_id'
      });
    
    if (!error) {
      setSourceImages(prev => ({ ...prev, [sourceId]: imageUrl }));
      setEditingSourceId(null);
      setTempImageUrl('');
    }
  };

  // 🔐 Função para obter novo token usando credenciais salvas
  const authenticateWithKenlo = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      const authResponse = await fetch('https://puppeter.octoia.org/webhook/62b2a83e-8ce1-4486-a98b-cb089012ba5e', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha: password })
      });
      
      if (!authResponse.ok) {
        console.error('❌ [Auth] Erro ao autenticar:', authResponse.status);
        return null;
      }
      
      const authData = await authResponse.json();
      const rawData = Array.isArray(authData) ? authData[0] : authData;
      const token = rawData?.token || rawData?.access_token || rawData?.accessToken || rawData;
      
      if (token && typeof token === 'string') {
        return token;
      }
      return null;
    } catch (error) {
      console.error('❌ [Auth] Erro:', error);
      return null;
    }
  }, []);

  // 🚀 Carregar integração (sem iniciar atualização automática)
  useEffect(() => {
    const loadIntegration = async () => {
      if (!tenantId) return;
      
      // Sempre buscar leads existentes no banco (mesmo se integração inativa)
      const { leads: existingLeads } = await fetchKenloLeads(tenantId);
      if (existingLeads && existingLeads.length > 0) {
        setKenloLeads(existingLeads.length);
      }
      
      const { integration } = await fetchKenloIntegration(tenantId);
      if (integration) {
        setKenloEmail(integration.kenlo_email || '');
        setKenloStatus(integration.status === 'active' ? 'ativo' : 'inativo');
        // Usar contagem real do banco, não a salva na integração
        if (existingLeads && existingLeads.length > 0) {
          setKenloLeads(existingLeads.length);
        }
        
        // Não iniciar atualização automática aqui
      } else if (existingLeads && existingLeads.length > 0) {
        // Tem leads mas não tem integração - significa que desconectou mas leads ficaram
      }
    };
    
    loadIntegration();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    
    // Carregar dados do Supabase primeiro, depois do localStorage
    const loadXmlData = async () => {
      await loadXmlDataFromSupabase(tenantId);
      setXmlUrl(getTenantXmlUrl(tenantId));
    };
    
    loadXmlData();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    // Carregar corretores existentes do localStorage (apenas para referência)
    getTenantCorretores(tenantId);
  }, [tenantId]);

  // Handler para conectar ao Kenlo
  const handleKenloConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!kenloEmail || !kenloSenha) return;
    
    setIsConnecting(true);
    
    try {
      // 🔹 PASSO 1: Enviar credenciais para o webhook e receber o TOKEN
      const authResponse = await fetch('https://puppeter.octoia.org/webhook/62b2a83e-8ce1-4486-a98b-cb089012ba5e', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: kenloEmail,
          senha: kenloSenha
        })
      });
      
      if (!authResponse.ok) {
        console.error('❌ Erro ao obter token:', authResponse.status);
        setKenloStatus('erro');
        return;
      }
      
      const authData = await authResponse.json();
      
      // Extrair o token da resposta (pode vir em diferentes formatos)
      const rawData = Array.isArray(authData) ? authData[0] : authData;
      const authToken = rawData?.token || rawData?.access_token || rawData?.accessToken || rawData;
      
      if (!authToken || typeof authToken !== 'string') {
        console.error('❌ Token não encontrado na resposta');
        setKenloStatus('erro');
        return;
      }
      
      
      // 🔹 PASSO 2: Usar o token para buscar a lista de leads do Ingaia
      const leadsResponse = await fetch('https://leads.ingaia.com.br/leads/ingaia/?page=1&perPage=0', {
        method: 'GET',
        headers: {
          'authorization': `Bearer ${authToken}`
        }
      });
      
      if (!leadsResponse.ok) {
        console.error('❌ Erro ao buscar leads:', leadsResponse.status);
        setKenloStatus('erro');
        return;
      }
      
      const leadsData = await leadsResponse.json();
      
      // Extrair array de leads
      const leadsList = leadsData.data || leadsData.leads || leadsData;
      if (!Array.isArray(leadsList) || leadsList.length === 0) {
        setKenloStatus('ativo');
        return;
      }
      
      
      // 🔹 PASSO 3: Buscar detalhes de TODOS os leads em alta velocidade
      
      const leadsCompletos: any[] = [];
      const batchSize = 100; // Processar 100 leads por vez para máxima velocidade
      let successCount = 0;
      let failCount = 0;
      const totalBatches = Math.ceil(leadsList.length / batchSize);
      
      for (let i = 0; i < leadsList.length; i += batchSize) {
        const batch = leadsList.slice(i, i + batchSize);
        const currentBatch = Math.floor(i/batchSize) + 1;
        
        // Log a cada 5 lotes para não poluir o console
        if (currentBatch % 5 === 1 || currentBatch === totalBatches) {
        }
        
        const batchPromises = batch.map(async (lead: any) => {
          const leadId = lead._id || lead.id;
          if (!leadId) return lead;
          
          try {
            const detailResponse = await fetch(
              `https://leads.ingaia.com.br/leads/ingaia/${leadId}?fields=interest%2Cmessage%2CattendedBy`,
              {
                method: 'GET',
                headers: {
                  'authorization': `Bearer ${authToken}`
                }
              }
            );
            
            if (detailResponse.ok) {
              const detailData = await detailResponse.json();
              successCount++;
              return { ...lead, ...detailData };
            }
            failCount++;
            return lead;
          } catch {
            failCount++;
            return lead;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        leadsCompletos.push(...batchResults);
        
        // Delay mínimo apenas para não travar o browser
        if (i + batchSize < leadsList.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      
      // 🔹 PASSO 4: Salvar leads no Supabase
      if (leadsCompletos.length > 0 && tenantId) {
        const saveResult = await saveKenloLeads(tenantId, leadsCompletos);
        
        if (saveResult.success) {
          setKenloLeads(leadsCompletos.length);
          
          // Salvar integração COM credenciais para reautenticação automática
          const intResult = await saveKenloIntegration(tenantId, kenloEmail, leadsCompletos.length, kenloSenha, authToken);
        } else {
          console.error('❌ Erro ao salvar leads:', saveResult.error);
        }
      }
      
      setKenloStatus('ativo');
      
    } catch (error) {
      console.error('❌ Erro na conexão:', error);
      setKenloStatus('erro');
    } finally {
      setIsConnecting(false);
    }
  };

  // Status config
  const statusConfig = {
    ativo: { 
      color: 'bg-green-100 text-green-700 border-green-200', 
      icon: CheckCircle2, 
      label: 'Conectado' 
    },
    inativo: { 
      color: 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-800', 
      icon: XCircle, 
      label: 'Desconectado' 
    },
    erro: { 
      color: 'bg-red-100 text-red-700 border-red-200', 
      icon: XCircle, 
      label: 'Erro' 
    }
  };

  const status = statusConfig[kenloStatus];
  const StatusIcon = status.icon;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-secondary, #f8fafc)' }}>

      {/* Conteúdo da Aba */}
      {activeTab === 'api' ? (
        <ApiIntegrationTab />
      ) : activeTab === 'xml' ? (
        <div className="p-6">
          <div className="max-w-3xl">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-6">
              <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Kenlo - Feed de Imóveis</h2>
                  <p className="text-sm text-gray-500 dark:text-slate-400">Integração XML para catálogo de imóveis</p>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-lg mb-5">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-green-700 font-medium text-sm">Integração Ativa</span>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">URL do Feed XML</p>
                <div className="flex gap-2">
                  <input
                    value={xmlUrl}
                    onChange={(e) => {
                      setXmlUrl(e.target.value);
                      if (xmlStatus !== 'idle') setXmlStatus('idle');
                      if (xmlErrorMessage) setXmlErrorMessage('');
                    }}
                    className="flex-1 px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!xmlUrl) return;
                      navigator.clipboard.writeText(xmlUrl);
                      setCopiedKenlo(true);
                      setTimeout(() => setCopiedKenlo(false), 2000);
                    }}
                    className="px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                    title="Copiar"
                  >
                    {copiedKenlo ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-700 dark:text-slate-300" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!xmlUrl) return;
                      window.open(xmlUrl, '_blank');
                    }}
                    className="px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                    title="Abrir"
                  >
                    <ExternalLink className="w-4 h-4 text-gray-700 dark:text-slate-300" />
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                  Este link fornece os dados de todos os imóveis ativos da imobiliária
                </p>

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!tenantId) return;
                      setTenantXmlUrl(tenantId, xmlUrl.trim());
                      // Salvar também no Supabase para persistência
                      await saveXmlConfigToSupabase(tenantId, xmlUrl.trim(), 0);
                      setXmlStatus('saved');
                    }}
                    className="px-4 py-2 border border-gray-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors text-sm font-medium text-gray-900 dark:text-slate-100"
                    disabled={!tenantId}
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!tenantId) return;
                      setIsSyncingXml(true);
                      try {
                        setTenantXmlUrl(tenantId, xmlUrl.trim());
                        const syncResult = await syncTenantImoveisFromXml(tenantId);
                        
                        setXmlStatus('synced');
                        const corretores = previewTenantCorretoresFromImoveis(tenantId);
                        
                        // Log detalhado dos corretores extraídos
                        
                        // Verificar quantos têm email
                        const comEmail = corretores.filter(c => c.email && c.email.includes('@')).length;
                        
                        setXmlCorretoresPreview(corretores);
                        setCreateAccessResult(null);
                      } catch (err) {
                        setXmlStatus('error');
                        setXmlErrorMessage(err instanceof Error ? err.message : String(err));
                      } finally {
                        setIsSyncingXml(false);
                      }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!tenantId || !xmlUrl.trim() || isSyncingXml}
                  >
                    {isSyncingXml ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                </div>

                {xmlStatus === 'saved' ? (
                  <p className="text-xs text-green-700 mt-2">URL salva para este tenant.</p>
                ) : xmlStatus === 'synced' ? (
                  <p className="text-xs text-green-700 mt-2">Imóveis importados com sucesso. Vá em Imóveis para visualizar.</p>
                ) : xmlStatus === 'error' ? (
                  <p className="text-xs text-red-600 mt-2">Erro ao importar: {xmlErrorMessage || 'Verifique a URL e tente novamente.'}</p>
                ) : null}

                {xmlStatus === 'synced' && xmlCorretoresPreview.length > 0 && (
                  <div className="mt-4 p-4 rounded-lg border border-blue-200 bg-blue-50">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-blue-900">Criar corretores e logins</p>
                        <p className="text-xs text-blue-800 mt-1">
                          Encontramos <strong>{xmlCorretoresPreview.length}</strong> corretores com imóveis.
                        </p>
                        <p className="text-xs text-blue-700 mt-1">
                          Login: email do XML | Senha: 4 últimos dígitos do telefone
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!tenantId) return;
                            setIsCreatingAccess(true);
                            setCreateAccessResult(null);
                            try {
                              // Filtrar apenas corretores com email válido
                              const corretoresValidos = xmlCorretoresPreview.filter(c => {
                                const hasEmail = c.email && c.email.includes('@');
                                const hasName = c.nome && c.nome.trim().length > 0;
                                return hasEmail && hasName;
                              });


                              if (corretoresValidos.length === 0) {
                                throw new Error('Nenhum corretor com email válido encontrado no XML. Verifique se o XML contém dados de email dos corretores.');
                              }

                              const payload = {
                                tenantId,
                                corretores: corretoresValidos.map((c) => ({
                                  nome: c.nome.trim(),
                                  email: c.email!.trim().toLowerCase(),
                                  telefone: c.telefone || '',
                                  foto: c.foto || '',
                                  codigosImoveis: c.codigosImoveis || [], // Códigos dos imóveis do XML
                                })),
                              };


                              const { data, error } = await supabase.functions.invoke('xml-create-broker-access', {
                                body: payload,
                              });

                              if (error) {
                                throw new Error(error.message);
                              }

                              if (!data?.ok) {
                                throw new Error(data?.error || 'Falha ao criar corretores');
                              }

                              setCreateAccessResult({
                                summary: data.summary,
                                results: data.results,
                              });
                            } catch (e) {
                              setCreateAccessResult({
                                summary: { created: 0, exists: 0, skipped: 0, error: 1 },
                                results: [
                                  {
                                    status: 'error',
                                    reason: e instanceof Error ? e.message : String(e),
                                  },
                                ],
                              });
                            } finally {
                              setIsCreatingAccess(false);
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={isCreatingAccess}
                        >
                          {isCreatingAccess ? 'Criando...' : 'Criar corretores'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-blue-200 bg-white dark:bg-slate-900">
                      <div className="divide-y divide-blue-100">
                        {xmlCorretoresPreview.slice(0, 50).map((c) => (
                          <div key={`${c.email || c.nome}`} className="p-3 flex items-center gap-3">
                            {c.foto ? (
                              <img
                                src={c.foto}
                                alt={c.nome}
                                className="w-8 h-8 rounded-lg object-cover border border-blue-100"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center text-xs font-semibold">
                                {(c.nome || '?').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{c.nome}</p>
                              <p className="text-xs text-gray-600 dark:text-slate-400 truncate">
                                {[c.email, c.telefone].filter(Boolean).join(' • ') || 'Sem contato'}
                              </p>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-slate-400 whitespace-nowrap">
                              {c.imoveisCount} imóveis
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {xmlCorretoresPreview.length > 50 && (
                      <p className="text-xs text-blue-800 mt-2">Mostrando 50 de {xmlCorretoresPreview.length} corretores.</p>
                    )}

                    {createAccessResult && (
                      <div className="mt-3 p-3 rounded-lg border border-blue-200 bg-white dark:bg-slate-900">
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Resultado da criação de acessos</p>
                        <p className="text-xs text-gray-700 dark:text-slate-300 mt-1">
                          Criados: <strong>{createAccessResult.summary.created}</strong> | Já existiam: <strong>{createAccessResult.summary.exists}</strong> | Ignorados: <strong>{createAccessResult.summary.skipped}</strong> | Erros: <strong>{createAccessResult.summary.error}</strong>
                        </p>

                        {createAccessResult.summary.error > 0 && (
                          <div className="mt-2 max-h-32 overflow-auto rounded border border-gray-200 dark:border-slate-800">
                            <div className="divide-y divide-gray-100">
                              {createAccessResult.results
                                .filter((r) => r.status === 'error')
                                .slice(0, 10)
                                .map((r, idx) => (
                                  <div key={idx} className="p-2 text-xs text-red-700">
                                    {(r.email || r.nome || 'corretor')}: {r.reason || 'erro'}
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Botão para sincronizar imóveis para TODOS os corretores */}
                    <div className="mt-4 p-4 rounded-lg border border-green-200 bg-green-50">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-green-900 flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Atribuir imóveis para TODOS os corretores
                          </p>
                          <p className="text-xs text-green-800 mt-1">
                            Sincroniza automaticamente os imóveis do XML para cada corretor cadastrado.
                          </p>
                          <p className="text-xs text-green-700 mt-1">
                            Cada corretor verá seus imóveis na aba "Meus Imóveis" baseado no email/telefone/nome.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!tenantId) return;
                            setIsSyncingAllBrokers(true);
                            setSyncAllBrokersResult(null);
                            try {
                              const result = await syncImoveisForAllCorretores(tenantId);
                              setSyncAllBrokersResult({
                                ok: result.ok,
                                summary: {
                                  created: result.summary.sincronizados,
                                  exists: result.summary.total - result.summary.erros,
                                  skipped: result.summary.erros
                                },
                                error: result.ok ? undefined : result.detalhes.find(d => d.erro)?.erro
                              });
                            } catch (e) {
                              console.error('❌ [Sync All Brokers] Erro:', e);
                              setSyncAllBrokersResult({
                                ok: false,
                                error: e instanceof Error ? e.message : String(e)
                              });
                            } finally {
                              setIsSyncingAllBrokers(false);
                            }
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          disabled={isSyncingAllBrokers}
                        >
                          {isSyncingAllBrokers ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Sincronizando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              Sincronizar Todos
                            </>
                          )}
                        </button>
                      </div>

                      {syncAllBrokersResult && (
                        <div className={`mt-3 p-3 rounded-lg border ${syncAllBrokersResult.ok ? 'border-green-300 bg-green-100' : 'border-red-300 bg-red-100'}`}>
                          {syncAllBrokersResult.ok ? (
                            <>
                              <p className="text-sm font-semibold text-green-900 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" />
                                Sincronização concluída!
                              </p>
                              {syncAllBrokersResult.summary && (
                                <p className="text-xs text-green-800 mt-1">
                                  Criados: <strong>{syncAllBrokersResult.summary.created || 0}</strong> | 
                                  Já existiam: <strong>{syncAllBrokersResult.summary.exists || 0}</strong> | 
                                  Ignorados: <strong>{syncAllBrokersResult.summary.skipped || 0}</strong>
                                </p>
                              )}
                              <p className="text-xs text-green-700 mt-1">
                                Cada corretor agora pode ver seus imóveis na aba "Meus Imóveis".
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-red-900 flex items-center gap-2">
                                <XCircle className="w-4 h-4" />
                                Erro na sincronização
                              </p>
                              <p className="text-xs text-red-800 mt-1">
                                {syncAllBrokersResult.error || 'Erro desconhecido'}
                              </p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6">
          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Plug className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Total de Integrações</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">1</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Integrações Ativas</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{kenloStatus === 'ativo' ? 1 : 0}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Leads Recebidos</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{kenloLeads}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Seção CRM */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4 flex items-center gap-2">
              CRM
              <span className="text-xs font-normal text-gray-400 dark:text-slate-500">(1)</span>
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Card Kenlo Imob */}
              <div className={`bg-white dark:bg-slate-900 rounded-xl border-2 p-3 w-full relative transition-all ${
                kenloStatus === 'ativo' 
                  ? 'border-green-200 bg-gradient-to-br from-white to-green-50/30' 
                  : 'border-gray-200 dark:border-slate-800'
              }`}>
                <div className={`absolute right-3 top-3 px-2 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 border ${status.color}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {status.label}
                </div>

                {kenloStatus === 'ativo' && (
                  <div className="absolute left-3 top-3 px-2 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 bg-green-100 text-green-700 border border-green-200">
                    <Zap className="w-3.5 h-3.5" />
                    Kenlo
                  </div>
                )}

                <div className="flex flex-col items-center text-center pt-1">
                  <div className={`w-12 h-12 rounded-lg overflow-hidden ring-2 flex items-center justify-center transition-all ${
                    kenloStatus === 'ativo'
                      ? 'ring-green-200 bg-green-50'
                      : 'ring-black/5 bg-gray-50 dark:bg-slate-950'
                  }`}>
                    <img
                      src="https://i.ibb.co/spMc8BV4/Chat-GPT-Image-21-de-jan-de-2026-21-11-26.png"
                      alt="Kenlo"
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm mt-2">Kenlo Imob</h3>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">Integração com o CRM Kenlo Imob</p>
                  
                  {kenloStatus === 'ativo' && (
                    <div className="mt-2 p-2 rounded-lg bg-green-50 border border-green-100 w-full">
                      <p className="text-[11px] text-green-700 font-medium">✓ Integração OK</p>
                      <p className="text-[11px] text-green-600 mt-0.5">Feito pelo Kenlo</p>
                      {kenloLeads > 0 && (
                        <p className="text-[11px] text-green-600 mt-1">
                          <strong>{kenloLeads}</strong> leads sincronizados
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <form onSubmit={handleKenloConnect} className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                      E-mail
                    </label>
                    <input
                      type="email"
                      value={kenloEmail}
                      onChange={(e) => setKenloEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                      disabled={isConnecting || kenloStatus === 'ativo'}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                      Senha
                    </label>
                    <div className="relative flex items-center">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={kenloSenha}
                        onChange={(e) => setKenloSenha(e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all pr-10"
                        disabled={isConnecting || kenloStatus === 'ativo'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 flex items-center justify-center transition-colors"
                        style={{ color: '#000000' }}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-1">
                    {kenloStatus === 'ativo' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (tenantId) {
                            // Apenas desconecta - NÃO deleta os leads do banco
                            await disconnectKenloIntegration(tenantId);
                          }
                          setKenloStatus('inativo');
                          // Manter email para referência, apenas limpar senha e token
                          setKenloSenha('');
                          // NÃO zerar kenloLeads - os leads continuam no banco
                        }}
                        className="w-full px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                      >
                        Desconectar
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={isConnecting || !kenloEmail || !kenloSenha}
                        className="w-full px-4 py-2 bg-blue-600 text-white disabled:text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 bolsao-connect-button"
                      >
                        {isConnecting ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Conectando...
                          </>
                        ) : (
                          <>
                            Conectar
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* Card OLX (placeholder visual) */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-gray-200 dark:border-slate-800 p-3 w-full relative transition-all">
                <div className="absolute right-3 top-3 px-2 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 border bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-800">
                  <XCircle className="w-3.5 h-3.5" />
                  Desconectado
                </div>

                <div className="flex flex-col items-center text-center pt-1">
                  <div className="w-12 h-12 rounded-lg overflow-hidden ring-2 ring-black/5 bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
                    <img
                      src="https://i.ibb.co/p6PWRfTv/logo-olx-0-Q27-Tg.png"
                      alt="OLX"
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm mt-2">OLX</h3>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">Integração com o CRM OLX</p>
                </div>

                <form className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">E-mail</label>
                    <input type="email" placeholder="seu@email.com" className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 outline-none" disabled />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Senha</label>
                    <div className="relative flex items-center">
                      <input type="password" placeholder="••••••••" className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 outline-none pr-10" disabled />
                      <button type="button" className="absolute right-2.5" style={{ color: '#000000' }} disabled><Eye className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="pt-1">
                    <button type="button" disabled className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium opacity-50 cursor-not-allowed flex items-center justify-center gap-2">Conectar<ArrowRight className="w-4 h-4" /></button>
                  </div>
                </form>
              </div>

              {/* Card Zap Imóveis (placeholder visual) */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-gray-200 dark:border-slate-800 p-3 w-full relative transition-all">
                <div className="absolute right-3 top-3 px-2 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 border bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-800">
                  <XCircle className="w-3.5 h-3.5" />
                  Desconectado
                </div>

                <div className="flex flex-col items-center text-center pt-1">
                  <div className="w-12 h-12 rounded-lg overflow-hidden ring-2 ring-black/5 bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
                    <img
                      src="https://i.ibb.co/23SwZGWw/8a6e16ca-fde3-495b-b26c-9dfaca34e641.png"
                      alt="Zap Imóveis"
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm mt-2">Zap Imóveis</h3>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">Integração com Zap para captação de leads</p>
                </div>

                <form className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">E-mail</label>
                    <input type="email" placeholder="seu@email.com" className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 outline-none" disabled />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Senha</label>
                    <div className="relative flex items-center">
                      <input type="password" placeholder="••••••••" className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 outline-none pr-10" disabled />
                      <button type="button" className="absolute right-2.5" style={{ color: '#000000' }} disabled><Eye className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="pt-1">
                    <button type="button" disabled className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium opacity-50 cursor-not-allowed flex items-center justify-center gap-2">Conectar<ArrowRight className="w-4 h-4" /></button>
                  </div>
                </form>
              </div>

              {/* Card Facebook Leads (placeholder visual) */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-gray-200 dark:border-slate-800 p-3 w-full relative transition-all">
                <div className="absolute right-3 top-3 px-2 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 border bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-800">
                  <XCircle className="w-3.5 h-3.5" />
                  Desativado
                </div>

                <div className="flex flex-col items-center text-center pt-1">
                  <div className="w-12 h-12 rounded-lg overflow-hidden ring-2 ring-black/5 bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
                    <img
                      src="https://i.ibb.co/1fyQKkQM/OIP.webp"
                      alt="Facebook Leads"
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm mt-2">Facebook Leads</h3>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">Integração com formulários do Meta</p>
                </div>

                <form className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">E-mail</label>
                    <input type="email" placeholder="seu@email.com" className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 outline-none" disabled />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Senha</label>
                    <div className="relative flex items-center">
                      <input type="password" placeholder="••••••••" className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 outline-none pr-10" disabled />
                      <button type="button" className="absolute right-2.5" style={{ color: '#000000' }} disabled><Eye className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="pt-1">
                    <button type="button" disabled className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium opacity-50 cursor-not-allowed flex items-center justify-center gap-2">Conectar<ArrowRight className="w-4 h-4" /></button>
                  </div>
                </form>
              </div>

              {/* Card Google Ads (placeholder visual) */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border-2 border-gray-200 dark:border-slate-800 p-3 w-full relative transition-all">
                <div className="absolute right-3 top-3 px-2 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 border bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-800">
                  <XCircle className="w-3.5 h-3.5" />
                  Desconectado
                </div>

                <div className="flex flex-col items-center text-center pt-1">
                  <div className="w-12 h-12 rounded-lg overflow-hidden ring-2 ring-black/5 bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
                    <img
                      src="https://i.ibb.co/RGSBF1HD/Google-Ad-Words-logo.png"
                      alt="Google Ads"
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm mt-2">Google Ads</h3>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">Integração com campanhas e conversões</p>
                </div>

                <form className="mt-4 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">E-mail</label>
                    <input type="email" placeholder="seu@email.com" className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 outline-none" disabled />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Senha</label>
                    <div className="relative flex items-center">
                      <input type="password" placeholder="••••••••" className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 outline-none pr-10" disabled />
                      <button type="button" className="absolute right-2.5" style={{ color: '#000000' }} disabled><Eye className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="pt-1">
                    <button type="button" disabled className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium opacity-50 cursor-not-allowed flex items-center justify-center gap-2">Conectar<ArrowRight className="w-4 h-4" /></button>
                  </div>
                </form>
              </div>

              {/* Cards das demais Origens - Mesmo layout (excluindo as que já têm cards estáticos) */}
              {LEAD_SOURCES.filter(s => ![2, 4, 10, 13].includes(s.id)).map((source) => (
                <div 
                  key={source.id} 
                  className="bg-white dark:bg-slate-900 rounded-xl border-2 border-gray-200 dark:border-slate-800 p-3 w-full relative transition-all group"
                  onMouseEnter={() => setHoveredSourceId(source.id)}
                  onMouseLeave={() => setHoveredSourceId(null)}
                >
                  <div className="absolute right-3 top-3 px-2 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 border bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-800">
                    <XCircle className="w-3.5 h-3.5" />
                    Desconectado
                  </div>

                  <div className="flex flex-col items-center text-center pt-1">
                    <div 
                      className="w-12 h-12 rounded-lg overflow-hidden ring-2 ring-black/5 bg-gray-50 dark:bg-slate-950 flex items-center justify-center relative"
                    >
                      {sourceImages[source.id] ? (
                        <img
                          src={sourceImages[source.id]}
                          alt={source.name}
                          className="w-full h-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-gray-400 dark:text-slate-500">
                          <ImagePlus className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm mt-2">{source.shortName}</h3>
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{source.description}</p>
                  </div>

                  <form className="mt-4 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">E-mail</label>
                      <input type="email" placeholder="seu@email.com" className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 outline-none" disabled />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">Senha</label>
                      <div className="relative flex items-center">
                        <input type="password" placeholder="••••••••" className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 outline-none pr-10" disabled />
                        <button type="button" className="absolute right-2.5" style={{ color: '#000000' }} disabled><Eye className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div className="pt-1">
                      <button type="button" disabled className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium opacity-50 cursor-not-allowed flex items-center justify-center gap-2">Conectar<ArrowRight className="w-4 h-4" /></button>
                    </div>
                  </form>
                </div>
              ))}
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mt-8 max-w-xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <ExternalLink className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-900 text-sm">Como funciona a integração Kenlo?</h3>
                <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                  Ao conectar sua conta do Kenlo Imob, os leads cadastrados lá serão 
                  automaticamente sincronizados com este CRM. Seus dados são criptografados 
                  e armazenados de forma segura.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegracoesPage;
