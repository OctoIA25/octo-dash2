# LIA — o que precisa mudar do lado dela

**Enviado em 25/09/2026.** São oito pedidos, e **todos já estão no ar em
produção** — conferido tabela por tabela, função por função, no banco de
produção, no dia do envio. Nada aqui depende de a Dash subir alguma coisa
depois.

Podem começar por qualquer um: eles não dependem entre si.

## O que é cada um, em uma linha

| # | Assunto | O que a Lia passa a fazer | Destrava |
|---|---|---|---|
| 1 | **Distribuição** | Perguntar ao Octo de quem é o lead, e contar o que fez | O extrato com os dois lados — hoje não há como responder "por que foi para o Fulano?" |
| 2 | **Score** | Mandar os sinais da conversa (pediu visita, renda, só pesquisando) | O score de 0 a 100 do lead, que hoje nasce sempre em 50 |
| 3 | **Base de conhecimento** | Indexar book e material por empreendimento | A Lia responder sobre o empreendimento sem inventar |
| 4 | **Plantão** | Mandar a pergunta que ela não soube responder para a fila | O corretor responder, e a resposta virar base |
| 5 | **Agenda** | Gravar "me chama amanhã às 16h" | A hora marcada com o cliente parar de se perder |
| 6 | **Tipologias** | Ler dormitórios, metragem e preço do banco | Parar de dizer metragem errada |
| 7 | **Formulários da Meta** | Gravar campanha, conjunto e anúncio no lead | O custo por lead e o ROI, que hoje não têm numerador |
| 8 | **Custo de IA** | Devolver o consumo de tokens de cada chamada | O custo por lead na Telemetria, hoje vazio |

## Duas coisas que valem para todos

**Se a rota do Octo cair ou demorar, a Lia segue com o que ela já faz hoje.**
Nenhum destes pedidos pode fazer a Lia parar de atender ou de distribuir.
São consultas e registros, não autorizações.

**Não mandem `tenant_id` no corpo.** Quem diz de qual imobiliária é a chamada
é a chave de API no cabeçalho.

---


## A Lia passa a perguntar de quem é o lead

**Para quem mexe na Lia (n8n).** Duas rotas novas, já no ar em produção. A
primeira responde *de quem é este lead*; a segunda registra *o que a Lia fez*.

**Nada aqui tira a distribuição da Lia.** Foi decidido assim em 19/09: a Lia
continua atribuindo o lead. O Octo só passa a ser consultado — ele responde e
guarda a resposta. A rota **não escreve em `leads`**, de propósito.

Por que isso existe: hoje a regra de quem recebe o quê está só dentro do n8n.
Quando alguém pergunta "por que este lead foi para o Fulano?", não há onde
olhar. Com estas duas rotas passa a haver um extrato com os dois lados — o que
o Octo respondeu e o que a Lia fez — e eles podem ser comparados.

---

### Como autenticar

```
Authorization: Bearer octo_...
```

É a chave de API da imobiliária (a mesma família de chave que já usam nas
rotas `/api/v1/leads`). Cada imobiliária tem a sua, e é ela que diz ao Octo de
qual casa é a pergunta — **não mandem `tenant_id` no corpo**.

Hoje há chave ativa para Lotus Brokers, Imobiliária Japi e mais três. Se a
chamada voltar `401`, peçam a chave ao Erick; ela se gera em
Configurações › Integrações.

---

### 1. Perguntar de quem é o lead

```
POST https://octodash-octo-dash.fltgo5.easypanel.host/api/v1/distribuicao/destino
Content-Type: application/json
Authorization: Bearer octo_...

{
  "lead_id":       "uuid do lead, se já existir",
  "lead_ref":      "qualquer referência sua, se ainda não houver lead",
  "codigo_imovel": "IM00123",
  "tipo_imovel":   "lancamento | terceiros | recrutamento | vendedores",
  "lia_passou":    true
}
```

Todos os campos são opcionais, mas **quanto menos vocês mandarem, mais genérica
é a resposta**. `codigo_imovel` é o que permite achar o captador; `tipo_imovel`
é o que permite respeitar o dono fixo.

`lia_passou: true` significa "a Lia já falou com este lead". É isso que faz o
cronômetro do bolsão começar a correr.

#### A resposta

```json
{
  "success": true,
  "data": {
    "destino":     "corretor",
    "corretor_id": "uuid",
    "motivo":      "roleta_em_ordem",
    "tipo":        "lancamento",
    "prazo_ate":   "2026-09-25T18:40:00.000Z",
    "posicao":     7,
    "registrado":  true
  }
}
```

**`destino` tem três valores, e os três importam:**

