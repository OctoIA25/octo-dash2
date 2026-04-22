/**
 * 🔧 HELPERS DO CONSOLE PARA DESENVOLVIMENTO
 * Importa automaticamente funções úteis para o console do navegador
 */

// Importar funções de diagnóstico
import { diagnosticarTesteCompleto, listarTodosCorretoresComTestes } from '@/features/corretores/services/diagnosticoTestesSalvar';
import { resetarTesteEneagrama, resetarTesteMBTI, resetarTesteDISC, resetarTodosTestes } from '@/features/corretores/services/resetarTestesService';

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
  
}

export {};

