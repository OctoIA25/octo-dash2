# A base de conhecimento dos empreendimentos — o que a Lia faz

**Para quem mexe na Lia (servidor da Hostinger).** Duas coisas: indexar os
documentos, e consultar a base antes de responder.

---

## A divisão, e por que ela existe

| Tipo de pergunta | Onde a resposta está |
|---|---|
| Preço, metragem, dormitórios, vagas, disponibilidade | **Consulta direta** — os campos do empreendimento e as tipologias |
| Tem varanda gourmet? Aceita pet? Qual o acabamento? O que diz o regulamento? | **Base de conhecimento** — este documento |

Preço e metragem **nunca** saem da base de conhecimento: um book de seis meses
atrás traria o preço de seis meses atrás, e a Lia citaria isso ao cliente como
se fosse de hoje. Esses vêm do banco, sempre.

---

## 1. Indexar

**O que a Dash não consegue fazer:** não há provedor de embeddings nela — a
única IA configurada é a Anthropic, que não tem essa API. E não há biblioteca
para extrair texto de PDF. Por isso a extração e o embedding ficam com vocês.

**A Dash já funciona sem isso.** A busca por palavra (português, com radical e
sem acento) responde desde o primeiro documento. O embedding a melhora — não é
pré-requisito para nada.

### O que falta indexar

```
GET /api/v1/kb/pendentes
```

Devolve os documentos com status `pendente`: `id`, `lancamento_id`, `titulo`,
`tipo`, e **`arquivo_url` ou `conteudo`**. Quando vem `arquivo_url`, é um PDF
no Storage, público e alcançável. Quando vem `conteudo`, o texto já está ali e
não precisa extrair nada.

### Mandar os trechos de volta

```
POST /api/v1/kb/documentos/{id}/trechos
{
  "trechos": [
    { "texto": "As unidades contam com varanda gourmet...", "embedding": [0.01, -0.23, ...] },
    { "texto": "O condomínio tem piscina aquecida...", "embedding": [...] }
  ]
}
```

- **`embedding` é opcional.** Sem ele o trecho ainda entra e ainda é achado
  pela busca por palavra. Mandem quando tiverem o provedor; até lá, mandem só
  o texto — já melhora muito sobre não ter nada.
- **Quebrem em ~800 caracteres, com sobreposição.** Trecho grande demais
  dilui a resposta; pequeno demais perde o contexto da frase.
- **Reindexar é refazer:** a rota apaga os trechos anteriores do documento
  antes de gravar. Mandar de novo não duplica.
- Até 500 trechos por documento, 4.000 caracteres por trecho.

A resposta diz `"busca": "significado"` ou `"palavra"` — é como vocês
conferem, na hora, se o embedding chegou mesmo.

### Quando falhar

```
POST /api/v1/kb/documentos/{id}/erro
{ "motivo": "PDF protegido por senha" }
```

O gestor vê o motivo na tela do empreendimento, ao lado do documento. Sem
isso, um documento que falhou fica "aguardando indexação" para sempre e
ninguém entende por quê.

---

## 2. Consultar antes de responder

Para pergunta que **não** é de preço nem metragem, consultem a base do
empreendimento em questão e **respondam só com base nos trechos devolvidos**.

A Dash filtra sozinha o que não pode ser usado: documento **inativo** e
documento **vencido** nunca voltam na busca. Vocês não precisam checar
validade — se voltou, pode usar.

**Sem trecho relevante, não invente.** Abram um plantão (a pergunta vai para o
corretor). Uma resposta inventada sobre acabamento ou regulamento chega ao
cliente com a autoridade da imobiliária, e é descoberta na visita.

---

## Três coisas que importam

**1. A Lia oferece todos os empreendimentos.** Não existe chave "pode
oferecer" — foi decisão explícita do plano.

**2. Um trecho por vez, do empreendimento certo.** A busca é sempre por
`lancamento_id`. Responder com o trecho de outro empreendimento é pior do que
não responder: o cliente recebe a informação de um prédio que não perguntou.

**3. Não escrevam trecho por outro caminho.** `kb_trechos` não aceita escrita
pelo navegador nem por usuário logado — só por esta rota, com a chave de
serviço. É o que garante que o trecho seja o que o documento diz, e não o que
alguém digitou.
