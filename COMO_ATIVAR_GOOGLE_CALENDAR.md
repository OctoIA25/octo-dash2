# 🚀 COMO ATIVAR A INTEGRAÇÃO GOOGLE CALENDAR

## ⚡ ATIVAÇÃO RÁPIDA (3 PASSOS)

### 1️⃣ EXECUTAR SQL NO SUPABASE (2 minutos)

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **SQL Editor** (ícone de banco de dados)
4. Clique em **New Query**
5. Cole o SQL abaixo:

```sql
-- Criar tabela de tokens
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT google_calendar_tokens_user_tenant_unique UNIQUE (user_id, tenant_id)
);

-- Índices
CREATE INDEX idx_google_calendar_tokens_user_id ON google_calendar_tokens(user_id);
CREATE INDEX idx_google_calendar_tokens_tenant_id ON google_calendar_tokens(tenant_id);
CREATE INDEX idx_google_calendar_tokens_expires_at ON google_calendar_tokens(expires_at);

-- RLS
ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários veem apenas seus tokens"
  ON google_calendar_tokens FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Usuários criam tokens para si mesmos"
  ON google_calendar_tokens FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuários atualizam apenas seus tokens"
  ON google_calendar_tokens FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Usuários deletam apenas seus tokens"
  ON google_calendar_tokens FOR DELETE USING (user_id = auth.uid());

-- Adicionar colunas na agenda_eventos
ALTER TABLE agenda_eventos 
ADD COLUMN IF NOT EXISTS google_event_id TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_synced BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_agenda_eventos_google_event_id 
  ON agenda_eventos(google_event_id) WHERE google_event_id IS NOT NULL;
```

6. Clique em **Run** (ou Ctrl+Enter)
7. Aguarde mensagem de sucesso ✅

---

### 2️⃣ CONFIGURAR GOOGLE CLOUD CONSOLE (3 minutos)

1. Acesse: https://console.cloud.google.com/
2. Selecione seu projeto (ou crie um novo)
3. No menu lateral, vá em **APIs & Services** > **Credentials**
4. Clique no **OAuth 2.0 Client ID** existente (ou crie um novo)
5. Em **Authorized redirect URIs**, adicione:

```
http://localhost:8080/oauth/google/callback
http://localhost:5173/oauth/google/callback
```

**Para produção, adicione também:**
```
https://seu-dominio.com/oauth/google/callback
```

6. Clique em **Save** (Salvar)
7. Aguarde alguns segundos para propagar

---

### 3️⃣ TESTAR NO SISTEMA (1 minuto)

1. Acesse o sistema: `http://localhost:8080` ou `http://localhost:5173`
2. Faça login
3. Vá em **Agenda** (menu lateral)
4. Na coluna direita, veja o card **"Google Calendar"**
5. Clique em **"Conectar Google Calendar"**
6. Popup abre → Selecione sua conta Google
7. Clique em **"Permitir"**
8. Popup fecha → Status muda para **"✅ Conectado"**
9. Crie um evento de teste
10. Abra o Google Calendar e verifique se o evento apareceu

---

## ✅ PRONTO! INTEGRAÇÃO ATIVA

Agora todos os eventos criados na agenda serão automaticamente sincronizados com o Google Calendar!

---

## 🎯 O QUE ACONTECE AGORA?

### Ao Criar Evento
```
Você cria evento na agenda
    ↓
Sistema salva no banco
    ↓
Sistema cria no Google Calendar
    ↓
Evento aparece em ambos os lugares ✅
```

### Ao Editar Evento
```
Você edita evento na agenda
    ↓
Sistema atualiza no banco
    ↓
Sistema atualiza no Google Calendar
    ↓
Mudanças refletidas em ambos ✅
```

### Ao Deletar Evento
```
Você deleta evento na agenda
    ↓
Sistema remove do banco
    ↓
Sistema remove do Google Calendar
    ↓
Evento sumiu de ambos ✅
```

---

## 🔄 SINCRONIZAR EVENTOS ANTIGOS

Se você já tinha eventos antes de conectar:

1. Conecte o Google Calendar
2. Clique em **"Sincronizar Agora"**
3. Aguarde alguns segundos
4. Toast mostra: "X eventos sincronizados"
5. Todos os eventos antigos agora estão no Google Calendar ✅

---

