import { useMemo } from 'react';
import { ProcessedLead } from '@/data/realLeadsProcessor';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StandardCardTitle } from '@/components/ui/StandardCardTitle';
import { Building2, Star } from 'lucide-react';

interface CondominiosChartProps {
  leads: ProcessedLead[];
}

export const CondominiosChart = ({ leads }: CondominiosChartProps) => {
  // Lista de condomínios válidos (whitelist)
  const condominiosValidos = [
    'life residencial',
    'quinta das atírias',
    'quinta das atirias'
  ];

  // Função para verificar se é um condomínio válido da whitelist
  const isCondominioValido = (texto: string): string | null => {
    const textoLower = texto.toLowerCase().trim();
    
    for (const condominio of condominiosValidos) {
      if (textoLower.includes(condominio)) {
        // Retornar o nome formatado corretamente
        if (condominio.includes('life')) return 'Life Residencial';
        if (condominio.includes('quinta')) return 'Quinta Das Atírias';
      }
    }
    return null;
  };

  // Extrair apenas nomes de condomínios (sem códigos de imóveis)
  const condominiosData = useMemo(() => {
    if (!leads || leads.length === 0) return null;

    const condominiosMap = new Map<string, number>();
    
    leads.forEach(lead => {
      // Procurar por condomínios nas preferências e conversas
      const textos = [
        lead.Preferencias_lead || '',
        lead.observacoes || '',
        lead.Conversa || ''
      ];

      textos.forEach(texto => {
        // Verificar se o texto contém algum condomínio válido
        const condominioEncontrado = isCondominioValido(texto);
        if (condominioEncontrado) {
          condominiosMap.set(condominioEncontrado, (condominiosMap.get(condominioEncontrado) || 0) + 1);
        }
      });
    });

    const condominiosArray = Array.from(condominiosMap.entries())
      .map(([condominio, count]) => ({ label: condominio, y: count }))
      .sort((a, b) => b.y - a.y)
      .slice(0, 8);

    if (condominiosArray.length === 0) return null;

    const totalInteresses = condominiosArray.reduce((sum, c) => sum + c.y, 0);
    const topCondominio = condominiosArray[0];

    return {
      dataPoints: condominiosArray,
      totalInteresses,
      topCondominio,
      totalCondominios: condominiosArray.length
    };
  }, [leads]);

  if (!condominiosData) {
    return (
      <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl h-full">
        <CardHeader>
          <StandardCardTitle icon={Building2}>
            Condomínios Mais Procurados
          </StandardCardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center text-text-secondary">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Analisando códigos de imóveis...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-bg-card/40 border-bg-secondary/40 shadow-xl shadow-black/20 h-full overflow-hidden transition-all duration-300 ease-in-out">
      <CardHeader className="pb-2">
        <StandardCardTitle icon={Building2}>
          Condomínios Mais Procurados
        </StandardCardTitle>
      </CardHeader>
      
      <CardContent className="p-4 h-[calc(100%-4.5rem)] overflow-hidden">
        {/* Métricas Superiores - Layout Responsivo */}
        <div className="mb-4 pb-4 border-b border-bg-secondary/30 space-y-3">
          {/* Linha 1: Números principais */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                {condominiosData.totalInteresses}
              </span>
              <span className="text-xs text-gray-400 font-medium">interesses</span>
            </div>
            <div className="h-8 w-px bg-gradient-to-b from-transparent via-gray-600 to-transparent" />
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-cyan-400">{condominiosData.totalCondominios}</span>
              <span className="text-xs text-gray-400 font-medium">únicos</span>
            </div>
          </div>
          
          {/* Linha 2: Top #1 com estrela - ACIMA DO GRÁFICO */}
          <div className="text-center w-full">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Star className="h-5 w-5 text-yellow-400" />
              <span className="text-xs text-gray-400 uppercase tracking-wide">Top #1</span>
            </div>
            <div className="text-base font-bold text-blue-400 leading-snug truncate px-2">
              {condominiosData.topCondominio.label}
            </div>
            <div className="text-xl font-bold text-green-400 mt-1">
              {condominiosData.topCondominio.y} interesses
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-400">
          <Building2 className="h-3 w-3 text-blue-400" />
          <span>Baseado em códigos de imóveis e preferências</span>
        </div>
      </CardContent>
    </Card>
  );
};