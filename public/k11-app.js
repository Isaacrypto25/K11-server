/**
 * K11 OMNI ELITE — NUCLEAR BOOT SYSTEM
 * ════════════════════════════════════════════════════════════════
 * VERSÃO COMPLETA COM CÓDIGO NUCLEAR
 * Use este arquivo substituindo k11-app.js
 */

'use strict';

// ════════════════════════════════════════════════════════════════
// CORE APP INITIALIZATION (Original K11 APP)
// ════════════════════════════════════════════════════════════════

const APP = (function() {
    
    const state = {
        authToken: null,
        user: null,
        data: {},
        mode: sessionStorage.getItem('k11_mode') || 'ultra',
        currentView: window._K11_DEFAULT_VIEW || 'dash',
        _initialized: false,
    };
    
    // ── AUTH ──────────────────────────────────────────────────
    function _setupAuth() {
        const token = sessionStorage.getItem('k11_jwt');
        if (token) {
            state.authToken = token;
            state.user = JSON.parse(sessionStorage.getItem('k11_user') || '{}');
        }
    }
    
    function _setupDataEvents() {
        document.addEventListener('k11-data-ready', (e) => {
            Object.assign(state.data, e.detail || {});
        });
    }
    
    // ── VIEWS ─────────────────────────────────────────────────
    function view(viewName, btnEl) {
        if (!viewName || typeof K11Views !== 'object') return;
        
        state.currentView = viewName;
        
        // Remove active de todos
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Marca novo como active
        if (btnEl) btnEl.classList.add('active');
        
        // Chama a view
        if (typeof K11Views[viewName] === 'function') {
            K11Views[viewName]();
        }
    }
    
    // ── MODE ──────────────────────────────────────────────────
    function toggleMode() {
        const newMode = state.mode === 'ultra' ? 'lite' : 'ultra';
        state.mode = newMode;
        sessionStorage.setItem('k11_mode', newMode);
        
        document.body.classList.toggle('mode-lite', newMode === 'lite');
        
        const badge = document.getElementById('mode-badge-header');
        if (badge) {
            badge.className = `mode-badge ${newMode}`;
            badge.textContent = newMode.toUpperCase();
        }
        
        location.reload();
    }
    
    // ── MAIN INIT ─────────────────────────────────────────────
    function init() {
        if (state._initialized) return;
        state._initialized = true;
        
        console.log('[K11 APP] Inicializando...');
        
        // Setup
        _setupAuth();
        _setupDataEvents();
        
        // Badge de modo
        const badge = document.getElementById('mode-badge-header');
        if (badge) {
            badge.className = `mode-badge ${state.mode}`;
            badge.textContent = state.mode.toUpperCase();
            badge.style.display = 'inline-block';
        }
        
        // Chama a view padrão
        const defaultBtn = document.querySelector('[data-view="' + state.currentView + '"]');
        view(state.currentView, defaultBtn);
        
        // Emit evento de ready
        window.dispatchEvent(new CustomEvent('k11:ready', {
            detail: { state }
        }));
        
        console.log('[K11 APP] ✅ Inicialização concluída');
    }
    
    // ── PUBLIC API ────────────────────────────────────────────
    return {
        init,
        view,
        toggleMode,
        getState: () => ({ ...state }),
        getAuth: () => state.authToken,
        _initialized: state._initialized,
    };
})();

// ════════════════════════════════════════════════════════════════
// 🔥 NUCLEAR BOOT: Garantir que APP.init() seja chamado
// ════════════════════════════════════════════════════════════════

