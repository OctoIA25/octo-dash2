/**
 * Contato do lead na dashboard — as MESMAS regras de server/utils/phone.js
 * (classificarTelefone), server/utils/email.js e da função SQL lead_phone_key
 * (migration 20260917). Mudou a regra, muda nos três; os casos de teste são os
 * mesmos nos três arquivos.
 *
 * Para que serve aqui: mostrar telefone/e-mail inválido COMO inválido (nunca
 * como se estivesse bom), impedir link de WhatsApp para número que não existe e
 * avisar o corretor quando o telefone digitado já é de outro lead.
 */

export type StatusTelefone = 'vazio' | 'valido' | 'internacional' | 'incompleto' | 'invalido';
export type StatusEmail = 'vazio' | 'valido' | 'suspeito' | 'invalido';

/** DDDs que existem no plano de numeração brasileiro. */
const DDD_VALIDO = /^(1[1-9]|2[12478]|3[1-578]|4[1-9]|5[1345]|6[1-9]|7[134579]|8[1-9]|9[1-9])$/;

export interface TelefoneClassificado {
  status: StatusTelefone;
  /** Forma canônica para comparar leads; null quando não identifica ninguém. */
  chave: string | null;
  /** Dígitos prontos para o WhatsApp; null quando o número não serve. */
  whatsapp: string | null;
}

/**
 * Classifica um telefone de lead. Não completa o que falta: dígito de menos é
 * 'incompleto', dígito demais é 'invalido' — inventar número é pior que
 * admitir que não dá para falar com a pessoa.
 */
export function classificarTelefone(valor: string | null | undefined): TelefoneClassificado {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (!digitos) return { status: 'vazio', chave: null, whatsapp: null };

  // Brasil, com DDI (12-13 dígitos) ou sem (10-11).
  const nacional = /^55\d{10,11}$/.test(digitos)
    ? digitos.slice(2)
    : (/^\d{10,11}$/.test(digitos) ? digitos : null);

  if (nacional) {
    const ddd = nacional.slice(0, 2);
    const assinante = nacional.slice(2);
    if (DDD_VALIDO.test(ddd)) {
      // Celular; celular antigo sem o 9º dígito (o wa_id vem assim, é o mesmo
      // número); fixo de 8 dígitos, que NÃO ganha o 9.
      if (/^9\d{8}$/.test(assinante)) return valido(`55${ddd}${assinante}`);
      if (/^[6-9]\d{7}$/.test(assinante)) return valido(`55${ddd}9${assinante}`);
      if (/^[2-5]\d{7}$/.test(assinante)) return valido(`55${ddd}${assinante}`);
    }
    return { status: 'invalido', chave: null, whatsapp: null };
  }

  if (digitos.length < 10) return { status: 'incompleto', chave: null, whatsapp: null };
  if (digitos.length <= 15 && /^[1-9]/.test(digitos) && !digitos.startsWith('55')) {
    return { status: 'internacional', chave: digitos, whatsapp: digitos };
  }
  return { status: 'invalido', chave: null, whatsapp: null };
}

const valido = (chave: string): TelefoneClassificado => ({ status: 'valido', chave, whatsapp: chave });

/** Chave canônica do telefone, ou null quando não serve para identificar. */
export const chaveTelefone = (valor: string | null | undefined): string | null =>
  classificarTelefone(valor).chave;

/**
 * Sintaxe aceitável: deixa passar 'gmail.co' (domínio que existe) e barra
 * 'gmail.com.b'.
 */
const SINTAXE_EMAIL = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** Provedor conhecido com o final truncado/trocado — o caso '@gmail.co'. */
const PROVEDOR_TRUNCADO =
  /^(gmail|hotmail|outlook|yahoo|icloud|live|msn|aol|bol|uol|terra|globo|ig)\.(co|cm|om|con|comm|cpm|vom)$/;

/**
 * Classifica um e-mail de lead. 'suspeito' = sintaxe boa, domínio com cara de
 * truncado; a dashboard mostra o aviso e ninguém corrige por palpite.
 */
export function classificarEmail(valor: string | null | undefined): { status: StatusEmail; normalizado: string | null } {
  const normalizado = String(valor ?? '').trim().toLowerCase();
  if (!normalizado) return { status: 'vazio', normalizado: null };
  if (!SINTAXE_EMAIL.test(normalizado)) return { status: 'invalido', normalizado };
  const dominio = normalizado.slice(normalizado.lastIndexOf('@') + 1);
  if (PROVEDOR_TRUNCADO.test(dominio)) return { status: 'suspeito', normalizado };
  return { status: 'valido', normalizado };
}

/** Link do WhatsApp, ou null quando o número não passa na validação (CA-04). */
export function linkWhatsapp(valor: string | null | undefined): string | null {
  const { whatsapp } = classificarTelefone(valor);
  return whatsapp ? `https://wa.me/${whatsapp}` : null;
}

/** Aviso curto para a tela; null quando não há o que avisar. */
export function avisoTelefone(valor: string | null | undefined): string | null {
  switch (classificarTelefone(valor).status) {
    case 'incompleto': return 'Telefone incompleto';
    case 'invalido': return 'Telefone inválido';
    case 'internacional': return 'Telefone de outro país';
    default: return null;
  }
}

/** Aviso curto para a tela; null quando não há o que avisar. */
export function avisoEmail(valor: string | null | undefined): string | null {
  switch (classificarEmail(valor).status) {
    case 'suspeito': return 'E-mail possivelmente incompleto';
    case 'invalido': return 'E-mail inválido';
    default: return null;
  }
}
