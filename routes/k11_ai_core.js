'use strict';

/**
 * K11 OMNI ELITE — AI Core v3 (k11_ai_core)
 * Cérebro central: chat com memória, CoT, alertas proativos, estratégias
 *
 * Expõe:
 *   init(supabase, logger, options)
 *   chat(message, context)        → { reply, reasoning, tokens }
 *   generateStrategy(pdvData, opts)→ { strategy, actions, forecast }
 *   analyzeAnomaly(...)           → { severity, cause, recommendation }
 *   addSSEClient(res)
 *   getProactiveAlerts()
 *   getMemory(pdvId)
 *   injectContext(key, value)
 */

const Anthropic = require('@anthropic-ai/sdk');

let _sb      = null;
let _logger  = console;
let _client  = null;
let _context = {};
const _memory  = {};          // pdvId → cache em RAM (espelho do Supabase)
const _alerts  = [];          // fila de alertas proativos
const _sseClients = new Set();

// ── MEMÓRIA PERSISTIDA ──────────────────────────────────────────
async function _loadMemory(contextId) {
    if (_memory[contextId]) return _memory[contextId]; // cache hit
    if (!_sb) return [];
    try {
        const { data } = await _sb
            .from('ai_conversations')
            .select('role, content')
            .eq('context_id', contextId)
            .order('created_at', { ascending: true })
            .limit(20);
        _memory[contextId] = (data || []).map(r => ({ role: r.role, content: r.content }));
        return _memory[contextId];
    } catch { return []; }
}

async function _saveMessage(contextId, role, content, model) {
    // Atualiza cache
    if (!_memory[contextId]) _memory[contextId] = [];
    _memory[contextId].push({ role, content });
    if (_memory[contextId].length > 40) _memory[contextId] = _memory[contextId].slice(-40);
    // Persiste
    if (!_sb) return;
    try {
        await _sb.from('ai_conversations').insert({ context_id: contextId, role, content, model: model || null });
        // Mantém só as 40 mais recentes no banco
        const { data: old } = await _sb.from('ai_conversations')
            .select('id').eq('context_id', contextId)
            .order('created_at', { ascending: false }).range(40, 200);
        if (old?.length) {
            await _sb.from('ai_conversations').delete().in('id', old.map(r => r.id));
        }
    } catch (_) {}
}

function _getClient() {
    if (_client) return _client;
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    _client = new Anthropic({ apiKey: key });
    return _client;
}

function _broadcast(event, data) {
    const payload = `data: ${JSON.stringify({ event, data, ts: new Date().toISOString() })}\n\n`;
    for (const res of _sseClients) {
        try { res.write(payload); } catch (_) { _sseClients.delete(res); }
    }
}

/** Chat com memória por PDV e Chain-of-Thought */
async function chat(message, { pdvId = 'global', userId, pdvData, mode = 'auto' } = {}) {
    const client = _getClient();
    if (!client) {
        return { reply: 'ANTHROPIC_API_KEY não configurada.', reasoning: null, tokens: 0, source: 'fallback' };
    }

    // Recupera/inicializa memória do PDV
    const history = (await _loadMemory(pdvId)).slice(-10);

    const systemPrompt = `Você é o K11 AI Core v3, o cérebro operacional do K11 OMNI ELITE.
Você analisa PDVs (pontos de venda), identifica padrões, gera estratégias e recomendações.

Contexto atual do sistema:
${JSON.stringify(_context, null, 2)}

${pdvData ? `Dados do PDV atual (${pdvId}):\n${JSON.stringify(pdvData, null, 2)}` : ''}

Responda sempre em português brasileiro, de forma direta e orientada a resultados.
Para análises complexas, use Chain-of-Thought: raciocine passo a passo antes de concluir.`;

    const messages = [
        ...history,
        { role: 'user', content: message },
    ];

    const response = await client.messages.create({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system:     systemPrompt,
        messages,
    });

    const reply = response.content[0]?.text || '';

    // Salva mensagem na memória persistida
    await _saveMessage(pdvId, 'user',      message, 'claude-sonnet-4-20250514');
    await _saveMessage(pdvId, 'assistant', reply,   'claude-sonnet-4-20250514');

    return {
        reply,
        reasoning:  mode === 'cot' ? _extractReasoning(reply) : null,
        tokens:     response.usage?.output_tokens || 0,
        pdvId,
        source:     'anthropic',
    };
}

function _extractReasoning(text) {
    const match = text.match(/(?:Raciocínio|Análise|Passo\s+\d+)[:\s]+([\s\S]+?)(?=\n\n|Conclusão|Recomendação|$)/i);
    return match?.[1]?.trim() || null;
}

