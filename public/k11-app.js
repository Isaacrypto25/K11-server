/**
 * K11 OMNI ELITE — APP CORE (Bootstrap & Navegação)
 * ════════════════════════════════════════════════════
 * v2.0 — Integrado com K11 OMNI SERVER (Railway)
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

    // ── AUTENTICAÇÃO ─────────────────────────────────────────────
    auth: {
        login() {
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

            const usuario = USUARIOS_VALIDOS[re];
            if (!usuario || usuario.pin !== pass) {
                [reEl, passEl].forEach(el => {
                    el?.classList.add('shake-error');
                    setTimeout(() => el?.classList.remove('shake-error'), 500);
                });
                APP.ui.toast('RE ou PIN incorreto.', 'danger');
                if (btn) btn.innerHTML = 'AUTENTICAR NO KERNEL';
                return;
            }

            try { sessionStorage.setItem('k11_user', JSON.stringify({ re, nome: usuario.nome, role: usuario.role })); } catch (_) {}

            if (btn) btn.innerHTML = '<div class="spinner-small"></div> AUTENTICANDO...';
            setTimeout(() => {
                if (btn) btn.innerHTML = 'AUTENTICAR NO KERNEL';
                if (usuario.role === 'super') {
                    try { sessionStorage.setItem('k11_mode', 'ultra'); } catch (_) {}
                    document.body.classList.add('fade-out');
                    setTimeout(() => { window.location.href = 'dashboard.html'; }, 400);
                } else if (typeof window._showModeModal === 'function') {
                    window._showModeModal(usuario.nome);
                } else {
                    try { sessionStorage.setItem('k11_mode', 'ultra'); } catch (_) {}
                    document.body.classList.add('fade-out');
                    setTimeout(() => { window.location.href = 'dashboard.html'; }, 400);
                }
            }, 600);
        },
    },

    // ── BOOTSTRAP ────────────────────────────────────────────────
    async init() {
        const st    = document.getElementById('engine-status');
        const stage = document.getElementById('stage');

        if (st)    st.innerHTML    = '<div class="spinner-small"></div> CONECTANDO AO SERVIDOR...';
        if (stage) stage.innerHTML = APP.views._skeleton();

        // Envia log de boot para o servidor
        APP._serverLog('info', 'FRONTEND', 'K11 OMNI init() iniciado');

        try {
            const t = Date.now();

            // ── Carrega tudo de uma vez via /api/data/all ──────────────
            let allData = null;
            try {
                const res = await APP._serverFetch('/api/data/all');
                if (res?.ok && res?.data) {
                    allData = res.data;
                    APP._serverLog('info', 'FRONTEND', 'Dados carregados via servidor', {
                        datasets: Object.keys(allData).length
                    });
                }
            } catch (e) {
                APP._serverLog('warn', 'FRONTEND', 'Servidor indisponível, tentando local', { error: e.message });
            }

            // ── Fallback para arquivos locais se servidor offline ──────
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
                // Fallback: carrega localmente
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

            // ── Fornecedor raw + maps ──────────────────────────────────
            APP.db._rawFornecedor = Array.isArray(forn) ? forn : [];

            APP.db.fornecedorMap = new Map();
            APP.db._rawFornecedor.forEach(f => {
                if (f?.FIELD1 === 'Número Pedido' || f?.FIELD1 === 'Cliente') return;
                const sku     = String(f?.FIELD3 ?? '').trim();
                const nomeRaw = String(f?.FIELD12 ?? '').trim();
                const nome    = nomeRaw.includes(' - ') ? nomeRaw.split(' - ').slice(1).join(' - ') : nomeRaw;
                if (sku) APP.db.fornecedorMap.set(sku, nome || 'Fornecedor Indefinido');
            });

            // ── Agendamentos brutos ────────────────────────────────────
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

            // ── Outros dados ──────────────────────────────────────────
            APP.db.auditoria = (Array.isArray(a) ? a : []).map((item, idx) => ({
                id: `uc-${idx}`,
                fornecedor: item?.cod_comprador ?? 'N/A',
                desc:       item?.descricao    ?? 'N/A',
                done: false,
            }));

            APP.db.movimento   = Array.isArray(m)   ? m   : Object.values(m ?? {});
            APP.db.pdv         = Array.isArray(v)   ? v   : [];
            APP.db.pdvAnterior = Array.isArray(vAnt) ? vAnt : [];
            APP.db.pdvExtra    = { mesquita: vMesq ?? [], jacarepagua: vJaca ?? [], benfica: vBenf ?? [] };

            // Tarefas — preserva estado done do servidor
            APP.db.tarefas = (Array.isArray(tar) ? tar : []).map((tk, i) => ({
                ...tk, id: tk.id ?? i, done: tk.done ?? false,
                task: tk?.task ?? tk?.['Tarefa'] ?? 'Tarefa s/ descrição',
            }));

            APP._restoreFilaFromSession();

            // ── Processamento ──────────────────────────────────────────
            APP.processarEstoque(p);

            APP.db.agendamentos = [...(APP.db._agMapRaw ?? new Map()).values()].map(ag => {
                const prod = APP.db.produtos.find(p => p.id === ag.sku);
                return {
                    ...ag,
                    desc:   prod?.desc          ?? ag.descForn ?? 'N/A',
                    pkl:    prod?.pkl            ?? null,
                    total:  prod?.total          ?? null,
                    status: prod?.categoriaCor   ?? 'sem-estoque',
                };
            }).sort((a, b) => a.dataInicio.localeCompare(b.dataInicio));

            APP.processarDueloAqua();
            APP.processarBI_DualTrend();
            APP.processarUCGlobal_DPA();
            APP._detectarInconsistencias();

            // ── Online ────────────────────────────────────────────────
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

            APP._serverLog('info', 'FRONTEND', 'K11 OMNI carregado com sucesso', {
                produtos:  APP.db.produtos.length,
                pdv:       APP.db.pdv.length,
                tarefas:   APP.db.tarefas.length,
                serverMode: isServerMode,
            });

        } catch (e) {
            if (st) st.innerText = '⚠ ERRO DE CARREGAMENTO';
            console.error('[K11 init]', e);
            APP.ui.toast('Falha ao carregar dados. Tente novamente.', 'danger');
            APP._serverLog('error', 'FRONTEND', `init() falhou: ${e.message}`);
        }
    },

    // ── SERVER FETCH — fetch autenticado para o servidor ─────────
    async _serverFetch(path, options = {}) {
        const url = `${K11_SERVER_URL}${path}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const r = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${K11_SERVER_TOKEN}`,
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

    // ── SERVER LOG — envia log do front para o servidor ──────────
    _serverLog(level, module, message, meta = null) {
        if (!K11_SERVER_URL || !K11_SERVER_TOKEN) return;
        // Fire-and-forget, sem await
        fetch(`${K11_SERVER_URL}/api/system/log`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${K11_SERVER_TOKEN}`,
            },
            body: JSON.stringify({ level, module, message, meta }),
        }).catch(() => {}); // silencia erros de rede
    },

    // ── TOGGLE TAREFA COM PERSISTÊNCIA NO SERVIDOR ───────────────
    async toggleTarefaServer(id) {
        try {
            const res = await APP._serverFetch(`/api/data/tarefas/${id}/toggle`, { method: 'POST' });
            if (res?.ok && res?.tarefa) {
                // Atualiza estado local com o retorno do servidor
                const t = APP.db.tarefas.find(x => String(x.id) === String(id));
                if (t) t.done = res.tarefa.done;
                APP.view('detalheTarefas');
                APP._serverLog('info', 'FRONTEND', `Tarefa ${id} toggled`, { done: res.tarefa.done });
            }
        } catch (e) {
            // Fallback: toggle local
            const t = APP.db.tarefas.find(x => x.id === id);
            if (t) { t.done = !t.done; APP.view('detalheTarefas'); }
            APP._serverLog('warn', 'FRONTEND', `Toggle tarefa ${id} offline`, { error: e.message });
        }
    },

    // ── FETCH LOCAL (fallback) ────────────────────────────────────
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
            const isDataUrl      = location.href.startsWith('data:');
            const isSpck         = navigator.userAgent.includes('Spck') || location.hostname === '';
            if (isFileProtocol || isDataUrl || isSpck) APP._warnNoServer = true;
            console.warn(`[K11 fetch] Falhou: ${url}`, e?.message || e);
            return [];
        }
    },

    // ── AVISO DE AMBIENTE SEM SERVIDOR ───────────────────────────
    _showNoServerWarning() {
        const st = document.getElementById('engine-status');
        if (st) { st.innerHTML = '⚠ MODO DEMO — sem dados'; st.style.color = 'var(--warning, #eab308)'; }
    },

    // ── DELEGAÇÃO PARA MÓDULOS EXTERNOS ──────────────────────────
    getCapacidade: (desc) => getCapacidade(desc),

    processarEstoque(data)      { Processors.processarEstoque(data);       },
    processarDueloAqua()        { Processors.processarDueloAqua();         },
    processarBI_DualTrend()     { Processors.processarBI_DualTrend();      },
    processarUCGlobal_DPA()     { Processors.processarUCGlobal_DPA();      },
    _gerarAcoesPrioritarias()   { return Processors.gerarAcoesPrioritarias(); },
    _detectarInconsistencias()  { Processors.detectarInconsistencias();    },

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

    // ── HELPERS DE UI ─────────────────────────────────────────────
    _updateNavBadges() {
        const rupturas = APP.db.produtos.filter(p => p.categoriaCor === 'red').length;
        const gargalos = APP.db.ucGlobal.length;
        document.querySelectorAll('[data-badge="rupturas"]').forEach(el => { el.dataset.count = rupturas > 0 ? rupturas : ''; });
        document.querySelectorAll('[data-badge="gargalos"]').forEach(el => { el.dataset.count = gargalos > 0 ? gargalos : ''; });
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
            el.addEventListener('touchmove', e => { if (!isDragging) return; const dx = e.touches[0].clientX - startX; if (dx < 0) el.style.transform = `translateX(${dx}px)`; }, { passive: true });
            el.addEventListener('touchend', e => {
                if (!isDragging) return; isDragging = false;
                const dx = e.changedTouches[0].clientX - startX;
                el.style.transition = 'transform 0.3s, opacity 0.3s';
                if (dx < -80) { el.style.transform = 'translateX(-110%)'; el.style.opacity = '0'; setTimeout(() => APP.actions.remFila(idx), 310); }
                else { el.style.transform = 'translateX(0)'; }
            }, { passive: true });
        });
    },

    _saveFilaToSession()    { try { sessionStorage.setItem('k11_fila', JSON.stringify(APP.db.fila)); } catch (_) {} },
    _restoreFilaFromSession() {
        try { const raw = sessionStorage.getItem('k11_fila'); if (raw) APP.db.fila = JSON.parse(raw); }
        catch (_) { APP.db.fila = []; }
    },
};

// ─── EXPOSIÇÃO GLOBAL ─────────────────────────────────────────
window.APP = APP;

// ─── ENTRY POINT ──────────────────────────────────────────────
window.addEventListener('load', () => {
    if (document.getElementById('engine-status')) APP.init();
});
