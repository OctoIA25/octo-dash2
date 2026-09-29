# O que eu preciso de você — 28/09/2026

Tudo o que dependia só de mim está feito e no `main`. O que falta da campanha
depende de decisão ou material seu.

São **onze perguntas** e **nove entregas de material**. Nenhuma depende da
outra: pode responder fora de ordem, e cada resposta já destrava algo.

Ao lado de cada uma está **o que acontece quando você responder** — para você
julgar o que vale primeiro.

---

## Primeiro: as três de maior efeito

Se só der para fazer três coisas hoje, faça estas.

### 1. Comissão padrão das 21 construtoras

**O que mandar:** o percentual de comissão de cada construtora.

**Por que agora:** hoje às 20h50 nasceram **29 vendas** de proposta assinada,
somando R$ 14.457.183,34 de VGV. Todas com **comissão bruta R$ 0,00** — porque
as 21 construtoras estão com o percentual padrão vazio, 21 de 21.

O sistema faz isso de propósito: sem o percentual cadastrado ele **não chuta**.
Um número inventado viraria comissão errada com cara de certa, e essa comissão
vira dinheiro de corretor lá na frente.

**Quando você preencher:** as 29 calculam a comissão sozinhas. É a única coisa
da lista que transforma trabalho já pronto em dinheiro certo na tela.

> **Ressalva:** 12 das 29 não têm construtora nem lançamento casado — o nome do
> empreendimento na proposta não bateu com nenhum lançamento. Essas vão
> continuar sem comissão mesmo depois de você preencher os percentuais, e
> precisam ser ligadas uma a uma. Me diga se quer a lista.

### 2. A tabela de condições da Santa Ângela

**O que mandar:** a tabela de condições de pagamento dela, que vira o modelo
das outras.

**Por que agora:** é o **único item do plano inteiro sem código escrito**
(P2.2). Ele está parado desde 16/09 esperando isso. Sem ver o formato real eu
chutaria os campos, e o simulador hoje manda cadastrar numa tela que não
existe.

**Quando você mandar:** eu construo a tela e o simulador passa a servir.

### 3. A planilha de tipologias

**O que mandar:** a planilha atual de tipologias dos empreendimentos.

**Por que agora:** é a que mais destrava outros itens. Hoje são **zero**
tipologias cadastradas, e por isso o card do site não mostra "a partir de", e a
LIA não sabe responder metragem nem dormitórios.

**Quando você mandar:** eu confiro o mapeamento das colunas com você em cinco
empreendimentos antes de importar tudo — não importo às cegas.

---

## Decisões que travam meu trabalho

Estas não são material: são uma frase sua, e sem ela eu não avanço sem chutar.

### 4. A planilha de vendas que você mandou substitui ou soma?

Você mandou `143f1eXpufQPxwhTEv_GpDrGioU8jGM54`. A Dash espelha **outra**,
`1y_M-keBtpSnAp1syrfj_FzwUj5Q-hUEL` — a aba é a mesma (`gid 292051209`), o que
sugere que o arquivo foi copiado ou movido.

**A pergunta:** as 37 linhas que estão no ar devem ser **substituídas** pelo
conteúdo da sua planilha, ou ela **soma** a elas?

**Por que eu não decido:** isso mexe em R$ 14,4 milhões de VGV e nos repasses
dos corretores. Importar errado aqui não tem desfazer simples.

### 5. Por que a sincronização morreu em 01/09?

Ela rodava **de hora em hora**, lia 174 linhas e importava 37. O último lote foi
**01/09 às 19h32**. Desde então, nada — qualquer venda de setembro não está na
Dash.

**A pergunta:** você trocou o arquivo, mudou a permissão de acesso, ou não
mexeu em nada?

**Por que importa:** trocar o id sem descobrir a causa pode deixar tudo parado
de novo amanhã, e ninguém perceberia — foi assim que ficou 27 dias parado.

### 6. Recrutamento: dono fixo ou quem está com a atividade?

Você pediu que aparecesse "meu nome, **ou da pessoa que estiver com a atividade
de recrutamento**".

A primeira metade está feita: o simulador mostrava `4a58f324` e agora mostra
**Erick Ferrigatti**.

A segunda metade é **regra nova**. Hoje existe apenas *dono fixo* — uma pessoa
configurada, que é você. Não existe noção de "quem está com a atividade".

**A pergunta:** como isso funciona na prática? Reveza entre várias pessoas?
Segue quem tem uma atividade aberta no candidato? Tem horário?

**Por que eu não invento:** distribuição de lead é a regra que o senhor mais
revisou este mês. Chutar aqui é o tipo de coisa que só aparece errada quando um
lead se perde.

### 7. O período padrão da Conferência de vendas

