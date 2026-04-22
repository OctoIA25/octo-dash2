/**
 * 🔄 AUTO-COMMIT GITHUB ATIVO
 * Componente: Chat do Agente Comportamental
 * Função: Agente de Inteligência Comportamental e Gestão de Pessoas
 * 
 * 🎯 ENVIO DE DADOS COMPORTAMENTAIS:
 * 
 * CORRETOR LOGADO:
 * ✅ Busca automática de TODOS os dados do Supabase (DISC + Eneagrama + MBTI)
 * ✅ Tipo MBTI enviado individualmente em UPPERCASE
 * ✅ Análises completas geradas automaticamente
 * 
 * ADMINISTRADOR:
 * ✅ Usa dados dos corretores selecionados nos seletores
 * ✅ Tipo MBTI enviado individualmente em UPPERCASE
 * ✅ Análises completas geradas automaticamente
 * 
 * WEBHOOK:
 * - Corretor: AGENTE_COMPORTAMENTAL_CORRETOR_WEBHOOK_URL
 * - Admin: AGENTE_COMPORTAMENTAL_ADMIN_WEBHOOK_URL
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth } from "@/hooks/useAuth";
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/hooks/useTheme';
import { User, Send, Loader2, X, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getElaineWebhookUrl, sendMessageToElaine, DadosComportamentais } from '../services/agentWebhookService';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

interface AdminResultadosAnexadosPayload {
  texto: string;
  resultados: unknown;
  selecionados: string[];
}

const ADMIN_RESULTADO_LABELS: Record<string, string> = {
  disc: '🎯 DISC',
  eneagrama: '⭐ Eneagrama',
  mbti: '🧠 MBTI'
};

interface ElaineChatProps {
  onPromptSelect?: (prompt: string) => void;
  selectedCorretor?: {
    nome: string;
    tipoDISC: 'D' | 'I' | 'S' | 'C';
    percentuais: { D: number; I: number; S: number; C: number };
  } | null;
  onClearCorretor?: () => void;
  selectedCorretorEneagrama?: {
    nome: string;
    tipoEneagrama: number;
    scores: { [key: number]: number };
  } | null;
  onClearCorretorEneagrama?: () => void;
  selectedCorretorMBTI?: {
    nome: string;
    tipoMBTI: string;
    percentuais: { [key: string]: number };
  } | null;
  onClearCorretorMBTI?: () => void;
  selectedEspecialidade?: string | null;
  especialidadePrompt?: string;
  selectedCorretorGestaoLiderados?: string | null;
}

export const ElaineChat = ({ 
  onPromptSelect, 
  selectedCorretor, 
  onClearCorretor,
  selectedCorretorEneagrama,
  onClearCorretorEneagrama,
  selectedCorretorMBTI,
  onClearCorretorMBTI,
  selectedEspecialidade,
  especialidadePrompt,
  selectedCorretorGestaoLiderados
}: ElaineChatProps = {}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { currentTheme } = useTheme();
  const isDarkMode = currentTheme === 'preto' || currentTheme === 'cinza';
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Olá! 👋 Sou a Elaine, sua Inteligência em Comportamento e Gestão de Pessoas. Estou aqui para ajudar você a decodificar perfis humanos e criar estratégias personalizadas de liderança e desenvolvimento. Como posso te ajudar hoje?',
      sender: 'agent',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [adminResultadosAnexados, setAdminResultadosAnexados] = useState<AdminResultadosAnexadosPayload | null>(null);
  
  // Estado dos testes disponíveis do corretor (para indicador visual)
  const [testesDisponiveis, setTestesDisponiveis] = useState<{
    disc: boolean;
    eneagrama: boolean;
    mbti: boolean;
    corretorNome: string | null;
  }>({ disc: false, eneagrama: false, mbti: false, corretorNome: null });

  // Pre-fetch dos testes disponíveis para o corretor logado
  useEffect(() => {
    const fetchTestesDisponiveis = async () => {
      if (user?.role !== 'corretor' || !user?.email) return;
      try {
        const { getSupabaseConfig, getAuthenticatedHeaders } = await import('@/utils/encryption');
        const config = getSupabaseConfig();
        const headers = getAuthenticatedHeaders();
        
        let res = await fetch(
          `${config.url}/rest/v1/Corretores?email=ilike.${encodeURIComponent(user.email)}&select=nm_corretor,disc_tipo_principal,eneagrama_tipo_principal,mbti_tipo&limit=1`,
          { method: 'GET', headers }
        );
        let data = res.ok ? await res.json() : [];
        
        if ((!data || data.length === 0) && user.email.includes('@')) {
          const nomeFromEmail = user.email.split('@')[0]?.replace(/[._-]/g, ' ');
          if (nomeFromEmail && nomeFromEmail.length > 2) {
            res = await fetch(
              `${config.url}/rest/v1/Corretores?nm_corretor=ilike.*${encodeURIComponent(nomeFromEmail)}*&select=nm_corretor,disc_tipo_principal,eneagrama_tipo_principal,mbti_tipo&limit=1`,
              { method: 'GET', headers }
            );
            data = res.ok ? await res.json() : [];
          }
        }
        
        if (data && data.length > 0) {
          const c = data[0];
          setTestesDisponiveis({
            disc: !!c.disc_tipo_principal,
            eneagrama: !!c.eneagrama_tipo_principal,
            mbti: !!c.mbti_tipo,
            corretorNome: c.nm_corretor || null
          });
        }
      } catch (err) {
        console.warn('⚠️ Erro ao buscar testes disponíveis:', err);
      }
    };
    fetchTestesDisponiveis();
  }, [user?.email, user?.role]);

  // Obter webhook URL do Agente Comportamental de forma segura
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  
  useEffect(() => {
    try {
      const url = getElaineWebhookUrl(user?.role);
      setWebhookUrl(url);
    } catch (error) {
      console.error('Erro ao obter webhook URL do Agente Comportamental:', error);
      setWebhookUrl(null);
    }
  }, [user?.role]);

  useEffect(() => {
    const handleAdminResultadosAnexados = (event: Event) => {
      const customEvent = event as CustomEvent<AdminResultadosAnexadosPayload>;
      if (!customEvent.detail?.texto) return;

      setAdminResultadosAnexados(customEvent.detail);

      toast({
        title: 'Resultados anexados! 📎',
        description: 'Os resultados ficarão anexados em contexto e serão enviados somente no webhook da Elaine.'
      });
    };

    window.addEventListener('adminResultadosAnexados', handleAdminResultadosAnexados);

    const payloadSalvo = localStorage.getItem('adminResultadosAnexados');
    if (payloadSalvo) {
      try {
        const parsed = JSON.parse(payloadSalvo) as AdminResultadosAnexadosPayload;
        if (parsed?.texto) {
          setAdminResultadosAnexados(parsed);
        }
      } catch (error) {
        console.warn('⚠️ Erro ao recuperar adminResultadosAnexados do localStorage:', error);
      }
    }

    return () => {
      window.removeEventListener('adminResultadosAnexados', handleAdminResultadosAnexados);
    };
  }, []);
  
  // Expor função para enviar mensagem automaticamente
  useEffect(() => {
    (window as any).sendElaineMessage = (fullPrompt: string, displayText: string) => {
      
      // Adicionar mensagem do usuário (texto resumido)
      const userMessage: Message = {
        id: Date.now().toString(),
        text: displayText,
        sender: 'user',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);
      
      // Enviar prompt completo para o webhook
      handleSendToWebhook(fullPrompt);
    };
    
    return () => {
      delete (window as any).sendElaineMessage;
    };
  }, []);

  // Auto-scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize do textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [inputMessage]);

  const handleSendToWebhook = async (message: string) => {
    if (!webhookUrl) {
      toast({
        title: "Configuração Pendente",
        description: "O webhook do Agente Comportamental ainda não foi configurado. Entre em contato com o administrador.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    try {
      const resultadoUsuario = user?.role === 'gestao' ? adminResultadosAnexados?.texto : undefined;
      
      // Preparar dados comportamentais do corretor selecionado
      const dadosComportamentais: DadosComportamentais = {};
      let corretorNomeResolvido: string | undefined;
      
      // 🔥 SE FOR CORRETOR, BUSCAR SEUS PRÓPRIOS DADOS DO BANCO
      if (user?.role === 'corretor') {
        try {
          const { getSupabaseConfig, getAuthenticatedHeaders } = await import('@/utils/encryption');
          const config = getSupabaseConfig();
          const headers = getAuthenticatedHeaders();
          
          // Buscar corretor pelo email (estratégia principal) ou nome parcial (fallback)
          let corretorResponse = await fetch(
            `${config.url}/rest/v1/Corretores?email=ilike.${encodeURIComponent(user.email)}&select=id,nm_corretor,disc_tipo_principal,disc_percentual_d,disc_percentual_i,disc_percentual_s,disc_percentual_c,eneagrama_tipo_principal,eneagrama_score_tipo_1,eneagrama_score_tipo_2,eneagrama_score_tipo_3,eneagrama_score_tipo_4,eneagrama_score_tipo_5,eneagrama_score_tipo_6,eneagrama_score_tipo_7,eneagrama_score_tipo_8,eneagrama_score_tipo_9,mbti_tipo,mbti_percent_energy,mbti_percent_mind,mbti_percent_nature,mbti_percent_tactics,mbti_percent_identity&limit=1`,
            {
              method: 'GET',
              headers: headers
            }
          );
          
          let corretorData = corretorResponse.ok ? await corretorResponse.json() : [];
          
          // Fallback: buscar por nome parcial do email
          if (!corretorData || corretorData.length === 0) {
            const nomeFromEmail = user.email.split('@')[0]?.replace(/[._-]/g, ' ');
            if (nomeFromEmail && nomeFromEmail.length > 2) {
              corretorResponse = await fetch(
                `${config.url}/rest/v1/Corretores?nm_corretor=ilike.*${encodeURIComponent(nomeFromEmail)}*&select=id,nm_corretor,disc_tipo_principal,disc_percentual_d,disc_percentual_i,disc_percentual_s,disc_percentual_c,eneagrama_tipo_principal,eneagrama_score_tipo_1,eneagrama_score_tipo_2,eneagrama_score_tipo_3,eneagrama_score_tipo_4,eneagrama_score_tipo_5,eneagrama_score_tipo_6,eneagrama_score_tipo_7,eneagrama_score_tipo_8,eneagrama_score_tipo_9,mbti_tipo,mbti_percent_energy,mbti_percent_mind,mbti_percent_nature,mbti_percent_tactics,mbti_percent_identity&limit=1`,
                {
                  method: 'GET',
                  headers: headers
                }
              );
              corretorData = corretorResponse.ok ? await corretorResponse.json() : [];
            }
          }
          
          if (corretorData && corretorData.length > 0) {
            const corretor = corretorData[0];
            corretorNomeResolvido = corretor.nm_corretor || user.name;
            if (corretor.mbti_tipo) {
            }
            
            // Adicionar DISC se existir
            if (corretor.disc_tipo_principal) {
              dadosComportamentais.disc = {
                tipoPrincipal: corretor.disc_tipo_principal,
                percentuais: {
                  D: corretor.disc_percentual_d || 0,
                  I: corretor.disc_percentual_i || 0,
                  S: corretor.disc_percentual_s || 0,
                  C: corretor.disc_percentual_c || 0
                },
                perfisDominantes: Object.entries({
                  D: corretor.disc_percentual_d || 0,
                  I: corretor.disc_percentual_i || 0,
                  S: corretor.disc_percentual_s || 0,
                  C: corretor.disc_percentual_c || 0
                })
                  .filter(([_, valor]) => valor >= 0.25)
                  .sort((a, b) => (b[1] as number) - (a[1] as number))
                  .map(([perfil, _]) => perfil)
              };
            }
            
            // Adicionar Eneagrama se existir
            if (corretor.eneagrama_tipo_principal) {
              dadosComportamentais.eneagrama = {
                tipoPrincipal: corretor.eneagrama_tipo_principal,
                scores: {
                  1: corretor.eneagrama_score_tipo_1 || 0,
                  2: corretor.eneagrama_score_tipo_2 || 0,
                  3: corretor.eneagrama_score_tipo_3 || 0,
                  4: corretor.eneagrama_score_tipo_4 || 0,
                  5: corretor.eneagrama_score_tipo_5 || 0,
                  6: corretor.eneagrama_score_tipo_6 || 0,
                  7: corretor.eneagrama_score_tipo_7 || 0,
                  8: corretor.eneagrama_score_tipo_8 || 0,
                  9: corretor.eneagrama_score_tipo_9 || 0
                }
              };
            }
            
            // Adicionar MBTI se existir
            if (corretor.mbti_tipo) {
              dadosComportamentais.mbti = {
                tipo: corretor.mbti_tipo,
                percentuais: {
                  energy: corretor.mbti_percent_energy || 0,
                  mind: corretor.mbti_percent_mind || 0,
                  nature: corretor.mbti_percent_nature || 0,
                  tactics: corretor.mbti_percent_tactics || 0,
                  identity: corretor.mbti_percent_identity || 0
                }
              };
            }
          }
        } catch (error) {
          console.warn('⚠️ Erro ao buscar dados do corretor:', error);
        }
      }
      // SE FOR ADMIN, usar corretores selecionados (como antes)
      else {
        // 👥 GESTÃO DE LIDERADOS: Buscar dados completos do corretor selecionado
        if (selectedCorretorGestaoLiderados && user?.role === 'gestao') {
          try {
            const { getSupabaseConfig, getAuthenticatedHeaders } = await import('@/utils/encryption');
            const config = getSupabaseConfig();
            const headers = getAuthenticatedHeaders();
            
            // Buscar ID do corretor pelo nome
            const corretorResponse = await fetch(
              `${config.url}/rest/v1/Corretores?nm_corretor=eq.${encodeURIComponent(selectedCorretorGestaoLiderados)}&select=id,disc_tipo_principal,disc_percentual_d,disc_percentual_i,disc_percentual_s,disc_percentual_c,eneagrama_tipo_principal,eneagrama_score_tipo_1,eneagrama_score_tipo_2,eneagrama_score_tipo_3,eneagrama_score_tipo_4,eneagrama_score_tipo_5,eneagrama_score_tipo_6,eneagrama_score_tipo_7,eneagrama_score_tipo_8,eneagrama_score_tipo_9,mbti_tipo,mbti_percent_energy,mbti_percent_mind,mbti_percent_nature,mbti_percent_tactics,mbti_percent_identity`,
              {
                method: 'GET',
                headers: headers
              }
            );
            
            if (corretorResponse.ok) {
              const corretorData = await corretorResponse.json();
              if (corretorData && corretorData.length > 0) {
                const corretor = corretorData[0];
                
                // Adicionar DISC se existir
                if (corretor.disc_tipo_principal) {
                  dadosComportamentais.disc = {
                    tipoPrincipal: corretor.disc_tipo_principal,
                    percentuais: {
                      D: corretor.disc_percentual_d || 0,
                      I: corretor.disc_percentual_i || 0,
                      S: corretor.disc_percentual_s || 0,
                      C: corretor.disc_percentual_c || 0
                    },
                    perfisDominantes: Object.entries({
                      D: corretor.disc_percentual_d || 0,
                      I: corretor.disc_percentual_i || 0,
                      S: corretor.disc_percentual_s || 0,
                      C: corretor.disc_percentual_c || 0
                    })
                      .filter(([_, valor]) => valor >= 0.25)
                      .sort((a, b) => b[1] - a[1])
                      .map(([perfil, _]) => perfil)
                  };
                }
                
                // Adicionar Eneagrama se existir
                if (corretor.eneagrama_tipo_principal) {
                  dadosComportamentais.eneagrama = {
                    tipoPrincipal: corretor.eneagrama_tipo_principal,
                    scores: {
                      1: corretor.eneagrama_score_tipo_1 || 0,
                      2: corretor.eneagrama_score_tipo_2 || 0,
                      3: corretor.eneagrama_score_tipo_3 || 0,
                      4: corretor.eneagrama_score_tipo_4 || 0,
                      5: corretor.eneagrama_score_tipo_5 || 0,
                      6: corretor.eneagrama_score_tipo_6 || 0,
                      7: corretor.eneagrama_score_tipo_7 || 0,
                      8: corretor.eneagrama_score_tipo_8 || 0,
                      9: corretor.eneagrama_score_tipo_9 || 0
                    }
                  };
                }
                
                // Adicionar MBTI se existir
                if (corretor.mbti_tipo) {
                  dadosComportamentais.mbti = {
                    tipo: corretor.mbti_tipo,
                    percentuais: {
                      energy: corretor.mbti_percent_energy || 0,
                      mind: corretor.mbti_percent_mind || 0,
                      nature: corretor.mbti_percent_nature || 0,
                      tactics: corretor.mbti_percent_tactics || 0,
                      identity: corretor.mbti_percent_identity || 0
                    }
                  };
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ Erro ao buscar dados do corretor (Gestão de Liderados):', error);
          }
        }
        
        // Adicionar dados DISC se corretor selecionado (seletor DISC)
        if (selectedCorretor) {
          dadosComportamentais.disc = {
            tipoPrincipal: selectedCorretor.tipoDISC,
            percentuais: selectedCorretor.percentuais,
            perfisDominantes: Object.entries(selectedCorretor.percentuais)
              .filter(([_, valor]) => valor >= 0.25)
              .sort((a, b) => b[1] - a[1])
              .map(([perfil, _]) => perfil)
          };
        }
        
        // Adicionar dados Eneagrama se corretor selecionado (seletor Eneagrama)
        if (selectedCorretorEneagrama) {
          dadosComportamentais.eneagrama = {
            tipoPrincipal: selectedCorretorEneagrama.tipoEneagrama,
            scores: selectedCorretorEneagrama.scores
          };
        }
        
        // Adicionar dados MBTI se corretor selecionado (seletor MBTI)
        if (selectedCorretorMBTI) {
          dadosComportamentais.mbti = {
            tipo: selectedCorretorMBTI.tipoMBTI,
            percentuais: selectedCorretorMBTI.percentuais
          };
        }
      }

      // 👤 Obter nome do corretor
      let corretorNome: string | undefined;
      
      // Se for corretor, usar nome resolvido do banco ou nome do user
      if (user?.role === 'corretor') {
        corretorNome = corretorNomeResolvido || user?.name;
      }
      // Se for admin, usar corretor selecionado
      else if (user?.role === 'gestao') {
        corretorNome = selectedCorretorGestaoLiderados || selectedCorretor?.nome || selectedCorretorEneagrama?.nome || selectedCorretorMBTI?.nome;
      }
      
      // 🧠 Obter tipo MBTI - SEMPRE buscar quando houver corretor
      let tipoMBTI: string | undefined;
      
      // Se for corretor, já buscamos MBTI acima junto com os dados comportamentais
      if (user?.role === 'corretor' && dadosComportamentais.mbti) {
        tipoMBTI = dadosComportamentais.mbti.tipo;
      }
      // Se for admin com corretor selecionado no seletor MBTI, usar do seletor
      else if (user?.role === 'gestao' && selectedCorretorMBTI) {
        tipoMBTI = selectedCorretorMBTI.tipoMBTI;
      }
      // Se for admin com corretor selecionado na Gestão de Liderados, usar dos dados já buscados
      else if (user?.role === 'gestao' && selectedCorretorGestaoLiderados && dadosComportamentais.mbti) {
        tipoMBTI = dadosComportamentais.mbti.tipo;
      }
      // Se for admin com corretor_nome mas sem seletor MBTI, buscar do banco
      else if (user?.role === 'gestao' && corretorNome) {
        try {
          const { buscarMBTICorretor } = await import('@/features/corretores/services/mbtiResultsService');
          const mbtiData = await buscarMBTICorretor(corretorNome);
          tipoMBTI = mbtiData?.tipo_mbti;
        } catch (error) {
          console.warn('⚠️ Não foi possível buscar MBTI do corretor:', error);
        }
      }
      
      if (corretorNome) {
      }
      if (tipoMBTI) {
      } else {
      }

      // Log resumo dos dados que serão enviados

      // Verificar se a mensagem está presente

      // Enviar mensagem com dados comportamentais usando função específica do Agente Comportamental
      const result = await sendMessageToElaine(
        message || '', // Garantir que sempre seja uma string
        user?.name || 'Administrador',
        Object.keys(dadosComportamentais).length > 0 ? dadosComportamentais : undefined,
        corretorNome, // SEMPRE enviar o nome do corretor selecionado
        user?.role, // Enviar role do usuário para escolher webhook correto
        tipoMBTI, // Enviar tipo MBTI quando disponível
        resultadoUsuario
      );

      if (!result.success) {
        throw new Error(result.error || 'Falha ao enviar mensagem');
      }

      // Resposta do Agente Comportamental
      const agentResponse: Message = {
        id: Date.now().toString() + '-agent',
        text: result.response || '✨ Recebi sua solicitação! Estou analisando o perfil comportamental com base em DISC, Eneagrama e MBTI. Em breve você receberá uma análise completa e personalizada.',
        sender: 'agent',
        timestamp: new Date()
      };
      
      setTimeout(() => {
        setMessages(prev => [...prev, agentResponse]);
        setIsSending(false);
      }, 1000);

      toast({
        title: "Mensagem Enviada! 🎯",
        description: Object.keys(dadosComportamentais).length > 0 
          ? "O Agente Comportamental está analisando o perfil com os dados comportamentais enviados."
          : "O Agente Comportamental está processando sua solicitação.",
      });

      if (resultadoUsuario) {
        setAdminResultadosAnexados(null);
        localStorage.removeItem('adminResultadosAnexados');
      }

    } catch (error) {
      console.error('❌ Erro ao enviar para webhook do Agente Comportamental:', error);
      setIsSending(false);
      
      toast({
        title: "Erro ao Enviar",
        description: error instanceof Error ? error.message : "Não foi possível conectar com o Agente Comportamental. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isSending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputMessage,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');

    // Montar mensagem para envio
    // Se tem especialidade selecionada, adiciona o prompt dela antes da mensagem do usuário
    let messageToSend = inputMessage;
    if (especialidadePrompt) {
      messageToSend = `${especialidadePrompt}\n\nContexto adicional do usuário:\n${inputMessage}`;
    }

    // Enviar para webhook
    await handleSendToWebhook(messageToSend);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Verificação de segurança
  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400 dark:text-gray-500">Carregando...</p>
      </div>
    );
  }

  const adminResultadosSelecionadosLabels = adminResultadosAnexados?.selecionados.map(
    (resultado) => ADMIN_RESULTADO_LABELS[resultado] || resultado
  ) || [];

  return (
    <div className={`flex flex-col h-full ${isDarkMode ? 'bg-gradient-to-b from-neutral-900/20 to-neutral-900/40 border-neutral-800/40' : 'bg-gradient-to-b from-blue-50/80 via-blue-100/60 to-blue-50/80 border-blue-200/60'} overflow-hidden rounded-xl border shadow-2xl`}>
      
      {/* ⭐ STATUS: Corretor Selecionado para Análise */}
      {(selectedCorretor || selectedCorretorEneagrama || selectedCorretorMBTI || selectedCorretorGestaoLiderados || adminResultadosAnexados) && (
        <div className={`flex-shrink-0 px-4 py-3 border-b ${isDarkMode ? 'border-neutral-700/50 bg-neutral-800/30' : 'border-pink-200 bg-pink-50/50'}`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Ícone + Texto "Analisando" */}
            <div className="flex items-center gap-2.5 flex-1 min-w-[200px]">
              <div className="flex items-center gap-2.5 px-3 py-1.5 bg-gray-200/60 dark:bg-gray-800/30 rounded-lg border border-gray-300/40 dark:border-gray-700/30">
                <div className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                  adminResultadosAnexados ? 'bg-pink-500' :
                  selectedCorretorGestaoLiderados ? 'bg-blue-300' :
                  selectedCorretor ? 'bg-blue-500' : 
                  selectedCorretorEneagrama ? 'bg-purple-500' : 
                  'bg-emerald-500'
                }`}></div>
                <span className={`text-sm font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  {adminResultadosAnexados ? 'Resultados próprios anexados:' : 'Analisando:'}
                </span>
                <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                  {adminResultadosAnexados
                    ? `${adminResultadosSelecionadosLabels.length} teste(s)`
                    : selectedCorretorGestaoLiderados || selectedCorretor?.nome || selectedCorretorEneagrama?.nome || selectedCorretorMBTI?.nome}
                </span>
              </div>
            </div>
            
            {/* Badges de Teste + Botão Limpar */}
            <div className="flex items-center gap-2 flex-wrap">
              {adminResultadosAnexados && adminResultadosSelecionadosLabels.map((label) => (
                <div
                  key={label}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 ${
                    isDarkMode ? 'bg-pink-600' : 'bg-pink-600'
                  } shadow-sm border-2 ${isDarkMode ? 'border-pink-400/30' : 'border-pink-700'}`}
                >
                  <span>{label}</span>
                </div>
              ))}

              {selectedCorretorGestaoLiderados && (
                <div className={`px-3 py-1.5 rounded-lg text-xs font-bold text-black flex items-center gap-1.5 ${
                  isDarkMode ? 'bg-blue-100' : 'bg-blue-100'
                } shadow-sm border-2 ${isDarkMode ? 'border-blue-200/50' : 'border-blue-200'}`}>
                  <span>👥</span>
                  <span>Gestão de Liderados</span>
                </div>
              )}
              
              {selectedCorretor && (
                <div className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 ${
                  isDarkMode ? 'bg-blue-600' : 'bg-blue-600'
                } shadow-sm border-2 ${isDarkMode ? 'border-blue-400/30' : 'border-blue-700'}`}>
                  <span>🎯</span>
                  <span>DISC</span>
                </div>
              )}
              
              {selectedCorretorEneagrama && (
                <div className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 ${
                  isDarkMode ? 'bg-purple-600' : 'bg-purple-600'
                } shadow-sm border-2 ${isDarkMode ? 'border-purple-400/30' : 'border-purple-700'}`}>
                  <span>⭐</span>
                  <span>Eneagrama: Tipo {selectedCorretorEneagrama.tipoEneagrama}</span>
                </div>
              )}
              
              {selectedCorretorMBTI && (
                <div className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 ${
                  isDarkMode ? 'bg-emerald-600' : 'bg-emerald-600'
                } shadow-sm border-2 ${isDarkMode ? 'border-emerald-400/30' : 'border-emerald-700'}`}>
                  <span>🧠</span>
                  <span>MBTI: {selectedCorretorMBTI.tipoMBTI}</span>
                </div>
              )}
              
              {/* Botão X para limpar seleção */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-red-500/20 transition-colors"
                onClick={() => {
                  if (adminResultadosAnexados) {
                    setAdminResultadosAnexados(null);
                    localStorage.removeItem('adminResultadosAnexados');
                  }
                  if (selectedCorretor && onClearCorretor) onClearCorretor();
                  if (selectedCorretorEneagrama && onClearCorretorEneagrama) onClearCorretorEneagrama();
                  if (selectedCorretorMBTI && onClearCorretorMBTI) onClearCorretorMBTI();
                  // Para Gestão de Liderados, não temos onClear, então não fazemos nada aqui
                  // O usuário pode limpar pelo seletor na sidebar
                }}
                title="Limpar seleção"
              >
                <X className="w-4 h-4 text-red-500" />
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Área de Mensagens - Scroll fixo e automático */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4" style={{ minHeight: 0, maxHeight: 'calc(100vh - 200px)' }}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar */}
            <div className={`flex-shrink-0 ${
              message.sender === 'user'
                ? isDarkMode
                  ? 'w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-600 to-purple-600 flex items-center justify-center shadow-lg shadow-pink-500/30'
                  : 'w-11 h-11 rounded-2xl bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center shadow-lg shadow-gray-400/30'
                : 'w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center shadow-lg shadow-pink-500/30'
            }`}>
              {message.sender === 'user' ? (
                <User className={`h-6 w-6 ${isDarkMode ? 'text-white' : 'text-gray-700'}`} />
              ) : (
                <span className="text-2xl">👩‍💼</span>
              )}
            </div>

            {/* Mensagem */}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-lg ${
                message.sender === 'user'
                  ? isDarkMode
                    ? 'bg-gradient-to-br from-pink-600 to-purple-600 text-white'
                    : 'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-900 border border-gray-400/30 shadow-gray-400/30'
                  : isDarkMode
                    ? 'bg-gradient-to-br from-neutral-800/80 to-neutral-900/80 text-gray-100 border border-pink-500/20 shadow-pink-500/10'
                    : 'bg-white text-gray-900 border border-blue-200/60 shadow-md shadow-blue-100/40'
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.text}</p>
              <p className={`text-[10px] mt-2 ${
                message.sender === 'user' 
                  ? isDarkMode ? 'text-pink-100' : 'text-gray-600'
                  : isDarkMode ? 'text-gray-400' : 'text-gray-600'
              }`}>
                {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        
        {/* Indicador de digitação */}
        {isSending && (
          <div className="flex gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center shadow-lg shadow-pink-500/30">
              <span className="text-2xl">👩‍💼</span>
            </div>
            <div className={`bg-gradient-to-br ${isDarkMode ? 'from-neutral-800/80 to-neutral-900/80 border-pink-500/20' : 'bg-white border-blue-200/40 shadow-blue-200/30'} border rounded-2xl px-4 py-3 shadow-lg flex items-center gap-2`}>
              <Loader2 className={`h-4 w-4 ${isDarkMode ? 'text-pink-400' : 'text-pink-600'} animate-spin`} />
              <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Comportamental está analisando...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* 📎 Indicador de Resultados Anexados */}
      {user?.role === 'corretor' && (testesDisponiveis.disc || testesDisponiveis.eneagrama || testesDisponiveis.mbti) && (
        <div className={`flex-shrink-0 px-4 py-2 border-t ${isDarkMode ? 'border-neutral-800/60 bg-neutral-900/40' : 'border-blue-100 bg-blue-50/40'}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <Paperclip className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            <span className={`text-[11px] font-medium ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Anexado:</span>
            {testesDisponiveis.disc && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDarkMode ? 'bg-blue-900/40 text-blue-300 border border-blue-700/30' : 'bg-blue-100 text-blue-700 border border-blue-200'}`}>
                🎯 DISC
              </span>
            )}
            {testesDisponiveis.eneagrama && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDarkMode ? 'bg-purple-900/40 text-purple-300 border border-purple-700/30' : 'bg-purple-100 text-purple-700 border border-purple-200'}`}>
                ⭐ Eneagrama
              </span>
            )}
            {testesDisponiveis.mbti && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDarkMode ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/30' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                🧠 MBTI
              </span>
            )}
            {testesDisponiveis.corretorNome && (
              <span className={`ml-auto text-[10px] ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                {testesDisponiveis.corretorNome}
              </span>
            )}
          </div>
        </div>
      )}
      {user?.role === 'corretor' && !testesDisponiveis.disc && !testesDisponiveis.eneagrama && !testesDisponiveis.mbti && (
        <div className={`flex-shrink-0 px-4 py-2 border-t ${isDarkMode ? 'border-neutral-800/60 bg-neutral-900/40' : 'border-orange-100 bg-orange-50/40'}`}>
          <div className="flex items-center gap-2">
            <Paperclip className={`w-3.5 h-3.5 ${isDarkMode ? 'text-orange-500/60' : 'text-orange-400'}`} />
            <span className={`text-[11px] ${isDarkMode ? 'text-orange-400/70' : 'text-orange-500'}`}>
              Nenhum teste comportamental encontrado. Complete seus testes para análises personalizadas.
            </span>
          </div>
        </div>
      )}
      {user?.role === 'gestao' && adminResultadosAnexados && (
        <div className={`flex-shrink-0 px-4 py-2 border-t ${isDarkMode ? 'border-neutral-800/60 bg-neutral-900/40' : 'border-pink-100 bg-pink-50/40'}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <Paperclip className={`w-3.5 h-3.5 ${isDarkMode ? 'text-pink-400' : 'text-pink-500'}`} />
            <span className={`text-[11px] font-medium ${isDarkMode ? 'text-pink-300' : 'text-pink-700'}`}>Resultado_Usuario anexado:</span>
            {adminResultadosSelecionadosLabels.map((label) => (
              <span
                key={label}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDarkMode ? 'bg-pink-900/40 text-pink-300 border border-pink-700/30' : 'bg-pink-100 text-pink-700 border border-pink-200'}`}
              >
                {label}
              </span>
            ))}
            <button
              onClick={() => {
                setAdminResultadosAnexados(null);
                localStorage.removeItem('adminResultadosAnexados');
              }}
              className={`ml-auto text-[10px] font-semibold ${isDarkMode ? 'text-pink-300 hover:text-pink-200' : 'text-pink-700 hover:text-pink-900'}`}
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Input de Mensagem - SEMPRE VISÍVEL */}
      <div className={`border-t ${isDarkMode ? 'border-neutral-800 bg-neutral-900' : 'border-blue-200/50 bg-blue-50/80'} p-3 flex-shrink-0 shadow-2xl sticky bottom-0 rounded-b-xl`}>
        <div className="flex gap-2 items-end">
          <div className={`flex-1 ${isDarkMode ? 'bg-neutral-800 border-2 border-neutral-700' : 'bg-white/90 border-2 border-blue-200/60'} rounded-xl p-3 focus-within:border-pink-500 focus-within:ring-2 focus-within:ring-pink-500/30 transition-all duration-200`}>
            <Textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite sua mensagem..."
              className={`bg-transparent border-none resize-none ${isDarkMode ? 'text-white placeholder:text-gray-400' : 'text-gray-800 placeholder:text-gray-500'} focus:outline-none focus:ring-0 min-h-[20px] max-h-[120px] text-sm w-full`}
              rows={1}
              disabled={isSending}
            />
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isSending}
            className="h-11 w-11 rounded-xl bg-gradient-to-br from-pink-600 via-purple-600 to-pink-600 hover:from-pink-700 hover:via-purple-700 hover:to-pink-700 shadow-xl shadow-pink-500/30 hover:shadow-2xl hover:shadow-pink-500/40 transition-all duration-200 flex items-center justify-center p-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? (
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            ) : (
              <Send className="h-5 w-5 text-white" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};


