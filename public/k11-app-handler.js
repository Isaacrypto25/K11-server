/**
 * K11 OMNI — APP HANDLER (Fluxo principal)
 * ═════════════════════════════════════════════════════════════════
 * Gerencia autenticação, exibição de dashboards e criação de obras
 */

'use strict';

const K11AuthHandler = (() => {

    // ── FAZER LOGIN ──────────────────────────────────────────
    const handleLogin = async (event) => {
        event.preventDefault();

        const form = document.getElementById('k11-login-form');
        const ldap = form.elements.ldap.value;
        const password = form.elements.password.value;

        console.log('[K11AuthHandler] Login attempt:', ldap);

        // Simular validação (em produção, chamar backend)
        const isValid = await validateCredentials(ldap, password);

        if (!isValid) {
            alert('Credenciais inválidas');
            return;
        }

        // Determinar tipo de usuário (cliente ou colaborador)
        // Por padrão, os que começam com 73 são clientes, outros são colaboradores
        const userType = ldap.startsWith('73') ? 'cliente' : 'colaborador';

        // Salvar na sessão
        sessionStorage.setItem('K11_SESSION_TOKEN', 'token_' + ldap);
        sessionStorage.setItem('K11_USER_TYPE', userType);
        sessionStorage.setItem('K11_USER_ID', ldap);
        sessionStorage.setItem('K11_USER_LDAP', ldap);

        console.log('[K11AuthHandler] Login successful:', userType);

        // Limpar formulário
        form.reset();

        // Mostrar dashboard apropriado
        setTimeout(() => {
            showDashboard(userType);
        }, 500);
    };

    // ── VALIDAR CREDENCIAIS ─────────────────────────────────
    const validateCredentials = async (ldap, password) => {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ldap, password })
            });

            return response.ok;
        } catch (error) {
            console.warn('[K11AuthHandler] Backend unavailable, using mock auth');
            // Mock: aceitar qualquer credencial para teste
            return ldap.length > 0 && password.length > 0;
        }
    };

    // ── MOSTRAR DASHBOARD ────────────────────────────────────
    const showDashboard = (userType) => {
        const loginPage = document.getElementById('login-page');
        const dashboardColaborador = document.getElementById('dashboard-colaborador');
        const dashboardCliente = document.getElementById('dashboard-cliente');

        loginPage.style.display = 'none';

        if (userType === 'cliente') {
            dashboardCliente.style.display = 'block';
            K11ClientView.init();
        } else {
            dashboardColaborador.style.display = 'block';
            K11ColaboradorView.init();
        }

        // Inicializar menu expansível
        if (typeof K11ExpandableMenu !== 'undefined') {
            K11ExpandableMenu.init();
        }
    };

    // ── LOGOUT ───────────────────────────────────────────────
    const handleLogout = () => {
        if (confirm('Tem certeza que deseja sair?')) {
            sessionStorage.clear();
            location.reload();
        }
    };

    // ── MOSTRAR "ESQUECI SENHA" ──────────────────────────────
    const showForgotPassword = () => {
        alert('Recuperação de senha - Contacte o administrador');
    };

    // ── MOSTRAR "CRIAR CONTA" ────────────────────────────────
    const showCreateAccount = () => {
        alert('Para criar uma conta, contacte o administrador');
    };

    return {
        handleLogin,
        handleLogout,
        showForgotPassword,
        showCreateAccount,
        showDashboard
    };
})();

// ════════════════════════════════════════════════════════════════

