/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║   K11 AI CORE v4.0 — Cérebro Central                                ║
 * ║                                                                       ║
 * ║   v4.0 — Melhorias sobre v3:                                         ║
 * ║   • Contexto comprimido ≤400 tokens (era ~1200 → overflow fixado)   ║
 * ║   • CoT removido: 2 chamadas → 1 chamada (latência −40%)            ║
 * ║   • max_tokens padrão 600 → 450                                      ║
 * ║   • Timeout 25s → 15s                                                ║
 * ║   • Histórico limitado a 3 últimas trocas truncadas                 ║
 * ║   • Memória persiste apenas insights relevantes (não tudo)          ║
 * ║   • Análise proativa a cada 10 min (era 15)                         ║
 * ║   • Alerta automático quando ≥5 SKUs em ruptura                     ║
 * ║   • Insight semanal toda segunda-feira                               ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const https = require('https');

const aiCore = (() => {

    // ── ESTADO ──────────────────────────────────────────────────────────
    const state = {
        memory: {
            pdvs:      new Map(),
            operators: new Map(),
            global: {
                insights:  [],
                decisions: [],
                anomalies: [],
                patterns:  [],
                lastFullAnalysis: null,
            },
        },

        proactiveQueue: [],

        externalContext: {
            priceIntel:     null,
            decisionEngine: null,
            healthScores:   null,
        },

        sseClients: new Set(),
        supabase:   null,
        logger:     null,

        models: {
            fast:    'llama-3.3-70b-versatile',
            precise: 'llama-3.3-70b-versatile',
        },

        cycleInterval:      null,
        analysisIntervalMs: 10 * 60 * 1000, // [v4] 10 min (era 15)
    };

    // ════════════════════════════════════════════════════════════════════
    // INIT
    // ════════════════════════════════════════════════════════════════════

    function init(supabaseClient, logger, options = {}) {
        state.supabase = supabaseClient;
        state.logger   = logger;

        if (options.analysisIntervalMs) state.analysisIntervalMs = options.analysisIntervalMs;

        logger?.info('AI-CORE', '🧠 K11 AI Core v4 inicializando...');

        _loadPersistedMemory().then(() => {
            state.cycleInterval = setInterval(() => _runProactiveAnalysis(), state.analysisIntervalMs);
            setTimeout(() => _runProactiveAnalysis(), 30000); // [v4] 30s (era 45s)
            logger?.info('AI-CORE', '✅ AI Core v4 pronto');
        });
    }

    // ════════════════════════════════════════════════════════════════════
    // MEMÓRIA PERSISTENTE
    // ════════════════════════════════════════════════════════════════════

    async function _loadPersistedMemory() {
        try {
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
            insights:    [],
            patterns:    [],
            anomalies:   [],
            lastScore:   null,
            chatHistory: [],
        };
    }

    // ════════════════════════════════════════════════════════════════════
    // INJEÇÃO DE CONTEXTO EXTERNO
    // ════════════════════════════════════════════════════════════════════

    function injectContext(source, data) {
        state.externalContext[source] = { data, injectedAt: new Date() };
    }

    // ════════════════════════════════════════════════════════════════════
    // CHAT — v4: contexto comprimido, 1 chamada, histórico truncado
    // ════════════════════════════════════════════════════════════════════

    async function chat(userMessage, options = {}) {
        const {
            pdvId   = null,
            userId  = null,
            pdvData = null,
            mode    = 'auto',
        } = options;

        const startTs = Date.now();
        const intent  = _classifyIntent(userMessage);
        const memory  = _buildMemoryContext(pdvId, userId, intent);

        // [v4] Contexto comprimido ≤ 400 tokens
        const context = _buildCompressedContext(pdvData, memory, intent);

        // [v4] Sempre 1 chamada direta (CoT removido — estava causando overflow)
        const response = await _chatDirect(userMessage, context, intent);

        if (!response) {
            return { text: 'Sistema temporariamente indisponível.', confidence: 'LOW', intent };
        }

        _updateMemoryAfterChat(pdvId, userId, userMessage, response, intent);

        const latencyMs = Date.now() - startTs;
        state.logger?.info('AI-CORE', `💬 Chat v4`, { intent, latencyMs });

        return {
            text:       response.text,
            confidence: response.confidence || 'MEDIUM',
            intent,
            latencyMs,
        };
    }

    function _classifyIntent(message) {
        const msg = message.toLowerCase();
        if (/ruptura|zerado|sem estoque|faltando|acabou/.test(msg))       return 'STOCKOUT';
        if (/preço|concorrente|mais barato|cobrar|valor/.test(msg))       return 'PRICING';
        if (/meta|objetivo|bater|atingir|target/.test(msg))               return 'GOALS';
        if (/venda|vender|aumentar|crescer|faturamento/.test(msg))        return 'SALES';
        if (/fornecedor|pedido|repor|reposi|comprar/.test(msg))           return 'REPLENISHMENT';
        if (/margem|lucro|rentabil|custo/.test(msg))                      return 'MARGIN';
        if (/por que|causa|motivo|razão|analise|análise/.test(msg))       return 'ANALYSIS';
        if (/o que fazer|recomend|sugere|como|estratégia/.test(msg))      return 'ACTION';
        if (/previs|forecast|próxim|futuro|semana que vem/.test(msg))     return 'FORECAST';
        if (/comparar|melhor pdv|ranking|quem mais/.test(msg))            return 'COMPARISON';
        return 'GENERAL';
    }

    function _buildMemoryContext(pdvId, userId, intent) {
        const ctx = { pdvHistory: [], globalInsights: [] };
        if (pdvId) {
            const pdvMem = state.memory.pdvs.get(pdvId);
            if (pdvMem) {
                ctx.pdvHistory  = pdvMem.insights.slice(0, 3); // [v4] era 5
                ctx.pdvPatterns = pdvMem.patterns.slice(0, 2);
                ctx.lastScore   = pdvMem.lastScore;
                // [v4] Histórico de chat truncado: últimas 3 trocas, 100 chars cada
                ctx.chatHistory = (pdvMem.chatHistory ?? [])
                    .slice(-3)
                    .map(h => ({ q: h.q.slice(0, 60), a: h.a.slice(0, 100) }));
            }
        }
        ctx.globalInsights  = state.memory.global.insights.slice(0, 2); // [v4] era 3
        ctx.recentDecisions = state.memory.global.decisions.slice(0, 2);
        return ctx;
    }

    // [v4] Contexto comprimido — máx ~400 tokens (vs ~1200 antes)
    function _buildCompressedContext(pdvData, memory, intent) {
        const parts = [];

        // PDV: só campos essenciais
        if (pdvData) {
            const metaPct = pdvData.meta_dia > 0
                ? Math.round((pdvData.vendas_hoje / pdvData.meta_dia) * 100) : '?';
            parts.push(
                `PDV:${pdvData.nome || '?'} | vendas:R$${Math.round(pdvData.vendas_hoje || 0)}` +
                ` | meta:${metaPct}% | margem:${pdvData.margem_operacional?.toFixed(1) || '?'}%` +
                ` | rupturas:${pdvData.rupturas || 0}`
            );
        }

        // Price Intel: só alertas críticos (máx 2)
        const pi = state.externalContext.priceIntel;
        if (pi?.data) {
            const critAlerts = (pi.data.alerts || [])
                .filter(a => a.severity === 'CRITICAL').slice(0, 2);
            if (critAlerts.length) {
                parts.push('PREÇO:' + critAlerts.map(a => a.title.slice(0, 60)).join(' | '));
            }
        }

        // Memória: só os mais recentes (1 linha cada)
        if (memory.pdvHistory?.length) {
            parts.push('HIST:' + memory.pdvHistory.slice(0, 2).join(' | ').slice(0, 150));
        }
        if (memory.chatHistory?.length) {
            parts.push('CHAT:' + memory.chatHistory
                .map(h => `Q:${h.q} A:${h.a}`)
                .join(' | ')
                .slice(0, 150));
        }

        return parts.join('\n');
    }

    // [v4] 1 chamada direta, sem CoT
    async function _chatDirect(userMessage, context, intent) {
        const systemPrompt = _buildSystemPrompt(intent);
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: (context ? context + '\n\n---\n' : '') + userMessage },
        ];
        const raw = await _callGroq(messages, { maxTokens: 450 }); // [v4] era 600
        if (!raw) return null;
        return { text: raw, confidence: 'MEDIUM' };
    }

    function _buildSystemPrompt(intent) {
        const base = `K11 Brain — IA operacional de distribuidora hidráulica. Direto, objetivo, português BR, máx 3 parágrafos.`;
        const map = {
            STOCKOUT:      base + ' Foco: ruptura. Ação imediata.',
            PRICING:       base + ' Foco: precificação. Equilibre margem e competitividade.',
            GOALS:         base + ' Foco: meta. Calcule gap e sugira ações para fechar hoje.',
            ANALYSIS:      base + ' Foco: causa raiz. Fator principal + impacto financeiro.',
            ACTION:        base + ' Foco: plano. 3 ações por impacto.',
            FORECAST:      base + ' Foco: previsão. Use tendências. Seja honesto sobre confiança.',
            COMPARISON:    base + ' Foco: comparação de PDVs. Diferencial do melhor vs pior.',
            REPLENISHMENT: base + ' Foco: reposição. Produtos críticos + fornecedor sugerido.',
            MARGIN:        base + ' Foco: margem. Onde está sendo corroída e como recuperar.',
        };
        return map[intent] || base;
    }

    function _updateMemoryAfterChat(pdvId, userId, question, response, intent) {
        const insight   = response.text.split('.')[0].trim().slice(0, 120);
        const timestamp = new Date().toLocaleDateString('pt-BR');
        const entry     = `[${timestamp}] ${intent}: ${insight}`;

        if (pdvId) {
            const mem = state.memory.pdvs.get(pdvId) || _newPDVMemory(pdvId);
            mem.insights.unshift(entry);
            if (mem.insights.length > 20) mem.insights.pop();
            mem.chatHistory.push({ q: question.slice(0, 80), a: response.text.slice(0, 120), intent });
            if (mem.chatHistory.length > 20) mem.chatHistory.shift();
            state.memory.pdvs.set(pdvId, mem);
        }

        state.memory.global.insights.unshift(entry);
        if (state.memory.global.insights.length > 50) state.memory.global.insights.pop();

        // [v4] Persiste apenas insights de alta relevância
        if (['ANALYSIS', 'ACTION', 'FORECAST'].includes(intent)) {
            _persistMemory(pdvId ? 'pdv' : 'global', pdvId || 'global', 'insight', entry);
        }
    }

    // ════════════════════════════════════════════════════════════════════
    // ANÁLISE PROATIVA v4 — alertas antes de serem perguntados
    // ════════════════════════════════════════════════════════════════════

    async function _runProactiveAnalysis() {
        state.logger?.info('AI-CORE', '🔍 Análise proativa v4...');
        const alerts = [];

        try {
            // 1. PDVs em queda de tendência
            alerts.push(...await _analyzeTrends());

            // 2. Anomalias de margem
            alerts.push(...await _analyzeMarginAnomalies());

            // 3. Rupturas recorrentes (> 2 dias)
            alerts.push(...await _analyzeRupturePatterns());

            // 4. [v4] Alerta automático quando ≥ 5 SKUs em ruptura simultânea
            alerts.push(...await _analyzeHighRuptureCount());

            // 5. Insight semanal (toda segunda-feira)
            if (new Date().getDay() === 1) {
                const weekly = await _generateWeeklyInsight();
                if (weekly) alerts.push(weekly);
            }

            if (alerts.length) {
                state.proactiveQueue.push(...alerts);
                _broadcastSSE('proactive_alerts', { alerts, timestamp: new Date() });
                state.logger?.info('AI-CORE', `📢 ${alerts.length} alertas proativos`);
            }

        } catch (err) {
            state.logger?.error('AI-CORE', 'Erro análise proativa', { error: err.message });
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
                        type: 'TREND_ALERT', severity: 'WARNING', pdvId: pdv.id,
                        title: `${pdv.nome}: vendas ${((pdv.vendas_hoje / dailyAvg - 1) * 100).toFixed(0)}% abaixo da média`,
                        action: 'Verifique ruptura, equipe ou eventos externos.',
                        source: 'proactive',
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
                        type: 'MARGIN_ALERT', severity: 'CRITICAL', pdvId: pdv.id,
                        title: `${pdv.nome}: margem crítica (${pdv.margem_operacional?.toFixed(1)}%)`,
                        action: 'Revisar mix de produtos e negociar reposição.',
                        source: 'proactive',
                    });
                }
            }
        } catch (_) {}
        return alerts;
    }

    async function _analyzeRupturePatterns() {
        const alerts = [];
        try {
            const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
            const { data: prods } = await state.supabase
                .from('produtos')
                .select('id, nome, qtd_disponivel, pdv_id')
                .eq('qtd_disponivel', 0)
                .lt('updated_at', twoDaysAgo)
                .limit(5);
            for (const p of prods || []) {
                alerts.push({
                    type: 'CHRONIC_STOCKOUT', severity: 'CRITICAL', prodId: p.id, pdvId: p.pdv_id,
                    title: `Ruptura crônica: ${p.nome} (>2 dias zerado)`,
                    action: 'Verificar PO emitida e status de entrega.',
                    source: 'proactive',
                });
            }
        } catch (_) {}
        return alerts;
    }

    // [v4] Novo: alerta quando muitos SKUs zerados simultaneamente
    async function _analyzeHighRuptureCount() {
        const alerts = [];
        try {
            const { count } = await state.supabase
                .from('produtos')
                .select('id', { count: 'exact', head: true })
                .eq('qtd_disponivel', 0);
            if ((count || 0) >= 5) {
                alerts.push({
                    type: 'HIGH_RUPTURE_COUNT', severity: 'CRITICAL',
                    title: `${count} SKUs em ruptura simultânea`,
                    action: 'Revisar plano de reposição urgente. Priorize os de maior valor.',
                    source: 'proactive',
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
                `${p.nome}:R$${Math.round(p.vendas_semana || 0)},m:${p.margem_operacional?.toFixed(1) || '?'}%`
            ).join(' | ');

            // [v4] Prompt comprimido — menos tokens
            const raw = await _callGroq([{
                role: 'user',
                content: `K11 Brain. 1 insight estratégico em 2 frases, dados semana:\n${summary}`,
            }], { maxTokens: 120 }); // [v4] era 150

            if (!raw) return null;
            return {
                type: 'WEEKLY_INSIGHT', severity: 'INFO',
                title: 'Insight Semanal K11 Brain',
                action: raw.trim(), source: 'proactive',
            };
        } catch (_) { return null; }
    }

    // ════════════════════════════════════════════════════════════════════
    // ESTRATÉGIA E ANOMALIA
    // ════════════════════════════════════════════════════════════════════

    async function generateStrategy(pdvData, options = {}) {
        const { depth = 'full' } = options;
        const memory  = _buildMemoryContext(pdvData?.id, null, 'ACTION');
        const context = _buildCompressedContext(pdvData, memory, 'ACTION');

        const prompt = depth === 'quick'
            ? `${context}\n\n3 ações prioritárias hoje. Formato: 1.[URGÊNCIA] Ação — Impacto`
            : `${context}\n\nEstratégia para hoje:\n1.SITUAÇÃO(1 linha)\n2.TOP 3 PRIORIDADES\n3.ALERTAS\n4.META REALISTA`;

        const raw = await _callGroq(
            [{ role: 'user', content: prompt }],
            { maxTokens: 450 } // [v4] era 700
        );
        if (!raw) return { strategy: 'Contexto insuficiente.', confidence: 'LOW' };

        const entry = `[${new Date().toLocaleDateString('pt-BR')}] ${pdvData?.nome}: ${raw.slice(0, 80)}`;
        state.memory.global.decisions.unshift(entry);
        if (state.memory.global.decisions.length > 30) state.memory.global.decisions.pop();
        if (pdvData?.id) _persistMemory('pdv', pdvData.id, 'strategy', entry);

        return { strategy: raw, confidence: 'HIGH', generatedAt: new Date() };
    }

    async function analyzeAnomaly(pdvId, pdvName, metric, currentValue, expectedValue, unit = '') {
        const pct       = expectedValue > 0 ? ((currentValue - expectedValue) / expectedValue * 100).toFixed(1) : '?';
        const direction = currentValue > expectedValue ? 'acima' : 'abaixo';

        // [v4] Prompt comprimido
        const raw = await _callGroq([{
            role: 'user',
            content: `PDV:${pdvName} métrica:${metric} atual:${currentValue}${unit} esperado:${expectedValue}${unit} desvio:${pct}%${direction}\n2-3 frases: causa provável e ação.`,
        }], { maxTokens: 200 }); // [v4] era 250

        if (!raw) return null;

        const record = { pdvId, metric, currentValue, expectedValue, analysis: raw.trim(), detectedAt: new Date() };
        state.memory.global.anomalies.unshift(record);
        if (state.memory.global.anomalies.length > 20) state.memory.global.anomalies.pop();
        _persistMemory('pdv', pdvId, 'anomaly', record);

        return record;
    }

    // ════════════════════════════════════════════════════════════════════
    // GROQ — v4: timeout 15s (era 25s)
    // ════════════════════════════════════════════════════════════════════

    function _callGroq(messages, options = {}) {
        return new Promise((resolve) => {
            const apiKey = process.env.GROQ_API_KEY;
            if (!apiKey) { resolve(null); return; }

            const body = JSON.stringify({
                model:       options.model       || state.models.fast,
                messages,
                max_tokens:  options.maxTokens   || 450, // [v4] era 600
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
            req.setTimeout(15000, () => { req.destroy(); resolve(null); }); // [v4] era 25s
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
        _sendToClient(res, 'connected', { status: 'ai_core_v4_ready' });

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
        getMemory:           (pdvId) => state.memory.pdvs.get(pdvId) || null,
        getProactiveAlerts:  () => state.proactiveQueue.slice(-20),
        clearProactiveQueue: () => { state.proactiveQueue = []; },
    };
})();

module.exports = aiCore;
