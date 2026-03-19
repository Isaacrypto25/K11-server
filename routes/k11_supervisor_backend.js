'use strict';

/**
 * K11 OMNI ELITE — Supervisor Backend (k11_supervisor_backend)
 * Motor de análise em background com SSE para o dashboard operacional
 *
 * Expõe:
 *   init(datastore, supabase, logger)
 *   addSSEClient(res)
 *   chat(message) → { reply, score, recommendations }
 *   getState()
 */

let _ds      = null;
let _sb      = null;
let _logger  = console;
let _groq    = null;
let _state   = { status: 'idle', lastCheck: null, score: 100, alerts: [] };
const _sseClients = new Set();

function _initGroq() {
    if (_groq) return _groq;
    const key = process.env.GROQ_API_KEY;
    if (!key?.startsWith('gsk_')) return null;
    try {
        const Groq = require('groq-sdk');
        _groq = new Groq({ apiKey: key });
    } catch (_) {}
    return _groq;
}

function _broadcast(event, data) {
    const payload = `data: ${JSON.stringify({ event, data, ts: new Date().toISOString() })}\n\n`;
    for (const res of _sseClients) {
        try { res.write(payload); } catch (_) { _sseClients.delete(res); }
    }
}

async function _runAnalysis() {
    try {
        const sb = _sb || _ds?.supabase;
        if (!sb) return;

        // Coleta dados dos PDVs
        const { data: pdvs } = await sb.from('pdvs').select('*').limit(50);
        if (!pdvs?.length) return;

        const alerts = [];
        let totalScore = 100;

        for (const pdv of pdvs) {
            if (pdv.estoque_critico) {
                alerts.push({ type: 'estoque', pdv: pdv.nome, msg: `Estoque crítico em ${pdv.nome}` });
                totalScore -= 5;
            }
            if (pdv.meta_atingida === false) {
                alerts.push({ type: 'meta', pdv: pdv.nome, msg: `Meta não atingida: ${pdv.nome}` });
                totalScore -= 3;
            }
        }

        _state = {
            status:    'active',
            lastCheck: new Date().toISOString(),
            score:     Math.max(0, totalScore),
            alerts,
            pdvsAnalisados: pdvs.length,
        };

        _broadcast('supervisor:update', _state);
        _logger.info('SUPERVISOR', `Análise concluída — score: ${_state.score}`);
    } catch (e) {
        _logger.error('SUPERVISOR', `Erro na análise: ${e.message}`);
    }
}

async function chat(message) {
    const groq = _initGroq();
    if (!groq) {
        return {
            reply:           'Supervisor: API Groq não configurada. Configure GROQ_API_KEY.',
            score:           _state.score,
            recommendations: _state.alerts.map(a => a.msg),
        };
    }

    const systemPrompt = `Você é o Supervisor de IA do K11 OMNI ELITE, um sistema de gestão de PDVs (pontos de venda).
Estado atual do sistema: ${JSON.stringify(_state)}
Responda de forma direta, objetiva e orientada a ação. Máximo 3 frases.`;

    const completion = await groq.chat.completions.create({
        model:       'llama-3.3-70b-versatile',
        messages:    [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: message },
        ],
        max_tokens:  500,
        temperature: 0.5,
    });

    return {
        reply:           completion.choices[0]?.message?.content || 'Sem resposta.',
        score:           _state.score,
        recommendations: _state.alerts.map(a => a.msg),
    };
}

function addSSEClient(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    _sseClients.add(res);

    // Envia estado atual imediatamente
    res.write(`data: ${JSON.stringify({ event: 'supervisor:state', data: _state, ts: new Date().toISOString() })}\n\n`);

    const keepAlive = setInterval(() => {
        try { res.write(': keepalive\n\n'); } catch (_) { clearInterval(keepAlive); _sseClients.delete(res); }
    }, 30000);

    res.on('close', () => {
        clearInterval(keepAlive);
        _sseClients.delete(res);
    });
}

function getState() { return _state; }

function init(ds, sb, logger) {
    _ds     = ds;
    _sb     = sb;
    _logger = logger || console;

    // Roda análise a cada 5 minutos
    _runAnalysis();
    setInterval(_runAnalysis, 5 * 60 * 1000);

    _logger.info('SUPERVISOR', 'Supervisor backend inicializado');
}

module.exports = { init, addSSEClient, chat, getState };