| valor | o que fazer |
|---|---|
| `corretor` | Atribuir ao `corretor_id`. O `prazo_ate` é até quando ele tem para atender. |
| `lia` | A Lia atende primeiro. Só depois o lead vai para alguém. |
| `ninguem` | **Não inventem corretor.** A fila inteira está indisponível — pausada, sem permissão ou no limite. Vocês decidem: segurar, avisar o gestor, ou mandar para o bolsão. |

**`registrado: false` quer dizer que a resposta não entrou no extrato.** A
decisão vale, mas ninguém vai conseguir auditá-la depois. Se aparecer muito,
nos avisem.

#### Os motivos que podem voltar

| motivo | quer dizer |
|---|---|
| `captador_do_imovel` | O imóvel tem captador e ele está disponível |
| `imovel_sem_captador` | O imóvel é de terceiros e não tem captador cadastrado |
| `captador_indisponivel` | Tem captador, mas ele está pausado / no limite |
| `atendido_pela_lia_primeiro` | A Lia atende antes de passar adiante |
| `roleta_em_ordem` | Rodízio normal — o `posicao` diz em que ponto da fila |
| `nenhum_corretor_disponivel` | Ninguém pode receber agora (vem com `destino: ninguem`) |
| `tipo_tem_dono_fixo` | Recrutamento e "vendedores" não entram no rodízio: têm dono configurado por casa |
| `tipo_sem_dono_configurado` | É um tipo de dono fixo, mas a casa ainda não disse quem é |

Os dois últimos são de 24/09. Na Lotus já estão configurados: recrutamento e
vendedores têm destinatário. Nas outras casas ainda não — lá esse tipo volta
`tipo_sem_dono_configurado`, e a Lia deve tratar como "não sei, segura".

---

### 2. Contar o que a Lia fez

```
POST .../api/v1/distribuicao/evento
Authorization: Bearer octo_...

{
  "evento":      "enviado",
  "motivo":      "corretor notificado no WhatsApp",
  "lead_id":     "uuid",
  "corretor_id": "uuid",
  "prazo_ate":   "2026-09-25T18:40:00.000Z",
  "detalhes":    { "qualquer": "coisa útil" }
}
```

`evento` só aceita: **`enviado`, `atendido`, `expirou`, `roleta`, `bolsao`,
`manual`**. Qualquer outro valor volta `400` com a lista.

**`motivo` é obrigatório e é texto livre.** A rota recusa sem ele de propósito:
a pergunta que o extrato existe para responder é *por quê*, não *o quê*. Um
extrato com "expirou" e nada mais não serve para ninguém.

#### Quando chamar

- **`enviado`** — assim que a Lia avisar o corretor.
- **`atendido`** — quando o corretor responder ao lead.
- **`expirou`** — quando o prazo vencer sem resposta.
- **`roleta`** / **`bolsao`** — quando a Lia repassar por um desses caminhos.
- **`manual`** — quando uma pessoa mexeu à mão e furou a regra. **Este é o mais
  importante dos seis**: é o único que mostra onde a regra não está sendo
  seguida, e é o que vai dizer se a regra precisa mudar.

---

### O que NÃO muda

- A Lia continua atribuindo. A rota não escreve em `leads`.
- Se a rota cair ou demorar, **a Lia deve seguir com a regra que ela já tem
  hoje**. Ela não pode parar de distribuir porque o Octo não respondeu — é
  consulta, não autorização.
- Nenhum campo novo nas tabelas da Lia.

### Como conferir que está funcionando

Depois de ligar, a aba **Bolsão › Distribuição** na Dash passa a mostrar o que
aconteceu nas últimas 24 h, atualizando sozinha. Se as consultas estiverem
chegando, elas aparecem lá com o motivo de cada uma. Se a tela seguir vazia,
alguma coisa não está chegando — e aí vale conferir o `registrado` da resposta.

---


## O que a Lia precisa reportar para o score do lead

**Para quem mexe na Lia (n8n).** Nada aqui muda o que a Lia já faz hoje: é
acrescentar um aviso ao Octo quando a conversa revela um destes sinais.

---

### Por que isto existe

O Octo passou a calcular um **score de 0 a 100** para cada lead, e a
temperatura (Frio / Morno / Quente) passou a sair desse número — antes eram
dois campos separados que podiam se contradizer.

A tabela de pontos foi validada pelo Erick em 20/09/2026 e está visível e
editável em **Configurações → Score do Lead**. O Octo calcula sozinho o que
ele consegue observar:

