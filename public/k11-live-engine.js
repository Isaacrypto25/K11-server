/**
 * K11 OMNI ELITE — LIVE ENGINE v1.0
 * ════════════════════════════════════════════════════════════════
 * Transforma o sistema de FOTO em FILME.
 *
 * Este módulo é o coração vivo do K11 no frontend.
 * Ele NÃO espera o usuário perguntar. Ele age.
 *
 * RESPONSABILIDADES:
 *  ① SSE — conexão persistente com o servidor (alertas em tempo real)
 *  ② CICLO LOCAL — análise cruzada a cada 5min sem depender do servidor
 *  ③ FILA DE PRIORIDADES — sempre atualizada, disponível para todas as views
 *  ④ CONTADOR DE MISSÃO — pulsa durante a janela de 60min operacional
 *  ⑤ NOTIFICAÇÕES NATIVAS — push para o operador mesmo fora da tela
 *  ⑥ EVENTOS GLOBAIS — k11:priority, k11:alert, k11:score, k11:tick
 *
 * INTEGRAÇÃO (dashboard.html):
 *  Inserir após k11-data-inject.js, antes de k11-float-ai.js:
 *  <script src="k11-live-engine.js"></script>
 *  <script src="k11-live-panel.js"></script>
 *
 * DEPENDE DE: k11-config.js (K11_SERVER_URL, K11Auth), k11-app.js
 */

'use strict';

