# O que eu preciso de você — atualizado em 29/09

**3 materiais, 4 decisões, 8 entregas.** Pode responder fora de ordem.

> **Já respondidas, saíram daqui:** régua do plantão (30 min, salva) · metas do
> mês (15 na Lotus) · período da Conferência (mês corrente) · conta `Lia`
> (fica) · Atuação "alugados" (fica, sem time) · `btmamede` (pessoa de
> verdade). A meta de teste foi apagada.
>
> Do `victorteste` você disse "pode apagar se necessário". **Não apaguei** —
> apagar conta nesta base já causou estrago antes. Se quiser, eu só **tiro do
> time**: resolve a poluição nas métricas e é reversível.

---

## Primeiro: as três de maior efeito

### 1. Comissão padrão das 21 construtoras

**O que mandar:** o percentual de comissão de cada construtora.

**Por que agora:** nasceram **29 vendas** de proposta assinada, somando
R$ 14.457.183,34 de VGV. Todas com **comissão bruta R$ 0,00** — porque as 21
construtoras estão com o percentual padrão vazio, 21 de 21.

O sistema faz isso de propósito: sem o percentual cadastrado ele **não chuta**.
Um número inventado viraria comissão errada com cara de certa, e essa comissão
vira dinheiro de corretor lá na frente.

**Quando você preencher:** as 29 calculam a comissão sozinhas. É a única coisa
da lista que transforma trabalho já pronto em dinheiro certo na tela.

> **Ressalva:** 12 das 29 não têm construtora nem lançamento casado — o nome do
> empreendimento na proposta não bateu com nenhum lançamento. Essas vão
> continuar sem comissão mesmo depois de você preencher os percentuais, e
> precisam ser ligadas uma a uma. Me diga se quer a lista.

### 2. A tabela de condições da Santa Ângela — chegou; faltam três respostas

**Atualizado em 29/09.** A tabela chegou: `TABELA RESERVA CASTANHEIRA SET26.xlsx`
(Reserva Castanheira, loteamento da Santa Ângela). Refiz a conta dela e bate
no centavo. Com ela na mão, a pergunta "o simulador está alinhado?" tem
resposta: **não está**.

**Como a tabela calcula** (exemplo da própria planilha: lote Q22, 348,10 m²,
tabela R$ 601.233,96):

1. **Preço do lote** = área × R$/m² — o R$/m² muda por faixa de tamanho
   (R$ 1.612 a R$ 1.842).
2. **O parcelado parte de 90% da tabela** — R$ 541.110,56. **À vista é 80%**
   — R$ 480.987,17.
3. **Entrada de 10%** — R$ 54.111,06.
4. **9 intermediárias anuais de R$ 30.000**, abatidas pelo **valor presente**
   a 0,9% a.m. — entram como R$ 163.869,52, e não R$ 270.000.
5. **Saldo** (R$ 323.129,99) financiado **direto com a construtora**: **120×,
   tabela Price 0,9% a.m. = R$ 4.414,61**.

**Onde o simulador não acompanha:**

| | a tabela | o simulador hoje |
|---|---|---|
| Valor da unidade | área × R$/m², por lote | só pelo "a partir de" da tipologia — não há como digitar, e há zero tipologias cadastradas |
| Preço do parcelado | 90% da tabela | não existe desconto de parcelado |
| Desconto à vista | 20% | o campo existe, mas o motor nunca o aplica |
| Intermediárias | pelo valor presente | pelo valor nominal — o motor acusa "passa do valor da unidade" |
| Parcela Price 0,9% × 120 | R$ 4.414,61 | **R$ 4.414,61** ✓ — a fórmula bate, mas só com o saldo calculado à mão |
| Condição cadastrada | — | nenhuma em produção |

A conta da parcela está certa. O que não serve é o **modelo**: o simulador foi
desenhado para **apartamento na planta** (mensais até as chaves e financiamento
do banco na entrega), e a Santa Ângela vende **lote com financiamento direto**.

**As três perguntas** — sem elas eu estaria inventando regra de construtora:

1. **Os 90% do parcelado** são desconto de campanha de setembro ("SET26") ou
   regra fixa da tabela?
2. **Em que mês vence a primeira intermediária?** A planilha diz *"início em
   DEZ/26"* (e *"mês do 1º vencimento: 3"*), mas a conta do valor presente usa
   os meses **12, 24… 108**. Não é detalhe: com a primeira em dezembro/26 o
   valor presente sobe para R$ 177.630,96 e a parcela **cai de R$ 4.414,61
   para cerca de R$ 4.226,60**. Qual das duas é a certa?
3. **A regra vale só para os loteamentos** da Santa Ângela, ou para os **15
   empreendimentos** dela?

