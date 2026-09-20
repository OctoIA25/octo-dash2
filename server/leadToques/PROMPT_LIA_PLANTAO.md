# O plantão — o que muda para a Lia

**Para quem mexe na Lia (servidor da Hostinger).** O plantão já funciona: são
1.540 perguntas gravadas entre 03/07 e 27/08, 1.498 respondidas. Nada do que
vocês fazem hoje precisa mudar para continuar funcionando. O que muda é que
agora existe uma tela — **LIA › Plantão** — e um ciclo de aprendizado.

---

## O que NÃO mudou

Nenhuma coluna foi renomeada. `criado_em`, `corretor_id`, `resposta_corretor` e
`status` continuam exatamente como estão, com os mesmos valores
(`pendente` / `respondida` / `expirada`).

Isso foi decisão explícita: renomear qualquer uma quebraria a escrita de vocês
**sem erro visível do nosso lado** — a fila simplesmente pararia de encher, e
levaria dias até alguém perceber.

---

## 1. Antes de abrir plantão, pergunte à base

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

## 2. Ao abrir, diga de qual empreendimento é (quando for de um)

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

## 3. Leiam a configuração do plantão

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

## 4. Escrevam a resposta como resposta

Das 1.498 respondidas, **331 começam com `[resolvida fora do canal]`** — o
corretor falou direto com o cliente e o campo ficou só com o aviso.

A tela detecta essas e **não oferece salvá-las na base**, de propósito: salvar
uma ensinaria a Lia a responder "resolvida fora do canal" ao próximo cliente.
Mas isso significa que a resposta se perdeu — o corretor explicou algo ao
cliente e ninguém mais tem aquilo.

Quando der para recuperar o que o corretor disse, gravem em
`resposta_corretor`, mesmo que resumido. É o que vira conhecimento depois.

---

## 5. O ciclo, de ponta a ponta

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

## Uma coisa que importa

**A resposta de plantão envelhece.** O gestor pode marcar validade ao salvar, e
documento vencido nunca volta na busca — a Dash filtra sozinha. Vocês não
precisam checar nada: se voltou, pode usar.
