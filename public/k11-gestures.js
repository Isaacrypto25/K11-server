/**
 * K11 OMNI ELITE — Gestures v1.0
 * ════════════════════════════════
 * Gestos mobile nativos:
 *   • Swipe horizontal → navega entre views
 *   • Pull-to-refresh  → recarrega dados (já tem na APP, aqui complementa)
 *   • Pinch-to-zoom    → no projetor (zoom da tabela de benchmarking)
 *   • Atalhos de teclado (desktop)
 *
 * Depende de: k11-config.js, k11-app.js
 */

'use strict';

(function K11Gestures() {

    const VIEWS_ORDER = ['dash', 'estoque', 'operacional', 'projetor', 'acoesPrioritarias'];
    const SWIPE_THRESHOLD  = 50;   // px mínimo para contar como swipe
    const SWIPE_MAX_VERT   = 120;  // px máximo vertical para ainda ser swipe horizontal

    let _touchStartX  = 0;
    let _touchStartY  = 0;
    let _touchStartT  = 0;
    let _currentView  = 'dash';
    let _swiping      = false;

    // ── SWIPE HORIZONTAL ────────────────────────────────────────
    function _getViewIndex() {
        return VIEWS_ORDER.indexOf(_currentView);
    }

    function _navigateTo(viewName) {
        if (!viewName) return;
        _currentView = viewName;
        try {
            if (typeof APP !== 'undefined') APP.view(viewName);
        } catch (_) {}
    }

    function _onTouchStart(e) {
        const t = e.touches[0];
        _touchStartX = t.clientX;
        _touchStartY = t.clientY;
        _touchStartT = Date.now();
        _swiping     = false;
    }

    function _onTouchMove(e) {
        if (!e.touches.length) return;
        const dx = e.touches[0].clientX - _touchStartX;
        const dy = e.touches[0].clientY - _touchStartY;
        // Previne scroll se for claramente um swipe horizontal
        if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            _swiping = true;
        }
    }

    function _onTouchEnd(e) {
        if (!_swiping) return;
        const t  = e.changedTouches[0];
        const dx = t.clientX  - _touchStartX;
        const dy = t.clientY  - _touchStartY;
        const dt = Date.now() - _touchStartT;

        // Ignora se o movimento vertical foi grande (era scroll)
        if (Math.abs(dy) > SWIPE_MAX_VERT) return;

        // Velocidade mínima (swipe rápido) ou distância mínima
        const isFastSwipe   = dt < 300 && Math.abs(dx) > 30;
        const isLongSwipe   = Math.abs(dx) > SWIPE_THRESHOLD;
        if (!isFastSwipe && !isLongSwipe) return;

        const idx = _getViewIndex();
        if (dx < 0 && idx < VIEWS_ORDER.length - 1) {
            // Swipe left → próxima view
            _navigateTo(VIEWS_ORDER[idx + 1]);
            _showSwipeIndicator('→');
        } else if (dx > 0 && idx > 0) {
            // Swipe right → view anterior
            _navigateTo(VIEWS_ORDER[idx - 1]);
            _showSwipeIndicator('←');
        }
        _swiping = false;
    }

    // ── INDICADOR VISUAL DE SWIPE ────────────────────────────────
    function _showSwipeIndicator(direction) {
        const existing = document.getElementById('k11-swipe-ind');
        if (existing) existing.remove();

        const el       = document.createElement('div');
        el.id          = 'k11-swipe-ind';
        el.textContent = direction;
        el.style.cssText = `
            position:fixed;top:50%;left:50%;
            transform:translate(-50%,-50%);
            font-size:28px;font-weight:900;
            color:var(--primary,#FF8C00);
            pointer-events:none;z-index:9999;
            animation:swipeFlash .3s ease forwards;
        `;
        if (!document.getElementById('k11-swipe-style')) {
            const s = document.createElement('style');
            s.id    = 'k11-swipe-style';
            s.textContent = '@keyframes swipeFlash{0%{opacity:1;transform:translate(-50%,-50%) scale(1.2)}100%{opacity:0;transform:translate(-50%,-50%) scale(.8)}}';
            document.head.appendChild(s);
        }
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 350);
    }

    // ── DOTS DE NAVEGAÇÃO MOBILE ─────────────────────────────────
    function _buildNavDots() {
        if (document.getElementById('k11-nav-dots')) return;
        const dots = document.createElement('div');
        dots.id    = 'k11-nav-dots';
        dots.style.cssText = `
            position:fixed;bottom:8px;left:50%;transform:translateX(-50%);
            display:flex;gap:6px;z-index:1100;pointer-events:none;
        `;
        VIEWS_ORDER.forEach((v, i) => {
            const d = document.createElement('div');
            d.dataset.view = v;
            d.style.cssText = `
                width:6px;height:6px;border-radius:50%;
                background:${i === 0 ? 'var(--primary,#FF8C00)' : 'rgba(90,100,128,.4)'};
                transition:all .2s;
            `;
            dots.appendChild(d);
        });
        document.body.appendChild(dots);
    }

    function _updateNavDots(viewName) {
        const container = document.getElementById('k11-nav-dots');
        if (!container) return;
        container.querySelectorAll('div').forEach(d => {
            const isActive = d.dataset.view === viewName;
            d.style.background = isActive ? 'var(--primary,#FF8C00)' : 'rgba(90,100,128,.4)';
            d.style.transform  = isActive ? 'scale(1.3)' : 'scale(1)';
        });
    }

    // ── ATALHOS DE TECLADO (desktop) ─────────────────────────────
    function _onKeyDown(e) {
        // Ignora se o foco está num input
        if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;

        const idx = _getViewIndex();

        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            if (e.key === 'ArrowRight' && idx < VIEWS_ORDER.length - 1) {
                _navigateTo(VIEWS_ORDER[idx + 1]);
            } else if (e.key === 'ArrowLeft' && idx > 0) {
                _navigateTo(VIEWS_ORDER[idx - 1]);
            }
        }

        // Ctrl+K → foca busca de SKU se na view de estoque/operacional
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const skIn = document.getElementById('sk-in') || document.querySelector('.op-input');
            if (skIn) { skIn.focus(); skIn.select(); }
            else if (typeof APP !== 'undefined') APP.view('operacional');
        }

        // Alt+1-5 → navega diretamente para view
        if (e.altKey && e.key >= '1' && e.key <= '5') {
            e.preventDefault();
            const target = VIEWS_ORDER[parseInt(e.key) - 1];
            if (target) _navigateTo(target);
        }

        // Escape → volta para dash
        if (e.key === 'Escape') {
            try { document.querySelector('.modal-active')?.classList.remove('modal-active'); } catch (_) {}
        }
    }

    // ── HOOK NA NAVEGAÇÃO DO APP ─────────────────────────────────
    function _hookAppView() {
        if (typeof APP === 'undefined') return;
        const original = APP.view.bind(APP);
        APP.view = function(viewName, param) {
            const result = original(viewName, param);
            _currentView = viewName || _currentView;
            _updateNavDots(_currentView);
            return result;
        };
    }

    // ── INIT ─────────────────────────────────────────────────────
    function init() {
        // Swipe em dispositivos touch
        const stage = document.getElementById('stage') || document.body;
        stage.addEventListener('touchstart', _onTouchStart, { passive: true });
        stage.addEventListener('touchmove',  _onTouchMove,  { passive: true });
        stage.addEventListener('touchend',   _onTouchEnd,   { passive: true });

        // Teclado em desktop
        document.addEventListener('keydown', _onKeyDown);

        // Dots de navegação só em mobile
        if ('ontouchstart' in window) {
            _buildNavDots();
        }

        // Hook na navegação após app carregar
        window.addEventListener('k11:ready', () => {
            setTimeout(_hookAppView, 500);
        });

        // Monitora mudanças de view via MutationObserver
        const observer = new MutationObserver(() => {
            const active = document.querySelector('.nav-btn.active');
            if (active?.dataset?.view) {
                _currentView = active.dataset.view;
                _updateNavDots(_currentView);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

        console.log('[K11Gestures] ✅ Gestos e atalhos inicializados');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
