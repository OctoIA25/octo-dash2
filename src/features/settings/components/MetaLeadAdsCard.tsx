/**
 * Card de configuração do Meta Lead Ads na tela de Integrações.
 *
 * A ordem da tela espelha a ordem do onboarding real: primeiro a imobiliária
 * copia a URL do webhook e o verify token para colar no app dela na Meta,
 * depois cola de volta o Page ID, o app secret e o System User token. Inverter
 * a ordem faz a pessoa travar no primeiro campo sem saber de onde tirar o valor.
 */
import { useEffect, useState } from 'react';
import { Copy, Check, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { getMetaConfig, saveMetaConfig, type MetaLeadgenConfig } from '../services/metaLeadgenService';

export function MetaLeadAdsCard({ tenantId }: { tenantId: string }) {
  const [config, setConfig] = useState<MetaLeadgenConfig | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const [pageId, setPageId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      const r = await getMetaConfig(tenantId);
      if (!ativo) return;
      if (r.ok) { setConfig(r.config); setPageId(r.config?.pageId ?? ''); }
      else setErro(r.error);
      setCarregando(false);
    })();
    return () => { ativo = false; };
  }, [tenantId]);

  const copiar = async (texto: string, chave: string) => {
    await navigator.clipboard.writeText(texto);
    setCopiado(chave);
    setTimeout(() => setCopiado(null), 2000);
  };

  const salvar = async (status?: 'active' | 'inactive') => {
    setSalvando(true);
    setErro(null);
    const r = await saveMetaConfig(tenantId, { pageId, appSecret, accessToken, status });
    if (r.ok) {
      setConfig(r.config);
      // Segredos não permanecem no estado do componente depois de salvos.
      setAppSecret('');
      setAccessToken('');
    } else {
      setErro(r.error);
    }
    setSalvando(false);
  };

  const ativo = config?.status === 'active';

  // Ativar sem Page ID ou sem os dois segredos deixa o webhook resolvendo o
  // tenant mas falhando a verificação de assinatura em toda entrega (401
  // silencioso). "hasAppSecret"/"hasAccessToken" cobre o que já está salvo;
  // o campo preenchido nesta sessão cobre quem está configurando agora.
  const faltantes: string[] = [];
  if (!pageId) faltantes.push('Page ID');
  if (!(config?.hasAppSecret || appSecret)) faltantes.push('app secret');
  if (!(config?.hasAccessToken || accessToken)) faltantes.push('System User token');
  const podeAtivar = faltantes.length === 0;

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border-2 p-3 w-full relative transition-all ${
      ativo ? 'border-green-200 bg-gradient-to-br from-white to-green-50/30' : 'border-gray-200 dark:border-slate-800'
    }`}>
      <div className={`absolute right-3 top-3 px-2 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 border ${
        ativo
          ? 'bg-green-100 text-green-700 border-green-200'
          : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-800'
      }`}>
        {ativo ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
        {ativo ? 'Ativo' : 'Desativado'}
      </div>

      <div className="flex flex-col items-center text-center pt-1">
        <div className="w-12 h-12 rounded-lg overflow-hidden ring-2 ring-black/5 bg-gray-50 dark:bg-slate-950 flex items-center justify-center">
          <img
            src="https://i.ibb.co/1fyQKkQM/OIP.webp"
            alt="Facebook e Instagram Lead Ads"
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
        <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm mt-2">Facebook e Instagram Lead Ads</h3>
        <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">Recebe os formulários direto da Meta, sem CRM no meio</p>
      </div>

      {carregando ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-500 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {config ? (
            <div className="mt-4 space-y-2.5 rounded-lg bg-gray-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 p-2.5">
              <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-300">1. Cole estes valores no seu app da Meta</p>
              {([
                ['URL de callback', config.webhookUrl, 'url'],
                ['Verify token', config.verifyToken, 'verify'],
              ] as const).map(([rotulo, valor, chave]) => (
                <div key={chave}>
                  <span className="block text-[10px] text-gray-500 dark:text-slate-400 mb-1">{rotulo}</span>
                  <div className="flex items-center gap-1.5">
                    <code className="flex-1 truncate rounded border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-[11px] text-gray-700 dark:text-slate-300">{valor}</code>
                    <button
                      type="button"
                      onClick={() => copiar(valor, chave)}
                      className="rounded p-1.5 hover:bg-gray-200 dark:hover:bg-slate-800 shrink-0"
                      aria-label={`Copiar ${rotulo}`}
                    >
                      {copiado === chave ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />}
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-gray-500 dark:text-slate-400">Assine o campo <code>leadgen</code> no webhook da Página.</p>
            </div>
          ) : (
            // O backend provisiona a linha na primeira leitura, então isto não
            // deve acontecer para um manager autenticado — mas se algo mudar
            // do lado do servidor, é melhor um aviso curto do que a seção 1
            // sumir em silêncio (era exatamente esse silêncio que travava o
            // onboarding antes desta correção).
            <p className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-400">
              Não foi possível carregar a URL do webhook. Recarregue a página.
            </p>
          )}

          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); salvar(); }}>
            <p className="text-[11px] font-semibold text-gray-700 dark:text-slate-300">2. Traga os dados do app de volta</p>
            <div>
              <label htmlFor="meta-page-id" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">ID da Página</label>
              <input
                id="meta-page-id"
                type="text"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                placeholder="1234567890"
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div>
              <label htmlFor="meta-app-secret" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                App secret {config?.hasAppSecret && <span className="text-green-600">— já configurado</span>}
              </label>
              <input
                id="meta-app-secret"
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder={config?.hasAppSecret ? 'Deixe em branco para manter' : '••••••••'}
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div>
              <label htmlFor="meta-access-token" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                System User token {config?.hasAccessToken && <span className="text-green-600">— já configurado</span>}
              </label>
              <input
                id="meta-access-token"
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={config?.hasAccessToken ? 'Deixe em branco para manter' : '••••••••'}
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
              <p className="mt-1 text-[10px] text-gray-500 dark:text-slate-400">
                Crie um System User no Business Manager, dê acesso à Página e gere um token — esse não expira.
              </p>
            </div>

            {erro && (
              <p className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 px-2.5 py-2 text-[11px] text-red-700 dark:text-red-400">
                {erro}
              </p>
            )}

            <div className="pt-1 flex gap-2">
              <button
                type="submit"
                disabled={salvando}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                type="button"
                disabled={salvando || (!ativo && !podeAtivar)}
                onClick={() => salvar(ativo ? 'inactive' : 'active')}
                className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  ativo
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'border border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                {ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
            {/* Ativar sem Page ID/segredos deixa o webhook resolvendo o tenant
                mas rejeitando toda entrega da Meta com 401 (assinatura sem
                appSecret nunca bate) — falha silenciosa. Explica o botão
                desabilitado em vez de deixá-lo morto sem contexto. */}
            {!ativo && !podeAtivar && (
              <p className="text-[10px] text-gray-500 dark:text-slate-400">
                Falta preencher: {faltantes.join(', ')}.
              </p>
            )}
          </form>
        </>
      )}
    </div>
  );
}
