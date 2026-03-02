/**
 * K11 OMNI ELITE — LIVE PANEL v1.0
 * ════════════════════════════════════════════════════════════════
 * Interface visual do Live Engine. Consome os eventos do K11Live
 * e transforma dados em UI em tempo real.
 *
 * COMPONENTES:
 *  ① PILL    — substitui #engine-status no header
 *               pulsa em laranja (online) / cinza (local) / vermelho (crítico)
 *               clique abre o Drawer
 *  ② DRAWER  — painel lateral deslizante com fila de prioridades
 *               score donut, fonte (server/local), timestamp
 *               cada card tem urgência, tipo, ação e SKU
 *  ③ TOASTS  — notificações sobrepostas (alta/média/baixa)
 *               empilham e somem automaticamente
 *  ④ BADGE   — contador de prioridades na pill
 *
 * EVENTOS CONSUMIDOS (emitidos pelo k11-live-engine.js):
 *  k11:score     → { score, status }
 *  k11:priority  → { priorities[], summary, source }
 *  k11:alert     → { id, type, message, severity }
 *  k11:status    → { status: 'online'|'local'|'offline'|'reconnecting' }
 *  k11:tick      → { remainMs, mins, secs, pct, label }
 *  k11:mission   → { active, label, remainMs?, expired? }
 *
 * DEPENDE DE: k11-live-engine.js (deve ser carregado antes)
 */

'use strict';