| Sinal | Pontos | Como o Octo sabe |
|---|---|---|
| Ponto de partida | 50 | todo lead começa aqui |
| Respondeu | +5 | há mensagem de entrada no WhatsApp |
| Respondeu em até 10 min (até 1 h: +5) | +10 | horário das mensagens |
| Disse o que procura | +10 | preferências marcadas no lead |
| Pediu visita ou aceitou agendar | +25 | visita na agenda do lead |
| Origem com boa conversão | até +10 | cadastro de origens |
| Conversou nos últimos 3 dias | +5 | última mensagem |
| Sem conversa há 7 dias ou mais | −15 | última mensagem |

**Quatro sinais o Octo não tem como saber.** Eles só aparecem na conversa, e
quem conversa é a Lia:

| Sinal | Pontos |
|---|---|
| Renda ou faixa de valor **compatível** com o imóvel | **+15** |
| Renda ou faixa de valor **incompatível** | **−10** |
| Pediu simulação ou condição de pagamento | **+10** |
| Disse que só está pesquisando, ou sem prazo | **−10** |

Enquanto a Lia não mandar, esses quatro valem **zero** — e a ficha do lead diz
quantos sinais foram observados, para ninguém confundir "50 porque não foi
avaliado" com "50 porque os sinais se anularam".

---

### Como reportar

Pela rota que a Lia **já usa** para reportar eventos:

```
POST /api/v1/lia/lead-events
```

Mesmo cabeçalho de serviço e mesma âncora de lead de sempre (`lead_id` ou
`lead_phone` — o servidor resolve dentro da imobiliária). Muda só o
`event_type`:

| Quando a conversa mostrar | `event_type` |
|---|---|
| A renda ou o valor que o lead declarou **cabe** no imóvel de interesse | `lia.sinal_renda_compativel` |
| A renda ou o valor **não cabe** | `lia.sinal_renda_incompativel` |
| O lead pediu simulação, parcela, entrada ou condição de pagamento | `lia.sinal_pediu_simulacao` |
| O lead disse que só está pesquisando, ou que não tem prazo | `lia.sinal_so_pesquisando` |
| O lead disse o que procura (tipo, bairro, dormitórios) | `lia.sinal_disse_o_que_procura` |

Exemplo:

```json
{
  "tenant_id": "<a imobiliária>",
  "lead_phone": "11999998888",
  "event_type": "lia.sinal_pediu_simulacao",
  "descricao": "Perguntou o valor da parcela para entrada de 20%",
  "ator_tipo": "lia"
}
```

A resposta devolve o lead e o corretor **como o Octo os enxerga**, para quem
integra conferir na hora se acertou o lead.

---

### Três coisas que importam

**1. Mandar uma vez basta.** O Octo pergunta "este sinal já apareceu alguma
vez?", não "quantas vezes". Repetir não soma pontos — e também não faz mal.

**2. `renda_compativel` e `renda_incompativel` são excludentes na prática.**
Se os dois chegarem, os dois entram na conta (+15 e −10), o que quase nunca é
o que se quer. Mande o que vale **agora**: se o lead antes não cabia e depois
passou a caber, mande o compatível — mas saiba que o incompatível continua
gravado no histórico, porque o extrato não apaga acontecimento.

**3. O score NÃO distribui lead.** Foi uma decisão explícita do Erick em
20/09/2026: no Aether, passar de 70 manda o lead ao corretor automaticamente;
aqui não. O score informa e ordena a lista. Quem decide de quem é o lead
continua sendo a regra da distribuição (`POST /api/v1/distribuicao/destino`).
Duas coisas decidindo a mesma entrega é como nasce "o lead sumiu do corretor e
ninguém sabe por quê".

---

### O que NÃO fazer

- **Não mande o score pronto.** Quem calcula é o Octo, com a tabela que o
  gestor vê e edita. Se a Lia mandasse um número, voltaria a caixa-preta que o
  plano mandou tirar — e ninguém conseguiria explicar por que um lead tem 32 e
  outro 94.
- **Não use os tipos antigos para isto.** `lia.qualificado` e
  `lia.handoff_corretor` contam outra coisa; reusá-los misturaria "a Lia passou
  o lead" com "o lead tem renda compatível".
- **Não invente tipos novos de `lia.sinal_*`.** Os cinco acima são os que o
  Octo lê. Um tipo desconhecido é gravado no extrato mas não pontua — e
  ninguém percebe que não pontuou.

---


## A base de conhecimento dos empreendimentos — o que a Lia faz

**Para quem mexe na Lia (servidor da Hostinger).** Duas coisas: indexar os
documentos, e consultar a base antes de responder.

---

### A divisão, e por que ela existe

