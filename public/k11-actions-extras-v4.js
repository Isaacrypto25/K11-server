/**
 * K11 OMNI ELITE — ACTIONS EXTRAS v4.0
 * ═══════════════════════════════════════
 * Adicione/substitua no seu arquivo k11-actions.js existente.
 *
 * NOVOS:
 *   setCrossBrandM1/M2   → Seleção de marcas para cross-brand
 *   markAlertsRead       → Zera badge numérico de alertas
 *   setBiTab             → Troca aba do BI (incluindo nova tab crossbrand)
 *   _setupSSEAlerts      → Conecta SSE do servidor para alertas em tempo real
 *   _updateNavBadges     → Badge numérico nas abas de navegação
 */

'use strict';

// ── Adicionar dentro do objeto Actions (ou merge no Actions existente) ──

const ActionsExtrasV4 = {

    // ── Cross-Brand ───────────────────────────────────────────────────
    setCrossBrandM1(value) {
        APP.ui.crossBrandM1 = value;
        APP.view('mercadoIntel');
    },
    setCrossBrandM2(value) {
        APP.ui.crossBrandM2 = value;
        APP.view('mercadoIntel');
    },

    // ── BI Tab (incluindo nova aba crossbrand) ────────────────────────
    setBiTab(tab) {
        APP.ui.biTab = tab;
        APP.view('mercadoIntel');
    },

    // ── Alertas da IA ─────────────────────────────────────────────────
    markAlertsRead() {
        window.K11_ALERTS_UNREAD = 0;
        APP._updateNavBadges();
        // Notifica servidor
        APP._serverFetch('/api/ai/alerts/read', { method: 'POST' }).catch(() => {});
        APP.view('iaAlertas');
    },

    // ── Badge numérico nas abas ───────────────────────────────────────
    _updateNavBadges() {
        const rupturas = APP.db.produtos.filter(p => p.categoriaCor === 'red').length;
        const gargalos = APP.db.ucGlobal.length;
        const aiAlerts = window.K11_ALERTS_UNREAD ?? 0;
        const proxRup  = (APP.rankings.topRupturaProxima ?? []).length;

        // Badges de navegação
        document.querySelectorAll('[data-badge="rupturas"]').forEach(el => {
            el.dataset.badgeCount = rupturas > 0 ? String(rupturas) : '';
        });
        document.querySelectorAll('[data-badge="gargalos"]').forEach(el => {
            el.dataset.badgeCount = gargalos > 0 ? String(gargalos) : '';
        });
        document.querySelectorAll('[data-badge="ai"]').forEach(el => {
            el.dataset.badgeCount = aiAlerts > 0 ? String(aiAlerts) : '';
        });

        // Badge na aba de estoque (rupturas + próximas)
        const estoqueTotal = rupturas + proxRup;
        document.querySelectorAll('[data-badge="estoque"]').forEach(el => {
            el.dataset.badgeCount = estoqueTotal > 0 ? String(estoqueTotal) : '';
        });

        // Badge no header de IA
        const iaEl = document.getElementById('ia-alerts-badge');
        if (iaEl) iaEl.textContent = String(aiAlerts);

        // Atualiza contador global
        APP._aiAlertsCount = aiAlerts;
    },

    // ── SSE — conecta stream de alertas da IA ─────────────────────────
    _setupSSEAlerts() {
        if (!window.K11Auth?.getToken()) return;
        if (window._k11SSESource) return; // já conectado

        try {
            const token = window.K11Auth.getToken();
            const es = new EventSource(`${K11_SERVER_URL}/api/ai/events?token=${token}`);
            window._k11SSESource = es;

            es.addEventListener('k11_alerts', (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (!window.K11_ALERTS) window.K11_ALERTS = [];

                    // Adiciona novos alertas
                    (data.alerts ?? []).forEach(a => {
                        if (!window.K11_ALERTS.find(x => x.id === a.id)) {
                            window.K11_ALERTS.push(a);
                        }
                    });

                    // Atualiza badge
                    window.K11_ALERTS_UNREAD = data.unreadCount ?? 0;
                    APP.actions._updateNavBadges();

                    // Toast de alerta crítico
                    const criticos = (data.alerts ?? []).filter(a => a.severity === 'CRITICO');
                    if (criticos.length) {
                        APP.ui.toast(`🔴 ${criticos[0].title}`, 'danger');
                    }
                } catch (_) {}
            });

            es.addEventListener('alerts_read', () => {
                window.K11_ALERTS_UNREAD = 0;
                APP.actions._updateNavBadges();
            });

            es.addEventListener('error', () => {
                window._k11SSESource = null;
                // Reconecta em 30s
                setTimeout(() => APP.actions._setupSSEAlerts(), 30000);
            });

        } catch (err) {
            console.warn('[K11 SSE]', err.message);
        }
    },

    // ── Filtros de marca ──────────────────────────────────────────────
    filtrarMarcas: typeof debounce === 'function'
        ? debounce((v) => { APP.ui.buscaMarcas = v; APP.view('mercadoIntel'); }, 300)
        : (v) => { APP.ui.buscaMarcas = v; APP.view('mercadoIntel'); },

    setFiltroMarcaSub(sub) {
        APP.ui.filtroMarcaSub = sub;
        APP.view('mercadoIntel');
    },

    // ── Projeção de estoque — abre detalhes de um SKU ─────────────────
    verProjecao(skuId) {
        const p = APP.db.produtos.find(x => x.id === skuId);
        if (!p) return;

        const cobMsg = p.diasCobertura === null
            ? 'Sem dados de venda para projeção'
            : p.diasCobertura <= 0
            ? '⛔ RUPTURA AGORA'
            : `Estimado ${p.diasCobertura} dias → ruptura em ${p.dataRupturaEstimada ?? '?'}`;

        const mediaMsg = p.mediaVendaDia > 0
            ? `Média de venda: ${p.mediaVendaDia.toFixed(1)} un/dia`
            : 'Sem histórico de vendas';

        APP.ui.toast(`${p.id}: ${cobMsg} | ${mediaMsg}`, p.categoriaCor === 'red' ? 'danger' : 'info');
    },
};

// ── Merge automático no APP.actions quando o DOM carrega ─────────────
if (typeof APP !== 'undefined' && APP.actions) {
    Object.assign(APP.actions, ActionsExtrasV4);
} else {
    // Aguarda o APP estar pronto
    window.addEventListener('k11:ready', () => {
        if (typeof APP !== 'undefined' && APP.actions) {
            Object.assign(APP.actions, ActionsExtrasV4);
            // Inicia SSE de alertas
            APP.actions._setupSSEAlerts();
        }
    });
}