const K11ClientView = (() => {

    // ── INICIALIZAR ──────────────────────────────────────────
    const init = () => {
        console.log('[K11ClientView] Initializing');
        loadObras();
    };

    // ── CARREGAR OBRAS ───────────────────────────────────────
    const loadObras = async () => {
        const container = document.getElementById('k11-client-obras');
        if (!container) return;

        const ldap = sessionStorage.getItem('K11_USER_LDAP');

        try {
            const response = await fetch(`/api/obras/user/${ldap}`, {
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('K11_SESSION_TOKEN')}`
                }
            });

            if (!response.ok) {
                container.innerHTML = '<p class="k11-empty">Nenhuma obra criada ainda</p>';
                return;
            }

            const obras = await response.json();
            renderObras(obras, container);
        } catch (error) {
            console.error('[K11ClientView] Load error:', error);
            container.innerHTML = '<p class="k11-empty">Erro ao carregar obras</p>';
        }
    };

    // ── RENDERIZAR OBRAS ─────────────────────────────────────
    const renderObras = (obras, container) => {
        if (!obras || obras.length === 0) {
            container.innerHTML = '<p class="k11-empty">Nenhuma obra criada ainda</p>';
            return;
        }

        let html = '';
        obras.forEach(obra => {
            const progresso = calcularProgresso(obra);
            
            html += `
                <div class="k11-obra-card">
                    <div class="k11-obra-header">
                        <h3>${obra.nome}</h3>
                        <span class="k11-obra-status">${obra.status || 'Em Progresso'}</span>
                    </div>

                    <div class="k11-obra-info">
                        <div class="k11-info-item">
                            <span class="k11-label">Localização</span>
                            <span class="k11-value">${obra.endereco}</span>
                        </div>
                        <div class="k11-info-item">
                            <span class="k11-label">Área</span>
                            <span class="k11-value">${obra.area || 0} M²</span>
                        </div>
                        <div class="k11-info-item">
                            <span class="k11-label">Orçamento</span>
                            <span class="k11-value">R$ ${(obra.orcamento || 0).toLocaleString('pt-BR')}</span>
                        </div>
                    </div>

                    <div class="k11-obra-progress">
                        <div class="k11-progress-label">Progresso: ${progresso}%</div>
                        <div class="k11-progress-bar">
                            <div class="k11-progress-fill" style="width: ${progresso}%"></div>
                        </div>
                    </div>

                    <div class="k11-obra-actions">
                        <button class="k11-btn-small" onclick="K11ClientView.viewObra('${obra.id}')">
                            👁️ Ver Detalhes
                        </button>
                        <button class="k11-btn-small" onclick="K11ClientView.editObra('${obra.id}')">
                            ✏️ Editar
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    };

    // ── CALCULAR PROGRESSO ───────────────────────────────────
    const calcularProgresso = (obra) => {
        if (!obra.data_inicio || !obra.data_fim) return 0;

        const inicio = new Date(obra.data_inicio).getTime();
        const fim = new Date(obra.data_fim).getTime();
        const agora = new Date().getTime();

        const total = fim - inicio;
        const decorrido = agora - inicio;
        
        return Math.min(100, Math.max(0, Math.round((decorrido / total) * 100)));
    };

    // ── ABRIR MODAL DE CRIAR OBRA ────────────────────────────
    const openCreateObraModal = () => {
        const modal = document.getElementById('k11-create-obra-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    };

    // ── FECHAR MODAL DE CRIAR OBRA ───────────────────────────
    const closeCreateObraModal = () => {
        const modal = document.getElementById('k11-create-obra-modal');
        if (modal) {
            modal.style.display = 'none';
            document.getElementById('k11-create-obra-form').reset();
        }
    };

    // ── SUBMETER CRIAR OBRA ──────────────────────────────────
    const submitCreateObra = async (event) => {
        event.preventDefault();

        const form = document.getElementById('k11-create-obra-form');
        const formData = new FormData(form);

        const obraData = {
            nome: formData.get('nome'),
            endereco: formData.get('endereco'),
            data_inicio: formData.get('data_inicio'),
            data_fim: formData.get('data_fim'),
            area: parseFloat(formData.get('area')),
            orcamento: parseFloat(formData.get('orcamento')),
            descricao: formData.get('descricao'),
            usuario_ldap: sessionStorage.getItem('K11_USER_LDAP')
        };

        try {
            const response = await fetch('/api/obras', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionStorage.getItem('K11_SESSION_TOKEN')}`
                },
                body: JSON.stringify(obraData)
            });

            if (!response.ok) {
                const error = await response.json();
                alert(`Erro: ${error.message || 'Falha ao criar obra'}`);
                return;
            }

            alert('✅ Obra criada com sucesso!');
            closeCreateObraModal();
            loadObras();
        } catch (error) {
            console.error('[K11ClientView] Submit error:', error);
            alert('❌ Erro ao criar obra: ' + error.message);
        }
    };

    // ── VER OBRA ─────────────────────────────────────────────
    const viewObra = (obraId) => {
        console.log('[K11ClientView] Viewing obra:', obraId);
        window.location.href = `/obra/${obraId}`;
    };

    // ── EDITAR OBRA ──────────────────────────────────────────
    const editObra = (obraId) => {
        console.log('[K11ClientView] Editing obra:', obraId);
        window.location.href = `/obra/${obraId}/edit`;
    };

    return {
        init,
        loadObras,
        openCreateObraModal,
        closeCreateObraModal,
        submitCreateObra,
        viewObra,
        editObra
    };
})();

// ════════════════════════════════════════════════════════════════

const K11ColaboradorView = (() => {

    // ── INICIALIZAR ──────────────────────────────────────────
    const init = () => {
        console.log('[K11ColaboradorView] Initializing');

        const ldap = sessionStorage.getItem('K11_USER_LDAP');

        // Carregar perfil do colaborador
        loadUserProfile(ldap);

        // Carregar missões
        loadMissions(ldap);
    };

    // ── CARREGAR PERFIL DO USUÁRIO ───────────────────────────
    const loadUserProfile = async (ldap) => {
        try {
            const response = await fetch(`/api/skills/profile/${ldap}`, {
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('K11_SESSION_TOKEN')}`
                }
            });

            if (!response.ok) {
                // Criar perfil novo se não existir
                createNewProfile(ldap);
                return;
            }

            const profileData = await response.json();
            const profile = K11SkillSystem.createProfile(ldap, profileData.attributes);
            profile.level = profileData.level;
            profile.totalXP = profileData.totalXP;

            window.K11CurrentUserProfile = profile;

            // Renderizar dashboard
            K11SkillDashboard.render(profile);
        } catch (error) {
            console.error('[K11ColaboradorView] Profile load error:', error);
        }
    };

    // ── CRIAR PERFIL NOVO ────────────────────────────────────
    const createNewProfile = async (ldap) => {
        try {
            const profile = K11SkillSystem.createProfile(ldap);

            await fetch(`/api/skills/profile/${ldap}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${sessionStorage.getItem('K11_SESSION_TOKEN')}`
                },
                body: JSON.stringify(profile.toJSON())
            });

            window.K11CurrentUserProfile = profile;
            K11SkillDashboard.render(profile);
        } catch (error) {
            console.error('[K11ColaboradorView] Create profile error:', error);
        }
    };

    // ── CARREGAR MISSÕES ─────────────────────────────────────
    const loadMissions = async (ldap) => {
        try {
            const response = await fetch(`/api/missions/recommendations/${ldap}`, {
                headers: {
                    'Authorization': `Bearer ${sessionStorage.getItem('K11_SESSION_TOKEN')}`
                }
            });

            if (!response.ok) {
                console.warn('No missions available');
                return;
            }

            const missions = await response.json();
            renderMissions(missions);
        } catch (error) {
            console.error('[K11ColaboradorView] Missions load error:', error);
        }
    };

    // ── RENDERIZAR MISSÕES ───────────────────────────────────
    const renderMissions = (missions) => {
        const container = document.getElementById('k11-missions-list');
        if (!container) return;

        if (!missions || missions.length === 0) {
            container.innerHTML = '<p class="k11-empty">Nenhuma missão disponível</p>';
            return;
        }

        // Delegado a K11SkillInit.renderMissions
        if (typeof K11SkillInit !== 'undefined') {
            K11SkillInit.renderMissions(missions);
        }
    };

    return {
        init,
        loadUserProfile,
        loadMissions
    };
})();

// ════════════════════════════════════════════════════════════════

// AUTO-INICIALIZAR AO CARREGAR
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        K11AppInit.checkAuth();
    });
} else {
    K11AppInit.checkAuth();
}

const K11AppInit = {
    checkAuth: () => {
        const isAuthenticated = !!sessionStorage.getItem('K11_SESSION_TOKEN');
        const userType = sessionStorage.getItem('K11_USER_TYPE');

        console.log('[K11AppInit] Auth check:', { isAuthenticated, userType });

        if (isAuthenticated && userType) {
            K11AuthHandler.showDashboard(userType);
        } else {
            // Mostrar página de login
            document.getElementById('login-page').style.display = 'flex';
        }
    }
};
