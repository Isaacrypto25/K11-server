/**
 * K11 OMNI ELITE — ACTIONS EXTRAS v5.0
 * ════════════════════════════════════
 * Extras: Menu Toggle SVG · Profile Drawer sync · Nav badges
 * Adicionado: Área cliente, Gestor widget helpers
 */
'use strict';

// ── TOP BAR: Menu toggle + sync ──────────────────────────────
(function initTopBarExtras() {
    function setup() {
        // Sincronizar mode badge no drawer quando APP altera
        const orig = typeof APP !== 'undefined' && APP.toggleMode;
        if (orig) {
            const _orig = APP.toggleMode.bind(APP);
            APP.toggleMode = function() {
                _orig();
                // Sync drawer badge
                const mode = (sessionStorage.getItem('k11_mode') || 'ultra').toLowerCase();
                const modeEl = document.getElementById('drawer-mode-txt');
                const modeBadge = document.getElementById('drawer-mode-badge');
                if (modeEl) modeEl.textContent = mode.toUpperCase() + ' ativo';
                if (modeBadge) {
                    modeBadge.className = `mode-badge ${mode}`;
                    modeBadge.textContent = mode === 'lite' ? '⚡ LITE' : '🧠 ULTRA';
                }
            };
        }
    }
    // Tentar depois que APP carrega
    if (document.readyState === 'complete') setup();
    else window.addEventListener('load', setup);
    window.addEventListener('k11:ready', setup);
})();

// ── GESTOR: Team performance widget actions ──────────────────
const K11GestorActions = {
    openTeam() {
        if (typeof APP !== 'undefined') APP.ui.toast('Módulo de equipe em desenvolvimento', 'info');
    },
    openRelatorio() {
        if (typeof APP !== 'undefined') APP.ui.toast('Relatórios em desenvolvimento', 'info');
    },
};
window.K11GestorActions = K11GestorActions;

// ── CLIENTE: Portal actions ──────────────────────────────────
const K11ClienteActions = {
    viewObra(id) {
        if (typeof APP !== 'undefined') APP.view('obraHome');
    },
    requestSupport() {
        if (typeof APP !== 'undefined') APP.ui.toast('Abrindo canal de suporte...', 'info');
    },
    viewDocuments() {
        if (typeof APP !== 'undefined') APP.ui.toast('Carregando documentos...', 'info');
    },
};
window.K11ClienteActions = K11ClienteActions;

// ── NAV: Adicionar botão de perfil (se não existir no HTML) ──
(function patchTopBar() {
    function syncProfileFab() {
        // Sincroniza iniciais no FAB de perfil
        try {
            const user = JSON.parse(sessionStorage.getItem('k11_user') || '{}');
            const nome = user.nome || user.name || '';
            const initials = nome.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase()
                          || (user.re || 'K').slice(0,2).toUpperCase();
            ['profile-fab-initials','profile-btn-initials'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = initials;
            });
        } catch {}
    }
    if (document.readyState === 'complete') syncProfileFab();
    else window.addEventListener('load', syncProfileFab);
    window.addEventListener('k11:ready', syncProfileFab);
})();
