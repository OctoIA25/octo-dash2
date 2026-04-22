/**
 * 📚 API Documentation Page - Estilo Bitrix24
 * Página PÚBLICA de documentação da API OctoDash CRM Imobiliário
 * URL: /apidocs
 * API Base: https://octodash.octoia.org/api/v1
 * 
 * Documentação completa para integração com o CRM Imobiliário OctoDash
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Code,
  Book,
  Key,
  Users,
  TrendingUp,
  Zap,
  FileJson,
  Copy,
  Check,
  ChevronRight,
  ChevronDown,
  Shield,
  Clock,
  AlertCircle,
  Home,
  Database,
  Terminal,
  ExternalLink,
  Search,
  Menu,
  X,
  Rocket,
  BookOpen,
  Layers,
  Play,
  Phone,
  Mail,
  MapPin,
  Building,
  DollarSign,
  Calendar,
  UserCheck,
  Filter,
  RefreshCw,
  Trash2,
  Edit,
  Plus,
  List,
  Eye,
  Hash,
  Tag,
  Thermometer,
  Globe,
  MessageSquare,
  Bell,
  FileText,
  ArrowRight,
  CheckCircle,
  XCircle,
  Info,
  HelpCircle,
  Send,
  Upload,
  Download,
  Link as LinkIcon,
  User,
  Briefcase,
  Building2,
  Target,
  Activity,
  BarChart3,
  PieChart,
  Settings,
  Webhook
} from 'lucide-react';

// ============================================
// CONSTANTES DA API - CRM IMOBILIÁRIO
// ============================================
const API_BASE_URL = 'https://octodash.octoia.org/api';
const API_VERSION = 'v1';
const FULL_API_URL = `${API_BASE_URL}/${API_VERSION}`;

/**
 * ETAPAS DO FUNIL DE VENDAS
 * Numeradas de 1 a 10 para facilitar integração via API
 */
const FUNNEL_STAGES = [
  { id: 1, name: 'Novos Leads', name_en: 'New Leads', description: 'Lead recém-chegado, aguardando primeiro contato', color: '#6366f1' },
  { id: 2, name: 'Em Atendimento', name_en: 'In Contact', description: 'Primeiro contato realizado, coletando informações', color: '#8b5cf6' },
  { id: 3, name: 'Qualificado', name_en: 'Qualified', description: 'Lead qualificado, demonstrando interesse real', color: '#a855f7' },
  { id: 4, name: 'Visita Agendada', name_en: 'Visit Scheduled', description: 'Visita ao imóvel foi agendada', color: '#d946ef' },
  { id: 5, name: 'Visita Realizada', name_en: 'Visit Completed', description: 'Visita ao imóvel concluída', color: '#ec4899' },
  { id: 6, name: 'Em Negociação', name_en: 'Negotiation', description: 'Negociando termos e condições', color: '#f43f5e' },
  { id: 7, name: 'Proposta Criada', name_en: 'Proposal Created', description: 'Proposta formal sendo elaborada', color: '#f97316' },
  { id: 8, name: 'Proposta Enviada', name_en: 'Proposal Sent', description: 'Proposta enviada ao cliente', color: '#eab308' },
  { id: 9, name: 'Proposta Assinada', name_en: 'Contract Signed', description: 'Contrato assinado, negócio fechado', color: '#22c55e' },
  { id: 10, name: 'Arquivado', name_en: 'Archived', description: 'Lead arquivado (perdido ou inativo)', color: '#64748b' }
] as const;

/**
 * TIPOS DE LEAD
 * 1 = Interessado (comprador/locatário)
 * 2 = Proprietário (vendedor/locador)
 */
const LEAD_TYPES = [
  { id: 1, name: 'Interessado', name_en: 'Buyer/Renter', description: 'Cliente interessado em comprar ou alugar imóvel', icon: '🏠' },
  { id: 2, name: 'Proprietário', name_en: 'Owner/Seller', description: 'Proprietário querendo vender ou alugar seu imóvel', icon: '🔑' }
] as const;

/**
 * TEMPERATURA DO LEAD
 * Classificação de interesse/urgência
 */
const TEMPERATURES = [
  { id: 1, value: 'cold', name: 'Frio', name_en: 'Cold', description: 'Baixo interesse ou engajamento', color: '#3b82f6', emoji: '❄️' },
  { id: 2, value: 'warm', name: 'Morno', name_en: 'Warm', description: 'Interesse moderado, precisa ser nutrido', color: '#f59e0b', emoji: '🌡️' },
  { id: 3, value: 'hot', name: 'Quente', name_en: 'Hot', description: 'Alto interesse, pronto para fechar', color: '#ef4444', emoji: '🔥' }
] as const;

/**
 * ORIGENS DO LEAD (FONTES)
 * ID 0 = LIA Serhant (Assistente IA da OctoIA)
 * IDs 1-9 = Canais Padrões e Redes Sociais
 * IDs 10+ = Portais Imobiliários
 */
const LEAD_SOURCES = [
  { id: 0, name: 'Lia Serhant, Atendente Imobiliária da OctoIA', category: 'ai', icon: '🤖', logo: 'https://cdn-icons-png.flaticon.com/512/4712/4712109.png', description: 'Assistente virtual com foco em conversão de leads' },
  { id: 1, name: 'WhatsApp (Business API e Link direto)', category: 'channels', icon: '💬', logo: 'https://logo.clearbit.com/whatsapp.com', description: 'Leads via WhatsApp Business API ou link direto' },
  { id: 2, name: 'Facebook Lead Ads (Formulários)', category: 'channels', icon: '📘', logo: 'https://logo.clearbit.com/facebook.com', description: 'Formulários de captação do Facebook Ads' },
  { id: 3, name: 'Instagram Ads (Formulários e Direct)', category: 'channels', icon: '📸', logo: 'https://logo.clearbit.com/instagram.com', description: 'Formulários e Direct do Instagram' },
  { id: 4, name: 'Google Ads (Extensão de formulário e Pesquisa)', category: 'channels', icon: '🔍', logo: 'https://logo.clearbit.com/ads.google.com', description: 'Extensões de formulário e campanhas de pesquisa' },
  { id: 5, name: 'LinkedIn Ads', category: 'channels', icon: '💼', logo: 'https://logo.clearbit.com/linkedin.com', description: 'Formulários e anúncios no LinkedIn' },
  { id: 6, name: 'Site da Imobiliária (Formulários "Fale Conosco" / "Agende sua Visita")', category: 'channels', icon: '🌐', logo: 'https://cdn-icons-png.flaticon.com/512/3585/3585971.png', description: 'Formulários do site institucional da imobiliária' },
  { id: 7, name: 'E-mail (Leitura automática de leads via e-mail)', category: 'channels', icon: '📧', logo: 'https://cdn-icons-png.flaticon.com/512/732/732200.png', description: 'Captação automática via caixas de email' },
  { id: 8, name: 'Landing Pages (Páginas de lançamento/captura)', category: 'channels', icon: '📄', logo: 'https://cdn-icons-png.flaticon.com/512/2857/2857433.png', description: 'Landing pages de campanhas e lançamentos' },
  { id: 9, name: 'API Customizada (Para conectar CRMs ou ferramentas externas)', category: 'channels', icon: '🔗', logo: 'https://cdn-icons-png.flaticon.com/512/8254/8254898.png', description: 'Integração via API com CRMs e ferramentas externas' },
  { id: 10, name: 'Zap Imóveis (Grupo ZAP)', category: 'portal', icon: '🏢', logo: 'https://logo.clearbit.com/zapimoveis.com.br', description: 'Portal ZAP Imóveis' },
  { id: 11, name: 'Viva Real (Grupo ZAP)', category: 'portal', icon: '🏘️', logo: 'https://logo.clearbit.com/vivareal.com.br', description: 'Portal Viva Real' },
  { id: 12, name: 'Imovelweb', category: 'portal', icon: '🏠', logo: 'https://logo.clearbit.com/imovelweb.com.br', description: 'Portal Imovelweb' },
  { id: 13, name: 'OLX (Categoria Imóveis)', category: 'portal', icon: '📦', logo: 'https://logo.clearbit.com/olx.com.br', description: 'Classificados OLX Imóveis' },
  { id: 14, name: 'Mercado Livre (Categoria Imóveis)', category: 'portal', icon: '🛒', logo: 'https://logo.clearbit.com/mercadolivre.com.br', description: 'Classificados Mercado Livre Imóveis' },
  { id: 15, name: 'Casa Mineira', category: 'portal', icon: '🏡', logo: 'https://logo.clearbit.com/casamineira.com.br', description: 'Portal Casa Mineira' },
  { id: 16, name: 'Chaves Na Mão (Imóveis)', category: 'portal', icon: '🔑', logo: 'https://logo.clearbit.com/chavesnamao.com.br', description: 'Portal Chaves na Mão' },
  { id: 17, name: 'Dream Casa', category: 'portal', icon: '✨', logo: 'https://logo.clearbit.com/dreamcasa.com.br', description: 'Portal Dream Casa' },
  { id: 18, name: '123i', category: 'portal', icon: '🔢', logo: 'https://logo.clearbit.com/123i.com.br', description: 'Portal 123i' },
  { id: 19, name: 'Moving Imóveis', category: 'portal', icon: '🚚', logo: 'https://logo.clearbit.com/movingimoveis.com.br', description: 'Portal Moving Imóveis' },
  { id: 20, name: 'DF Imóveis', category: 'portal', icon: '🏛️', logo: 'https://logo.clearbit.com/dfimoveis.com.br', description: 'Portal DF Imóveis' },
  { id: 21, name: 'Wimoveis', category: 'portal', icon: '🏘️', logo: 'https://logo.clearbit.com/wimoveis.com.br', description: 'Portal Wimoveis' },
  { id: 22, name: 'Homer', category: 'portal', icon: '🏚️', logo: 'https://logo.clearbit.com/homer.com.br', description: 'Portal Homer' },
  { id: 23, name: 'Buskaza', category: 'portal', icon: '🔎', logo: 'https://logo.clearbit.com/buskaza.com.br', description: 'Portal Buskaza' },
  { id: 24, name: 'Órulo', category: 'portal', icon: '🎯', logo: 'https://logo.clearbit.com/orulo.com.br', description: 'Portal Órulo' },
  { id: 25, name: 'Lugar Certo', category: 'portal', icon: '📍', logo: 'https://logo.clearbit.com/lugarcerto.com.br', description: 'Portal Lugar Certo' },
  { id: 26, name: 'ImovoMAP', category: 'portal', icon: '🗺️', logo: 'https://logo.clearbit.com/imovomap.com.br', description: 'Portal ImovoMAP' },
  { id: 27, name: 'MGF Imóveis', category: 'portal', icon: '🏗️', logo: 'https://www.google.com/s2/favicons?domain=mgfimoveis.com.br&sz=128', description: 'Portal MGF Imóveis' },
  { id: 28, name: 'Portal RJ Imóveis', category: 'portal', icon: '🌆', logo: 'https://logo.clearbit.com/portalrjimoveis.com.br', description: 'Portal RJ Imóveis' },
  { id: 29, name: '321achei', category: 'portal', icon: '🔍', logo: 'https://logo.clearbit.com/321achei.com.br', description: 'Portal 321achei' },
  { id: 30, name: 'Compre Alugue Agora', category: 'portal', icon: '📝', logo: 'https://logo.clearbit.com/comprealugueagora.com.br', description: 'Portal Compre Alugue Agora' },
  { id: 31, name: 'Arbo Imóveis (Via integração de sistema)', category: 'portal', icon: '🏢', logo: 'https://logo.clearbit.com/arboimoveis.com.br', description: 'Arbo Imóveis via integração de sistema' }
] as const;