const K11Live = (() => {

    // ─── ESTADO ────────────────────────────────────────────────
    const _state = {
        score:          null,
        status:         'offline',
        priorities:     [],
        alerts:         [],
        lastAnalysisTs: null,
        lastDataHash:   null,
        cycleCount:     0,
        sseConnected:   false,
        missionStart:   null,
        missionEnd:     null,
        missionLabel:   '',
    };

    let _sseSource      = null;
    let _cycleTimer     = null;
    let _tickTimer      = null;
    let _reconnectTimer = null;
    let _started        = false;

    const CYCLE_MS        = 5 * 60 * 1000;   // ciclo local a cada 5min
    const TICK_MS         = 1000;             // tick do contador de missão
    const SSE_RECONNECT   = 8000;             // reconecta SSE após 8s
    const ALERT_DEDUP_TTL = 15 * 60 * 1000;  // não repete alerta em 15min
    const _alertSentAt    = new Map();

    // ─── EMIT ──────────────────────────────────────────────────
    function _emit(name, detail) {
        window.dispatchEvent(new CustomEvent(name, { detail }));
    }

    // ─── SSE: CONEXÃO VIVA ─────────────────────────────────────
    function _connectSSE() {
        if (!K11Auth.isAuthenticated()) return;
        const token = K11Auth.getToken();
        const url   = `${K11_SERVER_URL}/api/ai/stream?token=${encodeURIComponent(token)}`;

        if (_sseSource) { _sseSource.close(); _sseSource = null; }

        try {
            _sseSource = new EventSource(url);

            _sseSource.addEventListener('connected', (e) => {
                const data = _parse(e.data, {});
                _state.sseConnected = true;
                if (data.score != null)     { _state.score = data.score; _emit('k11:score', { score: data.score }); }
                if (data.queue?.length)     { _state.priorities = data.queue; _emit('k11:priority', { priorities: data.queue }); }
                _updateEngineStatus('online');
                console.log('[K11Live] ✅ SSE conectado');
            });

            _sseSource.addEventListener('analysis', (e) => {
                const data = _parse(e.data, null);
                if (!data) return;
                _state.score          = data.score;
                _state.status         = data.status;
                _state.priorities     = data.priorities || [];
                _state.lastAnalysisTs = data.ts;
                _state.cycleCount++;
                _emit('k11:score',    { score: data.score, status: data.status });
                _emit('k11:priority', { priorities: _state.priorities, summary: data.summary, source: 'server' });
                _emit('k11:analysis', data);
                console.log(`[K11Live] 📡 Análise recebida — Score:${data.score} | Prio:${_state.priorities.length}`);
            });

            _sseSource.addEventListener('alert', (e) => {
                const alert = _parse(e.data, null);
                if (alert) _processAlert(alert);
            });

            _sseSource.onerror = () => {
                _state.sseConnected = false;
                _sseSource?.close(); _sseSource = null;
                _updateEngineStatus('local');
                if (_reconnectTimer) clearTimeout(_reconnectTimer);
                _reconnectTimer = setTimeout(_connectSSE, SSE_RECONNECT);
            };

        } catch (err) {
            console.warn('[K11Live] SSE não disponível:', err.message);
            _updateEngineStatus('local');
        }
    }

    // ─── CICLO LOCAL ───────────────────────────────────────────
    function _runLocalCycle() {
        const db = window.APP?.db;
        if (!db || !db.produtos?.length) return;

        try {
            const hash = `${db.produtos.length}_${db.pdv.length}_${db.tarefas?.length || 0}_${Math.floor(Date.now() / 60000)}`;
            if (hash === _state.lastDataHash) return;
            _state.lastDataHash = hash;
            _state.cycleCount++;

            const result = _crossAnalyze(db);

            // Só substitui prioridades localmente se SSE não está ativo
            if (!_state.sseConnected) {
                const prios = _buildLocalPriorities(result);
                _state.priorities = prios;
                _emit('k11:priority', { priorities: prios, source: 'local' });

                // Score local estimado
                const localScore = _estimateLocalScore(result);
                _state.score = localScore;
                _emit('k11:score', { score: localScore, source: 'local' });
            }

            _checkCriticalAlerts(result);
            _state.lastAnalysisTs = new Date().toISOString();
            _emit('k11:cycle', { result, cycleCount: _state.cycleCount });

        } catch (err) {
            console.warn('[K11Live] Erro ciclo local:', err.message);
        }
    }

    function _crossAnalyze(db) {
        const produtos  = db.produtos       || [];
        const pdv       = db.pdv            || [];
        const movimento = db.movimento      || [];
        const tarefas   = db.tarefas        || [];
        const ags       = db.agendamentos   || [];

        // Mapa de vendas por SKU
        const vendasMap = new Map();
        for (const v of pdv) {
            const sku = String(v['Nº do produto'] || '').trim();
            if (!sku) continue;
            const e = vendasMap.get(sku) || { vendido: 0, disp: 0 };
            e.vendido += Number(v['Quantidade vendida'] || 0);
            e.disp    += Number(v['Quantidade disponibilizada'] || 0);
            vendasMap.set(sku, e);
        }

        // Mapa de movimentos abertos
        const transitoMap = new Map();
        for (const m of movimento) {
            const st = String(m['Status da tarefa de depósito'] || '').toLowerCase();
            if (st.includes('conc') || st.includes('fech')) continue;
            const sku = String(m['Produto'] || '').trim();
            if (sku) transitoMap.set(sku, (transitoMap.get(sku) || 0) + Number(m['Qtd.prev.orig.UMA'] || 0));
        }

        const rupturas           = [];
        const criticos           = [];
        const vendeZeroEstoque   = [];

        for (const p of produtos) {
            const sku      = String(p.id);
            const qtd      = p.total ?? 0;
            const qtdPkl   = p.pkl   ?? 0;
            const venda    = vendasMap.get(sku);
            const transito = transitoMap.get(sku) || 0;

            if (qtd <= 0) {
                rupturas.push({ sku, desc: p.desc, qtd, transito, vendido: venda?.vendido || 0 });
                if ((venda?.vendido || 0) > 0)
                    vendeZeroEstoque.push({ sku, desc: p.desc, vendido: venda.vendido, transito });
            } else if (qtdPkl <= 3 || p.categoriaCor === 'red') {
                criticos.push({ sku, desc: p.desc, qtd, qtdPkl, transito, vendido: venda?.vendido || 0 });
            }
        }

        const hoje          = new Date().toISOString().slice(0, 10);
        const entregasHoje  = ags.filter(ag => String(ag.dataInicio).slice(0, 10) === hoje);
        const tarefasPend   = tarefas.filter(t => !t.done);

        return {
            rupturas:         rupturas.slice(0, 30),
            criticos:         criticos.slice(0, 30),
            vendeZeroEstoque: vendeZeroEstoque.slice(0, 15),
            entregasHoje,
            tarefasPend,
            totalProdutos:    produtos.length,
            totalRupturas:    rupturas.length,
            totalCriticos:    criticos.length,
        };
    }

    function _buildLocalPriorities(r) {
        const prios = [];

        // P1: Ruptura com histórico de venda — mais crítico
        for (const p of r.vendeZeroEstoque.slice(0, 3)) {
            prios.push({
                rank:    prios.length + 1,
                type:    'ruptura',
                title:   `RUPTURA COM VENDA`,
                desc:    `${_short(p.desc, p.sku)} — vendeu ${p.vendido}un, estoque ZERO.${p.transito ? ` ${p.transito}un em trânsito.` : ' ⚠ Sem reposição aberta.'}`,
                urgency: 'alta',
                cod:     p.sku,
            });
        }

        // P2: Críticos sem reposição
        for (const p of r.criticos.filter(c => !c.transito).slice(0, 2)) {
            prios.push({
                rank:    prios.length + 1,
                type:    'critico',
                title:   `PKL CRÍTICO`,
                desc:    `${_short(p.desc, p.sku)} — PKL restante: ${p.qtdPkl}un. Iniciar abastecimento agora.`,
                urgency: 'media',
                cod:     p.sku,
            });
        }

        // P3: Entregas do dia
        for (const ag of r.entregasHoje.slice(0, 2)) {
            prios.push({
                rank:    prios.length + 1,
                type:    'entrega',
                title:   `ENTREGA HOJE`,
                desc:    `${ag.fornecedor} — ${ag.qtdAgendada}un agendadas. Doca: ${ag.doca || 'não definida'}. Liberar área.`,
                urgency: 'media',
                cod:     null,
            });
        }

        // P4: Tarefas pendentes
        if (r.tarefasPend.length > 0) {
            prios.push({
                rank:    prios.length + 1,
                type:    'tarefa',
                title:   `${r.tarefasPend.length} TAREFA(S) PENDENTE(S)`,
                desc:    _short(r.tarefasPend[0]?.task, 'Verificar tarefas do turno', 60),
                urgency: 'baixa',
                cod:     null,
            });
        }

        return prios;
    }

    function _estimateLocalScore(r) {
        let score = 100;
        score -= Math.min(40, r.vendeZeroEstoque.length * 8);
        score -= Math.min(20, r.totalRupturas * 2);
        score -= Math.min(15, r.criticos.length * 3);
        score -= Math.min(10, r.tarefasPend.length * 2);
        return Math.max(0, Math.round(score));
    }

    function _checkCriticalAlerts(r) {
        const now = Date.now();

        for (const p of r.vendeZeroEstoque.slice(0, 5)) {
            const key = `ruptura_${p.sku}`;
            if (now - (_alertSentAt.get(key) || 0) < ALERT_DEDUP_TTL) continue;
            _alertSentAt.set(key, now);
            _processAlert({
                id: key, type: 'ruptura', severity: 'high',
                message: `RUPTURA: ${p.sku} — ${_short(p.desc, p.sku, 30)} | Vendeu ${p.vendido}un, estoque ZERO`,
            });
        }

        for (const ag of r.entregasHoje.slice(0, 3)) {
            const key = `entrega_${ag.sku || ag.fornecedor}_${new Date().toISOString().slice(0,10)}`;
            if (now - (_alertSentAt.get(key) || 0) < ALERT_DEDUP_TTL) continue;
            _alertSentAt.set(key, now);
            _processAlert({
                id: key, type: 'entrega', severity: 'medium',
                message: `ENTREGA HOJE: ${ag.fornecedor} — ${ag.qtdAgendada}un na doca ${ag.doca || '?'}`,
            });
        }
    }

    function _processAlert(alert) {
        _state.alerts.unshift({ ...alert, ts: new Date().toISOString() });
        if (_state.alerts.length > 50) _state.alerts.pop();
        _emit('k11:alert', alert);
        _sendNativeNotification(alert);
    }

    // ─── MISSÃO ────────────────────────────────────────────────
    function startMission(label) {
        _state.missionStart = Date.now();
        _state.missionEnd   = Date.now() + 60 * 60 * 1000;
        _state.missionLabel = label || 'MISSÃO ATIVA';
        _emit('k11:mission', { active: true, label: _state.missionLabel, remainMs: 60 * 60 * 1000 });
        console.log('[K11Live] 🎯 Missão iniciada:', label);
    }

    function _tickMission() {
        if (!_state.missionStart) return;
        const remainMs = Math.max(0, _state.missionEnd - Date.now());
        if (remainMs === 0) {
            _emit('k11:mission', { active: false, expired: true });
            _state.missionStart = null;
            return;
        }
        const pct  = ((60 * 60 * 1000 - remainMs) / (60 * 60 * 1000)) * 100;
        const mins = Math.floor(remainMs / 60000);
        const secs = Math.floor((remainMs % 60000) / 1000);
        _emit('k11:tick', { remainMs, mins, secs, pct, label: _state.missionLabel });
    }

    // ─── NOTIFICAÇÕES NATIVAS ──────────────────────────────────
    async function requestNotificationPermission() {
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'granted') return true;
        if (Notification.permission === 'denied') return false;
        return (await Notification.requestPermission()) === 'granted';
    }

    function _sendNativeNotification(alert) {
        if (document.visibilityState !== 'hidden') return;
        if (Notification.permission !== 'granted') return;
        if (alert.severity !== 'high') return;
        try {
            new Notification('K11 OMNI — Alerta Crítico', {
                body: alert.message, icon: '/icons/icon-192.png',
                tag: alert.id || 'k11-alert',
            });
        } catch {}
    }

    // ─── ENGINE STATUS ─────────────────────────────────────────
    function _updateEngineStatus(status) {
        _state.status = status;
        _emit('k11:status', { status });
        const el = document.getElementById('engine-status');
        if (!el) return;
        const labels = {
            online:       '● K11 OMNI LIVE ⚡',
            reconnecting: '◌ RECONECTANDO...',
            offline:      '○ K11 OMNI OFFLINE',
            local:        '◑ K11 OMNI LOCAL',
        };
        el.innerText = labels[status] || status;
        el.classList.toggle('status-online', status === 'online' || status === 'local');
    }

    // ─── HELPERS ──────────────────────────────────────────────
    function _parse(json, fallback) {
        try { return JSON.parse(json); } catch { return fallback; }
    }
    function _short(desc, fallback, max) {
        max = max || 50;
        return (desc || fallback || '').toString().substring(0, max);
    }

    // ─── API PÚBLICA ───────────────────────────────────────────
    function start() {
        if (_started) return;
        _started = true;

        const _boot = () => {
            console.log('[K11Live] 🚀 Engine vivo iniciado');
            _connectSSE();
            _cycleTimer = setInterval(_runLocalCycle, CYCLE_MS);
            _tickTimer  = setInterval(_tickMission,  TICK_MS);
            setTimeout(_runLocalCycle, 2000);
        };

        if (window.APP?.db?.produtos?.length > 0) {
            _boot();
        } else {
            window.addEventListener('k11:ready', _boot, { once: true });
        }
    }

    function stop() {
        _sseSource?.close();
        clearInterval(_cycleTimer);
        clearInterval(_tickTimer);
        clearTimeout(_reconnectTimer);
        _started = false;
    }

    function forceAnalysis() {
        _state.lastDataHash = null;
        _runLocalCycle();
        if (K11Auth.isAuthenticated()) {
            window.APP?._serverFetch('/api/ai/force-analysis', { method: 'POST' }).catch(() => {});
        }
    }

    function getState() {
        return {
            score:          _state.score,
            status:         _state.status,
            priorities:     [..._state.priorities],
            alerts:         _state.alerts.slice(0, 10),
            lastAnalysisTs: _state.lastAnalysisTs,
            sseConnected:   _state.sseConnected,
            cycleCount:     _state.cycleCount,
            mission: _state.missionStart ? {
                active: true, label: _state.missionLabel,
                remainMs: Math.max(0, _state.missionEnd - Date.now()),
            } : { active: false },
        };
    }

    return {
        start, stop, forceAnalysis, startMission, getState,
        requestNotificationPermission,
        on:  (e, fn) => window.addEventListener(e, fn),
        off: (e, fn) => window.removeEventListener(e, fn),
    };

})();

// Auto-start após dados carregarem
window.addEventListener('k11:ready', () => {
    K11Live.start();
    setTimeout(() => K11Live.requestNotificationPermission(), 3000);
}, { once: true });

window.K11Live = K11Live;
