/**
 * K11 OMNI ELITE — APP CORE (VERSÃO CORRIGIDA)
 * ════════════════════════════════════════════════════════════════
 * PROBLEMA FIXADO: APP.init() ERA CHAMADO SOMENTE SE TUDO EXISTISSE
 * SOLUÇÃO: Chamar APP.init() DIRETAMENTE no final do arquivo
 * 
 * Este arquivo SUBSTITUI k11-app.js (qualquer versão anterior)
 */

'use strict';

// ════════════════════════════════════════════════════════════════
// CORE APP INITIALIZATION
// ════════════════════════════════════════════════════════════════

const APP = (function() {
    
    const state = {
        authToken: null,
        user: null,
        data: {},
        mode: null,
        currentView: 'dash',
        _initialized: false,
    };
    
    // ── INICIALIZAR MODO ──────────────────────────────────────
    function _initMode() {
        try {
            state.mode = sessionStorage.getItem('k11_mode') || 'ultra';
        } catch {
            state.mode = 'ultra';
        }
        
        const isLite = state.mode === 'lite';
        if (isLite) document.body.classList.add('mode-lite');
        
        state.currentView = isLite ? 'estoque' : 'dash';
        window._K11_DEFAULT_VIEW = state.currentView;
    }
    
    // ── SETUP AUTH ────────────────────────────────────────────
    function _setupAuth() {
        try {
            const token = sessionStorage.getItem('k11_jwt');
            if (token) {
                state.authToken = token;
                try {
                    state.user = JSON.parse(sessionStorage.getItem('k11_user') || '{}');
                } catch {
                    state.user = {};
                }
            }
        } catch (err) {
            console.warn('[APP] Erro ao restaurar auth:', err.message);
        }
    }
    
    // ── SETUP DATA EVENTS ─────────────────────────────────────
    function _setupDataEvents() {
        document.addEventListener('k11-data-ready', (e) => {
            if (e.detail) Object.assign(state.data, e.detail);
        });
    }
    
    // ── VIEW MANAGEMENT ───────────────────────────────────────
    function view(viewName, btnEl) {
        if (!viewName) return;
        if (typeof K11Views !== 'object' || typeof K11Views[viewName] !== 'function') {
            console.warn(`[APP] View não existe: ${viewName}`);
            return;
        }
        
        state.currentView = viewName;
        
        // Atualiza botões nav
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        if (btnEl) btnEl.classList.add('active');
        
        // Chama a view
        try {
            K11Views[viewName]();
        } catch (err) {
            console.error(`[APP] Erro ao renderizar view ${viewName}:`, err);
        }
    }
    
    // ── MODE TOGGLE ───────────────────────────────────────────
    function toggleMode() {
        const newMode = state.mode === 'ultra' ? 'lite' : 'ultra';
        state.mode = newMode;
        try { sessionStorage.setItem('k11_mode', newMode); } catch {}
        
        document.body.classList.toggle('mode-lite', newMode === 'lite');
        
        const badge = document.getElementById('mode-badge-header');
        if (badge) {
            badge.className = `mode-badge ${newMode}`;
            badge.textContent = newMode.toUpperCase();
        }
        
        // Recarrega a página para aplicar modo completamente
        location.reload();
    }
    
    // ── MAIN INIT ─────────────────────────────────────────────
    function init() {
        // Guard: evita double-init
        if (state._initialized) {
            console.log('[APP] Já foi inicializado, ignorando chamada duplicada');
            return;
        }
        
        state._initialized = true;
        console.log('[APP] 🚀 Inicializando...');
        
        try {
            // 1. Setup modo
            _initMode();
            
            // 2. Restaurar autenticação
            _setupAuth();
            
            // 3. Setup de eventos de dados
            _setupDataEvents();
            
            // 4. Atualizar badge de modo
            const badge = document.getElementById('mode-badge-header');
            if (badge) {
                badge.className = `mode-badge ${state.mode}`;
                badge.textContent = state.mode.toUpperCase();
                badge.style.display = 'inline-block';
            }
            
            // 5. Atualizar status do engine
            const engineStatus = document.getElementById('engine-status');
            if (engineStatus) {
                engineStatus.textContent = 'READY ✓';
                engineStatus.style.color = 'var(--primary)';
            }
            
            // 6. Renderizar view padrão
            const defaultBtn = document.querySelector(`[data-view="${state.currentView}"]`);
            view(state.currentView, defaultBtn);
            
            // 7. Emit evento global de ready
            window.dispatchEvent(new CustomEvent('k11:ready', {
                detail: { 
                    state,
                    timestamp: Date.now(),
                    userAgent: navigator.userAgent,
                }
            }));
            
            console.log('[APP] ✅ Inicialização CONCLUÍDA', {
                mode: state.mode,
                view: state.currentView,
                authenticated: !!state.authToken,
            });
            
        } catch (err) {
            console.error('[APP] ❌ Erro fatal na inicialização:', err);
            state._initialized = false;
            throw err;
        }
    }
    
    // ── PUBLIC API ────────────────────────────────────────────
    return {
        init,
        view,
        toggleMode,
        getState: () => ({ ...state }),
        getAuth: () => state.authToken,
        getUser: () => state.user,
        setAuth: (token, user) => {
            state.authToken = token;
            state.user = user || {};
        },
        _initialized: state._initialized,
    };
})();

