'use strict';

/**
 * K11 OMNI ELITE — PDV Domination Engine (k11_pdv_domination_engine)
 * Motor de ações agressivas de PDV: promoções, reposição, alertas automáticos
 *
 * Expõe:
 *   init(datastore, supabase, logger, pdvId, pdvName, priceIntel)
 *   addSSEClient(res)
 *   getState()
 *   runAction(action, payload)
 */

let _ds        = null;
let _sb        = null;
let _logger    = console;
let _priceIntel= null;
let _pdvId     = 'pdv_01';
let _pdvName   = 'PDV Principal';

const _sseClients = new Set();

let _state = {
    pdvId:       null,
    pdvName:     null,
    status:      'idle',
    lastCycle:   null,
    actions:     [],
    metrics:     {},
    alerts:      [],
};

function _broadcast(event, data) {
    const payload = `data: ${JSON.stringify({ event, data, ts: new Date().toISOString() })}\n\n`;
    for (const res of _sseClients) {
        try { res.write(payload); } catch (_) { _sseClients.delete(res); }
    }
}

/** Gera ações agressivas baseadas nos dados do PDV */
async function _runDominationCycle() {
    const sb = _sb || _ds?.supabase;
    const actions = [];

    try {
        // Busca dados do PDV
        if (sb) {
            const { data: pdv } = await sb.from('pdvs').select('*').eq('id', _pdvId).single();
            if (pdv) {
                // Regras de domínio
                if ((pdv.estoque_pct || 100) < 20) {
                    actions.push({ type: 'REPOSICAO_URGENTE', priority: 'high', msg: `Estoque abaixo de 20% em ${_pdvName}` });
                }
                if ((pdv.meta_pct || 100) < 50 && new Date().getDate() > 15) {
                    actions.push({ type: 'CAMPANHA_EMERGENCIA', priority: 'high', msg: `Meta abaixo de 50% na segunda quinzena` });
                }
                if ((pdv.vendas_hoje || 0) === 0) {
                    actions.push({ type: 'ATIVACAO_PDV', priority: 'critical', msg: `Nenhuma venda registrada hoje em ${_pdvName}` });
                }

                _state.metrics = {
                    estoquesPct:    pdv.estoque_pct,
                    metaPct:        pdv.meta_pct,
                    vendasHoje:     pdv.vendas_hoje,
                    clientesHoje:   pdv.clientes_hoje,
                };
            }
        }

        _state = {
            ..._state,
            pdvId:     _pdvId,
            pdvName:   _pdvName,
            status:    'active',
            lastCycle: new Date().toISOString(),
            actions:   actions.slice(-20),
            alerts:    actions.filter(a => a.priority === 'critical'),
        };

        if (actions.length) {
            _broadcast('pdv:actions', { pdvId: _pdvId, actions });
        }
    } catch (e) {
        _logger.error('PDV-DOMINATION', `Erro no ciclo: ${e.message}`);
    }
}

function addSSEClient(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    _sseClients.add(res);
    res.write(`data: ${JSON.stringify({ event: 'pdv:state', data: _state })}\n\n`);

    const ka = setInterval(() => {
        try { res.write(': keepalive\n\n'); } catch (_) { clearInterval(ka); _sseClients.delete(res); }
    }, 30000);
    res.on('close', () => { clearInterval(ka); _sseClients.delete(res); });
}

function getState() { return _state; }

async function runAction(action, payload = {}) {
    _logger.info('PDV-DOMINATION', `Executando ação: ${action}`, payload);
    _broadcast('pdv:action-result', { action, payload, ts: new Date().toISOString() });
    return { ok: true, action, ts: new Date().toISOString() };
}

function init(ds, sb, logger, pdvId, pdvName, priceIntel) {
    _ds         = ds;
    _sb         = sb;
    _logger     = logger || console;
    _pdvId      = pdvId  || 'pdv_01';
    _pdvName    = pdvName || 'PDV Principal';
    _priceIntel = priceIntel || null;

    _state.pdvId   = _pdvId;
    _state.pdvName = _pdvName;

    _runDominationCycle();
    setInterval(_runDominationCycle, 10 * 60 * 1000); // a cada 10 min
    _logger.info('PDV-DOMINATION', `Engine inicializado para ${_pdvName}`);
}

module.exports = { init, addSSEClient, getState, runAction };
