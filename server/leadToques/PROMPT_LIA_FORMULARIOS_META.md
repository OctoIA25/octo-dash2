# Formulários da Meta — duas colunas novas no lead

**Para quem mexe na Lia (servidor da Hostinger).** A captação da Meta deixou de
ser toda-ou-nada: agora cada formulário tem o seu interruptor, e o lead chega
dizendo o que o formulário dele mandava.

**Nada do que vocês fazem hoje quebra.** As colunas novas só aparecem em lead
vindo da Meta; em qualquer outro elas são nulas, e nulo significa "siga como
sempre".

---

## As duas colunas

| coluna em `leads` | o quê |
|---|---|
| `meta_captado` | `false` = o formulário estava com a **captação desligada**. **Não distribuam.** |
| `meta_lia_atende` | `false` = **não falem com este lead.** Ele vai direto para a fila do corretor |

Nulo nas duas = lead que não é da Meta, ou de antes deste item. Tratem como
`true`: é o comportamento de sempre.

---

## Por que o lead ainda entra, se a captação está desligada

Porque ele **já foi pago**. Descartar um lead de mídia paga para economizar uma
distribuição transforma desperdício de verba em desperdício de lead — e ninguém
percebe até o fim do mês.

Desligar a captação tira o lead da **roleta**, não da base. Ele fica lá,
marcado, e o gestor pode resgatá-lo à mão quando quiser.

---

## O histórico importado

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

## Campanha e anúncio, agora em coluna

`meta_form_id`, `meta_ad_id`, `meta_adset_id` e `meta_campaign_id` saíram do
`custom_fields` e viraram colunas. **O que vocês escrevem não muda**: continuem
mandando tudo dentro de `raw_data.meta`, como o webhook já faz. O banco promove
sozinho, por gatilho.

Uma observação medida em 21/09: dos 125 leads da Meta em produção, **56 não
tinham campanha nem conjunto** — são os anteriores a 12/09, quando esses campos
passaram a ser pedidos à Meta. O "Baixar leads" completa esses, sem duplicar
nada.

---

## Uma coisa que importa

**Não escrevam nas colunas `meta_*` direto.** Mandem no `raw_data.meta` e deixem
o gatilho promover. Ele só preenche o que está VAZIO — é isso que impede a
campanha recuperada pelo "Baixar leads" de ser apagada na escrita seguinte.
