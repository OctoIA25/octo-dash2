-- =============================================================================
-- Categoria do contato nas conversas WhatsApp
--
-- Quem é a pessoa do outro lado: comprador, cliente vendedor (proprietário que
-- coloca o imóvel à venda), locação ou corretor (parceiro de outra imobiliária).
--
-- NÃO é `leads.classification` (lancamento/pronto/locacao), que diz o tipo de
-- NEGÓCIO. Vocabulários diferentes de propósito — misturar os dois obrigaria
-- 'comprador' a caber nas seções do Bolsão, onde ele não significa nada.
--
-- Preenchida à mão pelo corretor na tela do chat. NULL = sem categoria; a UI
-- mostra essas conversas em "Todas" e em "Sem categoria".
--
-- Sem índice: a lista de conversas já é carregada inteira por tenant e o filtro
-- acontece no cliente. Se um dia virar filtro no servidor, criar
-- (tenant_id, category).
--
-- Idempotente: pode ser reaplicada com segurança.
-- =============================================================================

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS category TEXT;

-- CHECK separado do ADD COLUMN para a migração continuar idempotente.
ALTER TABLE public.whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_category_check;
ALTER TABLE public.whatsapp_conversations
  ADD CONSTRAINT whatsapp_conversations_category_check
  CHECK (category IS NULL OR category IN ('comprador', 'vendedor', 'locacao', 'corretor'));

COMMENT ON COLUMN public.whatsapp_conversations.category IS
  'Categoria do contato: comprador | vendedor (cliente vendedor) | locacao | corretor. NULL = sem categoria. Definida manualmente no chat; não confundir com leads.classification (tipo de negócio).';
