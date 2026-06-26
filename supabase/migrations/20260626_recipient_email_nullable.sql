-- ============================================================
-- MIGRATION: recipient_email aceita NULL em lead_recommendations
-- A coluna nasceu NOT NULL para o canal e-mail (20260615). O suporte a
-- WhatsApp (20260617) adicionou `recipient` genérico mas não afrouxou
-- `recipient_email` — então gravar o histórico de um envio WhatsApp (sem
-- e-mail) viola NOT NULL (erro 23502) e a auditoria do disparo falha.
-- WhatsApp usa `recipient` (telefone); `recipient_email` só faz sentido p/ e-mail.
-- ============================================================

ALTER TABLE public.lead_recommendations
  ALTER COLUMN recipient_email DROP NOT NULL;

COMMENT ON COLUMN public.lead_recommendations.recipient_email IS 'E-mail do destinatário (só canal email). NULL para WhatsApp — use recipient (telefone).';
