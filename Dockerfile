# =============================================================================
# 🐳 DOCKERFILE OTIMIZADO PARA EASYPANEL - OCTO-CRM
# =============================================================================
# Multi-stage build para imagem Docker otimizada e rápida
# 
# Características:
# ✅ Build rápido com cache otimizado
# ✅ Health checks configurados corretamente
# ✅ Shutdown gracioso com dumb-init
# ✅ Logs detalhados para debug
# ✅ Imagem final ~250MB
# =============================================================================

# ====== ESTÁGIO 1: BUILD DA APLICAÇÃO ======
FROM node:20-alpine AS builder

# Metadados
LABEL maintainer="OctoIA25"
LABEL description="Octo-CRM - Dashboard Imobiliário (Build Stage)"
LABEL version="2.0.0"

# =============================================================================
# VARIÁVEIS DE AMBIENTE PARA BUILD (VITE)
# =============================================================================
# IMPORTANTE: Vite injeta variáveis VITE_* no bundle durante o build.
# Essas variáveis DEVEM ser passadas como build args no docker build:
#   docker build --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... .
# Ou definidas no EasyPanel como "Build Arguments"
# =============================================================================
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

# Converter ARGs em ENVs para o processo de build
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

# Instalar dependências do sistema
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++

WORKDIR /app

# Copiar apenas package.json primeiro (aproveitamento de cache)
COPY package.json ./

# Instalar dependências
RUN echo "📦 Installing dependencies..." && \
    npm cache clean --force && \
    npm install --silent --legacy-peer-deps && \
    echo "✅ Dependencies installed"

# Copiar código fonte
COPY . .

# Verificar se variáveis de ambiente estão definidas
RUN echo "🔍 Verificando variáveis de ambiente..." && \
    if [ -z "$VITE_SUPABASE_URL" ]; then \
      echo "❌ ERRO: VITE_SUPABASE_URL não definida!"; \
      exit 1; \
    else \
      echo "✅ VITE_SUPABASE_URL definida"; \
    fi && \
    if [ -z "$VITE_SUPABASE_ANON_KEY" ]; then \
      echo "❌ ERRO: VITE_SUPABASE_ANON_KEY não definida!"; \
      exit 1; \
    else \
      echo "✅ VITE_SUPABASE_ANON_KEY definida"; \
    fi && \
    if echo "$VITE_SUPABASE_ANON_KEY" | grep -q '^sb_'; then \
      echo "❌ ERRO: VITE_SUPABASE_ANON_KEY inválida (sb_*). Use a JWT legacy (eyJ...)."; \
      exit 1; \
    fi

# Build da aplicação
RUN echo "🔨 Building application..." && \
    npm run build && \
    echo "✅ Build completed" && \
    ls -lah dist/

# ====== ESTÁGIO 2: PRODUÇÃO COM NODE.JS + PROXY ======
FROM node:20-alpine

# Metadados
LABEL maintainer="OctoIA25"
LABEL description="Octo-CRM - Produção com Proxy Integrado"
LABEL version="2.0.0"

# Instalar ferramentas essenciais
RUN apk add --no-cache \
    curl \
    dumb-init \
    tini && \
    echo "✅ System tools installed"

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G nodejs -g nodejs nodejs

WORKDIR /app

# Copiar apenas arquivos necessários do builder
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/server ./server
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/public/temp_kenlo.xml ./public/temp_kenlo.xml

# Verificar se arquivos foram copiados corretamente
RUN echo "📂 Verificando arquivos copiados..." && \
    ls -lah && \
    ls -lah dist/ && \
    ls -lah server/ && \
    echo "✅ Arquivos verificados"

# NOTA: Mantemos root para usar porta 80
# EasyPanel gerencia segurança do container
# USER nodejs  # Comentado para permitir porta 80

# Expor porta 80 para EasyPanel
EXPOSE 80

# Variáveis de ambiente
ENV NODE_ENV=production \
    PORT=80 \
    NODE_OPTIONS="--max-old-space-size=512"

# Health check otimizado para EasyPanel (porta 80)
# IMPORTANTE: Configurações ajustadas para evitar SIGTERM prematuro
# - start-period: 60s = Tempo generoso para inicialização completa
# - interval: 30s = Verifica a cada 30 segundos (não muito agressivo)
# - timeout: 15s = Timeout generoso para resposta
# - retries: 5 = 5 tentativas antes de considerar falha
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:80/healthz || exit 1

# Inicialização com dumb-init (gerencia sinais SIGTERM corretamente)
# dumb-init garante que o Node.js receba os sinais de forma adequada
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/proxy-production.js"]
