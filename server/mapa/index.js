/**
 * 🗺️ Mapa interligado (P2.6) — geocodificação.
 *
 *   POST /api/v1/mapa/geocodificar — roda a fila do tenant, ou um registro só
 *
 * POR QUE PASSA PELO SERVIDOR
 * A política do OpenStreetMap pede identificação de quem chama e no máximo 1
 * requisição por segundo. Feito no navegador, cada aba aberta é uma fila
 * própria: o limite é respeitado por um usuário e furado por três. Aqui há uma
 * fila só. Decidido pelo chefe em 21/09/2026.
 *
 * NUNCA SOBRESCREVE PINO ARRASTADO. `geo_origem = 'manual'` é a única coisa
 * que a geocodificação automática não toca — é o que o plano chama de pronto:
 * "pino arrastado não volta para a posição automática".
 *
 * Registrar nos DOIS entrypoints (api-server.js e proxy-production.js) antes
 * do catch-all 404, senão funciona em dev e dá 404 em produção.
 */

import { makeRequireSupabaseAuth, resolveTenant } from '../kpis/index.js';
import { isPlatformOwner } from '../utils/ownerAuth.js';
import { geocodificar, dormir, INTERVALO_MS } from './nominatim.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O tipo do ponto e a tabela onde ele mora. Nada fora daqui é aceito. */
export const TABELA_DO_TIPO = {
  lancamento: 'lancamentos',
  condominio: 'condominios',
  imovel: 'imoveis_locais',
};

/** Teto por chamada: a 1,1 s cada, 200 endereços levam quase 4 minutos. */
const LIMITE_MAXIMO = 200;

/**
 * O que gravar depois de tentar geocodificar um endereço — função pura.
 *
 * `geo_em` é gravado SEMPRE, inclusive na falha: sem ele não dá para saber se
 * um registro sem coordenada nunca foi tentado ou foi tentado e não achado, e
 * o script repetiria para sempre os mesmos endereços impossíveis.
 */
export function linhaDoResultado(resultado, precisao, agora = new Date()) {
  const quando = agora.toISOString();
  if (resultado?.erro) {
    return { geo_em: quando, geo_erro: resultado.erro };
  }
  return {
    latitude: resultado.lat,
    longitude: resultado.lng,
    geo_origem: 'automatica',
    geo_precisao: precisao === 'aproximada' ? 'aproximada' : 'exata',
    geo_em: quando,
    geo_erro: null,
  };
}

export function registerMapaRoutes(app, supabase, options = {}) {
  const requireAuth = makeRequireSupabaseAuth(supabase);

  app.post('/api/v1/mapa/geocodificar', requireAuth, async (req, res) => {
    try {
      const resolved = await resolveTenant(supabase, req);
      if (resolved.error) return res.status(resolved.status).json({ ok: false, error: resolved.error });
      const { tenantId } = resolved;

      // Geocodificar é caro e mexe no cadastro da imobiliária inteira: gestão.
      if (!isPlatformOwner(req.userEmail)) {
        const { data: membro, error } = await supabase
          .from('tenant_memberships')
          .select('role')
          .eq('user_id', req.userId)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (error) throw error;
        if (!['admin', 'owner', 'team_leader'].includes(membro?.role)) {
          return res.status(403).json({ ok: false, error: 'forbidden' });
        }
      }

      const tipoUnico = String(req.body?.tipo ?? '').trim();
      const idUnico = String(req.body?.id ?? '').trim();

      let fila;
      if (tipoUnico || idUnico) {
        // Um registro só — é o caminho do "ao salvar".
        if (!TABELA_DO_TIPO[tipoUnico]) return res.status(400).json({ ok: false, error: 'tipo_invalido' });
        if (!UUID_RE.test(idUnico)) return res.status(400).json({ ok: false, error: 'id_invalido' });
        const { data, error } = await supabase.rpc('mapa_fila_de_geocodificacao', {
          p_tenant_id: tenantId,
          p_limite: LIMITE_MAXIMO,
          p_com_erro: true,
        });
        if (error) throw error;
        fila = (data ?? []).filter((f) => f.tipo === tipoUnico && f.id === idUnico);
      } else {
        const limite = Math.min(Math.max(Number(req.body?.limite) || 100, 1), LIMITE_MAXIMO);
        const { data, error } = await supabase.rpc('mapa_fila_de_geocodificacao', {
          p_tenant_id: tenantId,
          p_limite: limite,
          p_com_erro: Boolean(req.body?.comErro),
        });
        if (error) throw error;
        fila = data ?? [];
      }

      const relatorio = { tentados: 0, achados: 0, aproximados: 0, falhas: [] };

      for (let i = 0; i < fila.length; i += 1) {
        const item = fila[i];
        const tabela = TABELA_DO_TIPO[item.tipo];
        if (!tabela) continue;

        // Confere o pino manual AGORA, e não pela fila: entre montar a fila e
        // chegar aqui podem ter passado minutos, e alguém pode ter arrastado o
        // pino nesse meio-tempo. Sobrescrever seria desfazer o trabalho dele.
        const { data: atual, error: erroAtual } = await supabase
          .from(tabela)
          .select('geo_origem')
          .eq('id', item.id)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (erroAtual) throw erroAtual;
        if (atual?.geo_origem === 'manual') continue;

        const resultado = await geocodificar(item.endereco);
        relatorio.tentados += 1;

        const linha = linhaDoResultado(resultado, item.precisao);
        const { error: erroGravar } = await supabase
          .from(tabela)
          .update(linha)
          .eq('id', item.id)
          .eq('tenant_id', tenantId);
        if (erroGravar) throw erroGravar;

        if (linha.latitude != null) {
          relatorio.achados += 1;
          if (linha.geo_precisao === 'aproximada') relatorio.aproximados += 1;
        } else {
          // O relatório que o plano pede: quais endereços não foram achados.
          relatorio.falhas.push({ tipo: item.tipo, id: item.id, endereco: item.endereco, erro: resultado.erro });
        }

        // A pausa é entre consultas, nunca depois da última: esperar 1,1 s para
        // não fazer nada é 1,1 s de tela parada.
        if (i < fila.length - 1) await dormir(INTERVALO_MS);
      }

      return res.json({ ok: true, ...relatorio, na_fila: fila.length });
    } catch (err) {
      console.error('[mapa] erro geocodificando:', err?.message);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });

  if (options.verbose !== false) {
    console.log('   └─ 🗺️  POST /api/v1/mapa/geocodificar                     → Geocodifica o que falta (Nominatim)');
  }
}
