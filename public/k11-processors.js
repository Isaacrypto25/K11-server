/**
 * K11 OMNI ELITE — PROCESSADORES DE DADOS
 * ════════════════════════════════════════
 * Transforma os JSONs brutos em estruturas otimizadas para as views.
 * Cada processador popula APP.db e APP.rankings, emitindo eventos via EventBus.
 *
 * Depende de: k11-config.js, k11-utils.js
 */

'use strict';

const Processors = {

    /**
     * Processa produtos.json → APP.db.produtos + APP.rankings.pieStats
     * Classifica cada SKU em: ruptura (red), abastecimento (yellow) ou saudável (green).
     *
     * Regras de tipo de depósito:
     *   CAB* / CHI* → tratados como PKL (piso de venda com nomenclatura diferente)
     *   PKL         → piso de picking
     *   AEL         → aéreo (endereço elevado)
     *   RES         → reserva
     *   LOG         → logística/trânsito
     */
    processarEstoque(data) {
        if (!Array.isArray(data) || data.length === 0) return;
        const mapa = new Map();

        data.forEach(p => {
            const sku = String(p?.['Produto'] ?? p?.['Nº do produto'] ?? '').trim();
            if (!sku) return;

            if (!mapa.has(sku)) {
                mapa.set(sku, { id: sku, desc: p['Descrição produto'] ?? 'N/A', depositos: [], pkl: 0, total: 0, valTotal: 0 });
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

        let valRed = 0, valYellow = 0;
        APP.db.produtos = [...mapa.values()].map(p => {
            if      (p.total <= 0) { p.categoriaCor = 'red';    p.status = 'ruptura';       p.subStatus = 'zero-total';  valRed    += p.valTotal; }
            else if (p.pkl   <= 0) { p.categoriaCor = 'red';    p.status = 'ruptura';       p.subStatus = 'falso-zero';  valRed    += p.valTotal; }
            else if (p.pkl   <= 2) { p.categoriaCor = 'yellow'; p.status = 'abastecimento'; p.subStatus = 'pkl-critico'; valYellow += p.valTotal; }
            else                   { p.categoriaCor = 'green';  p.status = 'saudavel';      p.subStatus = 'ok'; }
            p.scoreCriticidade = p.valTotal * (p.categoriaCor === 'red' ? 3 : p.categoriaCor === 'yellow' ? 1.5 : 0);
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

        EventBus.emit('estoque:atualizado');
    },

    /**
     * Processa vendas PDV → duelo hidráulica vs lojas concorrentes.
     * Popula APP.rankings.duelos, benchmarking, topLeverage.
     */
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
                loss: parseFloat(loss.toFixed(1)),
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

    /**
     * ══════════════════════════════════════════════════════════════════
     * BI ENGINE v2 — Inteligência de Mercado Multi-Dimensional
     * ══════════════════════════════════════════════════════════════════
     *
     * Gera 4 estruturas simultâneas a partir de pdv (atual) x pdvAnterior:
     *
     *   APP.rankings.bi.skus       → flat list por SKU (igual ao anterior)
     *   APP.rankings.bi.subsecoes  → agrupado por 'Denominação da subseção'
     *   APP.rankings.bi.marcas     → duelos de marca (Tigre vs Fortlev, etc.)
     *   APP.rankings.bi.isMock     → true se pdvAnterior ausente
     *
     * Mantém APP.rankings.growth e APP.rankings.decline para
     * retrocompatibilidade com gerarAcoesPrioritarias().
     *
     * Detecção de marca: heurística por token. Candidatos são tokens
     * do 'Texto breve material' que NÃO são números, unidades ou
     * palavras genéricas. O token mais incomum no corpus é eleito
     * como marca (IDF-lite). Fallback: último token alfabético.
     */
    processarBI_DualTrend() {
        const temDadosReais = APP.db.pdvAnterior.length > 0;
        if (!temDadosReais) {
            console.info('[K11] BI em modo ESTIMADO — forneça pdvAnterior para dados reais.');
        }

        // ── 1. AGREGAR VENDAS ───────────────────────────────────────
        const _agregar = (arr) => {
            const m = new Map();
            (Array.isArray(arr) ? arr : []).forEach(v => {
                const id  = String(v?.['Nº do produto'] ?? v?.Produto ?? '').trim();
                const q   = safeFloat(v?.['Quantidade vendida']);
                const sub = String(v?.['Denominação da subseção'] ?? v?.['denominacao_subsecao'] ?? '').trim();
                const txt = String(v?.['Texto breve material']    ?? v?.['texto_breve_material']  ?? '').trim();
                if (!id) return;
                if (!m.has(id)) m.set(id, { q: 0, sub, txt });
                const entry = m.get(id);
                entry.q  += q;
                if (!entry.sub && sub) entry.sub = sub;
                if (!entry.txt && txt) entry.txt = txt;
            });
            return m;
        };

        const mapAtual    = _agregar(APP.db.pdv);
        const mapAnterior = temDadosReais ? _agregar(APP.db.pdvAnterior) : null;
        const todosSKUs   = new Set([...mapAtual.keys(), ...(mapAnterior?.keys() ?? [])]);

        // ── 2. DETECTAR MARCA (heurística IDF-lite) ─────────────────
        //
        // Palavras genéricas/unidades que não são marcas:
        const STOP = new Set([
            'DE','DO','DA','E','EM','COM','PARA','POR','A','O','AS','OS',
            'UN','PC','KG','G','ML','L','M','MT','CM','MM','M2','M3',
            'CX','FD','RL','KIT','CAIXA','PACOTE','ROLO','BARRA','TUBO',
            'JOELHO','LUVA','CAP','TE','CURVA','REDUCAO','REGISTRO',
            'ADAPTADOR','BUCHA','NIPLE','FLANGE','UNIONS','UNION',
            'PVC','PPR','CPVC','ABS','PE','PP','PB','PEAD','PRETO','BRANCO',
            'AZUL','VERMELHO','VERDE','CINZA','BEGE','MARROM',
            '25MM','32MM','40MM','50MM','60MM','75MM','85MM','100MM','110MM',
            'BSP','NPT','MM','DN','PN','SDR','JEI','JE',
            'SOLD','ROSCA','FLANGEADO','SOLDAVEL','ROSCAVEL',
            'SIMPLES','DUPLO','TRIPLO','LONGO','CURTO',
            'CLASSE','TIPO','SERIE','MODELO','REF','REF.',
        ]);

        // Monta corpus de tokens para calcular frequência (IDF-lite)
        const tokenFreq = new Map();
        const _tokenize = (txt) =>
            txt.toUpperCase()
               .replace(/[^A-Z0-9\s]/g, ' ')
               .split(/\s+/)
               .filter(t => t.length >= 3 && !/^\d+$/.test(t) && !STOP.has(t));

        mapAtual.forEach(({ txt }) => {
            const tokens = _tokenize(txt);
            new Set(tokens).forEach(t => tokenFreq.set(t, (tokenFreq.get(t) ?? 0) + 1));
        });

        const totalDocs = mapAtual.size || 1;

        // Elege a marca de uma descrição: token com menor freq relativa (mais específico)
        const _detectMarca = (txt) => {
            if (!txt) return 'N/ID';
            const tokens = _tokenize(txt);
            if (!tokens.length) return 'N/ID';
            // Filtra tokens candidatos (freq < 30% do corpus = diferenciador de marca)
            const candidatos = tokens.filter(t => {
                const freq = tokenFreq.get(t) ?? 0;
                return freq > 0 && (freq / totalDocs) < 0.30;
            });
            if (!candidatos.length) {
                // fallback: último token alfabético puro
                const alfa = tokens.filter(t => /^[A-Z]+$/.test(t));
                return alfa[alfa.length - 1] ?? tokens[tokens.length - 1] ?? 'N/ID';
            }
            // Elege o de menor frequência relativa (mais raro = mais específico = mais provável marca)
            return candidatos.reduce((best, t) =>
                (tokenFreq.get(t) ?? Infinity) < (tokenFreq.get(best) ?? Infinity) ? t : best
            );
        };

        // ── 3. MONTAR LISTA FLAT DE SKUS ────────────────────────────
        const lista = [...todosSKUs].map(id => {
            const atual    = mapAtual.get(id);
            const ant      = mapAnterior?.get(id);
            const qAtual    = atual?.q ?? 0;
            const qAnterior = mapAnterior
                ? (ant?.q ?? 0)
                : qAtual * (0.7 + Math.random() * 0.3); // MOCK
            const diff  = qAtual - qAnterior;
            const perc  = qAnterior > 0 ? (diff / qAnterior) * 100 : (qAtual > 0 ? 100 : 0);
            const pInfo = APP.db.produtos.find(x => x.id === id);

            // Subseção: prioridade pdv atual > pdvAnterior > produtos
            const sub = atual?.sub || ant?.sub || '';
            // Texto breve: prioridade pdv atual > pdvAnterior > descrição produto
            const txt = atual?.txt || ant?.txt || pInfo?.desc || '';
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

        // ── 4. RANKINGS POR SKU ─────────────────────────────────────
        const skusSorted = [...lista].sort((a, b) => b.perc - a.perc);
        APP.rankings.growth  = skusSorted.slice(0, 10);
        APP.rankings.decline = [...lista].sort((a, b) => a.perc - b.perc).slice(0, 10);

        // ── 5. RANKING POR SUBSEÇÃO ──────────────────────────────────
        const subMap = new Map();
        lista.forEach(item => {
            const key = item.sub;
            if (!subMap.has(key)) {
                subMap.set(key, { sub: key, qAtual: 0, qAnterior: 0, valTotal: 0, skus: [] });
            }
            const s = subMap.get(key);
            s.qAtual    += item.qAtual;
            s.qAnterior += item.qAnterior;
            s.valTotal  += item.valTotal;
            s.skus.push(item);
        });

        const subsecoes = [...subMap.values()].map(s => {
            const diff = s.qAtual - s.qAnterior;
            const perc = s.qAnterior > 0 ? (diff / s.qAnterior) * 100 : (s.qAtual > 0 ? 100 : 0);
            // Ordenar SKUs internos por contribuição de variação absoluta
            s.skus.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
            s.topGrowth  = s.skus.filter(x => x.diff > 0).slice(0, 5);
            s.topDecline = s.skus.filter(x => x.diff < 0).slice(0, 5);
            return { ...s, diff: parseFloat(diff.toFixed(1)), perc: parseFloat(perc.toFixed(1)) };
        }).sort((a, b) => Math.abs(b.perc) - Math.abs(a.perc));

        // ── 6. DUELO DE MARCAS ───────────────────────────────────────
        //
        // Estratégia: para cada par de SKUs com descrição similar mas marcas
        // diferentes dentro da mesma subseção, agrupa por "produto base"
        // (descrição sem a marca) e cria duelos marca-a-marca.
        //
        // "produto base" = texto breve sem os tokens que são marcas
        const _baseProduto = (txt, marcaDetectada) => {
            return txt.toUpperCase()
                .replace(/[^A-Z0-9\s]/g, ' ')
                .split(/\s+/)
                .filter(t => t !== marcaDetectada && t.length >= 2)
                .join(' ')
                .trim() || txt.toUpperCase().substring(0, 20);
        };

        // Agrupa por (subseção, produto_base) → { marca → { qAtual, qAnterior } }
        const dueloMap = new Map();
        lista.forEach(item => {
            if (!item.txt || item.marca === 'N/ID') return;
            const base = _baseProduto(item.txt, item.marca);
            if (base.length < 5) return; // base muito curta = ruído
            const key  = `${item.sub}||${base}`;
            if (!dueloMap.has(key)) dueloMap.set(key, { base, sub: item.sub, marcas: new Map() });
            const d = dueloMap.get(key);
            if (!d.marcas.has(item.marca)) {
                d.marcas.set(item.marca, { marca: item.marca, qAtual: 0, qAnterior: 0, skus: [] });
            }
            const m = d.marcas.get(item.marca);
            m.qAtual    += item.qAtual;
            m.qAnterior += item.qAnterior;
            m.skus.push(item.id);
        });

        // Filtra apenas grupos com 2+ marcas (duelos reais) e volume relevante
        const marcas = [...dueloMap.values()]
            .filter(d => d.marcas.size >= 2)
            .map(d => {
                const lista_ = [...d.marcas.values()]
                    .map(m => {
                        const diff = m.qAtual - m.qAnterior;
                        const perc = m.qAnterior > 0 ? (diff / m.qAnterior) * 100 : (m.qAtual > 0 ? 100 : 0);
                        return { ...m, diff: parseFloat(diff.toFixed(1)), perc: parseFloat(perc.toFixed(1)) };
                    })
                    .sort((a, b) => b.qAtual - a.qAtual);

                const totalVol = lista_.reduce((s, m) => s + m.qAtual, 0);
                return { base: d.base, sub: d.sub, marcas: lista_, totalVol };
            })
            .filter(d => d.totalVol > 0)
            .sort((a, b) => b.totalVol - a.totalVol)
            .slice(0, 30); // máx 30 duelos no ranking

        // ── 7. SALVA NO STATE ────────────────────────────────────────
        APP.rankings.bi = {
            skus:      skusSorted,
            subsecoes,
            marcas,
            isMock:    !temDadosReais,
        };

        EventBus.emit('bi:atualizado', { temDadosReais });
    },

    /**
     * Identifica gargalos de UC (Unitização e Complementação):
     * SKUs com mercadoria travada em AEL/RES mas PKL crítico (≤5 un).
     * Score = (ael + res) × fator_urgência → ordena por impacto.
     */
    processarUCGlobal_DPA() {
        // Constrói mapa de agendamentos por SKU a partir do fornecedor.json
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

            // Classificação de urgência
            let status, corStatus, scoreFator;
            if      (prod.total <= 0)                        { status = 'RUPTURA';         corStatus = 'danger';  scoreFator = 4;   }
            else if (pkl === 0 && ael > 0 && res === 0)      { status = 'AÉREO SEM PKL';   corStatus = 'danger';  scoreFator = 3;   }
            else if (pkl === 0 && res > 0 && ael === 0)      { status = 'RESERVA SEM PKL'; corStatus = 'warning'; scoreFator = 3;   }
            else if (pkl === 0 && ael > 0 && res > 0)        { status = 'AÉREO + RESERVA'; corStatus = 'danger';  scoreFator = 3.5; }
            else if (pkl <= 2)                               { status = 'PKL CRÍTICO';     corStatus = 'danger';  scoreFator = 2;   }
            else                                             { status = 'PKL BAIXO';       corStatus = 'warning'; scoreFator = 1;   }

            const capMax      = getCapacidade(prod.desc);
            const pklPct      = capMax > 0 ? Math.min(Math.round((pkl / capMax) * 100), 100) : 0;
            const scoreGargalo = (ael + res) * scoreFator;

            gargalos.push({
                id: prod.id, desc: prod.desc,
                status, corStatus,
                pkl, ael, res, log,
                deposPKL, deposAEL, deposRES, deposLOG,
                capMax, pklPct,
                valTotal: prod.valTotal,
                scoreGargalo,
                agendamento: agendMap.get(prod.id) ?? null,
            });
        });

        APP.db.ucGlobal = gargalos.sort((a, b) => b.scoreGargalo - a.scoreGargalo);
        EventBus.emit('uc:atualizado');
    },

    /**
     * Gera lista de ações prioritárias combinando gargalos UC, rupturas e gaps de venda.
     * @returns {Array} Lista de até 6 ações com urgência e estado done/pendente
     */
    gerarAcoesPrioritarias() {
        const acoes = [];

        APP.db.ucGlobal.slice(0, 2).forEach(g => {
            acoes.push({
                urgencia: 'alta',
                desc: `Liberar fluxo: ${g.desc.substring(0, 32)}`,
                meta: `${g.id} · ${g.diasParado < 999 ? g.diasParado + 'd parado' : 'S/MOV'} no DPA`,
                val: `${g.qtdDPA} un`,
                id: `dpa-${g.id}`,
            });
        });

        APP.db.produtos
            .filter(p => p.categoriaCor === 'red')
            .sort((a, b) => b.scoreCriticidade - a.scoreCriticidade)
            .slice(0, 2)
            .forEach(p => {
                acoes.push({
                    urgencia: 'alta',
                    desc: `Repor PKL: ${p.desc.substring(0, 32)}`,
                    meta: `${p.id} · ${p.subStatus === 'falso-zero' ? 'FALSO ZERO' : 'ZERADO'}`,
                    val: `R$ ${brl(p.valTotal)}`,
                    id: `rupt-${p.id}`,
                });
            });

        APP.rankings.duelos.slice(0, 2).forEach(d => {
            acoes.push({
                urgencia: 'media',
                desc: `Atacar gap: ${d.desc.substring(0, 30)}`,
                meta: `${d.id} · -${d.gapAbsoluto}un vs ${APP.ui.pdvAlvo.toUpperCase()}`,
                val: `-${d.loss.toFixed(0)}% efic.`,
                id: `gap-${d.id}`,
            });
        });

        APP.rankings.growth.slice(0, 1).forEach(r => {
            acoes.push({
                urgencia: 'baixa',
                desc: `Ampliar exposição: ${r.desc.substring(0, 30)}`,
                meta: `${r.id} · +${r.perc}% crescimento`,
                val: `+${r.perc}%`,
                id: `grow-${r.id}`,
            });
        });

        APP.ui._acoesState ??= [];
        return acoes.slice(0, 6).map(a => ({ ...a, done: APP.ui._acoesState.includes(a.id) }));
    },

    /**
     * Detecta inconsistências: SKUs com venda registrada mas estoque zerado.
     * Resultado salvo em APP.rankings.meta.inconsistentes.
     */
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
    },
};
