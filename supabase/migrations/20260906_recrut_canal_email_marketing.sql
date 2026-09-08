-- =============================================================================
-- Canal "E-mail marketing" (mkt@lotusbrokers.com.br).
--
-- O formulário da tela já oferece "Email Marketing" como fonte, mas o enum
-- recrut_canal da spec não tem esse valor — as candidaturas vindas dali caíam
-- em 'outro' e sumiam da análise por canal, que é justamente o argumento do
-- diagnóstico para mudar onde a Lotus busca gente.
--
-- Adição ao enum da spec: nenhum valor existente muda. Vale confirmar com o
-- Erick na próxima conversa, já que o enum é dele.
--
-- ALTER TYPE ... ADD VALUE não pode ser usado na mesma transação em que é
-- criado; por isso este arquivo roda sozinho, sem nada depois dele.
-- =============================================================================

alter type public.recrut_canal add value if not exists 'email_marketing';