/** Gera estratégia completa para um PDV */
async function generateStrategy(pdvData, { depth = 'full' } = {}) {
    const client = _getClient();
    if (!client) {
        return { strategy: 'API não configurada', actions: [], forecast: null };
    }

    const prompt = `Gere uma estratégia ${depth === 'full' ? 'completa' : 'rápida'} para este PDV.
Dados: ${JSON.stringify(pdvData, null, 2)}

Retorne APENAS JSON:
{
  "strategy": "resumo executivo da estratégia",
  "priority": "high|medium|low",
  "actions": [
    { "order": 1, "action": "descrição", "impact": "alto|médio|baixo", "deadline_days": 7 }
  ],
  "forecast": {
    "revenue_30d": 0,
    "growth_pct": 0,
    "risk_level": "high|medium|low"
  },
  "kpis": ["KPI 1", "KPI 2"]
}`;

    const response = await client.messages.create({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages:   [{ role: 'user', content: prompt }],
    });

    const text  = response.content[0]?.text || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { strategy: text, actions: [], forecast: null };
}

/** Analisa uma anomalia pontual */
async function analyzeAnomaly(pdvId, pdvName, metric, currentValue, expectedValue, unit = '') {
    const client = _getClient();
    const diff   = currentValue - expectedValue;
    const pct    = expectedValue !== 0 ? ((diff / expectedValue) * 100).toFixed(1) : 'N/A';

    if (!client) {
        return {
            severity:       Math.abs(parseFloat(pct)) > 30 ? 'high' : 'medium',
            cause:          `${metric} desviou ${pct}% do esperado`,
            recommendation: 'Verifique manualmente o PDV.',
            source:         'local',
        };
    }

    const prompt = `Anomalia detectada no PDV "${pdvName}" (${pdvId}):
Métrica: ${metric}
Valor atual: ${currentValue}${unit}
Valor esperado: ${expectedValue}${unit}
Desvio: ${pct}%

Analise a causa provável e recomende ações. Retorne JSON:
{
  "severity": "critical|high|medium|low",
  "cause": "causa provável em 1 frase",
  "recommendation": "ação recomendada em 1-2 frases",
  "urgency_hours": 24
}`;

    const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
    });

    const text  = response.content[0]?.text || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    const result = match ? JSON.parse(match[0]) : { severity: 'medium', cause: text };

    // Adiciona à fila de alertas proativos
    const alert = { pdvId, pdvName, metric, currentValue, expectedValue, ...result, ts: new Date().toISOString() };
    _alerts.unshift(alert);
    if (_alerts.length > 50) _alerts.pop();
    _broadcast('ai:anomaly', alert);

    return result;
}

/** Análise proativa periódica */
async function _runProactiveAnalysis() {
    const sb = _sb;
    if (!sb) return;
    try {
        const { data: pdvs } = await sb.from('pdvs').select('*').limit(20);
        if (!pdvs?.length) return;

        for (const pdv of pdvs) {
            if ((pdv.meta_pct || 100) < 40) {
                const alert = {
                    type:    'META_CRITICA',
                    pdvId:   pdv.id,
                    pdvName: pdv.nome,
                    msg:     `Meta em ${Math.round(pdv.meta_pct || 0)}% em ${pdv.nome}`,
                    ts:      new Date().toISOString(),
                };
                _alerts.unshift(alert);
                _broadcast('ai:proactive-alert', alert);
            }
        }
    } catch (_) {}
}

function addSSEClient(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    _sseClients.add(res);
    res.write(`data: ${JSON.stringify({ event: 'ai:connected', data: { alerts: _alerts.slice(0, 5) } })}\n\n`);
    const ka = setInterval(() => {
        try { res.write(': keepalive\n\n'); } catch (_) { clearInterval(ka); _sseClients.delete(res); }
    }, 30000);
    res.on('close', () => { clearInterval(ka); _sseClients.delete(res); });
}

function getProactiveAlerts() { return _alerts.slice(0, 20); }
function getMemory(pdvId) { return _memory[pdvId] || []; }
async function loadMemoryAsync(pdvId) { return await _loadMemory(pdvId); }
function injectContext(key, value) { _context[key] = value; }

function init(sb, logger, { analysisIntervalMs = 15 * 60 * 1000 } = {}) {
    _sb     = sb;
    _logger = logger || console;
    _runProactiveAnalysis();
    setInterval(_runProactiveAnalysis, analysisIntervalMs);
    _logger.info('AI-CORE', 'AI Core v3 inicializado');
}

module.exports = { init, chat, generateStrategy, analyzeAnomaly, addSSEClient, getProactiveAlerts, getMemory, loadMemoryAsync, injectContext };