| Tipo de pergunta | Onde a resposta está |
|---|---|
| Preço, metragem, dormitórios, vagas, disponibilidade | **Consulta direta** — os campos do empreendimento e as tipologias |
| Tem varanda gourmet? Aceita pet? Qual o acabamento? O que diz o regulamento? | **Base de conhecimento** — este documento |

Preço e metragem **nunca** saem da base de conhecimento: um book de seis meses
atrás traria o preço de seis meses atrás, e a Lia citaria isso ao cliente como
se fosse de hoje. Esses vêm do banco, sempre.

---

### 1. Indexar

**O que a Dash não consegue fazer:** não há provedor de embeddings nela — a
única IA configurada é a Anthropic, que não tem essa API. E não há biblioteca
para extrair texto de PDF. Por isso a extração e o embedding ficam com vocês.

**A Dash já funciona sem isso.** A busca por palavra (português, com radical e
sem acento) responde desde o primeiro documento. O embedding a melhora — não é
pré-requisito para nada.

#### O que falta indexar

```
GET /api/v1/kb/pendentes
```

Devolve os documentos com status `pendente`: `id`, `lancamento_id`, `titulo`,
`tipo`, e **`arquivo_url` ou `conteudo`**. Quando vem `arquivo_url`, é um PDF
no Storage, público e alcançável. Quando vem `conteudo`, o texto já está ali e
não precisa extrair nada.

#### Mandar os trechos de volta

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

#### Quando falhar

```
POST /api/v1/kb/documentos/{id}/erro
{ "motivo": "PDF protegido por senha" }
```

O gestor vê o motivo na tela do empreendimento, ao lado do documento. Sem
isso, um documento que falhou fica "aguardando indexação" para sempre e
ninguém entende por quê.

---

### 2. Consultar antes de responder

Para pergunta que **não** é de preço nem metragem, consultem a base do
empreendimento em questão e **respondam só com base nos trechos devolvidos**.

A Dash filtra sozinha o que não pode ser usado: documento **inativo** e
documento **vencido** nunca voltam na busca. Vocês não precisam checar
validade — se voltou, pode usar.

**Sem trecho relevante, não invente.** Abram um plantão (a pergunta vai para o
corretor). Uma resposta inventada sobre acabamento ou regulamento chega ao
cliente com a autoridade da imobiliária, e é descoberta na visita.

---

### Três coisas que importam

**1. A Lia oferece todos os empreendimentos.** Não existe chave "pode
oferecer" — foi decisão explícita do plano.

**2. Um trecho por vez, do empreendimento certo.** A busca é sempre por
`lancamento_id`. Responder com o trecho de outro empreendimento é pior do que
não responder: o cliente recebe a informação de um prédio que não perguntou.

**3. Não escrevam trecho por outro caminho.** `kb_trechos` não aceita escrita
pelo navegador nem por usuário logado — só por esta rota, com a chave de
serviço. É o que garante que o trecho seja o que o documento diz, e não o que
alguém digitou.

---


## O plantão — o que muda para a Lia

**Para quem mexe na Lia (servidor da Hostinger).** O plantão já funciona: são
1.540 perguntas gravadas entre 03/07 e 27/08, 1.498 respondidas. Nada do que
vocês fazem hoje precisa mudar para continuar funcionando. O que muda é que
agora existe uma tela — **LIA › Plantão** — e um ciclo de aprendizado.

---

### O que NÃO mudou

Nenhuma coluna foi renomeada. `criado_em`, `corretor_id`, `resposta_corretor` e
`status` continuam exatamente como estão, com os mesmos valores
(`pendente` / `respondida` / `expirada`).

Isso foi decisão explícita: renomear qualquer uma quebraria a escrita de vocês
**sem erro visível do nosso lado** — a fila simplesmente pararia de encher, e
levaria dias até alguém perceber.

---

### 1. Antes de abrir plantão, pergunte à base

Esta é a parte que reduz o plantão, e é o motivo de tudo o mais.

A base de conhecimento (ver `PROMPT_LIA_BASE_DE_CONHECIMENTO.md`) agora responde
**dois tipos** de pergunta:

```sql
-- pergunta sobre um empreendimento
select * from buscar_kb(<lancamento_id>, '<pergunta do cliente>', 5, <embedding>);

-- pergunta que não é de empreendimento nenhum (imóvel avulso, regra da casa)
select * from buscar_kb(null, '<pergunta do cliente>', 5, <embedding>, '<tenant_id>');
```

A primeira forma **já inclui** o conhecimento geral da imobiliária — não é
preciso chamar as duas.

**Conhecimento geral** é o que vale para qualquer imóvel: aceita pet, horário de
visita, como funciona a análise de cadastro, quem tem a chave. É justamente o
que mais aparece no plantão de vocês — visita e horário sozinhos são 28% das
1.540 perguntas.