A tela abre no mês corrente. Como a planilha parou em 01/09, ela nascia dizendo
"Nenhuma venda da planilha neste recorte" — com 37 vendas logo atrás.

**Já corrigi o texto:** agora ela diz *"Nenhuma no período escolhido. A planilha
tem 37 vendas, de janeiro de 2026 a agosto de 2026."*

**A pergunta que sobra:** a tela deve continuar abrindo no mês corrente, ou
passar a abrir no último mês com venda?

**Por que não decidi:** o texto honesto já resolve o engano. Mudar o que a tela
abre por padrão é decisão de produto — muda o que todo mundo vê todo dia.

### 8. As duas contas de gmail no cadastro da Lotus

`victorteste@gmail.com` e `btmamede@gmail.com` estão como corretores, e entraram
no time Prontos quando preenchi o time pela Atuação.

**A pergunta:** são pessoas de verdade? Se não, o certo é desativar as contas —
não deixá-las sem time.

**Por que importa:** elas entram em métricas de equipe e no eNPS. E `btmamede`
tem o sobrenome da líder de Prontos, o que pode estar dobrando a contagem dela.

### 9. A conta `Lia` cadastrada como corretora

`lia@octoia.org` está como corretor da Lotus, sem Atuação. É o robô.

**A pergunta:** ela deve sair da lista de corretores?

**Por que importa:** hoje ela é o único corretor sem time, e aparece em qualquer
contagem de "quantos corretores temos".

### 10. A Atuação "alugados" sem time correspondente

Existe a opção *alugados* na Atuação, mas não existe time com esse nome. Hoje só
um administrador a usa.

**A pergunta:** deve existir um time Alugados, ou a opção deve sair?

### 11. O tempo de espera do plantão da Lotus

A régua de "atrasada" está no padrão de **30 minutos** porque ninguém
configurou.

**O que medi:** a única casa com histórico confiável (Japi) tinha mediana de
**2h43**, e com régua de 30 min dois terços da tela ficariam vermelhos.

**A pergunta:** a régua é um **retrato** (perto da mediana real, e o vermelho
marca o que fugiu) ou uma **meta** (onde você quer chegar, aceitando muito
vermelho no começo)?

**Sugestão:** deixar em 30 até 11/10 e decidir com duas semanas de medição real
da Lotus. As primeiras dúvidas com tempo de espera verdadeiro chegaram ontem.

---

## Material que as telas esperam

Estas não têm pergunta: a tela está pronta, funcionando, e vazia. Falta o
conteúdo.

| # | Item | O que mandar | Onde |
|---|---|---|---|
| 12 | **Origens de lead** | A lista de origens e o de-para do texto que chega das integrações | **zero** cadastradas |
| 13 | **CNPJ e razão social** | Das 21 construtoras | zero preenchidos |
| 14 | **Plano de contas** | O do seu contador, para ajustar o padrão | zero |
| 15 | **Materiais de estudo** | Plano de carreira, regras de comissão, regimento | zero |
| 16 | **Texto do contrato do corretor** | O documento que eles vão aceitar no login | zero modelos |
| 17 | **Metas do mês** | Da casa e por equipe | 1 meta cadastrada |
| 18 | **OKRs e PDIs** | O primeiro ciclo | zero |
| 19 | **Verba de mídia** | Planejado por mês/campanha | zero |
| 20 | **Token da Meta** | Renovar — está vencido | integração desligada |

---

## Coisas que só o uso resolve

Não precisam de material nem decisão. Precisam de alguém fazer uma vez.

- **Passar uma demanda de marketing** de ponta a ponta (zero demandas)
- **Subir a primeira transcrição** de reunião (zero atas)
- **Ligar os pré-requisitos por etapa** (zero casas configuraram)
- **Aprovar os pesos do score** (zero casas com tabela própria — vale o padrão)

---

## Fora do meu alcance

**P4.6 · Nota fiscal e boleto.** Espera três contratações: certificado digital
A1, inscrição municipal de Jundiaí e conta ou gateway de pagamento com chave de
API. Mais os 14 CNPJs. A conciliação bancária já está pronta e funcionando.

**F.2 · LIA no WhatsApp do corretor.** Combinado para o fim da fila. Antes de
qualquer código, precisa da sua decisão e de uma conversa com o jurídico —
viola os Termos do WhatsApp e o risco é o banimento do número.

---

## O que está em andamento sem depender de ninguém

**P0.6 · Teste diário.** Você ligou a variável hoje. O primeiro disparo é às 6h
do relógio do servidor (~3h da manhã aqui). Amanhã eu confiro se rodou e te digo
o resultado.

Aviso desde já: **ele vai nascer vermelho nas oito casas com lead**, pela
checagem das colunas 100% vazias. Não é defeito novo — é a checagem funcionando
e mostrando um defeito antigo.