// ════════════════════════════════════════════════════════════════
// GARANTIR QUE APP.init() SEJA CHAMADO
// ════════════════════════════════════════════════════════════════

(function _ensureAppInit() {
    console.log('[APP BOOT] Garantindo inicialização de APP...');
    
    // Tenta várias estratégias para garantir que init() seja chamado
    
    // Estratégia 1: Se DOM estiver pronto, chama imediatamente
    if (document.readyState !== 'loading') {
        console.log('[APP BOOT] document.readyState =', document.readyState, '→ chamando APP.init() AGORA');
        setTimeout(() => APP.init(), 0);
        return;
    }
    
    // Estratégia 2: Escuta DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[APP BOOT] DOMContentLoaded → chamando APP.init()');
        APP.init();
    });
    
    // Estratégia 3: Fallback com timeout (máximo 10 segundos)
    setTimeout(() => {
        if (!APP._initialized) {
            console.warn('[APP BOOT] Timeout de 10s atingido, forçando APP.init()');
            APP.init();
        }
    }, 10_000);
    
})();

// ════════════════════════════════════════════════════════════════
// GARANTIR QUE K11Live.start() SEJA CHAMADO
// ════════════════════════════════════════════════════════════════

(function _ensureK11LiveStart() {
    console.log('[K11LIVE BOOT] Garantindo inicialização de K11Live...');
    
    // Estratégia 1: Escuta o evento k11:ready (emitido por APP.init())
    window.addEventListener('k11:ready', () => {
        console.log('[K11LIVE BOOT] k11:ready recebido → iniciando K11Live');
        if (typeof K11Live !== 'undefined' && typeof K11Live.start === 'function') {
            try {
                K11Live.start();
                // Pede permissão de notificação após 2 segundos
                setTimeout(() => {
                    if (typeof K11Live.requestNotificationPermission === 'function') {
                        K11Live.requestNotificationPermission();
                    }
                }, 2000);
            } catch (err) {
                console.error('[K11LIVE BOOT] Erro ao iniciar K11Live:', err);
            }
        }
    });
    
    // Estratégia 2: Fallback com polling (máximo 5 segundos)
    let tentativas = 0;
    const interval = setInterval(() => {
        tentativas++;
        if (tentativas > 50) { // 5 segundos = 50 × 100ms
            clearInterval(interval);
            return;
        }
        
        const liveExiste = typeof K11Live !== 'undefined';
        const startExiste = liveExiste && typeof K11Live.start === 'function';
        const jaSeLlamo = liveExiste && K11Live._started;
        
        if (liveExiste && startExiste && !jaSeLlamo && APP._initialized) {
            console.log('[K11LIVE BOOT] Polling detectou APP inicializado → iniciando K11Live');
            clearInterval(interval);
            try {
                K11Live.start();
            } catch (err) {
                console.error('[K11LIVE BOOT] Erro ao iniciar K11Live via polling:', err);
            }
        }
    }, 100);
    
})();

// Exporta globalmente
window.APP = APP;

console.log('[APP BOOT] ✅ Sistema de boot ativo e pronto');
