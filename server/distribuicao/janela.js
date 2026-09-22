/**
 * O relógio do atendimento só corre dentro do horário comercial.
 *
 * Decidido pelo chefe em **22/09/2026**: **9h às 20h, de segunda a SEXTA**.
 * Sábado e domingo o relógio fica PARADO — um lead que chega na sexta às 19h30
 * tem 30 minutos contados naquele dia e os outros 30 na SEGUNDA às 9h.
 *
 * ISTO SUBSTITUI A DECISÃO DE 19/09, que incluía o sábado. Perguntado
 * diretamente — "a janela das 9h às 20h vale para sábado e domingo?" —, a
 * resposta foi "não vale sábado e domingo".
 *
 * O exemplo que o plano dá, e que os testes cobrem: um lead que chega às
 * 19h30 com prazo de 1h fica com 30 minutos contados naquele dia, e os outros
 * 30 correm a partir das 9h do dia seguinte.
 *
 * TUDO em horário de Brasília. O banco guarda UTC, o corretor vive em
 * `America/Sao_Paulo`, e errar isso desloca o prazo em três horas — o que, num
 * prazo de uma hora, é a diferença entre certo e absurdo.
 *
 * Este módulo é PURO: recebe data e configuração, devolve data. Sem banco,
 * sem relógio do sistema, sem efeito colateral — é o que permite o simulador
 * (P1.2) usar exatamente a mesma regra que a distribuição.
 */

const FUSO = 'America/Sao_Paulo';

/** 0 = domingo … 6 = sábado, no fuso de Brasília. */
export function diaDaSemanaEmBrasilia(data) {
  const s = data.toLocaleDateString('en-US', { timeZone: FUSO, weekday: 'short' });
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(s);
}

/** Minutos desde a meia-noite, em Brasília. */
export function minutosDoDiaEmBrasilia(data) {
  const [h, m] = data
    .toLocaleTimeString('en-GB', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false })
    .split(':')
    .map(Number);
  return h * 60 + m;
}

/**
 * A janela padrão combinada: 9h–20h de segunda a sexta. Fim de semana parado.
 * Índice = dia da semana (0 = domingo).
 */
export const JANELA_PADRAO = [
  null,                        // domingo: relógio parado
  { inicio: 540, fim: 1200 },  // segunda  09:00–20:00
  { inicio: 540, fim: 1200 },  // terça
  { inicio: 540, fim: 1200 },  // quarta
  { inicio: 540, fim: 1200 },  // quinta
  { inicio: 540, fim: 1200 },  // sexta
  null,                        // sábado: relógio parado (decisão de 22/09)
];

const MINUTO = 60_000;

/**
 * Converte o `horario_funcionamento` do banco (por nome de dia, com "ativo",
 * "inicio" e "termino") para o formato acima. Objeto vazio ou ausente cai na
 * janela padrão — é o caso da Lotus hoje, que tem `{}` gravado.
 */
export function janelaDaConfiguracao(horarioFuncionamento) {
  const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  if (!horarioFuncionamento || typeof horarioFuncionamento !== 'object') return JANELA_PADRAO;
  if (Object.keys(horarioFuncionamento).length === 0) return JANELA_PADRAO;

  return dias.map((nome) => {
    const d = horarioFuncionamento[nome];
    if (!d || d.ativo === false) return null;
    const emMinutos = (hhmm, padrao) => {
      const [h, m] = String(hhmm ?? '').split(':').map(Number);
      return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : padrao;
    };
    const inicio = emMinutos(d.inicio, 540);
    const fim = emMinutos(d.termino, 1200);
    // Janela invertida ou vazia é configuração quebrada: o dia não conta, em
    // vez de produzir um prazo negativo.
    return fim > inicio ? { inicio, fim } : null;
  });
}

/**
 * O instante do próximo minuto ÚTIL a partir de `data` (ela mesma, se já é útil).
 *
 * Exportado porque a Agenda da LIA (P2.5) faz a mesma pergunta com outra janela:
 * "o lead pediu retorno às 3h da manhã — qual é o primeiro horário em que dá
 * para falar com ele?". Mesma conta, mesma virada de fuso, mesmo tratamento de
 * dia desligado. Reescrever daria duas respostas para a mesma pergunta.
 */
export function proximoMinutoUtil(data, janela) {
  let atual = data;
  // 14 dias é folga suficiente: só não termina se a janela inteira for nula,
  // e aí a função avisa em vez de rodar para sempre.
  for (let i = 0; i < 14 * 24 * 60; i += 1) {
    const dia = janela[diaDaSemanaEmBrasilia(atual)];
    if (dia) {
      const min = minutosDoDiaEmBrasilia(atual);
      if (min >= dia.inicio && min < dia.fim) return atual;
      if (min < dia.inicio) return new Date(atual.getTime() + (dia.inicio - min) * MINUTO);
    }
    // Passou do fim (ou o dia está desligado): pula para a meia-noite seguinte
    // e o laço reavalia.
    const min = minutosDoDiaEmBrasilia(atual);
    atual = new Date(atual.getTime() + (1440 - min) * MINUTO);
  }
  return null;
}

