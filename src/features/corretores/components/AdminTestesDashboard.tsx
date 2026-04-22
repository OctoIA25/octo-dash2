/**
 * Dashboard Administrativo - Visualização de Testes de Personalidade
 * Para gestores/admins verem resultados de todos os corretores
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Brain, 
  Search, 
  CheckCircle, 
  XCircle, 
  TrendingUp,
  Users,
  BarChart3
} from 'lucide-react';
import { buscarEstatisticasTestes } from '../services/personalityTestsService';
import { DISC_PROFILES } from '@/data/discQuestions';
import { getSupabaseConfig, getAuthenticatedHeaders } from '@/utils/encryption';
import { useAuth } from '@/hooks/useAuth';

interface CorretorTeste {
  id: number;
  nm_corretor: string;
  disc_tipo_principal: string | null;
  disc_percentual_d: number | null;
  disc_percentual_i: number | null;
  disc_percentual_s: number | null;
  disc_percentual_c: number | null;
  disc_data_teste: string | null;
  eneagrama_tipo_principal: number | null;
  eneagrama_data_teste: string | null;
  mbti_tipo: string | null;
  mbti_data_teste: string | null;
}

export const AdminTestesDashboard = () => {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [estatisticas, setEstatisticas] = useState<any>(null);
  const [corretorSelecionado, setCorretorSelecionado] = useState<CorretorTeste | null>(null);
  const [busca, setBusca] = useState('');
  const [corretores, setCorretores] = useState<CorretorTeste[]>([]);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const stats = await buscarEstatisticasTestes(tenantId || undefined);
      setEstatisticas(stats);
      
      // Buscar lista de todos os corretores
      await carregarCorretores();
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarCorretores = async () => {
    try {
      const config = getSupabaseConfig();
      const headers = getAuthenticatedHeaders();

      const tenantFilter = tenantId ? `&tenant_id=eq.${tenantId}` : '';
      const response = await fetch(
        `${config.url}/rest/v1/Corretores?select=id,nm_corretor,disc_tipo_principal,disc_percentual_d,disc_percentual_i,disc_percentual_s,disc_percentual_c,disc_data_teste,eneagrama_tipo_principal,eneagrama_data_teste,mbti_tipo,mbti_data_teste&order=nm_corretor${tenantFilter}`,
        {
          method: 'GET',
          headers: headers
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setCorretores(data);
      }
    } catch (error) {
      console.error('Erro ao carregar corretores:', error);
    }
  };

  const visualizarPerfil = (corretor: CorretorTeste) => {
    setCorretorSelecionado(corretor);
  };

  const corretoresFiltrados = corretores.filter(c => 
    c.nm_corretor.toLowerCase().includes(busca.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-slate-400 dark:text-gray-400">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100 dark:text-white flex items-center gap-3">
            <Brain className="w-8 h-8 text-blue-600 dark:text-blue-300" />
            Dashboard de Testes de Personalidade
          </h1>
          <p className="text-gray-600 dark:text-slate-400 dark:text-gray-400 mt-1">
            Visualização administrativa dos resultados dos testes
          </p>
        </div>
        <Button onClick={carregarDados}>
          <TrendingUp className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-slate-400 dark:text-gray-400">
              Total de Corretores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-300">
              {estatisticas?.totalCorretores || 0}
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              <Users className="w-3 h-3 inline mr-1" />
              Ativos no sistema
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-slate-400 dark:text-gray-400">
              Teste DISC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-300">
              {estatisticas?.comDISC || 0}
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              <CheckCircle className="w-3 h-3 inline mr-1" />
              {Math.round((estatisticas?.comDISC / estatisticas?.totalCorretores) * 100 || 0)}% completos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-slate-400 dark:text-gray-400">
              Teste Eneagrama
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600 dark:text-purple-300">
              {estatisticas?.comEneagrama || 0}
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              <CheckCircle className="w-3 h-3 inline mr-1" />
              {Math.round((estatisticas?.comEneagrama / estatisticas?.totalCorretores) * 100 || 0)}% completos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 dark:text-slate-400 dark:text-gray-400">
              Teste MBTI
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-300">
              {estatisticas?.comMBTI || 0}
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              <CheckCircle className="w-3 h-3 inline mr-1" />
              {Math.round((estatisticas?.comMBTI / estatisticas?.totalCorretores) * 100 || 0)}% completos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição DISC */}
      {estatisticas?.distribuicaoDISC && Object.keys(estatisticas.distribuicaoDISC).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Distribuição de Perfis DISC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(estatisticas.distribuicaoDISC).map(([perfil, qtd]: [string, any]) => {
                const profile = DISC_PROFILES[perfil];
                const percentual = (qtd / estatisticas.comDISC) * 100;
                
                return (
                  <div key={perfil} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                          style={{ backgroundColor: profile.cor }}
                        >
                          {perfil}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-slate-100 dark:text-white">
                            {profile.nome}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-slate-400">
                            {qtd} corretor{qtd !== 1 ? 'es' : ''}
                          </p>
                        </div>
                      </div>
                      <span className="text-2xl font-bold" style={{ color: profile.cor }}>
                        {percentual.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ 
                          width: `${percentual}%`,
                          backgroundColor: profile.cor
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Corretores */}
      <Card>
        <CardHeader>
          <CardTitle>Corretores e Testes</CardTitle>
          <div className="mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-500" />
              <Input
                type="text"
                placeholder="Buscar corretor..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {corretoresFiltrados.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-slate-400 py-8">
                Nenhum corretor encontrado
              </p>
            ) : (
              corretoresFiltrados.map((corretor) => (
                <div 
                  key={corretor.id}
                  className="flex items-center justify-between p-4 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/60 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-slate-100 dark:text-white">
                      {corretor.nm_corretor}
                    </p>
                    <div className="flex items-center gap-4 mt-2">
                      {/* DISC */}
                      <div className="flex items-center gap-1">
                        {corretor.disc_tipo_principal ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                              DISC: {corretor.disc_tipo_principal}
                            </span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-red-500" />
                            <span className="text-sm text-gray-500 dark:text-slate-400">DISC</span>
                          </>
                        )}
                      </div>
                      
                      {/* Eneagrama */}
                      <div className="flex items-center gap-1">
                        {corretor.eneagrama_tipo_principal ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                              Eneagrama: {corretor.eneagrama_tipo_principal}
                            </span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-red-500" />
                            <span className="text-sm text-gray-500 dark:text-slate-400">Eneagrama</span>
                          </>
                        )}
                      </div>
                      
                      {/* MBTI */}
                      <div className="flex items-center gap-1">
                        {corretor.mbti_tipo ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400">
                              MBTI: {corretor.mbti_tipo}
                            </span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-red-500" />
                            <span className="text-sm text-gray-500 dark:text-slate-400">MBTI</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => visualizarPerfil(corretor)}
                  >
                    Ver Perfil
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Modal de Perfil Detalhado */}
      {corretorSelecionado && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl">
                  Perfil de {corretorSelecionado.nm_corretor}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCorretorSelecionado(null)}
                >
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* DISC */}
              <div>
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white font-bold">
                    D
                  </div>
                  Perfil DISC
                </h3>
                {corretorSelecionado.disc_tipo_principal ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/40 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-lg font-semibold">
                        Tipo Principal: {DISC_PROFILES[corretorSelecionado.disc_tipo_principal].nome}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 mt-1">
                        Testado em: {new Date(corretorSelecionado.disc_data_teste!).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      {Object.entries({
                        D: corretorSelecionado.disc_percentual_d,
                        I: corretorSelecionado.disc_percentual_i,
                        S: corretorSelecionado.disc_percentual_s,
                        C: corretorSelecionado.disc_percentual_c
                      }).map(([letra, percentual]: [string, any]) => {
                        const profile = DISC_PROFILES[letra];
                        const percent = (percentual * 100).toFixed(1);
                        
                        return (
                          <div key={letra}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold">{profile.nome}</span>
                              <span className="font-bold">{percent}%</span>
                            </div>
                            <div className="w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full rounded-full transition-all"
                                style={{ 
                                  width: `${percent}%`,
                                  backgroundColor: profile.cor
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-slate-400">Teste não realizado</p>
                )}
              </div>

              {/* Eneagrama */}
              <div>
                <h3 className="text-xl font-bold mb-4">🟣 Eneagrama</h3>
                {corretorSelecionado.eneagrama_tipo_principal ? (
                  <div className="p-4 bg-purple-50 dark:bg-purple-950/40 dark:bg-purple-900/20 rounded-lg">
                    <p className="text-lg font-semibold">
                      Tipo {corretorSelecionado.eneagrama_tipo_principal}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 mt-1">
                      Testado em: {new Date(corretorSelecionado.eneagrama_data_teste!).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-slate-400">Teste não realizado</p>
                )}
              </div>

              {/* MBTI */}
              <div>
                <h3 className="text-xl font-bold mb-4">🔵 MBTI (16 Personalities)</h3>
                {corretorSelecionado.mbti_tipo ? (
                  <div className="p-4 bg-orange-50 dark:bg-orange-950/40 dark:bg-orange-900/20 rounded-lg">
                    <p className="text-lg font-semibold">
                      {corretorSelecionado.mbti_tipo}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-slate-400 dark:text-gray-400 mt-1">
                      Testado em: {new Date(corretorSelecionado.mbti_data_teste!).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-slate-400">Teste não realizado</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};














