-- Migration: Corrigir RLS de imoveis_corretores (isolamento por tenant)
-- Data: 2026-05-29
-- Descrição:
--   A tabela imoveis_corretores estava com policies permissivas (USING (true)),
--   ou seja, SEM isolamento por tenant no banco. Qualquer cliente autenticado
--   podia ler/gravar mapeamentos de imóveis de OUTROS tenants (vazamento visível
--   principalmente na aba "Meus Imóveis"). Esta migration substitui as policies
--   abertas por policies por tenant, espelhando o padrão de imoveis_locais.
--
--   Observação: o servidor Express usa a service_role key, que ignora RLS — os
--   endpoints REST continuam funcionando normalmente. Esta policy protege o
--   acesso via client autenticado (anon key + JWT do usuário), usado pelo frontend.

ALTER TABLE imoveis_corretores ENABLE ROW LEVEL SECURITY;

-- Remover policies permissivas antigas
DROP POLICY IF EXISTS "API pode buscar mapeamentos" ON imoveis_corretores;
DROP POLICY IF EXISTS "Tenants podem gerenciar seus mapeamentos" ON imoveis_corretores;

-- SELECT: membros do tenant (ou owner) veem os mapeamentos do tenant
CREATE POLICY "Membros podem ver mapeamentos do tenant" ON imoveis_corretores
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- INSERT: membros do tenant (ou owner) podem criar mapeamentos no próprio tenant
CREATE POLICY "Membros podem criar mapeamentos" ON imoveis_corretores
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- UPDATE: membros do tenant (ou owner) podem atualizar mapeamentos do tenant
CREATE POLICY "Membros podem atualizar mapeamentos do tenant" ON imoveis_corretores
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );

-- DELETE: membros do tenant (ou owner) podem deletar mapeamentos do tenant
CREATE POLICY "Membros podem deletar mapeamentos do tenant" ON imoveis_corretores
  FOR DELETE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_memberships WHERE user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'email') = 'octo.inteligenciaimobiliaria@gmail.com'
  );
