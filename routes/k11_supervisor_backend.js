/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║    K11 SUPERVISOR MEGA — Backend Ultra-Inteligente             ║
 * ║    Cérebro Operacional & Comercial — Railway/Supabase          ║
 * ║                                                                 ║
 * ║    INTEGRAÇÃO: Copiar para server.js ou criar arquivo separado ║
 * ║    ATIVA: supervisor.init(datastore, supabaseClient)           ║
 * ╚════════════════════════════════════════════════════════════════╝
 */

'use strict';

const https = require('https');

// ════════════════════════════════════════════════════════════════════
// SUPERVISOR MEGA — Estado Global
// ════════════════════════════════════════════════════════════════════

const supervisor = (() => {
  const state = {
    // Dados agregados
    pdvPerformance: new Map(),
    productMetrics: new Map(),
    operationalAlerts: [],
    commercialInsights: [],
    strategicRecommendations: [],
    
    // Real-time
    sseClients: new Set(),
    lastAnalysisTs: null,
    analysisInterval: null,
    
    // IA Context
    aiConversationHistory: [],
    contextMemory: {
      last30Days: null,
      trends: null,
      seasonality: null,
      patterns: null
    },
    
    // Dependencies (injetadas na init)
    datastore: null,
    supabase: null,
    logger: null,
    groq: null,
  };

  // ════════════════════════════════════════════════════════════════
  // 1. INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════

  function init(datastore, supabaseClient, logger) {
    state.datastore = datastore;
    state.supabase = supabaseClient;
    state.logger = logger;
    
    logger?.info('SUPERVISOR', '🧠 Supervisor Mega inicializando...');
    
    // Inicia análise periódica (a cada 2 minutos)
    scheduleAnalysis();
    
    // Primeira análise após 15s
    setTimeout(() => runFullAnalysis(), 15000);
    
    logger?.info('SUPERVISOR', '✅ Supervisor pronto!');
  }

  function scheduleAnalysis() {
    if (state.analysisInterval) clearInterval(state.analysisInterval);
    state.analysisInterval = setInterval(() => runFullAnalysis(), 120000); // 2 min
  }

  // ════════════════════════════════════════════════════════════════
  // 2. ANÁLISE COMERCIAL
  // ════════════════════════════════════════════════════════════════

  async function analyzeCommercial() {
    try {
      const { data: pdvData, error: pdvError } = await state.supabase
        .from('pdv')
        .select('id, nome, vendas_hoje, vendas_semana, vendas_mes, produtos_vendidos, clientes_hoje')
        .order('vendas_hoje', { ascending: false });

      if (pdvError) throw pdvError;

      const pdvMetrics = [];
      for (let i = 0; i < pdvData.length; i++) {
        const pdv = pdvData[i];
        const trend = ((pdv.vendas_hoje - pdv.vendas_semana / 7) / (pdv.vendas_semana / 7) * 100).toFixed(1);
        
        pdvMetrics.push({
          rank: i + 1,
          name: pdv.nome,
          salesToday: pdv.vendas_hoje,
          salesTrend: trend,
          productsMoving: pdv.produtos_vendidos,
          customersToday: pdv.clientes_hoje,
          performance: trend > 10 ? 'CRESCENDO' : trend < -5 ? 'CAINDO' : 'ESTÁVEL',
          topProducts: await getTopProductsForPDV(pdv.id)
        });
      }

      state.pdvPerformance = new Map(pdvMetrics.map(m => [m.name, m]));
      
      state.logger?.info('SUPERVISOR', `Análise comercial: ${pdvMetrics.length} PDVs analisados`);
      return pdvMetrics;

    } catch (err) {
      state.logger?.error('SUPERVISOR', 'Erro em analyzeCommercial', { error: err.message });
      return [];
    }
  }

  async function getTopProductsForPDV(pdvId) {
    try {
      const { data, error } = await state.supabase
        .from('movimento')
        .select('produto_id, quantidade, created_at')
        .eq('pdv_id', pdvId)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Agrupa e conta
      const productCount = {};
      for (const item of data) {
        productCount[item.produto_id] = (productCount[item.produto_id] || 0) + item.quantidade;
      }

      // Top 3
      return Object.entries(productCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([prodId, qty]) => ({ productId: prodId, quantity: qty }));

    } catch (err) {
      return [];
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 3. ANÁLISE OPERACIONAL
  // ════════════════════════════════════════════════════════════════

  async function analyzeOperational() {
    const alerts = [];

    try {
      // Produtos em risco de ruptura
      const { data: produtos, error: prodError } = await state.supabase
        .from('produtos')
        .select('id, nome, qtd_disponivel, consumo_diario, fornecedor_id, preco')
        .lt('qtd_disponivel', 100);

      if (prodError) throw prodError;

      for (const prod of produtos) {
        const daysUntilStockout = prod.consumo_diario > 0 
          ? prod.qtd_disponivel / prod.consumo_diario 
          : 999;

        if (daysUntilStockout < 3) {
          alerts.push({
            type: 'CRITICAL',
            title: `${prod.nome}: Ruptura em ${daysUntilStockout.toFixed(1)}h`,
            action: 'REPOR_URGENTE',
            product: prod.nome,
            currentStock: prod.qtd_disponivel,
            daysUntilStockout,
            estimatedLoss: prod.preco * daysUntilStockout * prod.consumo_diario,
            priority: 1,
            timestamp: new Date()
          });
        } else if (daysUntilStockout < 7) {
          alerts.push({
            type: 'WARNING',
            title: `${prod.nome}: Atenção - ${daysUntilStockout.toFixed(1)} dias`,
            action: 'MONITORAR',
            product: prod.nome,
            priority: 2,
            timestamp: new Date()
          });
        }
      }

      // Recebimentos atrasados
      const { data: overduePOs, error: poError } = await state.supabase
        .from('purchase_orders')
        .select('id, fornecedor_id, data_prevista, produtos')
        .lt('data_prevista', new Date().toISOString())
        .eq('status', 'PENDING');

      if (poError) throw poError;

      for (const po of overduePOs) {
        const daysOverdue = Math.floor((Date.now() - new Date(po.data_prevista)) / (24 * 60 * 60 * 1000));
        alerts.push({
          type: 'CRITICAL',
          title: `PO atrasada: ${daysOverdue} dias`,
          action: 'FOLLOW_UP',
          priority: 3,
          timestamp: new Date()
        });
      }

      state.operationalAlerts = alerts.sort((a, b) => a.priority - b.priority);
      state.logger?.info('SUPERVISOR', `Análise operacional: ${alerts.length} alertas`);
      return alerts;

    } catch (err) {
      state.logger?.error('SUPERVISOR', 'Erro em analyzeOperational', { error: err.message });
      return [];
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 4. GERAÇÃO DE ESTRATÉGIA (com IA)
  // ════════════════════════════════════════════════════════════════

  async function generateStrategy() {
    if (!process.env.GROQ_API_KEY) {
      state.logger?.warn('SUPERVISOR', 'GROQ_API_KEY não configurada - estratégia desativada');
      return [];
    }

    try {
      const commercialData = Array.from(state.pdvPerformance.values());
      const operationalData = state.operationalAlerts.slice(0, 5);

      const prompt = `
Você é um estrategista comercial de uma empresa de tubos e conexões (K11).
Analise os dados e recomende ações para SUPERAR a concorrência:

DADOS COMERCIAIS:
${JSON.stringify(commercialData, null, 2)}

DADOS OPERACIONAIS:
${JSON.stringify(operationalData, null, 2)}

FORNEÇA:
1. Top 3 estratégias para aumentar vendas
2. Como explorar força do melhor PDV
3. Como recuperar PDV em queda
4. Bundle/promoção recomendada
5. Previsão de resultado

Resonda APENAS em JSON estruturado.`;

      const groqResponse = await callGroq(prompt);
      
      // Parse JSON da resposta
      const jsonMatch = groqResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const strategies = JSON.parse(jsonMatch[0]);
        state.strategicRecommendations = strategies.recommendations || [];
        
        state.logger?.info('SUPERVISOR', '🎯 Estratégia gerada com sucesso');
        return strategies;
      }

      return null;

    } catch (err) {
      state.logger?.error('SUPERVISOR', 'Erro em generateStrategy', { error: err.message });
      return null;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 5. CHAT COM IA (Conversa Livre)
  // ════════════════════════════════════════════════════════════════

  async function chat(userMessage, contextData = {}) {
    if (!process.env.GROQ_API_KEY) {
      return { error: 'IA não configurada' };
    }

    try {
      // Monta contexto
      const context = `
Você é o Supervisor IA do K11 - Sistema de Gestão Operacional e Comercial.
Tem acesso total a: vendas, estoque, PDVs, fornecedores, movimentação.

CONTEXTO ATUAL:
- PDVs: ${Array.from(state.pdvPerformance.values()).map(p => `${p.name} (R$ ${p.salesToday})`).join(', ')}
- Alertas críticos: ${state.operationalAlerts.filter(a => a.type === 'CRITICAL').length}
- Hora: ${new Date().toLocaleString('pt-BR')}

Responda de forma direta, acionável e estratégica.`;

      // Adiciona histórico
      const messages = [
        { role: 'system', content: context },
        ...state.aiConversationHistory.slice(-10), // Últimas 10 mensagens
        { role: 'user', content: userMessage }
      ];

      const response = await callGroq(messages);
      
      // Armazena no histórico
      state.aiConversationHistory.push(
        { role: 'user', content: userMessage },
        { role: 'assistant', content: response }
      );
      
      if (state.aiConversationHistory.length > 50) {
        state.aiConversationHistory = state.aiConversationHistory.slice(-50);
      }

      return { success: true, response, timestamp: new Date() };

    } catch (err) {
      return { error: err.message };
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 6. CHAMADA À API GROQ
  // ════════════════════════════════════════════════════════════════

  function callGroq(messages) {
    return new Promise((resolve, reject) => {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        reject(new Error('GROQ_API_KEY não configurada'));
        return;
      }

      const body = JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: Array.isArray(messages) ? messages : [{ role: 'user', content: messages }],
        max_tokens: 1024,
        temperature: 0.3,
      });

      const options = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) reject(new Error(parsed.error.message));
            else resolve(parsed.choices?.[0]?.message?.content || '');
          } catch (e) { reject(e); }
        });
      });

      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Groq timeout')); });
      req.write(body);
      req.end();
    });
  }

  // ════════════════════════════════════════════════════════════════
  // 7. ANÁLISE COMPLETA (Orquestração)
  // ════════════════════════════════════════════════════════════════

  async function runFullAnalysis() {
    try {
      state.logger?.info('SUPERVISOR', '📊 Iniciando análise completa...');
      
      const commercial = await analyzeCommercial();
      const operational = await analyzeOperational();
      const strategy = await generateStrategy();
      
      state.lastAnalysisTs = new Date();
      
      // Broadcast para SSE clients
      const summary = {
        type: 'analysis_complete',
        timestamp: state.lastAnalysisTs,
        commercial,
        operational,
        strategy,
        nextAnalysisIn: 120 // segundos
      };

      _broadcastSSE('supervisor_update', summary);
      
      state.logger?.info('SUPERVISOR', '✅ Análise completa', {
        pdvsAnalyzed: commercial.length,
        alertsCritical: operational.filter(a => a.type === 'CRITICAL').length,
        strategiesGenerated: strategy?.recommendations?.length || 0
      });

    } catch (err) {
      state.logger?.error('SUPERVISOR', 'Erro em runFullAnalysis', { error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════════
  // 8. SSE (Server-Sent Events) — Push Real-time
  // ════════════════════════════════════════════════════════════════

  function addSSEClient(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    
    state.sseClients.add(res);
    state.logger?.debug('SUPERVISOR', `SSE client conectado (total: ${state.sseClients.size})`);

    // Envia estado atual
    _sendToClient(res, 'connected', {
      status: 'ready',
      lastAnalysis: state.lastAnalysisTs,
      alertsCount: state.operationalAlerts.length,
      pdvsCount: state.pdvPerformance.size
    });

    res.on('close', () => {
      state.sseClients.delete(res);
      state.logger?.debug('SUPERVISOR', `SSE client desconectado (total: ${state.sseClients.size})`);
    });
  }

  function _broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of state.sseClients) {
      try { client.write(payload); } catch (_) { state.sseClients.delete(client); }
    }
  }

  function _sendToClient(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════════
  // 9. PUBLIC API
  // ════════════════════════════════════════════════════════════════

  return {
    init,
    addSSEClient,
    chat,
    getState: () => ({
      pdvPerformance: Array.from(state.pdvPerformance.values()),
      operationalAlerts: state.operationalAlerts,
      strategicRecommendations: state.strategicRecommendations,
      lastAnalysisTs: state.lastAnalysisTs,
      sseClients: state.sseClients.size
    }),
    forceAnalysis: runFullAnalysis
  };
})();

// ════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO NO SERVER.JS
// ════════════════════════════════════════════════════════════════════

/**
 * NO SEU server.js, ADICIONE:
 * 
 * // Após criar a app Express
 * const supervisor = require('./k11-supervisor-mega');
 * 
 * // Quando Supabase estiver pronto
 * supervisor.init(datastore, supabaseClient, logger);
 * 
 * // ROTAS:
 * app.get('/api/supervisor/stream', auth.requireAuth, (req, res) => {
 *   supervisor.addSSEClient(res);
 * });
 * 
 * app.get('/api/supervisor/state', auth.requireAuth, (req, res) => {
 *   res.json({ ok: true, data: supervisor.getState() });
 * });
 * 
 * app.post('/api/supervisor/chat', auth.requireAuth, async (req, res) => {
 *   const { message } = req.body;
 *   const result = await supervisor.chat(message);
 *   res.json({ ok: true, ...result });
 * });
 * 
 * app.post('/api/supervisor/force-analysis', auth.requireAuth, async (req, res) => {
 *   await supervisor.forceAnalysis();
 *   res.json({ ok: true, message: 'Análise forçada' });
 * });
 */

module.exports = supervisor;
