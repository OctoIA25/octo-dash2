import { useState } from 'react';
import { useAuth, UserRole, CorretorName } from "@/hooks/useAuth";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Users, Eye, EyeOff, Loader2 } from 'lucide-react';

export const LoginScreen = () => {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<'gestao' | 'corretor'>('gestao');
  const [loginData, setLoginData] = useState({
    gestao: { password: '' },
    corretor: { password: '', selectedCorretor: '' as CorretorName | '' }
  });
  const [errors, setErrors] = useState({
    gestao: '',
    corretor: ''
  });

  const corretores: CorretorName[] = [
    'Ana Costa',
    'João Santos', 
    'Pedro Lima',
    'Maria Silva',
    'Carlos Oliveira'
  ];

  const handleLogin = async (role: UserRole) => {
    setIsLoading(true);
    setErrors({ gestao: '', corretor: '' });

    const password = loginData[role].password;
    const corretor = role === 'corretor' ? loginData.corretor.selectedCorretor as CorretorName : undefined;

    // Validações
    if (!password) {
      setErrors(prev => ({ ...prev, [role]: 'Senha é obrigatória' }));
      setIsLoading(false);
      return;
    }

    if (role === 'corretor' && !corretor) {
      setErrors(prev => ({ ...prev, corretor: 'Selecione um corretor' }));
      setIsLoading(false);
      return;
    }

    try {
      const success = await login(role, password, corretor);
      
      if (!success) {
        setErrors(prev => ({ 
          ...prev, 
          [role]: role === 'gestao' ? 'Senha incorreta (dica: 123)' : 'Senha incorreta (dica: 1234)' 
        }));
      }
    } catch (error) {
      setErrors(prev => ({ ...prev, [role]: 'Erro ao fazer login' }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Fundo borrado com gradients harmoniosos */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-blue-900/10 to-cyan-900/20"></div>
      <div className="absolute inset-0 backdrop-blur-sm"></div>
      
      {/* Efeitos decorativos */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-cyan-500/5 rounded-full blur-2xl animate-pulse delay-500"></div>

      {/* Container principal */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo/Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="p-3 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 shadow-lg">
                <Building2 className="h-8 w-8 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 text-glow-blue">
              Octo-Dash CRM
            </h1>
            <p className="text-gray-400">
              Sistema de Gestão Imobiliária
            </p>
          </div>

          {/* Card de Login */}
          <Card className="bg-bg-card/90 backdrop-blur-md border-bg-secondary/40 shadow-2xl">
            <CardHeader className="text-center">
              <CardTitle className="text-text-primary">Acesso ao Sistema</CardTitle>
              <CardDescription className="text-text-secondary">
                Escolha seu tipo de acesso
              </CardDescription>
            </CardHeader>

            <CardContent>
              {/* Tabs Padronizadas */}
              <div className="w-full mb-6">
                <div className="grid grid-cols-2 gap-1 p-1 bg-bg-secondary rounded-lg">
                  <button
                    onClick={() => setActiveTab('gestao')}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      activeTab === 'gestao'
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Building2 className="h-4 w-4" />
                    Gestão
                  </button>
                  <button
                    onClick={() => setActiveTab('corretor')}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                      activeTab === 'corretor'
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    Corretor
                  </button>
                </div>
              </div>

              {/* Conteúdo da Tab Gestão */}
              {activeTab === 'gestao' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">
                      Senha de Gestão
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Digite a senha..."
                        value={loginData.gestao.password}
                        onChange={(e) => setLoginData(prev => ({
                          ...prev,
                          gestao: { password: e.target.value }
                        }))}
                        className="pr-10"
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.gestao && (
                      <p className="text-sm text-red-400">{errors.gestao}</p>
                    )}
                  </div>

                  <Button
                    onClick={() => handleLogin('gestao')}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium py-2.5"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      'Acessar Gestão'
                    )}
                  </Button>
                </div>
              )}

              {/* Conteúdo da Tab Corretor */}
              {activeTab === 'corretor' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">
                      Selecionar Corretor
                    </label>
                    <select
                      value={loginData.corretor.selectedCorretor}
                      onChange={(e) => setLoginData(prev => ({
                        ...prev,
                        corretor: { ...prev.corretor, selectedCorretor: e.target.value as CorretorName }
                      }))}
                      disabled={isLoading}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Escolha seu nome...</option>
                      {corretores.map((corretor) => (
                        <option key={corretor} value={corretor}>
                          {corretor}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-primary">
                      Senha do Corretor
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="Digite a senha..."
                        value={loginData.corretor.password}
                        onChange={(e) => setLoginData(prev => ({
                          ...prev,
                          corretor: { ...prev.corretor, password: e.target.value }
                        }))}
                        className="pr-10"
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-secondary hover:text-text-primary"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.corretor && (
                      <p className="text-sm text-red-400">{errors.corretor}</p>
                    )}
                  </div>

                  <Button
                    onClick={() => handleLogin('corretor')}
                    disabled={isLoading || !loginData.corretor.selectedCorretor}
                    className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-medium py-2.5"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Entrando...
                      </>
                    ) : (
                      'Acessar Área do Corretor'
                    )}
                  </Button>
                </div>
              )}

              {/* Dicas de senha */}
              <div className="mt-6 p-3 bg-bg-secondary/50 rounded-lg border border-bg-secondary/40">
                <p className="text-xs text-text-secondary text-center">
                  <span className="font-medium">Dicas:</span> Gestão: 123 | Corretor: 1234
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};