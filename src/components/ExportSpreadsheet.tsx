import { useState } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Button } from '@/components/ui/button';
import { InteractiveButton } from '@/components/ui/interactive-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Download, FileSpreadsheet, CheckCircle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ExportSpreadsheetProps {
  leads: ProcessedLead[];
}

export const ExportSpreadsheet = ({ leads }: ExportSpreadsheetProps) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const exportToExcel = async () => {
    setIsExporting(true);
    setExportComplete(false);

    try {
      // Preparar dados para exportação mantendo a estrutura original
      const exportData = leads.map((lead, index) => ({
        'Linha': index + 2, // +2 porque começamos da linha 2 (linha 1 é header)
        'ID Lead': lead.id_lead || '',
        'Nome do Lead': lead.nome_lead || '',
        'Telefone': lead.telefone || '',
        'Origem': lead.origem_lead || '',
        'Data de Entrada': lead.data_entrada || '',
        'Status (Temperatura)': lead.status_temperatura || '',
        'Etapa Atual': lead.etapa_atual || '',
        'Código Imóvel': lead.codigo_imovel || '',
        'Valor Imóvel': lead.valor_imovel || 0,
        'Finalidade (Tipo de Negócio)': lead.tipo_negocio || '',
        'Link Imóvel': lead.link_imovel || '',
        'Corretor Responsável': lead.corretor_responsavel || '',
        'Data Finalização': lead.data_finalizacao || '',
        'Valor Final da Venda': lead.valor_final_venda || '',
        'Data da Visita': lead.Data_visita || '',
        'Imóvel Visitado': lead.Imovel_visitado || '',
        'Arquivamento': lead.Arquivamento || '',
        'Motivo do Arquivamento': lead.motivo_arquivamento || '',
        'Observações': lead.observacoes || '',
        'Preferências do Lead': lead.Preferencias_lead || '',
        'Conversa': lead.Conversa || '',
        'Exists': lead.Exists ? 'TRUE' : 'FALSE'
      }));

      // Criar workbook
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leads CRM');

      // Configurar larguras das colunas
      const colWidths = [
        { wch: 8 },   // Linha
        { wch: 10 },  // ID Lead
        { wch: 25 },  // Nome do Lead
        { wch: 15 },  // Telefone
        { wch: 15 },  // Origem
        { wch: 15 },  // Data de Entrada
        { wch: 15 },  // Status
        { wch: 18 },  // Etapa Atual
        { wch: 15 },  // Código Imóvel
        { wch: 15 },  // Valor Imóvel
        { wch: 20 },  // Finalidade (Tipo de Negócio)
        { wch: 40 },  // Link Imóvel
        { wch: 20 },  // Corretor
        { wch: 15 },  // Data Finalização
        { wch: 18 },  // Valor Final
        { wch: 15 },  // Data Visita
        { wch: 15 },  // Imóvel Visitado
        { wch: 12 },  // Arquivamento
        { wch: 25 },  // Motivo Arquivamento
        { wch: 30 },  // Observações
        { wch: 25 },  // Preferências
        { wch: 50 },  // Conversa
        { wch: 8 }    // Exists
      ];
      ws['!cols'] = colWidths;

      // Simular tempo de processamento
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Gerar nome do arquivo com timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `CRM_Leads_${timestamp}.xlsx`;

      // Usar método alternativo para download que abre em nova aba
      // Converter para blob e criar URL
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      
      // Abrir em nova aba para download
      const newWindow = window.open(url, '_blank');
      
      // Fallback: se popup foi bloqueado, usar download direto
      if (!newWindow) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      
      // Limpar após download
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 5000);

      setExportComplete(true);
      
      // Fechar dialog após 2 segundos
      setTimeout(() => {
        setIsDialogOpen(false);
        setExportComplete(false);
      }, 2000);

    } catch (error) {
      console.error('Erro ao exportar planilha:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <InteractiveButton 
          variant="premium"
          size="sm"
          icon={<Download className="h-4 w-4" />}
        >
          Exportar Planilha
        </InteractiveButton>
      </DialogTrigger>
      <DialogContent className="bg-bg-card border-bg-secondary/40 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text-primary neon-text">
            Exportar Dados para Excel
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Informações da exportação */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-bg-secondary/20 rounded-lg">
              <FileSpreadsheet className="h-4 w-4 text-green-400" />
              <div>
                <p className="text-text-primary font-medium">Dados a exportar:</p>
                <p className="text-text-secondary text-sm">{leads.length} leads completos</p>
              </div>
            </div>

            <div className="text-xs text-text-secondary space-y-1">
              <p>• Todos os dados serão exportados com as novas colunas</p>
              <p>• Formato: Excel (.xlsx) - abrirá em nova aba</p>
              <p>• Colunas: 23 campos completos incluindo código e link do imóvel</p>
              <p>• Conversas e detalhes de visitas incluídos</p>
              <p>• Finalidade renomeada de "Tipo de Negócio"</p>
            </div>
          </div>

          {/* Status da exportação */}
          {isExporting && (
            <div className="flex items-center justify-center gap-3 p-4 bg-purple-500/10 rounded-lg">
              <Loader2 className="h-4 w-4 text-purple-400 animate-spin" />
              <div>
                <p className="text-purple-400 font-medium">Gerando planilha...</p>
                <p className="text-text-secondary text-sm">Processando {leads.length} registros</p>
              </div>
            </div>
          )}

          {exportComplete && (
            <div className="flex items-center justify-center gap-3 p-4 bg-green-500/10 rounded-lg">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <div>
                <p className="text-green-400 font-medium">Download concluído!</p>
                <p className="text-text-secondary text-sm">Arquivo salvo com sucesso</p>
              </div>
            </div>
          )}

          {/* Botão de exportação */}
          <InteractiveButton 
            onClick={exportToExcel}
            loading={isExporting}
            loadingText="Gerando..."
            variant="success"
            size="lg"
            className="w-full"
            icon={<Download className="h-4 w-4" />}
          >
            Baixar Planilha Excel
          </InteractiveButton>
        </div>
      </DialogContent>
    </Dialog>
  );
};