Veio trecho relevante? Responda com ele e **não abra plantão**. Não veio? Abra,
como sempre.

---

### 2. Ao abrir, diga de qual empreendimento é (quando for de um)

Coluna nova, opcional:

| coluna | o quê |
|---|---|
| `empreendimento_id` | uuid de `lancamentos`, quando a pergunta é sobre um lançamento |

Deixem **nulo** quando a pergunta for sobre imóvel avulso — que é o caso de
todas as 1.540 de hoje. Nulo não é erro e não esconde a pergunta da tela: ela
aparece igual, só sem o nome do empreendimento ao lado.

Quando preenchida, a resposta aprovada entra na base **daquele** empreendimento
em vez de na base geral. É a única diferença.

---

### 3. Leiam a configuração do plantão

```sql
select espera_maxima_minutos, destino, plantonista_id
from tenant_plantao_config where tenant_id = '<tenant_id>';
```

Sem linha para a imobiliária, o padrão é **30 minutos** e **`corretor_do_lead`**.

| `destino` | quem deve receber |
|---|---|
| `corretor_do_lead` | o corretor que já atende aquele cliente |
| `lider_da_equipe` | o líder, que repassa |
| `plantonista` | sempre a pessoa em `plantonista_id` |

**Quem envia continua sendo vocês.** Isto é valor consultado, não regra que a
Dash executa — mesma divisão do P1.1: a Lia distribui, o Octo responde. Se
ignorarem a configuração, nada quebra; o gestor é que vai configurar uma coisa e
ver outra acontecer.

`espera_maxima_minutos` é a régua que pinta a fila de vermelho na tela. Usem
também para decidir a hora do lembrete (`nudge_count`), se quiserem — mas isso é
escolha de vocês.

---

### 4. Escrevam a resposta como resposta

Das 1.498 respondidas, **331 começam com `[resolvida fora do canal]`** — o
corretor falou direto com o cliente e o campo ficou só com o aviso.

A tela detecta essas e **não oferece salvá-las na base**, de propósito: salvar
uma ensinaria a Lia a responder "resolvida fora do canal" ao próximo cliente.
Mas isso significa que a resposta se perdeu — o corretor explicou algo ao
cliente e ninguém mais tem aquilo.

Quando der para recuperar o que o corretor disse, gravem em
`resposta_corretor`, mesmo que resumido. É o que vira conhecimento depois.

---

### 5. O ciclo, de ponta a ponta

```
cliente pergunta
   → Lia consulta a base (item 1)
        achou  → responde. fim.
        não achou → abre plantão, corretor responde
                       → gestor aprova na tela
                            → vira documento + trecho, buscável NA HORA
                                 → próximo cliente: a Lia acha e responde sozinha
```

O trecho entra já indexado **por palavra**, sem esperar vocês. Se depois
reindexarem o documento com embedding pela rota
`POST /api/v1/kb/documentos/{id}/trechos`, ele é substituído — reindexar é
refazer, não somar.

Os documentos nascidos de plantão têm `tipo = 'resposta_plantao'` e aparecem em
`GET /api/v1/kb/pendentes` **apenas se** vocês os marcarem como pendentes; por
padrão já saem indexados.

---

### Uma coisa que importa

**A resposta de plantão envelhece.** O gestor pode marcar validade ao salvar, e
documento vencido nunca volta na busca — a Dash filtra sozinha. Vocês não
precisam checar nada: se voltou, pode usar.

---


## A agenda — "me chama amanhã às 16h"

**Para quem mexe na Lia (servidor da Hostinger).** Quando o lead pede para ser
chamado numa hora, isso vira um retorno agendado que não se perde.

**Nada do que vocês fazem hoje muda.** Não há tabela nova: o retorno agendado é
uma linha de `lia_followups`, a mesma que vocês já escrevem pela rota
`POST /api/v1/lia/cadencias`. Criar uma segunda tabela daria dois disparadores,
e o cliente receberia a mensagem duas vezes.

---

### 1. A regra que não pode ser esquecida

Uma linha com **`pedido_por: "lead"`** NÃO pode ser cancelada quando o lead volta
a falar.

Hoje o cancelamento por `lead_returned` responde por **2.361 dos 2.421
cancelamentos**, e está certo para a cadência: a Lia ia cutucar quem sumiu, e ele
apareceu. Mas o retorno agendado é o contrário — **o pedido É o lead falando**.
Cancelá-lo por isso apagaria a ligação que ele acabou de pedir, e ninguém
descobriria: some em silêncio.

```
cancelar por lead_returned  →  somente quando pedido_por != 'lead'
```

