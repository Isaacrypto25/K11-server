/**
 * K11 OMNI ELITE — APP CORE v4.0
 * ════════════════════════════════════════════════════
 * Bootstrap, navegação, autenticação JWT e estado global.
 *
 * v4.0 — Novidades:
 *   • APP.ui.crossBrandM1 / crossBrandM2 — state para aba Cross-Brand
 *   • APP._aiAlertsCount   — badge de alertas da IA
 *   • APP._updateNavBadges — atualiza todos os badges numerais
 *   • APP.actions.setCrossBrandM1/M2 — handlers de select
 *   • SSE listener para alertas proativos da IA (k11_ai_core)
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
        growth:            [],
        decline:           [],
        duelos:            [],
        topRupturaProxima: [],    // [v4] SKUs com ruptura ≤ 7d
        bi: {
            skus: [], subsecoes: [], marcas: [],
            marcasGlobal: [],      // [v4] cross-brand
            compararMarcas: null,  // [v4] fn(a,b)
            isMock: true,
        },
        pieStats:     { red: 0, yellow: 0, green: 0, total: 1 },
        benchmarking: { hidraulica: 0, mesquita: 0, jacarepagua: 0, benfica: 0, loja: 0 },
        topLeverage:  { desc: 'N/A', vMinha: 0 },
        meta: {
            lossGap:       '0.0',
            valTotalRed:    0,
            valTotalYellow: 0,
            inconsistentes: [],
        },
    },

    // Contagem de alertas não-lidos da IA (atualiza badge de nav)
    _aiAlertsCount: 0,

    ui: {
        rankingAberto:   false,
        filtroEstoque:   'ruptura',
        buscaEstoque:    '',
        pdvAlvo:         'mesquita',
        buscaDuelo:      '',
        skuMatrixAberta: true,
        skuTab:          'drag',
        biTab:           'sku',
        buscaMarcas:     '',
        filtroMarcaSub:  '',
        crossBrandM1:    '',    // [v4] marca A selecionada no cross-brand
        crossBrandM2:    '',    // [v4] marca B selecionada no cross-brand
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

                K11Auth.setToken(data.token);
                try {
                    sessionStorage.setItem('k11_user', JSON.stringify({
                        re,
                        nome: data.user.nome,
                        role: data.user.role,
                    }));
                } catch {}

                if (btn) btn.innerHTML = 'AUTENTICAR NO KERNEL';

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

        guard() {
            if (!K11Auth.isAuthenticated()) {
                console.warn('[K11 auth] Sessão expirada. Redirecionando...');
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
        if (!APP.auth.guard()) return;

        const st    = document.getElementById('engine-status');
        const stage = document.getElementById('stage');

        if (st)    st.innerHTML    = '<div class="spinner-small"></div> CONECTANDO AO SERVIDOR...';
        if (stage) stage.innerHTML = APP.views._skeleton();

        APP._serverLog('info', 'FRONTEND', 'K11 OMNI v4 init() iniciado');

        try {
            const t = Date.now();

            let allData = null;
            try {
                const res = await APP._serverFetch('/api/data/all');
                if (res?.ok && res?.data) {
                    allData = res.data;
                    APP._serverLog('info', 'FRONTEND', 'Dados carregados via servidor', {
                        datasets: Object.keys(allData).length,
                    });
                }
            } catch (e) {
                if (e.message?.includes('401')) {
                    APP.ui.toast('Sessão expirada. Faça login novamente.', 'danger');
                    setTimeout(() => APP.auth.logout(), 2000);
                    return;
                }
                APP._serverLog('warn', 'FRONTEND', 'Servidor indisponível', { error: e.message });
            }

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
                [p, a, m, v, vAnt, tar, vMesq, vJaca, vBenf, forn] = await Promise.all([
                    APP._safeFetch(`./produtos.json?t=${t}`),
                    APP._safeFetch(`./auditoria.json?t=${t}`),
                    APP._safeFetch(`./movimento.json?t=${t}`),
                    APP._safeFetch(`./pdv.json?t=${t}`),
                    APP._safeFetch(`./pdvAnterior.json?t=${t}`),
                    APP._safeFetch(`./tarefas.json?t=${t}`),
                    APP._safeFetch(`./pdvmesquita.json?t=${t}`),
                    APP._safeFetch(`./pdvjacarepagua.json?t=${t}`),
                    APP._safeFetch(`./pdvbenfica.json?t=${t}`),
                    APP._safeFetch(`./fornecedor.json?t=${t}`),
                ]);
            }

            // ── Fornecedor ──────────────────────────────────────
            APP.db._rawFornecedor = Array.isArray(forn) ? forn : [];
            APP.db.fornecedorMap  = new Map();
            APP.db._rawFornecedor.forEach(f => {
                if (f?.FIELD1 === 'Número Pedido' || f?.FIELD1 === 'Cliente') return;
                const sku     = String(f?.FIELD3 ?? '').trim();
                const nomeRaw = String(f?.FIELD12 ?? '').trim();
                const nome    = nomeRaw.includes(' - ') ? nomeRaw.split(' - ').slice(1).join(' - ') : nomeRaw;
                if (sku) APP.db.fornecedorMap.set(sku, nome || 'Fornecedor Indefinido');
            });

            // ── Agendamentos ────────────────────────────────────
            const _agMap = new Map();
            APP.db._rawFornecedor.forEach(f => {
                if (f?.FIELD1 === 'Número Pedido' || f?.FIELD1 === 'Cliente') return;
                const sku = String(f?.FIELD3 ?? '').trim();
                if (!sku) return;
                const nomeRaw = String(f?.FIELD12 ?? '').trim();
                const nome    = nomeRaw.includes(' - ') ? nomeRaw.split(' - ').slice(1).join(' - ') : nomeRaw;
                const nf      = String(f['AGENDAMENTOS POR FORNECEDOR'] ?? '').trim();
                const prev    = _agMap.get(sku);
                if (prev) {
                    prev.qtdAgendada   += safeFloat(f.FIELD5);
                    prev.qtdConfirmada += safeFloat(f.FIELD6);
                    if (!prev.pedidos.includes(String(f.FIELD1))) prev.pedidos.push(String(f.FIELD1));
                    if (nf && !prev.nfs.includes(nf)) prev.nfs.push(nf);
                } else {
                    _agMap.set(sku, {
                        sku,
                        descForn:      String(f?.FIELD4 ?? '').trim(),
                        fornecedor:    nome || 'Não identificado',
                        nfs:           nf ? [nf] : [],
                        pedidos:       [String(f.FIELD1)],
                        qtdAgendada:   safeFloat(f.FIELD5),
                        qtdConfirmada: safeFloat(f.FIELD6),
                        dataInicio:    String(f.FIELD7 ?? '').substring(0, 10),
                        dataFim:       String(f.FIELD8 ?? '').substring(0, 10),
                        idAgendamento: String(f.FIELD9  ?? '').trim(),
                        doca:          String(f.FIELD11 ?? '').trim(),
                    });
                }
            });
            APP.db._agMapRaw = _agMap;

            // ── Dados restantes ─────────────────────────────────
            APP.db.auditoria = (Array.isArray(a) ? a : []).map((item, idx) => ({
                id: `uc-${idx}`,
                fornecedor: item?.cod_comprador ?? 'N/A',
                desc:       item?.descricao    ?? 'N/A',
                done: false,
            }));

            APP.db.movimento   = Array.isArray(m)    ? m    : Object.values(m ?? {});
            APP.db.pdv         = Array.isArray(v)    ? v    : [];
            APP.db.pdvAnterior = Array.isArray(vAnt) ? vAnt : [];
            APP.db.pdvExtra    = {
                mesquita:    vMesq ?? [],
                jacarepagua: vJaca ?? [],
                benfica:     vBenf ?? [],
            };

            APP.db.tarefas = (Array.isArray(tar) ? tar : []).map((tk, i) => ({
                ...tk, id: tk.id ?? i, done: tk.done ?? false,
                task: tk?.task ?? tk?.['Tarefa'] ?? 'Tarefa s/ descrição',
            }));

            APP._restoreFilaFromSession();

            // ── Processamento ────────────────────────────────────
            APP.processarEstoque(p);

            APP.db.agendamentos = [...(APP.db._agMapRaw ?? new Map()).values()].map(ag => {
                const prod = APP.db.produtos.find(p => p.id === ag.sku);
                return {
                    ...ag,
                    desc:   prod?.desc        ?? ag.descForn ?? 'N/A',
                    pkl:    prod?.pkl          ?? null,
                    total:  prod?.total        ?? null,
                    status: prod?.categoriaCor ?? 'sem-estoque',
                };
            }).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));

            APP.processarDueloAqua();
            APP.processarBI_DualTrend();
            APP.processarUCGlobal_DPA();
            APP._detectarInconsistencias();

            // ── Conecta SSE de alertas da IA ─────────────────────
            APP._connectAIAlerts();

            // ── Status barra ─────────────────────────────────────
            const isServerMode = !!allData;
            if (st) {
                st.innerText = isServerMode ? '● K11 OMNI ONLINE ⚡ SERVER' : '● K11 OMNI ONLINE';
                st.classList.add('status-online');
            }

            APP._setupPullToRefresh();
            APP._setupSwipeFila();
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

            window.dispatchEvent(new Event('k11:ready'));

            APP._serverLog('info', 'FRONTEND', 'K11 OMNI v4 carregado', {
                produtos:        APP.db.produtos.length,
                pdv:             APP.db.pdv.length,
                tarefas:         APP.db.tarefas.length,
                topRupturaCount: APP.rankings.topRupturaProxima.length,
                serverMode:      isServerMode,
            });

        } catch (e) {
            if (st) st.innerText = '⚠ ERRO DE CARREGAMENTO';
            console.error('[K11 init]', e);
            APP.ui.toast('Falha ao carregar dados. Tente novamente.', 'danger');
            APP._serverLog('error', 'FRONTEND', `init() falhou: ${e.message}`);
        }
    },

    // ── SSE — alertas proativos da IA ────────────────────────────
    _connectAIAlerts() {
        const token = K11Auth.getToken();
        if (!token || !K11_SERVER_URL) return;

        try {
            const src = new EventSource(
                `${K11_SERVER_URL}/api/ai/v3/stream`,
                { withCredentials: false }
            );

            src.addEventListener('proactive_alerts', (e) => {
                try {
                    const payload = JSON.parse(e.data);
                    const alerts  = payload.alerts ?? [];
                    if (!alerts.length) return;

                    APP._aiAlertsCount += alerts.length;
                    window.K11_ALERTS        = window.K11_ALERTS ?? [];
                    window.K11_ALERTS_UNREAD = APP._aiAlertsCount;
                    window.K11_ALERTS.push(...alerts);

                    APP._updateNavBadges();

                    // Toast para alertas críticos
                    const crit = alerts.find(a => a.severity === 'CRITICAL');
                    if (crit) {
                        APP.ui.toast(`🚨 ${crit.title}`, 'danger');
                    }
                } catch (_) {}
            });

            src.addEventListener('connected', () => {
                console.log('[K11 IA] SSE conectado');
            });

            src.onerror = () => {
                src.close();
                // Reconecta em 60s silenciosamente
                setTimeout(() => APP._connectAIAlerts(), 60000);
            };

        } catch (_) {}
    },

    // ── SERVER FETCH ─────────────────────────────────────────────
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
                    'Content-Type': 'application/json',
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
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ level, module, message, meta }),
        }).catch(() => {});
    },

    // ── TOGGLE TAREFA SERVER ──────────────────────────────────────
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
            if (location.protocol === 'file:') APP._warnNoServer = true;
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
    processarEstoque(data)     { Processors.processarEstoque(data);           },
    processarDueloAqua()       { Processors.processarDueloAqua();             },
    processarBI_DualTrend()    { Processors.processarBI_DualTrend();          },
    processarUCGlobal_DPA()    { Processors.processarUCGlobal_DPA();          },
    _gerarAcoesPrioritarias()  { return Processors._gerarAcoesPrioritarias(); },
    _detectarInconsistencias() { Processors.detectarInconsistencias();        },

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

    // ── BADGES NUMERAIS (v4) ──────────────────────────────────────
    _updateNavBadges() {
        const rupturas   = APP.rankings.pieStats.red;
        const proxRuptura = APP.rankings.topRupturaProxima.length;
        const gargalos   = APP.db.ucGlobal.length;
        const aiAlerts   = APP._aiAlertsCount;

        // Nav buttons com data-badge="<tipo>"
        document.querySelectorAll('[data-badge="estoque"]').forEach(el => {
            el.dataset.badgeCount = rupturas > 0 ? rupturas : '';
        });
        document.querySelectorAll('[data-badge="reposicao"]').forEach(el => {
            el.dataset.badgeCount = proxRuptura > 0 ? proxRuptura : '';
        });
        document.querySelectorAll('[data-badge="gargalos"]').forEach(el => {
            el.dataset.badgeCount = gargalos > 0 ? gargalos : '';
        });
        document.querySelectorAll('[data-badge="ai"]').forEach(el => {
            el.dataset.badgeCount = aiAlerts > 0 ? aiAlerts : '';
        });

        // Badge legado (data-count)
        document.querySelectorAll('[data-badge="rupturas"]').forEach(el => {
            el.dataset.count = rupturas > 0 ? rupturas : '';
        });

        // Atualiza badge inline na view se estiver visível
        const iaBadgeEl = document.getElementById('ia-alerts-badge');
        if (iaBadgeEl) {
            iaBadgeEl.textContent = aiAlerts;
            iaBadgeEl.style.display = aiAlerts > 0 ? 'inline-flex' : 'none';
        }
    },

    // ── TOGGLE MODE ───────────────────────────────────────────────
    toggleMode() {
        const current = (sessionStorage.getItem('k11_mode') || 'ultra').toLowerCase();
        const next    = current === 'ultra' ? 'lite' : 'ultra';

        try { sessionStorage.setItem('k11_mode', next); } catch {}
        window.K11_MODE = next;
        document.body.classList.toggle('mode-lite', next === 'lite');

        const badgeEl = document.getElementById('mode-badge-header');
        if (badgeEl) {
            badgeEl.className   = `mode-badge ${next}`;
            badgeEl.textContent = next === 'lite' ? '⚡ LITE' : '🧠 ULTRA';
        }

        window._K11_DEFAULT_VIEW = next === 'lite' ? 'estoque' : 'dash';
        APP.ui.toast(`Modo ${next.toUpperCase()} ativado`, 'info');
        APP.view(window._K11_DEFAULT_VIEW);
    },

    // ── PULL TO REFRESH ───────────────────────────────────────────
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

    // ── SWIPE FILA ────────────────────────────────────────────────
    _setupSwipeFila() {
        document.querySelectorAll('.swipe-item').forEach(el => {
            const idx = parseInt(el.dataset.filaIdx, 10);
            let startX = 0, isDragging = false;
            el.addEventListener('touchstart', e => {
                startX = e.touches[0].clientX;
                isDragging = true;
                el.style.transition = 'none';
            }, { passive: true });
            el.addEventListener('touchmove', e => {
                if (!isDragging) return;
                const dx = e.touches[0].clientX - startX;
                if (dx < 0) el.style.transform = `translateX(${dx}px)`;
            }, { passive: true });
            el.addEventListener('touchend', e => {
                if (!isDragging) return;
                isDragging = false;
                const dx = e.changedTouches[0].clientX - startX;
                el.style.transition = 'transform 0.3s, opacity 0.3s';
                if (dx < -80) {
                    el.style.transform = 'translateX(-110%)';
                    el.style.opacity   = '0';
                    setTimeout(() => APP.actions.remFila(idx), 310);
                } else {
                    el.style.transform = 'translateX(0)';
                }
            }, { passive: true });
        });
    },

    _saveFilaToSession()    {
        try { sessionStorage.setItem('k11_fila', JSON.stringify(APP.db.fila)); } catch {}
    },
    _restoreFilaFromSession() {
        try {
            const raw = sessionStorage.getItem('k11_fila');
            if (raw) APP.db.fila = JSON.parse(raw);
        } catch { APP.db.fila = []; }
    },
};

window.APP = APP;

window.addEventListener('load', () => {
    if (document.getElementById('engine-status')) APP.init();
});

// ── SERVICE WORKER: Auto-reload + botão de atualizar ─────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {

        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data?.type === 'SW_UPDATED') {
                console.log('[K11 PWA] Nova versão. Recarregando...');
                window.location.reload();
            }
        });

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
    if (document.getElementById('k11-update-btn')) return;

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