/**
 * TIPOS DE NEGÓCIO
 */
const BUSINESS_TYPES = [
  { id: 1, name: 'Venda', name_en: 'Sale', description: 'Imóvel à venda' },
  { id: 2, name: 'Aluguel', name_en: 'Rent', description: 'Imóvel para locação' },
  { id: 3, name: 'Venda e Aluguel', name_en: 'Sale & Rent', description: 'Imóvel disponível para ambos' },
  { id: 4, name: 'Temporada', name_en: 'Seasonal', description: 'Aluguel por temporada' }
] as const;

/**
 * N8N WORKFLOW JSON - OctoDash API Complete Integration
 * Workflow completo para importar no n8n com todos os endpoints da API
 */
const N8N_WORKFLOW_JSON = {
  "name": "OctoDash CRM API - Complete Integration",
  "nodes": [
    // ========== STICKY NOTES (Organização) ==========
    {
      "parameters": {
        "content": "# 🚀 OctoDash CRM API\n## Workflow Completo de Integração\n\n**Base URL:** https://octodash.octoia.org/api/v1\n\n**Autenticação:** Bearer Token\n\nSubstitua `octo_sk_your_api_key` pela sua API Key real.\n\n🔍 Health Check: GET /api/v1/health\n📖 Documentação: /apidocs",
        "height": 280,
        "width": 320
      },
      "id": "note-intro",
      "name": "📚 Introdução",
      "type": "n8n-nodes-base.stickyNote",
      "typeVersion": 1,
      "position": [100, 100]
    },
    {
      "parameters": {
        "content": "# 📋 LEADS - Operações CRUD\n\nEndpoints para gerenciar leads do CRM:\n- Listar todos\n- Buscar por ID\n- Buscar por Telefone\n- Criar novo\n- Atualizar\n- Deletar (arquivar)",
        "height": 200,
        "width": 280
      },
      "id": "note-leads",
      "name": "📋 Seção Leads",
      "type": "n8n-nodes-base.stickyNote",
      "typeVersion": 1,
      "position": [100, 420]
    },
    {
      "parameters": {
        "content": "# 👥 CORRETORES\n\nEndpoints para gerenciar corretores:\n- Listar todos\n- Buscar por ID\n- Atribuir lead",
        "height": 160,
        "width": 280
      },
      "id": "note-brokers",
      "name": "👥 Seção Corretores",
      "type": "n8n-nodes-base.stickyNote",
      "typeVersion": 1,
      "position": [100, 1200]
    },
    {
      "parameters": {
        "content": "# 🔔 WEBHOOKS\n\nConfigure webhooks para receber notificações em tempo real.",
        "height": 120,
        "width": 280
      },
      "id": "note-webhooks",
      "name": "🔔 Seção Webhooks",
      "type": "n8n-nodes-base.stickyNote",
      "typeVersion": 1,
      "position": [100, 1600]
    },
    {
      "parameters": {
        "content": "# ⚙️ OPERAÇÕES ESPECIAIS\n\n- Alterar etapa do funil\n- Alterar temperatura\n- Atribuir corretor\n- Operações em lote\n- Upsert (criar/atualizar)",
        "height": 180,
        "width": 280
      },
      "id": "note-special",
      "name": "⚙️ Operações Especiais",
      "type": "n8n-nodes-base.stickyNote",
      "typeVersion": 1,
      "position": [800, 420]
    },
    // ========== HEALTH CHECK ==========
    {
      "parameters": {
        "method": "GET",
        "url": "https://octodash.octoia.org/api/v1/health",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "options": {}
      },
      "id": "health-check",
      "name": "GET Health Check",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 200]
    },
    // ========== LEADS - HTTP REQUEST NODES ==========
    {
      "parameters": {
        "method": "GET",
        "url": "https://octodash.octoia.org/api/v1/leads",
        "authentication": "none",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            { "name": "page", "value": "1" },
            { "name": "limit", "value": "50" }
          ]
        },
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "options": {}
      },
      "id": "leads-list",
      "name": "GET Listar Leads",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 500]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://octodash.octoia.org/api/v1/leads/{{$json.lead_id}}",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "options": {}
      },
      "id": "leads-get-id",
      "name": "GET Lead por ID",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 620]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://octodash.octoia.org/api/v1/leads/phone/{{$json.phone}}",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "options": {}
      },
      "id": "leads-get-phone",
      "name": "GET Lead por Telefone",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 740]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://octodash.octoia.org/api/v1/leads",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "name", "value": "Maria Santos" },
            { "name": "phone", "value": "11999998888" },
            { "name": "email", "value": "maria@email.com" },
            { "name": "lead_type", "value": "1" },
            { "name": "source", "value": "1" },
            { "name": "stage", "value": "1" },
            { "name": "temperature", "value": "warm" },
            { "name": "business_type", "value": "1" },
            { "name": "comments", "value": "Lead captado via n8n" }
          ]
        },
        "options": {}
      },
      "id": "leads-create",
      "name": "POST Criar Lead",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 860]
    },
    {
      "parameters": {
        "method": "PUT",
        "url": "https://octodash.octoia.org/api/v1/leads/{{$json.lead_id}}",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "name", "value": "Maria Santos Silva" },
            { "name": "phone", "value": "11999998888" },
            { "name": "email", "value": "maria.silva@email.com" },
            { "name": "stage", "value": "3" },
            { "name": "temperature", "value": "hot" }
          ]
        },
        "options": {}
      },
      "id": "leads-update-put",
      "name": "PUT Atualizar Lead (completo)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 980]
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "https://octodash.octoia.org/api/v1/leads/{{$json.lead_id}}",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "temperature", "value": "hot" }
          ]
        },
        "options": {}
      },
      "id": "leads-update-patch",
      "name": "PATCH Atualizar Lead (parcial)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 1100]
    },
    {
      "parameters": {
        "method": "DELETE",
        "url": "https://octodash.octoia.org/api/v1/leads/{{$json.lead_id}}",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "options": {}
      },
      "id": "leads-delete",
      "name": "DELETE Arquivar Lead",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [680, 500]
    },
    // ========== OPERAÇÕES ESPECIAIS ==========
    {
      "parameters": {
        "method": "PATCH",
        "url": "https://octodash.octoia.org/api/v1/leads/{{$json.lead_id}}/stage",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "stage", "value": "4" }
          ]
        },
        "options": {}
      },
      "id": "leads-change-stage",
      "name": "PATCH Alterar Etapa Funil",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [880, 500]
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "https://octodash.octoia.org/api/v1/leads/{{$json.lead_id}}/temperature",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "temperature", "value": "3" }
          ]
        },
        "options": {}
      },
      "id": "leads-change-temp",
      "name": "PATCH Alterar Temperatura",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [880, 620]
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "https://octodash.octoia.org/api/v1/leads/{{$json.lead_id}}/agent",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "assigned_agent", "value": "Ana Costa" },
            { "name": "assigned_agent_id", "value": "agent-123" }
          ]
        },
        "options": {}
      },
      "id": "leads-assign-agent",
      "name": "PATCH Atribuir Corretor",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [880, 740]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://octodash.octoia.org/api/v1/leads/batch",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "{\n  \"leads\": [\n    {\n      \"name\": \"Lead 1\",\n      \"phone\": \"11999990001\",\n      \"source\": 1,\n      \"stage\": 1\n    },\n    {\n      \"name\": \"Lead 2\",\n      \"phone\": \"11999990002\",\n      \"source\": 2,\n      \"stage\": 1\n    }\n  ]\n}",
        "options": {}
      },
      "id": "leads-batch",
      "name": "POST Criar Leads em Lote",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [880, 860]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://octodash.octoia.org/api/v1/leads/upsert",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "phone", "value": "11999998888" },
            { "name": "name", "value": "Maria Santos" },
            { "name": "temperature", "value": "hot" },
            { "name": "stage", "value": "6" }
          ]
        },
        "options": {}
      },
      "id": "leads-upsert",
      "name": "POST Upsert Lead (criar/atualizar)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [880, 980]
    },
    // ========== CORRETORES ==========
    {
      "parameters": {
        "method": "GET",
        "url": "https://octodash.octoia.org/api/v1/brokers",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "options": {}
      },
      "id": "brokers-list",
      "name": "GET Listar Corretores",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 1280]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://octodash.octoia.org/api/v1/brokers/{{$json.broker_id}}",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "options": {}
      },
      "id": "brokers-get",
      "name": "GET Corretor por ID",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 1400]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://octodash.octoia.org/api/v1/brokers/{{$json.broker_id}}/assign",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "lead_ids", "value": "[\"lead-uuid-1\", \"lead-uuid-2\"]" }
          ]
        },
        "options": {}
      },
      "id": "brokers-assign",
      "name": "POST Atribuir Leads ao Corretor",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 1520]
    },
    // ========== WEBHOOKS ==========
    {
      "parameters": {
        "method": "POST",
        "url": "https://octodash.octoia.org/api/v1/webhooks",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "{\n  \"url\": \"https://seu-servidor.com/webhook\",\n  \"events\": [\"lead.created\", \"lead.updated\", \"lead.stage_changed\"],\n  \"active\": true\n}",
        "options": {}
      },
      "id": "webhooks-create",
      "name": "POST Criar Webhook",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 1680]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://octodash.octoia.org/api/v1/webhooks",
        "authentication": "none",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "options": {}
      },
      "id": "webhooks-list",
      "name": "GET Listar Webhooks",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [680, 1680]
    },
    // ========== FILTROS AVANÇADOS ==========
    {
      "parameters": {
        "method": "GET",
        "url": "https://octodash.octoia.org/api/v1/leads",
        "authentication": "none",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            { "name": "stage", "value": "4" },
            { "name": "temperature", "value": "hot" },
            { "name": "source", "value": "1" },
            { "name": "limit", "value": "20" }
          ]
        },
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Authorization", "value": "Bearer octo_sk_your_api_key" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "options": {}
      },
      "id": "leads-filter-advanced",
      "name": "GET Leads com Filtros Avançados",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [680, 620]
    }
  ],
  "pinData": {},
  "connections": {},
  "active": false,
  "settings": {
    "executionOrder": "v1"
  },
  "versionId": "octodash-api-v1-workflow",
  "meta": {
    "templateCredsSetupCompleted": false,
    "instanceId": "octodash-crm-api-integration"
  },
  "id": "octodash-n8n-workflow",
  "tags": [
    { "id": "1", "name": "OctoDash" },
    { "id": "2", "name": "CRM" },
    { "id": "3", "name": "API" },
    { "id": "4", "name": "Imobiliário" }
  ]
};

