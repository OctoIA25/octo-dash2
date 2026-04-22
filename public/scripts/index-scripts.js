// Index page scripts - separated from inline HTML
// OctoDash CRM Imobiliário

// Recargas livres permitidas (sem interceptar beforeunload).
function initPageReloadDebug() {}

// ===== REMOÇÃO DINÂMICA DAS MARCAS D'ÁGUA CANVASJS =====

// Função para remover marcas d'água do CanvasJS
function removeCanvasJSWatermarks() {
  // Remover links de crédito
  const creditLinks = document.querySelectorAll('a[href*="canvasjs"], a[title*="CanvasJS"], a[title*="canvasjs"]');
  creditLinks.forEach(link => {
    link.style.display = 'none';
    link.style.visibility = 'hidden';
    link.style.opacity = '0';
    link.style.pointerEvents = 'none';
    link.remove();
  });

  // Remover textos de crédito em SVGs
  const svgTexts = document.querySelectorAll('svg text[font-size="11"], svg text[fill="#999999"], svg text[fill="rgb(153, 153, 153)"]');
  svgTexts.forEach(text => {
    if (text.textContent && (
      text.textContent.toLowerCase().includes('canvasjs') || 
      text.textContent.toLowerCase().includes('canvas') ||
      text.getAttribute('font-size') === '11'
    )) {
      text.style.display = 'none';
      text.style.visibility = 'hidden';
      text.style.opacity = '0';
      text.remove();
    }
  });

  // Remover elementos de crédito por classe ou ID
  const creditElements = document.querySelectorAll('.canvasjs-chart-credit, [class*="canvasjs-credit"], [id*="canvasjs-credit"]');
  creditElements.forEach(element => {
    element.style.display = 'none';
    element.remove();
  });

  // Procurar por elementos de texto pequenos que podem ser créditos
  const smallTexts = document.querySelectorAll('text[font-size="11"], tspan[font-size="11"]');
  smallTexts.forEach(text => {
    const content = text.textContent || text.innerHTML || '';
    if (content.toLowerCase().includes('canvasjs') || content.toLowerCase().includes('canvas')) {
      text.style.display = 'none';
      text.remove();
    }
  });
}

// Configurar observer para detectar mudanças no DOM
function setupDOMObserver() {
  if (window.MutationObserver) {
    const observer = new MutationObserver(function(mutations) {
      let shouldRemove = false;
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldRemove = true;
        }
      });
      if (shouldRemove) {
        setTimeout(removeCanvasJSWatermarks, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

// Inicializar todas as funcionalidades
function initIndexScripts() {
  // Executar remoção imediatamente
  removeCanvasJSWatermarks();
  
  // Configurar debug de recarregamento
  initPageReloadDebug();
  
  // Configurar observer
  setupDOMObserver();
  
  // Executar remoção após carregamento do DOM
  document.addEventListener('DOMContentLoaded', removeCanvasJSWatermarks);
  
  // Executar remoção periodicamente para capturar gráficos carregados dinamicamente
  setInterval(removeCanvasJSWatermarks, 1000);
}

// Auto-inicializar quando script for carregado
initIndexScripts();
