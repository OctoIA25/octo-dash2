/**
 * Anúncios que mandam lead e ninguém sabe qual imóvel são.
 *
 * POR QUE EXISTE
 * O portal devolve o id do anúncio de quem o publicou. Se o anúncio saiu pelo
 * nosso feed VRSync, esse id É o `codigo_imovel` e o lead já chega identificado.
 * Se foi publicado por fora (lançamento, ou imóvel que não está no feed), vem
 * '110D1GD' — que não é imóvel nenhum — e o único jeito de saber o que é foi,
 * até aqui, alguém escrever uma migration. Este módulo transforma isso em uma
 * pendência que o Bolsão mostra e um admin resolve em um clique.
 *
 * NÃO ADIVINHA NADA. Só lista o que não bate e grava o que o humano escolheu —
 * o chute por bairro que existia antes (`ilike bairro ... limit 1`) escrevia
 * código errado, que é pior que código nenhum.
 */
import { extrairOriginListingId } from '../lancamentoAnuncios.js';

const TETO_LEADS = 1000;

/** O texto que o portal monta traz o endereço só no lead de formulário. */
const extrairDica = (mensagem) => {
  const texto = String(mensagem || '').replace(/\s+/g, ' ');
  const inicio = texto.indexOf('R$');
  if (inicio === -1) return null;
  return texto.slice(inicio).split(' que encontrei')[0].split(' Sua opinião')[0].trim().slice(0, 160) || null;
};

const requestDoLead = (lead) => lead?.custom_fields?.raw_data?.original_request || {};

/**
 * Que anúncio é este lead. ZAP/OLX mandam o id em `original_request`; o Meta
 * Lead Ads manda o `form_id` — e o form_id JÁ é a chave do de-para desde a
 * 20260910 (ver lancamentoAnuncios.js). Sem esta linha o formulário que ninguém
 * mapeou some: o lead entra sem código, e a tela que existe para gritar
 * "anúncio desconhecido" não olhava para o Meta. Foi assim que cinco
 * formulários ativos da Lótus passaram meses invisíveis.
 */
const anuncioDoLead = (lead) =>
  extrairOriginListingId(requestDoLead(lead))
  || lead?.custom_fields?.raw_data?.meta?.form_id
  || null;

/** Origens que carregam id de anúncio. Filtra na consulta para o teto de leads valer. */
const FONTES_COM_ANUNCIO =
  'source.ilike.%zap%,source.ilike.%olx%,source.ilike.%instagram%,source.ilike.%facebook%';

/**
 * Lista os anúncios sem identificação, do mais barulhento para o mais quieto.
 *
 * Dois filtros, nesta ordem, porque são baratos em ordens diferentes: primeiro
 * tira quem já está no de-para (uma consulta para todos), depois quem já tem
 * código do catálogo (uma por código DISTINTO, não por lead).
 */
export async function listarAnunciosDesconhecidos(supabase, tenantId, { limite = TETO_LEADS } = {}) {
  if (!tenantId) return { ok: false, error: 'tenantId obrigatório' };

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, created_at, property_code, source, custom_fields')
    .eq('tenant_id', tenantId)
    .or(FONTES_COM_ANUNCIO)
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) {
    console.error('❌ [anunciosPendentes] leitura de leads falhou:', error.message);
    return { ok: false, error: 'falha ao ler leads' };
  }

  const porAnuncio = new Map();
  for (const lead of leads || []) {
    const anuncio = anuncioDoLead(lead);
    if (!anuncio) continue;
    const request = requestDoLead(lead);

    const atual = porAnuncio.get(anuncio) || {
      originListingId: anuncio,
      codigoNoPortal: lead.property_code || null,
      totalLeads: 0,
      ultimoLeadEm: lead.created_at,
      dica: null,
    };
    atual.totalLeads += 1;
    // A dica vem do primeiro lead que tiver endereço; clique-no-WhatsApp não tem.
    atual.dica = atual.dica || extrairDica(request.message);
    porAnuncio.set(anuncio, atual);
  }

  const { data: mapeados, error: erroDepara } = await supabase
    .from('lancamento_anuncios')
    .select('origin_listing_id, codigo')
    .eq('tenant_id', tenantId);

  if (erroDepara) {
    console.error('❌ [anunciosPendentes] leitura do de-para falhou:', erroDepara.message);
    return { ok: false, error: 'falha ao ler o de-para' };
  }
  for (const linha of mapeados || []) porAnuncio.delete(String(linha.origin_listing_id));

  // O que sobrou pode ainda ser anúncio do NOSSO feed (código = imóvel do
  // catálogo). Pergunta ao banco, uma vez por código distinto.
  const pendentes = [];
  const jaConferidos = new Map();
  for (const anuncio of porAnuncio.values()) {
    const codigo = anuncio.codigoNoPortal;
    if (codigo) {
      if (!jaConferidos.has(codigo)) {
        const { data, error: erroRpc } = await supabase.rpc('eh_codigo_catalogo', {
          p_tenant: tenantId, p_codigo: codigo,
        });
        if (erroRpc) {
          console.error('❌ [anunciosPendentes] eh_codigo_catalogo falhou:', erroRpc.message);
          return { ok: false, error: 'falha ao conferir o catálogo' };
        }
        jaConferidos.set(codigo, data === true);
      }
      if (jaConferidos.get(codigo)) continue;
    }
    pendentes.push(anuncio);
  }

  pendentes.sort((a, b) => b.totalLeads - a.totalLeads || b.ultimoLeadEm.localeCompare(a.ultimoLeadEm));

  // Os códigos de lançamento ('L001'…, 'RESERVA CASTANHEIRA') só existem nesta
  // tabela — não há coluna `codigo` em `lancamentos` —, e a tabela tem RLS sem
  // policy, então o navegador não consegue lê-los. Vão junto para alimentar a
  // lista de escolha da tela. Imóvel do catálogo o front lê sozinho.
  const codigosConhecidos = [...new Set((mapeados || []).map((l) => l.codigo).filter(Boolean))].sort();

  return { ok: true, anuncios: pendentes, codigosConhecidos };
}

