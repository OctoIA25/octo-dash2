import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, FileSpreadsheet, Check } from "lucide-react";
import { ProcessedLead } from "@/data/realLeadsProcessor";

interface ExportButtonProps {
  leads: ProcessedLead[];
}

// 📋 Consulte context.md para: estrutura de dados do Supabase, campos obrigatórios
export const ExportButton = ({ leads }: ExportButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Função para gerar CSV a partir dos leads
  const generateCSV = (data: ProcessedLead[]): string => {
    // Headers da tabela exatamente como no Supabase
    const headers = [
      'ID',
      'NOME',
      'TELEFONE',
      'ORIGEM',
      'DATA DE ENTRADA',
      'STATUS (TEMPERATURA)',
      'ETAPA ATUAL',
      'CÓDIGO IMÓVEL',
      'VALOR IMÓVEL',
      'TIPO DE NEGÓCIO',
      'CORRETOR RESPONSÁVEL',
      'DATA FINALIZAÇÃO',
      'VALOR FINAL DA VENDA',
      'OBSERVAÇÕES',
      'Preferências do lead',
      'Imovel visitado',
      'Conversa',
      'Data da visita',
      'Exists'
    ];

    // Converter dados para CSV
    const csvData = data.map(lead => [
      lead.id_lead || '',
      lead.nome_lead || '',
      lead.telefone || '',
      lead.origem_lead || '',
      lead.data_entrada || '',
      lead.status_temperatura || '',
      lead.etapa_atual || '',
      lead.codigo_imovel || '',
      lead.valor_imovel || '',
      lead.tipo_negocio || '',
      lead.corretor_responsavel || '',
      lead.data_finalizacao || '',
      lead.valor_final_venda || '',
      lead.observacoes || '',
      lead.Preferencias_lead || '',
      lead.Imovel_visitado || '',
      lead.Conversa || '',
      lead.Data_visita || '',
      lead.Exists ? 'TRUE' : 'FALSE'
    ]);

    // Construir CSV
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => 
        row.map(field => {
          // Escape de aspas e vírgulas
          const fieldStr = String(field);
          if (fieldStr.includes(',') || fieldStr.includes('"') || fieldStr.includes('\n')) {
            return `"${fieldStr.replace(/"/g, '""')}"`;
          }
          return fieldStr;
        }).join(',')
      )
    ].join('\n');

    return csvContent;
  };

  // Função para realizar o download
  const handleDownload = async () => {
    setIsDownloading(true);
    
    try {
      // Gerar CSV
      const csvContent = generateCSV(leads);
      
      // Criar blob com encoding UTF-8 BOM para Excel
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      
      // Criar URL e trigger download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Nome do arquivo com timestamp
      const now = new Date();
      const timestamp = now.toISOString().split('T')[0].replace(/-/g, '');
      link.download = `leads_crm_${timestamp}.csv`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      
      
      // Fechar dialog após um breve delay
      setTimeout(() => {
        setIsOpen(false);
      }, 1500);
      
    } catch (error) {
      console.error('❌ Erro ao gerar download:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="flex items-center gap-2 hover:bg-accent-blue/10 hover:border-accent-blue/30"
        >
          <Download className="h-4 w-4" />
          Exportar Planilha
        </Button>
      </DialogTrigger>
      
      <DialogContent className="bg-bg-card border-bg-secondary/40 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text-primary flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-accent-green" />
            Exportar Planilha de Leads
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-bg-secondary/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-text-primary font-medium">Total de Leads:</span>
              <span className="text-accent-blue font-bold text-lg">{leads.length}</span>
            </div>
            
            <div className="text-text-secondary text-sm space-y-1">
              <p>• Formato: CSV (compatível com Excel)</p>
              <p>• Encoding: UTF-8 com BOM</p>
              <p>• Todos os campos da planilha original</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleDownload}
              disabled={isDownloading || leads.length === 0}
              className="flex-1 flex items-center gap-2"
            >
              {isDownloading ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Baixar Planilha
                </>
              )}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => setIsOpen(false)}
              disabled={isDownloading}
            >
              Cancelar
            </Button>
          </div>

          {leads.length === 0 && (
            <div className="text-center text-text-secondary text-sm py-2">
              Nenhum lead disponível para exportação
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
