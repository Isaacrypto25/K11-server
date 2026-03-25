/**
 * K11 OMNI ELITE — Live Engine v2.0
 * ══════════════════════════════════
 * Conecta aos SSE streams do servidor e distribui eventos para o LivePanel.
 * Gerencia reconexão automática, debounce de alertas e estado offline.
 *
 * Streams consumidos:
 *   /api/ai/v3/stream        → alertas proativos do AI Core
 *   /api/decision/stream     → ciclos do Decision Engine
 *   /api/price-intel/stream  → atualizações de preço
 *   /api/supervisor/stream   → status do supervisor
 *
 * Eventos emitidos (window.dispatchEvent):
 *   k11:score      → { score, status }
 *   k11:priority   → { priorities[], summary, source }
 *   k11:alert      → { id, type, message, severity, ts }
 *   k11:status     → { status: 'online'|'local'|'offline'|'reconnecting' }
 *   k11:analysis   → { score, status, ts }
 *   k11:price      → { product, price, change, ts }
 *   k11:decision   → { replenishments[], alerts[] }
 */

'use strict';

const K11Live = (() => {

    // ── ESTADO ──────────────────────────────────────────────────
    let _status          = 'offline';
    let _score           = null;
    let _sources         = {};     // streamName → EventSource
    let _reconnectTimers = {};
    let _alertDedup      = new Set();
    let _initialized     = false;

    const RECONNECT_BASE_MS = 3000;
    const RECONNECT_MAX_MS  = 60000;
    const ALERT_DEDUP_MS    = 5 * 60 * 1000;  // 5 min

    // ── EMIT HELPER ──────────────────────────────────────────────
    function _emit(event, detail) {
        window.dispatchEvent(new CustomEvent(event, { detail }));
    }

    // ── DEDUPLICAÇÃO DE ALERTAS ──────────────────────────────────
    function _isDupe(id) {
        if (_alertDedup.has(id)) return true;
        _alertDedup.add(id);
        setTimeout(() => _alertDedup.delete(id), ALERT_DEDUP_MS);
        return false;
    }

    // ── PROCESSADORES DE EVENTO ──────────────────────────────────
    function _handleAIEvent(rawData) {
        try {
            const d = JSON.parse(rawData);
            const event  = d.event || '';
            const data   = d.data  || d;

            if (event === 'ai:proactive-alert' || event === 'ai:anomaly') {
                const alertId = `${data.pdvId}-${data.metric || data.type}-${Date.now()}`;
                if (_isDupe(alertId)) return;
                _emit('k11:alert', {
                    id:       alertId,
                    type:     data.type || 'anomalia',
                    message:  data.msg || data.cause || 'Alerta detectado',
                    severity: data.severity || 'medium',
                    pdvName:  data.pdvName,
                    ts:       data.ts || new Date().toISOString(),
                });
            }

            if (event === 'ai:connected') {
                const alerts = data.alerts || [];
                alerts.forEach(a => _handleAIEvent(JSON.stringify({ event: 'ai:proactive-alert', data: a })));
            }

        } catch (_) {}
    }

    function _handleDecisionEvent(rawData) {
        try {
            const d    = JSON.parse(rawData);
            const data = d.data || d;

            if (d.event === 'decision:cycle-complete' || d.event === 'decision:state') {
                _emit('k11:decision', {
                    replenishments: data.replenishments || [],
                    alerts:         data.alerts         || [],
                    pdvsScored:     data.pdvsScored     || 0,
                    ts:             data.lastCycle      || new Date().toISOString(),
                });

                if ((data.alerts || []).length > 0) {
                    data.alerts.slice(0, 3).forEach(a => {
                        const alertId = `decision-${a.pdvId}-${Date.now()}`;
                        if (_isDupe(alertId)) return;
                        _emit('k11:alert', {
                            id:      alertId,
                            type:    'pdv_critico',
                            message: `PDV crítico: ${a.pdvName || a.pdvId} (score ${a.score || 0})`,
                            severity:'high',
                            ts:      new Date().toISOString(),
                        });
                    });
                }
            }

            if (d.event === 'decision:replenish') {
                _emit('k11:alert', {
                    id:      `replenish-${data.productId}-${Date.now()}`,
                    type:    'reposicao',
                    message: `Reposição: ${data.productName} — ${data.suggestedOrder} un`,
                    severity:'medium',
                    ts:      new Date().toISOString(),
                });
            }
        } catch (_) {}
    }

    function _handlePriceEvent(rawData) {
        try {
            const d    = JSON.parse(rawData);
            const data = d.data || d;

            if (d.event === 'price:alert') {
                const alertId = `price-${data.productId || data.product}-${Date.now()}`;
                if (_isDupe(alertId)) return;
                _emit('k11:alert', {
                    id:      alertId,
                    type:    'preco',
                    message: `Preço: ${data.product} — ${data.reason || 'variação detectada'}`,
                    severity:'low',
                    ts:      new Date().toISOString(),
                });
                _emit('k11:price', data);
            }
        } catch (_) {}
    }

    function _handleSupervisorEvent(rawData) {
        try {
            const d    = JSON.parse(rawData);
            const data = d.data || d;

            if (d.event === 'supervisor:update' || d.event === 'supervisor:state') {
                const score = data.score ?? _score;
                _score = score;
                const status = score >= 80 ? 'online' : score >= 50 ? 'local' : 'offline';
                _emit('k11:analysis', { score, status, ts: new Date().toISOString() });
                _emit('k11:score',    { score, status });

                if (data.alerts?.length) {
                    const priorities = data.alerts.map((a, i) => ({
                        id:      `sup-${i}`,
                        urgency: a.type === 'meta' ? 'high' : 'medium',
                        type:    a.type,
                        message: a.msg,
                        sku:     null,
                    }));
                    _emit('k11:priority', { priorities, summary: `${priorities.length} alertas do supervisor`, source: 'server' });
                }
            }
        } catch (_) {}
    }

    // ── CONEXÃO SSE ───────────────────────────────────────────────
    function _connect(name, path, handler, retryMs = RECONNECT_BASE_MS) {
        if (_sources[name]) {
            try { _sources[name].close(); } catch (_) {}
        }

        const token = K11Auth?.getToken?.();
        if (!token) {
            setTimeout(() => _connect(name, path, handler, retryMs), 2000);
            return;
        }

        // EventSource não suporta headers customizados —
        // passamos o token via query param (o servidor aceita ?token=...)
        const url = `${K11_SERVER_URL}${path}?token=${encodeURIComponent(token)}`;
        const es  = new EventSource(url);
        _sources[name] = es;

        es.onopen = () => {
            clearTimeout(_reconnectTimers[name]);
            if (_status !== 'online') {
                _status = 'online';
                _emit('k11:status', { status: 'online' });
                console.log(`[K11Live] ✅ ${name} conectado`);
            }
        };

        es.onmessage = e => {
            if (e.data?.startsWith(':')) return; // keepalive
            try { handler(e.data); } catch (_) {}
        };

        es.onerror = () => {
            es.close();
            delete _sources[name];

            const allDown = Object.keys(_sources).length === 0;
            if (allDown && _status === 'online') {
                _status = 'reconnecting';
                _emit('k11:status', { status: 'reconnecting' });
            }

            const next = Math.min(retryMs * 1.5, RECONNECT_MAX_MS);
            _reconnectTimers[name] = setTimeout(
                () => _connect(name, path, handler, next),
                retryMs
            );
        };
    }

    // ── PATCH DO SERVIDOR PARA ACEITAR TOKEN VIA QUERY ───────────
    // (adicionamos suporte no middleware requireAuth)

    // ── POLLING FALLBACK (quando SSE não está disponível) ─────────
    function _startPolling() {
        setInterval(async () => {
            if (!K11Auth?.isAuthenticated?.()) return;
            try {
                const res  = await K11Auth.fetch('/api/ai/v3/proactive');
                const data = await res?.json();
                if (data?.ok && data.alerts?.length) {
                    data.alerts.forEach(a => {
                        _handleAIEvent(JSON.stringify({ event: 'ai:proactive-alert', data: a }));
                    });
                }
            } catch (_) {}
        }, 30000); // a cada 30s
    }

    // ── API PÚBLICA ────────────────────────────────────────────────
    function init() {
        if (_initialized) return;
        _initialized = true;

        // Aguarda autenticação
        const tryConnect = () => {
            if (!K11Auth?.isAuthenticated?.()) {
                setTimeout(tryConnect, 1000);
                return;
            }

            const supportsSSE = typeof EventSource !== 'undefined';

            if (supportsSSE) {
                _connect('ai',         '/api/ai/v3/stream',         _handleAIEvent);
                _connect('decision',   '/api/decision/stream',      _handleDecisionEvent);
                _connect('price',      '/api/price-intel/stream',   _handlePriceEvent);
                _connect('supervisor', '/api/supervisor/stream',    _handleSupervisorEvent);
            } else {
                _status = 'local';
                _emit('k11:status', { status: 'local' });
                _startPolling();
            }

            _emit('k11:status', { status: 'reconnecting' });
        };

        // Espera o app carregar
        window.addEventListener('k11:ready', tryConnect, { once: true });
        // Fallback: tenta após 3s se k11:ready não disparar
        setTimeout(tryConnect, 3000);

        console.log('[K11Live] ✅ Live Engine v2 inicializado');
    }

    function forceAnalysis() {
        K11Auth?.fetch?.('/api/decision/run-cycle', { method: 'POST' })
            .catch(() => {});
        K11Auth?.fetch?.('/api/ai/v3/proactive')
            .then(r => r?.json())
            .then(d => { if (d?.ok) d.alerts?.forEach(a => _handleAIEvent(JSON.stringify({ event:'ai:proactive-alert', data:a }))); })
            .catch(() => {});
    }

    function getStatus() { return { status: _status, score: _score, streams: Object.keys(_sources) }; }
    function disconnect() {
        Object.values(_sources).forEach(es => { try { es.close(); } catch (_) {} });
        _sources = {};
        _status  = 'offline';
        _emit('k11:status', { status: 'offline' });
    }

    return { init, forceAnalysis, getStatus, disconnect };

})();

window.K11Live = K11Live;

// Auto-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', K11Live.init);
} else {
    K11Live.init();
}
