/**
 * K11 OMNI ELITE — OBRA (Frontend Module)
 * ══════════════════════════════════════════
 * Módulo frontend para gestão de obras: listagem, detalhes,
 * chat, fases e integração com o orçamento IA.
 *
 * Expõe: window.OBRA (global)
 *
 * Interface:
 *   OBRA.init()                 → inicializa e carrega obras do usuário
 *   OBRA.state                  → estado atual { obras, projetoAtivo, loading }
 *   OBRA.loadObras()            → recarrega lista de obras
 *   OBRA.selectObra(id)         → seleciona obra ativa
 *   OBRA.renderHome()           → renderiza painel de obras no #obra-home-content
 *   OBRA.abrirOrcamento(obraId) → abre K11OrcamentoIA para a obra
 *
 * Depende de: k11-config.js, k11-utils.js
 */

'use strict';

// Módulo de UI de obras — estende window.OBRA sem redeclarar a constante
const _ObraUIModule = (() => {

    // ── ESTADO ──────────────────────────────────────────────────
    const state = {
        obras:         [],
        projetoAtivo:  null,
        fases:         [],
        mensagens:     [],
        loading:       false,
    };

    // ── INICIALIZAÇÃO ────────────────────────────────────────────
    async function init() {
        if (state.loading) return;
        state.loading = true;

        try {
            await loadObras();
            _renderHomeIfVisible();
            console.log('[K11 OBRA] ✅ Módulo de obras iniciado');
        } catch (e) {
            console.warn('[K11 OBRA] init falhou:', e.message);
        } finally {
            state.loading = false;
        }
    }

    // ── CARREGAR OBRAS ───────────────────────────────────────────
    async function loadObras() {
        const user = K11Auth.getUser();
        const role = user?.role;
        const endpoint = role === 'cliente' ? '/api/cliente/obras' : '/api/obramax/projects';

        try {
            const res  = await K11Auth.fetch(endpoint);
            const data = await res?.json();
            if (data?.ok || data?.success) {
                state.obras = data.data || [];
            }
        } catch (e) {
            console.warn('[K11 OBRA] loadObras falhou:', e.message);
            state.obras = [];
        }

        return state.obras;
    }

    // ── SELECIONAR OBRA ──────────────────────────────────────────
    async function selectObra(id) {
        state.projetoAtivo = state.obras.find(o => o.id === id) || null;
        if (!state.projetoAtivo) {
            try {
                const res  = await K11Auth.fetch(`/api/obramax/projects/${id}`);
                const data = await res?.json();
                if (data?.ok) state.projetoAtivo = data.data;
            } catch (_) {}
        }
        if (state.projetoAtivo) {
            await _loadFases(id);
            await _loadMensagens(id);
        }
        _renderHomeIfVisible();
        return state.projetoAtivo;
    }

    async function _loadFases(obraId) {
        try {
            const res  = await K11Auth.fetch(`/api/schedule/phases/${obraId}`);
            const data = await res?.json();
            state.fases = data?.data || data?.success && data.data || [];
        } catch (_) { state.fases = []; }
    }

    async function _loadMensagens(obraId) {
        try {
            const res  = await K11Auth.fetch(`/api/obra-chat/${obraId}`);
            const data = await res?.json();
            state.mensagens = data?.data || [];
        } catch (_) { state.mensagens = []; }
    }

    // ── ENVIAR MENSAGEM ──────────────────────────────────────────
    async function enviarMensagem(obraId, mensagem) {
        try {
            const res  = await K11Auth.fetch('/api/obra-chat', {
                method: 'POST',
                body:   JSON.stringify({ obra_id: obraId, mensagem }),
            });
            const data = await res?.json();
            if (data?.ok) {
                state.mensagens.push(data.data);
                _renderChatIfVisible(obraId);
                return data.data;
            }
        } catch (e) {
            console.warn('[K11 OBRA] enviarMensagem falhou:', e.message);
        }
        return null;
    }

    // ── ABRIR ORÇAMENTO ──────────────────────────────────────────
    function abrirOrcamento(obraId) {
        const id = obraId || state.projetoAtivo?.id;
        if (typeof K11OrcamentoIA !== 'undefined') {
            K11OrcamentoIA.open(id);
        } else {
            console.warn('[K11 OBRA] K11OrcamentoIA não disponível');
        }
    }

    // ── RENDERIZAÇÃO ─────────────────────────────────────────────
    function _renderHomeIfVisible() {
        const container = document.getElementById('obra-home-content');
        if (container) renderHome(container);
    }

    function _renderChatIfVisible(obraId) {
        const el = document.getElementById(`chat-msgs-${obraId}`);
        if (el) el.innerHTML = _renderMensagens();
    }

    function renderHome(container) {
        if (!container) {
            container = document.getElementById('obra-home-content');
            if (!container) return;
        }

        if (state.loading) {
            container.innerHTML = `<div class="micro-txt txt-muted" style="padding:20px 0;text-align:center">⏳ Carregando obras…</div>`;
            return;
        }

        if (state.projetoAtivo) {
            container.innerHTML = _renderDetalheObra(state.projetoAtivo);
            return;
        }

        if (state.obras.length === 0) {
            container.innerHTML = `
            <div style="text-align:center;padding:32px 0">
                <div style="font-size:32px;margin-bottom:12px">🏗️</div>
                <div class="micro-txt txt-muted">Nenhuma obra cadastrada</div>
                <button class="pos-tag btn-action margin-t-15" onclick="OBRA._novaObra()">
                    + Nova Obra
                </button>
            </div>`;
            return;
        }

        container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">
            ${state.obras.map(obra => _renderCardObra(obra)).join('')}
            <button class="pos-tag btn-action" style="margin-top:4px" onclick="OBRA._novaObra()">
                + Nova Obra
            </button>
        </div>`;
    }

    function _renderCardObra(obra) {
        const pct    = obra.progress_pct || 0;
        const status = obra.status || 'active';
        const statusColors = { active:'var(--success)', paused:'var(--warning)', completed:'var(--accent-blue)', cancelled:'var(--danger)' };
        const statusLabels = { active:'Em Andamento', paused:'Pausada', completed:'Concluída', cancelled:'Cancelada' };
        const cor = statusColors[status] || 'var(--text-muted)';

        return `
        <div class="op-card" style="cursor:pointer;border-left:3px solid ${cor}"
            onclick="OBRA.selectObra('${esc(obra.id)}')">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:14px">${esc(obra.name)}</div>
                    <div class="micro-txt txt-muted margin-t-3">${esc(obra.address || '')}</div>
                </div>
                <span class="micro-txt" style="color:${cor};flex-shrink:0;margin-left:8px">${statusLabels[status] || status}</span>
            </div>
            <!-- Barra de progresso -->
            <div style="margin-top:10px">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span class="micro-txt txt-muted">Progresso</span>
                    <span class="mono" style="font-size:11px;color:var(--primary)">${pct.toFixed(0)}%</span>
                </div>
                <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:var(--primary);transition:width .4s;border-radius:2px"></div>
                </div>
            </div>
            <!-- Datas e orçamento -->
            <div style="display:flex;gap:16px;margin-top:8px">
                <div class="micro-txt txt-muted">📅 ${formatDate(obra.start_date)} → ${formatDate(obra.predicted_end_date)}</div>
                ${obra.budget ? `<div class="micro-txt" style="color:var(--primary)">${brl(obra.budget)}</div>` : ''}
            </div>
        </div>`;
    }

    function _renderDetalheObra(obra) {
        const pct = obra.progress_pct || 0;
        const gasto = obra.total_spent || 0;
        const budget = obra.budget || 0;
        const pctGasto = budget > 0 ? Math.min(100, (gasto / budget) * 100) : 0;
        const corGasto = pctGasto > 90 ? 'var(--danger)' : pctGasto > 70 ? 'var(--warning)' : 'var(--success)';

        return `
        <!-- Botão voltar -->
        <button class="pos-tag" style="margin-bottom:12px;font-size:11px" onclick="OBRA._voltarLista()">
            ← Todas as obras
        </button>

        <!-- Cabeçalho da obra -->
        <div class="op-card" style="border-left:3px solid var(--primary)">
            <div style="font-size:16px;font-weight:800">${esc(obra.name)}</div>
            <div class="micro-txt txt-muted margin-t-3">${esc(obra.address || '')}</div>
            <div style="margin-top:12px">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span class="micro-txt txt-muted">Progresso geral</span>
                    <span class="mono" style="font-size:12px;color:var(--primary)">${pct.toFixed(0)}%</span>
                </div>
                <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                    <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:3px;transition:width .5s"></div>
                </div>
            </div>
        </div>

        <!-- KPIs -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div class="op-card" style="text-align:center">
                <div class="label">ORÇAMENTO</div>
                <div class="mono" style="color:var(--primary);font-size:15px">${brl(budget)}</div>
            </div>
            <div class="op-card" style="text-align:center">
                <div class="label">GASTO</div>
                <div class="mono" style="color:${corGasto};font-size:15px">${brl(gasto)}</div>
                <div class="micro-txt txt-muted">${pctGasto.toFixed(0)}% do orçamento</div>
            </div>
        </div>

        <!-- Fases -->
        ${state.fases.length > 0 ? `
        <div class="op-card">
            <div class="label margin-b-10">FASES DA OBRA</div>
            ${state.fases.map(fase => {
                const fpct  = fase.progress_percent || 0;
                const fcore = fpct >= 100 ? 'var(--success)' : fpct > 0 ? 'var(--primary)' : 'var(--border-bright)';
                return `
                <div style="margin-bottom:10px">
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                        <span style="font-size:12px;font-weight:600">${esc(fase.name)}</span>
                        <span class="mono" style="font-size:11px;color:${fcore}">${fpct.toFixed(0)}%</span>
                    </div>
                    <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden">
                        <div style="width:${fpct}%;height:100%;background:${fcore};border-radius:2px"></div>
                    </div>
                    <div class="micro-txt txt-muted margin-t-3">${formatDate(fase.start_date)} → ${formatDate(fase.predicted_end_date)}</div>
                </div>`;
            }).join('')}
        </div>` : ''}

        <!-- Ações -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <button class="pos-tag btn-action" onclick="OBRA.abrirOrcamento('${esc(obra.id)}')">
                🤖 Orçamento IA
            </button>
            <button class="pos-tag btn-action" onclick="OBRA._abrirChat('${esc(obra.id)}')">
                💬 Chat da Obra
            </button>
        </div>

        <!-- Chat -->
        <div id="chat-container-${esc(obra.id)}" style="display:none">
            <div class="op-card">
                <div class="label margin-b-10">💬 MENSAGENS</div>
                <div id="chat-msgs-${esc(obra.id)}" style="max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
                    ${_renderMensagens()}
                </div>
                <div style="display:flex;gap:8px">
                    <input id="chat-input-${esc(obra.id)}" class="op-input" placeholder="Mensagem…" style="flex:1"
                        onkeydown="if(event.key==='Enter')OBRA._sendChat('${esc(obra.id)}')">
                    <button class="pos-tag btn-action" onclick="OBRA._sendChat('${esc(obra.id)}')">↑</button>
                </div>
            </div>
        </div>`;
    }

    function _renderMensagens() {
        if (state.mensagens.length === 0) {
            return `<div class="micro-txt txt-muted centered">Nenhuma mensagem ainda</div>`;
        }
        const user = K11Auth.getUser();
        return state.mensagens.map(m => {
            const meu = m.autor_ldap === user?.re || m.autor_email === user?.email;
            return `
            <div style="display:flex;flex-direction:column;align-items:${meu ? 'flex-end' : 'flex-start'}">
                <div style="max-width:80%;background:${meu ? 'var(--primary-dim)' : 'var(--card-bg2)'};
                    border-radius:10px;padding:8px 12px;font-size:12px;line-height:1.5">
                    ${esc(m.mensagem)}
                </div>
                <div class="micro-txt txt-muted" style="margin-top:2px">${m.autor_nome || ''} · ${timeAgo(m.created_at)}</div>
            </div>`;
        }).join('');
    }

    // ── HELPERS DE UI ────────────────────────────────────────────
    function _voltarLista() {
        state.projetoAtivo = null;
        state.fases        = [];
        state.mensagens    = [];
        _renderHomeIfVisible();
    }

    function _abrirChat(obraId) {
        const el = document.getElementById(`chat-container-${obraId}`);
        if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }

    async function _sendChat(obraId) {
        const input = document.getElementById(`chat-input-${obraId}`);
        const msg   = input?.value?.trim();
        if (!msg) return;
        if (input) input.value = '';
        await enviarMensagem(obraId, msg);
    }

    async function _novaObra() {
        // Abre um modal simples de criação de obra
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.7);
            display:flex;align-items:center;justify-content:center;padding:20px;
        `;
        overlay.innerHTML = `
        <div style="background:var(--card-bg,#0c0e18);border-radius:16px;padding:24px;width:100%;max-width:420px;border:1px solid var(--border-mid)">
            <div style="font-size:15px;font-weight:800;margin-bottom:16px">🏗️ Nova Obra</div>
            <input id="nova-obra-nome" class="op-input" placeholder="Nome da obra *" style="width:100%;margin-bottom:8px">
            <input id="nova-obra-end"  class="op-input" placeholder="Endereço *" style="width:100%;margin-bottom:8px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                <input id="nova-obra-inicio" class="op-input" type="date" placeholder="Início">
                <input id="nova-obra-fim"    class="op-input" type="date" placeholder="Término">
            </div>
            <input id="nova-obra-orca" class="op-input" type="number" placeholder="Orçamento (R$)" style="width:100%;margin-bottom:16px">
            <div style="display:flex;gap:8px">
                <button class="pos-tag" style="flex:1;background:var(--card-bg2)" onclick="this.closest('[style]').remove()">Cancelar</button>
                <button class="pos-tag btn-action" style="flex:1" onclick="OBRA._criarObra(this)">Criar Obra</button>
            </div>
        </div>`;
        document.body.appendChild(overlay);
        document.getElementById('nova-obra-nome')?.focus();
        // Define datas padrão
        const hoje  = new Date().toISOString().split('T')[0];
        const fim30 = new Date(Date.now() + 30*864e5).toISOString().split('T')[0];
        const ini   = document.getElementById('nova-obra-inicio');
        const end   = document.getElementById('nova-obra-fim');
        if (ini) ini.value = hoje;
        if (end) end.value = fim30;
    }

    async function _criarObra(btn) {
        const nome  = document.getElementById('nova-obra-nome')?.value?.trim();
        const end   = document.getElementById('nova-obra-end')?.value?.trim();
        const ini   = document.getElementById('nova-obra-inicio')?.value;
        const fim   = document.getElementById('nova-obra-fim')?.value;
        const orca  = document.getElementById('nova-obra-orca')?.value;
        if (!nome || !end || !ini || !fim) {
            if (typeof K11Toast !== 'undefined') K11Toast('Preencha todos os campos obrigatórios.', 'warning');
            return;
        }
        if (btn) btn.textContent = 'Criando…';
        try {
            const res  = await K11Auth.fetch('/api/obramax/projects', {
                method: 'POST',
                body:   JSON.stringify({
                    name:               nome,
                    address:            end,
                    start_date:         ini,
                    predicted_end_date: fim,
                    budget:             parseFloat(orca) || 0,
                }),
            });
            const data = await res?.json();
            if (data?.ok || data?.success) {
                btn?.closest('[style]')?.remove();
                await loadObras();
                if (data.data?.id) await selectObra(data.data.id);
                else _renderHomeIfVisible();
                if (typeof K11Toast !== 'undefined') K11Toast('Obra criada com sucesso!', 'success');
            } else {
                throw new Error(data?.error || 'Erro ao criar obra');
            }
        } catch (e) {
            if (btn) btn.textContent = 'Criar Obra';
            if (typeof K11Toast !== 'undefined') K11Toast(e.message, 'error');
        }
    }

    return {
        state,
        init,
        loadObras,
        selectObra,
        renderHome,
        enviarMensagem,
        abrirOrcamento,
        _voltarLista,
        _abrirChat,
        _sendChat,
        _novaObra,
        _criarObra,
    };

})();

// Mescla os métodos de UI no objeto OBRA já existente (criado por k11-obra-actions.js)
// OBRA pode ser uma const global (não window.OBRA) — verificar ambos
const _obraTarget = (typeof OBRA !== 'undefined' && OBRA) || (typeof window.OBRA !== 'undefined' && window.OBRA) || null;

if (_obraTarget) {
    Object.assign(_obraTarget, _ObraUIModule);
    // Mesclar state sem sobrescrever keys existentes do actions
    if (_obraTarget.state && _ObraUIModule.state) {
        Object.assign(_obraTarget.state, _ObraUIModule.state);
    }
} else {
    // Fallback: nenhum OBRA encontrado — expor como window.OBRA
    window.OBRA = _ObraUIModule;
}

console.log('[K11 OBRA] ✅ Módulo de obras iniciado');