/**
 * O prazo final para atender um lead, contando SÓ os minutos dentro da janela.
 *
 * Devolve `null` quando a janela não tem nenhum dia ativo — configuração assim
 * não produz prazo, e inventar um seria pior do que dizer que não há.
 */
export function prazoDeAtendimento(chegada, minutos, janela = JANELA_PADRAO) {
  if (!(chegada instanceof Date) || Number.isNaN(chegada.getTime())) return null;
  if (!Number.isFinite(minutos) || minutos <= 0) return null;
  if (!janela.some(Boolean)) return null;

  let atual = proximoMinutoUtil(chegada, janela);
  if (!atual) return null;

  let restante = minutos;
  for (let volta = 0; volta < 60 && restante > 0; volta += 1) {
    const dia = janela[diaDaSemanaEmBrasilia(atual)];
    const min = minutosDoDiaEmBrasilia(atual);
    const disponivel = dia.fim - min;

    if (restante <= disponivel) return new Date(atual.getTime() + restante * MINUTO);

    restante -= disponivel;
    // Vai para o fim do expediente e procura o próximo minuto útil.
    const fimDoDia = new Date(atual.getTime() + disponivel * MINUTO);
    atual = proximoMinutoUtil(new Date(fimDoDia.getTime() + MINUTO), janela);
    if (!atual) return null;
  }
  return null;
}

/** Quantos minutos ÚTEIS já correram entre dois instantes. */
export function minutosUteisEntre(inicio, fim, janela = JANELA_PADRAO) {
  if (!(inicio instanceof Date) || !(fim instanceof Date)) return 0;
  if (fim <= inicio) return 0;

  let atual = proximoMinutoUtil(inicio, janela);
  let total = 0;
  for (let volta = 0; volta < 400 && atual && atual < fim; volta += 1) {
    const dia = janela[diaDaSemanaEmBrasilia(atual)];
    const min = minutosDoDiaEmBrasilia(atual);
    const fimDoExpediente = new Date(atual.getTime() + (dia.fim - min) * MINUTO);
    const ate = fimDoExpediente < fim ? fimDoExpediente : fim;
    total += Math.max(0, Math.round((ate.getTime() - atual.getTime()) / MINUTO));
    if (ate >= fim) break;
    atual = proximoMinutoUtil(new Date(fimDoExpediente.getTime() + MINUTO), janela);
  }
  return total;
}

/** O prazo padrão combinado com o chefe: 1 hora de expediente. */
export const PRAZO_PADRAO_MIN = 60;

/**
 * Quantos minutos o corretor tem, a partir da configuração da imobiliária.
 *
 * MORA AQUI, e não na rota, porque o simulador roda esta mesma função no
 * navegador. Com o ajuste dentro da rota, a tela mostraria um prazo e o
 * servidor responderia outro — a segunda verdade que este módulo existe para
 * não criar.
 *
 * O valor gravado na Lotus é 525.600 minutos: 365 dias, o jeito que a equipe
 * encontrou de dizer "nunca expira" numa tela sem a opção "desligado".
 * Tratado como prazo real, daria uma data no ano seguinte e o lead nunca
 * sairia de ninguém. Qualquer coisa fora de (0, 24h) cai no padrão.
 */
export function minutosDePrazo(config) {
  const m = Number(config?.tempo_expiracao_exclusivo);
  return Number.isFinite(m) && m > 0 && m < 24 * 60 ? m : PRAZO_PADRAO_MIN;
}

/** Os nomes de dia que o banco usa em `horario_funcionamento`, na ordem 0..6. */
export const DIAS_DA_CONFIGURACAO = [
  'domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado',
];

const doisDigitos = (n) => String(n).padStart(2, '0');
const paraHHMM = (min) => `${doisDigitos(Math.floor(min / 60))}:${doisDigitos(min % 60)}`;

/**
 * O caminho de volta: a janela vira o formato que a TELA edita e o banco grava.
 *
 * EXISTE PARA NÃO HAVER DOIS PADRÕES. A tela de Configurações do Bolsão tinha
 * um padrão próprio, escrito à mão — 9h às 18h, com SÁBADO ativo das 9h às 13h
 * — enquanto a regra usava 9h às 20h de segunda a sexta. Os dois discordavam,
 * e o jeito de descobrir era abrir a tela, salvar sem mudar nada, e ver o
 * prazo de atendimento mudar sozinho: o sábado voltava a contar.
 *
 * Agora a tela deriva daqui. Um padrão só, e quem quiser mudar muda num lugar.
 */
export function janelaParaConfiguracao(janela = JANELA_PADRAO) {
  const fora = {};
  DIAS_DA_CONFIGURACAO.forEach((nome, i) => {
    const d = janela[i];
    fora[nome] = d
      ? { ativo: true, inicio: paraHHMM(d.inicio), termino: paraHHMM(d.fim) }
      // Dia desligado guarda um horário plausível: se alguém religar o dia na
      // tela, o campo não abre vazio.
      : { ativo: false, inicio: '09:00', termino: '20:00' };
  });
  return fora;
}
