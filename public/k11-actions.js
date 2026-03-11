/**
 * K11 OMNI ELITE — ACTIONS v4.0
 * ══════════════════════════════════════════════════
 * Funções chamadas pelo HTML via onclick="APP.actions.xxx()".
 * Modificam estado (APP.db, APP.ui) e geralmente chamam APP.view().
 *
 * v4.0 — Novidades:
 *   • setCrossBrandM1(nome) / setCrossBrandM2(nome) — aba Cross-Brand
 *   • clearAIAlerts() — zera badge de alertas da IA
 *
 * Depende de: k11-config.js, k11-utils.js, k11-ui.js
 */

'use strict';

const Actions = {

    animateValue(id, start, end, duration) {
        const obj = document.getElementById(id);
        if (!obj) return;
        if (APP.ui._rafIds[id]) cancelAnimationFrame(APP.ui._rafIds[id]);
        let startT = null;
        const step = (t) => {
            if (!startT) startT = t;
            const progress = Math.min((t - startT) / duration, 1);
            const eased    = 1 - Math.pow(1 - progress, 3);
            obj.innerHTML  = brl(eased * (end - start) + start);
            if (progress < 1) { APP.ui._rafIds[id] = requestAnimationFrame(step); }
            else { delete APP.ui._rafIds[id]; }
        };
        APP.ui._rafIds[id] = requestAnimationFrame(step);
    },

    rastrear() {
        const v   = document.getElementById('sk-r')?.value.trim();
        const res = document.getElementById('res-investigar');
        if (!v || !res) return;
        const p    = APP.db.produtos.find(x => x.id === v);
        const movs = APP.db.movimento.filter(m =>
            String(m?.['Produto'] ?? m?.['Nº do produto'] ?? '').trim() === v
        );
        if (!p) {
            res.innerHTML = `<div class="op-card centered margin-t-15">SKU NÃO ENCONTRADO</div>`;
            return;
        }

        const histHTML = movs.length
            ? [...movs].reverse().slice(0, 15).map((m, i) => `
                <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-color)">
                    <div style="display:flex;flex-direction:column;align-items:center;padding-top:3px">
                        <div style="width:8px;height:8px;border-radius:50%;background:${i === 0 ? 'var(--primary)' : 'var(--border-color)'}"></div>
                        ${i < 14 ? `<div style="width:1px;flex:1;background:var(--border-color);margin-top:3px"></div>` : ''}
                    </div>
                    <div style="flex:1">
                        <div class="flex-between">
                            <b class="micro-txt">${esc(m['Data de criação'] ?? m.Data ?? m['Data da confirmação'] ?? 'S/D')}</b>
                            <span class="micro-txt txt-primary">${esc(String(m['Quantidade confirmada'] ?? m['Qtd.prev.orig.UMA'] ?? ''))} un</span>
                        </div>
                        <div class="micro-txt txt-muted">DE: ${esc(m['Pos.depósito origem'] ?? m['PD origem'] ?? 'S/E')} → PARA: ${esc(m['Pos.depósito destino'] ?? m['PD destino'] ?? 'S/E')}</div>
                    </div>
                </div>`).join('')
            : '<div class="end-box-clean margin-t-5">Sem movimentos registrados.</div>';

        // Projeção de ruptura inline
        const cobHTML = p.diasCobertura !== null
            ? `<div style="padding:8px 12px;border-radius:6px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);margin-top:10px;font-size:11px">
                <span style="font-weight:700">⏱ Cobertura:</span> ~${p.diasCobertura}d
                ${p.dataRupturaEstimada ? `· ruptura estimada em <b>${esc(p.dataRupturaEstimada)}</b>` : ''}
                <span class="micro-txt txt-muted"> (${p.mediaVendaDia}/dia)</span>
               </div>`
            : '';

        res.innerHTML = `
            <div class="op-card margin-t-15">
                <b class="mono font-18">${esc(p.id)}</b>
                <div class="label margin-t-5">${esc(p.desc)}</div>
                ${cobHTML}
                <div class="label margin-t-15 txt-primary">ESTOQUE ATUAL</div>
                ${p.depositos.map(d =>
                    `<div class="end-box-clean mono micro-txt margin-t-5">
                        <span>${esc(d.tipo)} | <b>${esc(d.pos)}</b></span>
                        <b>${esc(String(d.q))} un</b>
                    </div>`
                ).join('')}
                <div class="label margin-t-15 txt-success">HISTÓRICO DE FLUXO</div>
                ${histHTML}
            </div>`;
    },

    addFila() {
        const s = document.getElementById('sk-in')?.value.trim();
        const q = safeFloat(document.getElementById('qt-in')?.value);
        const p = APP.db.produtos.find(x => x.id === s);
        if (!p) { APP.ui.toast('SKU não encontrado no estoque.', 'danger'); return; }
        if (q <= 0) { APP.ui.toast('Informe uma quantidade válida.', 'danger'); return; }
        APP.db.fila.push({ ...p, qtdSolicitada: q });
        APP._saveFilaToSession();
        APP.ui.toast(`${s} adicionado à fila.`, 'success');
        APP.view('operacional');
    },

    remFila(i) {
        APP.db.fila.splice(i, 1);
        APP._saveFilaToSession();
        APP.view('operacional');
    },

    limparFila() {
        showConfirm('Deseja limpar toda a fila de rotas?', () => {
            APP.db.fila = [];
            APP._saveFilaToSession();
            APP.view('operacional');
            APP.ui.toast('Fila limpa.', 'info');
        });
    },

    exportarFila() {
        if (APP.db.fila.length === 0) { APP.ui.toast('Fila vazia.', 'danger'); return; }
        const linhas = APP.db.fila.map((t, i) =>
            `${i + 1}. SKU ${t.id} — ${t.desc.substring(0, 30)} | QTD: ${t.qtdSolicitada}un`
        );
        const texto = `FILA K11 OMNI — ${new Date().toLocaleString('pt-BR')}\n${'─'.repeat(50)}\n${linhas.join('\n')}`;
        navigator.clipboard?.writeText(texto).then(() => {
            APP.ui.toast('Fila copiada para clipboard!', 'success');
        }).catch(() => {
            APP.ui.toast('Erro ao copiar. Navegador não suporta.', 'danger');
        });
    },

    toggleTask(id) {
        if (typeof APP.toggleTarefaServer === 'function') {
            APP.toggleTarefaServer(id);
        } else {
            const t = APP.db.tarefas.find(x => x.id === id);
            if (t) { t.done = !t.done; APP.view('detalheTarefas'); }
        }
    },

    toggleSkuMatrix() { APP.ui.skuMatrixAberta = !APP.ui.skuMatrixAberta; APP.view('dash'); },
    setSkuTab(tab)    { APP.ui.skuTab = tab; APP.view('dash'); },

    // ── CROSS-BRAND (v4) ──────────────────────────────────────────
    setCrossBrandM1(nome) { APP.ui.crossBrandM1 = nome; APP.view('dash'); },
    setCrossBrandM2(nome) { APP.ui.crossBrandM2 = nome; APP.view('dash'); },

    // ── BI — TABS E FILTROS ───────────────────────────────────────
    setBiTab(tab) {
        APP.ui.biTab = tab;
        APP.view('dash');
    },

    filtrarMarcas: debounce((v) => {
        APP.ui.buscaMarcas = v;
        APP.view('dash');
    }, 280),

    setFiltroMarcaSub(sub) {
        APP.ui.filtroMarcaSub = sub;
        APP.view('dash');
    },

    // ── BI — MODAL COMPARAÇÃO DE MARCAS POR PRODUTO ───────────────
    showComparacaoModal(dueloIdx) {
        const bi    = APP.rankings.bi;
        const duelo = bi?.marcas?.[dueloIdx];
        if (!duelo || !duelo.marcas || duelo.marcas.length < 2) {
            alert('Este produto não tem 2 marcas para comparar');
            return;
        }

        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;

        const esc_ = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        overlay.innerHTML = `
        <div style="padding:20px;border-radius:12px;background:var(--card-bg);border:1px solid var(--border);max-width:500px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <h2 style="margin:0;font-size:16px;color:var(--primary)">Comparar Marcas</h2>
                <button onclick="document.getElementById('modal-overlay').classList.remove('active')"
                    style="padding:4px 8px;border:none;background:var(--danger);color:white;border-radius:4px;cursor:pointer;font-size:12px">✕</button>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:16px">${esc_(duelo.base)}</div>
            <div style="margin-bottom:16px">
                <label style="display:block;font-size:10px;color:var(--text-muted);margin-bottom:4px;font-weight:700">MARCA 1</label>
                <select id="marca1-select" style="width:100%;padding:10px;border:1px solid var(--primary);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;font-weight:700;cursor:pointer">
                    ${duelo.marcas.map((m, idx) => `<option value="${idx}">${esc_(m.marca)}</option>`).join('')}
                </select>
            </div>
            <div style="margin-bottom:20px">
                <label style="display:block;font-size:10px;color:var(--text-muted);margin-bottom:4px;font-weight:700">MARCA 2</label>
                <select id="marca2-select" style="width:100%;padding:10px;border:1px solid var(--primary);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;font-weight:700;cursor:pointer">
                    ${duelo.marcas.map((m, idx) => `<option value="${idx}" ${idx === 1 ? 'selected' : ''}>${esc_(m.marca)}</option>`).join('')}
                </select>
            </div>
            <button onclick="(() => {
                const m1 = parseInt(document.getElementById('marca1-select').value);
                const m2 = parseInt(document.getElementById('marca2-select').value);
                if (m1 === m2) { alert('Selecione marcas DIFERENTES'); return; }
                document.getElementById('modal-overlay').classList.remove('active');
                setTimeout(() => APP.actions.abrirComparacaoTemporal(${dueloIdx}, m1, m2), 200);
            })()"
                style="width:100%;padding:12px;background:var(--primary);color:white;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px">
                🔄 COMPARAR MARCAS
            </button>
        </div>`;

        overlay.classList.add('active');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
    },

    abrirComparacaoTemporal(dueloIdx, marca1Idx, marca2Idx) {
        const bi    = APP.rankings.bi;
        const duelo = bi?.marcas?.[dueloIdx];
        if (!duelo || !duelo.marcas[marca1Idx] || !duelo.marcas[marca2Idx]) return;

        const m1 = duelo.marcas[marca1Idx];
        const m2 = duelo.marcas[marca2Idx];
        const comp = APP.rankings.bi.analisarComparacao(m1, { qAnterior: m1.qAnterior, marca: m1.marca }, m2, { qAnterior: m2.qAnterior, marca: m2.marca });
        if (!comp) return;

        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;

        const esc_ = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const dcol = (d) => d > 0 ? 'var(--success)' : d < 0 ? 'var(--danger)' : 'var(--text-muted)';

        overlay.innerHTML = `
        <div style="padding:20px;border-radius:12px;background:var(--card-bg);border:1px solid var(--border);max-width:500px;max-height:90vh;overflow-y:auto">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <h2 style="margin:0;font-size:18px;color:var(--primary)">📊 COMPARAÇÃO TEMPORAL</h2>
                <button onclick="document.getElementById('modal-overlay').classList.remove('active')"
                    style="padding:8px 12px;border:none;background:var(--danger);color:white;border-radius:6px;cursor:pointer">✕</button>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">${esc_(duelo.base)}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px">
                <div style="padding:16px;border-radius:8px;background:rgba(255,140,0,.08);border:1px solid rgba(255,140,0,.2)">
                    <div style="font-size:14px;font-weight:900;color:var(--primary);margin-bottom:12px">👑 ${esc_(comp.marca1)}</div>
                    <div style="font-size:20px;font-weight:900;font-family:var(--font-mono)">${comp.atual.m1} un</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:8px">Anterior: ${comp.anterior.m1} un</div>
                </div>
                <div style="padding:16px;border-radius:8px;background:rgba(100,100,100,.08);border:1px solid var(--border)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">DIFERENÇA</div>
                    <div style="font-size:24px;font-weight:900;font-family:var(--font-mono);color:${comp.atual.m1 > comp.atual.m2 ? 'var(--success)' : 'var(--danger)'}">${comp.atual.m1 > comp.atual.m2 ? '+' : ''}${comp.atual.diff} un</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:8px">${comp.atual.melhor}</div>
                </div>
                <div style="padding:16px;border-radius:8px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2)">
                    <div style="font-size:14px;font-weight:900;color:#3B82F6;margin-bottom:12px">🔵 ${esc_(comp.marca2)}</div>
                    <div style="font-size:20px;font-weight:900;font-family:var(--font-mono)">${comp.atual.m2} un</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:8px">Anterior: ${comp.anterior.m2} un</div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
                <div style="padding:16px;border-radius:8px;background:var(--bg);border:1px solid var(--border)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">VARIAÇÃO ${esc_(comp.marca1)}</div>
                    <div style="display:flex;align-items:baseline;gap:8px">
                        <span style="font-size:20px;font-weight:900;font-family:var(--font-mono);color:${dcol(comp.variacao.m1_abs)}">${comp.variacao.m1_abs > 0 ? '+' : ''}${comp.variacao.m1_abs}</span>
                        <span style="font-size:14px;color:${dcol(comp.variacao.m1_abs)};font-weight:700">${comp.variacao.m1_abs > 0 ? '+' : ''}${comp.variacao.m1_perc}%</span>
                    </div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:8px">${comp.trend.m1}</div>
                </div>
                <div style="padding:16px;border-radius:8px;background:var(--bg);border:1px solid var(--border)">
                    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">VARIAÇÃO ${esc_(comp.marca2)}</div>
                    <div style="display:flex;align-items:baseline;gap:8px">
                        <span style="font-size:20px;font-weight:900;font-family:var(--font-mono);color:${dcol(comp.variacao.m2_abs)}">${comp.variacao.m2_abs > 0 ? '+' : ''}${comp.variacao.m2_abs}</span>
                        <span style="font-size:14px;color:${dcol(comp.variacao.m2_abs)};font-weight:700">${comp.variacao.m2_abs > 0 ? '+' : ''}${comp.variacao.m2_perc}%</span>
                    </div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:8px">${comp.trend.m2}</div>
                </div>
            </div>
            <div style="padding:16px;border-radius:8px;background:linear-gradient(135deg,rgba(255,140,0,.2),rgba(255,140,0,.05));border:1px solid rgba(255,140,0,.3);text-align:center">
                <div style="font-size:14px;font-weight:900;color:var(--primary)">⭐ MELHOR PERFORMANCE</div>
                <div style="font-size:18px;font-weight:900;color:var(--primary);margin-top:8px">${comp.variacao.vencedor}</div>
            </div>
            <button onclick="document.getElementById('modal-overlay').classList.remove('active')"
                style="width:100%;padding:12px;margin-top:20px;border:none;background:var(--primary);color:white;border-radius:6px;font-weight:700;cursor:pointer">FECHAR</button>
        </div>`;

        overlay.classList.add('active');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
    },

    // ── MODAL DETALHES DE MARCA ───────────────────────────────────
    abrirDetalhesMarca(dueloIdxFiltrado, subFiltro, buscaRaw) {
        const bi     = APP.rankings.bi;
        const todos  = bi?.marcas ?? [];
        const skuIdx = bi?.skuParaDuelo ?? new Map();

        const busca = String(buscaRaw ?? '').trim().toUpperCase();
        const sub   = String(subFiltro ?? '');
        let duelos   = todos;

        if (busca.length >= 3) {
            const idxPorSku = [];
            skuIdx.forEach((indices, skuId) => {
                if (skuId.toUpperCase().includes(busca)) indices.forEach(i => idxPorSku.push(i));
            });
            if (idxPorSku.length) {
                duelos = [...new Set(idxPorSku)].map(i => todos[i]).filter(Boolean);
            } else {
                duelos = todos.filter(d =>
                    d.base.toUpperCase().includes(busca) ||
                    d.marcas.some(m => m.marca.toUpperCase().includes(busca))
                );
            }
        }
        if (sub) duelos = duelos.filter(d => d.sub === sub);

        const d = duelos[dueloIdxFiltrado];
        if (!d) return;

        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;

        const esc_ = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const CORES = ['#FF8C00','#3B82F6','#8B5CF6','#EC4899','#10B981','#F59E0B'];
        const total = d.totalVol || 1;
        const up    = d.totalPerc >= 0;
        const corTot = up ? '#10B981' : '#EF4444';

        const maxQ = Math.max(...d.marcas.map(m => m.qAtual), 1);
        const barrasHTML = d.marcas.map((m, i) => {
            const cor   = CORES[i] ?? '#666';
            const pct   = Math.round((m.qAtual / maxQ) * 100);
            const share = Math.round((m.qAtual / total) * 100);
            const corV  = m.diff > 0 ? '#10B981' : m.diff < 0 ? '#EF4444' : '#6B7280';
            return `
            <div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <div style="display:flex;align-items:center;gap:6px">
                        <span style="width:8px;height:8px;border-radius:50%;background:${cor};flex-shrink:0"></span>
                        <span style="font-size:11px;font-weight:800">${esc_(m.marca)}${i === 0 ? ' 👑' : ''}</span>
                    </div>
                    <div style="display:flex;gap:8px">
                        <span style="font-size:10px;font-weight:700;color:${cor}">${share}%</span>
                        <span style="font-size:10px;color:${corV}">${m.diff > 0 ? '+' : ''}${esc_(String(m.diff))} un</span>
                    </div>
                </div>
                <div style="height:8px;border-radius:4px;background:#1A1D2E;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${cor};border-radius:4px"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:3px">
                    <span style="font-size:9px;color:#6B7280">${m.qAtual} un · ant: ${Math.round(m.qAnterior)}</span>
                    <span style="font-size:9px;color:${corV}">${m.perc > 0 ? '+' : ''}${esc_(String(m.perc))}%</span>
                </div>
            </div>`;
        }).join('');

        // Donut SVG
        const R = 42, CX = 54, CY = 54, ESP = 16;
        let acumAngle = -Math.PI / 2;
        const fatias = d.marcas.slice(0, 4).map((m, i) => {
            const angulo = (m.qAtual / total) * 2 * Math.PI;
            const x1 = CX + R * Math.cos(acumAngle), y1 = CY + R * Math.sin(acumAngle);
            acumAngle += angulo;
            const x2 = CX + R * Math.cos(acumAngle), y2 = CY + R * Math.sin(acumAngle);
            const large = angulo > Math.PI ? 1 : 0;
            const ri = R - ESP;
            const xi1 = CX + ri * Math.cos(acumAngle - angulo), yi1 = CY + ri * Math.sin(acumAngle - angulo);
            const xi2 = CX + ri * Math.cos(acumAngle),           yi2 = CY + ri * Math.sin(acumAngle);
            if (angulo < 0.01) return '';
            const cor = CORES[i] ?? '#555';
            return `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} L${xi2.toFixed(1)},${yi2.toFixed(1)} A${ri},${ri} 0 ${large},0 ${xi1.toFixed(1)},${yi1.toFixed(1)} Z" fill="${cor}" opacity="0.92"/>`;
        }).join('');

        const donutSVG = `
        <svg viewBox="0 0 108 108" width="108" height="108" style="flex-shrink:0">
            <circle cx="${CX}" cy="${CY}" r="${R}" fill="#111320" stroke="#1A1D2E" stroke-width="1"/>
            ${fatias}
            <circle cx="${CX}" cy="${CY}" r="${R - ESP - 1}" fill="#111320"/>
            <text x="${CX}" y="${CY - 5}" text-anchor="middle" fill="#9CA3AF" font-size="7" font-family="Inter,sans-serif">TOTAL</text>
            <text x="${CX}" y="${CY + 7}" text-anchor="middle" fill="#F3F4F6" font-size="10" font-weight="700" font-family="'JetBrains Mono',monospace">${d.totalVol}</text>
            <text x="${CX}" y="${CY + 18}" text-anchor="middle" fill="${corTot}" font-size="8" font-weight="700" font-family="'JetBrains Mono',monospace">${up ? '+' : ''}${esc_(String(d.totalPerc))}%</text>
        </svg>`;

        const legendaHTML = d.marcas.slice(0, 4).map((m, i) => {
            const share = Math.round((m.qAtual / total) * 100);
            const cor   = CORES[i] ?? '#555';
            return `<div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
                <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${cor};flex-shrink:0"></span>
                <span style="font-size:10px;font-weight:700">${esc_(m.marca)}</span>
                <span style="font-size:10px;color:#6B7280;margin-left:auto">${share}%</span>
            </div>`;
        }).join('');

        overlay.innerHTML = `
        <div class="modal-box" style="max-width:460px;width:100%;max-height:90vh;overflow-y:auto;padding:0;background:#111320;border:1px solid #232642">
            <div style="padding:16px 18px 14px;border-bottom:1px solid #1A1D2E;position:sticky;top:0;background:#111320;z-index:1">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <div>
                        <div style="font-size:9px;font-weight:800;color:#6B7280;letter-spacing:1.5px;margin-bottom:4px">DUELO DE MARCAS</div>
                        <div style="font-size:13px;font-weight:900">${esc_(d.base.substring(0, 40))}</div>
                        <div style="font-size:10px;color:#6B7280;margin-top:3px">${esc_(d.sub)}</div>
                    </div>
                    <button onclick="document.getElementById('modal-overlay').classList.remove('active')"
                        style="background:none;border:none;color:#6B7280;font-size:20px;cursor:pointer;line-height:1;margin-left:8px">✕</button>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px">
                    ${[['VOLUME', d.totalVol + ' un', '#F3F4F6'], ['VARIAÇÃO', (up ? '+' : '') + d.totalPerc + '%', corTot], ['MARCAS', d.marcas.length + '', '#A78BFA']].map(([lbl, val, cor]) =>
                        `<div style="padding:8px 10px;border-radius:7px;background:#0D0F18;border:1px solid #1A1D2E">
                            <div style="font-size:8px;font-weight:800;color:#6B7280">${lbl}</div>
                            <div style="font-size:13px;font-weight:900;font-family:'JetBrains Mono',monospace;color:${cor}">${val}</div>
                         </div>`).join('')}
                </div>
            </div>
            <div style="padding:16px 18px;border-bottom:1px solid #1A1D2E">
                <div style="font-size:9px;font-weight:800;color:#6B7280;margin-bottom:12px">SHARE DE MERCADO</div>
                <div style="display:flex;gap:16px;align-items:center">
                    ${donutSVG}
                    <div style="flex:1">${legendaHTML}</div>
                </div>
            </div>
            <div style="padding:16px 18px">
                <div style="font-size:9px;font-weight:800;color:#6B7280;margin-bottom:12px">PERFORMANCE POR MARCA</div>
                ${barrasHTML}
            </div>
        </div>`;

        overlay.classList.add('active');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
    },

    abrirSubsecao(subNome) {
        const bi  = APP.rankings.bi;
        const sub = bi?.subsecoes?.find(s => s.sub === subNome);
        if (!sub) return;

        const overlay = document.getElementById('modal-overlay');
        if (!overlay) return;

        const esc_ = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const up   = sub.perc >= 0;
        const cor  = up ? 'var(--success)' : 'var(--danger)';

        const rowSku = (r, sinal) => {
            const c = sinal > 0 ? 'var(--success)' : 'var(--danger)';
            return `<div style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                <b class="mono" style="font-size:10px;color:var(--primary)">${esc_(r.id)}</b>
                <div>
                    <div style="font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">${esc_((r.desc ?? '').substring(0, 28))}</div>
                    ${r.marca && r.marca !== 'N/ID' ? `<span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(255,140,0,.1);color:var(--primary)">${esc_(r.marca)}</span>` : ''}
                </div>
                <div style="text-align:right">
                    <div style="font-size:12px;font-weight:800;font-family:var(--font-mono);color:${c}">${r.diff > 0 ? '+' : ''}${esc_(String(r.diff))} un</div>
                    <div style="font-size:9px;color:${c}">${r.perc > 0 ? '+' : ''}${esc_(String(r.perc))}%</div>
                </div>
            </div>`;
        };

        const growthHTML  = (sub.topGrowth  ?? []).map(r => rowSku(r,  1)).join('') || '<div class="micro-txt txt-muted">Nenhum SKU em alta</div>';
        const declineHTML = (sub.topDecline ?? []).map(r => rowSku(r, -1)).join('') || '<div class="micro-txt txt-muted">Nenhum SKU em queda</div>';

        overlay.innerHTML = `
            <div class="modal-box" style="max-width:420px;width:100%;max-height:88vh;overflow-y:auto;padding:0">
                <div style="padding:18px 18px 14px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--card-bg2);z-index:1">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
                        <div>
                            <div class="label" style="margin-bottom:4px">SUBSEÇÃO</div>
                            <div style="font-size:13px;font-weight:800">${esc_(sub.sub)}</div>
                        </div>
                        <button onclick="document.getElementById('modal-overlay').classList.remove('active')"
                            style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer">✕</button>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px">
                        ${[['ATUAL', sub.qAtual + ' un', 'var(--text-main)'], ['ANTERIOR', Math.round(sub.qAnterior) + ' un', 'var(--text-main)'], ['VARIAÇÃO', (up ? '+' : '') + sub.perc + '%', cor]].map(([lbl, val, c]) =>
                            `<div style="padding:8px 10px;border-radius:7px;background:var(--bg);border:1px solid var(--border)">
                                <div class="label">${lbl}</div>
                                <div style="font-size:13px;font-weight:800;font-family:var(--font-mono);color:${c}">${val}</div>
                             </div>`).join('')}
                    </div>
                </div>
                <div style="padding:14px 18px">
                    <div class="label txt-success" style="margin-bottom:8px">▲ TOP ALTAS</div>
                    ${growthHTML}
                    <div class="label txt-danger" style="margin-top:16px;margin-bottom:8px">▼ TOP QUEDAS</div>
                    ${declineHTML}
                </div>
            </div>`;

        overlay.classList.add('active');
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
    },

    // ── AÇÕES ────────────────────────────────────────────────────
    toggleAcao(i) {
        APP.ui._acoesState ??= [];
        const acoes = APP._gerarAcoesPrioritarias();
        const acao  = acoes[i];
        if (!acao) return;
        const idx = APP.ui._acoesState.indexOf(acao.id);
        if (idx === -1) APP.ui._acoesState.push(acao.id);
        else            APP.ui._acoesState.splice(idx, 1);
        APP.view('acoesPrioritarias');
    },

    toggleRanking() { APP.ui.rankingAberto = !APP.ui.rankingAberto; APP.view('dash'); },

    mudarAlvo(l) {
        APP.ui.pdvAlvo = l;
        APP.processarDueloAqua();
        APP.view('projetor');
    },

    setFiltroEstoque(f) { APP.ui.filtroEstoque = f; APP.view('estoque'); },

    filtrarEstoque: debounce((v) => { APP.ui.buscaEstoque = v; APP.view('estoque'); }, DEBOUNCE_DELAY_MS),
    filtrarDuelo:   debounce((v) => { APP.ui.buscaDuelo   = v; APP.view('projetor'); }, DEBOUNCE_DELAY_MS),

    preencher(id) {
        APP.view('operacional');
        setTimeout(() => {
            const input = document.getElementById('sk-in');
            if (input) { input.value = id; document.getElementById('qt-in')?.focus(); }
        }, 150);
    },

    // ── IA — limpar badge de alertas ─────────────────────────────
    clearAIAlerts() {
        APP._aiAlertsCount   = 0;
        window.K11_ALERTS_UNREAD = 0;
        APP._updateNavBadges();
        // Notifica servidor que alertas foram lidos (melhor esforço)
        APP._serverFetch('/api/ai/v3/alerts/read', { method: 'POST' }).catch(() => {});
    },

    // ── CHART TOOLTIP ─────────────────────────────────────────────
    _chartTooltip(label, val, event) {
        const tip = document.getElementById('chart-tooltip');
        if (!tip) return;
        const hidraVal = APP.rankings.benchmarking.hidraulica;
        const diff = label === 'HIDRÁULICA' ? null : val - hidraVal;
        const diffStr = diff !== null
            ? (diff > 0 ? `<span style="color:#EF4444">+${diff}% vs HIDRA</span>` : `<span style="color:#10B981">${diff}% vs HIDRA</span>`)
            : '<span style="color:var(--primary)">referência da hidráulica</span>';
        tip.innerHTML = `<b>${esc(label)}</b> · ${val}%<br>${diffStr}`;
        tip.style.display = 'block';
        clearTimeout(tip._closeTimer);
        tip._closeTimer = setTimeout(() => { tip.style.display = 'none'; }, 2500);
    },
};
