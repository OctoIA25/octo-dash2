/**
 * Regressão: 60 de 68 leads do ZAP/Grupo OLX entraram com telefone SEM DDD
 * (ex.: "995022724"). Sem DDD o dashboard não mostra o link da conversa e o
 * WhatsApp não acha o número.
 *
 * Causa: o portal manda `phone` só com o número e o DDD à parte em `ddd`; o
 * número completo vem em `phoneNumber`. extractZapPhone lia `phone` primeiro.
 *
 * proxy-production.js não é importável (chama app.listen no import), então o
 * teste recorta o extractZapPhone REAL de cada servidor e o executa.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mesmos helpers dos servidores (dependências do extractZapPhone).
const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const nested = pickFirstNonEmpty(...value);
      if (nested) return nested;
      continue;
    }
    if (typeof value === 'object') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
};
const getNestedValue = (source, path) => path.split('.').reduce((c, k) => (c == null ? undefined : c[k]), source);
const pickNestedText = (source, paths) => pickFirstNonEmpty(...paths.map((p) => getNestedValue(source, p)));

const carregar = (arquivo) => {
  const fonte = readFileSync(join(__dirname, arquivo), 'utf8');
  const def = fonte.match(/const extractZapPhone = \(payload\) => \{[\s\S]*?\n\};\n/);
  if (!def) throw new Error(`extractZapPhone não encontrado em ${arquivo}`);
  return new Function('pickFirstNonEmpty', 'pickNestedText', `${def[0]}\nreturn extractZapPhone;`)(
    pickFirstNonEmpty,
    pickNestedText,
  );
};

// Payload real do Grupo OLX (lead Lucas, 15/09 — e-mail trocado).
const payloadReal = {
  ddd: '19',
  name: 'Lucas Henrique ',
  email: 'lead@example.com',
  phone: '995022724',
  phoneNumber: '19995022724',
  extraData: { leadType: 'CLICK_WHATSAPP', leadCerto: false },
  leadOrigin: 'Grupo OLX',
  originLeadId: 'aad6c88b731a43078d16629836f1ca08',
};

for (const arquivo of ['proxy-production.js', 'api-server.js']) {
  describe(`${arquivo}: extractZapPhone`, () => {
    const extractZapPhone = carregar(arquivo);

    it('usa o número completo de phoneNumber, não o phone sem DDD', () => {
      expect(extractZapPhone(payloadReal)).toBe('19995022724');
    });

    it('sem phoneNumber, junta ddd + phone', () => {
      const { phoneNumber: _, ...semCompleto } = payloadReal;
      expect(extractZapPhone(semCompleto)).toBe('19995022724');
    });

    it('phone que já tem DDD não ganha DDD duplicado', () => {
      expect(extractZapPhone({ ddd: '19', phone: '(19) 99502-2724' })).toBe('(19) 99502-2724');
    });

    it('sem telefone → null', () => {
      expect(extractZapPhone({ ddd: '', phone: '', phoneNumber: '' })).toBeNull();
    });
  });
}
