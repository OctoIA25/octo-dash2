-- Adiciona colunas para registrar o que o endpoint (Lia/n8n) respondeu ao webhook.
-- response_status: código HTTP retornado pelo destino (ex: 200, 404, 500).
-- response_body: primeiros 1000 chars do corpo da resposta, para diagnóstico sem estourar storage.
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS response_status INTEGER;
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS response_body TEXT;
