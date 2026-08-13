import { describe, it, expect } from 'vitest';
import { normalizeLeadgen } from './normalizer.js';

const CTX = { pageId: 'p1', formId: 'f1', adId: 'a1' };

const lead = (overrides = {}) => ({
  id: 'lg-1',
  created_time: '2026-08-06T12:00:00+0000',
  platform: 'fb',
  field_data: [
    { name: 'full_name', values: ['Maria Silva'] },
    { name: 'email', values: ['maria@exemplo.com'] },
    { name: 'phone_number', values: ['+5511999998888'] },
  ],
  ...overrides,
});

describe('normalizeLeadgen', () => {
  it('mapeia os três campos padrão', () => {
    const p = normalizeLeadgen(lead(), CTX);
    expect(p.name).toBe('Maria Silva');
    expect(p.email).toBe('maria@exemplo.com');
    expect(p.phone).toBe('+5511999998888');
  });

  it('manda o rótulo em portal, não em source (a rota deriva source de portal)', () => {
    const p = normalizeLeadgen(lead(), CTX);
    expect(p.portal).toBe('Facebook');
    expect(p.source).toBeUndefined();
  });

  it('platform ig vira Instagram', () => {
    expect(normalizeLeadgen(lead({ platform: 'ig' }), CTX).portal).toBe('Instagram');
  });

  it('sem platform cai em Facebook', () => {
    expect(normalizeLeadgen(lead({ platform: undefined }), CTX).portal).toBe('Facebook');
  });

  it('pergunta customizada com um valor sobrevive em raw_data.fields como escalar', () => {
    const p = normalizeLeadgen(lead({
      field_data: [
        { name: 'full_name', values: ['João'] },
        { name: 'qual_bairro_voce_procura', values: ['Centro'] },
      ],
    }), CTX);
    expect(p.raw_data.fields.qual_bairro_voce_procura).toBe('Centro');
    expect(p.name).toBe('João');
  });

  it('guarda os identificadores da Meta em raw_data.meta', () => {
    const p = normalizeLeadgen(lead(), CTX);
    expect(p.raw_data.meta).toEqual({
      leadgen_id: 'lg-1',
      page_id: 'p1',
      form_id: 'f1',
      ad_id: 'a1',
      created_time: '2026-08-06T12:00:00+0000',
      platform: 'fb',
    });
  });

  it('formulário sem telefone não quebra — devolve phone null', () => {
    const p = normalizeLeadgen(lead({
      field_data: [{ name: 'full_name', values: ['Ana'] }],
    }), CTX);
    expect(p.phone).toBeNull();
    expect(p.name).toBe('Ana');
  });

  it('valor vazio conta como ausente', () => {
    const p = normalizeLeadgen(lead({
      field_data: [
        { name: 'full_name', values: ['Ana'] },
        { name: 'email', values: [''] },
      ],
    }), CTX);
    expect(p.email).toBeNull();
  });

  it('field_data ausente não estoura', () => {
    const p = normalizeLeadgen({ id: 'lg-2' }, CTX);
    expect(p.name).toBeNull();
    expect(p.raw_data.fields).toEqual({});
  });

  it('resume as respostas customizadas em message para o corretor ver', () => {
    const p = normalizeLeadgen(lead({
      field_data: [
        { name: 'full_name', values: ['João'] },
        { name: 'qual_bairro_voce_procura', values: ['Centro'] },
        { name: 'faixa_de_preco', values: ['500 a 700 mil'] },
      ],
    }), CTX);
    expect(p.message).toBe('qual_bairro_voce_procura: Centro\nfaixa_de_preco: 500 a 700 mil');
  });

  it('sem pergunta customizada, message fica null', () => {
    expect(normalizeLeadgen(lead(), CTX).message).toBeNull();
  });

  it('pergunta com múltiplos valores: raw_data.fields guarda array, message mostra com vírgula', () => {
    const p = normalizeLeadgen(lead({
      field_data: [
        { name: 'full_name', values: ['João'] },
        { name: 'tipos_de_imovel', values: ['Apartamento', 'Casa'] },
      ],
    }), CTX);
    expect(p.raw_data.fields.tipos_de_imovel).toEqual(['Apartamento', 'Casa']);
    expect(p.message).toBe('tipos_de_imovel: Apartamento, Casa');
  });

  it('full_name com múltiplos valores: name recebe escalar (primeiro), não array', () => {
    const p = normalizeLeadgen(lead({
      field_data: [
        { name: 'full_name', values: ['João Silva', 'João dos Santos'] },
      ],
    }), CTX);
    expect(p.name).toBe('João Silva');
    expect(typeof p.name).toBe('string');
  });

  it('values com array vazio: tratado como ausente', () => {
    const p = normalizeLeadgen(lead({
      field_data: [
        { name: 'full_name', values: ['João'] },
        { name: 'qual_bairro_voce_procura', values: [] },
      ],
    }), CTX);
    expect(p.raw_data.fields.qual_bairro_voce_procura).toBeUndefined();
    expect(p.message).toBeNull();
  });

  it('raw_data.fields contém todos os campos (padrão + customizados) para auditoria bruta', () => {
    const p = normalizeLeadgen(lead({
      field_data: [
        { name: 'full_name', values: ['João Silva'] },
        { name: 'email', values: ['joao@exemplo.com'] },
        { name: 'phone_number', values: ['+5511988887777'] },
        { name: 'qual_bairro_voce_procura', values: ['Centro'] },
      ],
    }), CTX);
    // Campos padrão sobrevivem em raw_data.fields com seus valores brutos.
    expect(p.raw_data.fields.full_name).toBe('João Silva');
    expect(p.raw_data.fields.email).toBe('joao@exemplo.com');
    expect(p.raw_data.fields.phone_number).toBe('+5511988887777');
    // Customizados também.
    expect(p.raw_data.fields.qual_bairro_voce_procura).toBe('Centro');
    // message rendere apenas customizadas, não os padrão.
    expect(p.message).toBe('qual_bairro_voce_procura: Centro');
  });

  // O default de parâmetro só cobre `undefined`.
  it('lead null não lança', () => {
    expect(() => normalizeLeadgen(null, CTX)).not.toThrow();
    expect(normalizeLeadgen(null, CTX).name).toBeNull();
  });

  it('leadgen_id vem do ctx (evento), não da resposta do Graph', () => {
    const p = normalizeLeadgen(lead({ id: 'do-graph' }), { ...CTX, leadgenId: 'do-evento' });
    expect(p.raw_data.meta.leadgen_id).toBe('do-evento');
  });

  // field_data real da Página Imobiliária Japi Lançamentos (942752912259386):
  // a chave é `phone`, não o `phone_number` da documentação. Lia com telefone
  // vazio foi o sintoma.
  describe('telefone com a chave `phone`', () => {
    const comPhone = lead({
      field_data: [
        { name: 'full_name', values: ['Ronaldo Souza'] },
        { name: 'phone', values: ['+5511999998888'] },
        { name: 'email', values: ['ronaldo@exemplo.com'] },
      ],
    });

    it('mapeia para phone', () => {
      expect(normalizeLeadgen(comPhone, CTX).phone).toBe('+5511999998888');
    });

    it('não vaza para message como se fosse pergunta customizada', () => {
      expect(normalizeLeadgen(comPhone, CTX).message).toBeNull();
    });

    it('phone_number continua funcionando', () => {
      expect(normalizeLeadgen(lead(), CTX).phone).toBe('+5511999998888');
    });

    it('phone_number vence quando os dois vêm', () => {
      const ambos = lead({
        field_data: [
          { name: 'phone_number', values: ['+5511111111111'] },
          { name: 'phone', values: ['+5522222222222'] },
        ],
      });
      expect(normalizeLeadgen(ambos, CTX).phone).toBe('+5511111111111');
    });
  });
});
