/**
 * O plantão da LIA (P2.4): o relógio da espera e o agrupamento por tema.
 *
 * Funções puras. O relógio é calculado AQUI e não no banco porque ele precisa
 * andar sozinho na tela — mesma decisão do Painel de Distribuição (P1.3), que
 * recebe o instante e conta os minutos no navegador.
 */

/** Os temas saíram das 1.540 perguntas reais em produção, não de imaginação. */
export type Tema =
  | 'visita'
  | 'valor'
  | 'disponibilidade'
  | 'estrutura'
  | 'documentacao'
  | 'condominio'
  | 'localizacao'
  | 'pet'
  | 'contrato'
  | 'proprietario'
  | 'outros';

export const ROTULO_DO_TEMA: Record<Tema, string> = {
  visita: 'Visita e horário',
  valor: 'Valor e negociação',
  disponibilidade: 'Disponibilidade',
  estrutura: 'Estrutura do imóvel',
  documentacao: 'Documentação e cadastro',
  condominio: 'Condomínio e taxas',
  localizacao: 'Localização e endereço',
  pet: 'Pet',
  contrato: 'Contrato',
  proprietario: 'Proprietário',
  outros: 'Outros',
};

/** Sem acentos e em minúsculas, para "Endereço" e "endereco" caírem no mesmo tema. */
export function normalizar(texto: string): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Ordem importa: o mais específico primeiro. "Aceita pet?" é sobre pet, não
 * sobre contrato, ainda que a palavra "aceita" apareça nos dois.
 *
 * NÃO existe tema "chaves", e a ausência é deliberada.
 *
 * A palavra casava em 204 das 1.540 perguntas reais e virava o 3º maior tema.
 * Medido uma a uma: 135 eram o bairro **Eloy Chaves**, as outras o bairro
 * Almerinda Chaves e o portal **Chaves na Mão**. Nenhuma das amostras era sobre
 * uma chave. O que sobra de verdade — portaria e porteiro, 6 perguntas — é
 * acesso para a visita, e mora em `visita`.
 *
 * O casamento é por SUBSTRING, de propósito: medido contra as mesmas 1.540,
 * exigir palavra inteira mudaria 'pet' de 46 para 45 e 'area' de 52 para 49.
 * Complicar a regra por três perguntas não se paga.
 */
const REGRAS: Array<{ tema: Tema; palavras: string[] }> = [
  { tema: 'pet', palavras: ['pet', 'animal', 'cachorro', 'gato', 'bicho'] },
  { tema: 'visita', palavras: ['visita', 'visitar', 'horario', 'agendar', 'agendamento', 'remarcar', 'que horas', 'portaria', 'porteiro'] },
  { tema: 'documentacao', palavras: ['document', 'cadastro', 'ficha', 'fiador', 'comprovante', 'analise', 'aprovacao', 'cnh', 'rg ', 'renda', 'seguro fianca'] },
  { tema: 'condominio', palavras: ['condominio', 'iptu', 'taxa'] },
  { tema: 'contrato', palavras: ['contrato', 'multa', 'reajuste', 'rescis', 'prazo de', 'fianca'] },
  { tema: 'valor', palavras: ['valor', 'preco', 'quanto custa', 'aluguel', 'desconto', 'proposta', 'negoci', 'parcel', 'financi', 'entrada'] },
  { tema: 'disponibilidade', palavras: ['disponi', 'ocupad', 'alugad', 'vendid', 'livre', 'desocup', 'ainda esta'] },
  { tema: 'estrutura', palavras: ['dormitorio', 'quarto', 'suite', 'vaga', 'garagem', 'metragem', 'area', 'elevador', 'andar', 'varanda', 'quintal', 'piscina', 'mobiliad', 'armario', 'churrasq', 'planta', 'sacada'] },
  { tema: 'localizacao', palavras: ['localiz', 'endereco', 'bairro', 'onde fica', 'rua ', 'proximo', 'perto de', 'regiao'] },
  { tema: 'proprietario', palavras: ['proprietari', 'dono', 'locador', 'imobiliaria administra'] },
];

/** O tema de uma pergunta. Nunca nulo: o que não casa é "Outros", e Outros é informação. */
export function temaDaPergunta(pergunta: string, contexto?: string | null): Tema {
  const s = normalizar(`${pergunta || ''} ${contexto || ''}`);
  for (const regra of REGRAS) {
    if (regra.palavras.some((p) => s.includes(p))) return regra.tema;
  }
  return 'outros';
}

