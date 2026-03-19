/**
 * K11 OMNI ELITE — VIEWS (Templates HTML)
 * ════════════════════════════════════════
 * Cada método retorna uma string HTML que é inserida no #stage.
 * Nenhuma view tem efeitos colaterais — apenas lê APP.db e APP.rankings.
 *
 * Depende de: k11-config.js, k11-utils.js
 *
 * Estrutura:
 *   _skeleton()           → Placeholder animado durante carregamento
 *   dash()                → Dashboard principal com KPIs e charts
 *   acoesPrioritarias()   → Plano de ação do dia
 *   detalheInconsistencias() → SKUs com venda e estoque zero
 *   consultiveReport()    → Relatório consultivo por cor
 *   detalheUC()           → Gargalos de UC com posições detalhadas
 *   operacional()         → Fila de rotas e picker
 *   rastreio()            → Investigar SKU individual
 *   projetor()            → Duelo de vendas vs concorrentes
 *   estoque()             → Listagem filtrada de estoque
 *   detalheTarefas()      → Tarefas do turno
 *   recebimento()         → Agenda de recebimentos de fornecedores
 */

'use strict';

const Views = {


        _skeleton() {
            const sk = (w, h = 18) => `<div class="skeleton" style="width:${w};height:${h}px;border-radius:4px;margin-bottom:8px;"></div>`;
            return `
                <div class="op-card">${sk('60%', 12)} ${sk('100%', 48)} ${sk('80%')} ${sk('90%')}</div>
                <div class="op-card margin-t-15">${sk('50%', 12)} ${sk('100%', 120)}</div>
                <div class="kpi-row margin-t-15">
                    <div class="kpi-btn">${sk('60px', 60)}</div>
                    <div class="kpi-btn">${sk('60px', 60)}</div>
                    <div class="kpi-btn">${sk('60px', 60)}</div>
                </div>`;
        },

        dash() {
            // ── DESKTOP BRANCH: usa Brain v5 com Chart.js real ──────
            if (typeof K11BrainV5 !== 'undefined' && K11BrainV5.isDesktop()) {
                const stage = document.getElementById('stage');
                if (stage) {
                    K11BrainV5.renderDashDesktop(stage);
                    return '';  // brain-v5 escreve direto no stage
                }
            }
            const vT         = APP.db.produtos.reduce((a, b) => a + b.valTotal, 0);
            const percT      = APP.db.tarefas.length > 0 ? Math.round((APP.db.tarefas.filter(t => t.done).length / APP.db.tarefas.length) * 100) : 0;
            const totalUC    = APP.db.ucGlobal.length;
            const vYellow    = APP.rankings.meta.valTotalYellow;
            const vRed       = APP.rankings.meta.valTotalRed;
            const st         = APP.rankings.pieStats;
            const pRed       = Math.round((st.red    / st.total) * 100);
            const pYellow    = Math.round((st.yellow / st.total) * 100);
            const pGreen     = 100 - pRed - pYellow;
            const b          = APP.rankings.benchmarking;
            const inconsCount = APP.rankings.meta.inconsistentes.length;
            const pdvsSorted = [
                { name: 'MESQUITA',    key: 'mesquita',    val: b.mesquita,    gap: 100 - b.mesquita },
                { name: 'JACAREPAGUÁ', key: 'jacarepagua', val: b.jacarepagua, gap: 100 - b.jacarepagua },
                { name: 'BENFICA',     key: 'benfica',     val: b.benfica,     gap: 100 - b.benfica },
            ].sort((a, z) => z.gap - a.gap);
            const worstPDV  = pdvsSorted[0];
            const topDrag   = APP.rankings.duelos[0];
            const mediaGeral = Math.round((b.mesquita + b.jacarepagua + b.benfica) / 3);
            const deltaHidra = b.hidraulica - mediaGeral;
            const pieGradient = `conic-gradient(var(--success) 0% ${pGreen}%, var(--warning) ${pGreen}% ${pGreen + pYellow}%, var(--danger) ${pGreen + pYellow}% 100%)`;

            // Chart SVG
            const W=460, H=200, PL=28, PR=16, PT=32, PB=28;
            const cw=W-PL-PR, ch=H-PT-PB;
            const yMax = Math.max(100, Math.ceil(Math.max(b.mesquita, b.jacarepagua, b.benfica, b.hidraulica)/25)*25);
            const cy   = v => PT + ch - (Math.min(Math.max(v,0),yMax)/yMax)*ch;
            const concorrentes = [{ label:'MESQ', val:b.mesquita }, { label:'JACA', val:b.jacarepagua }, { label:'BENF', val:b.benfica }];
            const BAR_W = 36, barGap = cw*0.66/2;
            const cyMedia = cy(mediaGeral);
            const mediaX2 = PL + cw*0.66 + BAR_W/2;
            const hidraX  = PL + cw*0.82;
            const hidraBH = (b.hidraulica/yMax)*ch;
            const hidraY  = PT + ch - hidraBH;
            const hidraBW = 46;
            const dcol    = deltaHidra >= 0 ? 'var(--success)' : 'var(--danger)';
            const dsym    = deltaHidra >= 0 ? '▲' : '▼';

            const gradeHTML = [0,25,50,75,100].filter(v=>v<=yMax).map(v => {
                const y = cy(v);
                return `<line x1="${PL-4}" y1="${y}" x2="${W-PR}" y2="${y}" stroke="var(--border-color)" stroke-dasharray="${v%50===0?'3,3':'2,6'}" stroke-opacity="${v%50===0?.22:.09}"/>
                        <text x="${PL-6}" y="${y+3}" text-anchor="end" font-family="monospace" font-size="6" fill="var(--text-muted)" opacity="0.5">${v}</text>`;
            }).join('');

            const barsHTML = concorrentes.map((c, i) => {
                const x = PL + i*barGap, bH = (c.val/yMax)*ch, y = PT + ch - bH;
                const isMax = c.val === Math.max(...concorrentes.map(d=>d.val));
                const lY = y > PT+14 ? y-5 : y+12;
                return `<rect x="${x-BAR_W/2}" y="${y}" width="${BAR_W}" height="${bH}"
                              fill="${isMax?'rgba(255,140,0,0.22)':'rgba(255,140,0,0.08)'}"
                              stroke="${isMax?'rgba(255,140,0,0.5)':'rgba(255,140,0,0.18)'}"
                              stroke-width="0.8" rx="3" style="cursor:pointer"
                              onclick="APP.actions._chartTooltip('${c.label}',${c.val},event)"/>
                        <text x="${x}" y="${lY}" text-anchor="middle" font-family="monospace" font-size="7.5" fill="var(--primary)" font-weight="${isMax?'bold':'normal'}" opacity="${isMax?0.9:0.6}">${c.val}%</text>
                        <text x="${x}" y="${PT+ch+14}" text-anchor="middle" font-family="monospace" font-size="7" fill="var(--text-muted)" letter-spacing="0.5">${c.label}</text>`;
            }).join('');

            const hidraHTML = `
                <defs>
                    <linearGradient id="hbg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="var(--primary)" stop-opacity="0.95"/>
                        <stop offset="100%" stop-color="var(--primary)" stop-opacity="0.18"/>
                    </linearGradient>
                    <filter id="ghh" x="-80%" y="-80%" width="260%" height="260%">
                        <feGaussianBlur stdDeviation="5" result="b"/>
                        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                </defs>
                <line x1="${PL-10}" y1="${cyMedia}" x2="${mediaX2}" y2="${cyMedia}" stroke="var(--success)" stroke-width="1" stroke-dasharray="5,3" stroke-opacity="0.45"/>
                <text x="${PL-10}" y="${cyMedia-4}" font-family="monospace" font-size="6.5" fill="var(--success)" opacity="0.65">ø${mediaGeral}%</text>
                <line x1="${hidraX+hidraBW/2+8}" y1="${cyMedia}" x2="${hidraX+hidraBW/2+8}" y2="${cy(b.hidraulica)}" stroke="${dcol}" stroke-width="1.5" stroke-opacity="0.75"/>
                <text x="${hidraX+hidraBW/2+14}" y="${(cyMedia+cy(b.hidraulica))/2+3}" font-family="monospace" font-size="8" fill="${dcol}" font-weight="bold">${dsym}${Math.abs(deltaHidra)}</text>
                <rect x="${hidraX-hidraBW/2}" y="${hidraY}" width="${hidraBW}" height="${hidraBH}" fill="url(#hbg)" stroke="var(--primary)" stroke-width="1.2" rx="4" filter="url(#ghh)" style="cursor:pointer" onclick="APP.actions._chartTooltip('HIDRÁULICA',${b.hidraulica},event)"/>
                <text x="${hidraX}" y="${hidraY-8}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="bold" fill="var(--primary)" filter="url(#ghh)">${b.hidraulica}%</text>
                <circle cx="${hidraX}" cy="${hidraY-1}" r="20" fill="none" stroke="var(--primary)" stroke-width="0.8" stroke-opacity="0.18" class="pulse-ring"/>
                <text x="${hidraX}" y="${PT+ch+14}" text-anchor="middle" font-family="monospace" font-size="8" font-weight="bold" letter-spacing="1.2" fill="var(--primary)">HIDRA</text>`;

            const topDrags  = APP.rankings.duelos.slice(0, 4);
            const topBoosts = APP.rankings.duelos.filter(d => d.dominando).slice(0, 3);
            const acoesPrio = APP._gerarAcoesPrioritarias();

            setTimeout(() => {
                APP.actions.animateValue('val-inv',    0, vT,      ANIM_DURATION_MS);
                APP.actions.animateValue('val-ganhos', 0, vYellow, ANIM_DURATION_MS);
                APP.actions.animateValue('val-red',    0, vRed,    ANIM_DURATION_MS);
            }, 50);
            // Animar os arcos KPI após render
            setTimeout(() => {
                const circ = 2 * Math.PI * 30;
                const pctCheck = percT;
                const pctUC    = totalUC > 0 ? Math.min(100, Math.round((totalUC / 200) * 100)) : 0;
                const pctAcoes = acoesPrio.length > 0 ? Math.min(100, Math.round((acoesPrio.length / 10) * 100)) : 0;
                [['arc_ck', pctCheck], ['arc_uc', pctUC], ['arc_ac', pctAcoes]].forEach(([id, pct], i) => {
                    const el = document.getElementById(id);
                    if (el) setTimeout(() => { el.style.strokeDashoffset = circ * (1 - pct / 100); }, i * 120);
                });
            }, 100);

            return `
                <!-- BANNER -->
                <div class="op-card margin-b-0" style="border-left:3px solid var(--danger);background:linear-gradient(135deg,rgba(239,68,68,0.06) 0%,transparent 100%);cursor:pointer" onclick="APP.view('acoesPrioritarias')">
                    <div style="display:flex;align-items:center;gap:10px">
                        <span style="font-size:18px;flex-shrink:0">⚡</span>
                        <div style="flex:1;min-width:0">
                            <div class="micro-txt txt-danger" style="letter-spacing:1.5px;margin-bottom:2px">AÇÃO IMEDIATA</div>
                            <div class="bold-desc" style="font-size:11px;line-height:1.3">
                                ${worstPDV ? `${esc(worstPDV.name)} com gap de ${worstPDV.gap}pts` : 'Nenhum gap crítico detectado'}
                                ${topDrag  ? ` · ${esc(topDrag.id)} puxa resultado para baixo` : ''}
                            </div>
                        </div>
                        <span class="txt-danger" style="font-size:16px;flex-shrink:0">→</span>
                    </div>
                </div>

                <!-- PIE SAÚDE PKL -->
                <div class="op-card border-warning margin-t-10">
                    <div class="flex-between align-start">
                        <div style="flex:1">
                            <div class="label txt-warning">COMPOSIÇÃO DE SAÚDE PKL</div>
                            <div class="mono font-18" style="margin:5px 0">R$ <span id="val-inv">0</span></div>
                            <div style="display:flex;gap:10px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
                                <div class="micro-txt txt-warning bold-desc">CRÍTICO: R$ <span id="val-ganhos">0</span></div>
                                <div class="micro-txt txt-danger pulse-danger">ZERADOS: R$ <span id="val-red">0</span></div>
                            </div>
                            <div class="chart-legend">
                                <div onclick="APP.view('detalheCriticos','green')"><span class="dot bg-success"></span>${pGreen}% <span class="micro-txt">SAUDÁVEL</span></div>
                                <div onclick="APP.view('detalheCriticos','yellow')" class="bold-desc"><span class="dot bg-warning"></span>${pYellow}% <span class="micro-txt">ZONA CRÍTICA</span></div>
                                <div onclick="APP.view('detalheCriticos','red')"><span class="dot bg-danger"></span>${pRed}% <span class="micro-txt">ZERADOS</span></div>
                            </div>
                            ${inconsCount > 0 ? `<div class="alert-inline alert-danger margin-t-10" onclick="APP.view('detalheInconsistencias')">⚠ ${inconsCount} SKU${inconsCount>1?'s':''} vendidos sem estoque <span class="micro-txt">→ ver</span></div>` : ''}
                        </div>
                        <div class="pie-container" onclick="APP.view('detalheCriticos','yellow')">
                            <div class="pie-chart" style="background:${pieGradient}">
                                <div class="pie-center"><span class="micro-label">SKUS</span><b class="font-18">${st.total}</b></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- MAPA DE ATAQUE PDV -->
                <div class="op-card no-pad overflow-hid margin-t-10">
                    <div class="intel-header">
                        <span class="label">MAPA DE ATAQUE — PDVs</span>
                        <span class="micro-txt txt-muted">onde focar hoje</span>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border-color)">
                        ${pdvsSorted.map((pdv, i) => {
                            const prio = i + 1;
                            const bCol = prio===1 ? 'var(--danger)' : prio===2 ? 'var(--warning)' : 'var(--success)';
                            const rank = prio===1 ? '🔴' : prio===2 ? '🟡' : '🟢';
                            // [FIX] usa key pré-normalizada
                            return `<div style="background:var(--bg);padding:12px 10px;cursor:pointer;${prio===1?'animation:critPulse 2.5s ease infinite':''}" onclick="APP.actions.mudarAlvo('${pdv.key}')">
                                <span class="micro-txt" style="letter-spacing:1px;color:var(--text-muted)">${rank} #${prio}</span>
                                <div class="bold-desc" style="font-size:10px;letter-spacing:0.5px">${esc(pdv.name)}</div>
                                <div style="font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700;color:${bCol};line-height:1;margin:4px 0 2px">-${pdv.gap}<span style="font-size:10px">pts</span></div>
                                <div style="background:var(--border-color);height:3px;border-radius:2px;overflow:hidden;margin-top:6px">
                                    <div style="width:${pdv.val}%;height:100%;background:${bCol};border-radius:2px;transition:width .8s cubic-bezier(.16,1,.3,1)"></div>
                                </div>
                                <div class="micro-txt" style="margin-top:4px;color:var(--text-muted)">${pdv.val}% vs target</div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>

                <!-- PERFORMANCE CHART -->
                <div class="op-card no-pad overflow-hid margin-t-10">
                    <div class="intel-header">
                        <span class="label">PERFORMANCE — HIDRÁULICA VS PDVs</span>
                        <div style="display:flex;align-items:center;gap:8px">
                            <span style="font-family:'JetBrains Mono',monospace;font-size:8px;padding:2px 7px;border-radius:3px;background:${deltaHidra>=0?'rgba(16,185,129,0.12)':'rgba(239,68,68,0.12)'};border:1px solid ${deltaHidra>=0?'rgba(16,185,129,0.35)':'rgba(239,68,68,0.35)'};color:${deltaHidra>=0?'var(--success)':'var(--danger)'}">
                                ${deltaHidra>=0?'▲ ACIMA':'▼ ABAIXO'} DA MÉDIA
                            </span>
                            <button class="consultive-btn" onclick="APP.view('consultiveReport')" title="Relatório Consultivo">
                                <span class="material-symbols-outlined" style="font-size:14px">psychology</span>
                            </button>
                            <button class="consultive-btn" onclick="K11Regional.open()" title="Dashboard Regional" style="background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.3);color:#60a5fa">
                                <span class="material-symbols-outlined" style="font-size:14px">hub</span>
                            </button>
                        </div>
                    </div>
                    <div style="padding:4px 10px 0 10px;display:flex;align-items:center;justify-content:space-between">
                        <span class="micro-txt txt-muted">ÍNDICE RELATIVO vs CONCORRENTES</span>
                        <span class="micro-txt" style="color:#60a5fa;cursor:pointer;display:flex;align-items:center;gap:3px" onclick="K11Regional.open()">
                            <span class="material-symbols-outlined" style="font-size:11px">open_in_full</span>
                            MAPA REGIONAL
                        </span>
                    </div>
                    <div style="position:relative;padding:4px 12px 10px;cursor:pointer" onclick="K11Regional.open()" title="Abrir Dashboard Regional Interativo">
                        <svg viewBox="0 0 ${W} ${H}" style="width:100%;display:block;overflow:visible" aria-label="Performance por PDV">
                            ${gradeHTML}${barsHTML}${hidraHTML}
                        </svg>
                        <div id="chart-tooltip" style="display:none;position:absolute;top:6px;right:18px;background:var(--bg);border:1px solid var(--primary);border-radius:5px;padding:6px 12px;font-size:10px;pointer-events:none;color:var(--primary);box-shadow:0 0 16px rgba(255,140,0,0.2)"></div>
                        <div class="chart-expand-hint">🗺 CLIQUE PARA MAPA REGIONAL INTERATIVO</div>
                    </div>
                </div>

                <!-- KPI ROW — SVG ANIMATED RINGS -->
                <div class="kpi-row margin-t-10" id="kpi-ring-row">
                    ${(function(){
                        const R = 30, C = 38, STROKE = 5;
                        const circ = 2 * Math.PI * R;
                        function ring(pct, color, glowColor, val, label, iconPath, onclick, uid, pulse) {
                            const offset = circ * (1 - pct / 100);
                            const glowId = 'kglow_' + uid;
                            const animId = 'kanim_' + uid;
                            return `<div class="kpi-btn kpi-ring-btn" onclick="${onclick}" id="kbtn_${uid}">
                                <div style="position:relative;width:${C*2}px;height:${C*2}px;margin:0 auto 8px">
                                    <svg width="${C*2}" height="${C*2}" viewBox="0 0 ${C*2} ${C*2}" style="position:absolute;top:0;left:0;overflow:visible">
                                        <defs>
                                            <filter id="${glowId}" x="-40%" y="-40%" width="180%" height="180%">
                                                <feGaussianBlur stdDeviation="3" result="blur"/>
                                                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                                            </filter>
                                            <linearGradient id="grad_${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
                                                <stop offset="100%" stop-color="${glowColor}" stop-opacity="0.85"/>
                                            </linearGradient>
                                        </defs>
                                        <!-- track -->
                                        <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="${STROKE}"/>
                                        <!-- fill arc -->
                                        <circle id="arc_${uid}" cx="${C}" cy="${C}" r="${R}" fill="none"
                                            stroke="url(#grad_${uid})"
                                            stroke-width="${STROKE}" stroke-linecap="round"
                                            stroke-dasharray="${circ}" stroke-dashoffset="${circ}"
                                            transform="rotate(-90 ${C} ${C})"
                                            filter="url(#${glowId})"
                                            style="transition:stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)"/>
                                        ${pulse ? `<!-- pulse ring --><circle cx="${C}" cy="${C}" r="${R+6}" fill="none" stroke="${color}" stroke-width="1" opacity="0" style="animation:kpiPulse_${uid} 2.4s ease-out infinite"/>` : ''}
                                    </svg>
                                    <!-- center icon + value -->
                                    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="opacity:0.7">
                                            ${iconPath}
                                        </svg>
                                        <span style="font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:900;color:${color};line-height:1">${val}</span>
                                    </div>
                                </div>
                                <div style="font-size:9px;font-weight:900;letter-spacing:1px;color:rgba(255,255,255,0.35);text-transform:uppercase">${label}</div>
                            </div>`;
                        }

                        const checkIcon = '<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
                        const alertIcon = '<path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
                        const boltIcon  = '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

                        const pctCheck = percT;
                        const pctUC    = totalUC > 0 ? Math.min(100, Math.round((totalUC / 200) * 100)) : 0;
                        const pctAcoes = acoesPrio.length > 0 ? Math.min(100, Math.round((acoesPrio.length / 10) * 100)) : 0;

                        const r1 = ring(pctCheck, percT===100?'#10B981':'#FF8C00', percT===100?'#34d399':'#FFB347', percT+'%', 'CHECKLIST', checkIcon, "APP.view('detalheTarefas')", 'ck', percT===100);
                        const r2 = ring(totalUC>0?100:0, '#EF4444', '#f87171', totalUC, 'GARGALOS', alertIcon, "APP.view('detalheUC')", 'uc', totalUC>0);
                        const r3 = ring(pctAcoes, '#F59E0B', '#fcd34d', acoesPrio.length, 'AÇÕES', boltIcon, "APP.view('acoesPrioritarias')", 'ac', acoesPrio.length>0);

                        return r1 + r2 + r3;
                    })()}
                </div>
                <style>
                    .kpi-ring-btn { cursor:pointer; padding:14px 5px; transition:transform 0.2s, border-color 0.2s; }
                    .kpi-ring-btn:hover { transform:translateY(-2px); border-color:rgba(255,255,255,0.1) !important; }
                    .kpi-ring-btn:active { transform:scale(0.96); }
                    @keyframes kpiPulse_ck { 0%,100%{opacity:0;transform:scale(0.9)} 50%{opacity:0.25;transform:scale(1.1)} }
                    @keyframes kpiPulse_uc { 0%,100%{opacity:0;transform:scale(0.9)} 50%{opacity:0.3;transform:scale(1.1)} }
                    @keyframes kpiPulse_ac { 0%,100%{opacity:0;transform:scale(0.9)} 50%{opacity:0.25;transform:scale(1.1)} }
                </style>

                <!-- SKU MATRIX -->
                <div class="op-card no-pad overflow-hid margin-t-10">
                    <div class="intel-header" onclick="APP.actions.toggleSkuMatrix()">
                        <span class="label">SKUs QUE IMPACTAM O RESULTADO</span>
                        <span class="material-symbols-outlined" style="transition:transform .3s;${APP.ui.skuMatrixAberta?'transform:rotate(180deg)':''}">expand_more</span>
                    </div>
                    <div class="${APP.ui.skuMatrixAberta?'':'display-none'} pad-15">
                        <div style="display:flex;gap:4px;margin-bottom:10px">
                            <button onclick="APP.actions.setSkuTab('drag')" class="pos-tag ${APP.ui.skuTab!=='boost'?'btn-action':''}" style="flex:1;font-size:8px;padding:5px;letter-spacing:1px">▼ PERDENDO</button>
                            <button onclick="APP.actions.setSkuTab('boost')" class="pos-tag ${APP.ui.skuTab==='boost'?'btn-action':''}" style="flex:1;font-size:8px;padding:5px;letter-spacing:1px">▲ GANHANDO</button>
                        </div>
                        ${(APP.ui.skuTab==='boost'?topBoosts:topDrags).map(d => {
                            const isNeg  = d.gapAbsoluto > 0;
                            const valRef = APP.db.produtos.find(p => p.id === d.id);
                            const valImp = valRef ? brl(valRef.valTotal) : '—';
                            const statCor = d.vMinha===0 ? 'var(--danger)' : 'var(--warning)';
                            const statTxt = d.vMinha===0 ? 'SEM VENDA' : `${(100-d.loss).toFixed(0)}% EFIC.`;
                            return `<div style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--border-color)">
                                <b class="mono" style="font-size:11px;color:var(--primary)">${esc(d.id)}</b>
                                <div>
                                    <div style="font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${esc(d.desc.substring(0,28))}</div>
                                    <div style="display:flex;gap:4px;margin-top:3px">
                                        <span style="font-family:'JetBrains Mono',monospace;font-size:7px;padding:1px 5px;border-radius:2px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:${statCor}">${statTxt}</span>
                                        <span class="micro-txt txt-muted">R$ ${valImp}</span>
                                    </div>
                                </div>
                                <div style="text-align:right">
                                    <div style="font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;color:${isNeg?'var(--danger)':'var(--success)'}">${isNeg?'-':'+'}${Math.abs(d.gapAbsoluto)}un</div>
                                    <div class="micro-txt txt-muted">${isNeg?'-':'+'}${Math.abs(d.loss).toFixed(0)}%</div>
                                </div>
                            </div>`;
                        }).join('') || '<div class="centered opacity-5 pad-10">Sem dados</div>'}
                        <button class="pos-tag btn-action margin-t-10" style="width:100%" onclick="APP.view('projetor')">VER TODOS OS DUELOS →</button>
                    </div>
                </div>

                <!-- BI INTELIGÊNCIA DE MERCADO v2 -->
                <div class="op-card no-pad overflow-hid margin-t-10">

                    <!-- Header colapsável -->
                    <div onclick="APP.actions.toggleRanking()" class="intel-header">
                        <span class="label">INTELIGÊNCIA DE MERCADO
                            ${(APP.rankings.bi?.isMock ?? APP.rankings.growth[0]?.isMock)
                                ? '<span class="badge-mock" title="Dados estimados. Forneça pdvAnterior para dados reais.">ESTIMADO</span>'
                                : '<span class="badge-real">DADOS REAIS</span>'}
                        </span>
                        <span class="material-symbols-outlined" style="transition:transform .3s;${APP.ui.rankingAberto?'transform:rotate(180deg)':''}">expand_more</span>
                    </div>

                    <div class="${APP.ui.rankingAberto?'':'display-none'}">

                        <!-- Abas -->
                        <div style="display:flex;border-bottom:1px solid var(--border);padding:0 15px;gap:0">
                            ${['sku','subsecao','marcas'].map(tab => {
                                const labels = { sku:'SKU', subsecao:'SUBSEÇÃO', marcas:'MARCAS' };
                                const ativo  = (APP.ui.biTab ?? 'sku') === tab;
                                return `<button onclick="event.stopPropagation();APP.actions.setBiTab('${tab}')" style="flex:1;padding:10px 4px 9px;font-size:10px;font-weight:800;letter-spacing:.8px;background:none;border:none;border-bottom:2px solid ${ativo?'var(--primary)':'transparent'};color:${ativo?'var(--primary)':'var(--text-muted)'};cursor:pointer;transition:color .2s,border-color .2s">${labels[tab]}</button>`;
                            }).join('')}
                        </div>

                        <!-- ABA SKU -->
                        ${(APP.ui.biTab ?? 'sku') === 'sku' ? (() => {
                            const bi      = APP.rankings.bi;
                            const growth  = bi?.skus?.filter(x=>x.diff>0).slice(0,10) ?? APP.rankings.growth;
                            const decline = bi?.skus?.filter(x=>x.diff<0).slice(0,10) ?? APP.rankings.decline;
                            const row = (r, up) => `<div class="trend-item">
                                <div class="trend-header"><b class="mono" style="font-size:10px">${esc(r.id)}</b><span class="${up?'trend-up':'trend-down'}">${up?'+':''}${esc(String(r.perc))}%</span></div>
                                <div style="font-size:10px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc((r.desc??'').substring(0,26))}</div>
                                <div style="display:flex;justify-content:space-between;margin-top:2px">
                                    <span class="micro-txt txt-muted">${esc(String(r.qAtual))} → ant:${esc(String(Math.round(r.qAnterior)))}</span>
                                    ${r.marca&&r.marca!=='N/ID'?`<span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(255,140,0,.1);border:1px solid rgba(255,140,0,.2);color:var(--primary)">${esc(r.marca)}</span>`:''}
                                </div>
                            </div>`;
                            return `<div class="pad-15"><div class="dual-grid">
                                <div><div class="label txt-success" style="margin-bottom:8px">▲ GROWTH</div>${growth.map(r=>row(r,true)).join('')||'<div class="micro-txt txt-muted">Sem dados</div>'}</div>
                                <div><div class="label txt-danger"  style="margin-bottom:8px">▼ DECLINE</div>${decline.map(r=>row(r,false)).join('')||'<div class="micro-txt txt-muted">Sem dados</div>'}</div>
                            </div></div>`;
                        })() : ''}

                        <!-- ABA SUBSEÇÃO -->
                        ${(APP.ui.biTab ?? 'sku') === 'subsecao' ? (() => {
                            const subs = APP.rankings.bi?.subsecoes ?? [];
                            if (!subs.length) return `<div class="pad-15 centered micro-txt txt-muted">Sem dados de subseção</div>`;
                            return `<div style="padding:12px 15px;display:flex;flex-direction:column;gap:6px">
                                ${subs.slice(0,20).map(s => {
                                    const up  = s.perc >= 0;
                                    const cor = up ? 'var(--success)' : 'var(--danger)';
                                    const pct = Math.min(Math.abs(s.perc), 100);
                                    return `<div onclick="APP.actions.abrirSubsecao('${esc(s.sub.replace(/'/g,"\\'"))}')"
                                        style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:10px 12px;border-radius:8px;background:var(--bg);border:1px solid var(--border);cursor:pointer;transition:border-color .15s"
                                        onmouseenter="this.style.borderColor='var(--border-bright)'"
                                        onmouseleave="this.style.borderColor='var(--border)'">
                                        <div>
                                            <div style="font-size:11px;font-weight:700;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px">${esc(s.sub)}</div>
                                            <div style="height:3px;border-radius:2px;background:var(--border);overflow:hidden"><div style="width:${pct}%;height:100%;background:${cor};border-radius:2px"></div></div>
                                            <div style="display:flex;gap:8px;margin-top:4px"><span class="micro-txt txt-muted">${(s.skus?.length??0)} SKUs</span><span class="micro-txt txt-muted">${esc(String(s.qAtual))} un</span></div>
                                        </div>
                                        <div style="text-align:right;flex-shrink:0">
                                            <div style="font-size:14px;font-weight:800;font-family:var(--font-mono);color:${cor}">${up?'+':''}${esc(String(s.perc))}%</div>
                                            <div class="micro-txt" style="color:${cor}">${up?'+':''}${esc(String(s.diff))} un</div>
                                            <div style="font-size:8px;color:var(--text-muted);margin-top:3px">DETALHE →</div>
                                        </div>
                                    </div>`;
                                }).join('')}
                            </div>`;
                        })() : ''}

                        <!-- ABA MARCAS -->
                        ${(APP.ui.biTab ?? 'sku') === 'marcas' ? (() => {
                            const bi     = APP.rankings.bi;
                            const todos  = bi?.marcas ?? [];
                            const skuIdx = bi?.skuParaDuelo ?? new Map();

                            // ── Subseções disponíveis para filtro ──────────────
                            const subsDisponiveis = [...new Set(todos.map(d => d.sub))].sort();

                            // ── Filtros ativos ─────────────────────────────────
                            const buscaRaw = (APP.ui.buscaMarcas ?? '').trim().toUpperCase();
                            const subFiltro = APP.ui.filtroMarcaSub ?? '';

                            // ── Resolve busca por SKU ──────────────────────────
                            // Se o usuário digitou um SKU, encontra os duelos que o contêm
                            let duelos = todos;
                            let skuResolvido = null;

                            if (buscaRaw.length >= 3) {
                                // Tenta primeiro: é um SKU exato ou parcial?
                                const idxPorSku = [];
                                skuIdx.forEach((indices, skuId) => {
                                    if (skuId.toUpperCase().includes(buscaRaw)) {
                                        indices.forEach(i => idxPorSku.push(i));
                                    }
                                });

                                if (idxPorSku.length) {
                                    // Busca por SKU encontrou duelos — mostra esses
                                    const uniq = [...new Set(idxPorSku)];
                                    duelos = uniq.map(i => todos[i]).filter(Boolean);
                                    // Destaca o SKU buscado dentro dos duelos
                                    skuResolvido = buscaRaw;
                                } else {
                                    // Busca por texto livre na base do produto ou marca
                                    duelos = todos.filter(d =>
                                        d.base.toUpperCase().includes(buscaRaw) ||
                                        d.marcas.some(m => m.marca.toUpperCase().includes(buscaRaw))
                                    );
                                }
                            }

                            // Aplica filtro de subseção
                            if (subFiltro) {
                                duelos = duelos.filter(d => d.sub === subFiltro);
                            }

                            const semResultado = !duelos.length;

                            return `<div>
                                <!-- Controles de busca e filtro -->
                                <div style="padding:10px 15px 0;display:flex;flex-direction:column;gap:8px">

                                    <!-- Busca: SKU, produto ou marca -->
                                    <div style="position:relative">
                                        <input
                                            type="text"
                                            placeholder="BUSCAR SKU, PRODUTO OU MARCA..."
                                            class="op-input"
                                            style="width:100%;padding-left:32px;font-size:11px"
                                            oninput="APP.actions.filtrarMarcas(this.value)"
                                            value="${esc(APP.ui.buscaMarcas ?? '')}">
                                        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--text-muted);pointer-events:none">🔍</span>
                                    </div>

                                    <!-- Filtro de subseção -->
                                    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none">
                                        <button onclick="APP.actions.setFiltroMarcaSub('')"
                                            style="flex-shrink:0;padding:4px 10px;border-radius:20px;border:1px solid ${!subFiltro?'var(--primary)':'var(--border)'};background:${!subFiltro?'rgba(255,140,0,.12)':'transparent'};color:${!subFiltro?'var(--primary)':'var(--text-muted)'};font-size:9px;font-weight:700;letter-spacing:.5px;cursor:pointer;white-space:nowrap">
                                            TODAS
                                        </button>
                                        ${subsDisponiveis.slice(0,12).map(s => `
                                        <button onclick="APP.actions.setFiltroMarcaSub('${esc(s.replace(/'/g,"\\'"))}')"
                                            style="flex-shrink:0;padding:4px 10px;border-radius:20px;border:1px solid ${subFiltro===s?'var(--primary)':'var(--border)'};background:${subFiltro===s?'rgba(255,140,0,.12)':'transparent'};color:${subFiltro===s?'var(--primary)':'var(--text-muted)'};font-size:9px;font-weight:700;letter-spacing:.5px;cursor:pointer;white-space:nowrap">
                                            ${esc(s.length>18?s.substring(0,16)+'…':s)}
                                        </button>`).join('')}
                                    </div>

                                    ${skuResolvido ? `
                                    <div style="padding:6px 10px;border-radius:6px;background:rgba(255,140,0,.08);border:1px solid rgba(255,140,0,.2);font-size:10px;color:var(--primary)">
                                        SKU <b>${esc(skuResolvido)}</b> encontrado em ${duelos.length} duelo${duelos.length!==1?'s':''}
                                    </div>` : ''}
                                </div>

                                <!-- Lista de duelos -->
                                <div style="padding:10px 15px 14px;display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow-y:auto">
                                    ${semResultado
                                        ? `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:11px">
                                            ${buscaRaw||subFiltro ? 'Nenhum duelo encontrado para este filtro' : 'Sem duelos detectados nos dados atuais'}
                                           </div>`
                                        : duelos.slice(0, 20).map((d, di) => {
                                            const total   = d.totalVol || 1;
                                            const up      = d.totalPerc >= 0;
                                            const corTot  = up ? 'var(--success)' : 'var(--danger)';
                                            const CORES   = ['var(--primary)','#3B82F6','#8B5CF6','#EC4899'];

                                            return `<div style="padding:12px;border-radius:8px;background:var(--bg);border:1px solid var(--border)">

                                                <!-- Cabeçalho do duelo -->
                                                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:9px">
                                                    <div style="flex:1;min-width:0">
                                                        <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:.6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.base.substring(0,42))}</div>
                                                        <div style="font-size:9px;color:var(--text-muted);margin-top:2px">${esc(d.sub)} · ${d.totalVol} un</div>
                                                    </div>
                                                    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                                                        <span style="font-size:11px;font-weight:800;font-family:var(--font-mono);color:${corTot}">${up?'+':''}${esc(String(d.totalPerc))}%</span>
                                                        <button onclick="APP.actions.abrirDetalhesMarca(${di}, '${subFiltro}', '${buscaRaw}')"
                                                            style="padding:4px 8px;border-radius:5px;border:1px solid var(--border-mid);background:var(--card-bg2);color:var(--text-soft);font-size:9px;font-weight:700;letter-spacing:.5px;cursor:pointer;transition:all .15s;white-space:nowrap"
                                                            onmouseenter="this.style.borderColor='var(--primary)';this.style.color='var(--primary)'"
                                                            onmouseleave="this.style.borderColor='var(--border-mid)';this.style.color='var(--text-soft)'">
                                                            DETALHES
                                                        </button>
                                                        <button onclick="APP.actions.showComparacaoModal(${di})"
                                                            style="padding:4px 8px;border-radius:5px;border:1px solid #3B82F6;background:rgba(59,130,246,.1);color:#3B82F6;font-size:9px;font-weight:700;letter-spacing:.5px;cursor:pointer;margin-left:4px;white-space:nowrap">
                                                            📊 COMPARAR
                                                        </button>
                                                    </div>
                                                </div>

                                                <!-- Barras das marcas -->
                                                <div style="display:flex;flex-direction:column;gap:6px">
                                                    ${d.marcas.slice(0,4).map((m, mi) => {
                                                        const share   = Math.round((m.qAtual / total) * 100);
                                                        const up_m    = m.diff > 0;
                                                        const corVar  = up_m ? 'var(--success)' : m.diff < 0 ? 'var(--danger)' : 'var(--text-muted)';
                                                        const corBarra= CORES[mi] ?? 'var(--border-bright)';
                                                        // Destaca se algum SKU desta marca bate com a busca
                                                        const temSku  = skuResolvido && m.skus.some(s => s.toUpperCase().includes(skuResolvido));
                                                        return `<div style="display:grid;grid-template-columns:72px 1fr 56px;gap:6px;align-items:center;${temSku?'background:rgba(255,140,0,.06);border-radius:4px;padding:2px 4px':''}">
                                                            <div style="font-size:10px;font-weight:700;color:${corBarra};white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(m.skus.join(', '))}">
                                                                ${mi===0?'👑 ':''}${esc(m.marca)}
                                                                ${temSku?'<span style="font-size:7px;color:var(--primary)"> ●</span>':''}
                                                            </div>
                                                            <div style="position:relative;height:6px;border-radius:3px;background:var(--border);overflow:hidden">
                                                                <div style="position:absolute;left:0;top:0;height:100%;width:${share}%;background:${corBarra};border-radius:3px;transition:width .5s ease"></div>
                                                            </div>
                                                            <div style="display:flex;justify-content:space-between;align-items:center">
                                                                <span style="font-size:10px;font-weight:700;font-family:var(--font-mono)">${share}%</span>
                                                                <span style="font-size:9px;color:${corVar};margin-left:2px">${m.diff>0?'+':''}${esc(String(m.diff))}</span>
                                                            </div>
                                                        </div>`;
                                                    }).join('')}
                                                </div>

                                                <!-- SKUs desta marca (expandido quando há busca ativa) -->
                                                ${skuResolvido ? `
                                                <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
                                                    ${d.marcas.slice(0,4).map(m => {
                                                        const skusBatidos = m.skus.filter(s => s.toUpperCase().includes(skuResolvido));
                                                        if (!skusBatidos.length) return '';
                                                        return `<div style="font-size:9px;color:var(--text-muted)">
                                                            <span style="color:var(--primary);font-weight:700">${esc(m.marca)}</span>: ${skusBatidos.map(s=>`<span class="mono" style="color:var(--text-soft)">${esc(s)}</span>`).join(', ')}
                                                        </div>`;
                                                    }).join('')}
                                                </div>` : ''}
                                            </div>`;
                                        }).join('')
                                    }
                                    ${duelos.length > 20 ? `<div style="text-align:center;font-size:10px;color:var(--text-muted);padding:8px 0">... e mais ${duelos.length-20} duelos. Refine a busca para ver mais.</div>` : ''}
                                </div>
                            </div>`;
                        })() : ''}

                    </div>
                </div>`;
        },

        acoesPrioritarias() {
            const acoes = APP._gerarAcoesPrioritarias();
            const done  = acoes.filter(a => a.done).length;
            return `
                <div class="op-card">
                    <div class="flex-between"><span class="label">PLANO DE AÇÃO DO DIA</span><span class="micro-txt txt-muted">${done}/${acoes.length} concluídas</span></div>
                    <div style="background:var(--border-color);height:3px;border-radius:2px;overflow:hidden;margin:10px 0 14px">
                        <div style="width:${acoes.length?Math.round((done/acoes.length)*100):0}%;height:100%;background:var(--success);transition:width .6s ease;border-radius:2px"></div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px">
                        ${acoes.map((a, i) => {
                            const acol = a.urgencia==='alta' ? 'var(--danger)' : a.urgencia==='media' ? 'var(--warning)' : 'var(--success)';
                            return `<div onclick="APP.actions.toggleAcao(${i})" style="display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;padding:10px 12px;border-radius:7px;background:var(--bg);border:1px solid var(--border-color);opacity:${a.done?.45:1};cursor:pointer;transition:opacity .2s">
                                <div style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:700;background:${acol}22;border:1px solid ${acol}55;color:${acol}">${i+1}</div>
                                <div>
                                    <div style="font-size:11px;font-weight:600;${a.done?'text-decoration:line-through':''}">${esc(a.desc)}</div>
                                    <div class="micro-txt txt-muted" style="margin-top:2px">${esc(a.meta)}</div>
                                </div>
                                <div style="text-align:right;flex-shrink:0">
                                    <div style="font-family:'JetBrains Mono',monospace;font-size:10px;color:${acol}">${esc(a.val)}</div>
                                    <div style="width:18px;height:18px;border:1px solid ${a.done?'var(--success)':'var(--border-color)'};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;margin-top:4px;margin-left:auto;background:${a.done?'rgba(16,185,129,.15)':'transparent'};color:var(--success)">${a.done?'✓':''}</div>
                                </div>
                            </div>`;
                        }).join('') || '<div class="centered opacity-5 pad-20">Nenhuma ação gerada</div>'}
                    </div>
                    <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR</button>
                </div>`;
        },

        detalheCriticos(corAlvo) {
            const CORES_VALIDAS = ['yellow', 'red', 'green'];
            const cor = CORES_VALIDAS.includes(corAlvo) ? corAlvo : 'yellow';
            const titulos     = { yellow: 'ZONA CRÍTICA (PKL 1–2 UNIDADES)', red: 'RUPTURAS (ZERADO TOTAL + FALSO ZERO)', green: 'ESTOQUE SAUDÁVEL' };
            const coresBorder = { yellow: 'border-warning', red: 'border-danger', green: 'border-success' };
            const lista = APP.db.produtos.filter(p => p.categoriaCor === cor).sort((a, b) => b.scoreCriticidade - a.scoreCriticidade);
            return `
                <div class="op-card ${coresBorder[cor]}">
                    <span class="label">${titulos[cor]}</span>
                    <div class="margin-t-15">
                        ${lista.map(p => {
                            const bgBord = p.categoriaCor==='yellow'?'warning':p.categoriaCor==='red'?'danger':'success';
                            const nomeFornecedor = APP.db.fornecedorMap.get(p.id) ?? 'Consultar Compras';
                            const subLabel = p.subStatus==='falso-zero' ? '<span class="badge-sub">FALSO ZERO</span>' : p.subStatus==='pkl-critico' ? '<span class="badge-sub">PKL CRÍTICO</span>' : '';
                            return `<div class="op-card margin-b-10" style="border-left:4px solid var(--${bgBord})">
                                <div class="flex-between">
                                    <b class="mono font-18">${esc(p.id)}</b>
                                    <span class="badge" style="background:var(--bg);color:var(--text-main)">R$ ${brl(p.valTotal)}</span>
                                </div>
                                <div class="bold-desc margin-t-5">${esc(p.desc)}</div>
                                ${subLabel}
                                <div class="micro-txt txt-primary bold-desc margin-t-5">FORNECEDOR: ${esc(nomeFornecedor)}</div>
                                <div class="end-box-clean micro-txt margin-t-10">
                                    <span>PKL: <b>${esc(String(p.pkl))} un</b></span>
                                    <span>TOTAL: <b>${esc(String(p.total))} un</b></span>
                                </div>
                                <button class="pos-tag btn-action margin-t-10" onclick="APP.actions.preencher('${esc(p.id)}')">LANÇAR REPOSIÇÃO</button>
                            </div>`;
                        }).join('') || '<div class="centered opacity-5 pad-20">NENHUM ITEM NESTA CATEGORIA</div>'}
                    </div>
                    <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR AO DASHBOARD</button>
                </div>`;
        },

        detalheInconsistencias() {
            const lista = APP.rankings.meta.inconsistentes;
            return `
                <div class="op-card border-danger">
                    <span class="label txt-danger">⚠ INCONSISTÊNCIAS — VENDA SEM ESTOQUE</span>
                    <div class="micro-txt margin-t-5" style="opacity:.7">SKUs com registro de venda no PDV mas estoque zerado. Verificar baixas, inventário ou transferências pendentes.</div>
                    <div class="margin-t-15">
                        ${lista.map(p => `<div class="op-card margin-b-10" style="border-left:3px solid var(--danger)">
                            <div class="flex-between"><b class="mono">${esc(p.id)}</b><span class="badge status-critico">SEM ESTOQUE</span></div>
                            <div class="bold-desc">${esc(p.desc)}</div>
                            <div class="micro-txt txt-danger margin-t-5">Valor referência: R$ ${brl(p.valTotal)}</div>
                        </div>`).join('') || '<div class="centered">Sem inconsistências.</div>'}
                    </div>
                    <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR</button>
                </div>`;
        },

        consultiveReport() {
            const top       = APP.rankings.topLeverage;
            const pullsDown = APP.rankings.duelos.slice(0, 3);
            return `
                <div class="op-card">
                    <div class="label txt-primary">INSIGHT CONSULTIVO: ALAVANCAGEM</div>
                    <div class="op-card border-success margin-t-15">
                        <div class="label micro-txt">SKU QUE MAIS IMPULSIONA SEU SETOR:</div>
                        <div class="bold-desc margin-t-10">${esc(top.desc)}</div>
                        <div class="flex-between margin-t-10">
                            <span class="micro-txt">K11: <b>${esc(String(top.vMinha))} un</b></span>
                            <span class="badge status-dominio">DOMÍNIO ABSOLUTO</span>
                        </div>
                    </div>
                    <div class="label txt-danger margin-t-20 margin-b-10">GAPS QUE PUXAM SUA MÉDIA PARA BAIXO</div>
                    ${pullsDown.map(p => `<div class="end-box-alert">
                        <div class="flex-between"><b class="mono">${esc(p.id)}</b><b class="txt-danger">−${esc(String(p.gapAbsoluto))} un vs Alvo</b></div>
                        <div class="micro-txt">${esc(p.desc)}</div>
                    </div>`).join('')}
                    <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR AO DASHBOARD</button>
                </div>`;
        },

        detalheUC() {
            // ── Contadores para o painel de resumo ──────────────────────────
            const cnt = { ruptura: 0, aereo: 0, reserva: 0, pkl: 0 };
            APP.db.ucGlobal.forEach(g => {
                if (g.status === 'RUPTURA')                            cnt.ruptura++;
                else if (g.status.includes('AÉREO'))                  cnt.aereo++;
                else if (g.status.includes('RESERVA') && g.ael === 0) cnt.reserva++;
                else                                                   cnt.pkl++;
            });
            const scoreMax = APP.db.ucGlobal[0]?.scoreGargalo || 1;

            const COR = { danger: 'var(--danger)', warning: 'var(--warning)' };

            return `
                <div>
                    <!-- ── PAINEL RESUMO ─────────────────────────────── -->
                    <div class="op-card" style="padding:14px">
                        <div class="label" style="margin-bottom:10px">
                            UC GLOBAL · ${APP.db.ucGlobal.length} GARGALOS DE ARMAZENAMENTO
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;text-align:center">
                            ${[
                                { n: cnt.ruptura, label: 'RUPTURA',  cor: 'danger',  icon: '⛔' },
                                { n: cnt.aereo,   label: 'AÉREO',    cor: 'danger',  icon: '🔼' },
                                { n: cnt.reserva, label: 'RESERVA',  cor: 'warning', icon: '📦' },
                                { n: cnt.pkl,     label: 'PKL↓',     cor: 'warning', icon: '⚠' },
                            ].map(c => `
                                <div style="background:rgba(${c.cor==='danger'?'239,68,68':'245,158,11'},0.1);border:1px solid rgba(${c.cor==='danger'?'239,68,68':'245,158,11'},0.3);border-radius:6px;padding:8px 4px">
                                    <div style="font-size:18px;font-weight:900;font-family:'JetBrains Mono',monospace;color:var(--${c.cor})">${c.n}</div>
                                    <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:var(--${c.cor});margin-top:1px">${c.icon} ${c.label}</div>
                                </div>`).join('')}
                        </div>
                    </div>

                    <!-- ── CARDS POR GARGALO ────────────────────────── -->
                    ${APP.db.ucGlobal.map(item => {
                        const cor      = COR[item.corStatus];
                        const scorePct = Math.round((item.scoreGargalo / scoreMax) * 100);

                        // ── Posições PKL
                        const pklRows = item.deposPKL.map(d => `
                            <div class="uc-dep-row" style="--dep-cor:${item.pkl<=2?'var(--danger)':'var(--primary)'}">
                                <span class="uc-dep-label">PKL</span>
                                <span class="mono micro-txt" style="color:var(--text-muted)">${esc(d.pos)}</span>
                                <b style="color:${item.pkl<=2?'var(--danger)':'var(--primary)'}">${esc(String(d.q))} un</b>
                            </div>`).join('');

                        // ── Posições AEL
                        const aelRows = item.deposAEL.map(d => `
                            <div class="uc-dep-row" style="--dep-cor:var(--warning)">
                                <span class="uc-dep-label" style="background:rgba(245,158,11,0.15);color:var(--warning);border-color:rgba(245,158,11,0.4)">AEL</span>
                                <span class="mono micro-txt" style="color:var(--text-muted)">${esc(d.pos)}</span>
                                <b class="txt-warning">${esc(String(d.q))} un</b>
                            </div>`).join('');

                        // ── Posições RES
                        const resRows = item.deposRES.map(d => `
                            <div class="uc-dep-row" style="--dep-cor:#60a5fa">
                                <span class="uc-dep-label" style="background:rgba(96,165,250,0.12);color:#60a5fa;border-color:rgba(96,165,250,0.35)">RES</span>
                                <span class="mono micro-txt" style="color:var(--text-muted)">${esc(d.pos)}</span>
                                <b style="color:#60a5fa">${esc(String(d.q))} un</b>
                            </div>`).join('');

                        // ── Bloco de agendamento
                        const ag = item.agendamento;
                        const agendHTML = ag
                            ? `<div style="margin-top:8px;padding:10px 12px;border-radius:6px;background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.25)">
                                <!-- Linha 1: Fornecedor + Doca -->
                                <div class="flex-between" style="align-items:flex-start;gap:6px">
                                    <span class="micro-txt txt-success" style="font-weight:800;line-height:1.3">📦 ${esc(ag.fornecedor)}</span>
                                    <span style="font-size:9px;padding:2px 7px;border-radius:3px;font-weight:900;letter-spacing:0.5px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:var(--success);flex-shrink:0">${esc(ag.doca) || 'S/DOCA'}</span>
                                </div>
                                <!-- Linha 2: Pedido(s) + NF(s) -->
                                <div class="flex-between margin-t-5">
                                    <span class="micro-txt txt-muted">Pedido: <b style="color:var(--text-main)">${ag.pedidos.join(', ')}</b></span>
                                    ${ag.nfs.length ? `<span class="micro-txt txt-muted">NF: <b style="color:var(--text-main)">${ag.nfs.join(', ')}</b></span>` : ''}
                                </div>
                                <!-- Linha 3: Qtd Agendada + Qtd Confirmada NF -->
                                <div class="flex-between margin-t-5">
                                    <span class="micro-txt txt-muted">Agendado: <b class="txt-success">${ag.qtdAgendada} un</b></span>
                                    <span class="micro-txt txt-muted">Conf. NF: <b class="${ag.qtdConfirmada > 0 ? 'txt-success' : 'txt-muted'}">${ag.qtdConfirmada} un</b></span>
                                </div>
                                <!-- Linha 4: Janela de agendamento -->
                                <div class="flex-between margin-t-5">
                                    <span class="micro-txt txt-muted">Início: <b style="color:var(--text-main)">${esc(ag.dataInicio)}</b></span>
                                    ${ag.dataFim && ag.dataFim !== ag.dataInicio ? `<span class="micro-txt txt-muted">Fim: <b style="color:var(--text-main)">${esc(ag.dataFim)}</b></span>` : ''}
                                    ${ag.idAgendamento ? `<span class="micro-txt txt-muted">ID: <b style="color:var(--text-main)">${esc(ag.idAgendamento)}</b></span>` : ''}
                                </div>
                               </div>`
                            : `<div style="margin-top:8px;padding:5px 10px;border-radius:5px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.18)">
                                <span class="micro-txt" style="color:var(--danger)">⚠ Sem agendamento de fornecedor</span>
                               </div>`;

                        // ── Badge de status
                        const statusBadge = `<span style="font-size:9px;padding:2px 8px;border-radius:3px;font-weight:900;letter-spacing:0.8px;background:${cor}22;border:1px solid ${cor}55;color:${cor}">${esc(item.status)}</span>`;

                        // ── Ação recomendada contextual
                        const acaoTxt = item.pkl === 0
                            ? (item.ael > 0 ? 'BAIXAR DO AÉREO PARA PKL' : 'TRAZER DA RESERVA PARA PKL')
                            : 'COMPLETAR PKL';

                        return `
                        <div class="op-card margin-b-10" style="border-left:4px solid ${cor}">
                            <!-- Cabeçalho: ID + status + valor -->
                            <div class="flex-between" style="align-items:flex-start;gap:8px">
                                <div>
                                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                                        <b class="mono" style="font-size:15px;color:${cor}">${esc(item.id)}</b>
                                        ${statusBadge}
                                    </div>
                                    <div class="bold-desc margin-t-5">${esc(item.desc)}</div>
                                </div>
                                <div style="text-align:right;flex-shrink:0">
                                    <div class="micro-txt txt-muted">Valor</div>
                                    <div style="font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace">R$ ${brl(item.valTotal)}</div>
                                </div>
                            </div>

                            <!-- Gauge PKL / AEL / RES -->
                            <div style="display:grid;grid-template-columns:${item.ael>0&&item.res>0?'1fr 1fr 1fr':(item.ael>0||item.res>0)?'1fr 1fr':'1fr'};gap:6px;margin:10px 0">
                                <!-- PKL -->
                                <div style="background:var(--bg);border-radius:5px;padding:8px;text-align:center;border:1px solid ${item.pkl<=2?'rgba(239,68,68,0.4)':'var(--border-color)'}">
                                    <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:${item.pkl<=2?'var(--danger)':item.pkl<=5?'var(--warning)':'var(--primary)'};margin-bottom:2px">PKL</div>
                                    <div style="font-size:22px;font-weight:900;font-family:'JetBrains Mono',monospace;line-height:1;color:${item.pkl===0?'var(--danger)':item.pkl<=2?'var(--danger)':item.pkl<=5?'var(--warning)':'var(--primary)'}">${item.pkl}</div>
                                    <div class="micro-txt txt-muted" style="margin-top:2px">cap: ${item.capMax}</div>
                                    <div style="height:3px;background:var(--border-color);border-radius:2px;overflow:hidden;margin-top:5px">
                                        <div style="width:${item.pklPct}%;height:100%;border-radius:2px;background:${item.pkl===0?'var(--danger)':item.pkl<=2?'var(--danger)':item.pkl<=5?'var(--warning)':'var(--primary)'}"></div>
                                    </div>
                                </div>
                                <!-- AEL (só se tiver) -->
                                ${item.ael > 0 ? `
                                <div style="background:var(--bg);border-radius:5px;padding:8px;text-align:center;border:1px solid rgba(245,158,11,0.35)">
                                    <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:var(--warning);margin-bottom:2px">AÉREO ↓</div>
                                    <div style="font-size:22px;font-weight:900;font-family:'JetBrains Mono',monospace;line-height:1;color:var(--warning)">${item.ael}</div>
                                    <div class="micro-txt txt-muted" style="margin-top:2px">a descer</div>
                                    <div style="height:3px;background:rgba(245,158,11,0.15);border-radius:2px;overflow:hidden;margin-top:5px">
                                        <div style="width:100%;height:100%;border-radius:2px;background:var(--warning)"></div>
                                    </div>
                                </div>` : ''}
                                <!-- RES (só se tiver) -->
                                ${item.res > 0 ? `
                                <div style="background:var(--bg);border-radius:5px;padding:8px;text-align:center;border:1px solid rgba(96,165,250,0.35)">
                                    <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:#60a5fa;margin-bottom:2px">RESERVA ↓</div>
                                    <div style="font-size:22px;font-weight:900;font-family:'JetBrains Mono',monospace;line-height:1;color:#60a5fa">${item.res}</div>
                                    <div class="micro-txt txt-muted" style="margin-top:2px">a liberar</div>
                                    <div style="height:3px;background:rgba(96,165,250,0.12);border-radius:2px;overflow:hidden;margin-top:5px">
                                        <div style="width:100%;height:100%;border-radius:2px;background:#60a5fa"></div>
                                    </div>
                                </div>` : ''}
                            </div>

                            <!-- Barra de criticidade -->
                            <div style="margin-bottom:10px">
                                <div class="flex-between micro-txt" style="margin-bottom:3px">
                                    <span class="txt-muted">URGÊNCIA</span>
                                    <span style="color:${cor};font-weight:700">${scorePct}%</span>
                                </div>
                                <div style="height:4px;background:var(--border-color);border-radius:2px;overflow:hidden">
                                    <div style="width:${scorePct}%;height:100%;background:${cor};border-radius:2px;transition:width .6s ease"></div>
                                </div>
                            </div>

                            <!-- Posições detalhadas -->
                            ${pklRows}${aelRows}${resRows}

                            <!-- Agendamento de fornecedor -->
                            ${agendHTML}

                            <!-- CTA contextual -->
                            <button class="pos-tag btn-action margin-t-10"
                                    onclick="APP.actions.preencher('${esc(item.id)}')">
                                ${esc(acaoTxt)}
                            </button>
                        </div>`;
                    }).join('') || '<div class="op-card centered opacity-5" style="padding:30px">NENHUM GARGALO DETECTADO</div>'}

                    <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR AO DASHBOARD</button>
                </div>`;
        },

        operacional() {
            const filaHTML = APP.db.fila.length === 0
                ? '<div class="op-card centered opacity-5">FILA VAZIA — Deslize card para remover</div>'
                : APP.db.fila.map((t, i) => `
                    <div class="op-card swipe-item" style="background:rgba(16,185,129,0.05);border-color:rgba(16,185,129,0.2)" data-fila-idx="${i}">
                        <div class="flex-between">
                            <div>
                                <b class="mono font-18">${esc(t.id)}</b>
                                <div class="micro-txt txt-muted">${esc(t.desc)}</div>
                                <b class="txt-primary">QTD: ${esc(String(t.qtdSolicitada))}</b>
                            </div>
                            <span class="material-symbols-outlined btn-done" onclick="APP.actions.remFila(${i})">task_alt</span>
                        </div>
                        <div class="margin-t-10">
                            ${t.depositos.map(d => `<div class="end-box-clean mono micro-txt"><span>${esc(d.tipo)} | <b>${esc(d.pos)}</b></span><b>${esc(String(d.q))} un</b></div>`).join('')}
                        </div>
                        <div class="micro-txt txt-muted margin-t-5" style="opacity:.4">← deslize para remover</div>
                    </div>`).join('');

            return `
                <div>
                    <div class="op-card pad-20">
                        <span class="label">BIPAR SKU</span>
                        <input type="number" id="sk-in" class="op-input margin-t-10" inputmode="numeric" placeholder="Código SKU" autocomplete="off">
                        <input type="number" id="qt-in" class="op-input margin-t-10" placeholder="QTD" inputmode="numeric">
                        <button onclick="APP.actions.addFila()" class="pos-tag btn-action margin-t-10">LANÇAR NA FILA</button>
                    </div>
                    <div class="flex-between margin-t-15" style="padding:0 4px">
                        <span class="label">FILA DE ROTAS ${APP.db.fila.length>0?`<span class="badge-count">${APP.db.fila.length}</span>`:''}</span>
                        <div style="display:flex;gap:8px">
                            ${APP.db.fila.length > 0 ? `
                                <button class="micro-btn-danger" onclick="APP.actions.exportarFila()">EXPORTAR</button>
                                <button class="micro-btn-danger" onclick="APP.actions.limparFila()">LIMPAR</button>` : ''}
                        </div>
                    </div>
                    <div class="margin-t-10">${filaHTML}</div>
                </div>`;
        },

        rastreio() {
            return `
                <div class="op-card">
                    <span class="label">RASTREIO DE FLUXO INDUSTRIAL</span>
                    <input type="number" id="sk-r" class="op-input margin-t-10" placeholder="SKU..." inputmode="numeric" autocomplete="off">
                    <button onclick="APP.actions.rastrear()" class="pos-tag margin-t-10">PESQUISAR HISTÓRICO</button>
                </div>
                <div id="res-investigar" class="margin-b-80"></div>`;
        },

        projetor() {
            const q    = APP.ui.buscaDuelo.toLowerCase();
            const lista = APP.rankings.duelos.filter(x => x.id.includes(APP.ui.buscaDuelo) || x.desc.toLowerCase().includes(q));
            return `
                <div class="duel-selector">
                    ${['mesquita', 'jacarepagua', 'benfica'].map(l => `<button class="alvo-btn ${APP.ui.pdvAlvo===l?'active':''}" onclick="APP.actions.mudarAlvo('${l}')">${l.toUpperCase()}</button>`).join('')}
                </div>
                <div class="op-card margin-t-10">
                    <div class="label">LOSS GAP IMPACTO (TOP 10): ${esc(APP.rankings.meta.lossGap)}%</div>
                    <input type="text" placeholder="BUSCAR SKU OU DESCRIÇÃO..." class="op-input margin-t-10" oninput="APP.actions.filtrarDuelo(this.value)" value="${esc(APP.ui.buscaDuelo)}">
                </div>
                <div class="margin-b-80">
                    ${lista.map(g => `<div class="op-card duel-border" style="border-left-color:${g.gapAbsoluto>10?'var(--danger)':'var(--success)'}">
                        <div class="flex-between">
                            <b class="mono">${esc(g.id)}</b>
                            <div class="gap-impact-badge">${g.dominando?`<span class="txt-success">+${Math.abs(g.gapAbsoluto)} un</span>`:`GAP: −${esc(String(g.gapAbsoluto))} un`}</div>
                        </div>
                        <div class="bold-desc margin-t-5">${esc(g.desc)}</div>
                        <div class="duel-grid-stats margin-t-10">
                            <div><div class="label micro">K11</div><b>${esc(String(g.vMinha))}</b></div>
                            <div><div class="label micro">${esc(APP.ui.pdvAlvo.toUpperCase())}</div><b>${esc(String(g.vAlvo))}</b></div>
                            <div><div class="label micro">EFICIÊNCIA</div><b class="${g.loss>50?'txt-danger':''}">${(100-g.loss).toFixed(1)}%</b></div>
                        </div>
                    </div>`).join('')}
                </div>`;
        },

        estoque() {
            const f    = APP.ui.filtroEstoque;
            const busca = APP.ui.buscaEstoque.toLowerCase();
            const lista = APP.db.produtos
                .filter(p => p.status === f && (!busca || p.id.toLowerCase().includes(busca) || p.desc.toLowerCase().includes(busca)))
                .sort((a, b) => b.scoreCriticidade - a.scoreCriticidade);
            return `
                <div class="kpi-row">
                    <div class="kpi-btn ${f==='ruptura'?'btn-selected-danger':''}" onclick="APP.actions.setFiltroEstoque('ruptura')">RUPTURAS <span class="badge-count">${APP.rankings.pieStats.red}</span></div>
                    <div class="kpi-btn ${f==='abastecimento'?'btn-selected-primary':''}" onclick="APP.actions.setFiltroEstoque('abastecimento')">REPOSIÇÃO <span class="badge-count">${APP.rankings.pieStats.yellow}</span></div>
                </div>
                <input type="text" placeholder="BUSCAR SKU OU PRODUTO..." class="op-input margin-t-10" oninput="APP.actions.filtrarEstoque(this.value)" value="${esc(APP.ui.buscaEstoque)}">
                <div class="margin-b-80 margin-t-10">
                    ${lista.map(p => `<div class="op-card" onclick="APP.actions.preencher('${esc(p.id)}')">
                        <div class="flex-between"><b class="mono">${esc(p.id)}</b><b>${esc(String(p.total))} UN</b></div>
                        <div class="bold-desc margin-t-5">${esc(p.desc)}</div>
                        ${p.subStatus!=='ok'?`<span class="badge-sub">${esc(p.subStatus)}</span>`:''}
                        ${p.depositos.map(d => `<div class="end-box-mini mono margin-t-5"><span>${esc(d.tipo)} | <b>${esc(d.pos)}</b></span><b>${esc(String(d.q))}</b></div>`).join('')}
                    </div>`).join('') || '<div class="centered opacity-5 pad-20">Nenhum item encontrado</div>'}
                </div>`;
        },

        detalheTarefas() {
            const done  = APP.db.tarefas.filter(t => t.done).length;
            const total = APP.db.tarefas.length;
            const pct   = total > 0 ? Math.round((done/total)*100) : 0;
            return `
                <div class="op-card">
                    <div class="flex-between">
                        <span class="label">CONFERÊNCIA DE ROTINA</span>
                        <span class="micro-txt">${done}/${total} — ${pct}%</span>
                    </div>
                    <div style="height:4px;background:var(--border-color);border-radius:2px;overflow:hidden;margin:10px 0">
                        <div style="width:${pct}%;height:100%;background:${pct===100?'var(--success)':'var(--primary)'};border-radius:2px;transition:width .5s"></div>
                    </div>
                    <div class="margin-t-10">
                        ${APP.db.tarefas.map(t => `<div class="task-line ${t.done?'done':''}">
                            <span>${esc(t.task)}</span>
                            <span class="material-symbols-outlined" onclick="APP.actions.toggleTask(${t.id})">${t.done?'check_box':'check_box_outline_blank'}</span>
                        </div>`).join('')}
                    </div>
                    <button class="pos-tag sticky-back" onclick="APP.view('dash')">VOLTAR</button>
                </div>`;
        },

        recebimento() {
            const lista = APP.db.agendamentos ?? [];
            const COR_STATUS   = { red: 'var(--danger)', yellow: 'var(--warning)', green: 'var(--success)', 'sem-estoque': 'var(--text-muted)' };
            const LABEL_STATUS = { red: 'RUPTURA', yellow: 'PKL CRÍTICO', green: 'SAUDÁVEL', 'sem-estoque': 'SEM ESTOQUE' };

            // Agrupa por fornecedor
            const porFornecedor = new Map();
            lista.forEach(ag => {
                if (!porFornecedor.has(ag.fornecedor)) porFornecedor.set(ag.fornecedor, []);
                porFornecedor.get(ag.fornecedor).push(ag);
            });

            const totalItens = lista.length;
            const totalConf  = lista.reduce((a, b) => a + b.qtdConfirmada, 0);
            const fornCount  = porFornecedor.size;

            const cardsForn = [...porFornecedor.entries()].map(([forn, itens]) => {
                const qtdForn  = itens.reduce((a, b) => a + b.qtdAgendada, 0);
                const confForn = itens.reduce((a, b) => a + b.qtdConfirmada, 0);
                const doca     = itens[0]?.doca || 'S/DOCA';
                const dataIn   = itens[0]?.dataInicio || '';
                const dataFm   = itens[0]?.dataFim    || '';
                const pedidos  = [...new Set(itens.flatMap(i => i.pedidos))];
                const nfs      = [...new Set(itens.flatMap(i => i.nfs))];
                const idAgend  = itens[0]?.idAgendamento || '';

                const skuRows = itens.map(ag => {
                    const cor = COR_STATUS[ag.status]   || 'var(--text-muted)';
                    const lbl = LABEL_STATUS[ag.status] || ag.status.toUpperCase();
                    return `<div style="display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:7px 10px;border-radius:5px;background:var(--bg);border:1px solid var(--border-color)">
                                <b class="mono" style="font-size:12px">${esc(ag.sku)}</b>
                                <div style="min-width:0">
                                    <div style="font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(ag.desc)}</div>
                                    <div style="display:flex;gap:6px;margin-top:2px;align-items:center">
                                        <span style="font-size:8px;padding:1px 5px;border-radius:2px;font-weight:900;background:${cor}22;border:1px solid ${cor}44;color:${cor}">${lbl}</span>
                                        ${ag.pkl !== null ? `<span class="micro-txt txt-muted">PKL: <b style="color:${ag.pkl<=2?'var(--danger)':'var(--text-main)'}">${ag.pkl} un</b></span>` : ''}
                                    </div>
                                </div>
                                <div style="text-align:right;flex-shrink:0">
                                    <div style="font-size:12px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--success)">${ag.qtdConfirmada} un</div>
                                    <div class="micro-txt txt-muted">agend: ${ag.qtdAgendada}</div>
                                </div>
                            </div>`;
                }).join('');

                return `<div class="op-card margin-b-10" style="border-left:3px solid var(--primary)">
                    <div class="flex-between" style="align-items:flex-start;gap:8px">
                        <div style="flex:1;min-width:0">
                            <div style="font-size:13px;font-weight:900;color:var(--primary);line-height:1.2">${esc(forn)}</div>
                            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:5px;align-items:center">
                                <span style="font-size:9px;padding:2px 7px;border-radius:3px;font-weight:900;letter-spacing:0.5px;background:rgba(255,140,0,0.12);border:1px solid rgba(255,140,0,0.3);color:var(--primary)">${esc(doca)}</span>
                                ${idAgend ? `<span class="micro-txt txt-muted">ID: <b>${esc(idAgend)}</b></span>` : ''}
                            </div>
                        </div>
                        <div style="text-align:right;flex-shrink:0">
                            <div style="font-size:13px;font-weight:700;font-family:'JetBrains Mono',monospace;color:var(--success)">${confForn} un conf.</div>
                            <div class="micro-txt txt-muted">${qtdForn} agendadas</div>
                        </div>
                    </div>
                    <div style="background:var(--bg);border-radius:5px;padding:8px 10px;margin:8px 0;border:1px solid var(--border-color)">
                        <div class="flex-between">
                            <span class="micro-txt txt-muted">Pedido: <b style="color:var(--text-main)">${esc(pedidos.join(', '))}</b></span>
                            ${nfs.length ? `<span class="micro-txt txt-muted">NF: <b style="color:var(--text-main)">${esc(nfs.join(', '))}</b></span>` : ''}
                        </div>
                        <div class="flex-between margin-t-5">
                            <span class="micro-txt txt-muted">Entrada: <b style="color:var(--text-main)">${esc(dataIn)}</b></span>
                            ${dataFm && dataFm !== dataIn ? `<span class="micro-txt txt-muted">Fim: <b style="color:var(--text-main)">${esc(dataFm)}</b></span>` : ''}
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:4px">${skuRows}</div>
                </div>`;
            }).join('');

            return `
                <div class="op-card" style="border-left:3px solid var(--primary)">
                    <div class="label">AGENDA DE RECEBIMENTO</div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px;text-align:center">
                        <div style="background:var(--bg);border-radius:6px;padding:8px;border:1px solid var(--border-color)">
                            <div style="font-size:20px;font-weight:900;font-family:'JetBrains Mono',monospace;color:var(--primary)">${fornCount}</div>
                            <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:var(--text-muted);margin-top:2px">FORNECEDORES</div>
                        </div>
                        <div style="background:var(--bg);border-radius:6px;padding:8px;border:1px solid var(--border-color)">
                            <div style="font-size:20px;font-weight:900;font-family:'JetBrains Mono',monospace;color:var(--primary)">${totalItens}</div>
                            <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:var(--text-muted);margin-top:2px">SKUS AGENDADOS</div>
                        </div>
                        <div style="background:var(--bg);border-radius:6px;padding:8px;border:1px solid var(--border-color)">
                            <div style="font-size:20px;font-weight:900;font-family:'JetBrains Mono',monospace;color:var(--success)">${totalConf}</div>
                            <div style="font-size:9px;font-weight:800;letter-spacing:0.5px;color:var(--text-muted);margin-top:2px">UN CONFIRMADAS</div>
                        </div>
                    </div>
                </div>
                <div class="margin-t-10 margin-b-80">
                    ${lista.length === 0
                        ? '<div class="op-card centered opacity-5" style="padding:30px">Nenhum agendamento carregado</div>'
                        : cardsForn
                    }
                </div>`;
        },

};

// ══════════════════════════════════════════════════════════════
// K11 — ADIÇÕES v5.0: Portal do Cliente + Dashboard do Gestor
// ══════════════════════════════════════════════════════════════

Views.clientePortal = function() {
    try {
        let user = {};
        try { user = JSON.parse(sessionStorage.getItem('k11_user') || '{}'); } catch(_) {}
        const primeiroNome = (user.nome || 'Cliente').split(' ')[0];
        const hora = new Date().getHours();
        const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

        const obras    = (window._K11C && Array.isArray(window._K11C.obras))    ? window._K11C.obras    : [];
        const pedidos  = (window._K11C && Array.isArray(window._K11C.pedidos))  ? window._K11C.pedidos  : [];
        const cart     = (window._K11C && Array.isArray(window._K11C.cart))     ? window._K11C.cart     : [];
        const cartItens = cart.reduce((a, i) => a + (i.qty || 0), 0);
        const cartTotal = window._K11C?.cartTotal || 0;
        const naoLidas  = window._K11C?.notifsNaoLidas || 0;

        // Dispara reloads em background
        if (!window._K11C || window._K11C.obras.length === 0) {
            _cAPI?.get('/api/cliente/obras').then(d => {
                if (d?.ok && window._K11C) {
                    window._K11C.obras = d.data || [];
                    const s = document.getElementById('stage');
                    if (s?.querySelector('.cp-header')) s.innerHTML = Views.clientePortal();
                }
            }).catch(()=>{});
        }
        if (window._K11C && window._K11C.pedidos.length === 0) {
            _cAPI?.get('/api/cliente/pedidos').then(d => {
                if (d?.ok) window._K11C.pedidos = d.data || [];
            }).catch(()=>{});
        }

        const obrasAtivas  = obras.filter(o => (o.status||'active') === 'active').length;
        const progMedio    = obras.length > 0
            ? Math.round(obras.reduce((a, o) => a + (o.progress_pct || 0), 0) / obras.length) : 0;
        const totalGasto   = obras.reduce((a, o) => a + (o.total_spent || 0), 0);
        const pedidosPend  = pedidos.filter(p => p.status === 'pending' || p.status === 'confirmed').length;

        // Cards de obras (máx 3 no portal, resto em obraHome)
        const obraCards = obras.length === 0
            ? `<div style="text-align:center;padding:28px 16px">
                <div style="font-size:36px;opacity:.25;margin-bottom:10px">🏗️</div>
                <div style="font-size:13px;font-weight:700;color:var(--text-soft);margin-bottom:6px">Nenhuma obra cadastrada</div>
                <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Cadastre sua primeira obra para acompanhar o progresso</div>
                <button style="padding:10px 20px;background:var(--primary);color:#000;border:none;border-radius:var(--radius-full);font-size:12px;font-weight:800;cursor:pointer"
                        onclick="APP.view('obraHome')">+ Cadastrar Primeira Obra</button>
               </div>`
            : obras.slice(0, 3).map(p => {
                const prog = p.progress_pct || 0;
                const cor  = prog >= 80 ? 'var(--success)' : prog >= 40 ? 'var(--primary)' : 'var(--warning)';
                const stMap = { active:'Em andamento', paused:'Pausada', done:'Concluída', pending:'Aguardando' };
                const stLbl = stMap[p.status||'active'] || 'Ativa';
                const budget = p.budget || 0;
                const spent  = p.total_spent || 0;
                const budgetPct = budget > 0 ? Math.min(100, Math.round(spent/budget*100)) : null;
                return `
                <div onclick="APP.view('obraHome')" style="padding:12px;border-radius:var(--radius-md);border:1px solid var(--border);background:rgba(255,255,255,.02);margin-bottom:8px;cursor:pointer;transition:all .15s"
                     onmouseover="this.style.background='rgba(255,255,255,.04)';this.style.borderColor='var(--border-mid)'"
                     onmouseout="this.style.background='rgba(255,255,255,.02)';this.style.borderColor='var(--border)'">
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
                        <div style="flex:1;min-width:0">
                            <div style="font-size:13px;font-weight:800;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name||'—')}</div>
                            <div style="font-size:10px;color:var(--text-muted);margin-top:2px">📍 ${esc(p.address||'—').substring(0,40)}${(p.address||'').length>40?'...':''}</div>
                        </div>
                        <span style="font-size:9px;font-weight:800;padding:3px 8px;border-radius:var(--radius-full);background:${p.status==='active'?'rgba(16,185,129,.12)':'rgba(255,255,255,.06)'};color:${p.status==='active'?'var(--success)':'var(--text-muted)'};flex-shrink:0;margin-left:8px">${stLbl}</span>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
                        <div style="background:rgba(255,255,255,.03);border-radius:var(--radius-sm);padding:7px">
                            <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">PROGRESSO</div>
                            <div style="font-size:14px;font-weight:800;color:${cor}">${prog}%</div>
                        </div>
                        ${budgetPct !== null ? `
                        <div style="background:rgba(255,255,255,.03);border-radius:var(--radius-sm);padding:7px">
                            <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">ORÇAMENTO USADO</div>
                            <div style="font-size:14px;font-weight:800;color:${budgetPct>90?'var(--danger)':budgetPct>70?'var(--warning)':'var(--success)'}">${budgetPct}%</div>
                        </div>` : `
                        <div style="background:rgba(255,255,255,.03);border-radius:var(--radius-sm);padding:7px">
                            <div style="font-size:9px;color:var(--text-muted);margin-bottom:2px">TÉRMINO PREV.</div>
                            <div style="font-size:11px;font-weight:700;color:var(--text-soft)">${p.predicted_end_date ? new Date(p.predicted_end_date+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}) : '—'}</div>
                        </div>`}
                    </div>
                    <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden">
                        <div style="width:${prog}%;height:100%;background:${cor};border-radius:2px;transition:width .8s cubic-bezier(.16,1,.3,1)"></div>
                    </div>
                </div>`; }).join('');

        // Notificações rápidas
        const alertas = [];
        if (cartItens > 0) alertas.push({ icon:'🛒', txt:`${cartItens} item(s) no carrinho aguardando finalização`, cor:'var(--warning)', action:"APP.view('clienteCarrinho')" });
        if (pedidosPend > 0) alertas.push({ icon:'📦', txt:`${pedidosPend} pedido(s) em andamento`, cor:'var(--primary)', action:"APP.view('clientePedidos')" });
        obras.forEach(o => {
            if ((o.progress_pct||0) > 0 && (o.budget||0) > 0) {
                const pct = Math.round((o.total_spent||0)/(o.budget)*100);
                if (pct > 85) alertas.push({ icon:'⚠️', txt:`Obra "${o.name.substring(0,20)}" com ${pct}% do orçamento usado`, cor:'var(--danger)', action:"APP.view('clienteFinanceiro')" });
            }
        });

        return `
        <div class="cp-header stagger" style="background:linear-gradient(135deg,rgba(255,140,0,.06) 0%,transparent 60%);border:1px solid var(--border);border-radius:var(--radius-md);padding:18px 16px;margin-bottom:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                <div class="area-badge area-badge-cliente">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
                    PORTAL DO CLIENTE
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                    <button onclick="APP.view('clienteNotificacoes')"
                        style="position:relative;background:none;border:none;cursor:pointer;padding:4px;color:var(--text-muted);font-size:18px">
                        🔔
                        ${naoLidas > 0 ? `<span style="position:absolute;top:-2px;right:-2px;background:#ef4444;color:#fff;font-size:8px;font-weight:900;padding:1px 4px;border-radius:10px;line-height:1.4">${naoLidas}</span>` : ''}
                    </button>
                    <button onclick="APP.view('clientePerfil')"
                        style="width:30px;height:30px;border-radius:50%;background:var(--primary-dim);border:1.5px solid var(--border-glow);color:var(--primary);font-size:13px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center">
                        ${(user.nome||'C').charAt(0).toUpperCase()}
                    </button>
                </div>
            </div>
            <div style="font-size:22px;font-weight:900;color:var(--text-main);letter-spacing:-.4px;margin-bottom:2px">
                ${saudacao}, <span style="color:var(--primary)">${esc(primeiroNome)}</span> 👋
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Gerencie suas obras e materiais em um só lugar</div>

            <!-- KPIs em linha -->
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
                ${[
                    { val: obrasAtivas,              lbl: 'Obras Ativas',   cor: 'var(--success)',  action: "APP.view('obraHome')" },
                    { val: progMedio + '%',           lbl: 'Prog. Médio',    cor: 'var(--primary)',  action: "APP.view('obraHome')" },
                    { val: cartItens,                 lbl: 'No Carrinho',    cor: cartItens>0?'var(--warning)':'var(--text-muted)', action: "APP.view('clienteCarrinho')" },
                    { val: pedidos.length,            lbl: 'Pedidos',        cor: 'var(--text-soft)', action: "APP.view('clientePedidos')" },
                ].map(k => `
                <button onclick="${k.action}" style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 6px;cursor:pointer;text-align:center;transition:all .15s"
                    onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background='rgba(255,255,255,.03)'">
                    <div style="font-size:18px;font-weight:900;color:${k.cor};font-family:var(--font-mono)">${k.val}</div>
                    <div style="font-size:9px;color:var(--text-muted);margin-top:2px;text-transform:uppercase;letter-spacing:.3px">${k.lbl}</div>
                </button>`).join('')}
            </div>
        </div>

        ${alertas.length > 0 ? `
        <div class="stagger" style="margin-bottom:8px">
            ${alertas.map(a => `
            <div onclick="${a.action}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,.02);border:1px solid var(--border);border-left:3px solid ${a.cor};border-radius:var(--radius-md);margin-bottom:6px;cursor:pointer;transition:background .15s"
                 onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background='rgba(255,255,255,.02)'">
                <span style="font-size:16px">${a.icon}</span>
                <span style="font-size:12px;color:var(--text-soft);flex:1">${a.txt}</span>
                <span style="color:${a.cor};font-size:12px">→</span>
            </div>`).join('')}
        </div>` : ''}

        <!-- MINHAS OBRAS -->
        <div class="op-card stagger">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                <div class="label">🏗️ MINHAS OBRAS</div>
                <div style="display:flex;gap:6px">
                    <button style="font-size:10px;padding:5px 12px;background:var(--primary);color:#000;border:none;border-radius:var(--radius-full);font-weight:800;cursor:pointer" onclick="APP.view('obraHome')">+ Nova</button>
                    ${obras.length > 3 ? `<button class="btn-pill btn-pill-ghost" style="font-size:10px;padding:5px 12px" onclick="APP.view('obraHome')">Ver ${obras.length - 3} mais</button>` : ''}
                </div>
            </div>
            ${obraCards}
        </div>

        <!-- AÇÕES RÁPIDAS -->
        <div class="op-card stagger">
            <div class="label margin-b-12">⚡ AÇÕES RÁPIDAS</div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
                ${[
                    { icon:'📦', lbl:'Catálogo', sub:'1000+ produtos', cor:'rgba(255,140,0,.1)', bor:'rgba(255,140,0,.2)', action:"APP.view('clienteCatalogo')" },
                    { icon:'🤖', lbl:'Orçamento IA', sub:'Estimativa instantânea', cor:'rgba(96,165,250,.08)', bor:'rgba(96,165,250,.2)', action:"APP.view('clienteOrcamento')" },
                    { icon:'🛒', lbl:`Carrinho${cartItens>0?' ('+cartItens+')':''}`, sub:cartItens>0?_cFmt(cartTotal):'Adicionar itens', cor:cartItens>0?'rgba(245,158,11,.08)':'rgba(255,255,255,.03)', bor:cartItens>0?'rgba(245,158,11,.25)':'var(--border)', action:"APP.view('clienteCarrinho')" },
                    { icon:'💰', lbl:'Financeiro', sub:`Gasto: ${_cFmt(totalGasto)}`, cor:'rgba(16,185,129,.06)', bor:'rgba(16,185,129,.2)', action:"APP.view('clienteFinanceiro')" },
                ].map(a => `
                <button onclick="${a.action}"
                    style="background:${a.cor};border:1px solid ${a.bor};border-radius:var(--radius-md);padding:14px 12px;cursor:pointer;text-align:left;transition:all .2s;display:flex;align-items:center;gap:10px"
                    onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
                    <span style="font-size:22px;flex-shrink:0">${a.icon}</span>
                    <div style="min-width:0">
                        <div style="font-size:12px;font-weight:800;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.lbl}</div>
                        <div style="font-size:10px;color:var(--text-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.sub}</div>
                    </div>
                </button>`).join('')}
            </div>
        </div>

        ${pedidos.length > 0 ? `
        <!-- ÚLTIMOS PEDIDOS -->
        <div class="op-card stagger">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
                <div class="label">📋 ÚLTIMOS PEDIDOS</div>
                <button class="btn-pill btn-pill-ghost" style="font-size:10px;padding:5px 12px" onclick="APP.view('clientePedidos')">Ver todos</button>
            </div>
            ${pedidos.slice(0,2).map(p => {
                const stMap = { pending:{lbl:'Aguardando',cor:'var(--warning)'}, confirmed:{lbl:'Confirmado',cor:'var(--primary)'}, shipped:{lbl:'Em trânsito',cor:'#60a5fa'}, delivered:{lbl:'Entregue',cor:'var(--success)'}, cancelled:{lbl:'Cancelado',cor:'var(--danger)'} };
                const st = stMap[p.status] || stMap.pending;
                return `
                <div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:6px;cursor:pointer;transition:background .15s"
                     onclick="APP.view('clientePedidos')"
                     onmouseover="this.style.background='rgba(255,255,255,.03)'" onmouseout="this.style.background='transparent'">
                    <div style="width:36px;height:36px;background:rgba(255,140,0,.08);border:1px solid rgba(255,140,0,.2);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">📦</div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:11px;font-weight:700;color:var(--text-main);font-family:var(--font-mono)">${esc(p.id)}</div>
                        <div style="font-size:10px;color:var(--text-muted)">${new Date(p.created_at).toLocaleDateString('pt-BR')} · ${(p.itens||[]).length} item(s)</div>
                    </div>
                    <div style="text-align:right;flex-shrink:0">
                        <div style="font-size:12px;font-weight:800;color:var(--primary)">${_cFmt(p.total||0)}</div>
                        <div style="font-size:9px;color:${st.cor};font-weight:700;margin-top:2px">${st.lbl}</div>
                    </div>
                </div>`; }).join('')}
        </div>` : ''}

        <div style="height:20px"></div>`;

    } catch(e) {
        console.error('[K11 clientePortal]', e);
        return `
        <div class="op-card">
            <div class="label margin-b-12">PORTAL DO CLIENTE</div>
            <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:13px">
                Carregando seu painel...<br>
                <button class="btn-pill btn-pill-ghost" style="margin-top:12px" onclick="APP.view('clientePortal')">Tentar novamente</button>
            </div>
        </div>`;
    }
};

// ── Dashboard enriquecido do Gestor ──
Views._gestorTeamWidget = function() {
    return `
    <div class="op-card stagger gestor-only">
        <div class="flex-between margin-b-12">
            <div class="area-badge area-badge-gestor">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                ÁREA DO GESTOR
            </div>
            <button class="btn-pill btn-pill-ghost" onclick="APP.ui.toast('Gerenciando equipe...','info')" style="font-size:10px;padding:5px 12px">Gerenciar</button>
        </div>
        <div class="team-member-card">
            <div class="team-avatar">JC</div>
            <div class="team-info">
                <div class="team-name">João Carlos</div>
                <div class="team-role">Colaborador · Turno A</div>
            </div>
            <div class="team-kpi">87%</div>
            <div class="team-status-dot online"></div>
        </div>
        <div class="team-member-card">
            <div class="team-avatar" style="background:rgba(96,165,250,.15);border-color:rgba(96,165,250,.3);color:var(--accent-blue)">MF</div>
            <div class="team-info">
                <div class="team-name">Maria Fernanda</div>
                <div class="team-role">Colaboradora · Turno B</div>
            </div>
            <div class="team-kpi" style="color:var(--warning)">72%</div>
            <div class="team-status-dot offline"></div>
        </div>
        <div class="team-member-card">
            <div class="team-avatar" style="background:rgba(16,185,129,.15);border-color:rgba(16,185,129,.3);color:var(--success)">RP</div>
            <div class="team-info">
                <div class="team-name">Roberto Pereira</div>
                <div class="team-role">Colaborador · Turno A</div>
            </div>
            <div class="team-kpi" style="color:var(--success)">94%</div>
            <div class="team-status-dot online"></div>
        </div>
    </div>`;
};

// Patch: adiciona widget de gestor no dash
const _origDash = Views.dash;
Views.dash = function() {
    const html = _origDash.call(this);
    return html + Views._gestorTeamWidget();
};


// ════════════════════════════════════════════════════════════════
// K11 OMNI ELITE — VIEWS DO PORTAL DO CLIENTE
// Todas as views consomem /api/cliente/* e respeitam role-cliente
// ════════════════════════════════════════════════════════════════

// ── ESTADO COMPARTILHADO DO CLIENTE ─────────────────────────────
window._K11C = window._K11C || {
  cart:      [],
  obras:     [],
  pedidos:   [],
  catalogo:  [],
  cats:      [],
  catFilter: 'Todos',
  catSearch: '',
  orcamentos: [],
  cartLoaded: false,
  notifsNaoLidas: 0,
};

// ── HELPERS ──────────────────────────────────────────────────────
const _cAPI = window._cAPI || (() => {
  const tk = () => (typeof K11Auth !== 'undefined' && K11Auth.getToken()) || sessionStorage.getItem('k11_token') || localStorage.getItem('om_tk') || '';
  const h  = () => ({ Authorization: `Bearer ${tk()}`, 'Content-Type': 'application/json' });
  const base = window.K11_SERVER_URL || window.location.origin;

  async function get(path) {
    const r = await fetch(base + path, { headers: h() });
    if (!r.ok && r.status === 401) { APP.ui.toast('Sessão expirada', 'error'); return null; }
    return r.json();
  }
  async function post(path, body) {
    const r = await fetch(base + path, { method:'POST', headers: h(), body: JSON.stringify(body) });
    return r.json();
  }
  async function put(path, body) {
    const r = await fetch(base + path, { method:'PUT', headers: h(), body: JSON.stringify(body) });
    return r.json();
  }
  async function del(path) {
    const r = await fetch(base + path, { method:'DELETE', headers: h() });
    return r.json();
  }
  return { get, post, put, del };
})();
window._cAPI = _cAPI;

function _cFmt(v) { return 'R$ ' + (v||0).toLocaleString('pt-BR', { minimumFractionDigits:2 }); }

async function _cLoadCart() {
  try {
    const d = await _cAPI.get('/api/cliente/carrinho');
    if (d?.ok) {
      window._K11C.cart = d.data || [];
      window._K11C.cartTotal = d.total || 0;
      window._K11C.cartFrete = d.frete || 0;
      window._K11C.cartLoaded = true;
      _cUpdateCartBadge();
    }
  } catch(_) {}
}

function _cUpdateCartBadge() {
  const total = window._K11C.cart.reduce((a, i) => a + (i.qty||0), 0);
  const el = document.getElementById('cart-nav-badge');
  if (el) { el.textContent = total; el.style.display = total > 0 ? 'block' : 'none'; }
}

// ── VIEW: CATÁLOGO ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// VIEW: CATÁLOGO — Hierárquico com Seções e Subseções
// ═══════════════════════════════════════════════════════════════

// Estado interno do catálogo
window._K11CAT = window._K11CAT || {
  secoes:      [],     // árvore de seções vinda da API
  secaoAtiva:  null,   // key da seção expandida
  subSecaoAtiva: null, // key da subseção ativa
  busca:       '',
  loading:     false,
  loaded:      false,
  paginaAtual: 1,
  totalProds:  0,
  LIM:         40,
};

// Carrega catálogo completo (seções + primeira página)
async function _catCarregar(forceRefresh) {
  if (window._K11CAT.loaded && !forceRefresh) return;
  window._K11CAT.loading = true;
  _catRenderStatus();
  try {
    const d = await _cAPI.get('/api/cliente/produtos?limit=400');
    if (d?.ok) {
      window._K11C.catalogo     = d.data  || [];
      window._K11C.cats         = d.cats  || ['Todos'];
      window._K11CAT.secoes     = d.secoes || [];
      window._K11CAT.totalProds = d.total  || d.data?.length || 0;
      window._K11CAT.loaded     = true;
    }
  } catch(e) {}
  window._K11CAT.loading = false;
  _catRenderAll();
}

// Força recarga ao entrar na view (invalida cache client-side a cada 5 min)
Views.clienteCatalogo = function() {
  const agora = Date.now();
  if (!window._K11CAT._lastLoad || agora - window._K11CAT._lastLoad > 5 * 60 * 1000) {
    window._K11CAT.loaded = false;
    window._K11CAT._lastLoad = agora;
  }
  _catCarregar();

  return `
  <div class="stagger" id="catalogo-root">
    <!-- HEADER -->
    <div class="op-card" style="margin-bottom:8px;padding:14px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <div class="label" style="color:var(--primary);margin-bottom:2px">🏪 CATÁLOGO OBRAMAX</div>
          <div style="font-size:10px;color:var(--text-muted)" id="cat-counter">
            ${window._K11CAT.totalProds > 0 ? window._K11CAT.totalProds + ' produtos disponíveis' : 'Carregando estoque...'}
          </div>
        </div>
        <button onclick="_catCarregar(true)" title="Atualizar catálogo"
          style="background:var(--primary-dim);border:1px solid var(--border-glow);color:var(--primary);border-radius:var(--radius-sm);padding:6px 10px;font-size:11px;cursor:pointer;font-weight:700">
          ↻ Atualizar
        </button>
      </div>

      <!-- BUSCA GLOBAL -->
      <div style="position:relative">
        <input type="text" id="cat-search-inp"
          placeholder="🔍  Buscar produto ou código..."
          value="${window._K11CAT.busca}"
          oninput="window._K11CAT.busca=this.value;window._K11CAT.secaoAtiva=null;window._K11CAT.subSecaoAtiva=null;_catRenderAll()"
          style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:10px 12px;font-size:13px;color:var(--text-main);outline:none;font-family:inherit;box-sizing:border-box">
      </div>
    </div>

    <!-- ÁREA PRINCIPAL: seções à esquerda + produtos à direita -->
    <div id="cat-layout" style="display:flex;gap:8px;align-items:flex-start">

      <!-- SIDEBAR: seções + subseções -->
      <div id="cat-sidebar" style="width:130px;flex-shrink:0">
        ${_catSidebarHTML()}
      </div>

      <!-- PAINEL DE PRODUTOS -->
      <div id="cat-main" style="flex:1;min-width:0">
        ${_catProdPainelHTML()}
      </div>

    </div>
  </div>`;
};

// ── SIDEBAR: seções + subseções ──────────────────────────────────
function _catSidebarHTML() {
  const secoes  = window._K11CAT.secoes;
  const ativa   = window._K11CAT.secaoAtiva;
  const subAtiv = window._K11CAT.subSecaoAtiva;

  if (!secoes.length) {
    return `<div style="padding:20px 0;text-align:center">
      <div style="font-size:24px;opacity:.3;margin-bottom:6px">📦</div>
      <div style="font-size:11px;color:var(--text-muted)">Carregando...</div>
    </div>`;
  }

  // Botão "Tudo"
  let html = `
  <button onclick="window._K11CAT.secaoAtiva=null;window._K11CAT.subSecaoAtiva=null;_catRenderAll()"
    style="display:flex;align-items:center;gap:6px;width:100%;padding:8px 10px;border:none;border-radius:var(--radius-sm);cursor:pointer;margin-bottom:4px;text-align:left;
           background:${!ativa?'var(--primary-dim)':'transparent'};color:${!ativa?'var(--primary)':'var(--text-muted)'}">
    <span style="font-size:14px">🏪</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:10px;font-weight:700;letter-spacing:.3px">Tudo</div>
      <div style="font-size:9px;opacity:.7">${window._K11CAT.totalProds}</div>
    </div>
  </button>`;

  secoes.forEach(s => {
    const isAtiv = ativa === s.key;
    html += `
    <button onclick="window._K11CAT.secaoAtiva='${s.key}';window._K11CAT.subSecaoAtiva=null;_catRenderAll()"
      style="display:flex;align-items:center;gap:6px;width:100%;padding:8px 10px;border:none;border-radius:var(--radius-sm);cursor:pointer;margin-bottom:2px;text-align:left;
             background:${isAtiv?'var(--primary-dim)':'transparent'};color:${isAtiv?'var(--primary)':'var(--text-soft)'};
             border-left:2px solid ${isAtiv?'var(--primary)':'transparent'}">
      <span style="font-size:14px">${s.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:${isAtiv?'800':'600'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.label}</div>
        <div style="font-size:9px;opacity:.6">${s.total}</div>
      </div>
    </button>`;

    // Subseções da seção ativa
    if (isAtiv && s.subSecoes?.length) {
      s.subSecoes.forEach(ss => {
        const isSubAtiv = subAtiv === ss.key;
        html += `
        <button onclick="window._K11CAT.subSecaoAtiva='${ss.key}';_catRenderAll()"
          style="display:flex;align-items:center;gap:5px;width:100%;padding:6px 10px 6px 18px;border:none;border-radius:var(--radius-sm);cursor:pointer;margin-bottom:2px;text-align:left;
                 background:${isSubAtiv?'rgba(255,140,0,.08)':'transparent'};color:${isSubAtiv?'var(--primary)':'var(--text-muted)'}">
          <span style="font-size:11px">${ss.icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:9.5px;font-weight:${isSubAtiv?'800':'500'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ss.label}</div>
            <div style="font-size:8.5px;opacity:.6">${ss.total}</div>
          </div>
        </button>`;
      });
    }
  });

  return html;
}

// ── PAINEL DE PRODUTOS ───────────────────────────────────────────
function _catProdPainelHTML() {
  if (window._K11CAT.loading) {
    return `<div style="text-align:center;padding:40px 20px;color:var(--text-muted)">
      <div style="font-size:28px;margin-bottom:10px;animation:spin 1.2s linear infinite;display:inline-block">⚙️</div>
      <div style="font-size:12px">Carregando catálogo...</div>
    </div>`;
  }

  const q         = window._K11CAT.busca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const secaoFilt = window._K11CAT.secaoAtiva;
  const subFilt   = window._K11CAT.subSecaoAtiva;

  let prods = window._K11C.catalogo;

  if (secaoFilt) prods = prods.filter(p => p.secao === secaoFilt);
  if (subFilt)   prods = prods.filter(p => p.subSecao === subFilt);
  if (q)         prods = prods.filter(p => {
    const n = (p.name||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return n.includes(q) || p.sku.toLowerCase().includes(q);
  });

  if (!window._K11CAT.loaded && prods.length === 0) {
    return `<div style="text-align:center;padding:40px 20px;color:var(--text-muted)">
      <div style="font-size:28px;margin-bottom:8px;opacity:.3">📦</div>
      <div style="font-size:12px">Aguardando catálogo...</div>
    </div>`;
  }

  if (prods.length === 0) {
    return `<div style="text-align:center;padding:40px 20px;color:var(--text-muted)">
      <div style="font-size:28px;margin-bottom:8px;opacity:.3">🔍</div>
      <div style="font-size:12px">Nenhum produto encontrado</div>
      ${q ? `<button onclick="window._K11CAT.busca='';document.getElementById('cat-search-inp').value='';_catRenderAll()"
               style="margin-top:10px;font-size:11px;padding:6px 14px;border:1px solid var(--border-mid);border-radius:var(--radius-full);background:transparent;color:var(--text-soft);cursor:pointer">
               Limpar busca
             </button>` : ''}
    </div>`;
  }

  // Se busca global ou "tudo": agrupa por seção → subseção
  if (!secaoFilt && !subFilt && !q) {
    return _catGruposPorSecao(prods);
  }

  // Se tem seção mas não subseção: agrupa por subseção
  if (secaoFilt && !subFilt) {
    return _catGruposPorSubSecao(prods, secaoFilt);
  }

  // Lista plana (subseção ativa ou busca)
  const titulo = subFilt
    ? (window._K11CAT.secoes.find(s=>s.key===secaoFilt)?.subSecoes?.find(ss=>ss.key===subFilt)?.label || '')
    : (q ? `Resultados para "${window._K11CAT.busca}"` : '');

  return `
  ${titulo ? `<div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;padding:0 2px;margin-bottom:10px">${titulo} · <span style="color:var(--primary)">${prods.length}</span></div>` : ''}
  ${prods.map(_catCardProduto).join('')}`;
}

// Renderiza produtos agrupados por seção (vista "Tudo")
function _catGruposPorSecao(prods) {
  const grupos = {};
  prods.forEach(p => {
    if (!grupos[p.secao]) grupos[p.secao] = { label: p.secaoLabel, icon: p.secaoIcon, key: p.secao, items: [] };
    grupos[p.secao].items.push(p);
  });

  return Object.values(grupos).map(g => {
    const preview = g.items.slice(0, 3);
    return `
    <div style="margin-bottom:12px;border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden">
      <button onclick="window._K11CAT.secaoAtiva='${g.key}';window._K11CAT.subSecaoAtiva=null;_catRenderAll()"
        style="width:100%;display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--card-bg-input);border:none;cursor:pointer;text-align:left">
        <span style="font-size:18px">${g.icon}</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:800;color:var(--text-main)">${g.label}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:1px">${g.items.length} produtos</div>
        </div>
        <span style="color:var(--primary);font-size:12px;font-weight:700">Ver todos →</span>
      </button>
      <div style="padding:8px;border-top:1px solid var(--border);background:rgba(0,0,0,.02)">
        ${preview.map(p => _catCardProdutoCompact(p)).join('')}
        ${g.items.length > 3 ? `<div style="text-align:center;padding:6px 0;font-size:10px;color:var(--text-muted)">+ ${g.items.length - 3} mais nesta seção</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// Renderiza produtos agrupados por subseção (dentro de uma seção)
function _catGruposPorSubSecao(prods, secaoKey) {
  const secao = window._K11CAT.secoes.find(s => s.key === secaoKey);
  const grupos = {};
  prods.forEach(p => {
    if (!grupos[p.subSecao]) grupos[p.subSecao] = { label: p.subSecaoLabel, icon: p.subSecaoIcon, key: p.subSecao, items: [] };
    grupos[p.subSecao].items.push(p);
  });

  const nomeSecao = secao?.label || secaoKey;
  return `
  <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;padding:0 2px;margin-bottom:10px">
    ${secao?.icon||''} ${nomeSecao} · <span style="color:var(--primary)">${prods.length} produtos</span>
  </div>
  ${Object.values(grupos).map(g => `
    <div style="margin-bottom:12px">
      <button onclick="window._K11CAT.subSecaoAtiva='${g.key}';_catRenderAll()"
        style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;background:rgba(255,140,0,.05);border:1px solid rgba(255,140,0,.15);border-radius:var(--radius-sm);margin-bottom:6px;cursor:pointer;text-align:left">
        <span style="font-size:14px">${g.icon}</span>
        <div style="flex:1">
          <span style="font-size:11px;font-weight:700;color:var(--text-main)">${g.label}</span>
          <span style="font-size:10px;color:var(--text-muted);margin-left:6px">${g.items.length}</span>
        </div>
        <span style="font-size:10px;color:var(--primary)">→</span>
      </button>
      ${g.items.slice(0,2).map(_catCardProdutoCompact).join('')}
      ${g.items.length > 2 ? `<button onclick="window._K11CAT.subSecaoAtiva='${g.key}';_catRenderAll()"
        style="width:100%;padding:6px;font-size:10px;color:var(--primary);background:transparent;border:1px dashed rgba(255,140,0,.2);border-radius:var(--radius-sm);cursor:pointer;margin-top:4px">
        Ver todos os ${g.items.length} produtos →
      </button>` : ''}
    </div>
  `).join('')}`;
}

// Card compacto para preview dentro dos grupos
function _catCardProdutoCompact(p) {
  const inCart = window._K11C.cart.find(i => i.sku === p.sku);
  return `
  <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:var(--radius-sm);border:1px solid var(--border);margin-bottom:4px;background:var(--card-bg)">
    <div style="font-size:16px;flex-shrink:0">${p.icon||'📦'}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:11px;font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</div>
      <div style="font-size:10px;color:var(--primary);font-weight:700;margin-top:1px">${_cFmt(p.price)}<span style="color:var(--text-muted);font-weight:400"> / ${p.unit}</span></div>
    </div>
    <button onclick="Views._cAddCartDireto('${p.sku}', this)"
      style="flex-shrink:0;background:${inCart?'var(--success-dim)':'var(--primary-dim)'};border:1px solid ${inCart?'rgba(16,185,129,.3)':'var(--border-glow)'};color:${inCart?'var(--success)':'var(--primary)'};border-radius:var(--radius-sm);padding:5px 10px;font-size:10px;font-weight:700;cursor:pointer;white-space:nowrap">
      ${inCart ? '✓' : '+'}
    </button>
  </div>`;
}

// Card completo com controle de quantidade
function _catCardProduto(p) {
  const inCart = window._K11C.cart.find(i => i.sku === p.sku);
  const qty = inCart?.qty || 1;
  return `
  <div style="display:flex;align-items:center;gap:10px;padding:11px;border-radius:var(--radius-md);border:1px solid var(--border);margin-bottom:7px;background:var(--card-bg-input);transition:border-color .15s"
    onmouseover="this.style.borderColor='var(--border-mid)'" onmouseout="this.style.borderColor='var(--border)'">
    <div style="width:40px;height:40px;background:var(--primary-dim);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${p.icon||'📦'}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:12px;font-weight:700;color:var(--text-main);margin-bottom:2px;line-height:1.3">${esc(p.name)}</div>
      <div style="font-size:10px;color:var(--text-muted)">${p.sku} · ${p.unit}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:3px">
        <span style="font-size:14px;font-weight:800;color:var(--primary)">${_cFmt(p.price)}</span>
        <span style="font-size:9px;padding:2px 6px;border-radius:10px;background:var(--success-dim);color:var(--success);font-weight:700">✓ Estoque: ${p.stock} ${p.unit}</span>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;flex-shrink:0">
      <div style="display:flex;align-items:center;background:var(--border);border-radius:var(--radius-sm);overflow:hidden">
        <button onclick="Views._cChgQty('${p.sku}',-1)" style="background:none;border:none;color:var(--text-main);width:24px;height:24px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">−</button>
        <span id="cqty-${p.sku}" style="width:26px;text-align:center;font-size:12px;font-weight:700;color:var(--text-main)">${qty}</span>
        <button onclick="Views._cChgQty('${p.sku}',1)" style="background:none;border:none;color:var(--text-main);width:24px;height:24px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">+</button>
      </div>
      <button onclick="Views._cAddCart('${p.sku}')"
        style="background:${inCart?'var(--success-dim)':'var(--primary-dim)'};border:1px solid ${inCart?'rgba(16,185,129,.3)':'var(--border-glow)'};color:${inCart?'var(--success)':'var(--primary)'};border-radius:var(--radius-sm);padding:4px 9px;font-size:10px;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap">
        ${inCart ? '✓ Adicionado' : '🛒 Carrinho'}
      </button>
    </div>
  </div>`;
}

// Re-renderiza as partes dinâmicas sem recriar o layout
function _catRenderAll() {
  const sidebar = document.getElementById('cat-sidebar');
  const main    = document.getElementById('cat-main');
  const counter = document.getElementById('cat-counter');
  if (sidebar) sidebar.innerHTML = _catSidebarHTML();
  if (main)    main.innerHTML    = _catProdPainelHTML();
  if (counter) counter.textContent = window._K11CAT.totalProds > 0
    ? window._K11CAT.totalProds + ' produtos disponíveis' : 'Carregando estoque...';
}

function _catRenderStatus() {
  const main = document.getElementById('cat-main');
  if (main && window._K11CAT.loading) {
    main.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">
      <div style="font-size:24px;margin-bottom:8px">⚙️</div>
      <div style="font-size:12px">Sincronizando estoque...</div>
    </div>`;
  }
}

Views._renderCatGrid = function() {
  _catRenderAll();
};

Views._cChgQty = function(sku, delta) {
  const el = document.getElementById('cqty-'+sku);
  if (el) el.textContent = Math.max(1, parseInt(el.textContent||'1') + delta);
};

Views._cAddCartDireto = async function(sku, btn) {
  try {
    if (btn) { btn.textContent = '...'; btn.disabled = true; }
    const d = await _cAPI.post('/api/cliente/carrinho', { sku, qty: 1 });
    if (d?.ok) {
      await _cLoadCart();
      APP.ui.toast('🛒 ' + (d.message || 'Adicionado!'), 'success');
      _catRenderAll();
    } else { APP.ui.toast(d?.error || 'Erro ao adicionar', 'error'); }
  } catch { APP.ui.toast('Erro de conexão', 'error'); }
  if (btn) btn.disabled = false;
};

Views._cAddCart = async function(sku) {
  const qtyEl = document.getElementById('cqty-'+sku);
  const qty   = Math.max(1, parseInt(qtyEl?.textContent || '1'));
  try {
    const d = await _cAPI.post('/api/cliente/carrinho', { sku, qty });
    if (d?.ok) {
      await _cLoadCart();
      APP.ui.toast('🛒 ' + (d.message || 'Adicionado ao carrinho!'), 'success');
      _catRenderAll();
    } else { APP.ui.toast(d?.error || 'Erro ao adicionar', 'error'); }
  } catch { APP.ui.toast('Erro de conexão', 'error'); }
};

// ── VIEW: CARRINHO ───────────────────────────────────────────────
Views.clienteCarrinho = function() {
  _cLoadCart().then(() => {
    const stage = document.getElementById('stage');
    if (stage && stage.querySelector('#cart-body')) {
      stage.querySelector('#cart-body').outerHTML = Views._cartBodyHTML();
    }
  });

  return `
  <div class="stagger">
    <div class="op-card">
      <div class="flex-between margin-b-12">
        <div class="label">MEU CARRINHO</div>
        <button class="btn-pill btn-pill-ghost" onclick="APP.view('clienteCatalogo')">+ Mais itens</button>
      </div>
      <div id="cart-body">${Views._cartBodyHTML()}</div>
    </div>
  </div>`;
};

Views._cartBodyHTML = function() {
  const cart = window._K11C.cart;
  if (!window._K11C.cartLoaded) {
    return '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Carregando carrinho...</div>';
  }
  if (cart.length === 0) {
    return `<div style="text-align:center;padding:40px 20px">
      <div style="font-size:36px;margin-bottom:12px;opacity:.35">🛒</div>
      <div style="font-size:14px;font-weight:700;color:var(--text-main);margin-bottom:6px">Carrinho vazio</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Adicione produtos do catálogo Obramax</div>
      <button class="btn-pill btn-pill-primary" onclick="APP.view('clienteCatalogo')">Ver Catálogo →</button>
    </div>`;
  }

  const total = window._K11C.cartTotal || 0;
  const frete = window._K11C.cartFrete || 0;

  const itens = cart.map((item, idx) => {
    const p = item.produto;
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="width:40px;height:40px;background:var(--primary-dim);border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${p?.icon||'📦'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p?.name||item.sku)}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:1px">${item.sku}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
          <div style="display:flex;align-items:center;background:var(--border);border-radius:var(--radius-sm);overflow:hidden">
            <button onclick="Views._cCartQty('${item.sku}',${item.qty-1})" style="background:none;border:none;color:var(--text-main);width:26px;height:26px;cursor:pointer;font-size:14px">−</button>
            <span style="width:28px;text-align:center;font-size:12px;font-weight:700;color:var(--text-main)">${item.qty}</span>
            <button onclick="Views._cCartQty('${item.sku}',${item.qty+1})" style="background:none;border:none;color:var(--text-main);width:26px;height:26px;cursor:pointer;font-size:14px">+</button>
          </div>
          <button onclick="Views._cCartRm('${item.sku}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:13px;padding:2px 4px;transition:color .15s" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-muted)'">🗑️</button>
        </div>
      </div>
      <div style="font-size:14px;font-weight:800;color:var(--text-main);flex-shrink:0">${_cFmt(item.subtotal)}</div>
    </div>`;
  }).join('');

  return `
  ${itens}
  <div style="margin-top:14px;background:var(--card-bg-input);border-radius:var(--radius-md);padding:14px">
    <div class="flex-between" style="font-size:13px;padding:4px 0"><span style="color:var(--text-muted)">Subtotal</span><span style="font-weight:600;color:var(--text-main)">${_cFmt(total)}</span></div>
    <div class="flex-between" style="font-size:13px;padding:4px 0">
      <span style="color:var(--text-muted)">Frete</span>
      <span style="font-weight:600;color:${frete===0?'var(--success)':'var(--text-main)'}">${frete===0?'🎉 GRÁTIS':_cFmt(frete)}</span>
    </div>
    ${frete>0?`<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">Frete grátis em compras acima de R$ 500</div>`:''}
    <div class="flex-between" style="padding-top:10px;border-top:1px solid var(--border-mid);margin-top:6px">
      <span style="font-size:13px;color:var(--text-muted)">Total</span>
      <span style="font-family:var(--font-ui);font-size:20px;font-weight:800;color:var(--primary)">${_cFmt(total+frete)}</span>
    </div>
  </div>
  <button onclick="Views._cCheckout()" class="btn-pill btn-pill-primary" style="width:100%;margin-top:14px;padding:13px;font-size:13px;border-radius:var(--radius-md);text-align:center">
    Finalizar Pedido →
  </button>`;
};

Views._cCartQty = async function(sku, qty) {
  try {
    await _cAPI.put(`/api/cliente/carrinho/${sku}`, { qty });
    await _cLoadCart();
    const el = document.getElementById('cart-body');
    if (el) el.innerHTML = Views._cartBodyHTML();
  } catch(_) {}
};

Views._cCartRm = async function(sku) {
  try {
    await _cAPI.del(`/api/cliente/carrinho/${sku}`);
    await _cLoadCart();
    const el = document.getElementById('cart-body');
    if (el) el.innerHTML = Views._cartBodyHTML();
    APP.ui.toast('Item removido', 'info');
  } catch(_) {}
};

Views._cCheckout = async function() {
  if (window._K11C.cart.length === 0) return;

  // Garante obras carregadas
  if (window._K11C.obras.length === 0) {
    try {
      const d = await _cAPI.get('/api/cliente/obras');
      if (d?.ok) window._K11C.obras = d.data || [];
    } catch(_) {}
  }

  const total    = window._K11C.cartTotal || 0;
  const frete    = window._K11C.cartFrete || 0;
  const totalFim = total + frete;
  const cart     = window._K11C.cart;
  const obras    = window._K11C.obras;

  // Resumo dos itens
  const itensResume = cart.slice(0, 4).map(i => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.produto?.name || i.sku)}</div>
        <div style="font-size:10px;color:var(--text-muted)">Qtd: ${i.qty} ${i.produto?.unit||'un'}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--text-main);flex-shrink:0;margin-left:10px">${_cFmt(i.subtotal||0)}</div>
    </div>`).join('');

  const maisItens = cart.length > 4
    ? `<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:6px">+ ${cart.length - 4} item(s) mais</div>`
    : '';

  // Select de obras
  const obrasSelect = obras.length > 0
    ? `<select id="ck-obra" style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:10px 12px;font-size:13px;color:var(--text-main);outline:none;font-family:inherit"
         onchange="Views._ckAutoFillAddress()">
         <option value="">— Sem vinculação —</option>
         ${obras.map(o => `<option value="${o.id}" data-addr="${esc(o.address||'')}">${esc(o.name)}</option>`).join('')}
       </select>`
    : `<div style="font-size:12px;color:var(--text-muted);padding:8px 0">Nenhuma obra cadastrada. <button onclick="APP.view('obraHome')" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:12px;text-decoration:underline">Cadastrar agora →</button></div>`;

  const stage = document.getElementById('stage');
  stage.innerHTML = `
  <div class="stagger">
    <!-- HEADER -->
    <div class="op-card" style="margin-bottom:8px;padding:14px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="label">🛒 FINALIZAR PEDIDO</div>
        <button class="btn-pill btn-pill-ghost" onclick="APP.view('clienteCarrinho')">← Carrinho</button>
      </div>
    </div>

    <!-- RESUMO DO PEDIDO -->
    <div class="op-card" style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">RESUMO DO PEDIDO</div>
      ${itensResume}${maisItens}
      <div style="background:var(--card-bg-input);border-radius:var(--radius-md);padding:12px;margin-top:10px">
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
          <span style="color:var(--text-muted)">Subtotal (${cart.length} item(s))</span>
          <span>${_cFmt(total)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
          <span style="color:var(--text-muted)">Frete</span>
          <span style="color:${frete===0?'var(--success)':'var(--text-main)'}">${frete===0?'🎉 GRÁTIS':_cFmt(frete)}</span>
        </div>
        ${frete > 0 ? `<div style="font-size:10px;color:var(--text-muted);padding-bottom:4px">Frete grátis em compras acima de R$ 500</div>` : ''}
        <div style="display:flex;justify-content:space-between;border-top:1px solid var(--border-mid);padding-top:10px;margin-top:6px">
          <span style="font-size:13px;font-weight:700;color:var(--text-main)">TOTAL</span>
          <span style="font-size:20px;font-weight:900;color:var(--primary);font-family:var(--font-mono)">${_cFmt(totalFim)}</span>
        </div>
      </div>
    </div>

    <!-- VINCULAR À OBRA -->
    <div class="op-card" style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">🏗️ VINCULAR À OBRA</div>
      ${obrasSelect}
    </div>

    <!-- ENTREGA -->
    <div class="op-card" style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">📍 ENDEREÇO DE ENTREGA</div>
      <input type="text" id="ck-end"
        placeholder="Rua, número, bairro, cidade..."
        style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:10px 12px;font-size:13px;color:var(--text-main);outline:none;font-family:inherit;box-sizing:border-box;margin-bottom:10px">
      <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">📝 OBSERVAÇÕES</div>
      <textarea id="ck-obs"
        placeholder="Instruções para entrega, materiais específicos, horário preferido..."
        rows="3"
        style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:10px 12px;font-size:13px;color:var(--text-main);outline:none;font-family:inherit;resize:vertical;box-sizing:border-box"></textarea>
    </div>

    <!-- PRAZO -->
    <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.2);border-radius:var(--radius-md);margin-bottom:12px">
      <span style="font-size:18px">🚚</span>
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--text-main)">Entrega em até 2 dias úteis</div>
        <div style="font-size:11px;color:var(--text-muted)">Pedidos até 14h entregues no dia seguinte</div>
      </div>
    </div>

    <!-- CTA -->
    <button id="ck-btn" onclick="Views._cConfirmarPedido()"
      style="width:100%;padding:14px;background:var(--primary);color:#000;border:none;border-radius:var(--radius-full);font-size:14px;font-weight:900;cursor:pointer;letter-spacing:.3px">
      ✅ Confirmar Pedido · ${_cFmt(totalFim)}
    </button>
    <div style="height:20px"></div>
  </div>`;
};

Views._ckAutoFillAddress = function() {
  const sel = document.getElementById('ck-obra');
  const inp = document.getElementById('ck-end');
  if (!sel || !inp) return;
  const opt = sel.options[sel.selectedIndex];
  const addr = opt?.getAttribute('data-addr') || '';
  if (addr && !inp.value) inp.value = addr;
};

Views._cConfirmarPedido = async function() {
  const end     = document.getElementById('ck-end')?.value.trim() || '';
  const obs     = document.getElementById('ck-obs')?.value.trim() || '';
  const obraId  = document.getElementById('ck-obra')?.value || null;
  const btn     = document.getElementById('ck-btn');

  if (!end) {
    APP.ui.toast('Informe o endereço de entrega.', 'error');
    document.getElementById('ck-end')?.focus();
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Confirmando pedido...'; }

  try {
    const d = await _cAPI.post('/api/cliente/pedidos', {
      endereco_entrega: end,
      observacoes:      obs,
      obra_id:          obraId || undefined,
    });

    if (d?.ok) {
      // Atualiza estado local
      await _cLoadCart();
      window._K11C.pedidos = []; // força reload na próx. visita

      // Página de sucesso
      const stage = document.getElementById('stage');
      const pedId = d.data?.id || 'PED-' + Date.now();
      const prev  = d.data?.previsao_entrega
        ? new Date(d.data.previsao_entrega + 'T00:00:00').toLocaleDateString('pt-BR')
        : 'em até 2 dias úteis';

      stage.innerHTML = `
      <div class="stagger" style="text-align:center;padding:40px 20px">
        <div style="font-size:56px;margin-bottom:16px;animation:bounceIn .5s ease">🎉</div>
        <div style="font-size:20px;font-weight:900;color:var(--success);margin-bottom:8px">Pedido Confirmado!</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;font-family:var(--font-mono)">${esc(pedId)}</div>
        <div style="font-size:13px;color:var(--text-soft);margin-bottom:24px;line-height:1.7">
          Seu pedido foi recebido com sucesso.<br>
          🚚 Previsão de entrega: <strong style="color:var(--primary)">${prev}</strong>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;max-width:280px;margin:0 auto">
          <button onclick="APP.view('clientePedidos')"
            style="padding:13px;background:var(--primary);color:#000;border:none;border-radius:var(--radius-full);font-size:13px;font-weight:800;cursor:pointer">
            📋 Ver Meus Pedidos
          </button>
          <button onclick="APP.view('clienteCatalogo')"
            style="padding:13px;background:transparent;border:1px solid var(--border-mid);border-radius:var(--radius-full);color:var(--text-soft);font-size:13px;font-weight:700;cursor:pointer">
            📦 Continuar Comprando
          </button>
          <button onclick="APP.view('clientePortal')"
            style="padding:10px;background:none;border:none;color:var(--text-muted);font-size:12px;cursor:pointer">
            Ir para o Portal
          </button>
        </div>
      </div>`;

      APP.ui.toast('🎉 Pedido #' + pedId.slice(-6) + ' confirmado!', 'success');
    } else {
      APP.ui.toast(d?.error || 'Erro ao confirmar pedido.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Pedido'; }
    }
  } catch(e) {
    APP.ui.toast('Erro de conexão: ' + (e.message || ''), 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar Pedido'; }
  }
};

// ── VIEW: PEDIDOS ────────────────────────────────────────────────
Views.clientePedidos = function() {
  _cAPI.get('/api/cliente/pedidos').then(d => {
    if (d?.ok) {
      window._K11C.pedidos = d.data || [];
      const el = document.getElementById('pedidos-list');
      if (el) el.innerHTML = Views._pedidosHTML();
    }
  }).catch(()=>{});

  return `
  <div class="stagger">
    <div class="op-card">
      <div class="label margin-b-12">MEUS PEDIDOS</div>
      <div id="pedidos-list">${Views._pedidosHTML()}</div>
    </div>
  </div>`;
};

Views._pedidosHTML = function() {
  const pedidos = window._K11C.pedidos;
  if (pedidos.length === 0) {
    return `<div style="text-align:center;padding:40px 20px">
      <div style="font-size:32px;opacity:.35;margin-bottom:12px">📋</div>
      <div style="font-size:14px;font-weight:700;color:var(--text-main);margin-bottom:6px">Nenhum pedido ainda</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Seus pedidos aparecerão aqui após confirmação</div>
      <button class="btn-pill btn-pill-primary" onclick="APP.view('clienteCatalogo')">Ver Catálogo →</button>
    </div>`;
  }

  const statusMap = {
    pending:   { lbl:'Aguardando', cor:'var(--warning)' },
    confirmed: { lbl:'Confirmado', cor:'var(--primary)' },
    preparing: { lbl:'Separando',  cor:'var(--primary)' },
    shipped:   { lbl:'Transporte', cor:'var(--text-soft)' },
    delivered: { lbl:'Entregue',   cor:'var(--success)' },
    cancelled: { lbl:'Cancelado',  cor:'var(--danger)' },
  };

  return pedidos.map(p => {
    const si = statusMap[p.status] || statusMap.pending;
    const dt = new Date(p.created_at).toLocaleDateString('pt-BR');
    const ent = p.previsao_entrega ? new Date(p.previsao_entrega+'T00:00:00').toLocaleDateString('pt-BR') : null;
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:var(--radius-md);cursor:pointer;transition:background .15s;margin-bottom:6px" onclick="Views._cVerPedido('${p.id}')" onmouseover="this.style.background='var(--card-bg-input)'" onmouseout="this.style.background='transparent'">
      <div style="width:42px;height:42px;background:rgba(255,140,0,.08);border:1px solid rgba(255,140,0,.2);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">📦</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--text-main)">${esc(p.id)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${(p.itens||[]).length} item(s) · ${dt}</div>
        ${ent ? `<div style="font-size:10px;color:var(--success);margin-top:1px">📅 Previsão: ${ent}</div>` : ''}
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:14px;font-weight:800;color:var(--text-main)">${_cFmt(p.total)}</div>
        <div style="font-size:10px;font-weight:700;color:${si.cor};margin-top:3px;text-transform:uppercase">${si.lbl}</div>
      </div>
    </div>`;
  }).join('');
};

Views._cVerPedido = function(id) {
  const p = window._K11C.pedidos.find(x => x.id === id);
  if (!p) return;
  const stage = document.getElementById('stage');
  const si = { pending:'🕐 Aguardando', confirmed:'✅ Confirmado', preparing:'📦 Separando', shipped:'🚚 Em transporte', delivered:'✅ Entregue', cancelled:'❌ Cancelado' };
  stage.innerHTML = `
  <div class="stagger">
    <div class="op-card">
      <div class="flex-between margin-b-12">
        <div class="label">${esc(p.id)}</div>
        <button class="btn-pill btn-pill-ghost" onclick="APP.view('clientePedidos')">← Voltar</button>
      </div>
      <div style="margin-bottom:14px;font-size:12px;color:var(--text-muted)">${new Date(p.created_at).toLocaleString('pt-BR')} · <span style="color:var(--primary)">${si[p.status]||si.pending}</span></div>

      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px">
        <thead><tr style="border-bottom:1px solid var(--border)">
          <th style="padding:7px 8px;text-align:left;color:var(--text-muted);font-weight:600">Produto</th>
          <th style="padding:7px 8px;text-align:right;color:var(--text-muted);font-weight:600">Qtd</th>
          <th style="padding:7px 8px;text-align:right;color:var(--text-muted);font-weight:600">Unit.</th>
          <th style="padding:7px 8px;text-align:right;color:var(--text-muted);font-weight:600">Total</th>
        </tr></thead>
        <tbody>${(p.itens||[]).map(i=>`
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px">${esc(i.name||i.sku)}</td>
            <td style="padding:8px;text-align:right;color:var(--text-muted)">${i.qty}</td>
            <td style="padding:8px;text-align:right;color:var(--text-muted)">${_cFmt(i.price_unit)}</td>
            <td style="padding:8px;text-align:right;font-weight:700">${_cFmt(i.subtotal)}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      <div style="background:var(--card-bg-input);border-radius:var(--radius-md);padding:12px">
        <div class="flex-between" style="font-size:12px;padding:3px 0"><span style="color:var(--text-muted)">Subtotal</span><span>${_cFmt(p.subtotal)}</span></div>
        <div class="flex-between" style="font-size:12px;padding:3px 0"><span style="color:var(--text-muted)">Frete</span><span style="color:${p.frete===0?'var(--success)':'var(--text-main)'}">${p.frete===0?'GRÁTIS':_cFmt(p.frete)}</span></div>
        <div class="flex-between" style="padding-top:8px;border-top:1px solid var(--border-mid);margin-top:6px"><span style="font-size:13px;color:var(--text-muted)">Total</span><span style="font-size:18px;font-weight:800;color:var(--primary)">${_cFmt(p.total)}</span></div>
      </div>

      ${p.endereco_entrega ? `<div style="margin-top:12px;font-size:12px;color:var(--text-muted)">🚚 Entrega: <span style="color:var(--text-soft)">${esc(p.endereco_entrega)}</span></div>` : ''}
    </div>
  </div>`;
};

// ── VIEW: ORÇAMENTO IA ───────────────────────────────────────────
Views.clienteOrcamento = function() {
  // Carrega obras para o select
  if (window._K11C.obras.length === 0) {
    _cAPI.get('/api/cliente/obras').then(d => {
      if (d?.ok) window._K11C.obras = d.data || [];
    }).catch(()=>{});
  }

  const obrasOptions = window._K11C.obras
    .map(o => `<option value="${o.id}">${esc(o.name)}</option>`)
    .join('');

  return `
  <div class="stagger">
    <div class="op-card">
      <div class="label margin-b-12">ORÇAMENTO COM INTELIGÊNCIA ARTIFICIAL</div>
      <p style="font-size:12px;color:var(--text-muted);line-height:1.6;margin-bottom:16px">
        Descreva sua obra e receba um orçamento detalhado com materiais e mão de obra, baseado na tabela SINAPI e nos preços reais do catálogo Obramax.
      </p>

      <div class="grid-2" style="margin-bottom:12px">
        <div>
          <div class="label-sm margin-b-8">Padrão construtivo</div>
          <select id="orc-pad" style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:9px 10px;font-size:12px;color:var(--text-main);outline:none;font-family:inherit">
            <option value="economico">🔵 Econômico (70%)</option>
            <option value="medio" selected>🟡 Médio (100%)</option>
            <option value="alto">🟠 Alto padrão (140%)</option>
            <option value="luxo">🔴 Luxo (210%)</option>
          </select>
        </div>
        <div>
          <div class="label-sm margin-b-8">Área total (m²)</div>
          <input type="number" id="orc-area" placeholder="Ex: 120"
            style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:9px 10px;font-size:12px;color:var(--text-main);outline:none;font-family:inherit">
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:12px">
        <div>
          <div class="label-sm margin-b-8">Margem / contingência (%)</div>
          <input type="number" id="orc-mar" value="25" min="0" max="100"
            style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:9px 10px;font-size:12px;color:var(--text-main);outline:none;font-family:inherit">
        </div>
        <div>
          <div class="label-sm margin-b-8">Obra vinculada</div>
          <select id="orc-obra" style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:9px 10px;font-size:12px;color:var(--text-main);outline:none;font-family:inherit">
            <option value="">— Nenhuma —</option>
            ${obrasOptions}
          </select>
        </div>
      </div>

      <div style="margin-bottom:14px">
        <div class="label-sm margin-b-8">Descreva a obra detalhadamente</div>
        <textarea id="orc-txt" rows="4" placeholder="Ex: Casa térrea, 3 quartos, 2 banheiros, sala, cozinha. Estrutura concreto armado, alvenaria cerâmica, cobertura telha colonial..."
          style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:10px;font-size:12px;color:var(--text-main);outline:none;font-family:inherit;resize:vertical;line-height:1.5"></textarea>
      </div>

      <button id="orc-btn" onclick="Views._cGerarOrcamento()"
        class="btn-pill btn-pill-primary" style="width:100%;padding:12px;font-size:13px;border-radius:var(--radius-md)">
        🤖 Gerar Orçamento com IA
      </button>
    </div>

    <div id="orc-result"></div>
  </div>`;
};

Views._cGerarOrcamento = async function() {
  const txt  = document.getElementById('orc-txt')?.value.trim() || '';
  const area = document.getElementById('orc-area')?.value || '';
  const pad  = document.getElementById('orc-pad')?.value || 'medio';
  const mar  = document.getElementById('orc-mar')?.value || '25';
  const btn  = document.getElementById('orc-btn');
  const res  = document.getElementById('orc-result');

  if (!txt && !area) { APP.ui.toast('Descreva a obra ou informe a área.', 'error'); return; }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Analisando com IA...'; }
  if (res) res.innerHTML = '';

  try {
    const d = await _cAPI.post('/api/orcamento/gerar', {
      texto: txt, padrao: pad,
      area: parseFloat(area)||null,
      margem: parseFloat(mar)
    });

    if (!d?.ok) throw new Error(d?.error || 'Erro na API');

    const orc = d.orcamento;
    const mats  = (orc.itens||[]).filter(i => i.tipo==='material');
    const servs = (orc.itens||[]).filter(i => i.tipo==='servico');

    // Salvar localmente
    window._K11C.orcamentos.unshift({ ...orc, created_at: new Date().toISOString() });
    try { localStorage.setItem('k11c_orcs', JSON.stringify(window._K11C.orcamentos.slice(0,20))); } catch(_) {}

    if (res) res.innerHTML = `
    <div class="op-card margin-t-15" style="border-color:var(--border-glow)">
      <div class="flex-between margin-b-12">
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--text-main)">${esc(orc.titulo||'Orçamento Gerado')}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(orc.descricao||'')}</div>
        </div>
        <button class="btn-pill btn-pill-ghost" id="orc-export-btn" onclick="Views._cBaixarPDF(window._K11C.orcamentos[0])">↓ PDF</button>
      </div>

      <div class="grid-2" style="gap:8px;margin-bottom:14px">
        <div style="background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Materiais</div>
          <div style="font-size:16px;font-weight:800;color:#60a5fa">${_cFmt(mats.reduce((a,i)=>a+i.total,0))}</div>
        </div>
        <div style="background:var(--success-dim);border:1px solid rgba(16,185,129,.2);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Mão de Obra</div>
          <div style="font-size:16px;font-weight:800;color:var(--success)">${_cFmt(servs.reduce((a,i)=>a+i.total,0))}</div>
        </div>
      </div>

      ${(orc.itens||[]).length > 0 ? `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px;min-width:400px">
          <thead><tr style="border-bottom:1px solid var(--border)">
            <th style="padding:6px 8px;text-align:left;color:var(--text-muted)">Tipo</th>
            <th style="padding:6px 8px;text-align:left;color:var(--text-muted)">Descrição</th>
            <th style="padding:6px 8px;text-align:right;color:var(--text-muted)">Qtd</th>
            <th style="padding:6px 8px;text-align:right;color:var(--text-muted)">Total</th>
          </tr></thead>
          <tbody>${(orc.itens||[]).map(i=>`
            <tr style="border-bottom:1px solid var(--border)">
              <td style="padding:7px 8px"><span style="font-size:9px;font-weight:800;padding:2px 6px;border-radius:3px;background:${i.tipo==='material'?'rgba(59,130,246,.1)':'var(--success-dim)'};color:${i.tipo==='material'?'#60a5fa':'var(--success)'};">${i.tipo.toUpperCase()}</span></td>
              <td style="padding:7px 8px;color:var(--text-soft)">${esc(i.descricao)}</td>
              <td style="padding:7px 8px;text-align:right;color:var(--text-muted)">${(i.quantidade||0).toFixed(1)}</td>
              <td style="padding:7px 8px;text-align:right;font-weight:700;color:var(--text-main)">${_cFmt(i.total)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : ''}

      <div style="background:var(--card-bg-input);border-radius:var(--radius-md);padding:12px;margin-top:12px">
        <div class="flex-between" style="font-size:13px;padding:3px 0"><span style="color:var(--text-muted)">Materiais + M.O.</span><span>${_cFmt(orc.subtotal||0)}</span></div>
        ${orc.margem_valor?`<div class="flex-between" style="font-size:13px;padding:3px 0"><span style="color:var(--text-muted)">Margem (${mar}%)</span><span>${_cFmt(orc.margem_valor)}</span></div>`:''}
        <div class="flex-between" style="padding-top:8px;border-top:1px solid var(--border-mid);margin-top:6px">
          <span style="font-size:13px;font-weight:700;color:var(--text-main)">TOTAL GERAL</span>
          <span style="font-size:19px;font-weight:800;color:var(--primary)">${_cFmt(orc.total||0)}</span>
        </div>
      </div>

      ${orc.alertas?.length ? `<div style="margin-top:10px">${orc.alertas.map(a=>`<div style="font-size:11px;color:var(--warning);margin-bottom:3px">⚠ ${esc(a)}</div>`).join('')}</div>` : ''}

      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-pill btn-pill-primary" onclick="APP.view('clienteCatalogo')">📦 Pedir materiais</button>
        <button class="btn-pill btn-pill-ghost" onclick="Views._cBaixarPDF(${JSON.stringify(orc).replace(/'/g,'&#39;').replace(/"/g,'&quot;')})">↓ Baixar PDF</button>
      </div>
    </div>`;

    APP.ui.toast('✅ Orçamento gerado!', 'success');
  } catch(e) {
    // Fallback offline
    Views._cOrcFallback(pad, area, mar, res);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 Gerar Orçamento com IA'; }
  }
};

Views._cOrcFallback = function(pad, area, mar, resEl) {
  const multi = { economico:.7, medio:1.0, alto:1.4, luxo:2.1 }[pad]||1.0;
  const a = parseFloat(area)||100;
  const base = a * 1400 * multi;
  const m = base * (parseFloat(mar)/100);
  if (!resEl) return;
  resEl.innerHTML = `
  <div class="op-card margin-t-15">
    <div style="font-size:14px;font-weight:800;color:var(--text-main);margin-bottom:3px">📊 Estimativa Offline</div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">${a}m² · Padrão ${pad} · SINAPI médio</div>
    <div style="background:var(--card-bg-input);border-radius:var(--radius-md);padding:12px">
      <div class="flex-between" style="font-size:12px;padding:3px 0"><span style="color:var(--text-muted)">Materiais (55%)</span><span>${_cFmt(base*.55)}</span></div>
      <div class="flex-between" style="font-size:12px;padding:3px 0"><span style="color:var(--text-muted)">Mão de obra (45%)</span><span>${_cFmt(base*.45)}</span></div>
      <div class="flex-between" style="font-size:12px;padding:3px 0"><span style="color:var(--text-muted)">Margem (${mar}%)</span><span>${_cFmt(m)}</span></div>
      <div class="flex-between" style="padding-top:8px;border-top:1px solid var(--border-mid);margin-top:6px">
        <span style="font-size:13px;font-weight:700">Total Estimado</span>
        <span style="font-size:18px;font-weight:800;color:var(--primary)">${_cFmt(base+m)}</span>
      </div>
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:10px">⚠ Estimativa baseada em médias SINAPI. Configure ANTHROPIC_API_KEY para orçamentos detalhados com IA.</div>
  </div>`;
  APP.ui.toast('Orçamento estimado (modo offline)', 'info');
};

// ── VIEW: FINANCEIRO ─────────────────────────────────────────────
Views.clienteFinanceiro = function() {
  _cAPI.get('/api/cliente/financeiro').then(d => {
    if (d?.ok) {
      const el = document.getElementById('fin-body');
      if (el) el.innerHTML = Views._finHTML(d.data);
    }
  }).catch(()=>{});

  return `
  <div class="stagger">
    <div class="op-card" style="margin-bottom:8px;padding:14px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div class="label">💰 PAINEL FINANCEIRO</div>
        <button onclick="APP.view('clientePortal')" style="background:none;border:none;font-size:11px;color:var(--text-muted);cursor:pointer">← Portal</button>
      </div>
      <div style="font-size:11px;color:var(--text-muted)">Controle de orçamento e gastos das obras</div>
    </div>
    <div id="fin-body">
      <div style="text-align:center;padding:40px;color:var(--text-muted)">
        <div style="font-size:24px;margin-bottom:8px;animation:spin 1.2s linear infinite;display:inline-block">⚙️</div>
        <div style="font-size:12px">Carregando dados financeiros...</div>
      </div>
    </div>
  </div>`;
};

Views._finHTML = function(fin) {
  if (!fin) return '<div class="op-card"><div style="color:var(--text-muted);font-size:13px;text-align:center;padding:30px">Sem dados financeiros disponíveis.</div></div>';

  const orcTotal  = fin.total_orcamento  || 0;
  const gastoTotal= fin.total_gasto      || 0;
  const compras   = fin.total_investido  || 0;
  const saldo     = fin.saldo_disponivel || 0;
  const obras     = fin.obras_financeiro || [];
  const pctGlobal = orcTotal > 0 ? Math.min(100, Math.round(gastoTotal / orcTotal * 100)) : 0;
  const pctCor    = pctGlobal > 90 ? 'var(--danger)' : pctGlobal > 70 ? 'var(--warning)' : 'var(--success)';

  // SVG mini bar chart dos gastos por obra
  const maxBudget = Math.max(...obras.map(o => o.budget || 0), 1);
  const BAR_H = 120, BAR_W = 36, GAP = 12;
  const svgW = obras.length * (BAR_W + GAP) + GAP;
  const barsSVG = obras.length > 0 ? `
  <div class="op-card" style="margin-bottom:8px;overflow-x:auto">
    <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">ORÇAMENTO VS GASTO POR OBRA</div>
    <svg viewBox="0 0 ${Math.max(svgW, 200)} ${BAR_H + 40}" style="width:100%;height:auto;overflow:visible">
      ${obras.map((o, i) => {
        const x       = GAP + i * (BAR_W + GAP);
        const hBudget = o.budget > 0 ? (o.budget / maxBudget) * BAR_H : 0;
        const hGasto  = o.budget > 0 ? Math.min((o.total_spent || 0) / maxBudget * BAR_H, hBudget) : 0;
        const pct     = o.percentual_gasto || 0;
        const cor     = pct > 90 ? '#ef4444' : pct > 70 ? '#f59e0b' : '#10b981';
        const nome    = (o.name || '—').substring(0, 8);
        return `
        <rect x="${x}" y="${BAR_H - hBudget}" width="${BAR_W}" height="${hBudget}" rx="3" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.1)" stroke-width=".5"/>
        <rect x="${x}" y="${BAR_H - hGasto}" width="${BAR_W}" height="${hGasto}" rx="3" fill="${cor}" opacity=".8"/>
        <text x="${x + BAR_W/2}" y="${BAR_H - hGasto - 5}" text-anchor="middle" font-size="9" fill="${cor}" font-weight="bold">${pct}%</text>
        <text x="${x + BAR_W/2}" y="${BAR_H + 14}" text-anchor="middle" font-size="8" fill="rgba(255,255,255,.4)">${nome}</text>`;
      }).join('')}
      <line x1="0" y1="${BAR_H}" x2="${svgW}" y2="${BAR_H}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>
    </svg>
    <div style="display:flex;gap:12px;margin-top:6px">
      <div style="display:flex;align-items:center;gap:5px"><div style="width:10px;height:10px;border-radius:2px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)"></div><span style="font-size:10px;color:var(--text-muted)">Orçamento</span></div>
      <div style="display:flex;align-items:center;gap:5px"><div style="width:10px;height:10px;border-radius:2px;background:#10b981;opacity:.8"></div><span style="font-size:10px;color:var(--text-muted)">Gasto (saudável)</span></div>
      <div style="display:flex;align-items:center;gap:5px"><div style="width:10px;height:10px;border-radius:2px;background:#ef4444;opacity:.8"></div><span style="font-size:10px;color:var(--text-muted)">Gasto (crítico)</span></div>
    </div>
  </div>` : '';

  return `
  <!-- KPIs PRINCIPAIS -->
  <div class="op-card" style="margin-bottom:8px">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      ${[
        { lbl:'Orçamento Total',  val:_cFmt(orcTotal),  cor:'var(--primary)',  bg:'var(--primary-dim)',  bor:'var(--border-glow)' },
        { lbl:'Total Gasto',      val:_cFmt(gastoTotal), cor:'var(--warning)',  bg:'rgba(245,158,11,.06)',bor:'rgba(245,158,11,.2)' },
        { lbl:'Compras Obramax',  val:_cFmt(compras),   cor:'var(--success)',  bg:'var(--success-dim)',  bor:'rgba(16,185,129,.2)' },
        { lbl:'Saldo Disponível', val:_cFmt(saldo),     cor:saldo>=0?'var(--success)':'var(--danger)', bg:saldo>=0?'var(--success-dim)':'rgba(239,68,68,.06)', bor:saldo>=0?'rgba(16,185,129,.2)':'rgba(239,68,68,.2)' },
      ].map(k => `
      <div style="background:${k.bg};border:1px solid ${k.bor};border-radius:var(--radius-md);padding:12px">
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">${k.lbl}</div>
        <div style="font-size:14px;font-weight:800;color:${k.cor}">${k.val}</div>
      </div>`).join('')}
    </div>

    <!-- Barra global de saúde financeira -->
    <div style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:11px;font-weight:700;color:var(--text-soft)">Saúde Financeira Geral</span>
        <span style="font-size:13px;font-weight:900;color:${pctCor};font-family:var(--font-mono)">${pctGlobal}%</span>
      </div>
      <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
        <div style="width:${pctGlobal}%;height:100%;background:linear-gradient(90deg,${pctCor},${pctCor});border-radius:4px;transition:width .8s cubic-bezier(.16,1,.3,1)"></div>
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:6px">${_cFmt(gastoTotal)} de ${_cFmt(orcTotal)} orçados · ${fin.pedidos_mes||0} compra(s) este mês</div>
    </div>
  </div>

  ${barsSVG}

  <!-- OBRAS DETALHADAS -->
  ${obras.length > 0 ? `
  <div class="op-card" style="margin-bottom:8px">
    <div style="font-size:10px;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">CONTROLE POR OBRA</div>
    ${obras.map(o => {
      const pct = o.percentual_gasto || 0;
      const cor = pct > 90 ? 'var(--danger)' : pct > 70 ? 'var(--warning)' : 'var(--success)';
      const saldoObra = (o.budget||0) - (o.total_spent||0);
      return `
      <div style="padding:12px;border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px;background:rgba(255,255,255,.01)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(o.name||'—')}</div>
            <div style="font-size:10px;color:var(--text-muted);margin-top:1px">${o.status==='active'?'🟢 Em andamento':o.status==='done'?'✅ Concluída':'⏸ Pausada'}</div>
          </div>
          <span style="font-size:11px;font-weight:800;padding:4px 10px;border-radius:var(--radius-full);background:${pct>90?'rgba(239,68,68,.12)':pct>70?'rgba(245,158,11,.12)':'rgba(16,185,129,.12)'};color:${cor};flex-shrink:0;margin-left:8px">${pct}% usado</span>
        </div>
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:8px">
          <div style="width:${Math.min(pct,100)}%;height:100%;background:${cor};border-radius:3px;transition:width .6s"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
          <div style="text-align:center;background:rgba(255,255,255,.03);border-radius:var(--radius-sm);padding:6px">
            <div style="font-size:9px;color:var(--text-muted)">ORÇAMENTO</div>
            <div style="font-size:11px;font-weight:700;color:var(--text-soft)">${_cFmt(o.budget||0)}</div>
          </div>
          <div style="text-align:center;background:rgba(255,255,255,.03);border-radius:var(--radius-sm);padding:6px">
            <div style="font-size:9px;color:var(--text-muted)">GASTO</div>
            <div style="font-size:11px;font-weight:700;color:${cor}">${_cFmt(o.total_spent||0)}</div>
          </div>
          <div style="text-align:center;background:rgba(255,255,255,.03);border-radius:var(--radius-sm);padding:6px">
            <div style="font-size:9px;color:var(--text-muted)">SALDO</div>
            <div style="font-size:11px;font-weight:700;color:${saldoObra>=0?'var(--success)':'var(--danger)'}">${_cFmt(Math.abs(saldoObra))}${saldoObra<0?' ⚠':''}</div>
          </div>
        </div>
      </div>`; }).join('')}
  </div>` : ''}

  <!-- DICA -->
  <div class="op-card" style="background:var(--primary-dim);border-color:var(--border-glow)">
    <div style="font-size:10px;color:var(--primary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">💡 DICAS DE ECONOMIA</div>
    <div style="font-size:12px;color:var(--text-soft);line-height:1.7">
      • Compras acima de <strong style="color:var(--primary)">R$ 500</strong> têm frete grátis<br>
      • Use o <strong style="color:var(--primary)">Orçamento IA</strong> antes de comprar para evitar desperdício<br>
      • Acompanhe os gastos por fase para não ultrapassar o orçamento
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button onclick="APP.view('clienteCatalogo')" style="flex:1;padding:9px;background:var(--primary);color:#000;border:none;border-radius:var(--radius-md);font-size:11px;font-weight:800;cursor:pointer">📦 Ver Catálogo</button>
      <button onclick="APP.view('clienteOrcamento')" style="flex:1;padding:9px;background:transparent;border:1px solid var(--border-glow);color:var(--primary);border-radius:var(--radius-md);font-size:11px;font-weight:700;cursor:pointer">🤖 Orçamento IA</button>
    </div>
  </div>`;
};


// ── BAIXAR PDF DE ORÇAMENTO ──────────────────────────────────────
Views._cBaixarPDF = async function(orc) {
  if (!orc) { APP.ui.toast('Nenhum orçamento para exportar.', 'error'); return; }
  try {
    APP.ui.toast('⏳ Gerando PDF...', 'info');
    const tk  = (typeof K11Auth !== 'undefined' && K11Auth.getToken()) || sessionStorage.getItem('k11_token') || localStorage.getItem('om_tk') || '';
    const base = window.K11_SERVER_URL || window.location.origin;
    const res  = await fetch(base + '/api/orcamento/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
      body: JSON.stringify({ orcamento: orc }),
    });
    if (!res.ok) throw new Error('Falha na geração do PDF');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `orcamento-k11-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    APP.ui.toast('✅ PDF baixado com sucesso!', 'success');
  } catch(e) {
    APP.ui.toast('Erro ao gerar PDF: ' + e.message, 'error');
  }
};

// ── VIEW: ORÇAMENTOS SALVOS ──────────────────────────────────────
Views.clienteOrcamentos = function() {
  // Carrega do localStorage + API
  let orcs = window._K11C.orcamentos || [];

  _cAPI.get('/api/cliente/orcamentos').then(d => {
    if (d?.ok && d.data?.length > 0) {
      // Merge API + local sem duplicatas
      const apiOrcs = d.data;
      const ids = new Set(orcs.map(o => o.id));
      apiOrcs.forEach(o => { if (!ids.has(o.id)) orcs.push(o); });
      window._K11C.orcamentos = orcs.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      const el = document.getElementById('orcs-list');
      if (el) el.innerHTML = Views._orcsListHTML();
    }
  }).catch(()=>{});

  return `
  <div class="stagger">
    <div class="op-card" style="margin-bottom:8px;padding:14px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div class="label">📋 ORÇAMENTOS SALVOS</div>
        <button onclick="APP.view('clienteOrcamento')" style="background:var(--primary);color:#000;border:none;border-radius:var(--radius-full);padding:6px 14px;font-size:11px;font-weight:800;cursor:pointer">+ Novo</button>
      </div>
      <div style="font-size:11px;color:var(--text-muted)">Histórico de orçamentos gerados com IA</div>
    </div>
    <div id="orcs-list">${Views._orcsListHTML()}</div>
  </div>`;
};

Views._orcsListHTML = function() {
  const orcs = window._K11C.orcamentos || [];
  if (orcs.length === 0) {
    return `<div class="op-card" style="text-align:center;padding:40px 20px">
      <div style="font-size:36px;opacity:.25;margin-bottom:12px">📋</div>
      <div style="font-size:14px;font-weight:700;color:var(--text-soft);margin-bottom:6px">Nenhum orçamento salvo</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Gere seu primeiro orçamento com inteligência artificial</div>
      <button style="padding:10px 22px;background:var(--primary);color:#000;border:none;border-radius:var(--radius-full);font-size:12px;font-weight:800;cursor:pointer"
              onclick="APP.view('clienteOrcamento')">🤖 Gerar Orçamento com IA</button>
    </div>`;
  }
  return orcs.map((orc, idx) => {
    const dt    = orc.created_at ? new Date(orc.created_at).toLocaleDateString('pt-BR', {day:'2-digit',month:'short',year:'numeric'}) : '—';
    const mats  = (orc.itens||[]).filter(i=>i.tipo==='material').reduce((a,i)=>a+i.total,0);
    const servs = (orc.itens||[]).filter(i=>i.tipo==='servico').reduce((a,i)=>a+i.total,0);
    return `
    <div class="op-card" style="margin-bottom:8px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:800;color:var(--text-main)">${esc(orc.titulo||orc.descricao||'Orçamento #'+(idx+1))}</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">${dt}${orc.descricao&&orc.titulo?' · '+esc(orc.descricao.substring(0,50)):''}</div>
        </div>
        <button onclick="Views._cBaixarPDF(window._K11C.orcamentos[${idx}])"
          style="flex-shrink:0;margin-left:10px;padding:5px 12px;background:var(--primary-dim);border:1px solid var(--border-glow);color:var(--primary);border-radius:var(--radius-sm);font-size:10px;font-weight:700;cursor:pointer">
          ↓ PDF
        </button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
        <div style="background:rgba(255,255,255,.03);border-radius:var(--radius-sm);padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:3px">TOTAL</div>
          <div style="font-size:13px;font-weight:800;color:var(--primary)">${_cFmt(orc.total||0)}</div>
        </div>
        <div style="background:rgba(59,130,246,.06);border-radius:var(--radius-sm);padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:3px">MATERIAIS</div>
          <div style="font-size:12px;font-weight:700;color:#60a5fa">${_cFmt(mats)}</div>
        </div>
        <div style="background:var(--success-dim);border-radius:var(--radius-sm);padding:8px;text-align:center">
          <div style="font-size:9px;color:var(--text-muted);margin-bottom:3px">MÃO DE OBRA</div>
          <div style="font-size:12px;font-weight:700;color:var(--success)">${_cFmt(servs)}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px">
        <button onclick="APP.view('clienteCatalogo')"
          style="flex:1;padding:8px;background:transparent;border:1px solid var(--border);border-radius:var(--radius-md);color:var(--text-soft);font-size:11px;font-weight:700;cursor:pointer">
          📦 Pedir materiais
        </button>
        <button onclick="window._K11C.orcamentos.splice(${idx},1);try{localStorage.setItem('k11c_orcs',JSON.stringify(window._K11C.orcamentos))}catch(_){}const el=document.getElementById('orcs-list');if(el)el.innerHTML=Views._orcsListHTML()"
          style="padding:8px 12px;background:transparent;border:1px solid rgba(239,68,68,.2);border-radius:var(--radius-md);color:var(--danger);font-size:11px;cursor:pointer">
          🗑
        </button>
      </div>
    </div>`;
  }).join('');
};

// ── VIEW: PERFIL DO CLIENTE ──────────────────────────────────────
Views.clientePerfil = function() {
  let user = {};
  try { user = JSON.parse(sessionStorage.getItem('k11_user') || '{}'); } catch(_) {}

  // Carrega dados atualizados
  _cAPI.get('/api/cliente/perfil').then(d => {
    if (d?.ok && d.data) {
      const p = d.data;
      ['nome','telefone','cpf','endereco'].forEach(f => {
        const el = document.getElementById('perf-' + f);
        if (el && p[f]) el.value = p[f];
      });
    }
  }).catch(()=>{});

  return `
  <div class="stagger">
    <div class="op-card" style="margin-bottom:8px;padding:14px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div class="label">👤 MEU PERFIL</div>
        <button onclick="APP.view('clientePortal')" style="background:none;border:none;font-size:11px;color:var(--text-muted);cursor:pointer">← Portal</button>
      </div>
    </div>

    <!-- AVATAR / IDENTIDADE -->
    <div class="op-card" style="margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--primary-dim);border:2px solid var(--border-glow);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:var(--primary);flex-shrink:0">
          ${(user.nome||'C').charAt(0).toUpperCase()}
        </div>
        <div>
          <div style="font-size:16px;font-weight:900;color:var(--text-main)">${esc(user.nome||'Cliente')}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(user.re||user.email||'')}</div>
          <div style="display:inline-block;margin-top:4px;font-size:9px;font-weight:800;padding:2px 8px;border-radius:var(--radius-full);background:rgba(16,185,129,.12);color:var(--success)">✓ CLIENTE ATIVO</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px">NOME COMPLETO</div>
          <input id="perf-nome" type="text" value="${esc(user.nome||'')}" placeholder="Seu nome completo"
            style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:10px 12px;font-size:13px;color:var(--text-main);outline:none;font-family:inherit;box-sizing:border-box">
        </div>
        <div>
          <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px">TELEFONE</div>
          <input id="perf-telefone" type="tel" placeholder="(11) 99999-9999"
            style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:10px 12px;font-size:13px;color:var(--text-main);outline:none;font-family:inherit;box-sizing:border-box">
        </div>
        <div>
          <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px">CPF</div>
          <input id="perf-cpf" type="text" placeholder="000.000.000-00"
            style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:10px 12px;font-size:13px;color:var(--text-main);outline:none;font-family:inherit;box-sizing:border-box">
        </div>
        <div>
          <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px">ENDEREÇO PRINCIPAL</div>
          <input id="perf-endereco" type="text" placeholder="Rua, número, bairro, cidade"
            style="width:100%;background:var(--card-bg-input);border:1px solid var(--border-mid);border-radius:var(--radius-md);padding:10px 12px;font-size:13px;color:var(--text-main);outline:none;font-family:inherit;box-sizing:border-box">
        </div>
        <button id="perf-save-btn" onclick="Views._cSalvarPerfil()"
          style="width:100%;padding:12px;background:var(--primary);color:#000;border:none;border-radius:var(--radius-full);font-size:13px;font-weight:900;cursor:pointer;margin-top:4px">
          💾 Salvar Alterações
        </button>
      </div>
    </div>

    <!-- SEGURANÇA -->
    <div class="op-card" style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">🔒 SEGURANÇA</div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--text-main)">E-mail de acesso</div>
          <div style="font-size:11px;color:var(--text-muted)">${esc(user.re||user.email||'—')}</div>
        </div>
        <span style="font-size:10px;color:var(--success);font-weight:700">Verificado ✓</span>
      </div>
      <button onclick="APP.ui.toast('Recuperação de senha enviada ao seu e-mail.','info')"
        style="width:100%;margin-top:12px;padding:10px;background:transparent;border:1px solid var(--border-mid);border-radius:var(--radius-md);color:var(--text-soft);font-size:12px;font-weight:700;cursor:pointer">
        🔑 Alterar Senha
      </button>
    </div>

    <!-- DADOS DA CONTA -->
    <div class="op-card" style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:800;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px">📊 MINHA CONTA</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px" id="perf-stats">
        <div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:900;color:var(--primary)" id="ps-obras">—</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Obras</div>
        </div>
        <div style="background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:900;color:var(--success)" id="ps-pedidos">—</div>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Pedidos</div>
        </div>
      </div>
    </div>

    <!-- SAIR -->
    <div class="op-card">
      <button onclick="if(confirm('Deseja sair da conta?')){try{K11Auth.logout()}catch(_){}try{sessionStorage.clear();localStorage.removeItem('om_tk')}catch(_){}window.location.reload()}"
        style="width:100%;padding:12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:var(--radius-md);color:var(--danger);font-size:13px;font-weight:800;cursor:pointer">
        🚪 Sair da Conta
      </button>
    </div>
    <div style="height:20px"></div>
  </div>`;
};

Views._cSalvarPerfil = async function() {
  const btn = document.getElementById('perf-save-btn');
  const body = {
    nome:     document.getElementById('perf-nome')?.value.trim(),
    telefone: document.getElementById('perf-telefone')?.value.trim(),
    cpf:      document.getElementById('perf-cpf')?.value.trim(),
    endereco: document.getElementById('perf-endereco')?.value.trim(),
  };
  if (!body.nome) { APP.ui.toast('Nome é obrigatório.', 'error'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Salvando...'; }
  try {
    const d = await _cAPI.put('/api/cliente/perfil', body);
    if (d?.ok) {
      APP.ui.toast('✅ Perfil atualizado!', 'success');
      // Atualiza sessão local
      try {
        const u = JSON.parse(sessionStorage.getItem('k11_user')||'{}');
        u.nome = body.nome;
        sessionStorage.setItem('k11_user', JSON.stringify(u));
      } catch(_) {}
    } else { APP.ui.toast(d?.error || 'Erro ao salvar.', 'error'); }
  } catch { APP.ui.toast('Erro de conexão.', 'error'); }
  if (btn) { btn.disabled = false; btn.textContent = '💾 Salvar Alterações'; }

  // Carrega stats
  _cAPI.get('/api/cliente/dashboard').then(d => {
    if (d?.ok) {
      const el1 = document.getElementById('ps-obras');
      const el2 = document.getElementById('ps-pedidos');
      if (el1) el1.textContent = d.data?.obras_total ?? '—';
      if (el2) el2.textContent = d.data?.pedidos_total ?? '—';
    }
  }).catch(()=>{});
};

// Carrega stats do perfil quando a view abre
(function _perfilStatsInit() {
  setTimeout(() => {
    const el = document.getElementById('ps-obras');
    if (!el) return;
    _cAPI.get('/api/cliente/dashboard').then(d => {
      if (d?.ok) {
        const e1 = document.getElementById('ps-obras');
        const e2 = document.getElementById('ps-pedidos');
        if (e1) e1.textContent = d.data?.obras_total ?? '0';
        if (e2) e2.textContent = d.data?.pedidos_total ?? '0';
      }
    }).catch(()=>{});
  }, 300);
})();

// ── VIEW: NOTIFICAÇÕES ───────────────────────────────────────────
Views.clienteNotificacoes = function() {
  // Marca como lidas em background
  _cAPI.post('/api/cliente/notificacoes/lidas', {}).catch(()=>{});

  _cAPI.get('/api/cliente/notificacoes').then(d => {
    if (d?.ok) {
      const el = document.getElementById('notifs-list');
      if (el) el.innerHTML = Views._notifsListHTML(d.data || []);
    }
  }).catch(()=>{});

  return `
  <div class="stagger">
    <div class="op-card" style="margin-bottom:8px;padding:14px 16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <div class="label">🔔 NOTIFICAÇÕES</div>
        <button onclick="APP.view('clientePortal')" style="background:none;border:none;font-size:11px;color:var(--text-muted);cursor:pointer">← Portal</button>
      </div>
    </div>
    <div id="notifs-list">
      <div style="text-align:center;padding:32px;color:var(--text-muted);font-size:12px">
        <div style="font-size:22px;margin-bottom:8px;animation:spin 1.2s linear infinite;display:inline-block">⚙️</div><br>
        Carregando notificações...
      </div>
    </div>
  </div>`;
};

Views._notifsListHTML = function(notifs) {
  if (!notifs || notifs.length === 0) {
    return `<div class="op-card" style="text-align:center;padding:40px 20px">
      <div style="font-size:36px;opacity:.2;margin-bottom:12px">🔔</div>
      <div style="font-size:14px;font-weight:700;color:var(--text-soft)">Sem notificações</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:6px">Você está em dia!</div>
    </div>`;
  }

  const corMap = {
    orange: { bg: 'rgba(255,140,0,.08)',   bor: 'rgba(255,140,0,.25)',  txt: 'var(--primary)' },
    green:  { bg: 'rgba(16,185,129,.07)',  bor: 'rgba(16,185,129,.25)', txt: 'var(--success)' },
    blue:   { bg: 'rgba(96,165,250,.07)',  bor: 'rgba(96,165,250,.25)', txt: '#60a5fa' },
    red:    { bg: 'rgba(239,68,68,.07)',   bor: 'rgba(239,68,68,.25)',  txt: 'var(--danger)' },
  };

  const iconMap = {
    obra_criada:   '🏗️',
    pedido_criado: '📦',
    entrega:       '🚚',
    alerta:        '⚠️',
    promo:         '🎁',
  };

  return notifs.map(n => {
    const c   = corMap[n.cor] || corMap.blue;
    const ico = iconMap[n.tipo] || '🔔';
    const dt  = n.created_at
      ? new Date(n.created_at).toLocaleDateString('pt-BR', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
      : '';
    return `
    <div style="display:flex;gap:12px;padding:12px 14px;background:${c.bg};border:1px solid ${n.lida ? 'var(--border)' : c.bor};border-radius:var(--radius-md);margin-bottom:8px;opacity:${n.lida?'.75':'1'}">
      <div style="font-size:20px;flex-shrink:0;margin-top:1px">${ico}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
          <div style="font-size:12px;font-weight:${n.lida?'600':'800'};color:var(--text-main)">${esc(n.titulo||'Notificação')}</div>
          ${!n.lida ? `<div style="width:6px;height:6px;border-radius:50%;background:${c.txt};flex-shrink:0"></div>` : ''}
        </div>
        <div style="font-size:11px;color:var(--text-muted);line-height:1.5">${esc(n.mensagem||'')}</div>
        ${dt ? `<div style="font-size:10px;color:var(--text-muted);opacity:.6;margin-top:4px">${dt}</div>` : ''}
      </div>
    </div>`;
  }).join('');
};

// ── CARREGAR CARRINHO AO INICIAR COMO CLIENTE ────────────────────
(function() {
  try { window._K11C.orcamentos = JSON.parse(localStorage.getItem('k11c_orcs')||'[]'); } catch(_) {}

  const role = (() => {
    try { return JSON.parse(sessionStorage.getItem('k11_user')||'{}').role; } catch { return ''; }
  })();

  if (role === 'cliente') {
    _cLoadCart();

    // Carrega contagem de notificações não lidas
    setTimeout(() => {
      _cAPI.get('/api/cliente/notificacoes').then(d => {
        if (d?.ok) {
          window._K11C.notifsNaoLidas = d.nao_lidas || 0;
          const badge = document.getElementById('notif-nav-badge');
          if (badge) {
            badge.textContent = d.nao_lidas;
            badge.style.display = d.nao_lidas > 0 ? 'block' : 'none';
          }
        }
      }).catch(()=>{});
    }, 1500);
  }
})();
