import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { normalizeImovelwebLeadPayload, ehEventoDeLead } from './leadNormalizer.js';

// Corpo do callback exatamente como a doc do Open (Grupo QuintoAndar) descreve
// para lenguajeCallbackBody = PT.
const contatoMensagemPT = {
  idEvento: 'evt-991',
  tipoEvento: 'CONTACTO_MENSAJE',
  idMensagem: 12345,
  idTipoContacto: 1,
  idContato: 777,
  codigoImobiliaria: '47898311',
  referencia: 'AP0684',
  dataRegistro: '2026-09-04T18:31:00.000-0300',
  nome: 'Maria Souza',
  email: 'maria@example.com',
  telefone: '11988887777',
  mensagem: 'Tenho interesse, podemos agendar?',
  planoDePublicacao: 'SIMPLE',
  cpf: '12345678900',
};

describe('normalizeImovelwebLeadPayload', () => {
  it('mapeia o lead de mensagem (PT) para o formato do createIncomingLead', () => {
    const lead = normalizeImovelwebLeadPayload(contatoMensagemPT);

    expect(lead.name).toBe('Maria Souza');
    expect(lead.phone).toBe('11988887777');
    expect(lead.email).toBe('maria@example.com');
    expect(lead.portal).toBe('Imovelweb');
    expect(lead.message).toBe('Tenho interesse, podemos agendar?');
    // referencia é o NOSSO código de anúncio, sem de-para no meio.
    expect(lead.property_code).toBe('AP0684');
    expect(lead.interest_reference).toBe('AP0684');
    expect(lead.raw_data.cpf).toBe('12345678900');
  });

  it('dedup: a retentativa do mesmo callback gera o mesmo external_id', () => {
    const a = normalizeImovelwebLeadPayload(contatoMensagemPT);
    const b = normalizeImovelwebLeadPayload({ ...contatoMensagemPT });
    expect(a.external_id).toBe('imovelweb_12345');
    expect(b.external_id).toBe(a.external_id);
  });

  it('CONTACTO sem mensagem vira lead descrevendo a ação (não fica vazio)', () => {
    const lead = normalizeImovelwebLeadPayload({
      idEvento: 'evt-992',
      tipoEvento: 'CONTACTO',
      idTipoContacto: 6,
      referencia: 'CA054',
      nome: 'João',
      telefone: '11 97777 6666',
      mensagem: null,
    });

    expect(lead.message).toBe('Viu telefone (Imovelweb)');
    expect(lead.external_id).toBe('imovelweb_evt-992');
  });

  it('aceita o corpo em espanhol e junta DDD + telefone', () => {
    const lead = normalizeImovelwebLeadPayload({
      idEvento: 'evt-993',
      tipoEvento: 'CONTACTO',
      idTipoContacto: 10,
      referencia: 'TE002',
      txtNome: 'Ana',
      txtEmail: 'ana@example.com',
      txtDdd: '11',
      txtTelefone: 966665555,
    });

    expect(lead.name).toBe('Ana');
    expect(lead.phone).toBe('11966665555');
  });

  it('lead de lançamento não entra como imóvel pronto', () => {
    const lead = normalizeImovelwebLeadPayload({
      ...contatoMensagemPT,
      codigoLancamento: 'L007',
    });
    expect(lead.atuacao).toBe('lancamentos');
  });

  it('só CONTACTO e CONTACTO_MENSAJE são lead', () => {
    expect(ehEventoDeLead({ tipoEvento: 'CONTACTO' })).toBe(true);
    expect(ehEventoDeLead({ tipoEvento: 'CONTACTO_MENSAJE' })).toBe(true);
    expect(ehEventoDeLead({ tipoEvento: 'AVISO_ESTADO_PUBLICACION' })).toBe(false);
    expect(ehEventoDeLead({ tipoEvento: 'CREDITO' })).toBe(false);
    expect(ehEventoDeLead({})).toBe(false);
  });
});

// Produção roda proxy-production.js: rota que não está registrada LÁ é 404 no ar,
// por mais que exista no api-server.js.
describe('wiring da rota em produção', () => {
  const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'proxy-production.js'), 'utf8');

  it('registra o callback protegido pelo secret do tenant', () => {
    expect(fonte).toContain("app.post('/api/v1/integrations/imovelweb/webhook', validateZapFeedAccess");
  });

  it('grava o lead com origem Imovelweb', () => {
    expect(fonte).toMatch(/normalizeImovelwebLeadPayload\(req\.body\)[\s\S]{0,80}source: 'Imovelweb'/);
  });
});
