/**
 * K11 OMNI ELITE — DEMO DATA INJECTOR v9
 * ══════════════════════════════════════════
 * Injeta dados realistas quando o servidor Railway/Supabase
 * não está acessível. Ativa automaticamente quando APP.db
 * está vazio após o boot.
 *
 * Cobre:
 *  · Composição de Saúde PKL (Saudável / Zona Crítica / Zerados)
 *  · Mapa de Ataque PDV (Mesquita, Jacarepaguá, Benfica)
 *  · Performance / Mapa Regional (Hidráulica vs PDVs)
 *  · KPI Row animada (UC Global, Tarefas, Ações)
 */

'use strict';

(function () {

    /* ── GERADOR DE VALOR ALEATÓRIO FIXO (seed) ─────────────────── */
    function seededRand(seed) {
        let s = seed;
        return function () {
            s = (s * 16807 + 0) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }
    const rand = seededRand(20250419);

    /* ── GERAR PRODUTOS MOCK ──────────────────────────────────────── */
    function _buildProdutos() {
        const TOTAL = 134;
        const produtos = [];
        const CATEGORIAS = ['Hidráulica', 'Elétrica', 'Ferragens', 'Tintas', 'Pisos'];
        const STATUS_DIST = [
            { cor: 'red',    pct: 0.11 },   // 11% Zerados
            { cor: 'yellow', pct: 0.29 },   // 29% Zona Crítica
            { cor: 'green',  pct: 0.60 },   // 60% Saudável
        ];

        let idx = 0;
        STATUS_DIST.forEach(({ cor, pct }) => {
            const count = Math.round(TOTAL * pct);
            for (let i = 0; i < count; i++, idx++) {
                const val = Math.round((rand() * 1600 + 180) * 100) / 100;
                const pkl = cor === 'red' ? 0 : cor === 'yellow' ? Math.floor(rand() * 4) + 1 : Math.floor(rand() * 20) + 5;
                produtos.push({
                    id:          `SKU-${String(idx + 1).padStart(4, '0')}`,
                    nome:        `Produto ${CATEGORIAS[idx % CATEGORIAS.length]} ${idx + 1}`,
                    valTotal:    val,
                    categoriaCor: cor,
                    pkl:         pkl,
                    pklPct:      cor === 'red' ? 0 : Math.min(100, pkl * 5),
                    subStatus:   cor === 'yellow' && pkl <= 2 ? 'pkl-critico' : null,
                    deposPKL:    [{ deposito: 'CD PRINCIPAL', q: pkl }],
                });
            }
        });

        return produtos;
    }

    /* ── CALCULAR RANKINGS A PARTIR DOS PRODUTOS ─────────────────── */
    function _buildRankings(produtos) {
        const red    = produtos.filter(p => p.categoriaCor === 'red');
        const yellow = produtos.filter(p => p.categoriaCor === 'yellow');
        const green  = produtos.filter(p => p.categoriaCor === 'green');

        const sumVal = arr => Math.round(arr.reduce((a, b) => a + b.valTotal, 0));

        // Benchmarking PDVs (índice 0–100, quanto do alvo atingido)
        const benchmarking = {
            hidraulica:   74,
            mesquita:     61,
            jacarepagua:  68,
            benfica:      53,
            loja:         70,
        };

        const mediaGeral = Math.round((benchmarking.mesquita + benchmarking.jacarepagua + benchmarking.benfica) / 3);

        const duelos = [
            { id: 'BENFICA',     val: benchmarking.benfica,     gap: 100 - benchmarking.benfica,     dominando: false },
            { id: 'MESQUITA',    val: benchmarking.mesquita,    gap: 100 - benchmarking.mesquita,    dominando: true  },
            { id: 'JACAREPAGUÁ', val: benchmarking.jacarepagua, gap: 100 - benchmarking.jacarepagua, dominando: false },
        ].sort((a, z) => z.gap - a.gap);

        return {
            pieStats: {
                red:    red.length,
                yellow: yellow.length,
                green:  green.length,
                total:  produtos.length,
            },
            benchmarking,
            meta: {
                valTotalYellow:   sumVal(yellow),
                valTotalRed:      sumVal(red),
                inconsistentes:   [],
                inconsistentesMap: new Map(),
            },
            duelos,
            mediaGeral,
        };
    }

    /* ── GERAR TAREFAS MOCK ──────────────────────────────────────── */
    function _buildTarefas() {
        const lista = [
            'Auditar estoque Benfica',
            'Conferir PKL Hidráulica',
            'Relatório semanal PDV',
            'Atualizar preços concorrência',
            'Visita técnica Mesquita',
            'Treinar equipe coleta',
            'Revisar inconsistências',
            'Inventário Jacarepaguá',
            'Fechar ciclo semanal',
            'Enviar dashboard gestores',
            'Conferir agendamentos',
            'Sync Regional',
        ];
        return lista.map((text, i) => ({
            id:    i + 1,
            texto: text,
            done:  i < 5,
        }));
    }

    /* ── INJETAR DADOS NO APP ───────────────────────────────────── */
    function injectDemoData() {
        if (!window.APP) return;
        if (APP.db?.produtos?.length > 0) return;   // já tem dados reais

        const produtos   = _buildProdutos();
        const rankings   = _buildRankings(produtos);
        const tarefas    = _buildTarefas();
        const ucGlobal   = Array.from({ length: 47 }, (_, i) => ({ id: i + 1 }));

        /* ── DB ── */
        APP.db.produtos     = produtos;
        APP.db.rawEstoque   = produtos;
        APP.db.ucGlobal     = ucGlobal;
        APP.db.tarefas      = tarefas;
        APP.db.pdv          = APP.db.pdv         || [];
        APP.db.pdvAnterior  = APP.db.pdvAnterior || [];

        /* ── RANKINGS ── */
        APP.rankings.pieStats     = rankings.pieStats;
        APP.rankings.benchmarking = rankings.benchmarking;
        APP.rankings.meta         = rankings.meta;
        APP.rankings.duelos       = rankings.duelos;

        /* ── Re-render view atual ── */
        const currentView = APP.ui?.currentView || 'dash';
        if (typeof APP.view === 'function') {
            APP.view(currentView);
        }

        /* ── Badge visual de modo demo ── */
        if (!document.getElementById('k11-demo-badge')) {
            const badge = document.createElement('div');
            badge.id        = 'k11-demo-badge';
            badge.className = 'k11-demo-badge';
            badge.title     = 'Dados de demonstração — conecte ao servidor para dados reais';
            badge.textContent = '⚡ DEMO';
            document.body.appendChild(badge);
        }

        console.log('[K11Demo] ✅ Dados demo injetados:', {
            produtos:  produtos.length,
            zerados:   rankings.pieStats.red,
            criticos:  rankings.pieStats.yellow,
            saudaveis: rankings.pieStats.green,
            tarefas:   tarefas.length,
        });
    }

    /* ── BOOT: aguarda APP estar pronto ─────────────────────────── */
    function _boot() {
        window.addEventListener('k11:ready', function () {
            setTimeout(injectDemoData, 900);
        });

        // Fallback: se o evento já disparou ou nunca disparar
        setTimeout(function () {
            if (window.APP && (!APP.db?.produtos?.length)) {
                injectDemoData();
            }
        }, 3000);
    }

    _boot();
    window.K11DemoData = { inject: injectDemoData };

})();
