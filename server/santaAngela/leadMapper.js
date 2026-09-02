/**
 * Mapeia um lead da API Santa Ângela para o formato da tabela `leads`.
 * Portado de src/features/imoveis/services/santaAngelaSyncService.ts (lógica preservada).
 */
export function mapAssignedAgentName(corretorNome) {
  const name = (corretorNome ?? '').trim();
  if (!name) return null;
  return name.toUpperCase() === 'JAPI LEADS' ? null : name;
}

/**
 * `empreendimento` vem do detalhe do prospect (/prospects/{id} → empreendimento_id)
 * cruzado com /empreendimentos. É a ÚNICA fonte de imóvel dessa API: o grid não
 * traz nada de imóvel. Guardamos o NOME em property_code porque é ele que chega
 * na Lia (webhook lead.created manda `codigo` = property_code) e `codigo_empreendimento`
 * é ambíguo — "0001" hoje é de três empreendimentos diferentes. O código e o id
 * ficam em custom_fields para quem precisar casar com o ERP.
 */
// Valores aceitos por leads_status_check. Status fora dela faz o INSERT falhar
// e o lead ser PERDIDO — o insert só loga um warn (incidente 02/09: situação
// "PROPOSTA" virava 'Proposta', inexistente na constraint, e 2 leads da Santa
// Ângela nunca entraram, em nenhum ciclo). A whitelist é o cinto de segurança:
// situação nova/desconhecida na origem cai em 'Novos Leads' em vez de sumir.
const STATUS_VALIDOS = new Set([
  'Novos Leads', 'Interação', 'Visita Agendada', 'Visita Realizada',
  'Negociação', 'Proposta Criada', 'Proposta Enviada', 'Proposta Assinada',
]);

export function mapSantaAngelaToLead(saLead, tenantId, empreendimento = null) {
  const statusTitulo = saLead.situacaocadastropessoa_titulo || '';
  let status = 'Novos Leads';
  if (statusTitulo.includes('NOVO')) status = 'Novos Leads';
  else if (statusTitulo.includes('EM ATENDIMENTO')) status = 'Interação';
  else if (statusTitulo.includes('VISITA')) status = 'Visita Agendada';
  else if (statusTitulo.includes('EM NEGOCIACAO')) status = 'Negociação';
  else if (statusTitulo.includes('PROPOSTA')) {
    if (statusTitulo.includes('CRIADA')) status = 'Visita Realizada';
    else if (statusTitulo.includes('ENVIADA')) status = 'Proposta Enviada';
    else if (statusTitulo.includes('ASSINADA')) status = 'Proposta Assinada';
    // "PROPOSTA" sem qualificador: existe proposta, então 'Proposta Enviada'
    // (o valor 'Proposta', usado antes aqui, não passa na constraint).
    else status = 'Proposta Enviada';
  } else if (statusTitulo.includes('VENDA')) status = 'Proposta Assinada';
  if (!STATUS_VALIDOS.has(status)) status = 'Novos Leads';

  const nowIso = new Date().toISOString();
  return {
    tenant_id: tenantId,
    name: saLead.nome || 'Lead Santa Angela',
    phone: saLead.celular || saLead.telefone || null,
    email: saLead.email || null,
    source: 'Santa Angela',
    source_lead_id: saLead.id,
    status,
    property_id: null,
    property_code: empreendimento?.nome || null,
    property_type: null, // saLead.tipo é tipo de PESSOA, não de imóvel
    assigned_agent_id: null,
    assigned_agent_name: mapAssignedAgentName(saLead.corretor_nome),
    tags: ['Santa Angela', saLead.midia_titulo || 'Outros'],
    custom_fields: {
      santa_angela_cpfcnpj: saLead.cpfcnpj,
      santa_angela_tipopessoa: saLead.tipopessoa,
      santa_angela_conjuge_nome: saLead.conjuge_nome,
      santa_angela_imobiliaria_nome: saLead.imobiliaria_nome,
      santa_angela_corretor_nome: saLead.corretor_nome,
      santa_angela_usuario_cadastrador: saLead.usuario_cadastrador,
      santa_angela_situacao: saLead.situacaocadastropessoa_titulo,
      santa_angela_midia_titulo: saLead.midia_titulo,
      santa_angela_midia_sigla: saLead.midia_sigla,
      santa_angela_rd_uuid: saLead.rd_uuid,
      santa_angela_temperatura: status,
      santa_angela_empreendimento_id: empreendimento?.id ?? null,
      santa_angela_empreendimento_codigo: empreendimento?.codigo ?? null,
    },
    visit_date: null,
    closing_date: null,
    final_sale_value: null,
    created_at: saLead.datahoracadastro || nowIso,
    updated_at: saLead.data_ultima_interacao || nowIso,
    lead_type: 1,
    participa_bolsao: true,
    assigned_at: nowIso,
  };
}
