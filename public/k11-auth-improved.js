/**
 * K11 OMNI — AUTH MELHORADO (Cliente vs Colaborador)
 * ═════════════════════════════════════════════════════════════════
 * Middleware que separa autenticação de cliente vs colaborador
 */

'use strict';

const K11AuthMiddleware = (() => {

    // Tipos de usuário
    const USER_TYPES = {
        COLABORADOR: 'colaborador',
        CLIENTE: 'cliente',
        ADMIN: 'admin'
    };

    // ── VALIDAR LOGIN ───────────────────────────────────────
    const validateLogin = async (ldap, password, userType) => {
        try {
            // Validar contra LDAP ou banco
            const response = await fetch('/api/auth/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ldap,
                    password,
                    userType
                })
            });

            if (!response.ok) {
                return {
                    success: false,
                    error: 'Credenciais inválidas'
                };
            }

            const data = await response.json();
            return {
                success: true,
                user: data.user,
                token: data.token,
                userType: userType
            };
        } catch (error) {
            console.error('[K11Auth] Validation error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    };

    // ── LOGIN COLABORADOR ───────────────────────────────────
    const loginColaborador = async (ldap, password) => {
        const result = await validateLogin(ldap, password, USER_TYPES.COLABORADOR);
        
        if (result.success) {
            // Salvar sessão
            sessionStorage.setItem('K11_USER_TYPE', USER_TYPES.COLABORADOR);
            sessionStorage.setItem('K11_SESSION_TOKEN', result.token);
            sessionStorage.setItem('K11_USER_ID', result.user.id);
            sessionStorage.setItem('K11_USER_LDAP', ldap);

            // Redirecionar para dashboard colaborador
            window.location.href = '/dashboard-colaborador';
        }

        return result;
    };

    // ── LOGIN CLIENTE ────────────────────────────────────────
    const loginCliente = async (ldap, password) => {
        const result = await validateLogin(ldap, password, USER_TYPES.CLIENTE);
        
        if (result.success) {
            // Salvar sessão
            sessionStorage.setItem('K11_USER_TYPE', USER_TYPES.CLIENTE);
            sessionStorage.setItem('K11_SESSION_TOKEN', result.token);
            sessionStorage.setItem('K11_USER_ID', result.user.id);
            sessionStorage.setItem('K11_USER_LDAP', ldap);

            // Redirecionar para dashboard cliente
            window.location.href = '/dashboard-cliente';
        }

        return result;
    };

    // ── VERIFICAR TIPO DE USUÁRIO ───────────────────────────
    const getUserType = () => {
        return sessionStorage.getItem('K11_USER_TYPE') || null;
    };

    // ── VERIFICAR SE ESTÁ AUTENTICADO ───────────────────────
    const isAuthenticated = () => {
        return !!sessionStorage.getItem('K11_SESSION_TOKEN');
    };

    // ── VERIFICAR PERMISSÕES ────────────────────────────────
    const hasPermission = (requiredType) => {
        const userType = getUserType();
        
        if (Array.isArray(requiredType)) {
            return requiredType.includes(userType);
        }
        
        return userType === requiredType;
    };

    // ── LOGOUT ───────────────────────────────────────────────
    const logout = () => {
        sessionStorage.removeItem('K11_SESSION_TOKEN');
        sessionStorage.removeItem('K11_USER_TYPE');
        sessionStorage.removeItem('K11_USER_ID');
        sessionStorage.removeItem('K11_USER_LDAP');
        window.location.href = '/';
    };

    // ── GET TOKEN ────────────────────────────────────────────
    const getToken = () => {
        return sessionStorage.getItem('K11_SESSION_TOKEN');
    };

    // ── GET USER INFO ────────────────────────────────────────
    const getUserInfo = () => {
        return {
            id: sessionStorage.getItem('K11_USER_ID'),
            ldap: sessionStorage.getItem('K11_USER_LDAP'),
            type: getUserType(),
            token: getToken()
        };
    };

    // API Pública
    return {
        USER_TYPES,
        validateLogin,
        loginColaborador,
        loginCliente,
        getUserType,
        isAuthenticated,
        hasPermission,
        logout,
        getToken,
        getUserInfo
    };
})();

// Verificar autenticação ao carregar página
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Proteger rotas
        const currentPath = window.location.pathname;
        
        if (currentPath.includes('dashboard') && !K11AuthMiddleware.isAuthenticated()) {
            window.location.href = '/';
        }
    });
} else {
    const currentPath = window.location.pathname;
    if (currentPath.includes('dashboard') && !K11AuthMiddleware.isAuthenticated()) {
        window.location.href = '/';
    }
}