const K11LivePanel = (() => {

    // ── ESTADO ────────────────────────────────────────────────
    let _score       = null;
    let _status      = 'offline';
    let _priorities  = [];
    let _source      = 'local';
    let _summary     = '';
    let _lastTs      = null;
    let _drawerOpen  = false;
    let _toastQueue  = [];
    let _mission     = { active: false };
    let _initialized = false;

    const _alertShown = new Set(); // deduplicação de toasts

    // ── CSS ───────────────────────────────────────────────────
    function _injectCSS() {
        if (document.getElementById('k11-panel-css')) return;
        const s = document.createElement('style');
        s.id = 'k11-panel-css';
        s.textContent = `

        /* ══════════════════════════════════════════════════════
           PILL — substitui #engine-status no header
           ══════════════════════════════════════════════════════ */
        #k11-live-pill {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            padding: 5px 11px 5px 8px;
            border-radius: 999px;
            border: 1px solid rgba(255,140,0,.22);
            background: rgba(255,140,0,.07);
            cursor: pointer;
            user-select: none;
            transition: background .2s, border-color .2s, transform .15s;
            -webkit-tap-highlight-color: transparent;
            position: relative;
            white-space: nowrap;
        }
        #k11-live-pill:active { transform: scale(.96); }
        #k11-live-pill:hover  { background: rgba(255,140,0,.13); border-color: rgba(255,140,0,.4); }

        /* estados da pill */
        #k11-live-pill.pill-online    { border-color: rgba(255,140,0,.35); }
        #k11-live-pill.pill-local     { border-color: rgba(99,102,241,.3); background: rgba(99,102,241,.07); }
        #k11-live-pill.pill-critical  { border-color: rgba(239,68,68,.5);  background: rgba(239,68,68,.1); animation: pillCritical 1.4s ease infinite; }
        #k11-live-pill.pill-offline   { border-color: rgba(100,116,139,.3); background: rgba(100,116,139,.05); }
        #k11-live-pill.pill-reconnect { border-color: rgba(234,179,8,.3);   background: rgba(234,179,8,.06); }

        @keyframes pillCritical {
            0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
            50%      { box-shadow: 0 0 0 5px rgba(239,68,68,.15); }
        }

        /* dot pulsante */
        .k11p-dot {
            width: 7px; height: 7px; border-radius: 50%;
            background: #ff8c00; flex-shrink: 0;
            box-shadow: 0 0 6px rgba(255,140,0,.7);
            animation: pillDot 2s ease infinite;
        }
        .pill-local     .k11p-dot { background: #818cf8; box-shadow: 0 0 6px rgba(129,140,248,.7); animation: none; }
        .pill-offline   .k11p-dot { background: #64748b; box-shadow: none; animation: none; }
        .pill-reconnect .k11p-dot { background: #eab308; box-shadow: 0 0 6px rgba(234,179,8,.7); }
        .pill-critical  .k11p-dot { background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,.9); }
        @keyframes pillDot { 0%,100%{opacity:1; transform:scale(1);} 50%{opacity:.5; transform:scale(.8);} }

        /* label e badge */
        .k11p-label {
            font-size: 9px; font-weight: 800; letter-spacing: 1.5px;
            color: #ff8c00; text-transform: uppercase;
        }
        .pill-local     .k11p-label { color: #818cf8; }
        .pill-offline   .k11p-label { color: #64748b; }
        .pill-reconnect .k11p-label { color: #eab308; }
        .pill-critical  .k11p-label { color: #ef4444; }

        .k11p-score {
            font-size: 10px; font-weight: 900; color: #fff;
            background: rgba(255,255,255,.08);
            padding: 1px 6px; border-radius: 999px;
            transition: background .3s;
        }
        .k11p-score.score-high   { color: #22c55e; }
        .k11p-score.score-mid    { color: #eab308; }
        .k11p-score.score-low    { color: #ef4444; }

        .k11p-badge {
            position: absolute;
            top: -5px; right: -5px;
            min-width: 16px; height: 16px;
            background: #ef4444;
            border-radius: 999px;
            font-size: 8px; font-weight: 900;
            color: #fff;
            display: flex; align-items: center; justify-content: center;
            padding: 0 4px;
            border: 2px solid var(--bg, #080c14);
            animation: badgePop .3s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes badgePop { from{transform:scale(0);} to{transform:scale(1);} }

        /* ══════════════════════════════════════════════════════
           DRAWER — painel lateral de prioridades
           ══════════════════════════════════════════════════════ */
        #k11-drawer-backdrop {
            display: none;
            position: fixed; inset: 0;
            background: rgba(0,0,0,.55);
            backdrop-filter: blur(2px);
            z-index: 3000;
        }
        #k11-drawer-backdrop.open { display: block; }

        #k11-drawer {
            position: fixed;
            top: 0; right: 0; bottom: 0;
            width: min(88vw, 360px);
            background: #080c14;
            border-left: 1px solid rgba(255,140,0,.15);
            z-index: 3001;
            display: flex; flex-direction: column;
            transform: translateX(100%);
            transition: transform .32s cubic-bezier(.22,1,.36,1);
            overflow: hidden;
        }
        #k11-drawer.open { transform: translateX(0); }

        /* drawer header */
        .k11d-hdr {
            padding: 16px 18px 12px;
            border-bottom: 1px solid rgba(255,255,255,.05);
            flex-shrink: 0;
            display: flex; align-items: center; gap: 12px;
        }
        .k11d-hdr-icon {
            width: 36px; height: 36px; border-radius: 10px;
            background: rgba(255,140,0,.1);
            border: 1px solid rgba(255,140,0,.2);
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0;
        }
        .k11d-hdr-icon .material-symbols-outlined { font-size: 18px; color: #ff8c00; }
        .k11d-hdr-info { flex: 1; min-width: 0; }
        .k11d-hdr-title { font-size: 11px; font-weight: 900; letter-spacing: 2px; color: #fff; text-transform: uppercase; }
        .k11d-hdr-sub   { font-size: 9px; color: #ff8c00; letter-spacing: 1px; margin-top: 1px; }
        .k11d-close {
            background: none; border: none; cursor: pointer;
            color: #475569; padding: 6px;
            border-radius: 8px; transition: color .2s, background .2s;
            flex-shrink: 0;
        }
        .k11d-close:hover { color: #fff; background: rgba(255,255,255,.06); }
        .k11d-close .material-symbols-outlined { font-size: 20px; }

        /* score section */
        .k11d-score-row {
            padding: 14px 18px;
            display: flex; align-items: center; gap: 16px;
            border-bottom: 1px solid rgba(255,255,255,.04);
            flex-shrink: 0;
        }
        .k11d-donut {
            position: relative;
            width: 64px; height: 64px; flex-shrink: 0;
        }
        .k11d-donut svg { width: 64px; height: 64px; transform: rotate(-90deg); }
        .k11d-donut-bg  { fill: none; stroke: rgba(255,255,255,.06); stroke-width: 6; }
        .k11d-donut-fg  { fill: none; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset .8s cubic-bezier(.4,0,.2,1), stroke .5s; }
        .k11d-donut-val {
            position: absolute; inset: 0;
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; font-weight: 900; color: #fff;
        }
        .k11d-score-info { flex: 1; min-width: 0; }
        .k11d-score-status { font-size: 12px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: .5px; }
        .k11d-score-meta { font-size: 10px; color: #475569; margin-top: 3px; line-height: 1.5; }
        .k11d-score-source {
            display: inline-block; font-size: 8px; font-weight: 700;
            letter-spacing: 1px; padding: 2px 6px; border-radius: 20px; margin-top: 4px;
        }
        .k11d-score-source.server { background: rgba(255,140,0,.12); color: #ff8c00; border: 1px solid rgba(255,140,0,.2); }
        .k11d-score-source.local  { background: rgba(129,140,248,.1); color: #818cf8; border: 1px solid rgba(129,140,248,.2); }

        /* summary */
        .k11d-summary {
            padding: 10px 18px;
            font-size: 11px; color: #94a3b8; font-style: italic;
            border-bottom: 1px solid rgba(255,255,255,.04);
            flex-shrink: 0; line-height: 1.5;
        }
        .k11d-summary:empty { display: none; }

        /* lista de prioridades */
        .k11d-list {
            flex: 1; overflow-y: auto;
            padding: 10px 12px 80px;
            display: flex; flex-direction: column; gap: 8px;
        }
        .k11d-list::-webkit-scrollbar { width: 3px; }
        .k11d-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 3px; }

        /* card de prioridade */
        .k11d-card {
            border-radius: 12px;
            padding: 12px 14px;
            border: 1px solid transparent;
            transition: transform .15s, border-color .2s;
            cursor: default;
            animation: cardIn .25s ease both;
        }
        .k11d-card:hover { transform: translateX(2px); }
        @keyframes cardIn { from{opacity:0;transform:translateX(10px);} to{opacity:1;transform:translateX(0);} }

        .k11d-card.urgency-alta   { background: rgba(239,68,68,.07);  border-color: rgba(239,68,68,.2); }
        .k11d-card.urgency-media  { background: rgba(234,179,8,.06);  border-color: rgba(234,179,8,.18); }
        .k11d-card.urgency-baixa  { background: rgba(99,102,241,.06); border-color: rgba(99,102,241,.18); }

        .k11d-card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .k11d-card-rank {
            width: 20px; height: 20px; border-radius: 6px;
            display: flex; align-items: center; justify-content: center;
            font-size: 9px; font-weight: 900; flex-shrink: 0;
        }
        .urgency-alta  .k11d-card-rank { background: rgba(239,68,68,.2);  color: #ef4444; }
        .urgency-media .k11d-card-rank { background: rgba(234,179,8,.2);  color: #eab308; }
        .urgency-baixa .k11d-card-rank { background: rgba(99,102,241,.2); color: #818cf8; }

        .k11d-card-type {
            font-size: 8px; font-weight: 800; letter-spacing: 1.5px;
            text-transform: uppercase; padding: 2px 7px; border-radius: 20px;
        }
        .type-ruptura { background: rgba(239,68,68,.15);  color: #f87171; }
        .type-critico { background: rgba(234,179,8,.15);  color: #fbbf24; }
        .type-entrega { background: rgba(16,185,129,.12); color: #34d399; }
        .type-tarefa  { background: rgba(99,102,241,.12); color: #a5b4fc; }
        .type-risco   { background: rgba(251,146,60,.12); color: #fb923c; }

        .k11d-card-title { font-size: 11px; font-weight: 800; color: #e2e8f0; flex: 1; min-width: 0; }
        .k11d-card-desc  { font-size: 11px; color: #94a3b8; line-height: 1.5; }
        .k11d-card-sku   {
            display: inline-block; margin-top: 6px;
            font-size: 9px; font-weight: 700; letter-spacing: 1px;
            color: #ff8c00; background: rgba(255,140,0,.1);
            padding: 2px 7px; border-radius: 20px;
        }

        /* empty state */
        .k11d-empty {
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; gap: 10px;
            padding: 40px 20px; text-align: center; color: #334155;
        }
        .k11d-empty .material-symbols-outlined { font-size: 40px; opacity: .4; }
        .k11d-empty p { font-size: 11px; line-height: 1.6; }

        /* footer com força análise */
        .k11d-footer {
            position: absolute; bottom: 0; left: 0; right: 0;
            padding: 12px 16px;
            background: linear-gradient(to top, #080c14 70%, transparent);
            display: flex; gap: 8px;
        }
        .k11d-btn-refresh {
            flex: 1; padding: 10px;
            border-radius: 10px; border: 1px solid rgba(255,140,0,.25);
            background: rgba(255,140,0,.08);
            color: #ff8c00; font-size: 10px; font-weight: 800;
            letter-spacing: 1px; text-transform: uppercase;
            cursor: pointer; transition: all .2s;
            display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .k11d-btn-refresh:hover { background: rgba(255,140,0,.16); border-color: rgba(255,140,0,.5); }
        .k11d-btn-refresh:active { transform: scale(.97); }
        .k11d-btn-refresh .material-symbols-outlined { font-size: 15px; }
        .k11d-btn-refresh.loading .material-symbols-outlined { animation: spin .8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ══════════════════════════════════════════════════════
           MISSION BAR — countdown operacional
           ══════════════════════════════════════════════════════ */
        #k11-mission-bar {
            position: fixed;
            top: 0; left: 0; right: 0;
            height: 3px;
            background: rgba(255,255,255,.04);
            z-index: 2999;
            display: none;
        }
        #k11-mission-bar.active { display: block; }
        #k11-mission-progress {
            height: 100%;
            background: linear-gradient(90deg, #ff8c00, #fbbf24);
            transition: width .5s linear;
            box-shadow: 0 0 8px rgba(255,140,0,.6);
        }

        /* ══════════════════════════════════════════════════════
           TOASTS — alertas sobrepostos
           ══════════════════════════════════════════════════════ */
        #k11-toast-stack {
            position: fixed;
            bottom: 90px; left: 50%;
            transform: translateX(-50%);
            display: flex; flex-direction: column-reverse; gap: 8px;
            z-index: 4000;
            pointer-events: none;
            width: min(90vw, 360px);
        }

        .k11-live-toast {
            display: flex; align-items: flex-start; gap: 10px;
            padding: 11px 14px;
            border-radius: 13px;
            font-size: 11px; line-height: 1.5;
            pointer-events: all;
            cursor: pointer;
            animation: toastIn .3s cubic-bezier(.34,1.56,.64,1) both;
            transition: opacity .3s, transform .3s;
            border: 1px solid transparent;
            backdrop-filter: blur(8px);
        }
        .k11-live-toast.hiding {
            opacity: 0; transform: translateY(8px) scale(.95);
        }
        @keyframes toastIn {
            from { opacity:0; transform:translateY(16px) scale(.9); }
            to   { opacity:1; transform:translateY(0) scale(1); }
        }

        .k11-live-toast.sev-high   { background: rgba(15,8,8,.92);   border-color: rgba(239,68,68,.4); }
        .k11-live-toast.sev-medium { background: rgba(10,10,8,.92);   border-color: rgba(234,179,8,.35); }
        .k11-live-toast.sev-low    { background: rgba(8,12,20,.92);   border-color: rgba(99,102,241,.3); }

        .k11-live-toast-icon { font-size: 15px; flex-shrink: 0; margin-top: 1px; }
        .sev-high   .k11-live-toast-icon { color: #ef4444; }
        .sev-medium .k11-live-toast-icon { color: #eab308; }
        .sev-low    .k11-live-toast-icon { color: #818cf8; }

        .k11-live-toast-body { flex: 1; min-width: 0; }
        .k11-live-toast-type { font-size: 8px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 2px; }
        .sev-high   .k11-live-toast-type { color: #ef4444; }
        .sev-medium .k11-live-toast-type { color: #eab308; }
        .sev-low    .k11-live-toast-type { color: #818cf8; }

        .k11-live-toast-msg  { color: #e2e8f0; font-weight: 600; word-break: break-word; }
        .k11-live-toast-close { color: #475569; font-size: 14px; cursor: pointer; flex-shrink: 0; line-height: 1; padding: 2px; }
        .k11-live-toast-close:hover { color: #fff; }

        /* progress bar interna do toast */
        .k11-live-toast-prog {
            height: 2px; border-radius: 1px; margin-top: 8px;
            background: rgba(255,255,255,.06);
            overflow: hidden;
        }
        .k11-live-toast-prog-fill {
            height: 100%; border-radius: 1px;
            transition: width linear;
        }
        .sev-high   .k11-live-toast-prog-fill { background: #ef4444; }
        .sev-medium .k11-live-toast-prog-fill { background: #eab308; }
        .sev-low    .k11-live-toast-prog-fill { background: #818cf8; }
        `;
        document.head.appendChild(s);
    }

    // ── PILL ──────────────────────────────────────────────────
    function _buildPill() {
        // substitui o #engine-status do header
        const old = document.getElementById('engine-status');
        if (!old) return;

        const pill = document.createElement('div');
        pill.id = 'k11-live-pill';
        pill.className = 'pill-offline';
        pill.setAttribute('title', 'Abrir painel de prioridades');
        pill.innerHTML = `
            <span class="k11p-dot"></span>
            <span class="k11p-label">BOOTING</span>
            <span class="k11p-score" id="k11p-score-val">--</span>`;
        pill.addEventListener('click', _toggleDrawer);
        old.replaceWith(pill);
    }

    function _updatePill() {
        const pill  = document.getElementById('k11-live-pill');
        const label = pill?.querySelector('.k11p-label');
        const score = document.getElementById('k11p-score-val');
        const badge = document.getElementById('k11p-badge');
        if (!pill) return;

        // classe de status
        pill.className = 'pill-' + ({
            online:       'online',
            local:        'local',
            offline:      'offline',
            reconnecting: 'reconnect',
        }[_status] || 'offline');

        // label
        const labels = {
            online:       'LIVE ⚡',
            local:        'LOCAL',
            offline:      'OFFLINE',
            reconnecting: 'RECONECT.',
        };
        if (label) label.textContent = labels[_status] || _status.toUpperCase();

        // score
        if (score) {
            if (_score != null) {
                score.textContent = _score;
                score.className = 'k11p-score ' + (_score >= 70 ? 'score-high' : _score >= 40 ? 'score-mid' : 'score-low');
            } else {
                score.textContent = '--';
                score.className = 'k11p-score';
            }
        }

        // badge de prioridades urgentes
        const urgentes = _priorities.filter(p => p.urgency === 'alta').length;
        let b = document.getElementById('k11p-badge');
        if (urgentes > 0) {
            if (!b) {
                b = document.createElement('span');
                b.id = 'k11p-badge';
                b.className = 'k11p-badge';
                pill.appendChild(b);
            }
            b.textContent = urgentes;
        } else {
            b?.remove();
        }

        // pill vermelha se score crítico
        if (_score != null && _score < 30) {
            pill.classList.add('pill-critical');
        }
    }

    // ── DRAWER ────────────────────────────────────────────────
    function _buildDrawer() {
        if (document.getElementById('k11-drawer')) return;

        // mission bar
        const mb = document.createElement('div');
        mb.id = 'k11-mission-bar';
        mb.innerHTML = `<div id="k11-mission-progress" style="width:0%"></div>`;
        document.body.appendChild(mb);

        // toast stack
        const ts = document.createElement('div');
        ts.id = 'k11-toast-stack';
        document.body.appendChild(ts);

        // backdrop
        const bd = document.createElement('div');
        bd.id = 'k11-drawer-backdrop';
        bd.addEventListener('click', _closeDrawer);
        document.body.appendChild(bd);

        // drawer
        const drawer = document.createElement('div');
        drawer.id = 'k11-drawer';
        drawer.innerHTML = `
            <div class="k11d-hdr">
                <div class="k11d-hdr-icon">
                    <span class="material-symbols-outlined">bolt</span>
                </div>
                <div class="k11d-hdr-info">
                    <div class="k11d-hdr-title">PRIORIDADES</div>
                    <div class="k11d-hdr-sub" id="k11d-sub">LIVE ENGINE ATIVO</div>
                </div>
                <button class="k11d-close" id="k11d-close-btn">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>

            <div class="k11d-score-row">
                <div class="k11d-donut">
                    <svg viewBox="0 0 64 64">
                        <circle class="k11d-donut-bg" cx="32" cy="32" r="26"/>
                        <circle class="k11d-donut-fg" id="k11d-donut-fg"
                            cx="32" cy="32" r="26"
                            stroke="#ff8c00"
                            stroke-dasharray="163.36"
                            stroke-dashoffset="163.36"/>
                    </svg>
                    <div class="k11d-donut-val" id="k11d-score-num">--</div>
                </div>
                <div class="k11d-score-info">
                    <div class="k11d-score-status" id="k11d-status-text">INICIALIZANDO</div>
                    <div class="k11d-score-meta" id="k11d-score-meta">Aguardando análise...</div>
                    <span class="k11d-score-source local" id="k11d-source-badge">LOCAL</span>
                </div>
            </div>

            <div class="k11d-summary" id="k11d-summary"></div>

            <div class="k11d-list" id="k11d-list">
                <div class="k11d-empty">
                    <span class="material-symbols-outlined">hourglass_empty</span>
                    <p>Aguardando dados...<br>O engine analisa o estoque a cada 5 min.</p>
                </div>
            </div>

            <div class="k11d-footer">
                <button class="k11d-btn-refresh" id="k11d-refresh-btn">
                    <span class="material-symbols-outlined">refresh</span>
                    FORÇAR ANÁLISE
                </button>
            </div>`;

        document.body.appendChild(drawer);

        document.getElementById('k11d-close-btn').addEventListener('click', _closeDrawer);
        document.getElementById('k11d-refresh-btn').addEventListener('click', _forceAnalysis);
    }

    function _toggleDrawer() { _drawerOpen ? _closeDrawer() : _openDrawer(); }

    function _openDrawer() {
        _drawerOpen = true;
        document.getElementById('k11-drawer')?.classList.add('open');
        document.getElementById('k11-drawer-backdrop')?.classList.add('open');
        _renderDrawerContent();
    }

    function _closeDrawer() {
        _drawerOpen = false;
        document.getElementById('k11-drawer')?.classList.remove('open');
        document.getElementById('k11-drawer-backdrop')?.classList.remove('open');
    }

    function _renderDrawerContent() {
        // score donut
        const donutFg  = document.getElementById('k11d-donut-fg');
        const scoreNum = document.getElementById('k11d-score-num');
        const statusTx = document.getElementById('k11d-status-text');
        const scoreMeta= document.getElementById('k11d-score-meta');
        const sourceBg = document.getElementById('k11d-source-badge');
        const summaryEl= document.getElementById('k11d-summary');
        const subEl    = document.getElementById('k11d-sub');

        if (_score != null && donutFg) {
            const circ   = 163.36;
            const offset = circ - (circ * _score / 100);
            donutFg.style.strokeDashoffset = offset;
            const color = _score >= 70 ? '#22c55e' : _score >= 40 ? '#eab308' : '#ef4444';
            donutFg.style.stroke = color;
            if (scoreNum) { scoreNum.textContent = _score; scoreNum.style.color = color; }
        } else if (scoreNum) {
            scoreNum.textContent = '--';
        }

        const statusLabels = {
            saudável:    'SAUDÁVEL',
            atenção:     'ATENÇÃO',
            degradado:   'DEGRADADO',
            crítico:     'CRÍTICO',
            online:      'ONLINE',
            local:       'LOCAL',
            offline:     'OFFLINE',
        };
        if (statusTx) statusTx.textContent = statusLabels[_status] || _status.toUpperCase();

        if (scoreMeta && _lastTs) {
            const d = new Date(_lastTs);
            scoreMeta.textContent = `Última análise: ${d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}`;
        }

        if (sourceBg) {
            sourceBg.textContent = _source === 'server' ? '⚡ SERVIDOR' : '◑ LOCAL';
            sourceBg.className = 'k11d-score-source ' + (_source === 'server' ? 'server' : 'local');
        }

        if (summaryEl) summaryEl.textContent = _summary || '';

        const urgCount = _priorities.filter(p => p.urgency === 'alta').length;
        if (subEl) subEl.textContent = _priorities.length > 0
            ? `${_priorities.length} PRIORIDADE(S) · ${urgCount} URGENTE(S)`
            : 'SEM PRIORIDADES ATIVAS';

        // lista de cards
        const list = document.getElementById('k11d-list');
        if (!list) return;

        if (!_priorities.length) {
            list.innerHTML = `
                <div class="k11d-empty">
                    <span class="material-symbols-outlined">check_circle</span>
                    <p>Nenhuma prioridade crítica.<br>Operação em conformidade.</p>
                </div>`;
            return;
        }

        list.innerHTML = _priorities.map((p, i) => {
            const delay  = i * 0.04;
            const typeClass = `type-${p.type || 'risco'}`;
            const urgClass  = `urgency-${p.urgency || 'baixa'}`;
            const skuTag    = p.cod ? `<span class="k11d-card-sku">SKU ${p.cod}</span>` : '';
            return `
                <div class="k11d-card ${urgClass}" style="animation-delay:${delay}s">
                    <div class="k11d-card-top">
                        <div class="k11d-card-rank">${p.rank || i+1}</div>
                        <span class="k11d-card-type ${typeClass}">${(p.type||'').toUpperCase()}</span>
                        <span class="k11d-card-title">${_esc(p.title || '')}</span>
                    </div>
                    <div class="k11d-card-desc">${_esc(p.desc || '')}</div>
                    ${skuTag}
                </div>`;
        }).join('');
    }

    function _forceAnalysis() {
        const btn = document.getElementById('k11d-refresh-btn');
        if (btn) {
            btn.classList.add('loading');
            btn.querySelector('.material-symbols-outlined').textContent = 'sync';
        }
        if (typeof K11Live !== 'undefined') {
            K11Live.forceAnalysis();
        }
        setTimeout(() => {
            if (btn) {
                btn.classList.remove('loading');
                btn.querySelector('.material-symbols-outlined').textContent = 'refresh';
            }
        }, 3000);
    }

    // ── TOASTS ────────────────────────────────────────────────
    const TOAST_DURATION = { high: 8000, medium: 5000, low: 3500 };
    const TOAST_ICONS    = { high: 'warning', medium: 'info', low: 'notifications' };
    const TOAST_TYPES    = { ruptura: 'RUPTURA', risco: 'RISCO', entrega: 'ENTREGA', default: 'ALERTA' };

    function _showToast(alert) {
        // deduplicação: não repete o mesmo alerta em 5min
        if (_alertShown.has(alert.id)) return;
        _alertShown.add(alert.id);
        setTimeout(() => _alertShown.delete(alert.id), 5 * 60 * 1000);

        const stack = document.getElementById('k11-toast-stack');
        if (!stack) return;

        // máximo 3 toasts visíveis
        const existing = stack.querySelectorAll('.k11-live-toast');
        if (existing.length >= 3) existing[0]?.remove();

        const sev      = alert.severity === 'high' ? 'high' : alert.severity === 'medium' ? 'medium' : 'low';
        const duration = TOAST_DURATION[sev];
        const icon     = TOAST_ICONS[sev];
        const typeLabel= TOAST_TYPES[alert.type] || TOAST_TYPES.default;

        const toast = document.createElement('div');
        toast.className = `k11-live-toast sev-${sev}`;
        toast.innerHTML = `
            <span class="material-symbols-outlined k11-live-toast-icon">${icon}</span>
            <div class="k11-live-toast-body">
                <div class="k11-live-toast-type">${typeLabel}</div>
                <div class="k11-live-toast-msg">${_esc(alert.message || '')}</div>
                <div class="k11-live-toast-prog">
                    <div class="k11-live-toast-prog-fill" style="width:100%"></div>
                </div>
            </div>
            <span class="k11-live-toast-close">✕</span>`;

        toast.querySelector('.k11-live-toast-close').addEventListener('click', () => _removeToast(toast));
        toast.addEventListener('click', () => { _removeToast(toast); _openDrawer(); });
        stack.appendChild(toast);

        // anima progress bar
        const fill = toast.querySelector('.k11-live-toast-prog-fill');
        if (fill) {
            fill.style.transition = `width ${duration}ms linear`;
            requestAnimationFrame(() => { fill.style.width = '0%'; });
        }

        // auto-remove
        const timer = setTimeout(() => _removeToast(toast), duration);
        toast._timer = timer;
    }

    function _removeToast(toast) {
        clearTimeout(toast._timer);
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 320);
    }

    // ── MISSION BAR ───────────────────────────────────────────
    function _updateMissionBar(tick) {
        const bar  = document.getElementById('k11-mission-bar');
        const prog = document.getElementById('k11-mission-progress');
        if (!bar || !prog) return;
        bar.classList.add('active');
        prog.style.width = tick.pct + '%';
    }

    function _hideMissionBar() {
        document.getElementById('k11-mission-bar')?.classList.remove('active');
    }

    // ── EVENT LISTENERS ───────────────────────────────────────
    function _bindEvents() {
        window.addEventListener('k11:score', e => {
            const d = e.detail;
            _score  = d.score;
            if (d.status) _status = d.status;
            _updatePill();
            if (_drawerOpen) _renderDrawerContent();
        });

        window.addEventListener('k11:priority', e => {
            const d = e.detail;
            _priorities = d.priorities || [];
            if (d.summary) _summary = d.summary;
            if (d.source)  _source  = d.source;
            _lastTs = new Date().toISOString();
            _updatePill();
            if (_drawerOpen) _renderDrawerContent();
        });

        window.addEventListener('k11:alert', e => {
            _showToast(e.detail);
        });

        window.addEventListener('k11:status', e => {
            _status = e.detail.status;
            _updatePill();
        });

        window.addEventListener('k11:tick', e => {
            if (_mission.active) _updateMissionBar(e.detail);
        });

        window.addEventListener('k11:mission', e => {
            _mission = e.detail;
            if (!e.detail.active) _hideMissionBar();
        });

        window.addEventListener('k11:analysis', e => {
            const d = e.detail;
            if (d.status) _status = d.status;
            if (d.score != null) _score = d.score;
            _lastTs = d.ts || new Date().toISOString();
            _updatePill();
            if (_drawerOpen) _renderDrawerContent();
        });

        // ESC fecha o drawer
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && _drawerOpen) _closeDrawer();
        });
    }

    // ── HELPER ────────────────────────────────────────────────
    function _esc(str) {
        return String(str)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    // ── INIT ──────────────────────────────────────────────────
    function init() {
        if (_initialized) return;
        _initialized = true;
        _injectCSS();
        _buildPill();
        _buildDrawer();
        _bindEvents();
        console.log('[K11LivePanel] ✅ Painel vivo iniciado');
    }

    // Inicializa assim que o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { init, openDrawer: _openDrawer, closeDrawer: _closeDrawer };

})();

window.K11LivePanel = K11LivePanel;