Os outros cancelamentos continuam valendo para todos: o corretor assumiu, a Lia
encerrou, o gestor cancelou na Dash (`cancelled_reason = 'cancelado_na_dash'`).

---

### 2. Registrar o pedido

Mesma rota de sempre, com dois campos a mais:

```
POST /api/v1/lia/cadencias
{
  "tenant_id": "...",
  "lead_id": "...",
  "idempotency_key": "lia:retorno:<lead>:<quando>",
  "status": "pending",
  "scheduled_at": "2026-09-23T19:00:00Z",
  "motivo": "cliente pediu: me chama amanhã às 16h",
  "pedido_por": "lead",
  "channel": "whatsapp"
}
```

| campo | o quê |
|---|---|
| `pedido_por` | `lead`, `lia` ou `corretor`. **Ausente vale `lia`** — por isso tudo o que vocês mandam hoje continua igual |
| `erro` | por que o disparo falhou. Campo próprio, separado de `cancelled_reason` |

`pedido_por: "lead"` **exige** `scheduled_at`. Sem hora não é agendamento: é um
pedido que ninguém vai cumprir, e apareceria na tela como linha muda. A rota
recusa com `422 scheduled_at: required_when_pedido_por_lead`.

---

### 3. A resposta diz a hora de verdade

A imobiliária configura um **horário de não incomodar** (padrão: antes das 9h e
depois das 20h). Quando o lead pede fora dele, **a Dash empurra** para o primeiro
horário permitido e devolve qual é:

```json
{ "ok": true, "id": "...", "agendado_para": "2026-09-23T12:00:00Z", "ajustado": true }
```

- `ajustado: true` → **avisem o lead**: *"consigo te chamar às 9h, pode ser?"*.
  Sem isso vocês confirmam "te chamo às 3h" e a mensagem sai às 9h.
- `ajustado: false` → a hora pedida valeu; confirmem como ela veio.

Vocês não precisam ler a configuração nem fazer essa conta — ela é a mesma da
janela de atendimento e mora num lugar só.

---

### 4. Na hora de disparar

O workflow que já roda continua igual: pega `status = 'pending'` com
`scheduled_at <= agora`, envia, marca `sent` com `sent_at`, ou `expired` com o
motivo — agora em **`erro`**.

Duas diferenças para o retorno pedido pelo lead:

**1. Se o lead já está com um corretor, a Lia NÃO manda a mensagem.**
Decidido pelo chefe em 21/09/2026. Avisem o corretor que o cliente pediu retorno
agora, e deixem ele falar. O cliente não deve receber duas vozes diferentes na
mesma conversa. A tela já mostra isso ao gestor: *"Fulano é quem fala — a LIA só
avisa"*.

**2. Digam por que não saiu.** Das 84 linhas que não saíram, **48 não registram
motivo nenhum** — na tela elas aparecem como *"não saiu, e o disparador não disse
por quê"*, que é o melhor que dá para dizer com o dado que existe. Preencher
`erro` transforma isso em informação.

---

### 5. O que o gestor vê

**LIA › Agenda**, com cinco abas: Hoje · A cumprir · Pedidos pelo lead ·
Atrasados · Não saíram. E no card do lead, o corretor vê *"Retorno pedido pelo
cliente: amanhã 16h"*, podendo remarcar ou cancelar.

Quando o corretor marca um retorno à mão, a linha nasce com
`pedido_por: "corretor"` e `tag: "retorno_manual"` — é dela que vocês devem
partir se forem disparar esses também.

---

### Uma coisa que importa

**Remarcar é cancelar e criar.** Deixar a linha antiga pendente ao lado da nova
manda duas mensagens ao mesmo cliente com poucos minutos de diferença. A Dash já
faz assim (`cancelled_reason = 'rescheduled'`); façam igual do lado de vocês.

---


## Dormitórios, metragem e preço — agora vêm do banco

**Para quem mexe na Lia.** Um campo novo na resposta que vocês já buscam, e uma
regra de como falar de preço.

---

### O que mudou

`GET /api/v1/lancamentos/:id` passou a devolver **`tipologias`** e
**`aviso_valor_tipologias`**.

Isto conserta uma promessa que estava escrita e não era cumprida. O documento
da base de conhecimento diz, desde sempre:

> | Preço, metragem, dormitórios, vagas | **Consulta direta** — os campos do empreendimento e as tipologias |

Só que **esses campos não existiam no payload**. Metragem e dormitório não
saíam de lugar nenhum: a Lia respondia a partir do texto livre da descrição, ou
não respondia. Medido nos 59 lançamentos da Lotus, o que havia era isto:

