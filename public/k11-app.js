/**
 * K11 OMNI ELITE — APP CORE (Bootstrap & Navegação)
 * ════════════════════════════════════════════════════
 * v3.1 — Autenticação JWT via servidor Railway
 *
 * Mudanças de segurança vs v2.0:
 * - Login agora valida no SERVIDOR (não mais no frontend)
 * - Token JWT armazenado em sessionStorage (não a senha)
 * - K11_SERVER_TOKEN removido — todas as chamadas usam JWT
 * - USUARIOS_VALIDOS removido do frontend
 * - Groq key removida do frontend
 *
 * Depende de: k11-config.js, k11-utils.js, k11-ui.js,
 *             k11-processors.js, k11-views.js, k11-actions.js
 */

'use strict';

const APP = {

    // ── ESTADO ──────────────────────────────────────────────────
    db: {
        produtos:      [],
        auditoria:     [],
        fila:          [],
        movimento:     [],
        pdv:           [],
        pdvAnterior:   [],
        pdvExtra:      {},
        tarefas:       [],
        ucGlobal:      [],
        agendamentos:  [],
        fornecedorMap: new Map(),
    },

    rankings: {
        growth:       [],
        decline:      [],
        duelos:       [],
        pieStats:     { red: 0, yellow: 0, green: 0, total: 1 },
        benchmarking: { hidraulica: 0, mesquita: 0, jacarepagua: 0, benfica: 0, loja: 0 },
        topLeverage:  { desc: 'N/A', vMinha: 0 },
        meta: {
            lossGap:        '0.0',
            valTotalRed:     0,
            valTotalYellow:  0,
            inconsistentes:  [],
        },
    },

    ui: {
        rankingAberto:   false,
        filtroEstoque:   'ruptura',
        buscaEstoque:    '',
        pdvAlvo:         'mesquita',
        buscaDuelo:      '',
        skuMatrixAberta: true,
        skuTab:          'drag',
        _acoesState:     [],
        _rafIds:         {},

        toast(msg, type = 'info') {
            const existing = document.getElementById('k11-toast');
            if (existing) existing.remove();
            const toast       = document.createElement('div');
            toast.id          = 'k11-toast';
            toast.className   = `toast toast-${type}`;
            toast.textContent = msg;
            document.body.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('toast-visible'));
            setTimeout(() => {
                toast.classList.remove('toast-visible');
                setTimeout(() => toast.remove(), 300);
            }, TOAST_DURATION_MS);
        },
    },

    // ── AUTENTICAÇÃO (JWT via servidor) ─────────────────────────
    auth: {

        /**
         * Login: envia RE + PIN para o servidor.
         * O servidor valida, retorna JWT + dados do usuário.
         * Nenhuma credencial fica no frontend.
         */
        async login() {
            const reEl   = document.getElementById('user-re');
            const passEl = document.getElementById('user-pass');
            const btn    = document.getElementById('btn-login');
            const re     = reEl?.value?.trim();
            const pass   = passEl?.value?.trim();

            if (!re || !pass) {
                document.querySelector('.op-card')?.classList.add('shake-error');
                setTimeout(() => document.querySelector('.op-card')?.classList.remove('shake-error'), 500);
                APP.ui.toast('Preencha RE e PIN.', 'danger');
                return;
            }

            if (btn) btn.innerHTML = '<div class="spinner-small"></div> AUTENTICANDO...';

            try {
                const res = await fetch(`${K11_SERVER_URL}/api/auth/login`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ re, pin: pass }),
                    signal:  AbortSignal.timeout(8000),
                });

                const data = await res.json();

                if (!res.ok || !data.ok) {
                    [reEl, passEl].forEach(el => {
                        el?.classList.add('shake-error');
                        setTimeout(() => el?.classList.remove('shake-error'), 500);
                    });
                    APP.ui.toast(data.error || 'RE ou PIN incorreto.', 'danger');
                    if (btn) btn.innerHTML = 'AUTENTICAR NO KERNEL';
                    return;
                }

                // Salva JWT e dados do usuário (nunca o PIN)
                K11Auth.setToken(data.token);
                try {
                    sessionStorage.setItem('k11_user', JSON.stringify({
                        re,
                        nome: data.user.nome,
                        role: data.user.role,
                    }));
                } catch {}

                if (btn) btn.innerHTML = 'AUTENTICAR NO KERNEL';

                // Redireciona conforme role
                if (data.user.role === 'super') {
                    try { sessionStorage.setItem('k11_mode', 'ultra'); } catch {}
                    document.body.classList.add('fade-out');
                    setTimeout(() => { window.location.href = 'dashboard.html'; }, 400);
                } else if (typeof window._showModeModal === 'function') {
                    window._showModeModal(data.user.nome);
                } else {
                    try { sessionStorage.setItem('k11_mode', 'ultra'); } catch {}
                    document.body.classList.add('fade-out');
                    setTimeout(() => { window.location.href = 'dashboard.html'; }, 400);
                }

            } catch (err) {
                APP.ui.toast('Erro de conexão com o servidor.', 'danger');
                if (btn) btn.innerHTML = 'AUTENTICAR NO KERNEL';
                console.error('[K11 auth]', err.message);
            }
        },

        /**
         * Verifica se o JWT atual ainda é válido.
         * Se não for, redireciona para login.
         */
        guard() {
            if (!K11Auth.isAuthenticated()) {
                console.warn('[K11 auth] Sessão expirada ou inválida. Redirecionando...');
                K11Auth.clearToken();
                window.location.href = 'index.html';
                return false;
            }
            return true;
        },

        logout() {
            K11Auth.clearToken();
            window.location.href = 'index.html';
        },
    },

    // ── BOOTSTRAP ────────────────────────────────────────────────
    async init() {
        // Guard: garante que o usuário está autenticado
        if (!APP.auth.guard()) return;

        const st    = document.getElementById('engine-status');
        const stage = document.getElementById('stage');

        if (st)    st.innerHTML    = '<div class="spinner-small"></div> CONECTANDO AO SERVIDOR...';
        if (stage) stage.innerHTML = APP.views._skeleton();

        APP._serverLog('info', 'FRONTEND', 'K11 OMNI init() iniciado');

        const t = Date.now();
        let success = false;
        
        try {
            // ── Carrega dados via K11DataInject (Supabase → Railway) ───
            let allData = null;
            if (typeof K11DataInject !== 'undefined') {
                try {
                    const res = await APP._serverFetch('/api/data/all');
                    if (res?.ok && res?.data && Object.keys(res.data).length > 0) {
                        allData = res.data;
                    }
                } catch (e) {
                    if (e.message?.includes('401')) {
                        APP.ui.toast('Sessão expirada. Faça login novamente.', 'danger');
                        setTimeout(() => APP.auth.logout(), 2000);
                        return;
                    }
                    // servidor indisponível — continua com arrays vazios
                    console.warn('[K11 init] Servidor indisponível, continuando offline:', e.message);
                }
            }

            // ── Fallback para arquivos locais (modo offline/demo) ─────
            let p, a, m, v, vAnt, tar, vMesq, vJaca, vBenf, forn;

            if (allData) {
                p     = allData.produtos       || [];
                a     = allData.auditoria      || [];
                m     = allData.movimento      || [];
                v     = allData.pdv            || [];
                vAnt  = allData.pdvAnterior    || [];
                tar   = allData.tarefas        || [];
                vMesq = allData.pdvmesquita    || [];
                vJaca = allData.pdvjacarepagua || [];
                vBenf = allData.pdvbenfica     || [];
                forn  = allData.fornecedor     || [];
            } else {
                [p, a, m, v, vAnt, tar, vMesq, vJaca, vBenf, forn] = [[], [], [], [], [], [], [], [], [], []];
            }

            // Injeta dados no APP.db
            APP.db.rawEstoque  = p;
            APP.db.auditoria   = a;
            APP.db.movimento   = m;
            APP.db.pdv         = v;
            APP.db.pdvAnterior = vAnt;
            APP.db.tarefas     = tar;

            // Processamento
            console.log('[K11 init] Processando dados...');
            APP.processarEstoque(p);
            APP.processarDueloAqua();
            APP.processarBI_DualTrend();
            APP.processarUCGlobal_DPA();
            APP._detectarInconsistencias();

            // Status
            const isServerMode = !!allData;
            if (st) {
                st.innerText = isServerMode ? '● K11 OMNI ONLINE ⚡ SERVER' : '● K11 OMNI ONLINE';
                st.classList.add('status-online');
            }

            APP._setupPullToRefresh();
            APP._updateNavBadges();

            const badgeEl = document.getElementById('mode-badge-header');
            if (badgeEl) {
                const mode = (typeof K11_MODE !== 'undefined') ? K11_MODE : 'ultra';
                badgeEl.className = `mode-badge ${mode}`;
                badgeEl.textContent = mode === 'lite' ? '⚡ LITE' : '🧠 ULTRA';
            }

            const defaultView = (typeof window._K11_DEFAULT_VIEW !== 'undefined')
                ? window._K11_DEFAULT_VIEW : 'dash';

            APP.view(defaultView);

            if (APP._warnNoServer) APP._showNoServerWarning();

            APP._serverLog('info', 'FRONTEND', 'K11 OMNI carregado com sucesso', {
                produtos:   APP.db.rawEstoque.length,
                pdv:        APP.db.pdv.length,
                tarefas:    APP.db.tarefas.length,
                serverMode: isServerMode,
            });
            
            success = true;

        } catch (e) {
            if (st) st.innerText = '⚠ ERRO DE CARREGAMENTO';
            console.error('[K11 init] ERRO DURANTE INICIALIZAÇÃO:', {
                message: e.message,
                stack: e.stack?.split('\n').slice(0, 3),
                timestamp: new Date().toISOString(),
            });
            APP.ui.toast('Falha ao carregar dados. Tente novamente.', 'danger');
            APP._serverLog('error', 'FRONTEND', `init() falhou: ${e.message}`);
            
            // Renderiza uma view vazia mesmo com erro
            const defaultView = (typeof window._K11_DEFAULT_VIEW !== 'undefined')
                ? window._K11_DEFAULT_VIEW : 'dash';
            APP.view(defaultView);
        } finally {
            // 🔥 FIX CRÍTICO: SEMPRE emite k11:ready, com ou sem erro
            window.dispatchEvent(new Event('k11:ready'));
            
            const totalMs = Date.now() - t;
            console.log(`[K11 init] Inicialização ${success ? '✓ OK' : '⚠ COM ERRO'} em ${totalMs}ms`);
        }
    },

        // ── SERVER FETCH — usa JWT do sessionStorage ─────────────────
    async _serverFetch(path, options = {}) {
        const token = K11Auth.getToken();
        const url   = `${K11_SERVER_URL}${path}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        try {
            const r = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type':  'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    ...(options.headers || {}),
                },
            });
            clearTimeout(timer);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.json();
        } catch (e) {
            clearTimeout(timer);
            throw e;
        }
    },

    // ── SERVER LOG ────────────────────────────────────────────────
    _serverLog(level, module, message, meta = null) {
        const token = K11Auth.getToken();
        if (!K11_SERVER_URL) return;
        fetch(`${K11_SERVER_URL}/api/system/log`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ level, module, message, meta }),
        }).catch(() => {});
    },

    // ── TOGGLE TAREFA ─────────────────────────────────────────────
    async toggleTarefaServer(id) {
        try {
            const res = await APP._serverFetch(`/api/data/tarefas/${id}/toggle`, { method: 'POST' });
            if (res?.ok && res?.tarefa) {
                const t = APP.db.tarefas.find(x => String(x.id) === String(id));
                if (t) t.done = res.tarefa.done;
                APP.view('detalheTarefas');
            }
        } catch (e) {
            const t = APP.db.tarefas.find(x => x.id === id);
            if (t) { t.done = !t.done; APP.view('detalheTarefas'); }
        }
    },

    // ── FETCH LOCAL (fallback offline) ───────────────────────────
    async _safeFetch(url, retries = FETCH_RETRY) {
        const controller = new AbortController();
        const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const r = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.json();
        } catch (e) {
            clearTimeout(timer);
            if (retries > 0) {
                await new Promise(res => setTimeout(res, 400));
                return APP._safeFetch(url, retries - 1);
            }
            const isFileProtocol = location.protocol === 'file:';
            if (isFileProtocol) APP._warnNoServer = true;
            console.warn(`[K11 fetch] Falhou: ${url}`, e?.message || e);
            return [];
        }
    },

    _showNoServerWarning() {
        const st = document.getElementById('engine-status');
        if (st) { st.innerHTML = '⚠ MODO DEMO — sem dados'; st.style.color = 'var(--warning, #eab308)'; }
    },

    // ── DELEGAÇÕES ────────────────────────────────────────────────
    getCapacidade: (desc) => getCapacidade(desc),
    processarEstoque(data)      { Processors.processarEstoque(data);           },
    processarDueloAqua()        { Processors.processarDueloAqua();             },
    processarBI_DualTrend()     { Processors.processarBI_DualTrend();          },
    processarUCGlobal_DPA()     { Processors.processarUCGlobal_DPA();          },
    _gerarAcoesPrioritarias()   { return Processors.gerarAcoesPrioritarias();  },
    _detectarInconsistencias()  { Processors.detectarInconsistencias();        },

    views:   Views,
    actions: Actions,

    // ── NAVEGAÇÃO ─────────────────────────────────────────────────
    view(v, param) {
        if (param?.classList) {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            param.classList.add('active');
        }
        const stage = document.getElementById('stage');
        if (!stage || !APP.views[v]) return;
        const arg = typeof param === 'string' ? param : undefined;
        stage.innerHTML = APP.views[v](arg);
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (v === 'operacional') setTimeout(() => APP._setupSwipeFila(), 50);
    },

    // ── UI HELPERS ────────────────────────────────────────────────
    _updateNavBadges() {
        const rupturas = APP.db.produtos.filter(p => p.categoriaCor === 'red').length;
        const gargalos = APP.db.ucGlobal.length;
        document.querySelectorAll('[data-badge="rupturas"]').forEach(el => { el.dataset.count = rupturas > 0 ? rupturas : ''; });
        document.querySelectorAll('[data-badge="gargalos"]').forEach(el => { el.dataset.count = gargalos > 0 ? gargalos : ''; });
    },

    toggleMode() {
        const current  = (sessionStorage.getItem('k11_mode') || 'ultra').toLowerCase();
        const next     = current === 'ultra' ? 'lite' : 'ultra';

        try { sessionStorage.setItem('k11_mode', next); } catch {}

        window.K11_MODE = next;
        document.body.classList.toggle('mode-lite', next === 'lite');

        const badgeEl = document.getElementById('mode-badge-header');
        if (badgeEl) {
            badgeEl.className = `mode-badge ${next}`;
            badgeEl.textContent = next === 'lite' ? '⚡ LITE' : '🧠 ULTRA';
        }

        window._K11_DEFAULT_VIEW = next === 'lite' ? 'estoque' : 'dash';
        APP.ui.toast(`Modo ${next.toUpperCase()} ativado`, 'info');
        APP.view(window._K11_DEFAULT_VIEW);
    },

    _setupPullToRefresh() {
        let startY = 0;
        document.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
        document.addEventListener('touchend', e => {
            const delta = e.changedTouches[0].clientY - startY;
            if (delta > 70 && window.scrollY === 0) {
                APP.ui.toast('Atualizando dados...', 'info');
                setTimeout(() => APP.init(), 500);
            }
        }, { passive: true });
    },

    _setupSwipeFila() {
        document.querySelectorAll('.swipe-item').forEach(el => {
            const idx = parseInt(el.dataset.filaIdx, 10);
            let startX = 0, isDragging = false;
            el.addEventListener('touchstart', e => { startX = e.touches[0].clientX; isDragging = true; el.style.transition = 'none'; }, { passive: true });
            el.addEventListener('touchmove',  e => { if (!isDragging) return; const dx = e.touches[0].clientX - startX; if (dx < 0) el.style.transform = `translateX(${dx}px)`; }, { passive: true });
            el.addEventListener('touchend', e => {
                if (!isDragging) return; isDragging = false;
                const dx = e.changedTouches[0].clientX - startX;
                el.style.transition = 'transform 0.3s, opacity 0.3s';
                if (dx < -80) { el.style.transform = 'translateX(-110%)'; el.style.opacity = '0'; setTimeout(() => APP.actions.remFila(idx), 310); }
                else { el.style.transform = 'translateX(0)'; }
            }, { passive: true });
        });
    },

    _saveFilaToSession()    { try { sessionStorage.setItem('k11_fila', JSON.stringify(APP.db.fila)); } catch {} },
    _restoreFilaFromSession() {
        try { const raw = sessionStorage.getItem('k11_fila'); if (raw) APP.db.fila = JSON.parse(raw); }
        catch { APP.db.fila = []; }
    },
};

window.APP = APP;

window.addEventListener('load', () => {
    if (document.getElementById('engine-status')) APP.init();
});

// ── SERVICE WORKER: Auto-reload + botão de atualizar ─────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {

        // AUTO-RELOAD: recebe mensagem do SW quando há nova versão
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data?.type === 'SW_UPDATED') {
                console.log('[K11 PWA] Nova versão detectada. Recarregando...');
                window.location.reload();
            }
        });

        // BOTÃO DE ATUALIZAR: aparece quando há update pendente (waiting)
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker?.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    _mostrarBotaoAtualizar(reg);
                }
            });
        });

        reg.update().catch(() => {});

    }).catch(err => console.warn('[K11 SW] Registro falhou:', err));
}

function _mostrarBotaoAtualizar(reg) {
    const existente = document.getElementById('k11-update-btn');
    if (existente) return;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes k11-pulse {
            0%, 100% { box-shadow: 0 4px 20px rgba(34,197,94,0.4); }
            50%       { box-shadow: 0 4px 30px rgba(34,197,94,0.8); }
        }
    `;
    document.head.appendChild(style);

    const btn = document.createElement('button');
    btn.id = 'k11-update-btn';
    btn.innerHTML = '🔄 Nova versão disponível — Toque para atualizar';
    btn.style.cssText = `
        position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
        background: #22c55e; color: #000; font-weight: 700; font-size: 13px;
        padding: 10px 20px; border-radius: 999px; border: none; z-index: 9999;
        cursor: pointer; box-shadow: 0 4px 20px rgba(34,197,94,0.4);
        white-space: nowrap; animation: k11-pulse 2s infinite;
    `;
    document.body.appendChild(btn);

    btn.addEventListener('click', () => {
        btn.innerHTML = '⏳ Atualizando...';
        reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => window.location.reload(), 300);
    });
}


