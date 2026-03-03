/**
 * K11 OMNI ELITE — DATA INJECT (Supabase via Railway)
 * ═════════════════════════════════════════════════════
 * Busca todos os dados do servidor Railway (que lê do Supabase).
 * Substitui o carregamento local de JSONs.
 *
 * Depende de: k11-config.js, k11-utils.js
 */

'use strict';

const K11DataInject = (() => {

    // ── CONFIG ────────────────────────────────────────────────
    const SERVER   = K11_SERVER_URL;   // definido em k11-config.js
    const TIMEOUT  = FETCH_TIMEOUT_MS; // definido em k11-config.js
    // K11_SERVER_TOKEN foi removido por segurança — usa JWT dinâmico via K11Auth

    let _loadedAt  = null;
    let _retries   = 0;

    // ── FETCH COM TIMEOUT ─────────────────────────────────────

    async function _fetch(endpoint, options = {}) {
        const controller = new AbortController();
        const timer      = setTimeout(() => controller.abort(), TIMEOUT);

        try {
            const res = await fetch(`${SERVER}${endpoint}`, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type':  'application/json',
                    ...(K11Auth.getToken() ? { 'Authorization': `Bearer ${K11Auth.getToken()}` } : {}),
                    ...(options.headers || {}),
                },
            });

            clearTimeout(timer);

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }

            return await res.json();

        } catch (err) {
            clearTimeout(timer);
            throw err;
        }
    }

    // ── LOAD TODOS OS DADOS ───────────────────────────────────

    async function loadAll() {
        const res = await _fetch('/api/data/all');
        if (!res.ok) throw new Error(res.error || 'Resposta inválida do servidor');
        return res.data; // { produtos: [...], pdv: [...], ... }
    }

    // ── INJETAR NO APP ────────────────────────────────────────

    /**
     * Carrega dados do servidor e injeta no APP.db.
     * Chame isso no início do dashboard, após o login.
     */
    async function inject(app) {
        if (!app?.db) {
            console.error('[K11DataInject] APP.db não disponível');
            return false;
        }

        try {
            console.log('[K11DataInject] Carregando dados do servidor...');
            const data = await loadAll();

            // ── Injeta os datasets no APP.db ──────────────────
            app.db.rawEstoque  = data.produtos       || [];
            app.db.pdv         = data.pdv            || [];
            app.db.pdvAnterior = data.pdvAnterior    || [];
            app.db.pdvmesquita = data.pdvmesquita    || [];
            app.db.pdvjacarepagua = data.pdvjacarepagua || [];
            app.db.pdvbenfica  = data.pdvbenfica     || [];
            app.db.movimento   = data.movimento      || [];
            app.db.fornecedor  = data.fornecedor     || [];

            // Tarefas: preserva estado local se existir
            if (data.tarefas?.length > 0) {
                app.db.tarefas = data.tarefas;
            }

            _loadedAt = new Date();
            _retries  = 0;

            console.log('[K11DataInject] ✅ Dados carregados:', {
                produtos:    app.db.rawEstoque.length,
                pdv:         app.db.pdv.length,
                movimento:   app.db.movimento.length,
                tarefas:     app.db.tarefas?.length || 0,
            });

            // Processa o estoque após injetar
            if (typeof app._processarEstoque === 'function') {
                app._processarEstoque();
            }

            return true;

        } catch (err) {
            _retries++;
            console.error(`[K11DataInject] ❌ Erro ao carregar dados (tentativa ${_retries}):`, err.message);

            // Sem retry no boot — falha rápido e deixa o app carregar
            // (retry manual disponível via K11DataInject.reload(app))

            return false;
        }
    }

    // ── TOGGLE TAREFA (com sync ao servidor) ──────────────────

    async function toggleTarefa(app, id) {
        try {
            const res = await _fetch(`/api/data/tarefas/${id}/toggle`, { method: 'POST' });
            if (!res.ok) throw new Error(res.error);

            // Atualiza localmente sem precisar recarregar tudo
            const tarefa = app.db.tarefas?.find(t => String(t.id) === String(id));
            if (tarefa) tarefa.done = res.tarefa.done;

            if (typeof app.view === 'function') app.view('detalheTarefas');
            return true;

        } catch (err) {
            console.error('[K11DataInject] Erro ao toggle tarefa:', err.message);
            // Fallback local
            const tarefa = app.db.tarefas?.find(t => String(t.id) === String(id));
            if (tarefa) {
                tarefa.done = !tarefa.done;
                if (typeof app.view === 'function') app.view('detalheTarefas');
            }
            return false;
        }
    }

    // ── RELOAD (atualiza dados sem recarregar a página) ───────

    async function reload(app) {
        console.log('[K11DataInject] Recarregando dados...');
        const ok = await inject(app);
        if (ok && typeof app.view === 'function') {
            app.view(app.ui?.currentView || 'dash');
            if (typeof app.ui?.toast === 'function') {
                app.ui.toast('Dados atualizados do servidor.', 'success');
            }
        }
        return ok;
    }

    // ── STATUS ────────────────────────────────────────────────

    function getStatus() {
        return {
            loadedAt:  _loadedAt?.toLocaleString('pt-BR') || 'Não carregado',
            retries:   _retries,
            server:    SERVER,
        };
    }

    return { inject, reload, toggleTarefa, getStatus };

})();

// Expõe globalmente
window.K11DataInject = K11DataInject;