// ============================================
// TIPOS E INTERFACES
// ============================================
type DocSection = 
  | 'home' 
  | 'getting-started' 
  | 'authentication' 
  // Leads
  | 'leads' 
  | 'leads-list'
  | 'leads-get'
  | 'leads-get-by-phone'
  | 'leads-create'
  | 'leads-update'
  | 'leads-delete'
  | 'leads-batch'
  // Corretores
  | 'brokers'
  | 'brokers-list'
  | 'brokers-get'
  | 'brokers-assign'
  // Roleta
  | 'roleta'
  | 'roleta-get'
  | 'roleta-lead'
  // Referências
  | 'funnel-stages'
  | 'lead-types'
  | 'temperatures'
  | 'sources'
  | 'business-types'
  // Avançado
  | 'webhooks'
  | 'rate-limits'
  | 'errors'
  | 'examples'
  | 'sdks';

interface NavItem {
  id: DocSection;
  label: string;
  icon: React.ElementType;
  children?: { id: DocSection; label: string }[];
  badge?: string;
}

// ============================================
// NAVEGAÇÃO SIDEBAR - ESTILO BITRIX24
// ============================================
const navItems: NavItem[] = [
  { id: 'home', label: 'Visão Geral', icon: Home },
  { id: 'getting-started', label: 'Início Rápido', icon: Rocket, badge: 'Start' },
  { id: 'authentication', label: 'Autenticação', icon: Key },
  { 
    id: 'leads', 
    label: 'Leads', 
    icon: Users,
    children: [
      { id: 'leads-list', label: 'GET Listar Leads' },
      { id: 'leads-get', label: 'GET Buscar por ID' },
      { id: 'leads-get-by-phone', label: 'GET Buscar por Telefone' },
      { id: 'leads-create', label: 'POST Criar Lead' },
      { id: 'leads-update', label: 'PUT/PATCH Atualizar' },
      { id: 'leads-delete', label: 'DELETE Arquivar' },
      { id: 'leads-batch', label: 'POST Lote' },
    ]
  },
  { 
    id: 'brokers', 
    label: 'Corretores', 
    icon: UserCheck,
    children: [
      { id: 'brokers-list', label: 'GET Listar Todos' },
      { id: 'brokers-get', label: 'GET Buscar por ID' },
      { id: 'brokers-assign', label: 'POST Atribuir Lead' },
    ]
  },
  {
    id: 'roleta',
    label: 'Roleta de Corretores',
    icon: RefreshCw,
    badge: 'Novo',
    children: [
      { id: 'roleta-get', label: 'GET Consultar Roleta' },
      { id: 'roleta-lead', label: 'POST Lead via Roleta' },
    ]
  },
  { id: 'funnel-stages', label: 'Etapas do Funil', icon: Layers },
  { id: 'lead-types', label: 'Tipos de Lead', icon: Tag },
  { id: 'temperatures', label: 'Temperaturas', icon: Thermometer },
  { id: 'sources', label: 'Origens (Fontes)', icon: Globe },
  { id: 'business-types', label: 'Tipos de Negócio', icon: Briefcase },
  { id: 'webhooks', label: 'Webhooks', icon: Bell },
  { id: 'rate-limits', label: 'Rate Limits', icon: Clock },
  { id: 'errors', label: 'Códigos de Erro', icon: AlertCircle },
  { id: 'examples', label: 'Exemplos Práticos', icon: Play, badge: 'Novo' },
];

// ============================================
// COMPONENTES AUXILIARES
// ============================================
const CodeBlock = ({ code, id, language = 'bash', copiedCode, onCopy }: { 
  code: string; 
  id: string; 
  language?: string;
  copiedCode: string | null;
  onCopy: (code: string, id: string) => void;
}) => (
  <div className="relative group rounded-lg overflow-hidden border border-gray-700">
    <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
      <span className="text-xs text-gray-400 font-mono uppercase">{language}</span>
      <button
        onClick={() => onCopy(code, id)}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
      >
        {copiedCode === id ? (
          <>
            <Check className="w-3.5 h-3.5 text-green-400" />
            <span className="text-green-400">Copiado!</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5 text-gray-300" />
            <span className="text-gray-300">Copiar</span>
          </>
        )}
      </button>
    </div>
    <pre className="bg-gray-900 text-gray-100 p-4 text-sm overflow-x-auto font-mono leading-relaxed">
      <code dangerouslySetInnerHTML={{ __html: formatCode(code, language) }} />
    </pre>
  </div>
);

const formatCode = (code: string, language: string): string => {
  // Syntax highlighting básico
  let formatted = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  if (language === 'bash' || language === 'curl') {
    formatted = formatted
      .replace(/(curl|GET|POST|PUT|PATCH|DELETE)/g, '<span class="text-cyan-400 font-semibold">$1</span>')
      .replace(/(-H|-X|-d)/g, '<span class="text-yellow-400">$1</span>')
      .replace(/"([^"]+)"/g, '<span class="text-green-400">"$1"</span>')
      .replace(/(https?:\/\/[^\s"]+)/g, '<span class="text-blue-400">$1</span>');
  } else if (language === 'json') {
    formatted = formatted
      .replace(/"([^"]+)":/g, '<span class="text-purple-400">"$1"</span>:')
      .replace(/: "([^"]+)"/g, ': <span class="text-green-400">"$1"</span>')
      .replace(/: (\d+)/g, ': <span class="text-orange-400">$1</span>')
      .replace(/: (true|false|null)/g, ': <span class="text-cyan-400">$1</span>');
  }
  
  return formatted;
};

