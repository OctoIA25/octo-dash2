# =============================================================================
# 🐳 DOCKERFILE — OCTO-DASH CRM (EasyPanel / Docker)
# =============================================================================
# Multi-stage build:
#   1. builder: instala deps do frontend + server, roda vite build
#   2. runtime: node slim com apenas o necessário pra rodar o proxy de produção
#
# IMPORTANTE para EasyPanel:
#   - Na UI do serviço, escolha "Dockerfile" como build method (NÃO Nixpacks)
#   - Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY como BUILD ARGUMENTS
#     (o Vite embute essas variáveis no bundle em build-time)
# =============================================================================

# ====== ESTÁGIO 1: BUILD ======
FROM node:20-alpine AS builder

LABEL maintainer="OctoIA25"
LABEL description="Octo-Dash CRM — build stage"

# -------- Build args (embutidos no bundle Vite) --------
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_GOOGLE_CALENDAR_CLIENT_ID
ARG VITE_GOOGLE_CALENDAR_CLIENT_SECRET

ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY} \
    VITE_GOOGLE_CALENDAR_CLIENT_ID=${VITE_GOOGLE_CALENDAR_CLIENT_ID} \
    VITE_GOOGLE_CALENDAR_CLIENT_SECRET=${VITE_GOOGLE_CALENDAR_CLIENT_SECRET}

# Pula download de Chromium pelo puppeteer (Alpine não tem deps nativas)
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Deps de build nativas (node-gyp)
RUN apk add --no-cache git python3 make g++

WORKDIR /app

# -------- Install deps do frontend (root) --------
COPY package.json package-lock.json* ./
RUN echo "📦 Installing frontend deps..." && \
    npm install --silent --legacy-peer-deps && \
    echo "✅ Frontend deps ok"

# -------- Install deps do backend (server/) --------
COPY server/package.json server/package-lock.json* ./server/
RUN echo "📦 Installing server deps..." && \
    cd server && \
    npm install --silent --omit=dev && \
    echo "✅ Server deps ok"

# -------- Copy source --------
COPY . .

# -------- Validar variáveis obrigatórias --------
RUN if [ -z "$VITE_SUPABASE_URL" ]; then \
      echo "❌ VITE_SUPABASE_URL não definida (passe como --build-arg)"; exit 1; \
    fi && \
    if [ -z "$VITE_SUPABASE_ANON_KEY" ]; then \
      echo "❌ VITE_SUPABASE_ANON_KEY não definida (passe como --build-arg)"; exit 1; \
    fi && \
    case "$VITE_SUPABASE_ANON_KEY" in \
      sb_*) echo "❌ Use a JWT anon legacy (eyJ...), não a publishable (sb_...)"; exit 1 ;; \
    esac

# -------- Build Vite --------
RUN echo "🔨 Vite build..." && \
    npm run build && \
    ls -lah dist/ && \
    echo "✅ Build ok"

# ====== ESTÁGIO 2: RUNTIME ======
FROM node:20-alpine

LABEL maintainer="OctoIA25"
LABEL description="Octo-Dash CRM — runtime"

RUN apk add --no-cache curl dumb-init tini

WORKDIR /app

# Copia apenas o que é necessário em runtime
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Porta padrão do EasyPanel
EXPOSE 80

ENV NODE_ENV=production \
    PORT=80 \
    NODE_OPTIONS="--max-old-space-size=512" \
    PUPPETEER_SKIP_DOWNLOAD=true

# Health check alinhado com o endpoint /healthz do proxy-production.js
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:${PORT}/healthz || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/proxy-production.js"]
