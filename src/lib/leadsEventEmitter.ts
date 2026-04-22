/**
 * 🔄 LEADS EVENT EMITTER
 * Sistema de eventos para sincronização de leads entre componentes
 * Quando um lead é atualizado, todos os componentes que escutam são notificados
 */

type LeadsEventCallback = () => void;

class LeadsEventEmitter {
  private listeners: Set<LeadsEventCallback> = new Set();

  /**
   * Registra um callback para ser chamado quando leads forem atualizados
   * @returns Função para remover o listener
   */
  subscribe(callback: LeadsEventCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notifica todos os listeners que os leads foram atualizados
   * Chamado após qualquer operação de update no banco
   */
  emit(): void {
    this.listeners.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('❌ [LeadsEventEmitter] Erro ao notificar listener:', error);
      }
    });
  }

  /**
   * Retorna o número de listeners ativos
   */
  get listenerCount(): number {
    return this.listeners.size;
  }
}

// Singleton global
export const leadsEventEmitter = new LeadsEventEmitter();