```
dormitorios: "2 e 3 dorms" (13) · "Lotes" (10) · "Studio a 2 suítes" · "1 a 3 dorms"
specs:       "131 e 164"   — duas tipologias espremidas num campo só
preço:       30 dos 59 preenchidos
```

### O campo

```json
"tipologias": [
  {
    "nome": "2 dorms c/ suíte",
    "dormitorios": 2,
    "suites": 1,
    "banheiros": 2,
    "vagas": 1,
    "area_privativa_m2": 64,
    "preco_a_partir": 389000,
    "preco_atualizado_em": "2026-08-09",
    "disponivel": true,
    "planta_url": null,
    "observacao": null
  }
],
"aviso_valor_tipologias": "Estes são os valores iniciais de cada tipologia e podem variar conforme a unidade escolhida. Valores de 09/08. Sujeito a confirmação com o corretor."
```

#### `null` e `[]` são coisas diferentes

- **`"tipologias": null`** — ninguém buscou, ou a consulta falhou. **Não digam
  que o empreendimento não tem tipologia**: vocês não sabem.
- **`"tipologias": []`** — buscou e não há nenhuma cadastrada. Aí sim vale
  dizer que ainda não há essa informação, e que o corretor confirma.

É a mesma regra do custo: *não informado ≠ zero*.

### A regra do preço

**Repitam `aviso_valor_tipologias` sempre que citarem valor de tipologia.** Ele
já vem pronto, e já decide sozinho se leva a ressalva.

Três coisas que ele faz e que vale entender:

1. **Diz sempre "valores iniciais"**, nunca preço fechado.
2. **Cita a data.** Preço de lançamento envelhece, e cliente trata número dito
   por escrito como promessa.
3. **Acrescenta "sujeito a confirmação com o corretor" quando o preço passou de
   30 dias** — ou quando não há data nenhuma. "Não sabemos de quando é" é pior
   que "é de seis meses atrás".

A data usada é a **mais antiga** entre as tipologias disponíveis, não a mais
recente. Se uma foi reajustada ontem e outra há seis meses, o conjunto que
vocês vão citar tem seis meses — pegar a mais nova faria a ressalva sumir
justamente quando ela é mais necessária.

### O que NÃO vem, de propósito

- **Comissão.** Não vem no lançamento nem na tipologia, e não deve ser
  perguntada. É dado comercial interno.
- **Quantas unidades restam.** O campo existe no banco e **fica fora** do que
  vocês recebem. Estoque envelhece em horas, e "restam 2 unidades" dito ao
  cliente é uma promessa que a corretora não controla.

### Enquanto a tabela estiver vazia

Hoje quase nenhum lançamento tem tipologia cadastrada — elas entram pela tela
de cadastro, ou pela importação da planilha, que ainda depende de uma decisão
do Erick. Até lá, `tipologias` volta `[]` na maioria dos empreendimentos, e o
`valor_minimo` de sempre continua valendo.

**Podem ligar o uso do campo desde já:** ele nasce correto e vai se preenchendo
sozinho conforme o cadastro andar.

---


## Formulários da Meta — duas colunas novas no lead

**Para quem mexe na Lia (servidor da Hostinger).** A captação da Meta deixou de
ser toda-ou-nada: agora cada formulário tem o seu interruptor, e o lead chega
dizendo o que o formulário dele mandava.

**Nada do que vocês fazem hoje quebra.** As colunas novas só aparecem em lead
vindo da Meta; em qualquer outro elas são nulas, e nulo significa "siga como
sempre".

---

### As duas colunas

| coluna em `leads` | o quê |
|---|---|
| `meta_captado` | `false` = o formulário estava com a **captação desligada**. **Não distribuam.** |
| `meta_lia_atende` | `false` = **não falem com este lead.** Ele vai direto para a fila do corretor |

Nulo nas duas = lead que não é da Meta, ou de antes deste item. Tratem como
`true`: é o comportamento de sempre.

---

### Por que o lead ainda entra, se a captação está desligada

Porque ele **já foi pago**. Descartar um lead de mídia paga para economizar uma
distribuição transforma desperdício de verba em desperdício de lead — e ninguém
percebe até o fim do mês.

Desligar a captação tira o lead da **roleta**, não da base. Ele fica lá,
marcado, e o gestor pode resgatá-lo à mão quando quiser.

---

### O histórico importado

O botão "Baixar leads" traz o que a Meta guarda dos últimos 90 dias. Esses leads
entram com:

```
meta_lia_atende = false
raw_data.meta.importado_em = <quando foi importado>
```

**Nunca mandem mensagem para eles.** Alguém que preencheu o formulário há dois
meses receber *"oi, vi que você se interessou"* hoje é o tipo de coisa que
queima a imobiliária — e o cliente nem lembra do anúncio.

