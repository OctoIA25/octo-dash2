/**
 * 🎴 MINI CARD DE LEAD
 * Card compacto que mostra informações resumidas de um lead
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Phone, Building2, Clock, User, Maximize2, CheckCircle, Loader2, MessageCircle } from 'lucide-react';
import { BolsaoLead } from '@/features/leads/services/bolsaoService';

interface LeadMiniCardProps {
  lead: BolsaoLead;
  onClick: () => void;
  onConfirmarAtendimento?: (leadId: number) => void;
  onEnviarMensagem?: (telefone: string) => void;
  isConfirmandoLead?: boolean;
  mostrarBotaoConfirmar?: boolean;
  mostrarBotaoMensagem?: boolean;
}

export const LeadMiniCard = ({ 
  lead, 
  onClick, 
  onConfirmarAtendimento,
  onEnviarMensagem,
  isConfirmandoLead,
  mostrarBotaoConfirmar,
  mostrarBotaoMensagem
}: LeadMiniCardProps) => {
  const [modalFotoAberto, setModalFotoAberto] = useState(false);
  
  // A foto já vem no campo lead.Foto do Supabase
  const fotoUrl = lead.Foto;
  
  // Calcular tempo no bolsão
  const calcularTempo = (data: string) => {
    const agora = new Date();
    const criacao = new Date(data);
    const diffMs = agora.getTime() - criacao.getTime();
    const diffMinutos = Math.floor(diffMs / 60000);
    
    if (diffMinutos < 60) return `${diffMinutos}min`;
    if (diffMinutos < 1440) return `${Math.floor(diffMinutos / 60)}h`;
    return `${Math.floor(diffMinutos / 1440)}d`;
  };

  // Calcular urgência
  const calcularUrgencia = (data: string) => {
    const agora = new Date();
    const criacao = new Date(data);
    const diffMs = agora.getTime() - criacao.getTime();
    const diffMinutos = Math.floor(diffMs / 60000);
    
    if (diffMinutos > 120) return { nivel: 'crítico', cor: 'bg-red-500', emoji: '🔴' };
    if (diffMinutos > 60) return { nivel: 'alta', cor: 'bg-orange-500', emoji: '🟠' };
    return { nivel: 'normal', cor: 'bg-yellow-500', emoji: '🟡' };
  };

  // Status badge
  const getStatusConfig = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'novo':
        return { label: '🆕 Novo', cor: 'bg-blue-500' };
      case 'bolsão':
        return { label: '📦 Bolsão', cor: 'bg-purple-500' };
      case 'assumido':
        return { label: '🔄 Assumido', cor: 'bg-orange-500' };
      case 'atendido':
        return { label: '✅ Atendido', cor: 'bg-green-500' };
      case 'finalizado':
        return { label: '✅ Finalizado', cor: 'bg-emerald-500' };
      default:
        return { label: '❓ Desconhecido', cor: 'bg-gray-500' };
    }
  };

  const tempo = calcularTempo(lead.created_at);
  const urgencia = calcularUrgencia(lead.created_at);
  const statusConfig = getStatusConfig(lead.status);

  return (
    <>
      <Card 
        className="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] overflow-hidden"
        onClick={onClick}
      >
        <CardContent className="p-4">
          {/* Header: Foto Miniatura + Nome + Portal */}
          <div className="flex items-start gap-3 mb-3">
            {/* Foto Miniatura Clicável */}
            <div 
              className="relative flex-shrink-0 group"
              onClick={(e) => {
                e.stopPropagation(); // Não abrir detalhes ao clicar na foto
                if (fotoUrl) setModalFotoAberto(true);
              }}
            >
              {fotoUrl ? (
                <>
                  <img 
                    src={fotoUrl} 
                    alt="Foto do lead"
                    className="w-16 h-16 rounded-full object-cover border-2 border-primary/30 group-hover:border-primary transition-all shadow-md"
                  />
                  {/* Ícone de zoom ao hover */}
                  <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                    <Maximize2 className="h-6 w-6 text-white" />
                  </div>
                </>
              ) : (
                // Mostrar inicial do nome quando não tem foto
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center border-2 border-gray-300 dark:border-gray-600 shadow-md">
                  <span className="text-2xl font-bold text-gray-600 dark:text-gray-300">
                    {(lead.nomedolead || 'L').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Nome e Telefone */}
            <div className="flex-1 min-w-0">
              {/* Nome do Lead */}
              <h3 className="font-bold text-base text-foreground truncate mb-1">
                {lead.nomedolead || 'Lead sem nome'}
              </h3>
              
              {/* Número do Lead */}
              {lead.lead && (
                <div className="flex items-center gap-1 mb-1">
                  <Phone className="h-3 w-3 text-blue-500 flex-shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">
                    {lead.lead}
                  </span>
                </div>
              )}
              
              {/* Badge de tempo */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{tempo}</span>
              </div>
            </div>
          </div>

          {/* Informações principais */}
          <div className="space-y-2 pt-3 border-t">
            {/* Código do Imóvel */}
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4 text-purple-500 flex-shrink-0" />
              <span className="text-muted-foreground truncate">
                {lead.codigo || 'Sem código'}
              </span>
            </div>

            {/* Corretor Responsável ou Original */}
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-orange-500 flex-shrink-0" />
              <span className="text-muted-foreground truncate text-xs">
                {lead.corretor_responsavel || lead.corretor || 'Não atribuído'}
              </span>
            </div>
            
            {/* Botões de Ação */}
            {!lead.atendido && (mostrarBotaoMensagem || mostrarBotaoConfirmar) && (
              <div className="pt-3 border-t space-y-2">
                {/* Botão Enviar Mensagem */}
                {mostrarBotaoMensagem && onEnviarMensagem && lead.lead && (
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEnviarMensagem(lead.lead!);
                    }}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-sm h-9"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Enviar Mensagem
                  </Button>
                )}
                
                {/* Botão Confirmar Atendimento */}
                {mostrarBotaoConfirmar && onConfirmarAtendimento && (
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onConfirmarAtendimento(lead.id);
                    }}
                    disabled={isConfirmandoLead}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold text-sm h-9"
                  >
                    {isConfirmandoLead ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Confirmando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Confirmar Atendimento
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
            
            {/* Indicador de atendido */}
            {lead.atendido && (
              <div className="pt-3 border-t">
                <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 text-xs w-full justify-center py-2">
                  ✅ Atendido
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

       {/* Modal de Zoom da Foto */}
       {fotoUrl && (
         <Dialog open={modalFotoAberto} onOpenChange={setModalFotoAberto}>
           <DialogContent className="max-w-4xl p-0 bg-black/95 backdrop-blur-xl border border-white/10 animate-in fade-in-0 zoom-in-95 duration-200">
             <div className="relative">
               <img 
                 src={fotoUrl} 
                 alt="Foto do lead em tamanho grande"
                 className="w-full h-auto max-h-[85vh] object-contain"
               />
               {/* Info overlay - barra inferior elegante */}
               <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent pt-20 pb-6 px-6">
                 <div className="flex items-end justify-between">
                   <div>
                     <p className="text-white font-bold text-3xl mb-1" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.8), 0 0 30px rgba(0,0,0,0.5)' }}>
                       {lead.nomedolead || 'Lead'}
                     </p>
                     {lead.portal && (
                       <p className="text-white/80 text-sm flex items-center gap-1.5" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                         <span className="text-purple-400">📍</span>
                         {lead.portal}
                       </p>
                     )}
                   </div>
                 </div>
               </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
