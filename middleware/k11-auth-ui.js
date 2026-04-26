/**
 * K11 OMNI ELITE – AUTH UI v5.1 FIXED
 * ──────────────────────────────────────
 * Corrigido: Loop infinito removido, CSS injetado, HTML completo
 * 3 portais de entrada separados:
 *   1. Colaborador/Gestor  – LDAP + senha
 *   2. Cliente             – Email + senha
 */

'use strict';

const K11AuthUI = (() => {

    let _currentScreen = 'portalSelect';
    let _pendingLdap = '';

    // ────── CSS COMPLETO ──────
    const CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
        width: 100%;
        height: 100%;
    }
    body {
        background: linear-gradient(135deg, #05060c 0%, #0a0b13 100%);
        color: #EDF0F7;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        overflow: hidden;
    }
    
    body::before {
        content: '';
        position: fixed;
        inset: 0;
        background-image:
            radial-gradient(ellipse 110% 50% at 50% -10%, rgba(255,140,0,0.06) 0%, transparent 65%),
            linear-gradient(rgba(255,140,0,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,140,0,0.025) 1px, transparent 1px);
        background-size: auto, 48px 48px, 48px 48px;
        pointer-events: none;
        z-index: 0;
    }

    #k11-auth-root {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 420px;
    }

    /* ────── Logo ────── */
    .auth-logo {
        text-align: center;
        margin-bottom: 32px;
        animation: fadeDown 0.6s ease both;
    }

    .auth-logo-hex {
        width: 68px;
        height: 68px;
        background: linear-gradient(145deg, rgba(255,140,0,0.12), rgba(255,140,0,0.04));
        border: 1.5px solid rgba(255,140,0,0.35);
        border-radius: 20px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 14px;
        box-shadow: 0 0 36px rgba(255,140,0,0.12), inset 0 1px 0 rgba(255,255,255,0.05);
        font-size: 32px;
    }

    .auth-logo-title {
        font-size: 22px;
        font-weight: 900;
        letter-spacing: -0.5px;
        color: #EDF0F7;
    }

    .auth-logo-title span {
        color: #FF8C00;
    }

    .auth-logo-sub {
        font-size: 10px;
        letter-spacing: 3px;
        color: #4B5563;
        text-transform: uppercase;
        margin-top: 3px;
    }

    /* ────── Portal Selector ────── */
    .portal-selector {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 4px;
    }

    .portal-card {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,140,0,0.2);
        border-radius: 16px;
        padding: 20px;
        cursor: pointer;
        transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        display: flex;
        align-items: center;
        gap: 16px;
        position: relative;
        overflow: hidden;
    }

    .portal-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
        pointer-events: none;
    }

    .portal-card:hover {
        transform: translateY(-2px);
        border-color: rgba(255,140,0,0.5);
        background: rgba(255,140,0,0.08);
        box-shadow: 0 8px 28px rgba(255,140,0,0.15);
    }

    .portal-card:active {
        transform: scale(0.98);
    }

    .portal-icon {
        width: 52px;
        height: 52px;
        border-radius: 14px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        background: rgba(255,140,0,0.12);
        border: 1px solid rgba(255,140,0,0.25);
    }

    .portal-text h3 {
        font-size: 14px;
        font-weight: 600;
        color: #EDF0F7;
        margin-bottom: 2px;
    }

    .portal-text p {
        font-size: 12px;
        color: #8B92A3;
    }

    /* ────── Form Container ────── */
    .auth-form-container {
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,140,0,0.15);
        border-radius: 20px;
        padding: 32px 24px;
        backdrop-filter: blur(10px);
        animation: fadeUp 0.6s ease both;
    }

    .form-group {
        margin-bottom: 16px;
    }

    .form-group label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #8B92A3;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .form-group input {
        width: 100%;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,140,0,0.15);
        border-radius: 10px;
        padding: 12px 14px;
        color: #EDF0F7;
        font-size: 14px;
        transition: all 0.2s;
    }

    .form-group input:focus {
        outline: none;
        border-color: rgba(255,140,0,0.4);
        background: rgba(255,140,0,0.05);
        box-shadow: 0 0 0 3px rgba(255,140,0,0.1);
    }

    /* ────── Buttons ────── */
    .btn {
        width: 100%;
        background: linear-gradient(135deg, #FF8C00 0%, #FF6B00 100%);
        color: white;
        border: none;
        border-radius: 10px;
        padding: 12px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(255,140,0,0.3);
    }

    .btn:active {
        transform: translateY(0);
    }

    .btn-secondary {
        background: rgba(255,255,255,0.08);
        color: #EDF0F7;
        margin-top: 8px;
    }

    /* ────── Animations ────── */
    @keyframes fadeDown {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
    }

    @keyframes fadeUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* ────── Loading State ────── */
    .loading {
        opacity: 0.6;
        pointer-events: none;
    }

    .error-message {
        background: rgba(239,68,68,0.15);
        border: 1px solid rgba(239,68,68,0.3);
        color: #FECACA;
        padding: 12px;
        border-radius: 8px;
        font-size: 12px;
        margin-bottom: 16px;
    }

    .success-message {
        background: rgba(34,197,94,0.15);
        border: 1px solid rgba(34,197,94,0.3);
        color: #DCFCE7;
        padding: 12px;
        border-radius: 8px;
        font-size: 12px;
        margin-bottom: 16px;
    }
    `;

    // ────── HTML LAYOUT ──────
    const getPortalSelectHTML = () => `
        <div class="auth-logo">
            <div class="auth-logo-hex">🔐</div>
            <h1 class="auth-logo-title">K11 <span>OMNI</span></h1>
            <p class="auth-logo-sub">Plataforma Elite</p>
        </div>
        <div class="portal-selector">
            <div class="portal-card" data-portal="colaborador">
                <div class="portal-icon">👤</div>
                <div class="portal-text">
                    <h3>Colaborador/Gestor</h3>
                    <p>Acesso ao dashboard operacional</p>
                </div>
            </div>
            <div class="portal-card" data-portal="cliente">
                <div class="portal-icon">🏪</div>
                <div class="portal-text">
                    <h3>Portal Cliente</h3>
                    <p>Acompanhe seus pedidos</p>
                </div>
            </div>
        </div>
    `;

    const getLoginFormHTML = (portal) => {
        const isCliente = portal === 'cliente';
        return `
            <div class="auth-form-container">
                <div style="margin-bottom: 24px;">
                    <button type="button" class="btn btn-secondary" onclick="K11AuthUI.backToPortalSelect()">← Voltar</button>
                </div>
                <h2 style="font-size: 18px; margin-bottom: 20px;">
                    ${isCliente ? 'Login - Cliente' : 'Login - Colaborador'}
                </h2>
                <div id="error-container"></div>
                <form id="login-form" onsubmit="K11AuthUI.handleLogin(event)">
                    <div class="form-group">
                        <label>Usuário${isCliente ? ' (Email)' : ''}</label>
                        <input type="text" id="username" name="username" required placeholder="${isCliente ? 'seu@email.com' : 'usuario'}">
                    </div>
                    <div class="form-group">
                        <label>Senha</label>
                        <input type="password" id="password" name="password" required placeholder="••••••••">
                    </div>
                    <button type="submit" class="btn">Entrar</button>
                </form>
            </div>
        `;
    };

    // ────── EVENT HANDLERS (sem loop infinito) ──────
    const init = () => {
        const root = document.getElementById('k11-auth-root');
        if (!root) return;

        root.addEventListener('click', (e) => {
            if (e.target.classList.contains('portal-card')) {
                const portal = e.target.dataset.portal;
                _currentScreen = `${portal}-login`;
                render();
            }
        });
    };

    const render = () => {
        const root = document.getElementById('k11-auth-root');
        if (!root) return;

        if (_currentScreen === 'portalSelect') {
            root.innerHTML = getPortalSelectHTML();
            init();
        } else if (_currentScreen === 'colaborador-login') {
            root.innerHTML = getLoginFormHTML('colaborador');
        } else if (_currentScreen === 'cliente-login') {
            root.innerHTML = getLoginFormHTML('cliente');
        }
    };

    return {
        renderDashboard: function() {
            return `
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>K11 OMNI ELITE - Login</title>
                    <style>${CSS}</style>
                </head>
                <body>
                    <div id="k11-auth-root"></div>
                    <script>
                        // Sem loop infinito! Apenas renderiza uma vez
                        document.addEventListener('DOMContentLoaded', function() {
                            const root = document.getElementById('k11-auth-root');
                            root.innerHTML = \`${getPortalSelectHTML()}\`;
                            
                            // Apenas aguarda cliques no portal selector
                            root.addEventListener('click', function(e) {
                                if (e.target.closest('.portal-card')) {
                                    const portal = e.target.closest('.portal-card').dataset.portal;
                                    root.innerHTML = \`${getLoginFormHTML('PORTAL')}\`;
                                }
                            });
                        });
                    </script>
                </body>
                </html>
            `;
        },

        backToPortalSelect: function() {
            _currentScreen = 'portalSelect';
            render();
        },

        handleLogin: async function(event) {
            event.preventDefault();
            const form = event.target;
            const username = form.username.value;
            const password = form.password.value;

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                if (!response.ok) throw new Error('Login falhou');
                
                const data = await response.json();
                localStorage.setItem('k11_token', data.token);
                window.location.href = '/dashboard';
            } catch (err) {
                const errorContainer = document.getElementById('error-container');
                if (errorContainer) {
                    errorContainer.innerHTML = `<div class="error-message">${err.message}</div>`;
                }
            }
        }
    };
})();

module.exports = K11AuthUI;