---

### Campanha e anúncio, agora em coluna

`meta_form_id`, `meta_ad_id`, `meta_adset_id` e `meta_campaign_id` saíram do
`custom_fields` e viraram colunas. **O que vocês escrevem não muda**: continuem
mandando tudo dentro de `raw_data.meta`, como o webhook já faz. O banco promove
sozinho, por gatilho.

Uma observação medida em 21/09: dos 125 leads da Meta em produção, **56 não
tinham campanha nem conjunto** — são os anteriores a 12/09, quando esses campos
passaram a ser pedidos à Meta. O "Baixar leads" completa esses, sem duplicar
nada.

---

### Uma coisa que importa

**Não escrevam nas colunas `meta_*` direto.** Mandem no `raw_data.meta` e deixem
o gatilho promover. Ele só preenche o que está VAZIO — é isso que impede a
campanha recuperada pelo "Baixar leads" de ser apagada na escrita seguinte.

---


## O custo da IA — uma linha a mais no que vocês já mandam

**Para quem mexe na Lia (servidor da Hostinger).** A Telemetria mostra
"custo —" desde sempre. A causa está medida: das **19 chamadas de IA
registradas** até 21/09, **nenhuma** trouxe modelo ou token.

A tubulação está pronta há meses — tabela, preço, cálculo e tela. Falta o
`usage` da resposta chegar até aqui.

---

### O que mandar

Na chamada que vocês já fazem, acrescentem o que o provedor devolveu:

```
POST /api/v1/agent-telemetry/events
{
  "tenant_id": "...",
  "agent_slug": "lia",
  "source": "n8n",
  "event_type": "execution",
  "status": "ok",

  "model": "claude-opus-5",         ← o modelo da RESPOSTA, não o pedido
  "provider": "anthropic",
  "input_tokens": 5000,
  "cached_tokens": 1200,
  "output_tokens": 800,

  "etapa": "abertura",              ← abertura | conversa | handoff | leitura_doc…
  "lead_id": "uuid do lead",
  "documento_id": "quando for leitura de documento"
}
```

| campo | por que importa |
|---|---|
| `model` | o preço é por modelo. **O da resposta**, não o pedido: o provedor resolve alias e cobra pelo resolvido |
| `input_tokens` / `output_tokens` | é a conta inteira |
| `cached_tokens` | **subconjunto** da entrada. O trecho cacheado custa menos, e sem ele o custo de conversa longa sai inflado |
| `etapa` | é o que responde "onde o dinheiro vai". Texto livre |
| `lead_id` | é o que permite o **custo por lead**, que é o número do plano |

Nada disso é obrigatório: o evento entra sem eles, como hoje. Só que sem eles
o custo continua "—".

---

### A regra que vale mais que o número

**Não mandem zero quando não souberem.** `input_tokens: 0` significa "esta
chamada não consumiu nada", e a tela soma isso como custo zero. "Não informado"
tem que chegar **ausente** — aí a Dash conta a chamada em *"sem uso reportado"*
e avisa o gestor de que o custo mostrado é parcial.

É a diferença entre a tela dizer *"a IA custou US$ 3"* e dizer *"a IA custou
US$ 3, mas 60% das chamadas não contaram — o real é maior"*.

---

### O preço

Os preços ficam em **Configurações › Preços de IA**, editáveis sem deploy.
Modelo que vocês usarem e não estiver lá aparece como **"sem preço
cadastrado"** e fica fora da soma — nunca vira estimativa.

**O `claude-opus-5` ainda NÃO está cadastrado.** O chefe confirmou em 23/09 que
é o modelo em uso. Não cadastrei o preço por conta própria: número de preço
entra em conta de dinheiro, e eu não tenho de onde confirmar o valor. Quem
tiver a página de preços do provedor à mão cadastra em um minuto, e a tela
marca quem conferiu e quando — preço sem conferência aparece como tal.

Se trocarem de modelo, avisem: é cadastrar uma linha.

---

### O interruptor

Existe agora `tenant_agente_config (tenant_id, agente, ativo)`, que só o owner
altera. **Quem obedece são vocês:** antes de chamar o provedor, confiram se o
agente está ativo. A Dash guarda a decisão e a mostra; ela não intercepta
chamada de ninguém — mesma divisão de sempre.

Agente sem linha na tabela está **ativo**.

---

### Uma coisa que importa

**A Lotus está em assinatura (Claude Max), não em cobrança por token.** Lá o
custo por token é uma *referência de consumo*, não o que foi pago — a tela diz
isso com essas palavras. O número continua valendo para comparar agentes e
etapas entre si, que é para o que ele serve.

---
