'use strict';

/**
 * K11 OMNI ELITE — Decision Engine (k11_decision_engine)
 * Health scores, forecasts de demanda, pedidos automáticos de reposição
 *
 * Expõe:
 *   init(datastore, supabase, logger, options)
 *   addSSEClient(res)
 *   getState()
 *   getHealthScore(pdvId)
 *   getForecast(productId)
 *   runFullCycle()
 */

let _ds      = null;
let _sb      = null;
let _logger  = console;
let _opts    = { cycleIntervalMs: 60 * 60 * 1000, safetyStockDays: 5, forecastHorizonDays: 14, autoReplenishEnabled: true };

const _sseClients    = new Set();
const _healthScores  = {};  // pdvId → score object
const _forecasts     = {};  // productId → forecast object

let _state = {
    status:     'idle',
    lastCycle:  null,
    pdvsScored: 0,
    replenishments: [],
    alerts: [],
};

function _broadcast(event, data) {
    const payload = `data: ${JSON.stringify({ event, data, ts: new Date().toISOString() })}\n\n`;
    for (const res of _sseClients) {
        try { res.write(payload); } catch (_) { _sseClients.delete(res); }
    }
}

/** Calcula health score de 0-100 para um PDV */
function _calcHealthScore(pdv) {
    let score = 100;
    const issues = [];

    const stockPct   = pdv.estoque_pct   || 100;
    const metaPct    = pdv.meta_pct      || 100;
    const vendasHoje = pdv.vendas_hoje   || 0;
    const ticketMedio= pdv.ticket_medio  || 0;

    if (stockPct < 10)  { score -= 40; issues.push('Estoque crítico (< 10%)'); }
    else if (stockPct < 25) { score -= 20; issues.push('Estoque baixo (< 25%)'); }

    if (metaPct < 30)   { score -= 30; issues.push('Meta muito abaixo (< 30%)'); }
    else if (metaPct < 60) { score -= 15; issues.push('Meta abaixo (< 60%)'); }

    if (vendasHoje === 0 && new Date().getHours() > 14) { score -= 25; issues.push('Sem vendas hoje'); }

    const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';

    return {
        pdvId:    pdv.id,
        pdvName:  pdv.nome,
        score:    Math.max(0, score),
        grade,
        issues,
        metrics:  { stockPct, metaPct, vendasHoje, ticketMedio },
        ts:       new Date().toISOString(),
    };
}

/** Busca histórico real de vendas do produto */
async function _fetchSalesHistory(productId) {
    if (!_sb) return [];
    try {
        const cutoff = new Date(Date.now() - 30 * 864e5).toISOString();
        const { data } = await _sb
            .from('vendas')
            .select('items, created_at')
            .gte('created_at', cutoff)
            .eq('status', 'concluida');

        if (!data?.length) return [];

        // Agrupa quantidade vendida por dia
        const byDay = {};
        data.forEach(venda => {
            const day = venda.created_at.slice(0, 10);
            const items = Array.isArray(venda.items) ? venda.items : [];
            items.forEach(item => {
                if (item.product_id === productId || item.sku === productId) {
                    byDay[day] = (byDay[day] || 0) + (item.quantidade || item.qty || 1);
                }
            });
        });
        return Object.values(byDay);
    } catch { return []; }
}

/** Gera forecast de demanda via histórico real ou média móvel */
async function _calcForecastAsync(product) {
    const salesHistory = await _fetchSalesHistory(product.id);
    return _calcForecast(product, salesHistory);
}

function _calcForecast(product, salesHistory = []) {
    const horizon = _opts.forecastHorizonDays;

    // Média dos últimos 30 dias (dados reais ou fallback no campo venda_media_dia)
    const recent   = salesHistory.slice(-30);
    const avgDaily = recent.length
        ? recent.reduce((a, v) => a + v, 0) / recent.length
        : (product.venda_media_dia || 5);

    const forecast14d  = Math.ceil(avgDaily * horizon);
    const safetyStock  = Math.ceil(avgDaily * _opts.safetyStockDays);
    const stockAtual   = product.estoque_atual || 0;
    const needReplenish= stockAtual < (forecast14d + safetyStock);

    return {
        productId:     product.id,
        productName:   product.nome,
        avgDailySales: parseFloat(avgDaily.toFixed(2)),
        forecast14d,
        safetyStock,
        stockAtual,
        needReplenish,
        suggestedOrder: needReplenish ? Math.max(0, forecast14d + safetyStock - stockAtual) : 0,
        confidence:    recent.length >= 14 ? 'high' : recent.length >= 7 ? 'medium' : 'low',
        ts:            new Date().toISOString(),
    };
}

async function runFullCycle() {
    const sb = _sb || _ds?.supabase;
    _logger.info('DECISION', 'Iniciando ciclo de decisão...');

    const replenishments = [];
    const alerts         = [];
    let pdvsScored       = 0;

    try {
        // === PDV Health Scores ===
        if (sb) {
            const { data: pdvs } = await sb.from('pdvs').select('*').limit(100);
            for (const pdv of (pdvs || [])) {
                const hs = _calcHealthScore(pdv);
                _healthScores[pdv.id] = hs;
                pdvsScored++;
                if (hs.score < 40) {
                    alerts.push({ type: 'PDV_CRITICAL', pdvId: pdv.id, pdvName: pdv.nome, score: hs.score });
                    _broadcast('decision:alert', hs);
                }
            }
        }

        // === Product Forecasts & Replenishment ===
        if (sb) {
            const { data: products } = await sb.from('produtos').select('*').limit(50);
            for (const product of (products || [])) {
                const forecast = await _calcForecastAsync(product);
                _forecasts[product.id] = forecast;

                if (forecast.needReplenish && _opts.autoReplenishEnabled) {
                    replenishments.push({
                        productId:  product.id,
                        productName:product.nome,
                        quantity:   forecast.suggestedOrder,
                        ts:         new Date().toISOString(),
                    });
                    _broadcast('decision:replenish', forecast);
                }
            }
        }

        _state = {
            status:         'active',
            lastCycle:      new Date().toISOString(),
            pdvsScored,
            replenishments: replenishments.slice(-20),
            alerts:         alerts.slice(-20),
        };

        _broadcast('decision:cycle-complete', _state);
        _logger.info('DECISION', `Ciclo concluído — ${pdvsScored} PDVs, ${replenishments.length} reposições`);
    } catch (e) {
        _logger.error('DECISION', `Erro no ciclo: ${e.message}`);
    }
}

function addSSEClient(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    _sseClients.add(res);
    res.write(`data: ${JSON.stringify({ event: 'decision:state', data: _state })}\n\n`);
    const ka = setInterval(() => {
        try { res.write(': keepalive\n\n'); } catch (_) { clearInterval(ka); _sseClients.delete(res); }
    }, 30000);
    res.on('close', () => { clearInterval(ka); _sseClients.delete(res); });
}

function getState()              { return _state; }
function getHealthScore(pdvId)   { return _healthScores[pdvId] || null; }
function getForecast(productId)  { return _forecasts[productId] || null; }

function init(ds, sb, logger, opts = {}) {
    _ds     = ds;
    _sb     = sb;
    _logger = logger || console;
    _opts   = { ..._opts, ...opts };

    runFullCycle();
    setInterval(runFullCycle, _opts.cycleIntervalMs);
    _logger.info('DECISION', `Decision Engine inicializado (ciclo a cada ${_opts.cycleIntervalMs / 60000}min)`);
}

module.exports = { init, addSSEClient, getState, getHealthScore, getForecast, runFullCycle };
