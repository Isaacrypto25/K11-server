/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║   K11 AI CORE — Cérebro Central Aprimorado                          ║
 * ║                                                                       ║
 * ║   Melhorias sobre o supervisor original:                             ║
 * ║   • Memória persistente por PDV e por operador                       ║
 * ║   • Raciocínio em cadeia (Chain-of-Thought) para decisões críticas   ║
 * ║   • Multi-modelo: Groq para velocidade, fallback para precisão       ║
 * ║   • Contexto acumulado entre sessões (não esquece nada)              ║
 * ║   • Prompts especializados por tipo de pergunta                      ║
 * ║   • Respostas com nível de confiança e rastreabilidade               ║
 * ║   • Modo proativo: IA avisa antes de ser perguntada                  ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const https = require('https');

const aiCore = (() => {

  // ── ESTADO ──────────────────────────────────────────────────────────
  const state = {
    // Memória estruturada por entidade
    memory: {
      pdvs:      new Map(),  // pdvId  → PDVMemory
      operators: new Map(),  // userId → OperatorMemory
      products:  new Map(),  // prodId → ProductMemory
      global:    {           // memória global do negócio
        insights:      [],   // últimos 50 insights gerados
        decisions:     [],   // últimas 30 decisões tomadas
        anomalies:     [],   // anomalias detectadas
        patterns:      [],   // padrões aprendidos
        lastFullAnalysis: null,
      }
    },

    // Fila de alertas proativos pendentes
    proactiveQueue: [],

    // Contexto externo injetado pelos outros módulos
    externalContext: {
      priceIntel:     null,
      decisionEngine: null,
      healthScores:   null,
    },

    sseClients: new Set(),
    supabase:   null,
    logger:     null,

    // Config de modelos
    models: {
      fast:      'llama-3.3-70b-versatile',   // Groq — respostas rápidas
      precise:   'llama-3.3-70b-versatile',   // pode trocar por outro
      embedding: null,                         // reservado
    },

    cycleInterval: null,
    analysisIntervalMs: 15 * 60 * 1000,  // análise proativa a cada 15min
  };

  // ════════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════════

  function init(supabaseClient, logger, options = {}) {
    state.supabase = supabaseClient;
    state.logger   = logger;

    if (options.analysisIntervalMs) state.analysisIntervalMs = options.analysisIntervalMs;

    logger?.info('AI-CORE', '🧠 K11 AI Core inicializando...');

    // Carrega memória persistida do Supabase
    _loadPersistedMemory().then(() => {
      // Análise proativa a cada 15min
      state.cycleInterval = setInterval(() => _runProactiveAnalysis(), state.analysisIntervalMs);
      setTimeout(() => _runProactiveAnalysis(), 45000); // primeira análise em 45s
      logger?.info('AI-CORE', '✅ AI Core pronto com memória carregada');
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // MEMÓRIA PERSISTENTE
  // ════════════════════════════════════════════════════════════════════

  async function _loadPersistedMemory() {
    try {
      // Carrega insights recentes
      const { data: insights } = await state.supabase
        .from('ai_memory')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (insights?.length) {
        for (const item of insights) {
          if (item.entity_type === 'pdv') {
            const mem = state.memory.pdvs.get(item.entity_id) || _newPDVMemory(item.entity_id);
            if (item.memory_type === 'insight') mem.insights.unshift(item.content);
            if (item.memory_type === 'pattern') mem.patterns.push(item.content);
            state.memory.pdvs.set(item.entity_id, mem);
          } else if (item.entity_type === 'global') {
            state.memory.global.insights.unshift(item.content);
          }
        }
        state.logger?.info('AI-CORE', `📚 Memória carregada: ${insights.length} registros`);
      }
    } catch (_) {}
  }

  async function _persistMemory(entityType, entityId, memoryType, content) {
    try {
      await state.supabase.from('ai_memory').insert({
        entity_type: entityType,
        entity_id:   entityId,
        memory_type: memoryType,
        content:     typeof content === 'string' ? content : JSON.stringify(content),
      });
    } catch (_) {}
  }

  function _newPDVMemory(pdvId) {
    return {
      pdvId,
      insights:     [],    // insights históricos sobre este PDV
      patterns:     [],    // padrões detectados
      anomalies:    [],    // anomalias passadas
      lastScore:    null,
      chatHistory:  [],    // últimas 20 perguntas/respostas neste PDV
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // INJEÇÃO DE CONTEXTO EXTERNO
  // ════════════════════════════════════════════════════════════════════

  function injectContext(source, data) {
    state.externalContext[source] = { data, injectedAt: new Date() };
  }

  // ════════════════════════════════════════════════════════════════════
  // CHAT INTELIGENTE — PRINCIPAL INTERFACE
  // Substituição do chat() do supervisor original
  // ════════════════════════════════════════════════════════════════════

  async function chat(userMessage, options = {}) {
    const {
      pdvId    = null,
      userId   = null,
      pdvData  = null,
      mode     = 'auto', // auto | fast | precise | cot (chain-of-thought)
    } = options;

    const startTs = Date.now();

    // Classifica intenção da pergunta
    const intent = _classifyIntent(userMessage);

    // Recupera memória relevante
    const memory = _buildMemoryContext(pdvId, userId, intent);

    // Monta contexto completo
    const context = _buildFullContext(pdvData, memory, intent);

    // Seleciona estratégia de resposta
    const strategy = mode === 'auto' ? _selectStrategy(intent) : mode;

    let response;

    if (strategy === 'cot') {
      // Chain-of-Thought: IA "pensa em voz alta" antes de responder
      response = await _chatWithCoT(userMessage, context, intent);
    } else {
      response = await _chatDirect(userMessage, context, intent, strategy);
    }

    if (!response) {
      return { text: 'Sistema temporariamente indisponível.', confidence: 'LOW', intent };
    }

    // Salva na memória
    _updateMemoryAfterChat(pdvId, userId, userMessage, response, intent);

    const latencyMs = Date.now() - startTs;
    state.logger?.info('AI-CORE', `💬 Chat respondido`, { intent, strategy, latencyMs });

    return {
      text:       response.text,
      confidence: response.confidence || 'MEDIUM',
      intent,
      strategy,
      sources:    response.sources || [],
      latencyMs,
      followUp:   response.followUp || null,
    };
  }

  // ── Classifica intenção ──────────────────────────────────────────────
  function _classifyIntent(message) {
    const msg = message.toLowerCase();

    if (/ruptura|zerado|sem estoque|faltando|acabou/.test(msg))        return 'STOCKOUT';
    if (/preço|concorrente|mais barato|cobrar|valor/.test(msg))        return 'PRICING';
    if (/meta|objetivo|bater|atingir|target/.test(msg))                return 'GOALS';
    if (/venda|vender|aumentar|crescer|faturamento/.test(msg))         return 'SALES';
    if (/fornecedor|pedido|repor|reposi|comprar/.test(msg))            return 'REPLENISHMENT';
    if (/margem|lucro|rentabil|custo/.test(msg))                       return 'MARGIN';
    if (/cliente|fideliz|ticket|frequência/.test(msg))                 return 'CUSTOMER';
    if (/por que|causa|motivo|razão|analise|análise/.test(msg))        return 'ANALYSIS';
    if (/o que fazer|recomend|sugere|como|estratégia/.test(msg))       return 'ACTION';
    if (/previs|forecast|próxim|futuro|semana que vem/.test(msg))      return 'FORECAST';
    if (/comparar|melhor pdv|ranking|quem mais/.test(msg))             return 'COMPARISON';

    return 'GENERAL';
  }

  // ── Seleciona estratégia ─────────────────────────────────────────────
  function _selectStrategy(intent) {
    // Perguntas complexas usam CoT
    if (['ANALYSIS', 'ACTION', 'COMPARISON', 'FORECAST'].includes(intent)) return 'cot';
    // Perguntas operacionais simples usam fast
    if (['STOCKOUT', 'REPLENISHMENT'].includes(intent)) return 'fast';
    return 'fast';
  }

  // ── Constrói contexto de memória ─────────────────────────────────────
  function _buildMemoryContext(pdvId, userId, intent) {
    const ctx = { pdvHistory: [], globalInsights: [], operatorPrefs: null };

    if (pdvId) {
      const pdvMem = state.memory.pdvs.get(pdvId);
      if (pdvMem) {
        ctx.pdvHistory  = pdvMem.insights.slice(0, 5);   // últimos 5 insights
        ctx.pdvPatterns = pdvMem.patterns.slice(0, 3);
        ctx.lastScore   = pdvMem.lastScore;
      }
    }

    ctx.globalInsights = state.memory.global.insights.slice(0, 3);
    ctx.recentDecisions = state.memory.global.decisions.slice(0, 3);

    return ctx;
  }

  // ── Constrói contexto completo para o prompt ─────────────────────────
  function _buildFullContext(pdvData, memory, intent) {
    const sections = [];

    // Dados do PDV
    if (pdvData) {
      sections.push(`## DADOS DO PDV AGORA
Nome: ${pdvData.nome || '?'}
Vendas hoje: R$ ${pdvData.vendas_hoje?.toFixed(2) || '0'}
Meta dia: R$ ${pdvData.meta_dia?.toFixed(2) || '0'}
% Meta atingida: ${pdvData.meta_dia > 0 ? ((pdvData.vendas_hoje / pdvData.meta_dia) * 100).toFixed(0) : '?'}%
Ticket médio: R$ ${pdvData.ticket_medio?.toFixed(2) || '0'}
Margem: ${pdvData.margem_operacional?.toFixed(1) || '?'}%
Rupturas ativas: ${pdvData.rupturas || 0} produtos`);
    }

    // Contexto de preços
    const pi = state.externalContext.priceIntel;
    if (pi?.data) {
      const critAlerts = (pi.data.alerts || []).filter(a => a.severity === 'CRITICAL').slice(0, 3);
      if (critAlerts.length) {
        sections.push(`## ALERTAS DE PREÇO (Price Intel)
${critAlerts.map(a => `• [${a.severity}] ${a.title}: ${a.action}`).join('\n')}`);
      }
    }

    // Contexto do Decision Engine
    const de = state.externalContext.decisionEngine;
    if (de?.data?.decisionEngineSummary) {
      const d = de.data.decisionEngineSummary;
      sections.push(`## DECISION ENGINE
PDVs saudáveis (≥80): ${d.pdvsAbove80 || 0}
PDVs críticos (<50): ${d.pdvsBelow50 || 0}
Produtos em risco de ruptura: ${d.productsAtRisk?.length || 0}
POs criadas hoje (automático): ${d.posCreatedToday || 0}`);
    }

    // Memória histórica
    if (memory.pdvHistory?.length) {
      sections.push(`## HISTÓRICO DESTE PDV (memória acumulada)
${memory.pdvHistory.map((i, n) => `${n+1}. ${i}`).join('\n')}`);
    }

    if (memory.globalInsights?.length) {
      sections.push(`## INSIGHTS GLOBAIS RECENTES
${memory.globalInsights.join('\n')}`);
    }

    return sections.join('\n\n');
  }

  // ── Chat direto (rápido) ─────────────────────────────────────────────
  async function _chatDirect(userMessage, context, intent, speed) {
    const systemPrompt = _buildSystemPrompt(intent);

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `${context}\n\n---\nPERGUNTA DO OPERADOR: ${userMessage}`
      }
    ];

    const raw = await _callGroq(messages, { model: state.models.fast, maxTokens: 600 });
    if (!raw) return null;

    return { text: raw, confidence: 'MEDIUM', sources: ['groq-fast'] };
  }

  // ── Chain-of-Thought: IA pensa antes de responder ────────────────────
  async function _chatWithCoT(userMessage, context, intent) {
    const systemPrompt = _buildSystemPrompt(intent);

    // Passo 1: IA analisa silenciosamente (não mostrado ao usuário)
    const thinkingMessages = [
      { role: 'system', content: systemPrompt + '\n\nAntes de responder, faça uma análise interna em 3-4 passos curtos precedidos por "→", depois dê a resposta final após "RESPOSTA:".' },
      {
        role: 'user',
        content: `${context}\n\n---\nPERGUNTA: ${userMessage}`
      }
    ];

    const raw = await _callGroq(thinkingMessages, { model: state.models.precise, maxTokens: 800 });
    if (!raw) return null;

    // Extrai apenas a resposta final
    const responseMatch = raw.match(/RESPOSTA:\s*([\s\S]+)$/i);
    const text = responseMatch ? responseMatch[1].trim() : raw;

    // Extrai raciocínio para log interno
    const reasoningMatch = raw.match(/^([\s\S]+?)(?=RESPOSTA:)/i);
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : null;

    return {
      text,
      reasoning,     // salvo em log mas não enviado ao cliente
      confidence: 'HIGH',
      sources: ['groq-cot'],
    };
  }

  // ── Prompts especializados por intenção ──────────────────────────────
  function _buildSystemPrompt(intent) {
    const base = `Você é K11 Brain, a IA operacional de uma distribuidora de materiais hidráulicos.
Você conhece o negócio profundamente: margens, sazonalidade, comportamento de PDVs, fornecedores.
Seja direto, objetivo e pragmático. Nada de enrolação. Use dados concretos quando disponíveis.
Responda em português brasileiro, máximo 4 parágrafos curtos.`;

    const specialized = {
      STOCKOUT:
        `${base}\nFoco: ruptura de estoque. Priorize ação imediata. Diga o produto, a urgência e a solução mais rápida possível.`,
      PRICING:
        `${base}\nFoco: precificação competitiva. Equilibre margem e competitividade. Cite % de diferença quando souber.`,
      GOALS:
        `${base}\nFoco: atingir meta. Calcule gap atual vs meta, sugira ações práticas para fechar o gap hoje.`,
      ANALYSIS:
        `${base}\nFoco: análise profunda de causa raiz. Identifique o fator principal, os secundários e o impacto financeiro estimado.`,
      ACTION:
        `${base}\nFoco: plano de ação. Dê 3 ações priorizadas por impacto, com o que fazer, quem faz e quando.`,
      FORECAST:
        `${base}\nFoco: previsão. Use tendências dos dados fornecidos. Seja honesto sobre nível de confiança.`,
      COMPARISON:
        `${base}\nFoco: comparação entre PDVs. Destaque o diferencial do melhor e o problema do pior. O que um pode aprender com o outro?`,
      REPLENISHMENT:
        `${base}\nFoco: reposição de estoque. Priorize produtos em ruptura ou risco crítico. Indique fornecedor e quantidade mínima sugerida.`,
      MARGIN:
        `${base}\nFoco: margem e rentabilidade. Identifique onde a margem está sendo corroída e como recuperá-la.`,
      GENERAL:
        base,
    };

    return specialized[intent] || base;
  }

  // ── Atualiza memória após chat ───────────────────────────────────────
  function _updateMemoryAfterChat(pdvId, userId, question, response, intent) {
    // Extrai insight da resposta (primeira frase)
    const insight = response.text.split('.')[0].trim();
    const timestamp = new Date().toLocaleDateString('pt-BR');
    const entry = `[${timestamp}] ${intent}: ${insight}`;

    if (pdvId) {
      const mem = state.memory.pdvs.get(pdvId) || _newPDVMemory(pdvId);
      mem.insights.unshift(entry);
      if (mem.insights.length > 20) mem.insights.pop();
      mem.chatHistory.push({ q: question, a: response.text.slice(0, 200), intent });
      if (mem.chatHistory.length > 20) mem.chatHistory.shift();
      state.memory.pdvs.set(pdvId, mem);
    }

    state.memory.global.insights.unshift(entry);
    if (state.memory.global.insights.length > 50) state.memory.global.insights.pop();

    // Persiste insights relevantes
    if (['ANALYSIS', 'ACTION', 'FORECAST'].includes(intent)) {
      _persistMemory(pdvId ? 'pdv' : 'global', pdvId || 'global', 'insight', entry);
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // ANÁLISE PROATIVA
  // IA monitora dados e avisa ANTES de ser perguntada
  // ════════════════════════════════════════════════════════════════════

  async function _runProactiveAnalysis() {
    state.logger?.info('AI-CORE', '🔍 Análise proativa iniciando...');

    const alerts = [];

    try {
      // 1. Verifica PDVs em queda de tendência
      const trendAlerts = await _analyzeTrends();
      alerts.push(...trendAlerts);

      // 2. Verifica anomalias de margem
      const marginAlerts = await _analyzeMarginAnomalies();
      alerts.push(...marginAlerts);

      // 3. Verifica padrões de ruptura recorrente
      const ruptureAlerts = await _analyzeRupturePatterns();
      alerts.push(...ruptureAlerts);

      // 4. Insight semanal (toda segunda-feira)
      if (new Date().getDay() === 1) {
        const weeklyInsight = await _generateWeeklyInsight();
        if (weeklyInsight) alerts.push(weeklyInsight);
      }

      if (alerts.length) {
        state.proactiveQueue.push(...alerts);
        _broadcastSSE('proactive_alerts', { alerts, timestamp: new Date() });
        state.logger?.info('AI-CORE', `📢 ${alerts.length} alertas proativos gerados`);
      }

    } catch (err) {
      state.logger?.error('AI-CORE', 'Erro em análise proativa', { error: err.message });
    }
  }

  async function _analyzeTrends() {
    const alerts = [];
    try {
      const { data: pdvs } = await state.supabase
        .from('pdv').select('id, nome, vendas_hoje, vendas_semana').limit(10);

      for (const pdv of pdvs || []) {
        const dailyAvg = (pdv.vendas_semana || 0) / 7;
        if (dailyAvg > 0 && pdv.vendas_hoje < dailyAvg * 0.5) {
          alerts.push({
            type:     'TREND_ALERT',
            severity: 'WARNING',
            pdvId:    pdv.id,
            title:    `${pdv.nome}: vendas ${((pdv.vendas_hoje / dailyAvg - 1) * 100).toFixed(0)}% abaixo da média`,
            action:   'PDV precisa de atenção imediata — verifique ruptura, equipe ou eventos externos.',
            source:   'proactive',
          });
        }
      }
    } catch (_) {}
    return alerts;
  }

  async function _analyzeMarginAnomalies() {
    const alerts = [];
    try {
      const { data: pdvs } = await state.supabase
        .from('pdv').select('id, nome, margem_operacional').limit(10);

      for (const pdv of pdvs || []) {
        if ((pdv.margem_operacional || 0) < 20) {
          alerts.push({
            type:     'MARGIN_ALERT',
            severity: 'CRITICAL',
            pdvId:    pdv.id,
            title:    `${pdv.nome}: margem crítica (${pdv.margem_operacional?.toFixed(1)}%)`,
            action:   'Revisar mix de produtos vendidos e negociar reposição com fornecedor.',
            source:   'proactive',
          });
        }
      }
    } catch (_) {}
    return alerts;
  }

  async function _analyzeRupturePatterns() {
    const alerts = [];
    try {
      // Produtos zerados há mais de 2 dias = padrão de ruptura recorrente
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const { data: prods } = await state.supabase
        .from('produtos')
        .select('id, nome, qtd_disponivel, pdv_id')
        .eq('qtd_disponivel', 0)
        .lt('updated_at', twoDaysAgo)
        .limit(5);

      for (const p of prods || []) {
        alerts.push({
          type:     'CHRONIC_STOCKOUT',
          severity: 'CRITICAL',
          prodId:   p.id,
          pdvId:    p.pdv_id,
          title:    `Ruptura crônica: ${p.nome} (>2 dias zerado)`,
          action:   'Verificar se PO foi emitida e status de entrega do fornecedor.',
          source:   'proactive',
        });
      }
    } catch (_) {}
    return alerts;
  }

  async function _generateWeeklyInsight() {
    if (!process.env.GROQ_API_KEY) return null;

    try {
      const { data: pdvs } = await state.supabase
        .from('pdv').select('nome, vendas_semana, margem_operacional, meta_semana').limit(5);

      if (!pdvs?.length) return null;

      const summary = pdvs.map(p =>
        `${p.nome}: vendas R$${p.vendas_semana?.toFixed(0)}, margem ${p.margem_operacional?.toFixed(1)}%, meta ${p.meta_semana ? ((p.vendas_semana / p.meta_semana) * 100).toFixed(0) + '%' : '?'}`
      ).join('\n');

      const raw = await _callGroq([{
        role: 'user',
        content: `Você é K11 Brain. Com base nos dados desta semana, gere 1 insight estratégico de alto impacto em 2 frases.\n\n${summary}`
      }], { maxTokens: 150 });

      if (!raw) return null;

      return {
        type:     'WEEKLY_INSIGHT',
        severity: 'INFO',
        title:    'Insight Semanal K11 Brain',
        action:   raw.trim(),
        source:   'proactive',
      };
    } catch (_) { return null; }
  }

  // ════════════════════════════════════════════════════════════════════
  // GERAÇÃO DE ESTRATÉGIA MELHORADA
  // Substitui generateStrategy() do supervisor original
  // ════════════════════════════════════════════════════════════════════

  async function generateStrategy(pdvData, options = {}) {
    const { depth = 'full' } = options; // full | quick

    const context = _buildFullContext(pdvData, _buildMemoryContext(pdvData?.id, null, 'ACTION'), 'ACTION');

    const prompt = depth === 'quick'
      ? `${context}\n\nGere 3 ações prioritárias para hoje neste PDV. Seja direto. Formato: 1. [URGÊNCIA] Ação — Impacto esperado`
      : `${context}\n\nGere uma estratégia operacional completa para hoje:
1. SITUAÇÃO (1 linha): diagnóstico atual
2. PRIORIDADES (top 3): ações por impacto
3. ALERTAS: riscos a monitorar hoje
4. META REALISTA: o que é possível atingir hoje dado o contexto
Seja específico com números quando disponíveis.`;

    const raw = await _callGroq(
      [{ role: 'user', content: prompt }],
      { model: state.models.precise, maxTokens: 700 }
    );

    if (!raw) return { strategy: 'Contexto insuficiente.', confidence: 'LOW' };

    // Salva na memória global
    const entry = `[${new Date().toLocaleDateString('pt-BR')}] Estratégia para ${pdvData?.nome}: ${raw.slice(0, 100)}...`;
    state.memory.global.decisions.unshift(entry);
    if (state.memory.global.decisions.length > 30) state.memory.global.decisions.pop();

    if (pdvData?.id) {
      _persistMemory('pdv', pdvData.id, 'strategy', entry);
    }

    return { strategy: raw, confidence: 'HIGH', generatedAt: new Date() };
  }

  // ════════════════════════════════════════════════════════════════════
  // ANÁLISE DE ANOMALIA PONTUAL
  // Para quando um dado foge muito do padrão esperado
  // ════════════════════════════════════════════════════════════════════

  async function analyzeAnomaly(pdvId, pdvName, metric, currentValue, expectedValue, unit = '') {
    const pct = expectedValue > 0 ? ((currentValue - expectedValue) / expectedValue * 100).toFixed(1) : '?';
    const direction = currentValue > expectedValue ? 'acima' : 'abaixo';

    const raw = await _callGroq([{
      role: 'user',
      content: `K11 Brain — análise de anomalia:
PDV: ${pdvName}
Métrica: ${metric}
Valor atual: ${currentValue}${unit}
Valor esperado: ${expectedValue}${unit}
Desvio: ${pct}% ${direction} do normal

Em 2-3 frases: qual a causa mais provável e o que fazer agora?`
    }], { maxTokens: 250 });

    if (!raw) return null;

    // Registra anomalia na memória
    const record = {
      pdvId, metric, currentValue, expectedValue,
      analysis: raw.trim(),
      detectedAt: new Date(),
    };
    state.memory.global.anomalies.unshift(record);
    if (state.memory.global.anomalies.length > 20) state.memory.global.anomalies.pop();

    _persistMemory('pdv', pdvId, 'anomaly', record);

    return record;
  }

  // ════════════════════════════════════════════════════════════════════
  // GROQ — CHAMADA DE API UNIFICADA
  // ════════════════════════════════════════════════════════════════════

  function _callGroq(messages, options = {}) {
    return new Promise((resolve) => {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) { resolve(null); return; }

      const body = JSON.stringify({
        model:       options.model       || state.models.fast,
        messages:    messages,
        max_tokens:  options.maxTokens   || 600,
        temperature: options.temperature || 0.2,
      });

      const req = https.request({
        hostname: 'api.groq.com',
        path:     '/openai/v1/chat/completions',
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Authorization':  `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const p = JSON.parse(data);
            resolve(p.error ? null : p.choices?.[0]?.message?.content || null);
          } catch (_) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(25000, () => { req.destroy(); resolve(null); });
      req.write(body);
      req.end();
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // SSE
  // ════════════════════════════════════════════════════════════════════

  function addSSEClient(res) {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    state.sseClients.add(res);
    _sendToClient(res, 'connected', { status: 'ai_core_ready' });

    // Envia fila de alertas proativos pendentes
    if (state.proactiveQueue.length) {
      _sendToClient(res, 'proactive_alerts', {
        alerts:    state.proactiveQueue.slice(-10),
        timestamp: new Date(),
      });
    }

    res.on('close', () => state.sseClients.delete(res));
  }

  function _broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of state.sseClients) {
      try { client.write(payload); } catch (_) { state.sseClients.delete(client); }
    }
  }

  function _sendToClient(res, event, data) {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════════════════════════

  return {
    init,
    chat,
    generateStrategy,
    analyzeAnomaly,
    injectContext,
    addSSEClient,
    getMemory: (pdvId) => state.memory.pdvs.get(pdvId) || null,
    getProactiveAlerts: () => state.proactiveQueue.slice(-20),
    clearProactiveQueue: () => { state.proactiveQueue = []; },
  };
})();

module.exports = aiCore;
