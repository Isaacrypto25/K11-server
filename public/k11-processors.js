/**
 * K11 OMNI ELITE — PROCESSADORES DE DADOS v4.0
 * ════════════════════════════════════════════════
 * Transforma JSONs brutos em estruturas otimizadas para as views.
 * Cada processador popula APP.db e APP.rankings, emitindo eventos via EventBus.
 *
 * v4.0 — Novidades:
 *   • processarEstoque: calcula mediaVendaDia, diasCobertura, dataRupturaEstimada
 *   • processarBI_DualTrend: Cross-Brand Intelligence (marcasGlobal + compararMarcas())
 *   • topRupturaProxima: top 10 SKUs com cobertura ≤ 7 dias
 *
 * Depende de: k11-config.js, k11-utils.js
 */

'use strict';

const Processors = {

    // ══════════════════════════════════════════════════════════════════
    // ESTOQUE — classifica SKUs + projeção de ruptura por cobertura
    // ══════════════════════════════════════════════════════════════════

    /**
     * Processa produtos.json → APP.db.produtos + APP.rankings.pieStats
     *
     * Regras de tipo de depósito:
     *   CAB* / CHI* → tratados como PKL (piso de venda com nomenclatura diferente)
     *   PKL         → piso de picking
     *   AEL         → aéreo
     *   RES         → reserva
     *
     * Campos novos por SKU (v4):
     *   mediaVendaDia        → média ponderada de vendas/dia (atual 60% + anterior 40%)
     *   diasCobertura        → PKL / mediaVendaDia  (null se mediaVenda = 0)
     *   dataRupturaEstimada  → data formatada BR se cobertura ≤ 30d (null caso contrário)
     */
    processarEstoque(data) {
        if (!Array.isArray(data) || data.length === 0) {
            console.warn('[K11] processarEstoque: dados ausentes ou vazios.');
            return;
        }
        const mapa = new Map();

        data.forEach(p => {
            const sku = String(p?.['Produto'] ?? p?.['Nº do produto'] ?? '').trim();
            if (!sku) return;

            if (!mapa.has(sku)) {
                mapa.set(sku, {
                    id: sku,
                    desc: p['Descrição produto'] ?? 'N/A',
                    depositos: [], pkl: 0, total: 0, valTotal: 0,
                });
            }

            const entry   = mapa.get(sku);
            const q       = safeFloat(p['Quantidade']);
            const pos     = String(p['Posição no depósito'] ?? p['Posição'] ?? '').toUpperCase().trim();
            const tipoRaw = String(p['Tipo de depósito']   ?? p['Tipo']    ?? '').toUpperCase().trim();

            // [FIX] CAB e CHI são prefixos de piso de venda — contam como PKL
            const tipo = (pos.startsWith('CAB') || pos.startsWith('CHI')) ? 'PKL' : tipoRaw;

            entry.depositos.push({ pos: p['Posição no depósito'] ?? p['Posição'] ?? 'S/E', tipo, q });
            if (tipo === 'PKL') entry.pkl += q;
            entry.total    += q;
            entry.valTotal += safeFloat(p['Valor total']);
        });

        // Calcula médias de venda por SKU (ponderação: atual 60% + anterior 40% ÷ 30 dias)
        const mediaVendasMap = Processors._calcularMediaVendas();

        let valRed = 0, valYellow = 0;

        APP.db.produtos = [...mapa.values()].map(p => {
            const mediaVenda = mediaVendasMap.get(p.id) ?? 0;

            // ── Projeção de cobertura ───────────────────────────────
            p.mediaVendaDia = parseFloat(mediaVenda.toFixed(2));
            p.diasCobertura = mediaVenda > 0
                ? parseFloat((p.pkl / mediaVenda).toFixed(1))
                : null;

            if (p.diasCobertura !== null && p.diasCobertura <= 30) {
                const dr = new Date();
                dr.setDate(dr.getDate() + Math.floor(p.diasCobertura));
                p.dataRupturaEstimada = dr.toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit',
                });
            } else {
                p.dataRupturaEstimada = null;
            }

            // ── Classificação de status ────────────────────────────
            if (p.total <= 0) {
                p.categoriaCor = 'red';    p.status = 'ruptura';       p.subStatus = 'zero-total';
                valRed += p.valTotal;
            } else if (p.pkl <= 0) {
                p.categoriaCor = 'red';    p.status = 'ruptura';       p.subStatus = 'falso-zero';
                valRed += p.valTotal;
            } else if (p.pkl <= 2 || (p.diasCobertura !== null && p.diasCobertura <= 3)) {
                p.categoriaCor = 'yellow'; p.status = 'abastecimento'; p.subStatus = 'pkl-critico';
                valYellow += p.valTotal;
            } else if (p.diasCobertura !== null && p.diasCobertura <= 7) {
                p.categoriaCor = 'yellow'; p.status = 'abastecimento'; p.subStatus = 'ruptura-proxima';
                valYellow += p.valTotal;
            } else {
                p.categoriaCor = 'green';  p.status = 'saudavel';      p.subStatus = 'ok';
            }

            // ── Score de criticidade ──────────────────────────────
            const urgMult = p.categoriaCor === 'red' ? 3 : p.categoriaCor === 'yellow' ? 1.5 : 0;
            const cobMult = (p.diasCobertura !== null && p.diasCobertura < 7)
                ? (7 / Math.max(p.diasCobertura, 0.5))
                : 1;
            p.scoreCriticidade = p.valTotal * urgMult * cobMult;

            return p;
        });

        APP.rankings.meta.valTotalRed    = valRed;
        APP.rankings.meta.valTotalYellow = valYellow;

        const prods = APP.db.produtos;
        APP.rankings.pieStats = {
            red:    prods.filter(x => x.categoriaCor === 'red').length,
            yellow: prods.filter(x => x.categoriaCor === 'yellow').length,
            green:  prods.filter(x => x.categoriaCor === 'green').length,
            total:  prods.length,
        };

        // Top 10 SKUs com ruptura iminente (≤7d, PKL > 0) — usado por IA e dashboard
        APP.rankings.topRupturaProxima = prods
            .filter(p => p.diasCobertura !== null && p.diasCobertura > 0 && p.diasCobertura <= 7)
            .sort((a, b) => a.diasCobertura - b.diasCobertura)
            .slice(0, 10);

        EventBus.emit('estoque:atualizado');
    },

    /**
     * Calcula média de vendas diária por SKU.
     * Ponderação: atual 60% + anterior 40%, dividido por 30 dias.
     * Se só tiver um período, usa apenas ele (/ 30d).
     */
    _calcularMediaVendas() {
        const DIAS = 30;

        const _somar = (arr) => {
            const m = new Map();
            (Array.isArray(arr) ? arr : []).forEach(v => {
                const id = String(v?.['Nº do produto'] ?? v?.Produto ?? '').trim();
                const q  = safeFloat(v?.['Quantidade vendida']);
                if (id) m.set(id, (m.get(id) ?? 0) + q);
            });
            return m;
        };

        const atual    = _somar(APP.db.pdv);
        const anterior = _somar(APP.db.pdvAnterior);
        const todos    = new Set([...atual.keys(), ...anterior.keys()]);
        const result   = new Map();

        todos.forEach(sku => {
            const qa = atual.get(sku)    ?? 0;
            const qb = anterior.get(sku) ?? 0;
            if (qa > 0 && qb > 0) {
                result.set(sku, (qa * 0.6 + qb * 0.4) / DIAS);
            } else if (qa > 0) {
                result.set(sku, qa / DIAS);
            } else if (qb > 0) {
                result.set(sku, qb / DIAS);
            }
        });

        return result;
    },

    // ══════════════════════════════════════════════════════════════════
    // DUELO AQUA — benchmarking hidráulica vs concorrentes
    // ══════════════════════════════════════════════════════════════════

    processarDueloAqua() {
        const KEYWORDS = new Set(['BOMBA', 'PISCINA', 'CLORO', 'FILTRO', 'MOTOBOMBA', 'VALV', 'CHAVE']);

        const mapVendas = (arr) => {
            const m = new Map();
            (Array.isArray(arr) ? arr : []).forEach(v => {
                const id = String(v?.['Nº do produto'] ?? v?.Produto ?? '').trim();
                const q  = safeFloat(v?.['Quantidade vendida']);
                if (id) m.set(id, (m.get(id) ?? 0) + q);
            });
            return m;
        };

        const mapas = {
            minha:       mapVendas(APP.db.pdv),
            alvo:        mapVendas(APP.db.pdvExtra[APP.ui.pdvAlvo] ?? []),
            mesquita:    mapVendas(APP.db.pdvExtra.mesquita),
            jacarepagua: mapVendas(APP.db.pdvExtra.jacarepagua),
            benfica:     mapVendas(APP.db.pdvExtra.benfica),
        };

        const comparativo = [];
        const totalLoja   = { hidraulica: 0, mesquita: 0, jacarepagua: 0, benfica: 0 };

        APP.db.produtos.forEach(p => {
            const desc = p.desc.toUpperCase();
            if (![...KEYWORDS].some(k => desc.includes(k))) return;

            const vMinha = mapas.minha.get(p.id) ?? 0;
            const vAlvo  = mapas.alvo.get(p.id)  ?? 0;

            totalLoja.hidraulica  += vMinha;
            totalLoja.mesquita    += mapas.mesquita.get(p.id)    ?? 0;
            totalLoja.jacarepagua += mapas.jacarepagua.get(p.id) ?? 0;
            totalLoja.benfica     += mapas.benfica.get(p.id)     ?? 0;

            if (vAlvo === 0 && vMinha === 0) return;

            const gapAbsoluto = vAlvo - vMinha;
            const loss = vAlvo > 0 ? Math.max(0, (1 - (vMinha / vAlvo)) * 100) : 0;

            comparativo.push({
                id: p.id, desc: p.desc, vAlvo, vMinha, gapAbsoluto,
                loss:        parseFloat(loss.toFixed(1)),
                dominando:   vMinha > vAlvo,
                statusClass: loss >= 30 ? 'status-critico' : 'status-dominio',
            });
        });

        APP.rankings.duelos = comparativo.sort((a, b) => b.gapAbsoluto - a.gapAbsoluto);

        const top10 = APP.rankings.duelos.slice(0, 10);
        APP.rankings.meta.lossGap = (top10.reduce((a, b) => a + b.loss, 0) / (top10.length || 1)).toFixed(1);

        const maxV = Math.max(1, ...Object.values(totalLoja));
        APP.rankings.benchmarking = {
            hidraulica:  Math.round((totalLoja.hidraulica  / maxV) * 100),
            mesquita:    Math.round((totalLoja.mesquita    / maxV) * 100),
            jacarepagua: Math.round((totalLoja.jacarepagua / maxV) * 100),
            benfica:     Math.round((totalLoja.benfica     / maxV) * 100),
            loja: Math.round(((totalLoja.mesquita + totalLoja.jacarepagua + totalLoja.benfica) / 3 / maxV) * 100),
        };

        APP.rankings.topLeverage =
            APP.rankings.duelos.filter(d => d.dominando).sort((a, b) => b.vMinha - a.vMinha)[0]
            ?? { desc: 'N/A', vMinha: 0 };

        EventBus.emit('duelo:atualizado');
    },

    // ══════════════════════════════════════════════════════════════════
    // BI ENGINE v4 — Inteligência de Mercado + Cross-Brand
    // ══════════════════════════════════════════════════════════════════

    /**
     * Gera estruturas simultâneas a partir de pdv (atual) × pdvAnterior:
     *
     *   APP.rankings.bi.skus           → flat list por SKU
     *   APP.rankings.bi.subsecoes      → agrupado por subseção
     *   APP.rankings.bi.marcas         → duelos de marcas com Jaccard (igual ao v3)
     *   APP.rankings.bi.marcasGlobal   → [NOVO v4] ranking GLOBAL de marcas (cross-brand)
     *   APP.rankings.bi.compararMarcas → [NOVO v4] fn(nomeA, nomeB) → comparação
     *   APP.rankings.bi.skuParaDuelo   → Map(skuId → [índices])
     *   APP.rankings.bi.isMock         → true se pdvAnterior ausente
     */
    processarBI_DualTrend() {
        const temDadosReais = APP.db.pdvAnterior.length > 0;
        if (!temDadosReais) {
            console.info('[K11] BI v4 em modo ESTIMADO — forneça pdvAnterior para dados reais.');
        }

        // ── 1. AGREGAR VENDAS ────────────────────────────────────────
        const _agregar = (arr) => {
            const m = new Map();
            (Array.isArray(arr) ? arr : []).forEach(v => {
                const id  = String(v?.['Nº do produto'] ?? v?.Produto ?? '').trim();
                const q   = safeFloat(v?.['Quantidade vendida']);
                const sub = String(v?.['Denominação da subseção'] ?? v?.['denominacao_subsecao'] ?? '').trim();
                const txt = String(v?.['Texto breve material']    ?? v?.['texto_breve_material']  ?? '').trim();
                if (!id) return;
                if (!m.has(id)) m.set(id, { q: 0, sub, txt });
                const e = m.get(id);
                e.q += q;
                if (!e.sub && sub) e.sub = sub;
                if (!e.txt && txt) e.txt = txt;
            });
            return m;
        };

        const mapAtual    = _agregar(APP.db.pdv);
        const mapAnterior = temDadosReais ? _agregar(APP.db.pdvAnterior) : null;
        const todosSKUs   = new Set([...mapAtual.keys(), ...(mapAnterior?.keys() ?? [])]);

        // ── 2. DETECTAR MARCA (IDF-lite, agnóstica a posição) ────────
        const STOP = new Set([
            'DE','DO','DA','E','EM','COM','PARA','POR','A','O','AS','OS','NO','NA',
            'UN','PC','KG','G','ML','L','M','MT','CM','MM','M2','M3','CX','FD','RL',
            'KIT','CAIXA','PACOTE','ROLO','BARRA','TUBO','CONJ','CONJUNTO',
            'JOELHO','LUVA','CAP','TE','CURVA','REDUCAO','REGISTRO','VALVULA',
            'ADAPTADOR','BUCHA','NIPLE','FLANGE','UNION','UNIONS','TAMPAO',
            'PVC','PPR','CPVC','ABS','PE','PP','PB','PEAD','ARAME','ACO','INOX',
            'PRETO','BRANCO','AZUL','VERMELHO','VERDE','CINZA','BEGE','MARROM','AMARELO',
            'BSP','NPT','DN','PN','SDR','JEI','JE','CV','HP','RPM','HZ','VAC',
            'SOLD','ROSCA','FLANGEADO','SOLDAVEL','ROSCAVEL','SIMPLES','DUPLO',
            'CLASSE','TIPO','SERIE','MODELO','REF','SUP','INF','LAT',
            'CENTRIFUGA','CENTRIFUGO','SUBMERSA','PERIFERICA','AUTOCLAVE',
            'MONO','BIFASICA','TRIFASICA','MONOFASICA','MOTOR','ELETRICO',
            'BOMBA','ELETROBOMBA','PRESSURIZADOR','PRESSURIZADORA',
            'HIDRAULICA','HIDRO','AGUA','NIVEL','CARGA','SUCAO','RECALQUE',
        ]);

        const tokenFreq = new Map();
        const _tok = (txt) =>
            txt.toUpperCase().replace(/[^A-Z0-9\s]/g,' ').split(/\s+/)
               .filter(t => t.length >= 3 && !/^\d+$/.test(t) && !STOP.has(t));

        mapAtual.forEach(({ txt }) => {
            if (!txt) return;
            new Set(_tok(txt)).forEach(t => tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1));
        });
        const totalDocs = mapAtual.size || 1;

        const _detectMarca = (txt) => {
            if (!txt) return 'N/ID';
            const tokens = _tok(txt);
            if (!tokens.length) return 'N/ID';
            const cands = tokens.filter(t => {
                const f = tokenFreq.get(t) ?? 0;
                return f > 0 && (f / totalDocs) < 0.28;
            });
            if (!cands.length) {
                const alfa = tokens.filter(t => /^[A-Z]+$/.test(t));
                return alfa[alfa.length - 1] ?? tokens[tokens.length - 1] ?? 'N/ID';
            }
            return cands.reduce((best, t) =>
                (tokenFreq.get(t) ?? Infinity) < (tokenFreq.get(best) ?? Infinity) ? t : best
            );
        };

        // ── 3. BASE CANÔNICA (Jaccard) ────────────────────────────────
        const _baseTokens = (txt, marca) =>
            new Set(_tok(txt).filter(t => t !== marca));

        const _jaccard = (setA, setB) => {
            if (!setA.size && !setB.size) return 1;
            let inter = 0;
            setA.forEach(t => { if (setB.has(t)) inter++; });
            return inter / (setA.size + setB.size - inter);
        };

        const _triagem = (tokens, marca) =>
            [...tokens]
                .filter(t => t !== marca)
                .sort((a, b) => (tokenFreq.get(b) ?? 0) - (tokenFreq.get(a) ?? 0))
                .slice(0, 2)
                .sort()
                .join('|');

        // ── 4. LISTA FLAT ─────────────────────────────────────────────
        const lista = [...todosSKUs].map(id => {
            const atual     = mapAtual.get(id);
            const ant       = mapAnterior?.get(id);
            const qAtual    = atual?.q ?? 0;
            const qAnterior = mapAnterior
                ? (ant?.q ?? 0)
                : qAtual * (0.7 + Math.random() * 0.3);
            const diff  = qAtual - qAnterior;
            const perc  = qAnterior > 0 ? (diff / qAnterior) * 100 : (qAtual > 0 ? 100 : 0);
            const pInfo = APP.db.produtos.find(x => x.id === id);
            const sub   = atual?.sub || ant?.sub || '';
            const txt   = atual?.txt || ant?.txt || pInfo?.desc || '';
            const marca = _detectMarca(txt);

            return {
                id,
                desc:      pInfo?.desc ?? txt.substring(0, 40) ?? 'N/A',
                txt,
                sub:       sub || 'SEM SUBSEÇÃO',
                marca,
                qAtual,
                qAnterior: parseFloat(qAnterior.toFixed(1)),
                diff:      parseFloat(diff.toFixed(1)),
                perc:      parseFloat(perc.toFixed(1)),
                valTotal:  pInfo?.valTotal ?? 0,
                isMock:    !temDadosReais,
            };
        });

        // ── 5. RANKINGS POR SKU ───────────────────────────────────────
        const skusSorted = [...lista].sort((a, b) => b.perc - a.perc);
        APP.rankings.growth  = skusSorted.slice(0, 10);
        APP.rankings.decline = [...lista].sort((a, b) => a.perc - b.perc).slice(0, 10);

        // ── 6. RANKING POR SUBSEÇÃO ───────────────────────────────────
        const subMap = new Map();
        lista.forEach(item => {
            if (!subMap.has(item.sub)) {
                subMap.set(item.sub, { sub: item.sub, qAtual: 0, qAnterior: 0, valTotal: 0, skus: [] });
            }
            const s = subMap.get(item.sub);
            s.qAtual    += item.qAtual;
            s.qAnterior += item.qAnterior;
            s.valTotal  += item.valTotal;
            s.skus.push(item);
        });
        const subsecoes = [...subMap.values()].map(s => {
            const diff = s.qAtual - s.qAnterior;
            const perc = s.qAnterior > 0 ? (diff / s.qAnterior) * 100 : (s.qAtual > 0 ? 100 : 0);
            s.skus.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
            s.topGrowth  = s.skus.filter(x => x.diff > 0).slice(0, 5);
            s.topDecline = s.skus.filter(x => x.diff < 0).slice(0, 5);
            return { ...s, diff: parseFloat(diff.toFixed(1)), perc: parseFloat(perc.toFixed(1)) };
        }).sort((a, b) => Math.abs(b.perc) - Math.abs(a.perc));

        // ── 7. [NOVO v4] MARKET SHARE GLOBAL POR MARCA (Cross-Brand) ─
        // Agrega TODAS as vendas de qualquer produto por marca.
        // Permite comparar CLAW vs DANCOR em todo o portfólio hidráulico.
        const marcaGlobalMap = new Map();
        lista.forEach(item => {
            if (item.marca === 'N/ID') return;
            if (!marcaGlobalMap.has(item.marca)) {
                marcaGlobalMap.set(item.marca, {
                    marca: item.marca,
                    qAtual: 0, qAnterior: 0, valTotal: 0,
                    skuCount: 0, skus: [], subsecoes: new Set(),
                });
            }
            const m = marcaGlobalMap.get(item.marca);
            m.qAtual    += item.qAtual;
            m.qAnterior += item.qAnterior;
            m.valTotal  += item.valTotal;
            m.skuCount++;
            m.skus.push(item.id);
            if (item.sub) m.subsecoes.add(item.sub);
        });

        const totalVendasGlobal = lista.reduce((s, i) => s + i.qAtual, 0) || 1;
        const marcasGlobal = [...marcaGlobalMap.values()].map(m => {
            const diff  = m.qAtual - m.qAnterior;
            const perc  = m.qAnterior > 0 ? (diff / m.qAnterior) * 100 : (m.qAtual > 0 ? 100 : 0);
            const share = (m.qAtual / totalVendasGlobal) * 100;
            return {
                ...m,
                subsecoes: [...m.subsecoes],
                diff:      parseFloat(diff.toFixed(1)),
                perc:      parseFloat(perc.toFixed(1)),
                share:     parseFloat(share.toFixed(1)),
                tendencia: perc > 10 ? 'acelerando' : perc < -10 ? 'desacelerando' : 'estavel',
            };
        }).sort((a, b) => b.qAtual - a.qAtual);

        // ── 8. DUELO DE MARCAS POR PRODUTO (Jaccard matching — v3) ───
        const triageMap = new Map();
        lista.forEach(item => {
            if (!item.txt || item.marca === 'N/ID') return;
            const tokSet = _baseTokens(item.txt, item.marca);
            if (tokSet.size < 2) return;
            const chave = _triagem(tokSet, item.marca);
            if (!triageMap.has(chave)) triageMap.set(chave, []);
            triageMap.get(chave).push({ item, tokSet });
        });

        const dueloMap = new Map();
        triageMap.forEach((entries) => {
            const grupos = [];
            entries.forEach(entry => {
                let fundido = false;
                for (const g of grupos) {
                    if (_jaccard(g[0].tokSet, entry.tokSet) >= 0.60) {
                        g.push(entry); fundido = true; break;
                    }
                }
                if (!fundido) grupos.push([entry]);
            });

            grupos.forEach(g => {
                const rep = g.reduce((best, e) =>
                    e.item.qAtual > best.item.qAtual ? e : best
                );
                const baseLabel = g
                    .map(e => e.item.txt.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').trim())
                    .reduce((a, b) => a.length <= b.length ? a : b);
                const sub = rep.item.sub;
                const key = `${sub}||${[...rep.tokSet].sort().join('+')}`;

                if (!dueloMap.has(key)) {
                    dueloMap.set(key, { base: baseLabel, sub, marcaMap: new Map() });
                }
                const d = dueloMap.get(key);

                g.forEach(({ item }) => {
                    if (!d.marcaMap.has(item.marca)) {
                        d.marcaMap.set(item.marca, {
                            marca: item.marca,
                            qAtual: 0, qAnterior: 0,
                            skus: [], skuItems: [],
                        });
                    }
                    const m = d.marcaMap.get(item.marca);
                    m.qAtual    += item.qAtual;
                    m.qAnterior += item.qAnterior;
                    m.skus.push(item.id);
                    m.skuItems.push(item);
                });
            });
        });

        const marcas = [...dueloMap.values()]
            .filter(d => d.marcaMap.size >= 2)
            .map(d => {
                const lista_ = [...d.marcaMap.values()].map(m => {
                    const diff = m.qAtual - m.qAnterior;
                    const perc = m.qAnterior > 0 ? (diff / m.qAnterior) * 100 : (m.qAtual > 0 ? 100 : 0);
                    return { ...m, diff: parseFloat(diff.toFixed(1)), perc: parseFloat(perc.toFixed(1)) };
                }).sort((a, b) => b.qAtual - a.qAtual);

                const totalVol  = lista_.reduce((s, m) => s + m.qAtual, 0);
                const totalAnt  = lista_.reduce((s, m) => s + m.qAnterior, 0);
                const totalDiff = lista_.reduce((s, m) => s + m.diff, 0);
                const totalPerc = totalAnt > 0 ? (totalDiff / totalAnt) * 100 : 0;

                return {
                    base: d.base, sub: d.sub, marcas: lista_,
                    totalVol,
                    totalAnt:  parseFloat(totalAnt.toFixed(1)),
                    totalDiff: parseFloat(totalDiff.toFixed(1)),
                    totalPerc: parseFloat(totalPerc.toFixed(1)),
                };
            })
            .filter(d => d.totalVol > 0)
            .sort((a, b) => b.totalVol - a.totalVol);

        // ── 9. ÍNDICE REVERSO SKU → duelo(s) ─────────────────────────
        const skuParaDuelo = new Map();
        marcas.forEach((duelo, di) => {
            duelo.marcas.forEach(m => {
                m.skus.forEach(skuId => {
                    if (!skuParaDuelo.has(skuId)) skuParaDuelo.set(skuId, []);
                    skuParaDuelo.get(skuId).push(di);
                });
            });
        });

        // ── 10. [NOVO v4] compararMarcas(nomeA, nomeB) ───────────────
        // Compara duas marcas globalmente — independente do produto.
        const compararMarcas = (nomeA, nomeB) => {
            const mA = marcasGlobal.find(m => m.marca.toUpperCase() === nomeA.toUpperCase());
            const mB = marcasGlobal.find(m => m.marca.toUpperCase() === nomeB.toUpperCase());
            if (!mA || !mB) return null;
            const totalAB = (mA.qAtual + mB.qAtual) || 1;
            return {
                marcaA: mA.marca, marcaB: mB.marca,
                atual: {
                    A: mA.qAtual, B: mB.qAtual,
                    lider: mA.qAtual > mB.qAtual ? mA.marca : mB.marca,
                },
                anterior: {
                    A: mA.qAnterior, B: mB.qAnterior,
                    lider: mA.qAnterior > mB.qAnterior ? mA.marca : mB.marca,
                },
                shareA: parseFloat(((mA.qAtual / totalAB) * 100).toFixed(1)),
                shareB: parseFloat(((mB.qAtual / totalAB) * 100).toFixed(1)),
                tendenciaA: mA.tendencia, tendenciaB: mB.tendencia,
                percA: mA.perc, percB: mB.perc,
                skusA: mA.skuCount, skusB: mB.skuCount,
                subsecoesA: mA.subsecoes, subsecoesB: mB.subsecoes,
                vencedorAtual:     mA.qAtual > mB.qAtual ? mA.marca : mB.marca,
                vencedorTendencia: mA.perc   > mB.perc   ? mA.marca : mB.marca,
                mudouLider: (mA.qAtual > mB.qAtual) !== (mA.qAnterior > mB.qAnterior),
            };
        };

        // ── 11. analisarComparacao (modal de marcas por produto) ─────
        const analisarComparacao = (marca1Atual, marca1Anterior, marca2Atual, marca2Anterior) => {
            const m1_a = safeFloat(marca1Atual.qAtual    || 0);
            const m1_b = safeFloat(marca1Anterior.qAnterior || 0);
            const m2_a = safeFloat(marca2Atual.qAtual    || 0);
            const m2_b = safeFloat(marca2Anterior.qAnterior || 0);
            const d1 = m1_a - m1_b, d2 = m2_a - m2_b;
            const p1 = m1_b > 0 ? (d1 / m1_b * 100).toFixed(1) : '0';
            const p2 = m2_b > 0 ? (d2 / m2_b * 100).toFixed(1) : '0';
            return {
                marca1: marca1Atual.marca, marca2: marca2Atual.marca,
                atual: {
                    m1: Math.round(m1_a), m2: Math.round(m2_a),
                    diff: Math.round(m1_a - m2_a),
                    melhor: m1_a > m2_a ? '👑 ' + marca1Atual.marca : m2_a > m1_a ? '👑 ' + marca2Atual.marca : 'EMPATADO',
                },
                anterior: {
                    m1: Math.round(m1_b), m2: Math.round(m2_b),
                    diff: Math.round(m1_b - m2_b),
                    melhor: m1_b > m2_b ? '👑 ' + marca1Atual.marca : '👑 ' + marca2Atual.marca,
                },
                variacao: {
                    m1_abs: Math.round(d1), m1_perc: p1,
                    m2_abs: Math.round(d2), m2_perc: p2,
                    vencedor: Math.abs(d1) > Math.abs(d2) ? marca1Atual.marca : marca2Atual.marca,
                },
                trend: {
                    m1: d1 > 0 ? '↗ Crescendo' : d1 < 0 ? '↘ Caindo' : '→ Estável',
                    m2: d2 > 0 ? '↗ Crescendo' : d2 < 0 ? '↘ Caindo' : '→ Estável',
                },
                status: {
                    m1: d1 > 0 ? 'GANHANDO' : d1 < 0 ? 'PERDENDO' : 'ESTÁVEL',
                    m2: d2 > 0 ? 'GANHANDO' : d2 < 0 ? 'PERDENDO' : 'ESTÁVEL',
                },
            };
        };

        // ── 12. SALVA NO STATE ────────────────────────────────────────
        APP.rankings.bi = {
            skus:           skusSorted,
            subsecoes,
            marcas,
            marcasGlobal,        // ← [NOVO v4] ranking global cross-brand
            compararMarcas,      // ← [NOVO v4] fn(nomeA, nomeB) → comparação
            skuParaDuelo,
            analisarComparacao,  // mantido do v3 para modal de produto
            isMock: !temDadosReais,
        };

        EventBus.emit('bi:atualizado', { temDadosReais });
    },

    // ══════════════════════════════════════════════════════════════════
    // UC GLOBAL — gargalos com AEL/RES parado e PKL baixo
    // ══════════════════════════════════════════════════════════════════

    processarUCGlobal_DPA() {
        // Constrói mapa de agendamentos por SKU
        const agendMap = new Map();
        (APP.db._rawFornecedor ?? []).forEach(f => {
            if (!f?.FIELD3 || f?.FIELD1 === 'Número Pedido' || f?.FIELD1 === 'Cliente') return;
            const sku = String(f.FIELD3).trim();
            if (!sku) return;

            const nomeRaw    = String(f.FIELD12 ?? '').trim();
            const nome       = nomeRaw.includes(' - ') ? nomeRaw.split(' - ').slice(1).join(' - ') : nomeRaw;
            const nf         = String(f['AGENDAMENTOS POR FORNECEDOR'] ?? '').trim();
            const dataInicio = String(f.FIELD7 ?? '').substring(0, 10);
            const dataFim    = String(f.FIELD8 ?? '').substring(0, 10);

            const prev = agendMap.get(sku);
            if (prev) {
                prev.qtdAgendada   += safeFloat(f.FIELD5);
                prev.qtdConfirmada += safeFloat(f.FIELD6);
                if (!prev.pedidos.includes(String(f.FIELD1))) prev.pedidos.push(String(f.FIELD1));
                if (nf && !prev.nfs.includes(nf)) prev.nfs.push(nf);
            } else {
                agendMap.set(sku, {
                    fornecedor:    nome || 'Não identificado',
                    nfs:           nf ? [nf] : [],
                    pedidos:       [String(f.FIELD1)],
                    qtdAgendada:   safeFloat(f.FIELD5),
                    qtdConfirmada: safeFloat(f.FIELD6),
                    dataInicio, dataFim,
                    idAgendamento: String(f.FIELD9  ?? '').trim(),
                    doca:          String(f.FIELD11 ?? '').trim(),
                });
            }
        });

        const gargalos = [];

        APP.db.produtos.forEach(prod => {
            let pkl = 0, ael = 0, res = 0, log = 0;
            const deposPKL = [], deposAEL = [], deposRES = [], deposLOG = [];

            prod.depositos.forEach(d => {
                const t = (d.tipo ?? '').toUpperCase();
                if      (t === 'PKL') { pkl += d.q; deposPKL.push(d); }
                else if (t === 'AEL') { ael += d.q; deposAEL.push(d); }
                else if (t === 'RES') { res += d.q; deposRES.push(d); }
                else if (t === 'LOG') { log += d.q; deposLOG.push(d); }
            });

            if (!((ael > 0 || res > 0) && pkl <= 5)) return;

            let status, corStatus, scoreFator;
            if      (prod.total <= 0)               { status = 'RUPTURA';         corStatus = 'danger';  scoreFator = 4;   }
            else if (pkl === 0 && ael > 0 && res === 0) { status = 'AÉREO SEM PKL';   corStatus = 'danger';  scoreFator = 3;   }
            else if (pkl === 0 && res > 0 && ael === 0) { status = 'RESERVA SEM PKL'; corStatus = 'warning'; scoreFator = 3;   }
            else if (pkl === 0 && ael > 0 && res > 0)   { status = 'AÉREO + RESERVA'; corStatus = 'danger';  scoreFator = 3.5; }
            else if (pkl <= 2)                      { status = 'PKL CRÍTICO';     corStatus = 'danger';  scoreFator = 2;   }
            else                                    { status = 'PKL BAIXO';       corStatus = 'warning'; scoreFator = 1;   }

            const capMax       = getCapacidade(prod.desc);
            const pklPct       = capMax > 0 ? Math.min(Math.round((pkl / capMax) * 100), 100) : 0;
            const scoreGargalo = (ael + res) * scoreFator;

            gargalos.push({
                id: prod.id, desc: prod.desc,
                status, corStatus,
                pkl, ael, res, log,
                deposPKL, deposAEL, deposRES, deposLOG,
                capMax, pklPct,
                valTotal:    prod.valTotal,
                scoreGargalo,
                agendamento: agendMap.get(prod.id) ?? null,
            });
        });

        APP.db.ucGlobal = gargalos.sort((a, b) => b.scoreGargalo - a.scoreGargalo);
        EventBus.emit('uc:atualizado');
    },

    // ══════════════════════════════════════════════════════════════════
    // AÇÕES PRIORITÁRIAS — plano do dia automático
    // ══════════════════════════════════════════════════════════════════

    _gerarAcoesPrioritarias() {
        const acoes = [];
        APP.ui._acoesState ??= [];

        // 1. Top 2 gargalos UC
        APP.db.ucGlobal.slice(0, 2).forEach(g => {
            const disponivel = g.ael + g.res;
            const acao_uc = g.pkl === 0
                ? (g.ael > 0 ? 'BAIXAR DO AÉREO' : 'TRAZER DA RESERVA')
                : 'COMPLETAR PKL';
            acoes.push({
                urgencia: 'alta',
                desc: `Liberar fluxo: ${g.desc.substring(0, 32)}`,
                meta: `${g.id} · ${acao_uc} · PKL: ${g.pkl}un`,
                val:  `${disponivel} un`,
                id:   `dpa-${g.id}`,
            });
        });

        // 2. Top 2 rupturas por valor
        APP.db.produtos
            .filter(p => p.categoriaCor === 'red')
            .sort((a, b) => b.scoreCriticidade - a.scoreCriticidade)
            .slice(0, 2)
            .forEach(p => {
                acoes.push({
                    urgencia: 'alta',
                    desc: `Repor PKL: ${p.desc.substring(0, 32)}`,
                    meta: `${p.id} · ${p.subStatus === 'falso-zero' ? 'FALSO ZERO' : 'ZERADO'}`,
                    val:  `R$ ${brl(p.valTotal)}`,
                    id:   `rupt-${p.id}`,
                });
            });

        // 3. Top 2 SKUs com ruptura iminente (cobertura ≤ 7d)
        (APP.rankings.topRupturaProxima ?? []).slice(0, 2).forEach(p => {
            acoes.push({
                urgencia: 'media',
                desc: `Repor antes da ruptura: ${p.desc.substring(0, 28)}`,
                meta: `${p.id} · ~${p.diasCobertura}d (${p.dataRupturaEstimada})`,
                val:  `${p.mediaVendaDia.toFixed(1)}/dia`,
                id:   `cob-${p.id}`,
            });
        });

        // 4. Top 2 gaps de PDV
        APP.rankings.duelos.slice(0, 2).forEach(d => {
            acoes.push({
                urgencia: 'media',
                desc: `Atacar gap: ${d.desc.substring(0, 30)}`,
                meta: `${d.id} · -${d.gapAbsoluto}un vs ${APP.ui.pdvAlvo.toUpperCase()}`,
                val:  `-${d.loss.toFixed(0)}% efic.`,
                id:   `gap-${d.id}`,
            });
        });

        // 5. Crescimento a manter
        APP.rankings.growth.slice(0, 1).forEach(r => {
            acoes.push({
                urgencia: 'baixa',
                desc: `Ampliar exposição: ${r.desc.substring(0, 30)}`,
                meta: `${r.id} · +${r.perc}% crescimento`,
                val:  `+${r.perc}%`,
                id:   `grow-${r.id}`,
            });
        });

        return acoes.slice(0, 8).map(a => ({
            ...a,
            done: APP.ui._acoesState.includes(a.id),
        }));
    },

    // ══════════════════════════════════════════════════════════════════
    // INCONSISTÊNCIAS — SKUs com venda mas estoque zerado
    // ══════════════════════════════════════════════════════════════════

    detectarInconsistencias() {
        const vendasIds = new Set(
            APP.db.pdv
                .map(v => String(v?.['Nº do produto'] ?? v?.Produto ?? '').trim())
                .filter(Boolean)
        );

        APP.rankings.meta.inconsistentes = APP.db.produtos.filter(
            p => p.categoriaCor === 'red' && vendasIds.has(p.id)
        );

        if (APP.rankings.meta.inconsistentes.length > 0) {
            console.warn(
                `[K11] ⚠ ${APP.rankings.meta.inconsistentes.length} SKUs com venda mas estoque zerado:`,
                APP.rankings.meta.inconsistentes.map(p => p.id)
            );
        }
        EventBus.emit('inconsistencias:atualizadas');
    },
};
