/**
 * A rota que a Lia consulta: "de quem é este lead?".
 *
 * Decidido em 19/09/2026: a Lia continua distribuindo. Esta rota RESPONDE e
 * grava o que respondeu no extrato; quem atribui é a Lia. Por isso ela não
 * escreve em `leads` — de propósito. Se um dia o Octo voltar a distribuir, o
 * motor que fizer isso chama a mesma regra, e o extrato continua servindo
 * para auditar os dois lados.
 */

import { decidirDestino, MOTIVOS } from './regra.js';
import { janelaDaConfiguracao, prazoDeAtendimento, minutosDePrazo } from './janela.js';
import { criarLeituras } from './dados.js';

export function registerDistribuicaoRoutes(app, supabase, validateApiKey) {
  const dados = criarLeituras({ supabase });

  /**
   * POST /api/v1/distribuicao/destino
   *
   * Corpo: { lead_id?, lead_ref?, codigo_imovel?, tipo_imovel?, lia_passou? }
   * Resposta: { destino, corretor_id, motivo, tipo, prazo_ate, posicao }
   *
   * `destino` é 'corretor' | 'lia' | 'ninguem'. Nunca inventa corretor: com
   * a fila toda indisponível a resposta é 'ninguem', e quem chama decide.
   */
  app.post('/api/v1/distribuicao/destino', validateApiKey, async (req, res) => {
    const tenantId = req.tenantId;
    const corpo = req.body || {};

    try {
      const [config, participantes, captador, ultimaPosicao] = await Promise.all([
        dados.configuracao(tenantId),
        dados.participantes(tenantId),
        dados.captadorDoImovel(tenantId, corpo.codigo_imovel),
        dados.ultimaPosicao(tenantId),
      ]);

      const decisao = decidirDestino({
        lead: {
          codigoImovel: corpo.codigo_imovel,
          tipoImovel: corpo.tipo_imovel,
          liaPassou: corpo.lia_passou === true,
        },
        captador,
        participantes,
        ultimaPosicao,
      });

      // O prazo só existe quando há um corretor com quem o relógio corre.
      const janela = janelaDaConfiguracao(config?.horario_funcionamento);
      // O ajuste mora em janela.js: o simulador roda a MESMA função no
      // navegador, e duplicá-lo aqui criaria a segunda verdade.
      const minutosValidos = minutosDePrazo(config);
      const prazo = decisao.destino === 'corretor'
        ? prazoDeAtendimento(new Date(), minutosValidos, janela)
        : null;

      const gravou = await dados.registrar({
        tenant_id: tenantId,
        lead_id: corpo.lead_id || null,
        lead_ref: corpo.lead_ref || corpo.codigo_imovel || null,
        evento: 'consultado',
        corretor_id: decisao.corretorId,
        motivo: decisao.motivo,
        tipo: decisao.tipo,
        prazo_ate: prazo ? prazo.toISOString() : null,
        origem: 'lia',
        detalhes: {
          posicao: Number.isInteger(decisao.posicao) ? decisao.posicao : null,
          participantes: participantes.length,
          disponiveis: participantes.filter((p) => !p.pausado && !p.semPermissao && !p.noLimite).length,
          prazo_minutos: minutosValidos,
        },
      });

      res.json({
        success: true,
        data: {
          destino: decisao.destino,
          corretor_id: decisao.corretorId,
          motivo: decisao.motivo,
          tipo: decisao.tipo,
          prazo_ate: prazo ? prazo.toISOString() : null,
          posicao: Number.isInteger(decisao.posicao) ? decisao.posicao : null,
          // A Lia precisa saber se a consulta ficou registrada: sem extrato,
          // ninguém consegue auditar a decisão depois.
          registrado: gravou,
        },
      });
    } catch (e) {
      console.error('[distribuicao] erro ao decidir destino:', e?.code, e?.message);
      res.status(500).json({ success: false, error: 'não foi possível decidir o destino do lead' });
    }
  });

  /**
   * POST /api/v1/distribuicao/evento — a Lia conta o que fez.
   *
   * Sem isto o extrato teria só um lado: o que o Octo respondeu, e nunca o
   * que aconteceu de verdade.
   */
  app.post('/api/v1/distribuicao/evento', validateApiKey, async (req, res) => {
    const corpo = req.body || {};
    const PERMITIDOS = ['enviado', 'atendido', 'expirou', 'roleta', 'bolsao', 'manual'];

    if (!PERMITIDOS.includes(corpo.evento)) {
      return res.status(400).json({
        success: false,
        error: `evento inválido. Use um destes: ${PERMITIDOS.join(', ')}`,
      });
    }
    if (!corpo.motivo) {
      // Motivo é obrigatório porque a pergunta que o extrato existe para
      // responder é "por quê", não "o quê".
      return res.status(400).json({ success: false, error: 'motivo é obrigatório' });
    }

    const gravou = await dados.registrar({
      tenant_id: req.tenantId,
      lead_id: corpo.lead_id || null,
      lead_ref: corpo.lead_ref || null,
      evento: corpo.evento,
      corretor_id: corpo.corretor_id || null,
      motivo: String(corpo.motivo),
      tipo: corpo.tipo || null,
      prazo_ate: corpo.prazo_ate || null,
      origem: 'lia',
      detalhes: corpo.detalhes || null,
    });

    if (!gravou) return res.status(500).json({ success: false, error: 'não foi possível gravar o evento' });
    res.json({ success: true });
  });
}

export { MOTIVOS };