**Quando você responder:** o simulador ganha o valor por lote, o modo
"financiamento direto com a construtora" (percentual do parcelado, entrada,
intermediárias a valor presente, saldo em Price), passa a aplicar o desconto à
vista, e eu cadastro a condição da Santa Ângela.

### 3. A planilha de tipologias

**O que mandar:** a planilha atual de tipologias dos empreendimentos.

**Por que agora:** é a que mais destrava outros itens. Hoje são **zero**
tipologias cadastradas, e por isso o card do site não mostra "a partir de", e a
LIA não sabe responder metragem nem dormitórios.

**Quando você mandar:** eu confiro o mapeamento das colunas com você em cinco
empreendimentos antes de importar tudo — não importo às cegas.

---

## Decisões

### 4. A planilha de vendas — a sua resposta mudou de sentido depois que eu medi

Você disse **"use a que eu enviei"**. Fui comparar as duas antes de trocar, e o
resultado inverte o pedido:

| | antiga (no ar) | a que você mandou |
|---|---|---|
| cabeçalho | 25 colunas | **idêntico** |
| linhas com conteúdo | 66 | 65 |
| linhas iguais às da outra | — | **46** |
| linhas só nela | **1** | **0** |
| vendas em setembro | **0** | **0** |

**A sua planilha não traz venda nova.** É a antiga menos uma linha: *AR Holding
· Lote 9 Quadra O / Lote 10 Quadra P*.

Trocar agora faria uma coisa só: **sumir com essa venda da Conferência.**

**As perguntas:**

1. **A linha da AR Holding saiu de propósito?**
2. **As vendas de setembro existem em algum lugar?** Nenhuma das duas planilhas
   tem uma sequer. Se a casa vendeu em setembro, o problema é a planilha não
   estar sendo alimentada — não a Dash.

### 5. Quem chamava a sincronização de hora em hora?

**Não é permissão** — testei: as duas planilhas estão públicas e respondem 200.
A antiga nunca perdeu acesso.

É a função `sync-commercial-sales-google-sheet`, e ela **parou de ser chamada**
em 01/09 às 19h32. Não é `pg_cron` (só há três tarefas lá, nenhuma dessas). É
agendamento externo — painel do Supabase ou n8n.

**A pergunta:** onde isso foi configurado? Com o lugar, eu sigo dali.

### 6. Recrutamento: dono fixo ou quem está com a atividade?

Você pediu que aparecesse "meu nome, **ou da pessoa que estiver com a atividade
de recrutamento**".

A primeira metade está feita: o simulador mostrava `4a58f324` e agora mostra
**Erick Ferrigatti**.

A segunda metade é **regra nova**. Hoje existe apenas *dono fixo* — uma pessoa
configurada, que é você.

**A pergunta:** como funciona na prática? Reveza entre várias pessoas? Segue
quem tem uma atividade aberta no candidato? Tem horário?

### 7. O que fazer com as 4 colunas vazias que reprovam o teste diário

O P0.6 rodou hoje às 6h e **reprovou nas 5 casas com operação**, sempre pela
mesma checagem: `final_sale_value`, `property_value`, `property_type` e
`visit_date` estão 100% vazias. As outras quatro checagens passaram em todas.

**A pergunta:** essas colunas passam a ser preenchidas, ou saem da lista de
vigiadas com o motivo escrito?

**Por que decidir:** sem isso o card fica vermelho todo dia e em duas semanas
ninguém olha mais — e aí ele para de servir justamente quando aparecer um
problema de verdade.

---

## Material que as telas esperam

| Item | Hoje |
|---|---|
| Origens de lead + de-para das integrações | **0** |
| CNPJ e razão social das construtoras | 0 de 21 |
| Plano de contas do contador | 0 |
| Plano de carreira, regras de comissão, regimento | 0 |
| Texto do contrato do corretor | 0 modelos |
| OKRs e PDIs | 0 |
| Verba de mídia | 0 |
| Token da Meta (renovar) | vencido |

## Só falta alguém fazer uma vez

Passar uma demanda de marketing de ponta a ponta · subir a primeira
transcrição de reunião · ligar os pré-requisitos por etapa · aprovar os pesos
do score · **abrir a tela de Metas uma vez**, para o realizado sincronizar.

## Fora do meu alcance

**P4.6 · Nota fiscal e boleto.** Certificado digital A1, inscrição municipal de
Jundiaí, conta ou gateway de pagamento e os 14 CNPJs. A conciliação bancária já
está pronta e funcionando.

**F.2 · LIA no WhatsApp do corretor.** Sua decisão + jurídico. Viola os Termos
do WhatsApp; o risco é o banimento do número.

---

### Uma ressalva que continua

**7 propostas assinadas ficaram de fora** da importação (36 assinadas, 29
vendas). Pelo código são as sem valor, e a aba CRM deve listá-las com o motivo.