## 🎨 CORES DOS EVENTOS

Os eventos aparecem no Google Calendar com cores baseadas na prioridade:

- 🔴 **Alta** → Vermelho
- 🟡 **Média** → Amarelo
- 🟢 **Baixa** → Verde
- 🔵 **Sem prioridade** → Azul

---

## 🔐 SEGURANÇA MULTITENANT

✅ Cada usuário tem sua própria conexão
✅ Cada tenant (imobiliária) é isolado
✅ Tokens são criptografados no banco
✅ RLS garante que ninguém vê tokens de outros
✅ Renovação automática de tokens

---

## 🐛 PROBLEMAS COMUNS

### Popup não abre
**Causa**: Navegador bloqueou popup
**Solução**: Permita popups para o site nas configurações do navegador

### Erro "Redirect URI mismatch"
**Causa**: URL não configurada no Google Cloud Console
**Solução**: Adicione a URL correta (passo 2️⃣)

### Eventos não sincronizam
**Causa**: Não está conectado ou token expirou
**Solução**: 
1. Verifique se status é "Conectado"
2. Se não, clique em "Conectar" novamente
3. Se sim, clique em "Sincronizar Agora"

### Token expirado
**Causa**: Token do Google expirou
**Solução**: Sistema renova automaticamente. Se persistir, desconecte e reconecte.

---

## 📱 TESTANDO EM PRODUÇÃO

Quando subir para produção:

1. Adicione a URL de produção no Google Cloud Console:
   ```
   https://seu-dominio.com/oauth/google/callback
   ```

2. Teste a conexão em produção

3. Verifique se eventos sincronizam

4. Pronto! ✅

---

## 🎓 TREINAMENTO DA EQUIPE

### Para Corretores

**Como conectar:**
1. Vá em Agenda
2. Clique em "Conectar Google Calendar"
3. Autorize no popup
4. Pronto!

**Como usar:**
- Crie eventos normalmente na agenda
- Eles aparecem automaticamente no Google Calendar
- Você pode ver no celular, tablet, etc.

**Como desconectar:**
1. Clique em "Desconectar"
2. Confirme
3. Eventos param de sincronizar

### Para Administradores

**Monitoramento:**
- Veja quantos usuários conectaram no Supabase:
  ```sql
  SELECT COUNT(*) FROM google_calendar_tokens;
  ```

- Veja eventos sincronizados:
  ```sql
  SELECT COUNT(*) FROM agenda_eventos WHERE google_calendar_synced = true;
  ```

**Troubleshooting:**
- Logs no console do navegador (F12)
- Logs no Supabase (Logs > API)

---

## 📊 MÉTRICAS DE SUCESSO

Após ativar, monitore:

- ✅ Quantos usuários conectaram
- ✅ Quantos eventos foram sincronizados
- ✅ Taxa de erro (deve ser < 1%)
- ✅ Feedback dos usuários

---

## 🎉 BENEFÍCIOS

### Para Corretores
- 📱 Acessa agenda em qualquer lugar
- 🔔 Recebe notificações do Google
- 📅 Usa app favorito (Google Calendar)
- 🔄 Sincronização automática

### Para Empresa
- 📈 Maior adoção da agenda
- 💼 Profissionalismo
- 🎯 Melhor organização
- 🔗 Integração com Google Workspace

---

## 📞 SUPORTE

### Documentação
- `GOOGLE_CALENDAR_SETUP.md` - Setup completo
- `GOOGLE_CALENDAR_SUMMARY.md` - Resumo executivo
- `COMO_ATIVAR_GOOGLE_CALENDAR.md` - Este arquivo

### Contato
- Abra uma issue no GitHub
- Consulte os logs no console
- Verifique o Supabase

---

## ✅ CHECKLIST FINAL

- [ ] SQL executado no Supabase
- [ ] Redirect URI configurado no Google Cloud Console
- [ ] Testado em localhost
- [ ] Conexão funcionando
- [ ] Evento de teste criado e sincronizado
- [ ] Verificado no Google Calendar
- [ ] Equipe treinada
- [ ] Documentação lida

---

**🎉 PARABÉNS! INTEGRAÇÃO GOOGLE CALENDAR ATIVA!**

**Data**: 10/02/2026
**Status**: ✅ Pronto para uso
**Versão**: 1.0.0