// ════════════════════════════════════════════════════════════════════════════
// 🔥 NUCLEAR BOOT: Force initialization sem depender de eventos
// ════════════════════════════════════════════════════════════════════════════
// Este código garante que APP.init() e K11Live.start() são chamados
// independentemente de quando os eventos de carregamento dispararem.
//
// PROBLEMA ORIGINAL:
// - window.addEventListener('load', ...) registrado DEPOIS que 'load' já disparou
// - Resultado: callback NUNCA é executado
// - Dashboard fica em "BOOTING" infinito
//
// SOLUÇÃO:
// - Usar polling em vez de eventos
// - Verificar estado real (document.readyState, typeof APP, etc)
// - Múltiplos gatilhos para segurança
// ════════════════════════════════════════════════════════════════════════════

(function _nuclearBootstrap() {
    'use strict';
    
    let appInitialized = false;
    let k11LiveStarted = false;
    let attemptCount = 0;
    let maxAttempts = 50; // 5 segundos com polling a cada 100ms
    
    const pollInterval = setInterval(_checkAndInit, 100);
    const timeoutHandle = setTimeout(_timeout, 5000);
    
    function _checkAndInit() {
        attemptCount++;
        
        // ── CHECK 1: Todos os elementos DOM necessários existem? ──
        const engineStatus = document.getElementById('engine-status');
        if (!engineStatus) {
            if (attemptCount >= maxAttempts) {
                console.error('[K11 NUCLEAR] ❌ engine-status elemento nunca foi encontrado!');
                clearInterval(pollInterval);
            }
            return;
        }
        
        // ── CHECK 2: APP objeto existe e tem init? ──
        if (typeof APP === 'undefined') {
            if (attemptCount >= maxAttempts) {
                console.error('[K11 NUCLEAR] ❌ APP objeto nunca foi definido!');
                clearInterval(pollInterval);
            }
            return;
        }
        
        if (typeof APP.init !== 'function') {
            if (attemptCount >= maxAttempts) {
                console.error('[K11 NUCLEAR] ❌ APP.init não é uma função!');
                clearInterval(pollInterval);
            }
            return;
        }
        
        // ── CHECK 3: Já foi inicializado? ──
        if (appInitialized) {
            clearInterval(pollInterval);
            clearTimeout(timeoutHandle);
            return;
        }
        
        // ════════════════════════════════════════════════════════════
        // ✅ TUDO PRONTO! Iniciando APP
        // ════════════════════════════════════════════════════════════
        
        clearInterval(pollInterval);
        clearTimeout(timeoutHandle);
        appInitialized = true;
        
        console.log('[K11 NUCLEAR] 🔥 BOOT iniciado! (tentativa ' + attemptCount + '/50)');
        console.log('[K11 NUCLEAR] readyState: ' + document.readyState);
        console.log('[K11 NUCLEAR] Chamando APP.init()...');
        
        try {
            APP.init();
            console.log('[K11 NUCLEAR] ✅ APP.init() executado com sucesso');
        } catch (err) {
            console.error('[K11 NUCLEAR] ❌ Erro ao chamar APP.init():', err);
        }
        
        // ── K11Live também precisa iniciar ──
        _bootstrapK11Live();
    }
    
    function _timeout() {
        clearInterval(pollInterval);
        if (!appInitialized) {
            console.error('[K11 NUCLEAR] ⏱️ TIMEOUT! APP não inicializou em 5 segundos');
            console.error('[K11 NUCLEAR] Diagnóstico:', {
                'readyState': document.readyState,
                'APP type': typeof APP,
                'APP.init exists': typeof APP?.init === 'function',
                'engine-status exists': !!document.getElementById('engine-status'),
                'attempts': attemptCount,
            });
        }
    }
    
    function _bootstrapK11Live() {
        console.log('[K11 NUCLEAR] Iniciando K11Live...');
        
        let liveAttempts = 0;
        const liveCheck = setInterval(() => {
            liveAttempts++;
            
            // K11Live existe?
            if (typeof K11Live === 'undefined') {
                if (liveAttempts >= 20) {
                    console.warn('[K11 NUCLEAR] ⚠️ K11Live nunca foi definido (timeout 2s)');
                    clearInterval(liveCheck);
                }
                return;
            }
            
            // K11Live.start existe?
            if (typeof K11Live.start !== 'function') {
                if (liveAttempts >= 20) {
                    console.warn('[K11 NUCLEAR] ⚠️ K11Live.start não é uma função');
                    clearInterval(liveCheck);
                }
                return;
            }
            
            // Já foi iniciado?
            if (k11LiveStarted) {
                clearInterval(liveCheck);
                return;
            }
            
            // ✅ Iniciar K11Live
            k11LiveStarted = true;
            clearInterval(liveCheck);
            
            console.log('[K11 NUCLEAR] 🔥 K11Live iniciado! (tentativa ' + liveAttempts + '/20)');
            
            try {
                K11Live.start();
                console.log('[K11 NUCLEAR] ✅ K11Live.start() executado com sucesso');
                
                // Requisita permissão de notificação
                setTimeout(() => {
                    if (typeof K11Live.requestNotificationPermission === 'function') {
                        K11Live.requestNotificationPermission();
                    }
                }, 3000);
                
            } catch (err) {
                console.error('[K11 NUCLEAR] ❌ Erro ao chamar K11Live.start():', err);
            }
            
        }, 100); // Verifica a cada 100ms
        
        // Timeout para K11Live
        setTimeout(() => {
            clearInterval(liveCheck);
            if (!k11LiveStarted) {
                console.warn('[K11 NUCLEAR] ⚠️ K11Live não iniciou em 2 segundos (pode estar ok)');
            }
        }, 2000);
    }
})();

// ════════════════════════════════════════════════════════════════════════════
// 🛡️ FALLBACK: Se alguma coisa falhar, tenta novamente após login
// ════════════════════════════════════════════════════════════════════════════
(function _setupFallbackInit() {
    // Se em 10 segundos o app ainda não foi inicializado, tenta força
    setTimeout(() => {
        if (!APP || !APP._initialized) {
            console.warn('[K11 NUCLEAR] 🔄 Fallback: Tentando inicialização forçada...');
            if (typeof APP === 'object' && typeof APP.init === 'function') {
                try {
                    APP.init();
                    console.log('[K11 NUCLEAR] ✅ Fallback init bem-sucedido');
                } catch (err) {
                    console.error('[K11 NUCLEAR] ❌ Fallback init falhou:', err);
                }
            }
        }
        
        // K11Live fallback
        if (!K11Live || !K11Live._started) {
            if (typeof K11Live === 'object' && typeof K11Live.start === 'function') {
                try {
                    K11Live.start();
                    console.log('[K11 NUCLEAR] ✅ K11Live fallback bem-sucedido');
                } catch (err) {
                    console.error('[K11 NUCLEAR] ❌ K11Live fallback falhou:', err);
                }
            }
        }
    }, 10000);
})();

