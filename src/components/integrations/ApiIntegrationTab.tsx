/**
 * API Integration Tab - Modernized & Minimalist
 */

import React, { useState, useEffect } from 'react';
import {
  Key, Copy, Eye, EyeOff, RefreshCw, Trash2,
  CheckCircle2, AlertCircle, Book, ChevronRight, Check, UserCheck, ToggleLeft, ToggleRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from "@/hooks/useAuth";
import { fetchApiKey, generateApiKey, revokeApiKey, type ApiKey } from '@/features/settings/services/apiKeyService';
import { supabase } from '@/integrations/supabase/client';

export const ApiIntegrationTab: React.FC = () => {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState<ApiKey | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoAssignBroker, setAutoAssignBroker] = useState(true);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => { 
    if (tenantId) {
      loadApiKey();
      loadTenantConfig();
    }
  }, [tenantId]);

  const loadTenantConfig = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('tenants')
      .select('auto_assign_broker')
      .eq('id', tenantId)
      .maybeSingle();
    if (data) setAutoAssignBroker(data.auto_assign_broker ?? true);
  };

  const handleToggleAutoAssign = async () => {
    if (!tenantId) return;
    setIsSavingConfig(true);
    const newValue = !autoAssignBroker;
    const { error } = await supabase
      .from('tenants')
      .update({ auto_assign_broker: newValue })
      .eq('id', tenantId);
    if (!error) setAutoAssignBroker(newValue);
    setIsSavingConfig(false);
  };

  const loadApiKey = async () => {
    if (!tenantId) return;
    setIsLoading(true);
    const { apiKey: key } = await fetchApiKey(tenantId);
    setApiKey(key);
    setIsLoading(false);
  };

  const handleGenerateKey = async () => {
    if (!tenantId) return;
    setIsGenerating(true);
    const { apiKey: newKey } = await generateApiKey(tenantId);
    if (newKey) { setApiKey(newKey); setShowKey(true); }
    setIsGenerating(false);
  };

  const handleRevokeKey = async () => {
    if (!tenantId || !apiKey) return;
    if (!window.confirm('Deseja realmente revogar esta API Key? Esta ação não pode ser desfeita.')) return;
    const { success } = await revokeApiKey(tenantId, apiKey.id);
    if (success) { setApiKey(null); setShowKey(false); }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maskApiKey = (key: string) => key ? key.substring(0, 12) + '••••••••••••••••' : '';

  if (isLoading) return (
    <div className="flex items-start justify-start p-12">
      <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
    </div>
  );

  return (
    <div className="p-8 w-full max-w-5xl animate-in fade-in slide-in-from-left-4 duration-700">
      {/* Título e Subtítulo Alinhados à Esquerda */}
      <div className="mb-12">
        <div className="flex items-center gap-4 mb-3 text-left">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
            <Key className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">API OctoDash</h2>
        </div>
        <p className="text-base text-gray-500 max-w-2xl leading-relaxed text-left">
          Sua ponte para automações inteligentes. Integre leads, webhooks e sistemas externos usando nossa API REST segura.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Lado Esquerdo: API Key Card */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-[24px] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
            <div className="px-8 py-6 flex items-center justify-between border-b border-gray-100 bg-gray-50/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <Key className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold text-gray-800 uppercase tracking-wider">Chave de Produção</span>
              </div>
              {apiKey && (
                <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-600 rounded-full border border-green-100 animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-green-700">Online</span>
                </div>
              )}
            </div>

            <div className="p-8">
              {apiKey ? (
                <div className="space-y-6">
                  <div className="relative group">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 font-mono text-sm text-gray-600 overflow-hidden break-all shadow-inner">
                        {showKey ? apiKey.api_key : maskApiKey(apiKey.api_key)}
                      </div>
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={() => setShowKey(!showKey)} 
                          className="p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 hover:border-gray-200 transition-all text-gray-400 hover:text-gray-900 shadow-sm"
                          title={showKey ? "Ocultar" : "Mostrar"}
                        >
                          {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                        <button 
                          onClick={() => copyToClipboard(apiKey.api_key)} 
                          className={`p-3 rounded-xl border transition-all shadow-sm ${
                            copied 
                              ? 'bg-green-600 border-green-600 text-white' 
                              : 'bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200 text-gray-400 hover:text-gray-900'
                          }`}
                        >
                          {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pt-4">
                    <button 
                      onClick={handleGenerateKey} 
                      disabled={isGenerating} 
                      className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-8 py-3.5 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 disabled:opacity-50 text-sm font-bold transition-all shadow-lg shadow-blue-200 hover:-translate-y-0.5"
                    >
                      <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                      {isGenerating ? 'Gerando...' : 'Regerar Chave'}
                    </button>
                    <button 
                      onClick={handleRevokeKey} 
                      className="flex items-center gap-2 px-6 py-3.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all text-sm font-semibold"
                    >
                      <Trash2 className="w-4 h-4" />
                      Revogar Acesso
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10">
                  <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
                    <Key className="w-8 h-8 text-blue-600 opacity-40" />
                  </div>
                  <h4 className="text-lg font-bold text-gray-900 mb-2">Sem chave ativa</h4>
                  <p className="text-sm text-gray-500 mb-8 max-w-xs mx-auto text-center">
                    Gere sua primeira API Key para começar a enviar leads e automatizar seu CRM.
                  </p>
                  <button 
                    onClick={handleGenerateKey} 
                    disabled={isGenerating} 
                    className="inline-flex items-center justify-center gap-3 px-10 py-4 bg-blue-600 text-white rounded-[20px] hover:bg-blue-700 disabled:opacity-50 font-bold transition-all shadow-xl shadow-blue-100 hover:-translate-y-1"
                  >
                    {isGenerating ? (
                      <><RefreshCw className="w-5 h-5 animate-spin" />Gerando...</>
                    ) : (
                      <><Key className="w-5 h-5" />Gerar API Key</>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Segurança Box */}
          <div className="bg-amber-50/40 border border-amber-100 rounded-[20px] p-6 flex items-start gap-4 transition-all hover:bg-amber-50/60">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-left">
              <p className="font-bold text-amber-900 text-[15px] mb-1">Protocolo de Segurança</p>
              <p className="text-[13px] text-amber-800 leading-relaxed opacity-80">
                Sua API Key concede acesso total aos dados de leads. Nunca a exponha no front-end ou em repositórios públicos. Em caso de suspeita de vazamento, <span className="font-bold underline cursor-pointer" onClick={handleRevokeKey}>revogue-a imediatamente</span>.
              </p>
            </div>
          </div>

          {/* Atribuição Automática de Corretor */}
          <div className="bg-white rounded-[20px] border border-gray-100 shadow-[0_4px_20px_rgb(0,0,0,0.03)] p-6 transition-all hover:shadow-[0_4px_20px_rgb(0,0,0,0.06)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <UserCheck className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="text-left">
                  <h4 className="font-bold text-gray-900 text-[15px] mb-1">Atribuição Automática de Corretor</h4>
                  <p className="text-[13px] text-gray-500 leading-relaxed max-w-md">
                    Quando ativado, leads criados via API são automaticamente atribuídos ao corretor responsável pelo imóvel (via XML Kenlo).
                  </p>
                </div>
              </div>
              <button
                onClick={handleToggleAutoAssign}
                disabled={isSavingConfig}
                className={`relative w-14 h-8 rounded-full transition-all duration-300 ${
                  autoAssignBroker 
                    ? 'bg-emerald-500 shadow-lg shadow-emerald-200' 
                    : 'bg-gray-200'
                } ${isSavingConfig ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${
                  autoAssignBroker ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>
            {autoAssignBroker && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Ativo - Leads serão atribuídos automaticamente ao corretor do imóvel</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Lado Direito: Documentação Quick Link */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-gradient-to-br from-gray-900 to-blue-900 rounded-[24px] p-1 shadow-xl overflow-hidden group">
            <button 
              onClick={() => navigate('/apidocs')} 
              className="w-full h-full bg-transparent p-6 text-white transition-all group-hover:bg-white/5"
            >
              <div className="flex flex-col items-start gap-6">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-md group-hover:scale-110 transition-transform">
                  <Book className="w-6 h-6 text-blue-300" />
                </div>
                <div className="text-left">
                  <h3 className="text-xl font-extrabold mb-2 tracking-tight text-black">Documentação</h3>
                  <p className="text-black text-sm leading-relaxed mb-6">
                    Endpoints REST, payloads de exemplo e guia completo para integração.
                  </p>
                  <div className="inline-flex items-center gap-2 text-black font-bold text-sm group-hover:gap-4 transition-all uppercase tracking-widest">
                    Acessar Documentação
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApiIntegrationTab;
