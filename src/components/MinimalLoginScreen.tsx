/**
 * MinimalLoginScreen - Tela de login com design split-screen
 * Baseado no design Sellwise: robô à esquerda, formulário à direita
 * Bordas retas, sem arredondamentos
 */

import { useEffect, useState } from 'react';
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Eye, EyeOff, Lock, Shield, Globe } from 'lucide-react';

 const OWNER_EMAIL = 'octo.inteligenciaimobiliaria@gmail.com';
 const SELECTED_TENANT_KEY = 'owner-selected-tenant';

export const MinimalLoginScreen = () => {
  const { login, registerWithTenantCode } = useAuth();
  const [tenantCode, setTenantCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    const selected = localStorage.getItem(SELECTED_TENANT_KEY);
    if (selected && !tenantCode) {
      setTenantCode(selected);
      localStorage.removeItem(SELECTED_TENANT_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const isOwnerAttempt = mode === 'login' && email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase();

    if (!email.trim()) {
      setError('E-mail é obrigatório');
      setIsLoading(false);
      return;
    }

    if (!password) {
      setError('Senha é obrigatória');
      setIsLoading(false);
      return;
    }

    if (mode === 'register') {
      if (!confirmPassword) {
        setError('Confirme a senha');
        setIsLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('As senhas não coincidem');
        setIsLoading(false);
        return;
      }
    }

    try {
      const success =
        mode === 'login'
          ? await login(isOwnerAttempt ? 'OWNER' : tenantCode.trim(), email.trim(), password)
          : (await registerWithTenantCode(tenantCode.trim(), email.trim(), password)).ok;

      if (!success) {
        setError(
          mode === 'login'
            ? 'Credenciais inválidas. Verifique código, e-mail e senha.'
            : 'Não foi possível criar conta. Verifique os dados.'
        );
        setIsLoading(false);
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError('Erro ao processar. Tente novamente.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Lado Esquerdo - Ilustração */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#f5f5f5] relative overflow-hidden flex-col justify-between p-8">
        {/* Espaço superior */}
        <div />

        {/* Formas geométricas decorativas */}
        <div className="absolute top-20 left-12 w-8 h-8 border-2 border-gray-300 rotate-12 opacity-60" />
        <div className="absolute top-32 right-24 w-12 h-12 border-2 border-gray-300 rotate-45 opacity-40" />
        <div className="absolute top-16 right-16 w-6 h-6 bg-gray-300 rotate-45 opacity-30" />
        <div className="absolute bottom-40 left-8 w-10 h-10 border-2 border-gray-300 rotate-45 opacity-50" />
        <div className="absolute bottom-32 right-32 w-16 h-16 border-2 border-gray-300 opacity-30" />
        <div className="absolute top-1/3 left-1/4 w-4 h-4 bg-[#1a5276] opacity-80" />
        <div className="absolute bottom-1/3 left-16 w-3 h-3 bg-[#1a5276] opacity-60" />

        {/* Logo OctoCRM Central */}
        <div className="flex-1 flex items-center justify-center">
          <div className="relative">
            <img 
              src="https://i.postimg.cc/j5pWm6JN/Logotipo-Octo-azul-para-fundo-branco.png"
              alt="OctoCRM" 
              className="w-80 h-auto object-contain drop-shadow-lg"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
        </div>

        {/* Footer com badges de segurança */}
        <div className="flex items-center gap-6 text-gray-500 text-xs">
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Criptografia
          </span>
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3" />
            SSL Seguro
          </span>
          <span className="flex items-center gap-1">
            <Globe className="w-3 h-3" />
            Privacidade
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-2">Seus dados estão seguros conosco</p>
      </div>

      {/* Lado Direito - Formulário (com sombra para efeito de profundidade) */}
      <div className="w-full lg:w-1/2 bg-white flex flex-col justify-between p-8 lg:p-16 shadow-[-8px_0_30px_-5px_rgba(0,0,0,0.1)] relative z-10">
        {/* Logo mobile */}
        <div className="lg:hidden mb-8">
          <h1 className="text-xl font-bold text-gray-800">OctoCRM</h1>
          <p className="text-sm text-gray-500">Gestão Imobiliária</p>
        </div>

        {/* Formulário */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
            </h2>
            <p className="text-gray-500 text-sm mb-8">
              {mode === 'login'
                ? 'Bem-vindo de volta. Entre na sua conta.'
                : 'Preencha os dados para criar sua conta.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* E-mail */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  disabled={isLoading}
                  className="w-full h-11 px-3 border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>

              {/* Senha */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    Senha
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      className="text-xs text-gray-500 hover:text-blue-600"
                    >
                      Esqueceu?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isLoading}
                    className="w-full h-11 px-3 pr-10 border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirmar Senha (apenas no registro) */}
              {mode === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirmar Senha
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={isLoading}
                    className="w-full h-11 px-3 border border-gray-200 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              )}

              {/* Erro */}
              {error && (
                <div className="text-red-600 text-sm bg-red-50 border border-red-200 p-3">
                  {error}
                </div>
              )}

              {/* Botão Submit */}
              <button
                type="submit"
                disabled={isLoading || !email || !password || (mode === 'register' && !tenantCode)}
                style={{ 
                  backgroundColor: (isLoading || !email || !password || (mode === 'register' && !tenantCode)) ? '#64748b' : '#1a5276', 
                  color: '#ffffff',
                  opacity: 1
                }}
                className="w-full h-12 text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processando...</span>
                  </>
                ) : (
                  <span>{mode === 'login' ? 'Entrar' : 'Criar conta'}</span>
                )}
              </button>

              {/* Separador */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-gray-400">ou</span>
                </div>
              </div>

              {/* Toggle Login/Registro */}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setError('');
                  setConfirmPassword('');
                }}
                disabled={isLoading}
                style={{ backgroundColor: '#ffffff', color: '#1a5276', border: '2px solid #1a5276' }}
                className="w-full h-12 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {mode === 'login' ? 'Criar nova conta' : 'Já tenho uma conta'}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-6 text-xs text-gray-400 pt-8">
          <a href="#" className="hover:text-gray-600">Termos</a>
          <a href="#" className="hover:text-gray-600">Privacidade</a>
          <a href="#" className="hover:text-gray-600">Ajuda</a>
        </div>
      </div>
    </div>
  );
};
