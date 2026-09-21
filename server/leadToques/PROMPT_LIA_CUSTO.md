# O custo da IA — uma linha a mais no que vocês já mandam

**Para quem mexe na Lia (servidor da Hostinger).** A Telemetria mostra
"custo —" desde sempre. A causa está medida: das **19 chamadas de IA
registradas** até 21/09, **nenhuma** trouxe modelo ou token.

A tubulação está pronta há meses — tabela, preço, cálculo e tela. Falta o
`usage` da resposta chegar até aqui.

---

## O que mandar

Na chamada que vocês já fazem, acrescentem o que o provedor devolveu:

```
POST /api/v1/agent-telemetry/events
{
  "tenant_id": "...",
  "agent_slug": "lia",
  "source": "n8n",
  "event_type": "execution",
  "status": "ok",

  "model": "claude-sonnet-4-5",     ← o modelo da RESPOSTA, não o pedido
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

## A regra que vale mais que o número

**Não mandem zero quando não souberem.** `input_tokens: 0` significa "esta
chamada não consumiu nada", e a tela soma isso como custo zero. "Não informado"
tem que chegar **ausente** — aí a Dash conta a chamada em *"sem uso reportado"*
e avisa o gestor de que o custo mostrado é parcial.

É a diferença entre a tela dizer *"a IA custou US$ 3"* e dizer *"a IA custou
US$ 3, mas 60% das chamadas não contaram — o real é maior"*.

---

## O preço

Os preços ficam em **Configurações › Preços de IA**, editáveis sem deploy.
Modelo que vocês usarem e não estiver lá aparece como **"sem preço
cadastrado"** e fica fora da soma — nunca vira estimativa.

Se trocarem de modelo, avisem: é cadastrar uma linha.

---

## O interruptor

Existe agora `tenant_agente_config (tenant_id, agente, ativo)`, que só o owner
altera. **Quem obedece são vocês:** antes de chamar o provedor, confiram se o
agente está ativo. A Dash guarda a decisão e a mostra; ela não intercepta
chamada de ninguém — mesma divisão de sempre.

Agente sem linha na tabela está **ativo**.

---

## Uma coisa que importa

**A Lotus está em assinatura (Claude Max), não em cobrança por token.** Lá o
custo por token é uma *referência de consumo*, não o que foi pago — a tela diz
isso com essas palavras. O número continua valendo para comparar agentes e
etapas entre si, que é para o que ele serve.
