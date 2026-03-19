/**
 * K11 OMNI — MODAL DE ONBOARDING (Cliente vs Colaborador)
 * ═════════════════════════════════════════════════════════════════
 * Modal que aparece no primeiro acesso para escolher tipo de usuário
 */

'use strict';

const K11OnboardingModal = (() => {

    // ── CRIAR MODAL ──────────────────────────────────────────
    const createModal = () => {
        const modal = document.createElement('div');
        modal.id = 'k11-onboarding-modal';
        modal.className = 'k11-onboarding-overlay';
        modal.innerHTML = `
            <div class="k11-onboarding-container">
                <div class="k11-onboarding-header">
                    <div class="k11-logo">
                        <div class="k11-logo-icon">◊</div>
                        <div class="k11-logo-text">K11 OMNI ELITE</div>
                    </div>
                </div>

                <div class="k11-onboarding-content">
                    <h1>Bem-vindo ao K11 OMNI</h1>
                    <p>Escolha seu tipo de perfil para continuar</p>

                    <div class="k11-onboarding-options">
                        <!-- OPÇÃO 1: CLIENTE -->
                        <div class="k11-onboarding-card cliente" onclick="K11OnboardingModal.selectType('cliente')">
                            <div class="k11-card-icon">👤</div>
                            <div class="k11-card-title">Sou Cliente</div>
                            <div class="k11-card-description">
                                Gerencie suas obras e projetos de forma inteligente
                            </div>
                            <div class="k11-card-features">
                                <div class="k11-feature">✓ Dashboard de obras</div>
                                <div class="k11-feature">✓ Acompanhar progresso</div>
                                <div class="k11-feature">✓ Gestão de recursos</div>
                                <div class="k11-feature">✓ Relatórios em tempo real</div>
                            </div>
                        </div>

                        <!-- OPÇÃO 2: COLABORADOR -->
                        <div class="k11-onboarding-card colaborador" onclick="K11OnboardingModal.selectType('colaborador')">
                            <div class="k11-card-icon">👷</div>
                            <div class="k11-card-title">Sou Colaborador</div>
                            <div class="k11-card-description">
                                Desenvolva suas habilidades e gerencie tarefas
                            </div>
                            <div class="k11-card-features">
                                <div class="k11-feature">✓ Missões inteligentes</div>
                                <div class="k11-feature">✓ Skill System avançado</div>
                                <div class="k11-feature">✓ Perfil com eneagrama</div>
                                <div class="k11-feature">✓ Ganho de XP e níveis</div>
                            </div>
                        </div>
                    </div>

                    <div class="k11-onboarding-footer">
                        <p class="k11-footer-text">Pode mudar isso depois na configuração de perfil</p>
                    </div>
                </div>
            </div>
        `;

        return modal;
    };

    // ── SELECIONAR TIPO ──────────────────────────────────────
    const selectType = (userType) => {
        console.log('[K11Onboarding] Selected type:', userType);

        // Armazenar escolha temporária
        sessionStorage.setItem('K11_ONBOARDING_TYPE', userType);

        // Mostrar loading
        const modal = document.getElementById('k11-onboarding-modal');
        const content = modal.querySelector('.k11-onboarding-content');
        
        content.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div class="k11-loading-spinner"></div>
                <p>Preparando seu acesso...</p>
            </div>
        `;

        // Redirecionar para login após 1 segundo
        setTimeout(() => {
            window.location.href = '/login?type=' + userType;
        }, 1000);
    };

    // ── MOSTRAR MODAL ────────────────────────────────────────
    const show = () => {
        // Verificar se já completou onboarding
        if (sessionStorage.getItem('K11_ONBOARDING_COMPLETE')) {
            return;
        }

        const modal = createModal();
        document.body.appendChild(modal);

        // Animação de entrada
        setTimeout(() => {
            modal.classList.add('active');
        }, 100);
    };

    // ── FECHAR MODAL ─────────────────────────────────────────
    const close = () => {
        const modal = document.getElementById('k11-onboarding-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    };

    // ── MARCAR COMO COMPLETO ────────────────────────────────
    const markAsComplete = () => {
        sessionStorage.setItem('K11_ONBOARDING_COMPLETE', 'true');
    };

    // API Pública
    return {
        show,
        close,
        selectType,
        markAsComplete
    };
})();

// Auto-inicializar se necessário
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Mostrar se for página de boas-vindas
        if (window.location.pathname === '/' || window.location.pathname === '/welcome') {
            K11OnboardingModal.show();
        }
    });
} else {
    if (window.location.pathname === '/' || window.location.pathname === '/welcome') {
        K11OnboardingModal.show();
    }
}
