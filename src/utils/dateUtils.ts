/**
 * Utilitários para processamento de datas
 * Corrige problemas comuns como anos "202025" e formatos inconsistentes
 */

/**
 * Converte uma data em formato DD/MM/YYYY, DD/MM/YY ou outros formatos para YYYY-MM-DD
 * Corrige automaticamente anos de 2 dígitos
 */
export function normalizeDate(dateString: string): string {
  if (!dateString || dateString.trim() === '') {
    return new Date().toISOString().split('T')[0];
  }

  // ISO com barras no lugar de hífens: "2025/02/03T18:10:01+00:00" ou "2025/02/03T18:10:01.197+00:00"
  // Converte para ISO padrão antes de qualquer outro processamento.
  const isoWithSlashes = /^(\d{4})\/(\d{2})\/(\d{2})T/;
  const isoMatch = dateString.match(isoWithSlashes);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m}-${d}`;
  }

  // Se já está no formato ISO (YYYY-MM-DD), verificar se o ano está correto
  if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const year = parseInt(dateString.substring(0, 4));
    // Corrigir anos malformados como 202025
    if (year > 2030) {
      // Provavelmente um erro de concatenação, usar ano atual
      const currentYear = new Date().getFullYear();
      return `${currentYear}-${dateString.substring(5)}`;
    }
    return dateString;
  }

  // Se contém barras, processar como DD/MM/YYYY ou DD/MM/YY
  if (dateString.includes('/')) {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      let year = parts[2];

      // Corrigir anos de 2 dígitos
      if (year.length === 2) {
        const currentYear = new Date().getFullYear();
        const currentCentury = Math.floor(currentYear / 100) * 100;
        const twoDigitYear = parseInt(year);
        
        // Se o ano de 2 dígitos é maior que os próximos 10 anos, assumir século passado
        if (twoDigitYear > (currentYear - currentCentury + 10)) {
          year = `${currentCentury - 100 + twoDigitYear}`;
        } else {
          year = `${currentCentury + twoDigitYear}`;
        }
      }
      
      // Validar se os componentes são números válidos
      const dayNum = parseInt(day);
      const monthNum = parseInt(month);
      const yearNum = parseInt(year);
      
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum <= 2050) {
        return `${year}-${month}-${day}`;
      }
    }
  }

  // Se contém hífen mas não está no formato correto, tentar processar
  if (dateString.includes('-')) {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      // Pode ser YYYY-MM-DD ou DD-MM-YYYY
      if (parts[0].length === 4) {
        // Provavelmente YYYY-MM-DD
        return normalizeDate(dateString.replace(/-/g, '/'));
      } else {
        // Provavelmente DD-MM-YYYY, converter para formato com barras
        return normalizeDate(parts.join('/'));
      }
    }
  }

  // Se nada funcionar, usar data atual
  console.warn('⚠️ Data não pôde ser processada:', dateString);
  return new Date().toISOString().split('T')[0];
}

/**
 * Valida se uma data está em um formato correto
 */
export function isValidDate(dateString: string): boolean {
  const normalized = normalizeDate(dateString);
  const date = new Date(normalized);
  return !isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2050;
}

/**
 * Formata uma data para exibição em português
 */
export function formatDatePtBR(dateString: string): string {
  const normalized = normalizeDate(dateString);
  const date = new Date(normalized);
  
  if (isNaN(date.getTime())) {
    return 'Data inválida';
  }
  
  return date.toLocaleDateString('pt-BR');
}

/**
 * Obtém o mês/ano em formato legível
 */
export function getMonthYear(dateString: string): string {
  const normalized = normalizeDate(dateString);
  const date = new Date(normalized);
  
  if (isNaN(date.getTime())) {
    return 'Mês inválido';
  }
  
  return date.toLocaleDateString('pt-BR', { 
    month: 'short', 
    year: 'numeric' 
  });
}

/**
 * Formata um valor para moeda brasileira
 */
export function formatCurrency(value: number): string {
  if (!value || isNaN(value)) {
    return 'R$ 0,00';
  }
  
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}