/**
 * 🔌 PROXY PARA XML DO KENLO
 * Este servidor proxy resolve problemas de CORS ao buscar dados do XML
 * 
 * Uso: node server/kenlo-proxy.js
 * Endpoint: http://localhost:3001/api/kenlo/imoveis
 */

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3001;

// URL do XML do Kenlo
const KENLO_XML_URL = 'https://imob.valuegaia.com.br/integra/midia.ashx?midia=ChaveNaMao&p=pQdBmFcGRFgUiPu6qbT5CB0b4QQUZf5v';

// Habilitar CORS para todas as origens
app.use(cors());

// Endpoint de healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Kenlo Proxy is running' });
});

// Endpoint para buscar imóveis do XML
app.get('/api/kenlo/imoveis', async (req, res) => {
  try {
    console.log('📡 Buscando XML do Kenlo...');
    console.log('🔗 URL:', KENLO_XML_URL);
    console.log('🔧 Método: POST (sem parâmetros)');
    
    const response = await fetch(KENLO_XML_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/xml, text/xml, */*',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cache-Control': 'no-cache'
      },
      body: '' // POST sem parâmetros
    });
    
    console.log('📊 Status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.text();
    console.log('✅ Dados recebidos:', data.length, 'caracteres');
    
    // Retornar dados como texto plano
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(data);
    
  } catch (error) {
    console.error('❌ Erro ao buscar XML:', error);
    res.status(500).json({
      error: 'Erro ao buscar dados do Kenlo',
      message: error.message
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════');
  console.log('🚀 KENLO PROXY SERVER - ATIVO!');
  console.log('───────────────────────────────────────────────────');
  console.log(`📡 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`🔗 Endpoint de imóveis: http://localhost:${PORT}/api/kenlo/imoveis`);
  console.log(`💚 Healthcheck: http://localhost:${PORT}/health`);
  console.log('═══════════════════════════════════════════════════');
});