const MethodBadge = ({ method }: { method: string }) => {
  const styles: Record<string, string> = {
    GET: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    POST: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    PUT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    PATCH: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    DELETE: 'bg-red-500/20 text-red-400 border-red-500/30'
  };
  return (
    <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${styles[method] || 'bg-gray-500/20 text-gray-400'}`}>
      {method}
    </span>
  );
};

const EndpointCard = ({ method, path, description }: { method: string; path: string; description: string }) => (
  <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50 hover:border-gray-600 transition-colors">
    <MethodBadge method={method} />
    <code className="text-sm font-mono text-gray-200 flex-1">{path}</code>
    <span className="text-sm text-gray-400">{description}</span>
  </div>
);

const InfoCard = ({ icon: Icon, title, children, variant = 'info' }: { 
  icon: React.ElementType; 
  title: string; 
  children: React.ReactNode;
  variant?: 'info' | 'warning' | 'success' | 'error';
}) => {
  const variants = {
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-400'
  };
  return (
    <div className={`flex gap-4 p-4 rounded-xl border ${variants[variant]}`}>
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold mb-1">{title}</p>
        <div className="text-sm text-gray-300">{children}</div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
export const ApiDocsPage: React.FC = () => {
  const location = useLocation();
  const [activeSection, setActiveSection] = useState<DocSection>('home');
  const [expandedItems, setExpandedItems] = useState<string[]>(['leads']);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [n8nCopied, setN8nCopied] = useState(false);

  const copyN8nWorkflow = () => {
    navigator.clipboard.writeText(JSON.stringify(N8N_WORKFLOW_JSON, null, 2));
    setN8nCopied(true);
    setTimeout(() => setN8nCopied(false), 3000);
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Sync URL with section
  useEffect(() => {
    const path = location.pathname.replace('/apidocs', '').replace('/', '') || 'home';
    if (path !== activeSection) {
      setActiveSection(path as DocSection);
    }
  }, [location.pathname]);

  // ============================================
  // SEÇÕES DE CONTEÚDO
  // ============================================
  
  const renderHome = () => (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-10 text-white shadow-2xl">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="relative">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              <Code className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-4xl font-bold mb-1 text-gray-900">OctoDash CRM API</h1>
              <p className="text-gray-800 text-lg">REST API para CRM Imobiliário • Versão {API_VERSION}</p>
            </div>
          </div>
          <p className="text-lg text-gray-900 max-w-3xl mb-8 leading-relaxed">
            API RESTful completa para integração com seu CRM imobiliário. Gerencie leads, 
            automatize processos, integre com chatbots, n8n, webhooks e muito mais.
          </p>
          <div className="flex flex-wrap gap-4">
            <button 
              onClick={() => setActiveSection('getting-started')}
              className="px-6 py-3 bg-white text-indigo-700 rounded-xl font-semibold hover:bg-white/95 transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              <Rocket className="w-5 h-5" />
              Começar Agora
            </button>
            <button 
              onClick={() => setActiveSection('examples')}
              className="px-6 py-3 bg-white/20 backdrop-blur-sm text-white rounded-xl font-semibold hover:bg-white/30 transition-all border border-white/30 flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              Ver Exemplos
            </button>
          </div>
        </div>
      </div>

      {/* URL Base */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-850 rounded-xl p-6 border border-gray-700 shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-6 h-6 text-blue-400" />
          <span className="font-semibold text-white text-lg">URL Base da API</span>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
          <code className="text-lg text-emerald-400 font-mono block">
            {FULL_API_URL}
          </code>
        </div>
        <p className="text-sm text-gray-400 mt-3">
          Todas as requisições devem ser feitas para esta URL base seguida do endpoint desejado.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Endpoints', value: '17+', icon: Terminal, color: 'blue' },
          { label: 'Recursos', value: '4', icon: Database, color: 'purple' },
          { label: 'Rate Limit', value: '100/min', icon: Clock, color: 'amber' },
          { label: 'Formato', value: 'JSON', icon: FileJson, color: 'emerald' },
        ].map((stat, idx) => {
          const colors = {
            blue: 'from-blue-500/20 to-blue-600/20 border-blue-500/30 text-blue-400',
            purple: 'from-purple-500/20 to-purple-600/20 border-purple-500/30 text-purple-400',
            amber: 'from-amber-500/20 to-amber-600/20 border-amber-500/30 text-amber-400',
            emerald: 'from-emerald-500/20 to-emerald-600/20 border-emerald-500/30 text-emerald-400',
          };
          return (
            <div key={idx} className={`bg-gradient-to-br ${colors[stat.color as keyof typeof colors]} rounded-xl p-5 border text-center`}>
              <stat.icon className="w-8 h-8 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white mb-1">{stat.value}</p>
              <p className="text-sm text-gray-300">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Main Resources */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-4">Recursos Principais</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { 
              name: 'Leads', 
              desc: 'Gerenciamento completo de leads do CRM', 
              endpoints: 11, 
              icon: Users,
              color: 'emerald',
              action: () => setActiveSection('leads')
            },
            { 
              name: 'Funil de Vendas', 
              desc: 'Controle de etapas e movimentação', 
              endpoints: 3, 
              icon: Layers,
              color: 'blue',
              action: () => setActiveSection('funnel-stages')
            },
            { 
              name: 'Temperatura', 
              desc: 'Classificação de interesse dos leads', 
              endpoints: 2, 
              icon: Zap,
              color: 'amber',
              action: () => setActiveSection('temperatures')
            },
            { 
              name: 'Origens', 
              desc: 'Rastreamento de fonte dos leads', 
              endpoints: 2, 
              icon: MapPin,
              color: 'purple',
              action: () => setActiveSection('sources')
            },
          ].map((resource, idx) => {
            const colors = {
              emerald: 'hover:border-emerald-500/50 group-hover:text-emerald-400',
              blue: 'hover:border-blue-500/50 group-hover:text-blue-400',
              amber: 'hover:border-amber-500/50 group-hover:text-amber-400',
              purple: 'hover:border-purple-500/50 group-hover:text-purple-400',
            };
            return (
              <button
                key={idx}
                onClick={resource.action}
                className={`group p-6 bg-gray-800 rounded-xl border border-gray-700 ${colors[resource.color as keyof typeof colors]} transition-all text-left`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gray-700/50 flex items-center justify-center flex-shrink-0">
                    <resource.icon className="w-6 h-6 text-gray-400 group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-white text-lg mb-1 group-hover:text-white transition-colors">{resource.name}</h3>
                    <p className="text-sm text-gray-400 mb-3">{resource.desc}</p>
                    <span className="text-xs text-gray-500 bg-gray-700/50 px-3 py-1 rounded-full">
                      {resource.endpoints} endpoints
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-white transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Features Grid */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-4">Funcionalidades</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: Phone, title: 'Busca por Telefone', desc: 'Verifique se um lead já existe pelo número' },
            { icon: RefreshCw, title: 'Criar ou Atualizar', desc: 'Upsert automático de leads' },
            { icon: Filter, title: 'Filtros Avançados', desc: 'Busque leads por múltiplos critérios' },
            { icon: UserCheck, title: 'Atribuição', desc: 'Atribua leads a corretores específicos' },
            { icon: Terminal, title: 'Webhooks', desc: 'Receba notificações em tempo real' },
            { icon: List, title: 'Operações em Lote', desc: 'Processe múltiplos leads de uma vez' },
          ].map((feature, idx) => (
            <div key={idx} className="p-5 bg-gray-800/50 rounded-xl border border-gray-700/50">
              <feature.icon className="w-8 h-8 text-blue-400 mb-3" />
              <h3 className="font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-400">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <FileJson className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">Formato de Dados</h3>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Todas as requisições e respostas utilizam JSON com UTF-8 encoding.
          </p>
          <code className="text-xs bg-gray-900 text-gray-300 px-3 py-2 rounded-lg block font-mono border border-gray-700">
            Content-Type: application/json
          </code>
        </div>
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <Clock className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-white">Rate Limiting</h3>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Limite de 100 requisições por minuto por API Key.
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Headers: X-RateLimit-Limit, X-RateLimit-Remaining
          </div>
        </div>
      </div>
    </div>
  );

  const renderGettingStarted = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Quick Start Guide</h1>
        <p className="text-gray-400">Get started with the OctoDash CRM API in minutes.</p>
      </div>

      <div className="space-y-4">
        {/* Step 1 */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">1</span>
            <h3 className="font-semibold text-white">Get Your API Key</h3>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Access the <strong className="text-white">Integrations</strong> panel in OctoDash CRM and generate your unique API Key.
          </p>
          <InfoCard icon={Key} title="API Key Format" variant="info">
            Your key will look like: <code className="bg-gray-700 px-1.5 py-0.5 rounded text-blue-300">octo_sk_xxxxxxxxxxxxxxxx</code>
          </InfoCard>
        </div>

        {/* Step 2 */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">2</span>
            <h3 className="font-semibold text-white">Configure Authentication</h3>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Include your API Key in the <code className="text-emerald-400">Authorization</code> header of all requests.
          </p>
          <CodeBlock
            id="getting-started-auth"
            language="bash"
            code={`Authorization: Bearer octo_sk_your_api_key_here`}
            copiedCode={copiedCode}
            onCopy={copyCode}
          />
        </div>

        {/* Step 3 */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">3</span>
            <h3 className="font-semibold text-white">Make Your First Request</h3>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            Test the connection by listing your leads:
          </p>
          <CodeBlock
            id="getting-started-first"
            language="curl"
            code={`curl -X GET "${FULL_API_URL}/leads" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json"`}
            copiedCode={copiedCode}
            onCopy={copyCode}
          />
        </div>
      </div>

      <InfoCard icon={BookOpen} title="Next Steps" variant="success">
        Explore the <button onClick={() => setActiveSection('leads')} className="text-emerald-400 hover:underline">Leads endpoints</button> to create, update, and manage your contacts.
      </InfoCard>
    </div>
  );

  const renderAuthentication = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Authentication</h1>
        <p className="text-gray-400">All API requests must include your API Key in the authorization header.</p>
      </div>

      <InfoCard icon={AlertCircle} title="Security" variant="warning">
        Never expose your API Key in frontend code or public repositories. Use environment variables.
      </InfoCard>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Authentication Header</h3>
        <CodeBlock
          id="auth-header"
          language="bash"
          code={`Authorization: Bearer octo_sk_your_api_key_here`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Complete Example</h3>
        <CodeBlock
          id="auth-example"
          language="curl"
          code={`curl -X GET "${FULL_API_URL}/leads" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json"`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Authentication Errors</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-4 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
            <span className="px-2.5 py-1 bg-red-500/20 text-red-400 rounded text-xs font-bold">401</span>
            <div>
              <p className="font-medium text-white">Unauthorized</p>
              <p className="text-xs text-gray-400">Missing or invalid API Key</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
            <span className="px-2.5 py-1 bg-red-500/20 text-red-400 rounded text-xs font-bold">403</span>
            <div>
              <p className="font-medium text-white">Forbidden</p>
              <p className="text-xs text-gray-400">API Key revoked or insufficient permissions</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLeads = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Leads</h1>
        <p className="text-gray-400">Endpoints para gerenciamento completo de leads no CRM.</p>
      </div>

      <div className="space-y-3">
        {[
          { method: 'GET', path: '/health', description: 'Verificar status da API' },
          { method: 'GET', path: '/leads', description: 'Listar todos os leads' },
          { method: 'GET', path: '/leads/:id', description: 'Buscar lead por ID' },
          { method: 'POST', path: '/leads', description: 'Criar novo lead' },
          { method: 'PUT', path: '/leads/:id', description: 'Atualizar lead completo' },
          { method: 'PATCH', path: '/leads/:id', description: 'Atualizar campos específicos' },
          { method: 'PATCH', path: '/leads/:id/status', description: 'Alterar etapa do funil' },
          { method: 'DELETE', path: '/leads/:id', description: 'Arquivar lead' }
        ].map((endpoint, idx) => (
          <EndpointCard key={idx} {...endpoint} />
        ))}
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Campos do Lead</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-3 font-medium text-gray-400">Campo</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Tipo</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {[
                ['name', 'string', 'Nome do lead (obrigatório)'],
                ['phone', 'string', 'Telefone com DDD'],
                ['email', 'string', 'E-mail do lead'],
                ['source', 'string', 'Origem: API, Site, WhatsApp...'],
                ['status', 'string', 'Etapa atual do funil'],
                ['temperature', 'string', 'Frio, Morno ou Quente'],
                ['property_code', 'string', 'Código do imóvel de interesse'],
                ['property_value', 'number', 'Valor do imóvel'],
                ['assigned_agent', 'string', 'Nome do corretor responsável'],
                ['comments', 'string', 'Observações adicionais']
              ].map(([field, type, desc], idx) => (
                <tr key={idx}>
                  <td className="py-2 px-3 font-mono text-purple-400">{field}</td>
                  <td className="py-2 px-3 text-gray-500">{type}</td>
                  <td className="py-2 px-3 text-gray-300">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo: Criar Lead</h3>
        <CodeBlock
          id="leads-create-example"
          language="curl"
          code={`curl -X POST "${FULL_API_URL}/leads" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Maria Santos",
    "phone": "11999998888",
    "email": "maria@email.com",
    "source": "whatsapp",
    "stage": 1,
    "temperature": "warm"
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>
    </div>
  );

  // ============================================
  // LEADS - ENDPOINTS DETALHADOS
  // ============================================
  
  const renderLeadsList = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">GET - Listar Leads</h1>
        <p className="text-gray-400">Retorna uma lista paginada de todos os leads do CRM.</p>
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <MethodBadge method="GET" />
        <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/leads</code>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Parâmetros de Query</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-3 font-medium text-gray-400">Parâmetro</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Tipo</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {[
                ['page', 'int', 'Número da página (padrão: 1)'],
                ['limit', 'int', 'Itens por página (padrão: 20, máx: 100)'],
                ['stage', 'int', 'Filtrar por etapa do funil (1-10)'],
                ['temperature', 'int', 'Filtrar por temperatura (1-3)'],
                ['source', 'int', 'Filtrar por origem (1-20)'],
                ['lead_type', 'int', 'Filtrar por tipo (1-2)'],
                ['broker_id', 'uuid', 'Filtrar por corretor'],
                ['search', 'string', 'Buscar por nome, email ou telefone'],
                ['created_after', 'date', 'Leads criados após esta data'],
                ['created_before', 'date', 'Leads criados antes desta data'],
              ].map(([param, type, desc], idx) => (
                <tr key={idx}>
                  <td className="py-2 px-3 font-mono text-purple-400">{param}</td>
                  <td className="py-2 px-3 text-gray-500">{type}</td>
                  <td className="py-2 px-3 text-gray-300">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo de Requisição</h3>
        <CodeBlock
          id="leads-list-example"
          language="curl"
          code={`curl -X GET "${FULL_API_URL}/leads?page=1&limit=20&stage=3&temperature=2" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json"`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta</h3>
        <CodeBlock
          id="leads-list-response"
          language="json"
          code={`{
  "success": true,
  "data": {
    "leads": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Maria Santos",
        "phone": "11999998888",
        "email": "maria@email.com",
        "stage": 3,
        "stage_name": "Qualificado",
        "temperature": 2,
        "temperature_name": "Morno",
        "source": 1,
        "source_name": "Instagram",
        "lead_type": 1,
        "lead_type_name": "Interessado",
        "broker_id": "broker-uuid",
        "broker_name": "João Corretor",
        "created_at": "2026-01-20T10:00:00Z",
        "updated_at": "2026-01-23T14:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "total_pages": 8
    }
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>
    </div>
  );

  const renderLeadsGet = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">GET - Buscar Lead por ID</h1>
        <p className="text-gray-400">Retorna os detalhes completos de um lead específico.</p>
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <MethodBadge method="GET" />
        <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/leads/:id</code>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Parâmetros de URL</h3>
        <div className="flex items-center gap-4 p-3 bg-gray-900/50 rounded-lg">
          <code className="text-purple-400 font-mono">:id</code>
          <span className="text-gray-400">UUID do lead</span>
          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">Obrigatório</span>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo</h3>
        <CodeBlock
          id="leads-get-example"
          language="curl"
          code={`curl -X GET "${FULL_API_URL}/leads/550e8400-e29b-41d4-a716-446655440000" \\
  -H "Authorization: Bearer octo_sk_your_api_key"`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <InfoCard icon={AlertCircle} title="Lead não encontrado" variant="warning">
        Se o lead não existir, a API retornará erro 404 com a mensagem "Lead not found".
      </InfoCard>
    </div>
  );

  const renderLeadsGetByPhone = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">GET - Buscar Lead por Telefone</h1>
        <p className="text-gray-400">Verifica se um lead já existe pelo número de telefone. Útil para evitar duplicatas.</p>
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <MethodBadge method="GET" />
        <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/leads/phone/:phone</code>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Parâmetros de URL</h3>
        <div className="flex items-center gap-4 p-3 bg-gray-900/50 rounded-lg">
          <code className="text-purple-400 font-mono">:phone</code>
          <span className="text-gray-400">Telefone completo: código do país + DDD + número (apenas números, ex: 5511999998888)</span>
          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">Obrigatório</span>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo</h3>
        <CodeBlock
          id="leads-phone-example"
          language="curl"
          code={`curl -X GET "${FULL_API_URL}/leads/phone/5511999998888" \\
  -H "Authorization: Bearer octo_sk_your_api_key"`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta - Lead Encontrado</h3>
        <CodeBlock
          id="leads-phone-found"
          language="json"
          code={`{
  "success": true,
  "exists": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Maria Santos",
    "phone": "5511999998888",
    "stage": 3
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta - Lead Não Encontrado</h3>
        <CodeBlock
          id="leads-phone-notfound"
          language="json"
          code={`{
  "success": true,
  "exists": false,
  "data": null
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <InfoCard icon={Phone} title="Dica" variant="success">
        Use este endpoint antes de criar um lead para verificar duplicatas. Ou use o endpoint /leads/upsert para criar ou atualizar automaticamente.
      </InfoCard>
    </div>
  );

  const renderLeadsCreate = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">POST - Criar Lead</h1>
        <p className="text-gray-400">Cria um novo lead no CRM.</p>
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <MethodBadge method="POST" />
        <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/leads</code>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Campos do Body</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-3 font-medium text-gray-400">Campo</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Tipo</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Req.</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {[
                ['name', 'string', true, 'Nome completo do lead'],
                ['phone', 'string', true, 'Telefone com DDD (ex: 11999998888)'],
                ['email', 'string', false, 'E-mail do lead'],
                ['lead_type', 'int', true, '1 = Interessado, 2 = Proprietário'],
                ['source', 'int', false, 'Origem do lead (1-20)'],
                ['stage', 'int', false, 'Etapa do funil (1-10, padrão: 1)'],
                ['temperature', 'int', false, 'Temperatura (1-3, padrão: 1)'],
                ['broker_id', 'uuid', false, 'ID do corretor responsável'],
                ['property_code', 'string', false, 'Código do imóvel de interesse'],
                ['property_value', 'number', false, 'Valor do imóvel'],
                ['business_type', 'int', false, 'Tipo de negócio (1-4)'],
                ['comments', 'string', false, 'Observações adicionais'],
              ].map(([field, type, req, desc], idx) => (
                <tr key={idx}>
                  <td className="py-2 px-3 font-mono text-purple-400">{field}</td>
                  <td className="py-2 px-3 text-gray-500">{type}</td>
                  <td className="py-2 px-3">
                    {req ? (
                      <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">Sim</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-gray-500/20 text-gray-400 text-xs rounded">Não</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-gray-300">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo Completo</h3>
        <CodeBlock
          id="leads-create-full"
          language="curl"
          code={`curl -X POST "${FULL_API_URL}/leads" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Maria Santos",
    "phone": "11999998888",
    "email": "maria@email.com",
    "lead_type": 1,
    "source": 1,
    "stage": 1,
    "temperature": 2,
    "broker_id": "broker-uuid-here",
    "property_code": "APT-001",
    "property_value": 450000,
    "business_type": 1,
    "comments": "Interessada em apartamento 2 quartos na zona sul"
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta de Sucesso (201)</h3>
        <CodeBlock
          id="leads-create-response"
          language="json"
          code={`{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Maria Santos",
    "phone": "11999998888",
    "email": "maria@email.com",
    "lead_type": 1,
    "source": 1,
    "stage": 1,
    "temperature": 2,
    "created_at": "2026-01-23T14:00:00Z"
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>
    </div>
  );

  const renderLeadsUpdate = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">PUT/PATCH - Atualizar Lead</h1>
        <p className="text-gray-400">Atualiza os dados de um lead existente.</p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
          <MethodBadge method="PUT" />
          <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/leads/:id</code>
          <span className="text-xs text-gray-500">Atualização completa</span>
        </div>
        <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
          <MethodBadge method="PATCH" />
          <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/leads/:id</code>
          <span className="text-xs text-gray-500">Atualização parcial</span>
        </div>
      </div>

      <InfoCard icon={Info} title="Diferença entre PUT e PATCH" variant="info">
        <strong>PUT</strong>: Substitui todos os campos do lead. Campos não enviados serão limpos.<br/>
        <strong>PATCH</strong>: Atualiza apenas os campos enviados. Demais campos permanecem inalterados.
      </InfoCard>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo - Atualização Parcial</h3>
        <CodeBlock
          id="leads-update-patch"
          language="curl"
          code={`curl -X PATCH "${FULL_API_URL}/leads/550e8400-e29b-41d4-a716-446655440000" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "stage": 4,
    "temperature": 3,
    "comments": "Visita agendada para sábado"
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Endpoints Específicos</h3>
        <div className="space-y-2">
          {[
            { method: 'PATCH', path: '/leads/:id/stage', desc: 'Alterar etapa do funil', body: '{"stage": 4}' },
            { method: 'PATCH', path: '/leads/:id/temperature', desc: 'Alterar temperatura', body: '{"temperature": 3}' },
            { method: 'PATCH', path: '/leads/:id/broker', desc: 'Atribuir corretor', body: '{"broker_id": "uuid"}' },
          ].map((endpoint, idx) => (
            <div key={idx} className="flex items-center gap-4 p-3 bg-gray-900/50 rounded-lg">
              <MethodBadge method={endpoint.method} />
              <code className="text-sm font-mono text-gray-300 flex-1">{endpoint.path}</code>
              <code className="text-xs text-gray-500">{endpoint.body}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderLeadsDelete = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">DELETE - Arquivar Lead</h1>
        <p className="text-gray-400">Move um lead para o arquivo (soft delete). O lead pode ser restaurado posteriormente.</p>
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <MethodBadge method="DELETE" />
        <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/leads/:id</code>
      </div>

      <InfoCard icon={AlertCircle} title="Atenção" variant="warning">
        Esta operação não exclui permanentemente o lead. Ele é movido para o arquivo (etapa 10 - Arquivado) e pode ser restaurado.
      </InfoCard>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo</h3>
        <CodeBlock
          id="leads-delete-example"
          language="curl"
          code={`curl -X DELETE "${FULL_API_URL}/leads/550e8400-e29b-41d4-a716-446655440000" \\
  -H "Authorization: Bearer octo_sk_your_api_key"`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta de Sucesso</h3>
        <CodeBlock
          id="leads-delete-response"
          language="json"
          code={`{
  "success": true,
  "message": "Lead arquivado com sucesso",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "archived_at": "2026-01-23T14:00:00Z"
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>
    </div>
  );

  const renderLeadsBatch = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">POST - Operações em Lote</h1>
        <p className="text-gray-400">Crie ou atualize múltiplos leads em uma única requisição.</p>
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <MethodBadge method="POST" />
        <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/leads/batch</code>
      </div>

      <InfoCard icon={Zap} title="Limite" variant="info">
        Máximo de 100 leads por requisição. Para volumes maiores, divida em múltiplas requisições.
      </InfoCard>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo - Criar Múltiplos Leads</h3>
        <CodeBlock
          id="leads-batch-create"
          language="curl"
          code={`curl -X POST "${FULL_API_URL}/leads/batch" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "operation": "create",
    "leads": [
      {
        "name": "Maria Santos",
        "phone": "11999998888",
        "lead_type": 1,
        "source": 1
      },
      {
        "name": "João Silva",
        "phone": "11888887777",
        "lead_type": 1,
        "source": 2
      }
    ]
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo - Upsert em Lote</h3>
        <CodeBlock
          id="leads-batch-upsert"
          language="curl"
          code={`curl -X POST "${FULL_API_URL}/leads/batch" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "operation": "upsert",
    "match_field": "phone",
    "leads": [
      {
        "name": "Maria Santos",
        "phone": "11999998888",
        "stage": 3
      }
    ]
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta</h3>
        <CodeBlock
          id="leads-batch-response"
          language="json"
          code={`{
  "success": true,
  "data": {
    "total": 2,
    "created": 1,
    "updated": 1,
    "errors": 0,
    "results": [
      { "phone": "11999998888", "status": "updated", "id": "uuid-1" },
      { "phone": "11888887777", "status": "created", "id": "uuid-2" }
    ]
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>
    </div>
  );

  // ============================================
  // CORRETORES - ENDPOINTS
  // ============================================

  const renderBrokersList = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">GET - Listar Corretores</h1>
        <p className="text-gray-400">Retorna a lista de todos os corretores cadastrados no CRM.</p>
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <MethodBadge method="GET" />
        <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/brokers</code>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Parâmetros de Query (Opcionais)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-3 font-medium text-gray-400">Parâmetro</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Tipo</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {[
                ['active', 'boolean', 'Filtrar apenas corretores ativos (true/false)'],
                ['search', 'string', 'Buscar por nome ou email'],
              ].map(([param, type, desc], idx) => (
                <tr key={idx}>
                  <td className="py-2 px-3 font-mono text-purple-400">{param}</td>
                  <td className="py-2 px-3 text-gray-500">{type}</td>
                  <td className="py-2 px-3 text-gray-300">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo</h3>
        <CodeBlock
          id="brokers-list-example"
          language="curl"
          code={`curl -X GET "${FULL_API_URL}/brokers?active=true" \\
  -H "Authorization: Bearer octo_sk_your_api_key"`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta</h3>
        <CodeBlock
          id="brokers-list-response"
          language="json"
          code={`{
  "success": true,
  "data": {
    "brokers": [
      {
        "id": "broker-uuid-001",
        "name": "Ana Costa",
        "email": "ana@imobiliaria.com",
        "phone": "11999991111",
        "creci": "123456-F",
        "active": true,
        "leads_count": 45,
        "created_at": "2025-06-01T10:00:00Z"
      },
      {
        "id": "broker-uuid-002",
        "name": "Carlos Silva",
        "email": "carlos@imobiliaria.com",
        "phone": "11999992222",
        "creci": "654321-F",
        "active": true,
        "leads_count": 32,
        "created_at": "2025-07-15T10:00:00Z"
      }
    ],
    "total": 2
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>
    </div>
  );

  const renderBrokersGet = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">GET - Buscar Corretor por ID</h1>
        <p className="text-gray-400">Retorna os detalhes de um corretor específico, incluindo estatísticas.</p>
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <MethodBadge method="GET" />
        <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/brokers/:id</code>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo</h3>
        <CodeBlock
          id="brokers-get-example"
          language="curl"
          code={`curl -X GET "${FULL_API_URL}/brokers/broker-uuid-001" \\
  -H "Authorization: Bearer octo_sk_your_api_key"`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta</h3>
        <CodeBlock
          id="brokers-get-response"
          language="json"
          code={`{
  "success": true,
  "data": {
    "id": "broker-uuid-001",
    "name": "Ana Costa",
    "email": "ana@imobiliaria.com",
    "phone": "11999991111",
    "creci": "123456-F",
    "active": true,
    "stats": {
      "total_leads": 45,
      "leads_by_stage": {
        "1": 5,
        "2": 8,
        "3": 12,
        "4": 10,
        "5": 6,
        "9": 4
      },
      "conversion_rate": 8.9
    }
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>
    </div>
  );

  const renderBrokersAssign = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">POST - Atribuir Lead a Corretor</h1>
        <p className="text-gray-400">Atribui um ou mais leads a um corretor específico.</p>
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <MethodBadge method="POST" />
        <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/brokers/:id/assign</code>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Campos do Body</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-3 font-medium text-gray-400">Campo</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Tipo</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              <tr>
                <td className="py-2 px-3 font-mono text-purple-400">lead_ids</td>
                <td className="py-2 px-3 text-gray-500">array[uuid]</td>
                <td className="py-2 px-3 text-gray-300">Lista de IDs dos leads a atribuir</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo - Atribuir Único Lead</h3>
        <CodeBlock
          id="brokers-assign-single"
          language="curl"
          code={`curl -X POST "${FULL_API_URL}/brokers/broker-uuid-001/assign" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "lead_ids": ["550e8400-e29b-41d4-a716-446655440000"]
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo - Atribuir Múltiplos Leads</h3>
        <CodeBlock
          id="brokers-assign-multiple"
          language="curl"
          code={`curl -X POST "${FULL_API_URL}/brokers/broker-uuid-001/assign" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "lead_ids": [
      "550e8400-e29b-41d4-a716-446655440000",
      "550e8400-e29b-41d4-a716-446655440001",
      "550e8400-e29b-41d4-a716-446655440002"
    ]
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta</h3>
        <CodeBlock
          id="brokers-assign-response"
          language="json"
          code={`{
  "success": true,
  "data": {
    "broker_id": "broker-uuid-001",
    "broker_name": "Ana Costa",
    "assigned_count": 3,
    "leads": [
      { "id": "uuid-1", "name": "Maria Santos" },
      { "id": "uuid-2", "name": "João Silva" },
      { "id": "uuid-3", "name": "Pedro Oliveira" }
    ]
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <InfoCard icon={UserCheck} title="Distribuição Automática" variant="success">
        Configure regras de distribuição automática no painel do CRM para atribuir leads automaticamente aos corretores disponíveis.
      </InfoCard>
    </div>
  );

  // ============================================
  // ROLETA DE CORRETORES
  // ============================================

  const renderRoletaGet = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">GET - Consultar Roleta</h1>
        <p className="text-gray-400">Retorna todos os corretores ativos na roleta e quem será o próximo a receber um lead.</p>
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <MethodBadge method="GET" />
        <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/roleta</code>
      </div>

      <InfoCard icon={RefreshCw} title="Como funciona a Roleta" variant="info">
        A roleta distribui leads em modo round-robin: cada novo lead é enviado ao próximo corretor da fila.
        O GET desta rota apenas <strong>consulta</strong> o estado atual — não avança a fila.
        Configure os participantes em <strong>Configurações &gt; Roleta</strong> no CRM.
      </InfoCard>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo de Requisição</h3>
        <CodeBlock
          id="roleta-get-curl"
          language="curl"
          code={`curl -X GET "${FULL_API_URL}/roleta" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json"`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta</h3>
        <CodeBlock
          id="roleta-get-response"
          language="json"
          code={`{
  "success": true,
  "message": "Roleta com 3 corretor(es). Próximo: Ana Costa",
  "data": {
    "total": 3,
    "source": "roleta_participantes",
    "next_broker": {
      "position": 1,
      "name": "Ana Costa",
      "broker_id": "uuid-ana",
      "phone": "11999990001",
      "email": "ana@imobiliaria.com"
    },
    "brokers": [
      {
        "position": 1,
        "broker_id": "uuid-ana",
        "name": "Ana Costa",
        "phone": "11999990001",
        "email": "ana@imobiliaria.com",
        "added_at": "2026-01-01T10:00:00Z",
        "is_next": true
      },
      {
        "position": 2,
        "broker_id": "uuid-carlos",
        "name": "Carlos Souza",
        "phone": "11999990002",
        "email": "carlos@imobiliaria.com",
        "added_at": "2026-01-01T10:00:00Z",
        "is_next": false
      },
      {
        "position": 3,
        "broker_id": "uuid-mariana",
        "name": "Mariana Lima",
        "phone": "11999990003",
        "email": "mariana@imobiliaria.com",
        "added_at": "2026-01-01T10:00:00Z",
        "is_next": false
      }
    ]
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Campos da Resposta</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-3 font-medium text-gray-400">Campo</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Tipo</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {[
                ['data.total', 'number', 'Total de corretores na roleta'],
                ['data.source', 'string', 'Fonte: roleta_participantes ou tenant_memberships'],
                ['data.next_broker', 'object', 'Dados do próximo corretor a receber lead'],
                ['data.next_broker.position', 'number', 'Posição na fila (1 = primeiro)'],
                ['data.next_broker.is_next', 'boolean', 'true = será o próximo na fila'],
                ['data.brokers', 'array', 'Lista completa de corretores com posição e status'],
              ].map(([field, type, desc], idx) => (
                <tr key={idx}>
                  <td className="py-2 px-3 font-mono text-purple-400">{field}</td>
                  <td className="py-2 px-3 text-gray-500">{type}</td>
                  <td className="py-2 px-3 text-gray-300">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderRoletaLead = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">POST - Cadastrar Lead via Roleta</h1>
        <p className="text-gray-400">Cadastra um lead e distribui automaticamente para o próximo corretor da roleta. A distribuição é forçada — ignora imóvel e pipeline.</p>
      </div>

      <div className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <MethodBadge method="POST" />
        <code className="text-sm font-mono text-gray-200">{FULL_API_URL}/leads/roleta</code>
      </div>

      <InfoCard icon={Zap} title="Distribuição Garantida" variant="success">
        Diferente de <code className="bg-gray-700 px-1 rounded">POST /leads</code>, este endpoint <strong>sempre distribui via roleta</strong>,
        independente de imóvel ou corretor especificado no body. Ideal para chatbots, landing pages e integrações externas.
      </InfoCard>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Campos do Body</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-3 font-medium text-gray-400">Campo</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Tipo</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Obrigatório</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Descrição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {[
                ['name', 'string', '✓ (ou phone)', 'Nome do lead'],
                ['phone', 'string', '✓ (ou name)', 'Telefone com DDD'],
                ['email', 'string', 'Não', 'E-mail do lead'],
                ['source', 'string', 'Não', 'Origem: WhatsApp, Site, API...'],
                ['temperature', 'string', 'Não', 'cold / warm / hot'],
                ['comments', 'string', 'Não', 'Mensagem ou observação'],
                ['property_code', 'string', 'Não', 'Código do imóvel de interesse (informativo)'],
              ].map(([field, type, req, desc], idx) => (
                <tr key={idx}>
                  <td className="py-2 px-3 font-mono text-purple-400">{field}</td>
                  <td className="py-2 px-3 text-gray-500">{type}</td>
                  <td className="py-2 px-3 text-emerald-400 text-xs">{req}</td>
                  <td className="py-2 px-3 text-gray-300">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo de Requisição</h3>
        <CodeBlock
          id="roleta-lead-curl"
          language="curl"
          code={`curl -X POST "${FULL_API_URL}/leads/roleta" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "João Silva",
    "phone": "11999998888",
    "email": "joao@email.com",
    "source": "WhatsApp",
    "temperature": "warm",
    "comments": "Interessado em apartamentos no centro"
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta (201 Created)</h3>
        <CodeBlock
          id="roleta-lead-response"
          language="json"
          code={`{
  "success": true,
  "message": "Lead cadastrado com sucesso. Distribuído na roleta para o corretor Ana Costa.",
  "assigned_broker": {
    "name": "Ana Costa",
    "id": "uuid-ana",
    "phone": "11999990001",
    "email": "ana@imobiliaria.com"
  },
  "data": {
    "id": 1042,
    "name": "João Silva",
    "phone": "11999998888",
    "email": "joao@email.com",
    "source": "WhatsApp",
    "stage": 1,
    "temperature": "warm",
    "assigned_agent": "Ana Costa",
    "created_at": "2026-03-17T20:00:00Z"
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Erro: Nenhum Corretor na Roleta</h3>
        <CodeBlock
          id="roleta-lead-error"
          language="json"
          code={`{
  "success": false,
  "error": {
    "code": "NO_BROKER_AVAILABLE",
    "message": "Nenhum corretor disponível na roleta. Configure participantes em Configurações > Roleta."
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <InfoCard icon={AlertCircle} title="Diferença entre endpoints" variant="warning">
        <ul className="list-disc list-inside space-y-1 text-sm mt-1">
          <li><code className="bg-gray-700 px-1 rounded">POST /leads</code> — pipeline completo: Kenlo → XML → Meus Imóveis → Roleta (fallback)</li>
          <li><code className="bg-gray-700 px-1 rounded">POST /leads/roleta</code> — roleta direta, sem pipeline, sempre distribui</li>
        </ul>
      </InfoCard>
    </div>
  );

  // ============================================
  // TIPOS DE LEAD E NEGÓCIO
  // ============================================

  const renderLeadTypes = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Tipos de Lead</h1>
        <p className="text-gray-400">Classifique leads entre interessados (compradores/locatários) e proprietários (vendedores/locadores).</p>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Tipos Disponíveis</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {LEAD_TYPES.map((type) => (
            <div key={type.id} className="p-5 bg-gray-900/50 rounded-xl border border-gray-700/50">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{type.icon}</span>
                <div>
                  <p className="font-semibold text-white text-lg">{type.name}</p>
                  <p className="text-sm text-gray-500">{type.name_en}</p>
                </div>
              </div>
              <p className="text-sm text-gray-400 mb-3">{type.description}</p>
              <code className="text-sm bg-gray-800 text-purple-400 px-3 py-1.5 rounded border border-gray-700">
                lead_type: {type.id}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Uso na API</h3>
        <CodeBlock
          id="lead-types-example"
          language="json"
          code={`{
  "name": "Maria Santos",
  "phone": "11999998888",
  "lead_type": 1,  // 1 = Interessado (quer comprar/alugar)
  "business_type": 1  // 1 = Venda
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <InfoCard icon={Tag} title="Importante" variant="info">
        O tipo de lead é obrigatório ao criar um novo lead. Use 1 para interessados em comprar/alugar e 2 para proprietários que querem vender/alugar seu imóvel.
      </InfoCard>
    </div>
  );

  const renderBusinessTypes = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Tipos de Negócio</h1>
        <p className="text-gray-400">Defina o tipo de transação imobiliária do interesse do lead.</p>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Tipos Disponíveis</h3>
        <div className="space-y-3">
          {BUSINESS_TYPES.map((type) => (
            <div key={type.id} className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                <span className="text-blue-400 font-bold">{type.id}</span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white">{type.name}</p>
                <p className="text-sm text-gray-400">{type.description}</p>
              </div>
              <code className="text-xs bg-gray-800 text-purple-400 px-3 py-1 rounded border border-gray-700">
                business_type: {type.id}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Exemplo de Uso</h3>
        <CodeBlock
          id="business-types-example"
          language="curl"
          code={`curl -X POST "${FULL_API_URL}/leads" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Maria Santos",
    "phone": "11999998888",
    "lead_type": 1,
    "business_type": 2,
    "comments": "Procura apartamento para alugar"
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>
    </div>
  );

  // ============================================
  // WEBHOOKS
  // ============================================

  const renderWebhooks = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Webhooks</h1>
        <p className="text-gray-400">Receba notificações em tempo real quando eventos ocorrerem no CRM.</p>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Eventos Disponíveis</h3>
        <div className="space-y-2">
          {[
            { event: 'lead.created', desc: 'Novo lead criado' },
            { event: 'lead.updated', desc: 'Lead atualizado' },
            { event: 'lead.stage_changed', desc: 'Etapa do funil alterada' },
            { event: 'lead.assigned', desc: 'Lead atribuído a corretor' },
            { event: 'lead.archived', desc: 'Lead arquivado' },
          ].map((item, idx) => (
            <div key={idx} className="flex items-center gap-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700/50">
              <code className="text-sm font-mono text-purple-400">{item.event}</code>
              <span className="text-sm text-gray-400">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Formato do Payload</h3>
        <CodeBlock
          id="webhook-payload"
          language="json"
          code={`{
  "event": "lead.stage_changed",
  "timestamp": "2026-01-23T14:00:00Z",
  "data": {
    "lead_id": "550e8400-e29b-41d4-a716-446655440000",
    "lead_name": "Maria Santos",
    "previous_stage": 3,
    "new_stage": 4,
    "changed_by": "user-uuid"
  },
  "webhook_id": "webhook-uuid",
  "signature": "sha256=..."
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <InfoCard icon={Shield} title="Segurança" variant="warning">
        Sempre valide a assinatura do webhook antes de processar. A assinatura é calculada usando HMAC-SHA256 com seu webhook secret.
      </InfoCard>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Configurar Webhook</h3>
        <p className="text-sm text-gray-400 mb-4">
          Configure webhooks através do painel de Integrações do CRM ou via API:
        </p>
        <CodeBlock
          id="webhook-create"
          language="curl"
          code={`curl -X POST "${FULL_API_URL}/webhooks" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://seu-servidor.com/webhook",
    "events": ["lead.created", "lead.stage_changed"],
    "active": true
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>
    </div>
  );

  const renderFunnelStages = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Etapas do Funil de Vendas</h1>
        <p className="text-gray-400">Gerencie a progressão dos leads através das etapas do funil. Use o ID numérico (1-10) nas requisições.</p>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Etapas Disponíveis</h3>
        <div className="space-y-2">
          {FUNNEL_STAGES.map((stage) => (
            <div key={stage.id} className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700/50 hover:border-blue-500/30 transition-colors">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center border"
                style={{ backgroundColor: `${stage.color}20`, borderColor: `${stage.color}50` }}
              >
                <span style={{ color: stage.color }} className="font-bold">{stage.id}</span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-white">{stage.name}</p>
                <p className="text-sm text-gray-400">{stage.description}</p>
              </div>
              <code className="text-xs bg-gray-800 text-purple-400 px-3 py-1 rounded border border-gray-700">
                stage: {stage.id}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Alterar Etapa do Lead</h3>
        <div className="flex items-center gap-4 mb-4">
          <MethodBadge method="PATCH" />
          <code className="text-sm font-mono text-gray-300">/leads/:id/stage</code>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Mova um lead para uma etapa diferente do funil usando o número da etapa (1-10).
        </p>
        <CodeBlock
          id="funnel-change"
          language="curl"
          code={`curl -X PATCH "${FULL_API_URL}/leads/550e8400-e29b-41d4-a716-446655440000/stage" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"stage": 4}'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta de Sucesso</h3>
        <CodeBlock
          id="funnel-response"
          language="json"
          code={`{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Maria Santos",
    "stage": 4,
    "stage_name": "Visita Agendada",
    "previous_stage": 3,
    "updated_at": "2026-01-23T12:00:00Z"
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <InfoCard icon={Layers} title="Validação de Etapa" variant="info">
        Apenas etapas de 1 a 10 são válidas. Tentar definir uma etapa inválida retornará erro 400.
      </InfoCard>
    </div>
  );

  const renderTemperatures = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Temperatura do Lead</h1>
        <p className="text-gray-400">Classifique leads por nível de interesse e urgência. Use o ID numérico (1-3) ou o valor string.</p>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Temperaturas Disponíveis</h3>
        <div className="grid grid-cols-3 gap-4">
          {TEMPERATURES.map((temp) => (
            <div 
              key={temp.id} 
              className="p-4 rounded-xl border text-center"
              style={{ backgroundColor: `${temp.color}15`, borderColor: `${temp.color}40` }}
            >
              <span className="text-3xl">{temp.emoji}</span>
              <p className="font-semibold mt-2" style={{ color: temp.color }}>{temp.name}</p>
              <p className="text-xs text-gray-400 mt-1">{temp.description}</p>
              <div className="flex flex-col gap-1 mt-3">
                <code className="text-xs bg-gray-900/50 text-gray-300 px-2 py-1 rounded">
                  id: {temp.id}
                </code>
                <code className="text-xs bg-gray-900/50 text-gray-300 px-2 py-1 rounded">
                  "{temp.value}"
                </code>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Alterar Temperatura</h3>
        <div className="flex items-center gap-4 mb-4">
          <MethodBadge method="PATCH" />
          <code className="text-sm font-mono text-gray-300">/leads/:id/temperature</code>
        </div>
        <CodeBlock
          id="temp-change"
          language="curl"
          code={`curl -X PATCH "${FULL_API_URL}/leads/550e8400-e29b-41d4-a716-446655440000/temperature" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"temperature": 3}'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Resposta de Sucesso</h3>
        <CodeBlock
          id="temp-response"
          language="json"
          code={`{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Maria Santos",
    "temperature": 3,
    "temperature_name": "Quente",
    "previous_temperature": 2,
    "updated_at": "2026-01-23T12:00:00Z"
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>
    </div>
  );

  const renderErrors = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Códigos de Erro</h1>
        <p className="text-gray-400">Referência completa dos códigos de erro da API.</p>
      </div>

      <div className="space-y-3">
        {[
          { code: '200', label: 'OK', desc: 'Requisição bem-sucedida', variant: 'success' },
          { code: '201', label: 'Created', desc: 'Recurso criado com sucesso', variant: 'success' },
          { code: '400', label: 'Bad Request', desc: 'Parâmetros inválidos ou ausentes', variant: 'warning' },
          { code: '401', label: 'Unauthorized', desc: 'API Key ausente ou inválida', variant: 'error' },
          { code: '403', label: 'Forbidden', desc: 'Sem permissão para o recurso', variant: 'error' },
          { code: '404', label: 'Not Found', desc: 'Recurso não encontrado', variant: 'error' },
          { code: '422', label: 'Unprocessable', desc: 'Dados válidos mas não processáveis', variant: 'warning' },
          { code: '429', label: 'Too Many Requests', desc: 'Rate limit excedido', variant: 'warning' },
          { code: '500', label: 'Server Error', desc: 'Erro interno do servidor', variant: 'error' }
        ].map((error, idx) => {
          const variants: Record<string, string> = {
            success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
            warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
            error: 'bg-red-500/10 border-red-500/30 text-red-400'
          };
          const badgeVariants: Record<string, string> = {
            success: 'bg-emerald-500/20 text-emerald-400',
            warning: 'bg-amber-500/20 text-amber-400',
            error: 'bg-red-500/20 text-red-400'
          };
          return (
            <div key={idx} className={`flex items-center gap-4 p-4 rounded-xl border ${variants[error.variant]}`}>
              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${badgeVariants[error.variant]}`}>
                {error.code}
              </span>
              <div className="flex-1">
                <p className="font-medium text-white">{error.label}</p>
                <p className="text-sm text-gray-400">{error.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Formato de Erro</h3>
        <CodeBlock
          id="error-format"
          language="json"
          code={`{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "O campo 'name' é obrigatório",
    "field": "name"
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>
    </div>
  );

  const renderExamples = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Practical Examples</h1>
        <p className="text-gray-400">Common use cases for API integration.</p>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-2">1. Create Lead from API</h3>
        <p className="text-sm text-gray-400 mb-4">When a new contact comes from your lead capture system:</p>
        <CodeBlock
          id="example-create"
          language="curl"
          code={`curl -X POST "${FULL_API_URL}/leads" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Maria Santos",
    "phone": "11999998888",
    "email": "maria@email.com",
    "source": "website",
    "stage": 1,
    "temperature": "warm",
    "comments": "Interested in 2-bedroom apartment"
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-2">2. Check if Lead Exists Before Creating</h3>
        <p className="text-sm text-gray-400 mb-4">Avoid duplicates by checking phone number first:</p>
        <CodeBlock
          id="example-check"
          language="curl"
          code={`# Step 1: Check if lead exists
curl -X GET "${FULL_API_URL}/leads/phone/11999998888" \\
  -H "Authorization: Bearer octo_sk_your_api_key"

# Step 2: If not exists, create new lead
curl -X POST "${FULL_API_URL}/leads" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "New Lead", "phone": "11999998888"}'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-2">3. Update Lead Stage After Visit</h3>
        <p className="text-sm text-gray-400 mb-4">Move lead to next stage after property visit:</p>
        <CodeBlock
          id="example-stage"
          language="curl"
          code={`curl -X PATCH "${FULL_API_URL}/leads/550e8400-e29b-41d4-a716-446655440000/stage" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"stage": 5}'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-2">4. Create or Update Lead (Upsert)</h3>
        <p className="text-sm text-gray-400 mb-4">Automatically create or update based on phone:</p>
        <CodeBlock
          id="example-upsert"
          language="curl"
          code={`curl -X POST "${FULL_API_URL}/leads/upsert" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone": "11999998888",
    "name": "Maria Santos",
    "temperature": "hot",
    "stage": 6,
    "comments": "Ready to negotiate"
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-2">5. Assign Lead to Agent</h3>
        <CodeBlock
          id="example-assign"
          language="curl"
          code={`curl -X PATCH "${FULL_API_URL}/leads/550e8400-e29b-41d4-a716-446655440000/agent" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "assigned_agent": "Ana Costa",
    "assigned_agent_id": "agent-123"
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-2">6. Filter Leads by Multiple Criteria</h3>
        <CodeBlock
          id="example-filter"
          language="curl"
          code={`curl -X GET "${FULL_API_URL}/leads?stage=4&temperature=hot&source=website&limit=20" \\
  -H "Authorization: Bearer octo_sk_your_api_key"`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>
    </div>
  );

  const renderSources = () => {
    const categories = [
      { key: 'ai', label: 'Assistente Virtual IA', color: 'blue' },
      { key: 'channels', label: 'Canais Padrões e Redes Sociais', color: 'amber' },
      { key: 'portal', label: 'Portais Imobiliários', color: 'emerald' }
    ];
    
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Origens do Lead (Fontes)</h1>
          <p className="text-gray-400">Rastreie de onde seus leads estão vindo. Use o ID numérico da origem nas requisições.</p>
        </div>

        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="font-semibold text-white mb-4">Origens Disponíveis</h3>
          <div className="space-y-6">
            {categories.map((cat) => {
              const sourcesInCategory = LEAD_SOURCES.filter(s => s.category === cat.key);
              if (sourcesInCategory.length === 0) return null;
              return (
                <div key={cat.key}>
                  <h4 className="text-sm font-medium text-gray-400 mb-3 uppercase tracking-wide">{cat.label}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {sourcesInCategory.map((source) => (
                      <div key={source.id} className="flex items-start gap-4 p-4 bg-gray-900/50 rounded-xl border border-gray-700/50 hover:border-gray-600/50 transition-all hover:bg-gray-900/70">
                        <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 border border-gray-700/50 p-2">
                          <img 
                            src={source.logo} 
                            alt={source.name}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement!.innerHTML = `<span class="text-2xl">${source.icon}</span>`;
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-sm mb-1">{source.name}</p>
                          <p className="text-xs text-gray-400 leading-relaxed">{source.description}</p>
                        </div>
                        <code className="text-xs bg-gray-800 text-purple-400 px-2.5 py-1 rounded-md font-mono border border-gray-700/50 flex-shrink-0">
                          ID: {source.id}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="font-semibold text-white mb-4">Definir Origem ao Criar Lead</h3>
          <CodeBlock
            id="source-create"
            language="curl"
            code={`curl -X POST "${FULL_API_URL}/leads" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Maria Santos",
    "phone": "11999998888",
    "source": 0
  }'`}
            copiedCode={copiedCode}
            onCopy={copyCode}
          />
          <p className="text-xs text-gray-400 mt-3">
            💡 <strong>Dica:</strong> Use <code className="text-purple-400 bg-gray-900 px-1.5 py-0.5 rounded">source: 0</code> para leads captados pela LIA Serhant (Assistente IA)
          </p>
        </div>

        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h3 className="font-semibold text-white mb-4">Tabela de Referência Rápida</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-3 font-medium text-gray-400">Logo</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-400">ID</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-400">Nome</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-400">Categoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {LEAD_SOURCES.map((source) => (
                  <tr key={source.id} className="hover:bg-gray-900/30">
                    <td className="py-2 px-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center p-1.5 border border-gray-700/50">
                        <img 
                          src={source.logo} 
                          alt={source.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.innerHTML = `<span class="text-sm">${source.icon}</span>`;
                          }}
                        />
                      </div>
                    </td>
                    <td className="py-2 px-3 font-mono text-purple-400">{source.id}</td>
                    <td className="py-2 px-3 text-white">{source.name}</td>
                    <td className="py-2 px-3 text-gray-400 capitalize">{source.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderAgents = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Real Estate Agents</h1>
        <p className="text-gray-400">Assign and manage leads for your agents.</p>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Assign Agent to Lead</h3>
        <div className="flex items-center gap-4 mb-4">
          <MethodBadge method="PATCH" />
          <code className="text-sm font-mono text-gray-300">/leads/:id/agent</code>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Assign a real estate agent to be responsible for a specific lead.
        </p>
        <CodeBlock
          id="agent-assign"
          language="curl"
          code={`curl -X PATCH "${FULL_API_URL}/leads/550e8400-e29b-41d4-a716-446655440000/agent" \\
  -H "Authorization: Bearer octo_sk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "assigned_agent": "Ana Costa",
    "assigned_agent_id": "agent-123"
  }'`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Filter Leads by Agent</h3>
        <p className="text-sm text-gray-400 mb-4">
          Get all leads assigned to a specific agent.
        </p>
        <CodeBlock
          id="agent-filter"
          language="curl"
          code={`curl -X GET "${FULL_API_URL}/leads?assigned_agent=Ana Costa" \\
  -H "Authorization: Bearer octo_sk_your_api_key"`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <InfoCard icon={UserCheck} title="Agent Management" variant="info">
        Agent names and IDs should match your CRM user database. The API accepts both name and ID for flexibility.
      </InfoCard>
    </div>
  );

  const renderRateLimits = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Rate Limits</h1>
        <p className="text-gray-400">Understand API usage limits and best practices.</p>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Current Limits</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
            <div>
              <p className="font-semibold text-white">Requests per Minute</p>
              <p className="text-sm text-gray-400">Per API Key</p>
            </div>
            <span className="text-2xl font-bold text-blue-400">100</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-700/50">
            <div>
              <p className="font-semibold text-white">Batch Operations</p>
              <p className="text-sm text-gray-400">Max leads per request</p>
            </div>
            <span className="text-2xl font-bold text-purple-400">100</span>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">Rate Limit Headers</h3>
        <p className="text-sm text-gray-400 mb-4">
          Every API response includes rate limit information in the headers:
        </p>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 font-mono text-sm space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-purple-400">X-RateLimit-Limit:</span>
            <span className="text-gray-300">100</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-purple-400">X-RateLimit-Remaining:</span>
            <span className="text-gray-300">95</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-purple-400">X-RateLimit-Reset:</span>
            <span className="text-gray-300">1706011200</span>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
        <h3 className="font-semibold text-white mb-4">429 Too Many Requests</h3>
        <p className="text-sm text-gray-400 mb-4">
          When you exceed the rate limit, you'll receive a 429 error:
        </p>
        <CodeBlock
          id="rate-limit-error"
          language="json"
          code={`{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again in 60 seconds.",
    "retry_after": 60
  }
}`}
          copiedCode={copiedCode}
          onCopy={copyCode}
        />
      </div>

      <InfoCard icon={Clock} title="Best Practices" variant="success">
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>Monitor rate limit headers in responses</li>
          <li>Implement exponential backoff for retries</li>
          <li>Use batch operations when possible</li>
          <li>Cache responses when appropriate</li>
        </ul>
      </InfoCard>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'home': return renderHome();
      case 'getting-started': return renderGettingStarted();
      case 'authentication': return renderAuthentication();
      // Leads
      case 'leads': 
      case 'leads-list': return renderLeadsList();
      case 'leads-get': return renderLeadsGet();
      case 'leads-get-by-phone': return renderLeadsGetByPhone();
      case 'leads-create': return renderLeadsCreate();
      case 'leads-update': return renderLeadsUpdate();
      case 'leads-delete': return renderLeadsDelete();
      case 'leads-batch': return renderLeadsBatch();
      // Corretores
      case 'brokers':
      case 'brokers-list': return renderBrokersList();
      case 'brokers-get': return renderBrokersGet();
      case 'brokers-assign': return renderBrokersAssign();
      // Roleta
      case 'roleta':
      case 'roleta-get': return renderRoletaGet();
      case 'roleta-lead': return renderRoletaLead();
      // Referências
      case 'funnel-stages': return renderFunnelStages();
      case 'lead-types': return renderLeadTypes();
      case 'temperatures': return renderTemperatures();
      case 'sources': return renderSources();
      case 'business-types': return renderBusinessTypes();
      // Avançado
      case 'webhooks': return renderWebhooks();
      case 'rate-limits': return renderRateLimits();
      case 'errors': return renderErrors();
      case 'examples': return renderExamples();
      default: return renderHome();
    }
  };

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-gray-800 rounded-lg border border-gray-700"
      >
        {mobileMenuOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
      </button>

      {/* Sidebar estilo Bitrix24 - Dark Theme */}
      <div className={`
        fixed lg:relative inset-y-0 left-0 z-40 w-72 bg-gray-800 border-r border-gray-700 flex-shrink-0 flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Header */}
        <div className="p-5 border-b border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Code className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-lg">OctoDash API</h1>
              <p className="text-xs text-gray-400">Documentação {API_VERSION}</p>
            </div>
          </div>
          
          {/* N8N Workflow Button */}
          <button
            onClick={copyN8nWorkflow}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 ${
              n8nCopied 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                : 'bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-400 border border-orange-500/30 hover:from-orange-500/30 hover:to-red-500/30 hover:border-orange-500/50'
            }`}
          >
            {n8nCopied ? (
              <>
                <Check className="w-4 h-4" />
                <span>Workflow Copiado!</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>N8N</span>
                <span className="text-[10px] bg-orange-500/30 px-1.5 py-0.5 rounded ml-1">JSON</span>
              </>
            )}
          </button>
          <p className="text-[10px] text-gray-500 text-center mt-2">
            Clique para copiar o workflow completo da API
          </p>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-700/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar na documentação..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id || (item.children?.some(c => c.id === activeSection));
            const isExpanded = expandedItems.includes(item.id);
            const hasChildren = item.children && item.children.length > 0;
            
            return (
              <div key={item.id} className="mb-1">
                <button
                  onClick={() => {
                    if (hasChildren) {
                      toggleExpanded(item.id);
                    } else {
                      setActiveSection(item.id);
                      setMobileMenuOpen(false);
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                    isActive
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-gray-500'}`} />
                  <span className="text-sm font-medium flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-500/20 text-blue-400 rounded">
                      {item.badge}
                    </span>
                  )}
                  {hasChildren && (
                    <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  )}
                  {!hasChildren && isActive && <ChevronRight className="w-4 h-4 text-blue-400" />}
                </button>
                
                {/* Submenu */}
                {hasChildren && isExpanded && (
                  <div className="ml-4 mt-1 pl-4 border-l border-gray-700">
                    {item.children!.map((child) => {
                      const isChildActive = activeSection === child.id;
                      return (
                        <button
                          key={child.id}
                          onClick={() => {
                            setActiveSection(child.id);
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all ${
                            isChildActive
                              ? 'text-blue-400 bg-blue-500/10'
                              : 'text-gray-400 hover:text-white hover:bg-gray-700/30'
                          }`}
                        >
                          {child.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <div className="bg-gray-900/50 rounded-xl p-4">
            <p className="text-xs text-gray-500 mb-2">Precisa de ajuda?</p>
            <a 
              href="mailto:suporte@octoia.com" 
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              suporte@octoia.com
            </a>
          </div>
        </div>
      </div>

      {/* Overlay for mobile */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto lg:ml-0">
        <div className="max-w-4xl mx-auto p-6 lg:p-8 pt-16 lg:pt-8">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default ApiDocsPage;
