/**
 * 🔧 HELPERS DO CONSOLE PARA DESENVOLVIMENTO
 * Importa automaticamente funções úteis para o console do navegador
 */

// Importar funções de diagnóstico
import { diagnosticarTesteCompleto, listarTodosCorretoresComTestes } from '@/features/corretores/services/diagnosticoTestesSalvar';
import { resetarTesteEneagrama, resetarTesteMBTI, resetarTesteDISC, resetarTodosTestes } from '@/features/corretores/services/resetarTestesService';
import { syncTenantImoveisFromXml } from '@/features/imoveis/services/imoveisXmlService';

/**
 * 🔄 Força a sincronização do XML de imóveis (fetch ao vivo + parse + backup + atribuições)
 * para um tenant. Use no console do navegador para testar a reimportação.
 *
 * Uso:
 *   forcarSyncImoveisXml('656d7d4d-0bcf-43c2-a078-258ff6c1eb7e')
 *   forcarSyncImoveisXml()  // tenta usar o tenant impersonado atual
 */
const forcarSyncImoveisXml = async (tenantId?: string) => {
  let id = tenantId;
  if (!id) {
    try {
      id = JSON.parse(localStorage.getItem('owner-impersonation') || '{}')?.tenantId;
    } catch {
      /* ignore */
    }
  }
  if (!id || id === 'owner') {
    console.error('❌ Informe o tenantId: forcarSyncImoveisXml("656d7d4d-...")');
    return;
  }
  // zera o cooldown do broker-sync para garantir reexecução
  localStorage.removeItem(`last_sync_all_brokers_${id}`);
  console.log(`🔄 Forçando sync do XML para o tenant ${id}...`);
  try {
    const result = await syncTenantImoveisFromXml(id);
    console.log(`✅ Sync concluído: ${result.count} imóveis importados.`);
    console.log('↻ Recarregue a página (location.reload()) para ver no catálogo.');
    return result;
  } catch (err) {
    console.error('❌ Falha no sync:', err instanceof Error ? err.message : err);
  }
};

// Exportar para o window (console do navegador)
if (typeof window !== 'undefined') {
  // Diagnóstico
  (window as any).diagnosticarTesteCompleto = diagnosticarTesteCompleto;
  (window as any).listarTodosCorretoresComTestes = listarTodosCorretoresComTestes;

  // Reset
  (window as any).resetarTesteEneagrama = resetarTesteEneagrama;
  (window as any).resetarTesteMBTI = resetarTesteMBTI;
  (window as any).resetarTesteDISC = resetarTesteDISC;
  (window as any).resetarTodosTestes = resetarTodosTestes;

  // Forçar sync de imóveis do XML (teste)
  (window as any).forcarSyncImoveisXml = forcarSyncImoveisXml;

}

export {};

