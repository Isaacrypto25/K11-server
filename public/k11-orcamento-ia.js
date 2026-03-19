/**
 * K11 OMNI — ORÇAMENTO IA v1.0
 * ════════════════════════════════════════════════════════════════
 * Motor de orçamento instantâneo por IA.
 * Aceita: foto, PDF, texto livre, planilha descrita.
 * Retorna: orçamento itemizado com materiais, mão de obra e prazo.
 */
'use strict';

const K11OrcamentoIA = (() => {

    let _obraId    = null;
    let _resultado = null;
    let _loading   = false;

    // ── ABRIR MODAL ──────────────────────────────────────────────
    function open(obraId) {
        _obraId = obraId || OBRA?.state?.projetoAtivo?.id || null;
        _render();
    }

    function close() {
        const el = document.getElementById('orcamento-ia-overlay');
        if (el) { el.classList.remove('open'); setTimeout(() => el.remove(), 320); }
        document.body.style.overflow = '';
    }

    // ── RENDER PRINCIPAL ─────────────────────────────────────────
    function _render() {
        // Remove overlay anterior
        document.getElementById('orcamento-ia-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id        = 'orcamento-ia-overlay';
        overlay.className = 'oia-overlay';
        overlay.innerHTML = `
        <div class="oia-modal" id="oia-modal">
            <div class="oia-header">
                <div>
                    <div class="oia-badge">🤖 IA</div>
                    <div class="oia-title">Orçamento Inteligente</div>
                    <div class="oia-sub">Envie foto, PDF, planilha ou descreva o serviço</div>
                </div>
                <button class="oia-close" onclick="K11OrcamentoIA.close()">✕</button>
            </div>

            <div class="oia-body" id="oia-body">
                ${_renderInput()}
            </div>
        </div>`;

        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => overlay.classList.add('open'));

        // Setup drag & drop
        const dropzone = document.getElementById('oia-dropzone');
        if (dropzone) {
            dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
            dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
            dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('drag-over'); _handleFiles(e.dataTransfer.files); });
        }
    }

    function _renderInput() {
        return `
        <div class="oia-section">
            <div class="oia-label">DESCREVA O SERVIÇO</div>
            <textarea id="oia-texto" class="oia-textarea"
                placeholder="Ex: Reforma de banheiro 6m² — troca de piso, revestimento, louças e metais. Padrão médio."
                rows="3"></textarea>
        </div>

        <div class="oia-divider"><span>ou anexe um arquivo</span></div>

        <div class="oia-dropzone" id="oia-dropzone" onclick="document.getElementById('oia-file-input').click()">
            <div class="oia-drop-icon">📎</div>
            <div class="oia-drop-title">Arraste ou clique para enviar</div>
            <div class="oia-drop-sub">Foto, PDF, Excel, Word, texto</div>
            <div id="oia-file-name" class="oia-file-name"></div>
            <input id="oia-file-input" type="file" style="display:none"
                accept="image/*,.pdf,.xlsx,.xls,.csv,.txt,.docx"
                onchange="K11OrcamentoIA._handleFileInput(this)">
        </div>

        <div class="oia-config-row">
            <div class="oia-config-item">
                <div class="oia-label">MARGEM (%)</div>
                <input id="oia-margem" type="number" class="oia-input-sm" value="25" min="0" max="100">
            </div>
            <div class="oia-config-item">
                <div class="oia-label">PADRÃO</div>
                <select id="oia-padrao" class="oia-input-sm">
                    <option value="economico">Econômico</option>
                    <option value="medio" selected>Médio</option>
                    <option value="alto">Alto</option>
                    <option value="luxo">Luxo</option>
                </select>
            </div>
            <div class="oia-config-item">
                <div class="oia-label">ÁREA (m²)</div>
                <input id="oia-area" type="number" class="oia-input-sm" placeholder="Ex: 15">
            </div>
        </div>

        <button class="oia-btn-gerar" onclick="K11OrcamentoIA.gerar()">
            <span id="oia-btn-text">⚡ GERAR ORÇAMENTO COM IA</span>
        </button>`;
    }

    // ── HANDLE FILES ─────────────────────────────────────────────
    function _handleFiles(files) {
        if (!files || !files[0]) return;
        const file = files[0];
        const nameEl = document.getElementById('oia-file-name');
        if (nameEl) nameEl.textContent = `📎 ${file.name} (${(file.size/1024).toFixed(0)}KB)`;
        // Armazena na instância para envio
        K11OrcamentoIA._pendingFile = file;
    }

    function _handleFileInput(input) {
        _handleFiles(input.files);
    }

    // ── GERAR ORÇAMENTO ──────────────────────────────────────────
    async function gerar() {
        if (_loading) return;

        const texto  = document.getElementById('oia-texto')?.value?.trim();
        const margem = parseInt(document.getElementById('oia-margem')?.value || '25');
        const padrao = document.getElementById('oia-padrao')?.value || 'medio';
        const area   = parseFloat(document.getElementById('oia-area')?.value) || null;
        const file   = K11OrcamentoIA._pendingFile;

        if (!texto && !file) {
            if (typeof APP !== 'undefined') APP.ui.toast('Descreva o serviço ou envie um arquivo', 'danger');
            return;
        }

        _loading = true;
        const btn = document.getElementById('oia-btn-text');
        if (btn) btn.textContent = '⏳ Analisando com IA...';

        try {
            const formData = new FormData();
            formData.append('texto', texto || '');
            formData.append('margem', margem);
            formData.append('padrao', padrao);
            if (area)     formData.append('area', area);
            if (_obraId)  formData.append('obra_id', _obraId);
            if (file)     formData.append('arquivo', file);

            const token = typeof K11Auth !== 'undefined' ? K11Auth.getToken() : null;
            const res   = await fetch(`${K11_SERVER_URL}/api/orcamento/gerar`, {
                method:  'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body:    formData,
                signal:  AbortSignal.timeout(60000),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const data = await res.json();
            _resultado = data.orcamento;
            _renderResultado(data.orcamento);

        } catch (e) {
            if (typeof APP !== 'undefined') APP.ui.toast('Erro na IA: ' + e.message, 'danger');
            if (btn) btn.textContent = '⚡ GERAR ORÇAMENTO COM IA';
        } finally {
            _loading = false;
        }
    }

    // ── RENDERIZAR RESULTADO ─────────────────────────────────────
    function _renderResultado(orc) {
        const body = document.getElementById('oia-body');
        if (!body) return;

        const totalMaterial  = (orc.itens || []).filter(i => i.tipo === 'material').reduce((a, i) => a + i.total, 0);
        const totalServico   = (orc.itens || []).filter(i => i.tipo === 'servico').reduce((a, i) => a + i.total, 0);
        const totalGeral     = orc.total || (totalMaterial + totalServico);
        const fmt = v => v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
        const fmtN = v => v?.toLocaleString('pt-BR') || '—';

        const itensHTML = (orc.itens || []).map(item => `
        <div class="oia-item ${item.tipo}">
            <div class="oia-item-info">
                <div class="oia-item-nome">${_esc(item.nome)}</div>
                <div class="oia-item-det">${_esc(item.especificacao || '')} ${item.quantidade ? `· ${fmtN(item.quantidade)} ${item.unidade||'un'}` : ''}</div>
            </div>
            <div class="oia-item-right">
                <div class="oia-item-val">${fmt(item.total)}</div>
                ${item.disponivel_estoque ? '<div class="oia-stock-badge">✅ Em estoque</div>' : ''}
            </div>
        </div>`).join('');

        body.innerHTML = `
        <div class="oia-result-header">
            <div class="oia-result-title">📋 Orçamento Gerado</div>
            <div class="oia-result-sub">${_esc(orc.descricao || '')} ${orc.prazo_dias ? `· Prazo: ${orc.prazo_dias} dias` : ''}</div>
        </div>

        <div class="oia-totais">
            <div class="oia-total-card">
                <div class="oia-total-lbl">MATERIAIS</div>
                <div class="oia-total-val">${fmt(totalMaterial)}</div>
            </div>
            <div class="oia-total-card">
                <div class="oia-total-lbl">MÃO DE OBRA</div>
                <div class="oia-total-val">${fmt(totalServico)}</div>
            </div>
            <div class="oia-total-card destaque">
                <div class="oia-total-lbl">TOTAL GERAL</div>
                <div class="oia-total-val">${fmt(totalGeral)}</div>
            </div>
        </div>

        <div class="oia-section">
            <div class="oia-label">ITENS DETALHADOS</div>
            <div class="oia-itens-list">${itensHTML}</div>
        </div>

        ${orc.alertas?.length ? `
        <div class="oia-alertas">
            ${orc.alertas.map(a => `<div class="oia-alerta">⚠️ ${_esc(a)}</div>`).join('')}
        </div>` : ''}

        <div class="oia-actions-row">
            <button class="oia-btn-sec" onclick="K11OrcamentoIA._refazer()">↩ Refazer</button>
            <button class="oia-btn-sec" onclick="K11OrcamentoIA._salvarOrcamento()">💾 Salvar</button>
            <button class="oia-btn-pdf" onclick="K11OrcamentoIA._exportarPDF()">📄 Exportar PDF</button>
            ${_obraId ? `<button class="oia-btn-primary" onclick="K11OrcamentoIA._solicitarCompras()">🛒 Solicitar Compras</button>` : ''}
        </div>`;
    }

    // ── AÇÕES DO RESULTADO ───────────────────────────────────────
    function _refazer() {
        _resultado = null;
        K11OrcamentoIA._pendingFile = null;
        const body = document.getElementById('oia-body');
        if (body) body.innerHTML = _renderInput();
        // Re-bind dropzone
        const dz = document.getElementById('oia-dropzone');
        if (dz) {
            dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
            dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
            dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag-over'); _handleFiles(e.dataTransfer.files); });
        }
    }

    async function _salvarOrcamento() {
        if (!_resultado || !_obraId) {
            if (typeof APP !== 'undefined') APP.ui.toast('Vincule a uma obra para salvar', 'info');
            return;
        }
        try {
            const token = typeof K11Auth !== 'undefined' ? K11Auth.getToken() : null;
            await fetch(`${K11_SERVER_URL}/api/orcamento/salvar`, {
                method:  'POST',
                headers: { 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) },
                body:    JSON.stringify({ obra_id: _obraId, orcamento: _resultado }),
            });
            if (typeof APP !== 'undefined') APP.ui.toast('Orçamento salvo! ✅', 'success');
        } catch(e) {
            if (typeof APP !== 'undefined') APP.ui.toast('Erro ao salvar', 'danger');
        }
    }

    async function _exportarPDF() {
        if (!_resultado) return;
        if (typeof APP !== 'undefined') APP.ui.toast('Gerando PDF...', 'info');
        try {
            const token = typeof K11Auth !== 'undefined' ? K11Auth.getToken() : null;
            const res = await fetch(`${K11_SERVER_URL}/api/orcamento/pdf`, {
                method:  'POST',
                headers: { 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) },
                body:    JSON.stringify({ orcamento: _resultado }),
            });
            if (res.ok) {
                const blob = await res.blob();
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = `orcamento-k11-${Date.now()}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch(e) {
            if (typeof APP !== 'undefined') APP.ui.toast('Erro ao gerar PDF', 'danger');
        }
    }

    async function _solicitarCompras() {
        if (!_resultado || !_obraId) return;
        const materiais = (_resultado.itens || []).filter(i => i.tipo === 'material' && !i.disponivel_estoque);
        if (!materiais.length) {
            if (typeof APP !== 'undefined') APP.ui.toast('Todos os materiais já estão no estoque!', 'success');
            return;
        }
        if (typeof APP !== 'undefined') APP.ui.toast(`Criando pedido com ${materiais.length} itens...`, 'info');
        try {
            const token = typeof K11Auth !== 'undefined' ? K11Auth.getToken() : null;
            await fetch(`${K11_SERVER_URL}/api/obramax/orders`, {
                method:  'POST',
                headers: { 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) },
                body:    JSON.stringify({
                    project_id: _obraId,
                    items: materiais.map(m => ({ sku: m.sku || 'CUSTOM', quantity: m.quantidade || 1 })),
                }),
            });
            if (typeof APP !== 'undefined') APP.ui.toast('Pedido de compra criado! 🛒', 'success');
            close();
        } catch(e) {
            if (typeof APP !== 'undefined') APP.ui.toast('Erro ao criar pedido', 'danger');
        }
    }

    function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    return { open, close, gerar, _refazer, _salvarOrcamento, _exportarPDF, _solicitarCompras, _handleFileInput, _pendingFile: null };
})();

window.K11OrcamentoIA = K11OrcamentoIA;
