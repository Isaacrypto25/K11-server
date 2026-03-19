/**
 * K11 OMNI — MENU EXPANSÍVEL COM SVG (Seta Avançada)
 * ═════════════════════════════════════════════════════════════════
 * Menu lateral deslizante com ícone SVG que expande/contrai
 */

'use strict';

const K11ExpandableMenu = (() => {

    const STATE = {
        isOpen: false,
        isAnimating: false
    };

    // ── CRIAR MENU ───────────────────────────────────────────
    const createMenu = () => {
        const container = document.createElement('div');
        container.id = 'k11-expandable-menu-container';
        container.innerHTML = `
            <!-- BOTÃO TOGGLE (Seta SVG) -->
            <button id="k11-menu-toggle" class="k11-menu-toggle" title="Expandir menu">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6" class="k11-arrow-svg"></path>
                </svg>
            </button>

            <!-- MENU LATERAL DESLIZANTE -->
            <div id="k11-menu-sidebar" class="k11-menu-sidebar">
                <div class="k11-menu-header">
                    <h3>Ferramentas</h3>
                    <button class="k11-menu-close" onclick="K11ExpandableMenu.toggle()">✕</button>
                </div>

                <div class="k11-menu-content">
                    <!-- SEÇÃO: OBRAS -->
                    <div class="k11-menu-section">
                        <div class="k11-menu-section-title">OBRAS</div>
                        <div class="k11-menu-items">
                            <a class="k11-menu-item" href="/obras" onclick="K11ExpandableMenu.handleNavigation(event, '/obras')">
                                <span class="k11-icon">🏗️</span>
                                <span>Minhas Obras</span>
                            </a>
                            <a class="k11-menu-item" href="/criar-obra" onclick="K11ExpandableMenu.handleNavigation(event, '/criar-obra')">
                                <span class="k11-icon">➕</span>
                                <span>Nova Obra</span>
                            </a>
                            <a class="k11-menu-item" href="/obras-arquivadas" onclick="K11ExpandableMenu.handleNavigation(event, '/obras-arquivadas')">
                                <span class="k11-icon">📦</span>
                                <span>Arquivadas</span>
                            </a>
                        </div>
                    </div>

                    <!-- SEÇÃO: HABILIDADES (Skill System) -->
                    <div class="k11-menu-section">
                        <div class="k11-menu-section-title">HABILIDADES</div>
                        <div class="k11-menu-items">
                            <a class="k11-menu-item" href="/perfil" onclick="K11ExpandableMenu.handleNavigation(event, '/perfil')">
                                <span class="k11-icon">👤</span>
                                <span>Meu Perfil</span>
                            </a>
                            <a class="k11-menu-item" href="/skills" onclick="K11ExpandableMenu.handleNavigation(event, '/skills')">
                                <span class="k11-icon">⭐</span>
                                <span>Habilidades</span>
                            </a>
                            <a class="k11-menu-item" href="/missoes" onclick="K11ExpandableMenu.handleNavigation(event, '/missoes')">
                                <span class="k11-icon">🎯</span>
                                <span>Missões</span>
                            </a>
                            <a class="k11-menu-item" href="/leaderboard" onclick="K11ExpandableMenu.handleNavigation(event, '/leaderboard')">
                                <span class="k11-icon">🏆</span>
                                <span>Leaderboard</span>
                            </a>
                        </div>
                    </div>

                    <!-- SEÇÃO: INTELIGÊNCIA -->
                    <div class="k11-menu-section">
                        <div class="k11-menu-section-title">INTELIGÊNCIA</div>
                        <div class="k11-menu-items">
                            <a class="k11-menu-item" href="/preco-intel" onclick="K11ExpandableMenu.handleNavigation(event, '/preco-intel')">
                                <span class="k11-icon">💰</span>
                                <span>Preços</span>
                            </a>
                            <a class="k11-menu-item" href="/mercado" onclick="K11ExpandableMenu.handleNavigation(event, '/mercado')">
                                <span class="k11-icon">📊</span>
                                <span>Mercado</span>
                            </a>
                            <a class="k11-menu-item" href="/alertas" onclick="K11ExpandableMenu.handleNavigation(event, '/alertas')">
                                <span class="k11-icon">⚠️</span>
                                <span>Alertas</span>
                            </a>
                        </div>
                    </div>

                    <!-- SEÇÃO: SISTEMA -->
                    <div class="k11-menu-section">
                        <div class="k11-menu-section-title">SISTEMA</div>
                        <div class="k11-menu-items">
                            <a class="k11-menu-item" href="/configuracoes" onclick="K11ExpandableMenu.handleNavigation(event, '/configuracoes')">
                                <span class="k11-icon">⚙️</span>
                                <span>Configurações</span>
                            </a>
                            <a class="k11-menu-item" href="/ajuda" onclick="K11ExpandableMenu.handleNavigation(event, '/ajuda')">
                                <span class="k11-icon">❓</span>
                                <span>Ajuda</span>
                            </a>
                            <a class="k11-menu-item logout" href="#" onclick="K11ExpandableMenu.handleLogout(event)">
                                <span class="k11-icon">🚪</span>
                                <span>Sair</span>
                            </a>
                        </div>
                    </div>
                </div>

                <div class="k11-menu-footer">
                    <p>K11 OMNI ELITE 4.0</p>
                </div>
            </div>

            <!-- OVERLAY (clicável para fechar) -->
            <div id="k11-menu-overlay" class="k11-menu-overlay" onclick="K11ExpandableMenu.toggle()"></div>
        `;

        return container;
    };

    // ── INICIALIZAR ──────────────────────────────────────────
    const init = () => {
        const menu = createMenu();
        document.body.insertBefore(menu, document.body.firstChild);

        // Event listeners
        document.getElementById('k11-menu-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            toggle();
        });

        // Fechar ao clicar fora
        document.addEventListener('click', (e) => {
            if (STATE.isOpen && 
                !e.target.closest('#k11-menu-sidebar') && 
                !e.target.closest('#k11-menu-toggle')) {
                close();
            }
        });

        console.log('[K11ExpandableMenu] Initialized');
    };

    // ── TOGGLE (Abrir/Fechar) ───────────────────────────────
    const toggle = () => {
        if (STATE.isOpen) {
            close();
        } else {
            open();
        }
    };

    // ── ABRIR ────────────────────────────────────────────────
    const open = () => {
        if (STATE.isAnimating) return;

        STATE.isAnimating = true;
        STATE.isOpen = true;

        const sidebar = document.getElementById('k11-menu-sidebar');
        const overlay = document.getElementById('k11-menu-overlay');
        const toggle = document.getElementById('k11-menu-toggle');

        sidebar.classList.add('active');
        overlay.classList.add('active');
        toggle.classList.add('active');

        setTimeout(() => {
            STATE.isAnimating = false;
        }, 300);
    };

    // ── FECHAR ───────────────────────────────────────────────
    const close = () => {
        if (STATE.isAnimating) return;

        STATE.isAnimating = true;
        STATE.isOpen = false;

        const sidebar = document.getElementById('k11-menu-sidebar');
        const overlay = document.getElementById('k11-menu-overlay');
        const toggle = document.getElementById('k11-menu-toggle');

        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        toggle.classList.remove('active');

        setTimeout(() => {
            STATE.isAnimating = false;
        }, 300);
    };

    // ── NAVEGAÇÃO ────────────────────────────────────────────
    const handleNavigation = (event, path) => {
        event.preventDefault();
        close();

        setTimeout(() => {
            window.location.href = path;
        }, 200);
    };

    // ── LOGOUT ───────────────────────────────────────────────
    const handleLogout = (event) => {
        event.preventDefault();
        
        if (confirm('Tem certeza que deseja sair?')) {
            if (typeof K11AuthMiddleware !== 'undefined') {
                K11AuthMiddleware.logout();
            } else {
                sessionStorage.clear();
                window.location.href = '/';
            }
        }
    };

    // API Pública
    return {
        init,
        toggle,
        open,
        close,
        handleNavigation,
        handleLogout,
        isOpen: () => STATE.isOpen
    };
})();

// Auto-inicializar ao carregar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', K11ExpandableMenu.init);
} else {
    K11ExpandableMenu.init();
}