/**
 * Amarra o anúncio a um código e conserta os leads que já entraram por ele.
 *
 * A classificação é recalculada pela MESMA função do banco que o trigger de
 * entrada usa — não há uma segunda regra aqui. E só é reescrita em lead com
 * `classification_source = 'automatic'`: decisão de corretor ou da Lia é
 * intocável (regra de precedência da 20260815). O código, esse sim, vai em
 * todos: ele é fato sobre o anúncio, não opinião sobre o lead.
 */
export async function amarrarAnuncio(supabase, { tenantId, originListingId, codigo }) {
  const anuncio = String(originListingId ?? '').trim();
  const codigoNormalizado = String(codigo ?? '').trim().toUpperCase();
  if (!tenantId) return { ok: false, error: 'tenantId obrigatório' };
  if (!anuncio) return { ok: false, error: 'originListingId obrigatório' };
  if (!codigoNormalizado) return { ok: false, error: 'codigo obrigatório' };

  const { error: erroUpsert } = await supabase
    .from('lancamento_anuncios')
    .upsert(
      { tenant_id: tenantId, origin_listing_id: anuncio, codigo: codigoNormalizado },
      { onConflict: 'tenant_id,origin_listing_id' },
    );

  if (erroUpsert) {
    console.error('❌ [anunciosPendentes] gravação do de-para falhou:', erroUpsert.message);
    return { ok: false, error: 'falha ao gravar o de-para' };
  }

  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, source, property_code, classification_source, custom_fields')
    .eq('tenant_id', tenantId)
    .or(FONTES_COM_ANUNCIO)
    .order('created_at', { ascending: false })
    .limit(TETO_LEADS);

  // O de-para já está gravado: lead NOVO deste anúncio entra certo mesmo se o
  // reprocessamento falhar aqui. Por isso o erro não desfaz nada.
  if (error) {
    console.error('❌ [anunciosPendentes] reprocessamento não leu os leads:', error.message);
    return { ok: true, codigo: codigoNormalizado, leadsAtualizados: 0, aviso: 'leads antigos não reprocessados' };
  }

  const doAnuncio = (leads || []).filter(
    (lead) => anuncioDoLead(lead) === anuncio,
  );

  let atualizados = 0;
  for (const lead of doAnuncio) {
    const patch = { property_code: codigoNormalizado };

    if (lead.classification_source === 'automatic') {
      const { data: classificacao, error: erroRpc } = await supabase.rpc('classificar_lead_com_lancamento', {
        p_tenant: tenantId, p_codigo: codigoNormalizado, p_portal: lead.source,
        p_is_rent: null, p_is_sale: null,
      });
      if (erroRpc) {
        console.error('❌ [anunciosPendentes] classificação falhou:', erroRpc.message);
      } else if (classificacao) {
        patch.classification = classificacao;
      }
    }

    const { error: erroUpdate } = await supabase.from('leads').update(patch).eq('id', lead.id);
    if (erroUpdate) console.error(`❌ [anunciosPendentes] update do lead ${lead.id} falhou:`, erroUpdate.message);
    else atualizados += 1;
  }

  console.log(`🔗 [anunciosPendentes] ${anuncio} → ${codigoNormalizado} (${atualizados} leads reprocessados)`);
  return { ok: true, codigo: codigoNormalizado, leadsAtualizados: atualizados };
}
