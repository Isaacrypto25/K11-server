/**
 * K11 OMNI ELITE — Onboarding Tour v1.0
 * ════════════════════════════════════════
 * Tour guiado pelas funcionalidades para novos usuários.
 * Ativa automaticamente na primeira vez (baseado em localStorage).
 *
 * Expõe: window.K11Tour
 *   K11Tour.start()    → inicia o tour
 *   K11Tour.skip()     → pula o tour
 *   K11Tour.reset()    → reseta (para ver o tour de novo)
 */

'use strict';

const K11Tour = (() => {

    const TOUR_KEY  = 'k11_tour_done_v2';
    const OVERLAY_ID= 'k11-tour-overlay';

    const STEPS = [
        {
            title:   'Bem-vindo ao K11 OMNI ELITE',
            body:    'Sistema operacional de PDVs com IA integrada. Vamos explorar as principais funcionalidades em 60 segundos.',
            icon:    '🚀',
            target:  null,
            action:  null,
        },
        {
            title:   'Dashboard — visão geral do portfólio',
            body:    'Aqui você vê em tempo real quantos SKUs estão em ruptura, atenção ou saudáveis, com comparação vs período anterior.',
            icon:    '📊',
            target:  '.dash-grid',
            action:  () => { if(typeof APP!=='undefined') APP.view('dash'); },
        },
        {
            title:   'Estoque — consulte e reponha SKUs',
            body:    'Busque qualquer SKU, adicione à fila de reposição e exporte. Filtre por ruptura, atenção ou saudável.',
            icon:    '📦',
            target:  null,
            action:  () => { if(typeof APP!=='undefined') APP.view('estoque'); },
        },
        {
            title:   'Projetor — benchmarking de lojas',
            body:    'Compare sua loja com as demais em tempo real. A barra laranja é sua loja — mantenha ela acima da referência azul (HIDRÁULICA).',
            icon:    '📈',
            target:  null,
            action:  () => { if(typeof APP!=='undefined') APP.view('projetor'); },
        },
        {
            title:   'Assistente de Voz — mãos livres',
            body:    'Toque no botão laranja flutuante para ativar o assistente de voz. Pergunte: "quais SKUs estão em ruptura?" ou "gerar orçamento de piso".',
            icon:    '🎙️',
            target:  '#k11-float-fab',
            action:  null,
        },
        {
            title:   'Painel Ao Vivo — alertas em tempo real',
            body:    'O indicador no topo pulsa quando há alertas do servidor. Toque para ver o painel de prioridades e o score de saúde do sistema.',
            icon:    '⚡',
            target:  '#k11d-pill',
            action:  null,
        },
        {
            title:   'K11 OBRA — gestão de obras',
            body:    'Gerencie obras, acompanhe fases, faça chat com o cliente e gere orçamentos com IA a partir de fotos ou descrição.',
            icon:    '🏗️',
            target:  null,
            action:  () => { if(typeof APP!=='undefined') APP.view('obraHome'); },
        },
        {
            title:   'Tudo pronto! 🎉',
            body:    'Você pode rever este tour a qualquer momento nas configurações. Para ajuda, use o assistente de voz ou acesse a documentação.',
            icon:    '✅',
            target:  null,
            action:  null,
            last:    true,
        },
    ];

    let _step    = 0;
    let _active  = false;

    // ── CSS ────────────────────────────────────────────────────
    function _injectCSS() {
        if (document.getElementById('k11-tour-styles')) return;
        const s = document.createElement('style');
        s.id    = 'k11-tour-styles';
        s.textContent = `
        #k11-tour-overlay {
            position:fixed;inset:0;z-index:10000;
            display:flex;align-items:center;justify-content:center;
            background:rgba(0,0,0,.6);backdrop-filter:blur(4px);
            padding:20px;
        }
        #k11-tour-card {
            background:var(--card-bg,#0c0e18);
            border:1px solid var(--border-mid,#222540);
            border-radius:20px;padding:28px 24px;
            width:100%;max-width:340px;
            animation:tourSlide .28s cubic-bezier(.34,1.56,.64,1);
        }
        @keyframes tourSlide {
            from{transform:translateY(24px);opacity:0}
            to{transform:translateY(0);opacity:1}
        }
        .tour-icon { font-size:36px;margin-bottom:14px; }
        .tour-title { font-size:17px;font-weight:800;color:var(--text-main,#EDF0F7);margin-bottom:10px; }
        .tour-body  { font-size:13px;color:var(--text-soft,#B0B8CC);line-height:1.6;margin-bottom:20px; }
        .tour-dots  { display:flex;gap:6px;justify-content:center;margin-bottom:20px; }
        .tour-dot   { width:6px;height:6px;border-radius:50%;background:var(--border-bright,#2d3155);transition:all .2s; }
        .tour-dot.active { background:var(--primary,#FF8C00);transform:scale(1.3); }
        .tour-actions { display:flex;gap:8px; }
        .tour-btn { flex:1;padding:12px;border-radius:12px;border:none;cursor:pointer;font-size:13px;font-weight:700;transition:all .2s; }
        .tour-btn-skip { background:var(--border,#191c2e);color:var(--text-muted,#5A6480); }
        .tour-btn-next { background:var(--primary,#FF8C00);color:#000; }
        .tour-btn-skip:hover { background:var(--border-mid,#222540); }
        .tour-btn-next:hover { background:#e07d00; }
        `;
        document.head.appendChild(s);
    }

    // ── RENDER ─────────────────────────────────────────────────
    function _render() {
        document.getElementById(OVERLAY_ID)?.remove();

        const step = STEPS[_step];
        if (!step) { _finish(); return; }

        // Executa ação de navegação do step
        if (step.action) {
            try { step.action(); } catch (_) {}
        }

        const overlay = document.createElement('div');
        overlay.id    = OVERLAY_ID;
        overlay.innerHTML = `
        <div id="k11-tour-card">
            <div class="tour-icon">${step.icon}</div>
            <div class="tour-title">${step.title}</div>
            <div class="tour-body">${step.body}</div>
            <div class="tour-dots">
                ${STEPS.map((_, i) => `<div class="tour-dot ${i === _step ? 'active' : ''}"></div>`).join('')}
            </div>
            <div class="tour-actions">
                <button class="tour-btn tour-btn-skip" onclick="K11Tour.skip()">Pular tour</button>
                <button class="tour-btn tour-btn-next" onclick="K11Tour.next()">
                    ${step.last ? 'Começar →' : 'Próximo →'}
                </button>
            </div>
        </div>`;

        // Fecha ao clicar fora do card
        overlay.addEventListener('click', e => {
            if (e.target === overlay) K11Tour.skip();
        });

        document.body.appendChild(overlay);
    }

    // ── API PÚBLICA ────────────────────────────────────────────
    function start() {
        _injectCSS();
        _step   = 0;
        _active = true;
        _render();
    }

    function next() {
        _step++;
        if (_step >= STEPS.length) {
            _finish();
        } else {
            _render();
        }
    }

    function skip() {
        _finish();
    }

    function _finish() {
        document.getElementById(OVERLAY_ID)?.remove();
        _active = false;
        try { localStorage.setItem(TOUR_KEY, '1'); } catch (_) {}
        // Volta ao dashboard se estava em outra view
        try { if (typeof APP !== 'undefined') APP.view('dash'); } catch (_) {}
    }

    function reset() {
        try { localStorage.removeItem(TOUR_KEY); } catch (_) {}
        console.log('[K11Tour] Tour resetado — será exibido na próxima visita.');
    }

    function shouldShow() {
        try { return !localStorage.getItem(TOUR_KEY); } catch (_) { return false; }
    }

    // ── AUTO-INIT ──────────────────────────────────────────────
    window.addEventListener('k11:ready', () => {
        if (shouldShow()) {
            // Aguarda 1s após o app carregar
            setTimeout(start, 1200);
        }
    });

    return { start, next, skip, reset, shouldShow };

})();

window.K11Tour = K11Tour;