(function _nuclearInit() {
    console.log('[K11 NUCLEAR] Iniciando garantia de APP.init()...');
    
    let tentativas = 0;
    let maxTentativas = 50; // 5 segundos com polling a cada 100ms
    
    const intervalo = setInterval(() => {
        tentativas++;
        
        // Verificar se tudo que é necessário existe
        const engineStatus = document.getElementById('engine-status');
        const appExiste = typeof APP !== 'undefined';
        const initExiste = appExiste && typeof APP.init === 'function';
        const jaSeLlamo = appExiste && APP._initialized;
        
        // Log detalhado a cada 10 tentativas
        if (tentativas % 10 === 0) {
            console.log(`[K11 NUCLEAR] Tentativa ${tentativas}/50`, {
                'engine-status exists': !!engineStatus,
                'APP exists': appExiste,
                'APP.init exists': initExiste,
                'Already initialized': jaSeLlamo,
                readyState: document.readyState,
            });
        }
        
        // Se algo não existe ainda, continua tentando
        if (!engineStatus || !appExiste || !initExiste) {
            if (tentativas >= maxTentativas) {
                console.error('[K11 NUCLEAR] ❌ FALHA: Pré-requisitos não foram atendidos após 5s', {
                    'engine-status': !!engineStatus,
                    'APP': appExiste,
                    'APP.init': initExiste,
                });
                clearInterval(intervalo);
            }
            return;
        }
        
        // Se já foi inicializado, para de tentar
        if (jaSeLlamo) {
            console.log('[K11 NUCLEAR] ✅ APP já foi inicializado');
            clearInterval(intervalo);
            return;
        }
        
        // ✅ TUDO PRONTO! Chama APP.init()
        clearInterval(intervalo);
        
        console.log(`[K11 NUCLEAR] 🔥 EXECUTANDO APP.init() na tentativa ${tentativas}`);
        
        try {
            APP._initialized = true;
            APP.init();
            console.log('[K11 NUCLEAR] ✅ APP.init() executado com sucesso!');
        } catch (erro) {
            console.error('[K11 NUCLEAR] ❌ Erro ao executar APP.init():', erro);
        }
        
    }, 100); // Verifica a cada 100ms
    
    // Timeout de segurança
    setTimeout(() => {
        clearInterval(intervalo);
        if (typeof APP === 'undefined' || !APP._initialized) {
            console.error('[K11 NUCLEAR] ⏱️ TIMEOUT de 5s - APP.init() não foi executado!');
        }
    }, 5000);
})();

// ════════════════════════════════════════════════════════════════
// 🔥 NUCLEAR BOOT: Garantir que K11Live.start() seja chamado
// ════════════════════════════════════════════════════════════════

(function _k11LiveInit() {
    console.log('[K11 NUCLEAR] Iniciando garantia de K11Live.start()...');
    
    let tentativas = 0;
    let maxTentativas = 20; // 2 segundos com polling a cada 100ms
    
    const intervalo = setInterval(() => {
        tentativas++;
        
        const liveExiste = typeof K11Live !== 'undefined';
        const startExiste = liveExiste && typeof K11Live.start === 'function';
        const jaSeLlamo = liveExiste && K11Live._started;
        
        if (!liveExiste || !startExiste) {
            if (tentativas >= maxTentativas) {
                console.warn('[K11 NUCLEAR] K11Live não carregou em 2s (pode estar ok)');
                clearInterval(intervalo);
            }
            return;
        }
        
        if (jaSeLlamo) {
            console.log('[K11 NUCLEAR] ✅ K11Live já foi iniciado');
            clearInterval(intervalo);
            return;
        }
        
        clearInterval(intervalo);
        
        console.log(`[K11 NUCLEAR] 🔥 EXECUTANDO K11Live.start()`);
        
        try {
            K11Live._started = true;
            K11Live.start();
            console.log('[K11 NUCLEAR] ✅ K11Live.start() executado com sucesso!');
            
            // Pede permissão de notificação após 3s
            setTimeout(() => {
                if (typeof K11Live.requestNotificationPermission === 'function') {
                    K11Live.requestNotificationPermission();
                }
            }, 3000);
            
        } catch (erro) {
            console.error('[K11 NUCLEAR] ❌ Erro ao executar K11Live.start():', erro);
        }
        
    }, 100);
    
    setTimeout(() => {
        clearInterval(intervalo);
    }, 2000);
})();

console.log('[K11 NUCLEAR] ✅ Sistema de inicialização nuclear ativo');

// Exportar para uso global
window.APP = APP;
