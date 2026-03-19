/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║   K11 PRICE INTELLIGENCE — FRONTEND                                ║
 * ║   Painel de preços integrado ao dashboard.html                     ║
 * ║                                                                     ║
 * ║   INTEGRAÇÃO: Adicionar antes do </body> no dashboard.html:        ║
 * ║   <script src="k11-price-intel.js"></script>                       ║
 * ║   <link rel="stylesheet" href="k11-price-intel.css">               ║
 * ╚════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const K11PriceIntel = (() => {

  // ── STATE ──────────────────────────────────────────────────────────
  const state = {
    connected:    false,
    sse:          null,
    priceMap:     [],
    marketTrends: null,
    alerts:       [],
    lastUpdate:   null,
    activeTab:    'alerts',     // alerts | prices | trends | history
    selectedProd: null,
    history:      [],
    scanActive:   false,
    panelOpen:    false,
  };

  // ── INIT ───────────────────────────────────────────────────────────

  function init() {
    _injectHTML();
    _injectCSS();
    _bindEvents();
    _connectSSE();
    console.log('[K11 PriceIntel] ✅ Frontend inicializado');
  }

  // ── SSE ────────────────────────────────────────────────────────────

  function _connectSSE() {
    const token = (typeof K11Auth !== 'undefined' ? K11Auth.getToken() : null) || sessionStorage.getItem('k11_jwt');
    if (!token) return;

    const url = `${window.location.origin}/api/price-intel/stream?token=${encodeURIComponent(token)}`;
    state.sse = new EventSource(url);

    state.sse.addEventListener('connected', () => {
      state.connected = true;
      _updateStatus('online');
      console.log('[K11 PriceIntel] SSE conectado');
    });

    state.sse.addEventListener('price_update', (e) => {
      const data = JSON.parse(e.data);
      state.priceMap     = data.priceMap     || [];
      state.marketTrends = data.marketTrends || null;
      state.alerts       = data.alerts       || [];
      state.lastUpdate   = new Date(data.timestamp);
      _updateBadge();
      if (state.panelOpen) _renderActiveTab();
      _showCriticalToasts();
    });

    state.sse.addEventListener('error', () => {
      state.connected = false;
      _updateStatus('offline');
      setTimeout(() => _connectSSE(), 8000);
    });
  }

  // ── HTML INJECTION ─────────────────────────────────────────────────

  function _injectHTML() {
    const el = document.createElement('div');
    el.id = 'k11-pi-root';
    el.innerHTML = `
      <!-- FAB BUTTON -->
      <button id="k11-pi-fab" onclick="K11PriceIntel.togglePanel()" title="Price Intelligence">
        <div class="k11-pi-fab-ring">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M2 17l10 5 10-5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
        </div>
        <span id="k11-pi-fab-badge" class="k11-pi-fab-badge" style="display:none">0</span>
        <span>PREÇOS</span>
      </button>

      <!-- SIDE PANEL -->
      <div id="k11-pi-panel" class="k11-pi-panel">

        <!-- HEADER -->
        <div class="k11-pi-header">
          <div class="k11-pi-header-left">
            <div class="k11-pi-header-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                <path d="M2 17l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
                <path d="M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
              </svg>
            </div>
            <div>
              <div class="k11-pi-title">PRICE INTEL</div>
              <div id="k11-pi-status-text" class="k11-pi-subtitle">Conectando...</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="k11-pi-icon-btn" onclick="K11PriceIntel.forceScan()" title="Forçar scan">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M1 4v6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3.51 15a9 9 0 102.13-9.36L1 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button class="k11-pi-icon-btn" onclick="K11PriceIntel.togglePanel()" title="Fechar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- TABS -->
        <div class="k11-pi-tabs">
          <button class="k11-pi-tab active" data-tab="alerts"  onclick="K11PriceIntel.switchTab('alerts')">
            <span>⚠️</span> Alertas
            <span id="k11-pi-alerts-count" class="k11-pi-tab-badge" style="display:none">0</span>
          </button>
          <button class="k11-pi-tab" data-tab="prices"  onclick="K11PriceIntel.switchTab('prices')">
            <span>💲</span> Preços
          </button>
          <button class="k11-pi-tab" data-tab="trends"  onclick="K11PriceIntel.switchTab('trends')">
            <span>📈</span> Mercado
          </button>
          <button class="k11-pi-tab" data-tab="history" onclick="K11PriceIntel.switchTab('history')">
            <span>🕐</span> Histórico
          </button>
        </div>

        <!-- BODY -->
        <div id="k11-pi-body" class="k11-pi-body">
          <div class="k11-pi-empty">
            <div class="k11-pi-spinner"></div>
            <span>Aguardando dados...</span>
          </div>
        </div>

        <!-- FOOTER -->
        <div class="k11-pi-footer">
          <span id="k11-pi-last-scan">Nenhum scan realizado</span>
          <span id="k11-pi-conn-dot" class="k11-pi-dot-offline"></span>
        </div>
      </div>

      <!-- BACKDROP -->
      <div id="k11-pi-backdrop" onclick="K11PriceIntel.togglePanel()"></div>
    `;
    document.body.appendChild(el);
  }

  // ── CSS INJECTION ──────────────────────────────────────────────────

  function _injectCSS() {
    const style = document.createElement('style');
    style.id = 'k11-pi-styles';
    style.textContent = `
      /* ── FAB ──────────────────────────────────────────────── */
      #k11-pi-fab {
        position: fixed;
        bottom: 80px;
        left: 14px;
        background: linear-gradient(145deg, #141626, #0d0f18);
        border: 1px solid rgba(255,140,0,0.35);
        border-radius: 12px;
        color: #FF8C00;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 10px 8px 6px;
        cursor: pointer;
        z-index: 900;
        box-shadow: 0 4px 20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,140,0,0.08);
        transition: all 0.2s ease;
        font-size: 7.5px;
        font-weight: 900;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        font-family: 'Inter', sans-serif;
        min-width: 46px;
      }
      #k11-pi-fab:hover {
        border-color: rgba(255,140,0,0.6);
        box-shadow: 0 4px 24px rgba(255,140,0,0.2), 0 0 0 1px rgba(255,140,0,0.15);
        transform: translateY(-1px);
      }
      #k11-pi-fab:active { transform: scale(0.95); }
      #k11-pi-fab.scanning .k11-pi-fab-ring { animation: k11piSpin 1s linear infinite; }

      .k11-pi-fab-ring {
        width: 30px; height: 30px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: rgba(255,140,0,0.08);
        border: 1px solid rgba(255,140,0,0.2);
      }

      .k11-pi-fab-badge {
        position: absolute;
        top: -5px; right: -5px;
        background: #EF4444;
        color: #fff;
        font-size: 8px; font-weight: 900;
        padding: 1px 4px;
        border-radius: 8px;
        min-width: 15px;
        text-align: center;
        border: 1px solid #06070d;
        font-family: 'JetBrains Mono', monospace;
      }

      /* ── PANEL ────────────────────────────────────────────── */
      #k11-pi-panel {
        position: fixed;
        bottom: 0; left: 0;
        width: 100%;
        max-height: 82vh;
        background: linear-gradient(180deg, #111320 0%, #0d0f18 100%);
        border-top: 1px solid rgba(255,140,0,0.2);
        border-radius: 20px 20px 0 0;
        z-index: 1500;
        display: flex;
        flex-direction: column;
        transform: translateY(110%);
        transition: transform 0.38s cubic-bezier(0.32, 0.72, 0, 1);
        box-shadow: 0 -16px 60px rgba(0,0,0,0.8), 0 -1px 0 rgba(255,140,0,0.12);
        overflow: hidden;
      }
      #k11-pi-panel.open { transform: translateY(0); }

      #k11-pi-backdrop {
        display: none;
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.65);
        backdrop-filter: blur(4px);
        z-index: 1499;
      }
      #k11-pi-backdrop.active { display: block; }

      /* Pull handle */
      #k11-pi-panel::before {
        content: '';
        display: block;
        width: 36px; height: 4px;
        background: rgba(255,255,255,0.12);
        border-radius: 2px;
        margin: 10px auto 0;
        flex-shrink: 0;
      }

      /* ── HEADER ───────────────────────────────────────────── */
      .k11-pi-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 16px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        flex-shrink: 0;
      }
      .k11-pi-header-left { display: flex; align-items: center; gap: 10px; }
      .k11-pi-header-icon {
        width: 34px; height: 34px; border-radius: 10px;
        background: rgba(255,140,0,0.1);
        border: 1px solid rgba(255,140,0,0.25);
        display: flex; align-items: center; justify-content: center;
        color: #FF8C00;
      }
      .k11-pi-title {
        font-size: 13px; font-weight: 900; color: #EDF0F7;
        letter-spacing: 1.5px; font-family: 'JetBrains Mono', monospace;
      }
      .k11-pi-subtitle {
        font-size: 10px; font-weight: 700; color: #5A6480;
        letter-spacing: 0.5px; margin-top: 1px;
      }
      .k11-pi-subtitle.online  { color: #10B981; }
      .k11-pi-subtitle.offline { color: #EF4444; }

      .k11-pi-icon-btn {
        width: 30px; height: 30px; border-radius: 8px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        color: #5A6480; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s;
      }
      .k11-pi-icon-btn:hover { background: rgba(255,140,0,0.1); border-color: rgba(255,140,0,0.3); color: #FF8C00; }
      .k11-pi-icon-btn.spinning svg { animation: k11piSpin 1s linear infinite; }

      /* ── TABS ─────────────────────────────────────────────── */
      .k11-pi-tabs {
        display: flex; gap: 4px; padding: 8px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        flex-shrink: 0; overflow-x: auto;
      }
      .k11-pi-tabs::-webkit-scrollbar { height: 0; }
      .k11-pi-tab {
        flex-shrink: 0;
        background: transparent;
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 8px;
        color: #5A6480;
        padding: 6px 12px;
        font-size: 10px; font-weight: 800;
        letter-spacing: 0.5px;
        cursor: pointer;
        font-family: 'Inter', sans-serif;
        transition: all 0.2s;
        display: flex; align-items: center; gap: 5px;
        position: relative;
      }
      .k11-pi-tab:hover  { border-color: rgba(255,140,0,0.25); color: #B0B8CC; }
      .k11-pi-tab.active {
        background: rgba(255,140,0,0.1);
        border-color: rgba(255,140,0,0.4);
        color: #FF8C00;
        box-shadow: 0 0 12px rgba(255,140,0,0.08);
      }
      .k11-pi-tab-badge {
        background: #EF4444; color: #fff;
        font-size: 8px; padding: 0 4px;
        border-radius: 6px; min-width: 14px;
        text-align: center; line-height: 1.6;
      }

      /* ── BODY ─────────────────────────────────────────────── */
      .k11-pi-body {
        flex: 1; overflow-y: auto; padding: 12px;
        min-height: 0;
      }
      .k11-pi-body::-webkit-scrollbar { width: 2px; }
      .k11-pi-body::-webkit-scrollbar-thumb { background: rgba(255,140,0,0.2); }

      /* ── FOOTER ───────────────────────────────────────────── */
      .k11-pi-footer {
        display: flex; justify-content: space-between; align-items: center;
        padding: 8px 16px 14px;
        border-top: 1px solid rgba(255,255,255,0.04);
        font-size: 9px; font-weight: 700; color: #5A6480;
        font-family: 'JetBrains Mono', monospace;
        letter-spacing: 0.5px; flex-shrink: 0;
      }
      .k11-pi-dot-online  { width: 7px; height: 7px; border-radius: 50%; background: #10B981; box-shadow: 0 0 6px rgba(16,185,129,0.6); }
      .k11-pi-dot-offline { width: 7px; height: 7px; border-radius: 50%; background: #EF4444; }
      .k11-pi-dot-scanning {
        width: 7px; height: 7px; border-radius: 50%; background: #F59E0B;
        animation: k11piPulse 1s ease-in-out infinite;
      }

      /* ── EMPTY / SPINNER ──────────────────────────────────── */
      .k11-pi-empty {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; padding: 40px 0; gap: 12px;
        color: #5A6480; font-size: 11px; font-weight: 700;
        letter-spacing: 0.5px;
      }
      .k11-pi-spinner {
        width: 24px; height: 24px;
        border: 2px solid rgba(255,140,0,0.15);
        border-top: 2px solid #FF8C00;
        border-radius: 50%;
        animation: k11piSpin 0.9s linear infinite;
      }

      /* ── ALERT CARDS ──────────────────────────────────────── */
      .k11-pi-alert {
        border-radius: 10px; padding: 11px 13px;
        margin-bottom: 8px;
        border: 1px solid;
        position: relative; overflow: hidden;
        cursor: default;
        animation: k11piFadeIn 0.3s ease both;
      }
      .k11-pi-alert::before {
        content: ''; position: absolute;
        top: 0; left: 0; right: 0; height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent);
      }
      .k11-pi-alert-critical {
        background: rgba(239,68,68,0.07);
        border-color: rgba(239,68,68,0.3);
      }
      .k11-pi-alert-warning {
        background: rgba(245,158,11,0.07);
        border-color: rgba(245,158,11,0.3);
      }
      .k11-pi-alert-opportunity {
        background: rgba(16,185,129,0.07);
        border-color: rgba(16,185,129,0.3);
      }
      .k11-pi-alert-optimization {
        background: rgba(96,165,250,0.06);
        border-color: rgba(96,165,250,0.25);
      }
      .k11-pi-alert-info {
        background: rgba(255,255,255,0.03);
        border-color: rgba(255,255,255,0.1);
      }
      .k11-pi-alert-title {
        font-size: 11px; font-weight: 800;
        color: #EDF0F7; letter-spacing: 0.3px;
        margin-bottom: 4px;
      }
      .k11-pi-alert-action {
        font-size: 10px; color: #B0B8CC;
        line-height: 1.5;
      }
      .k11-pi-alert-meta {
        display: flex; align-items: center; justify-content: space-between;
        margin-top: 8px; padding-top: 7px;
        border-top: 1px solid rgba(255,255,255,0.05);
      }
      .k11-pi-alert-badge {
        font-size: 8px; font-weight: 900; letter-spacing: 0.8px;
        padding: 2px 7px; border-radius: 4px;
        font-family: 'JetBrains Mono', monospace;
      }
      .badge-critical    { background: rgba(239,68,68,0.15);  color: #EF4444; border: 1px solid rgba(239,68,68,0.3); }
      .badge-warning     { background: rgba(245,158,11,0.15); color: #F59E0B; border: 1px solid rgba(245,158,11,0.3); }
      .badge-opportunity { background: rgba(16,185,129,0.15); color: #10B981; border: 1px solid rgba(16,185,129,0.3); }
      .badge-info        { background: rgba(255,255,255,0.06); color: #5A6480; border: 1px solid rgba(255,255,255,0.1); }
      .badge-optimization{ background: rgba(96,165,250,0.1);  color: #60a5fa; border: 1px solid rgba(96,165,250,0.25); }

      /* ── PRICE CARDS ──────────────────────────────────────── */
      .k11-pi-price-card {
        background: linear-gradient(145deg, #141626, #0d0f18);
        border: 1px solid #1A1D2E;
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s;
        animation: k11piFadeIn 0.3s ease both;
      }
      .k11-pi-price-card:hover {
        border-color: rgba(255,140,0,0.25);
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      }
      .k11-pi-price-card.expanded {
        border-color: rgba(255,140,0,0.35);
        background: linear-gradient(145deg, #161828, #0f1120);
      }
      .k11-pi-price-row {
        display: flex; justify-content: space-between; align-items: center;
      }
      .k11-pi-prod-name {
        font-size: 12px; font-weight: 700; color: #EDF0F7;
        flex: 1; margin-right: 8px; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
      }
      .k11-pi-diff-badge {
        font-size: 10px; font-weight: 900;
        padding: 3px 8px; border-radius: 6px;
        font-family: 'JetBrains Mono', monospace;
        flex-shrink: 0;
      }
      .diff-high   { background: rgba(239,68,68,0.15);  color: #EF4444; border: 1px solid rgba(239,68,68,0.3); }
      .diff-low    { background: rgba(16,185,129,0.15); color: #10B981; border: 1px solid rgba(16,185,129,0.3); }
      .diff-neutral{ background: rgba(245,158,11,0.1);  color: #F59E0B; border: 1px solid rgba(245,158,11,0.25); }
      .diff-ok     { background: rgba(255,255,255,0.05);color: #5A6480; border: 1px solid rgba(255,255,255,0.1); }

      .k11-pi-price-row2 {
        display: flex; gap: 8px; margin-top: 8px;
      }
      .k11-pi-mini-stat {
        flex: 1; background: rgba(255,255,255,0.03);
        border: 1px solid #1A1D2E;
        border-radius: 7px; padding: 6px 8px;
        text-align: center;
      }
      .k11-pi-mini-stat-val {
        font-size: 11px; font-weight: 900;
        font-family: 'JetBrains Mono', monospace;
      }
      .k11-pi-mini-stat-lbl {
        font-size: 8px; font-weight: 700;
        color: #5A6480; letter-spacing: 0.5px;
        margin-top: 2px;
      }

      /* EXPAND area */
      .k11-pi-expand {
        margin-top: 10px; padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.05);
        display: none;
      }
      .k11-pi-price-card.expanded .k11-pi-expand { display: block; }
      .k11-pi-comp-row {
        display: flex; justify-content: space-between;
        padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
        font-size: 10px;
      }
      .k11-pi-comp-store { color: #B0B8CC; font-weight: 700; }
      .k11-pi-comp-price { color: #EDF0F7; font-family: 'JetBrains Mono', monospace; font-weight: 900; }
      .k11-pi-rec-box {
        margin-top: 8px; padding: 8px;
        background: rgba(255,140,0,0.06);
        border: 1px solid rgba(255,140,0,0.18);
        border-radius: 7px;
        font-size: 10px; color: #B0B8CC; line-height: 1.5;
      }

      /* ── TREND CARDS ──────────────────────────────────────── */
      .k11-pi-macro-box {
        background: rgba(96,165,250,0.06);
        border: 1px solid rgba(96,165,250,0.2);
        border-radius: 10px; padding: 12px;
        margin-bottom: 12px;
        font-size: 11px; color: #B0B8CC; line-height: 1.6;
        animation: k11piFadeIn 0.3s ease;
      }
      .k11-pi-macro-label {
        font-size: 8px; font-weight: 900; color: #60a5fa;
        letter-spacing: 1.2px; margin-bottom: 5px;
        font-family: 'JetBrains Mono', monospace;
      }
      .k11-pi-trend-card {
        background: linear-gradient(145deg, #141626, #0d0f18);
        border: 1px solid #1A1D2E;
        border-radius: 10px; padding: 12px;
        margin-bottom: 8px;
        animation: k11piFadeIn 0.3s ease both;
      }
      .k11-pi-trend-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 6px;
      }
      .k11-pi-trend-cat {
        font-size: 11px; font-weight: 800; color: #EDF0F7;
      }
      .k11-pi-trend-pct {
        font-size: 11px; font-weight: 900;
        font-family: 'JetBrains Mono', monospace;
      }
      .k11-pi-trend-insight {
        font-size: 10px; color: #B0B8CC; line-height: 1.5;
        margin-bottom: 6px;
      }
      .k11-pi-trend-action {
        font-size: 10px; color: #FF8C00;
        font-weight: 700;
        padding: 6px 8px;
        background: rgba(255,140,0,0.05);
        border-radius: 6px;
        border-left: 2px solid rgba(255,140,0,0.4);
      }
      .k11-pi-opp-list { margin-top: 10px; }
      .k11-pi-opp-item {
        display: flex; align-items: flex-start; gap: 7px;
        padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.04);
        font-size: 10px; color: #B0B8CC; line-height: 1.5;
      }
      .k11-pi-opp-item::before {
        content: '→'; color: #10B981; font-weight: 900; flex-shrink: 0; margin-top: 1px;
      }

      /* ── HISTORY ──────────────────────────────────────────── */
      .k11-pi-hist-prod-btn {
        display: block; width: 100%;
        background: rgba(255,255,255,0.03);
        border: 1px solid #1A1D2E;
        border-radius: 8px; padding: 10px 12px;
        margin-bottom: 6px; text-align: left; cursor: pointer;
        color: #B0B8CC; font-size: 11px; font-weight: 700;
        font-family: 'Inter', sans-serif;
        transition: all 0.2s;
      }
      .k11-pi-hist-prod-btn:hover {
        border-color: rgba(255,140,0,0.3); color: #FF8C00;
      }
      .k11-pi-hist-prod-btn.active {
        border-color: rgba(255,140,0,0.4);
        background: rgba(255,140,0,0.06);
        color: #FF8C00;
      }
      .k11-pi-hist-chart {
        background: #090b12;
        border: 1px solid #1A1D2E;
        border-radius: 10px;
        padding: 12px;
        margin-top: 8px;
        overflow: hidden;
      }
      .k11-pi-hist-chart-title {
        font-size: 9px; font-weight: 800; color: #5A6480;
        letter-spacing: 0.8px; margin-bottom: 10px;
        font-family: 'JetBrains Mono', monospace;
      }
      .k11-pi-chart-legend {
        display: flex; gap: 10px; margin-top: 8px;
      }
      .k11-pi-chart-legend-item {
        display: flex; align-items: center; gap: 4px;
        font-size: 9px; color: #5A6480; font-weight: 700;
      }
      .k11-pi-chart-legend-dot {
        width: 6px; height: 6px; border-radius: 50%;
      }

      /* ── SPARKLINE (mini chart) ───────────────────────────── */
      .k11-pi-sparkline {
        display: flex; align-items: flex-end; gap: 2px;
        height: 24px; padding: 0 2px;
      }
      .k11-pi-bar {
        flex: 1; border-radius: 2px 2px 0 0;
        min-width: 4px; transition: opacity 0.2s;
      }
      .k11-pi-bar:hover { opacity: 0.7; }

      /* ── SCAN BUTTON ──────────────────────────────────────── */
      .k11-pi-scan-btn {
        width: 100%; padding: 11px;
        background: linear-gradient(135deg, rgba(255,140,0,0.12), rgba(255,140,0,0.06));
        border: 1px solid rgba(255,140,0,0.3);
        border-radius: 9px;
        color: #FF8C00; font-size: 11px; font-weight: 900;
        letter-spacing: 1px; cursor: pointer;
        font-family: 'Inter', sans-serif;
        transition: all 0.2s; margin-bottom: 12px;
        display: flex; align-items: center; justify-content: center; gap: 7px;
      }
      .k11-pi-scan-btn:hover {
        background: linear-gradient(135deg, rgba(255,140,0,0.18), rgba(255,140,0,0.1));
        box-shadow: 0 4px 16px rgba(255,140,0,0.15);
      }
      .k11-pi-scan-btn:disabled {
        opacity: 0.5; cursor: not-allowed;
      }

      /* ── SECTION LABEL ────────────────────────────────────── */
      .k11-pi-section-label {
        font-size: 8px; font-weight: 900; color: #5A6480;
        letter-spacing: 1.5px; text-transform: uppercase;
        font-family: 'JetBrains Mono', monospace;
        margin-bottom: 8px; margin-top: 4px;
        display: flex; align-items: center; gap: 6px;
      }
      .k11-pi-section-label::after {
        content: ''; flex: 1; height: 1px;
        background: rgba(255,255,255,0.05);
      }

      /* ── ANIMATIONS ───────────────────────────────────────── */
      @keyframes k11piSpin {
        to { transform: rotate(360deg); }
      }
      @keyframes k11piPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.4; transform: scale(0.8); }
      }
      @keyframes k11piFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* ── TOAST PRICE ──────────────────────────────────────── */
      .k11-pi-toast {
        position: fixed;
        top: 70px; right: 14px;
        background: #141626;
        border: 1px solid;
        border-radius: 10px;
        padding: 10px 14px;
        max-width: 260px;
        z-index: 2000;
        font-size: 11px;
        line-height: 1.5;
        box-shadow: 0 8px 30px rgba(0,0,0,0.7);
        animation: k11piFadeIn 0.3s ease;
        cursor: pointer;
      }
      .k11-pi-toast.critical  { border-color: rgba(239,68,68,0.4);  color: #EF4444; }
      .k11-pi-toast.opportunity { border-color: rgba(16,185,129,0.4); color: #10B981; }
    `;
    document.head.appendChild(style);
  }

  // ── RENDER TABS ────────────────────────────────────────────────────

  function _renderActiveTab() {
    const body = document.getElementById('k11-pi-body');
    if (!body) return;

    switch (state.activeTab) {
      case 'alerts':  body.innerHTML = _renderAlerts();  break;
      case 'prices':  body.innerHTML = _renderPrices();  break;
      case 'trends':  body.innerHTML = _renderTrends();  break;
      case 'history': body.innerHTML = _renderHistory(); break;
    }
  }

  // ── ALERTS TAB ─────────────────────────────────────────────────────

  function _renderAlerts() {
    if (!state.alerts.length) {
      return `<div class="k11-pi-empty"><span>✅</span><span>Nenhum alerta no momento</span></div>`;
    }

    const sevMap = {
      CRITICAL: 'k11-pi-alert-critical',
      WARNING:  'k11-pi-alert-warning',
      OPPORTUNITY: 'k11-pi-alert-opportunity',
      OPTIMIZATION: 'k11-pi-alert-optimization',
      INFO: 'k11-pi-alert-info',
    };
    const badgeMap = {
      CRITICAL: 'badge-critical',
      WARNING: 'badge-warning',
      OPPORTUNITY: 'badge-opportunity',
      OPTIMIZATION: 'badge-optimization',
      INFO: 'badge-info',
    };
    const sevLabel = { CRITICAL: 'CRÍTICO', WARNING: 'ATENÇÃO', OPPORTUNITY: 'OPORTUNIDADE', OPTIMIZATION: 'OTIMIZAÇÃO', INFO: 'INFO' };

    let html = `<button class="k11-pi-scan-btn" onclick="K11PriceIntel.forceScan()" id="k11-pi-scan-btn">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path d="M1 4v6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M3.51 15a9 9 0 102.13-9.36L1 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      ATUALIZAR SCAN DE PREÇOS
    </button>`;

    const criticals = state.alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'WARNING');
    const opps      = state.alerts.filter(a => a.severity === 'OPPORTUNITY' || a.severity === 'OPTIMIZATION');
    const infos     = state.alerts.filter(a => a.severity === 'INFO');

    if (criticals.length) {
      html += `<div class="k11-pi-section-label">⚠️ Atenção Requerida (${criticals.length})</div>`;
      criticals.forEach((a, i) => {
        html += `<div class="k11-pi-alert ${sevMap[a.severity] || 'k11-pi-alert-info'}" style="animation-delay:${i * 0.05}s">
          <div class="k11-pi-alert-title">${a.title}</div>
          <div class="k11-pi-alert-action">${a.action}</div>
          ${a.estimatedLoss ? `<div class="k11-pi-alert-meta">
            <span style="font-size:10px;color:#5A6480">Perda estimada/un: <strong style="color:#EF4444">R$ ${a.estimatedLoss}</strong></span>
            <span class="k11-pi-alert-badge ${badgeMap[a.severity]}">${sevLabel[a.severity]}</span>
          </div>` : `<div style="margin-top:6px;text-align:right"><span class="k11-pi-alert-badge ${badgeMap[a.severity]}">${sevLabel[a.severity]}</span></div>`}
        </div>`;
      });
    }

    if (opps.length) {
      html += `<div class="k11-pi-section-label">💰 Oportunidades (${opps.length})</div>`;
      opps.forEach((a, i) => {
        html += `<div class="k11-pi-alert ${sevMap[a.severity]}" style="animation-delay:${i * 0.05}s">
          <div class="k11-pi-alert-title">${a.title}</div>
          <div class="k11-pi-alert-action">${a.action}</div>
          ${a.potentialGain ? `<div class="k11-pi-alert-meta">
            <span style="font-size:10px;color:#5A6480">Ganho potencial/un: <strong style="color:#10B981">+R$ ${a.potentialGain}</strong></span>
            <span class="k11-pi-alert-badge ${badgeMap[a.severity]}">${sevLabel[a.severity]}</span>
          </div>` : `<div style="margin-top:6px;text-align:right"><span class="k11-pi-alert-badge ${badgeMap[a.severity]}">${sevLabel[a.severity]}</span></div>`}
        </div>`;
      });
    }

    if (infos.length) {
      html += `<div class="k11-pi-section-label">ℹ️ Informações</div>`;
      infos.forEach((a, i) => {
        html += `<div class="k11-pi-alert k11-pi-alert-info" style="animation-delay:${i * 0.05}s">
          <div class="k11-pi-alert-title">${a.title}</div>
          <div class="k11-pi-alert-action">${a.action}</div>
        </div>`;
      });
    }

    return html;
  }

  // ── PRICES TAB ─────────────────────────────────────────────────────

  function _renderPrices() {
    if (!state.priceMap.length) {
      return `<div class="k11-pi-empty"><div class="k11-pi-spinner"></div><span>Buscando preços...</span></div>`;
    }

    const sorted = [...state.priceMap].sort((a, b) => Math.abs(b.diffPercent) - Math.abs(a.diffPercent));

    let html = `<div class="k11-pi-section-label">COMPARATIVO DE PREÇOS (${sorted.length} produtos)</div>`;

    sorted.forEach((p, i) => {
      const diff   = p.diffPercent;
      const diffStr = diff > 0 ? `+${diff}%` : `${diff}%`;
      const diffClass = diff > 15 ? 'diff-high' : diff < -10 ? 'diff-low' : diff < 0 ? 'diff-neutral' : 'diff-ok';
      const trendIcon  = p.trend === 'RISING' ? '📈' : p.trend === 'FALLING' ? '📉' : '➡️';
      const demandIcon = p.demandSignal === 'HIGH' ? '🔥' : p.demandSignal === 'LOW' ? '❄️' : '';
      const confColor  = p.confidence === 'HIGH' ? '#10B981' : p.confidence === 'MEDIUM' ? '#F59E0B' : '#5A6480';

      const comps = (p.competitorPrices || []).slice(0, 4)
        .map(c => `<div class="k11-pi-comp-row">
          <span class="k11-pi-comp-store">${c.store}</span>
          <span class="k11-pi-comp-price">R$ ${c.price?.toFixed(2)}</span>
        </div>`).join('');

      html += `
        <div class="k11-pi-price-card" id="pcard-${i}" onclick="K11PriceIntel.toggleCard('pcard-${i}')" style="animation-delay:${i * 0.04}s">
          <div class="k11-pi-price-row">
            <span class="k11-pi-prod-name">${trendIcon} ${demandIcon} ${p.productName}</span>
            <span class="k11-pi-diff-badge ${diffClass}">${diffStr}</span>
          </div>
          <div class="k11-pi-price-row2">
            <div class="k11-pi-mini-stat">
              <div class="k11-pi-mini-stat-val" style="color:#FF8C00">R$ ${p.myPrice?.toFixed(2)}</div>
              <div class="k11-pi-mini-stat-lbl">MEU PREÇO</div>
            </div>
            <div class="k11-pi-mini-stat">
              <div class="k11-pi-mini-stat-val" style="color:#EDF0F7">R$ ${p.marketAvgPrice?.toFixed(2)}</div>
              <div class="k11-pi-mini-stat-lbl">MERCADO MÉD.</div>
            </div>
            <div class="k11-pi-mini-stat">
              <div class="k11-pi-mini-stat-val" style="color:#10B981">R$ ${p.lowestMarketPrice?.toFixed(2)}</div>
              <div class="k11-pi-mini-stat-lbl">MENOR</div>
            </div>
          </div>
          <div class="k11-pi-expand">
            ${comps ? `<div class="k11-pi-section-label" style="margin-top:0">Lojas encontradas</div>${comps}` : ''}
            ${p.recommendation ? `<div class="k11-pi-rec-box">💡 ${p.recommendation}</div>` : ''}
            <div style="margin-top:8px;display:flex;justify-content:space-between;font-size:9px;color:#5A6480">
              <span>Confiança: <span style="color:${confColor};font-weight:900">${p.confidence || 'LOW'}</span></span>
              <span>${new Date(p.scannedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
            </div>
          </div>
        </div>`;
    });

    return html;
  }

  // ── TRENDS TAB ─────────────────────────────────────────────────────

  function _renderTrends() {
    const t = state.marketTrends;
    if (!t || (!t.trends?.length && !t.macroInsight)) {
      return `<div class="k11-pi-empty"><div class="k11-pi-spinner"></div><span>Analisando mercado...</span></div>`;
    }

    let html = '';

    if (t.macroInsight) {
      html += `<div class="k11-pi-macro-box">
        <div class="k11-pi-macro-label">VISÃO MACRO DO MERCADO</div>
        ${t.macroInsight}
      </div>`;
    }

    if (t.trends?.length) {
      html += `<div class="k11-pi-section-label">Tendências por Categoria</div>`;
      t.trends.forEach((tr, i) => {
        const pct      = tr.trendPercent > 0 ? `+${tr.trendPercent}%` : `${tr.trendPercent}%`;
        const pctColor = tr.trend === 'RISING' ? '#EF4444' : tr.trend === 'FALLING' ? '#10B981' : '#F59E0B';
        const icon     = tr.trend === 'RISING' ? '📈' : tr.trend === 'FALLING' ? '📉' : '➡️';
        const demand   = tr.signal === 'HIGH_DEMAND' ? '🔥 Alta Demanda' : tr.signal === 'LOW_DEMAND' ? '❄️ Baixa Demanda' : '⚖️ Demanda Normal';

        html += `<div class="k11-pi-trend-card" style="animation-delay:${i * 0.06}s">
          <div class="k11-pi-trend-header">
            <span class="k11-pi-trend-cat">${icon} ${tr.category}</span>
            <span class="k11-pi-trend-pct" style="color:${pctColor}">${pct}</span>
          </div>
          <div style="font-size:9px;color:#5A6480;margin-bottom:6px">${demand}</div>
          <div class="k11-pi-trend-insight">${tr.insight}</div>
          ${tr.action ? `<div class="k11-pi-trend-action">→ ${tr.action}</div>` : ''}
        </div>`;
      });
    }

    if (t.opportunities?.length) {
      html += `<div class="k11-pi-section-label">Oportunidades Identificadas</div>
        <div class="k11-pi-opp-list">
          ${t.opportunities.map(o => `<div class="k11-pi-opp-item">${o}</div>`).join('')}
        </div>`;
    }

    if (t.risks?.length) {
      html += `<div class="k11-pi-section-label" style="margin-top:12px">⚠️ Riscos de Mercado</div>
        <div class="k11-pi-opp-list">
          ${t.risks.map(r => `<div class="k11-pi-opp-item" style="color:#EF4444;padding-left:2px">${r}</div>`).join('')}
        </div>`;
    }

    return html;
  }

  // ── HISTORY TAB ────────────────────────────────────────────────────

  function _renderHistory() {
    if (!state.priceMap.length) {
      return `<div class="k11-pi-empty"><span>Nenhum histórico disponível</span></div>`;
    }

    if (!state.selectedProd) {
      let html = `<div class="k11-pi-section-label">Selecione um produto</div>`;
      state.priceMap.forEach(p => {
        html += `<button class="k11-pi-hist-prod-btn" data-product-id="${p.productId}" data-product-name="${p.productName}">
          ${p.productName}
        </button>`;
      });
      return html;
    }

    const h = state.history;
    const prodName = state.selectedProdName || state.selectedProd;

    let html = `
      <button class="k11-pi-hist-prod-btn active" onclick="K11PriceIntel.clearHistory()">
        ← ${prodName}
      </button>`;

    if (!h.length) {
      return html + `<div class="k11-pi-empty"><span>Sem histórico para este produto</span></div>`;
    }

    // Mini sparkline
    const maxPrice = Math.max(...h.map(x => x.marketAvgPrice || 0), 1);
    const bars = h.slice(-20).map(x => {
      const hMy  = Math.round((x.myPrice / maxPrice) * 100);
      const hMkt = Math.round((x.marketAvgPrice / maxPrice) * 100);
      return { hMy, hMkt, diff: x.diffPercent, ts: x.scannedAt };
    });

    html += `<div class="k11-pi-hist-chart">
      <div class="k11-pi-hist-chart-title">HISTÓRICO DE PREÇOS (últimos ${bars.length} scans)</div>
      <div style="display:flex;gap:2px;align-items:flex-end;height:48px;padding:0 2px">
        ${bars.map(b => `
          <div style="flex:1;display:flex;flex-direction:column;gap:1px;align-items:center;justify-content:flex-end;height:100%">
            <div style="width:100%;background:#FF8C00;border-radius:1px 1px 0 0;height:${b.hMy}%;opacity:0.8;min-height:2px"></div>
          </div>
          <div style="flex:1;display:flex;align-items:flex-end;height:100%">
            <div style="width:100%;background:#60a5fa;border-radius:1px 1px 0 0;height:${b.hMkt}%;opacity:0.6;min-height:2px"></div>
          </div>
        `).join('')}
      </div>
      <div class="k11-pi-chart-legend">
        <div class="k11-pi-chart-legend-item">
          <div class="k11-pi-chart-legend-dot" style="background:#FF8C00"></div> Meu Preço
        </div>
        <div class="k11-pi-chart-legend-item">
          <div class="k11-pi-chart-legend-dot" style="background:#60a5fa"></div> Mercado
        </div>
      </div>
    </div>`;

    // Tabela histórico
    html += `<div class="k11-pi-section-label" style="margin-top:12px">Registros</div>`;
    [...h].reverse().slice(0, 15).forEach(x => {
      const diff = x.diffPercent > 0 ? `+${x.diffPercent}%` : `${x.diffPercent}%`;
      const col  = x.diffPercent > 10 ? '#EF4444' : x.diffPercent < -5 ? '#10B981' : '#F59E0B';
      html += `<div class="k11-pi-comp-row">
        <span style="color:#5A6480;font-size:9px;font-family:'JetBrains Mono',monospace">
          ${new Date(x.scannedAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}
          ${new Date(x.scannedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
        </span>
        <span style="font-size:10px;color:#EDF0F7;font-family:'JetBrains Mono',monospace">
          Meu: R$${x.myPrice?.toFixed(2)} | Merc: R$${x.marketAvgPrice?.toFixed(2)}
          <span style="color:${col};font-weight:900;margin-left:4px">${diff}</span>
        </span>
      </div>`;
    });

    return html;
  }

  // ── HELPERS ────────────────────────────────────────────────────────

  function _updateBadge() {
    const critical = state.alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'WARNING').length;
    const fab = document.getElementById('k11-pi-fab-badge');
    const tabBadge = document.getElementById('k11-pi-alerts-count');

    if (fab) {
      fab.textContent = critical;
      fab.style.display = critical > 0 ? 'block' : 'none';
    }
    if (tabBadge) {
      tabBadge.textContent = critical;
      tabBadge.style.display = critical > 0 ? 'inline-block' : 'none';
    }
  }

  function _updateStatus(status) {
    const dot  = document.getElementById('k11-pi-conn-dot');
    const text = document.getElementById('k11-pi-status-text');
    const sub  = document.getElementById('k11-pi-status-text');

    if (dot) {
      dot.className = status === 'online'
        ? 'k11-pi-dot-online'
        : status === 'scanning'
        ? 'k11-pi-dot-scanning'
        : 'k11-pi-dot-offline';
    }
    if (text) {
      text.textContent = status === 'online' ? 'Online · Groq AI'
        : status === 'scanning' ? 'Scaneando preços...'
        : 'Offline';
      text.className = 'k11-pi-subtitle ' + (status === 'online' ? 'online' : status === 'offline' ? 'offline' : '');
    }
    if (state.lastUpdate) {
      const el = document.getElementById('k11-pi-last-scan');
      if (el) el.textContent = `SCAN: ${state.lastUpdate.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}`;
    }
  }

  function _showCriticalToasts() {
    const criticals = state.alerts.filter(a => a.severity === 'CRITICAL').slice(0, 2);
    criticals.forEach((a, i) => {
      setTimeout(() => {
        const t = document.createElement('div');
        t.className = 'k11-pi-toast critical';
        t.innerHTML = `<strong>${a.title}</strong><br><span style="font-size:9px;opacity:0.7">${a.action}</span>`;
        t.onclick = () => { togglePanel(); switchTab('alerts'); t.remove(); };
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 6000);
      }, i * 1500);
    });
  }

  function _bindEvents() {
    // Nada extra — tudo via onclick inline por compatibilidade
  }

  // ── PUBLIC ─────────────────────────────────────────────────────────

  function togglePanel() {
    state.panelOpen = !state.panelOpen;
    const panel    = document.getElementById('k11-pi-panel');
    const backdrop = document.getElementById('k11-pi-backdrop');
    if (!panel) return;
    panel.classList.toggle('open', state.panelOpen);
    if (backdrop) backdrop.classList.toggle('active', state.panelOpen);
    if (state.panelOpen) _renderActiveTab();
  }

  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.k11-pi-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    _renderActiveTab();
  }

  function toggleCard(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('expanded');
  }

  async function forceScan() {
    const token = (typeof K11Auth !== 'undefined' ? K11Auth.getToken() : null) || sessionStorage.getItem('k11_jwt');
    if (!token) return;

    state.scanActive = true;
    _updateStatus('scanning');
    document.getElementById('k11-pi-fab')?.classList.add('scanning');
    const scanBtn = document.getElementById('k11-pi-scan-btn');
    if (scanBtn) { scanBtn.disabled = true; scanBtn.textContent = '⏳ Scaneando...'; }

    try {
      await fetch(`${window.location.origin}/api/price-intel/scan-all`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (_) {}

    setTimeout(() => {
      state.scanActive = false;
      _updateStatus(state.connected ? 'online' : 'offline');
      document.getElementById('k11-pi-fab')?.classList.remove('scanning');
      if (scanBtn) { scanBtn.disabled = false; scanBtn.innerHTML = '🔄 ATUALIZAR SCAN DE PREÇOS'; }
    }, 3000);
  }

  async function loadHistory(productId, productName) {
    const token = (typeof K11Auth !== 'undefined' ? K11Auth.getToken() : null) || sessionStorage.getItem('k11_jwt');
    if (!token) return;

    state.selectedProd = productId;
    state.selectedProdName = productName;
    state.history = [];

    const body = document.getElementById('k11-pi-body');
    if (body) body.innerHTML = `<div class="k11-pi-empty"><div class="k11-pi-spinner"></div><span>Carregando histórico...</span></div>`;

    try {
      const r = await fetch(`${window.location.origin}/api/price-intel/history/${productId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const d = await r.json();
      state.history = d.data || [];
    } catch (_) { state.history = []; }

    _renderActiveTab();
  }

  function clearHistory() {
    state.selectedProd = null;
    state.selectedProdName = null;
    state.history = [];
    _renderActiveTab();
  }

  function open() { const panel = document.getElementById('k11-pi-panel'); if (panel && !panel.classList.contains('open')) togglePanel(); }
  return { init, open, togglePanel, switchTab, toggleCard, forceScan, loadHistory, clearHistory };
})();

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => K11PriceIntel.init(), 800));
} else {
  setTimeout(() => K11PriceIntel.init(), 800);
}
