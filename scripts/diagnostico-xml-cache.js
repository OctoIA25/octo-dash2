/**
 * 🔎 Diagnóstico do cache de XML por tenant (localStorage)
 *
 * O cache de imóveis do XML vive no localStorage do navegador, em chaves com
 * sufixo do tenant (ver src/features/imoveis/services/imoveisXmlService.ts):
 *   - xml_imoveis_url__tenant__<tenantId>        → URL do feed XML do tenant
 *   - xml_imoveis_data__tenant__<tenantId>       → imóveis importados (JSON)
 *   - xml_corretores_data__tenant__<tenantId>    → corretores extraídos (JSON)
 *
 * Este script aponta:
 *   1) URLs de XML COMPARTILHADAS entre tenants (causa nº 1 do vazamento).
 *   2) Códigos de imóvel que aparecem em MAIS DE UM tenant no cache.
 *
 * COMO RODAR:
 *   Abra o app no navegador → DevTools (F12) → aba Console → cole tudo e Enter.
 *   (localStorage é por navegador/máquina; rode no browser onde o problema aparece.)
 */
(() => {
  const PREFIX = {
    url: 'xml_imoveis_url__tenant__',
    data: 'xml_imoveis_data__tenant__',
    corretores: 'xml_corretores_data__tenant__',
  };

  const tenants = {};
  const ensure = (id) =>
    (tenants[id] ||= { tenantId: id, url: null, imoveis: 0, corretores: 0, referencias: [] });

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    if (key.startsWith(PREFIX.url)) {
      ensure(key.slice(PREFIX.url.length)).url = localStorage.getItem(key) || null;
    } else if (key.startsWith(PREFIX.data)) {
      const id = key.slice(PREFIX.data.length);
      const t = ensure(id);
      try {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        t.imoveis = Array.isArray(arr) ? arr.length : 0;
        t.referencias = (Array.isArray(arr) ? arr : [])
          .map((x) => String(x?.referencia || '').toUpperCase().trim())
          .filter(Boolean);
      } catch {
        t.imoveis = 'ERRO_JSON';
      }
    } else if (key.startsWith(PREFIX.corretores)) {
      const id = key.slice(PREFIX.corretores.length);
      try {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        ensure(id).corretores = Array.isArray(arr) ? arr.length : 0;
      } catch {
        ensure(id).corretores = 'ERRO_JSON';
      }
    }
  }

  const rows = Object.values(tenants);

  console.log('%c=== Cache XML por tenant (localStorage) ===', 'font-weight:bold;font-size:13px');
  if (rows.length === 0) {
    console.warn('Nenhuma chave de cache XML encontrada neste navegador.');
    return { tenants: [], urlDuplicadas: [], codigosCruzados: [] };
  }
  console.table(
    rows.map((r) => ({ tenantId: r.tenantId, url: r.url, imoveis: r.imoveis, corretores: r.corretores }))
  );

  // 1) URLs de XML compartilhadas entre tenants
  const byUrl = {};
  rows.forEach((r) => {
    if (r.url) (byUrl[r.url] ||= []).push(r.tenantId);
  });
  const urlDuplicadas = Object.entries(byUrl).filter(([, ids]) => ids.length > 1);

  if (urlDuplicadas.length) {
    console.warn('%c⚠️ URLs de XML COMPARTILHADAS entre tenants (provável causa raiz):', 'font-weight:bold');
    urlDuplicadas.forEach(([url, ids]) => console.warn(`   ${url}\n     → tenants: ${ids.join(', ')}`));
  } else {
    console.log('✅ Nenhuma URL de XML duplicada entre tenants no cache.');
  }

  // 2) Mesmo código de imóvel em mais de um tenant
  const byRef = {};
  rows.forEach((r) =>
    r.referencias.forEach((ref) => {
      (byRef[ref] ||= new Set()).add(r.tenantId);
    })
  );
  const codigosCruzados = Object.entries(byRef).filter(([, ids]) => ids.size > 1);

  if (codigosCruzados.length) {
    console.warn(`%c⚠️ ${codigosCruzados.length} código(s) de imóvel aparecem em MAIS DE UM tenant:`, 'font-weight:bold');
    console.table(
      codigosCruzados.slice(0, 50).map(([codigo, ids]) => ({ codigo, tenants: [...ids].join(', ') }))
    );
    if (codigosCruzados.length > 50) console.warn(`   … e mais ${codigosCruzados.length - 50} (mostrando 50).`);
  } else {
    console.log('✅ Nenhum código de imóvel repetido entre tenants no cache.');
  }

  return {
    tenants: rows,
    urlDuplicadas: urlDuplicadas.map(([url, ids]) => ({ url, tenants: ids })),
    codigosCruzados: codigosCruzados.map(([codigo, ids]) => ({ codigo, tenants: [...ids] })),
  };
})();
