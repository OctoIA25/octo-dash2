# Dormitórios, metragem e preço — agora vêm do banco

**Para quem mexe na Lia.** Um campo novo na resposta que vocês já buscam, e uma
regra de como falar de preço.

---

## O que mudou

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

## O campo

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

### `null` e `[]` são coisas diferentes

- **`"tipologias": null`** — ninguém buscou, ou a consulta falhou. **Não digam
  que o empreendimento não tem tipologia**: vocês não sabem.
- **`"tipologias": []`** — buscou e não há nenhuma cadastrada. Aí sim vale
  dizer que ainda não há essa informação, e que o corretor confirma.

É a mesma regra do custo: *não informado ≠ zero*.

## A regra do preço

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

## O que NÃO vem, de propósito

- **Comissão.** Não vem no lançamento nem na tipologia, e não deve ser
  perguntada. É dado comercial interno.
- **Quantas unidades restam.** O campo existe no banco e **fica fora** do que
  vocês recebem. Estoque envelhece em horas, e "restam 2 unidades" dito ao
  cliente é uma promessa que a corretora não controla.

## Enquanto a tabela estiver vazia

Hoje quase nenhum lançamento tem tipologia cadastrada — elas entram pela tela
de cadastro, ou pela importação da planilha, que ainda depende de uma decisão
do Erick. Até lá, `tipologias` volta `[]` na maioria dos empreendimentos, e o
`valor_minimo` de sempre continua valendo.

**Podem ligar o uso do campo desde já:** ele nasce correto e vai se preenchendo
sozinho conforme o cadastro andar.
