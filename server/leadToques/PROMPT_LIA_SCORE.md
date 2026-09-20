# O que a Lia precisa reportar para o score do lead

**Para quem mexe na Lia (n8n).** Nada aqui muda o que a Lia já faz hoje: é
acrescentar um aviso ao Octo quando a conversa revela um destes sinais.

---

## Por que isto existe

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

## Como reportar

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

## Três coisas que importam

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

## O que NÃO fazer

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