export interface PerguntaDoPlantao {
  id: string;
  pergunta: string;
  contexto: string | null;
  status: string;
  criado_em: string;
  respondida_em: string | null;
  resposta: string | null;
  nudges: number;
  lead_id: string | null;
  lead_nome: string | null;
  corretor_id: string | null;
  corretor_nome: string | null;
  corretor_email: string | null;
  empreendimento_id: string | null;
  empreendimento_nome: string | null;
  kb_documento_id: string | null;
  aprovada_para_base: boolean;
  aprovada_em: string | null;
  fora_do_canal: boolean;
}

export interface GrupoDeTema {
  tema: Tema;
  rotulo: string;
  total: number;
  /** Quantas já viraram conhecimento. O resto é o que a LIA ainda não sabe responder. */
  naBase: number;
  /** As que dá para ensinar: respondidas de verdade e ainda fora da base. */
  ensinaveis: PerguntaDoPlantao[];
}

/**
 * Agrupa por tema, do mais perguntado ao menos.
 *
 * O que interessa ao gestor não é o total do tema — é quanto daquele tema a LIA
 * ainda precisa perguntar ao corretor. Por isso `ensinaveis` exclui as que já
 * estão na base e as "[resolvida fora do canal]": estas últimas não têm resposta
 * de verdade, só o aviso de que o corretor falou direto com o cliente. Salvar
 * uma delas ensinaria a LIA a responder "resolvida fora do canal".
 */
export function agruparPorTema(perguntas: PerguntaDoPlantao[]): GrupoDeTema[] {
  const mapa = new Map<Tema, GrupoDeTema>();
  for (const p of perguntas) {
    const tema = temaDaPergunta(p.pergunta, p.contexto);
    let g = mapa.get(tema);
    if (!g) {
      g = { tema, rotulo: ROTULO_DO_TEMA[tema], total: 0, naBase: 0, ensinaveis: [] };
      mapa.set(tema, g);
    }
    g.total += 1;
    if (p.aprovada_para_base) g.naBase += 1;
    else if (p.status === 'respondida' && !p.fora_do_canal && p.resposta) g.ensinaveis.push(p);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo));
}

export interface Espera {
  minutos: number;
  texto: string;
  estourou: boolean;
  classe: string;
}

/** "há 12 min", "há 3h20", "há 5 dias". Minuto a minuto só enquanto é minuto. */
export function textoDaEspera(minutos: number): string {
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} min`;
  if (minutos < 60 * 48) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m === 0 ? `há ${h}h` : `há ${h}h${String(m).padStart(2, '0')}`;
  }
  return `há ${Math.floor(minutos / 1440)} dias`;
}

/**
 * Quanto tempo a pergunta está esperando, e se passou da régua da imobiliária.
 *
 * Devolve null quando a data não presta — data inválida vira "há 20.000 dias"
 * em vermelho, e um alarme falso desses faz o gestor parar de olhar a tela.
 */
export function esperaDe(
  criadoEm: string | null | undefined,
  esperaMaximaMinutos: number,
  agora: number = Date.now()
): Espera | null {
  if (!criadoEm) return null;
  const t = Date.parse(criadoEm);
  if (!Number.isFinite(t)) return null;
  const minutos = Math.max(0, Math.round((agora - t) / 60000));
  const estourou = minutos > esperaMaximaMinutos;
  return {
    minutos,
    texto: textoDaEspera(minutos),
    estourou,
    classe: estourou
      ? 'text-rose-600 dark:text-rose-400'
      : minutos >= esperaMaximaMinutos * 0.75
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-slate-500 dark:text-slate-400',
  };
}

/** Quanto o corretor levou para responder. Null quando ainda não respondeu. */
export function tempoDeResposta(p: PerguntaDoPlantao): string | null {
  if (!p.respondida_em || !p.criado_em) return null;
  const ini = Date.parse(p.criado_em);
  const fim = Date.parse(p.respondida_em);
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) return null;
  return textoDaEspera(Math.round((fim - ini) / 60000)).replace('há ', 'em ');
}

/** O nome do corretor, com o e-mail como segunda opção — UUID nunca. */
export function quemRecebeu(p: PerguntaDoPlantao): string {
  return p.corretor_nome?.trim() || p.corretor_email?.trim() || 'sem corretor definido';
}
