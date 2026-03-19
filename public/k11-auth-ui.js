/**
 * K11 OMNI ELITE — AUTH UI v5.0
 * ══════════════════════════════════════════════════════════════
 * 3 portais de entrada separados:
 *   1. Colaborador/Gestor  — LDAP + senha
 *   2. Cliente             — Email + senha
 * Telas: login | register | confirm | forgot | resetpin | clienteLogin | clienteRegister
 * Depende de: k11-config.js (K11_SERVER_URL, K11Auth)
 */

'use strict';

const K11AuthUI = (() => {

    let _currentScreen = 'portalSelect';
    let _pendingLdap = '';

    // ── CSS ─────────────────────────────────────────────────────
    const CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        background: #05060c;
        color: #EDF0F7;
        font-family: 'Inter', sans-serif;
        min-height: 100vh;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 32px 20px 60px;
        overflow-x: hidden;
        overflow-y: auto;
    }
    body::before {
        content: '';
        position: fixed; inset: 0;
        background-image:
            radial-gradient(ellipse 110% 50% at 50% -10%, rgba(255,140,0,0.06) 0%, transparent 65%),
            linear-gradient(rgba(255,140,0,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,140,0,0.025) 1px, transparent 1px);
        background-size: auto, 48px 48px, 48px 48px;
        pointer-events: none;
        z-index: 0;
    }
    #k11-auth-root {
        position: relative; z-index: 1;
        width: 100%; max-width: 420px;
    }

    /* ── Logo ── */
    .auth-logo { text-align: center; margin-bottom: 28px; animation: fadeDown .6s ease both; }
    .auth-logo-hex {
        width: 68px; height: 68px;
        background: linear-gradient(145deg, rgba(255,140,0,0.12), rgba(255,140,0,0.04));
        border: 1.5px solid rgba(255,140,0,0.35);
        border-radius: 20px;
        display: inline-flex; align-items: center; justify-content: center;
        margin-bottom: 14px;
        box-shadow: 0 0 36px rgba(255,140,0,0.12), inset 0 1px 0 rgba(255,255,255,0.05);
    }
    .auth-logo-title { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; color: #EDF0F7; }
    .auth-logo-title span { color: #FF8C00; }
    .auth-logo-sub { font-size: 10px; letter-spacing: 3px; color: #4B5563; text-transform: uppercase; margin-top: 3px; }

    /* ── Portal Selector ── */
    .portal-selector { display: flex; flex-direction: column; gap: 12px; margin-bottom: 4px; }
    .portal-card {
        background: rgba(255,255,255,0.03);
        border: 1px solid #1A1D2E;
        border-radius: 16px;
        padding: 20px;
        cursor: pointer;
        transition: all .22s cubic-bezier(.16,1,.3,1);
        display: flex; align-items: center; gap: 16px;
        position: relative; overflow: hidden;
    }
    .portal-card::before {
        content: '';
        position: absolute; top: 0; left: 0; right: 0; height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
        pointer-events: none;
    }
    .portal-card:hover { transform: translateY(-2px); border-color: rgba(255,140,0,0.3); box-shadow: 0 8px 28px rgba(0,0,0,0.4); }
    .portal-card:active { transform: scale(0.985); }
    .portal-card.portal-colaborador:hover { background: rgba(255,140,0,0.05); }
    .portal-card.portal-cliente:hover { background: rgba(16,185,129,0.05); border-color: rgba(16,185,129,0.3); }
    .portal-icon {
        width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center; font-size: 22px;
    }
    .portal-icon.orange { background: rgba(255,140,0,0.12); border: 1px solid rgba(255,140,0,0.25); }
    .portal-icon.green  { background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25); }
    .portal-info { flex: 1; }
    .portal-title { font-size: 16px; font-weight: 800; color: #EDF0F7; letter-spacing: -0.3px; }
    .portal-desc  { font-size: 11px; color: #6B7280; margin-top: 4px; line-height: 1.4; }
    .portal-pill {
        font-size: 9px; font-weight: 800; letter-spacing: 1.5px;
        padding: 3px 8px; border-radius: 20px; margin-top: 6px;
        display: inline-block;
    }
    .portal-pill.orange { background: rgba(255,140,0,0.12); color: #FF8C00; border: 1px solid rgba(255,140,0,0.3); }
    .portal-pill.green  { background: rgba(16,185,129,0.12); color: #10B981; border: 1px solid rgba(16,185,129,0.3); }
    .portal-arrow { color: #3A4060; transition: transform .2s, color .2s; flex-shrink: 0; }
    .portal-card:hover .portal-arrow { transform: translateX(3px); color: #FF8C00; }
    .portal-card.portal-cliente:hover .portal-arrow { color: #10B981; }

    /* ── Card ── */
    .auth-card {
        background: #0c0e18;
        border: 1px solid #191c2e;
        border-radius: 20px;
        padding: 28px 24px 32px;
        box-shadow: 0 28px 72px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.025);
        animation: fadeUp .5s ease both;
        position: relative; overflow: visible;
    }
    .auth-card::before {
        content: '';
        position: absolute; top: 0; left: 0; right: 0; height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,140,0,0.35), transparent);
    }
    .auth-card.green-card::before { background: linear-gradient(90deg, transparent, rgba(16,185,129,0.35), transparent); }

    /* ── Back button ── */
    .auth-back-btn {
        display: flex; align-items: center; gap: 6px;
        color: #6B7280; font-size: 12px; font-weight: 700;
        background: none; border: none; cursor: pointer;
        padding: 0; margin-bottom: 20px;
        font-family: 'Inter', sans-serif;
        transition: color .2s;
    }
    .auth-back-btn:hover { color: #FF8C00; }
    .auth-back-btn svg { transition: transform .2s; }
    .auth-back-btn:hover svg { transform: translateX(-3px); }

    /* ── Portal badge in card ── */
    .auth-portal-badge {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 9px; font-weight: 900; letter-spacing: 1.5px;
        text-transform: uppercase; padding: 3px 10px;
        border-radius: 20px; margin-bottom: 16px; border: 1px solid;
    }
    .auth-portal-badge.orange { background: rgba(255,140,0,0.1); color: #FF8C00; border-color: rgba(255,140,0,0.3); }
    .auth-portal-badge.green  { background: rgba(16,185,129,0.1); color: #10B981; border-color: rgba(16,185,129,0.3); }

    /* ── Headers ── */
    .auth-card-title { font-size: 18px; font-weight: 800; color: #EDF0F7; margin-bottom: 4px; }
    .auth-card-sub   { font-size: 12px; color: #6B7280; margin-bottom: 24px; line-height: 1.5; }

    /* ── Inputs ── */
    .auth-field { margin-bottom: 16px; }
    .auth-label { display: block; font-size: 10px; font-weight: 700; letter-spacing: 1.5px; color: #6B7280; text-transform: uppercase; margin-bottom: 6px; }
    .auth-input-wrap { position: relative; }
    .auth-input {
        width: 100%; background: rgba(255,255,255,0.04); border: 1px solid #222540;
        border-radius: 10px; padding: 12px 14px; font-size: 14px;
        color: #EDF0F7; outline: none;
        transition: border-color .2s, box-shadow .2s;
        font-family: 'Inter', sans-serif;
    }
    .auth-input:focus { border-color: rgba(255,140,0,0.5); box-shadow: 0 0 0 3px rgba(255,140,0,0.08); }
    .auth-input.error { border-color: rgba(239,68,68,0.6); box-shadow: 0 0 0 3px rgba(239,68,68,0.08); }
    .auth-input.success { border-color: rgba(16,185,129,0.5); }
    .auth-input.green-focus:focus { border-color: rgba(16,185,129,0.5); box-shadow: 0 0 0 3px rgba(16,185,129,0.08); }
    .auth-input::placeholder { color: rgba(255,255,255,0.18); }
    .auth-input-icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 14px; pointer-events: none; opacity: 0; transition: opacity .2s; }
    .auth-input-icon.show { opacity: 1; }
    .auth-field-error { font-size: 11px; color: #EF4444; margin-top: 5px; display: none; animation: shake .3s ease; }
    .auth-field-error.show { display: block; }
    .auth-field-hint  { font-size: 10px; color: #4B5563; margin-top: 4px; }

    /* ── Password toggle ── */
    .auth-pass-toggle {
        position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
        background: none; border: none; cursor: pointer; color: #6B7280;
        padding: 4px; transition: color .2s;
    }
    .auth-pass-toggle:hover { color: #FF8C00; }

    /* ── PIN ── */
    .pin-input-wrap { display: flex; gap: 8px; justify-content: center; margin: 8px 0; }
    .pin-digit {
        width: 46px; height: 56px; background: rgba(255,255,255,0.04);
        border: 1px solid #222540; border-radius: 10px;
        font-size: 24px; font-weight: 800; color: #FF8C00;
        text-align: center; outline: none; caret-color: #FF8C00;
        font-family: 'JetBrains Mono', monospace;
        transition: border-color .2s, box-shadow .2s; -webkit-appearance: none;
    }
    .pin-digit:focus { border-color: rgba(255,140,0,0.6); box-shadow: 0 0 0 3px rgba(255,140,0,0.1); }
    .pin-digit.filled { border-color: rgba(255,140,0,0.4); }
    .auth-pin-row { display: flex; gap: 8px; justify-content: center; margin: 8px 0; }
    .auth-pin-digit {
        width: 46px; height: 56px; background: rgba(255,255,255,0.04);
        border: 1px solid #222540; border-radius: 10px;
        font-size: 24px; font-weight: 800; color: #FF8C00;
        text-align: center; outline: none; caret-color: #FF8C00;
        font-family: 'JetBrains Mono', monospace;
        transition: border-color .2s, box-shadow .2s; -webkit-appearance: none; flex-shrink: 0;
    }
    .auth-pin-digit:focus { border-color: rgba(255,140,0,0.6); box-shadow: 0 0 0 3px rgba(255,140,0,0.1); }

    /* ── Botão principal ── */
    .auth-btn {
        width: 100%; padding: 13px;
        background: linear-gradient(135deg, #FF8C00, #E06000);
        border: none; border-radius: 10px; color: #000;
        font-size: 12px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase;
        cursor: pointer;
        box-shadow: 0 4px 22px rgba(255,140,0,0.32);
        transition: all .2s; margin-top: 8px;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        font-family: 'Inter', sans-serif;
    }
    .auth-btn:hover:not(:disabled) { box-shadow: 0 6px 30px rgba(255,140,0,0.48); transform: translateY(-1px); }
    .auth-btn:disabled { opacity: .6; cursor: not-allowed; transform: none; }
    .auth-btn.green-btn { background: linear-gradient(135deg, #10B981, #059669); box-shadow: 0 4px 22px rgba(16,185,129,0.32); }
    .auth-btn.green-btn:hover:not(:disabled) { box-shadow: 0 6px 30px rgba(16,185,129,0.48); }
    .auth-btn-secondary {
        background: transparent; border: 1px solid #222540; color: #9CA3AF;
        box-shadow: none; margin-top: 8px;
    }
    .auth-btn-secondary:hover:not(:disabled) { border-color: #4B5563; color: #EDF0F7; box-shadow: none; transform: none; }

    /* ── Divider ── */
    .auth-divider { display: flex; align-items: center; gap: 12px; margin: 16px 0 12px; }
    .auth-divider-line { flex: 1; height: 1px; background: #191c2e; }
    .auth-divider-txt { font-size: 10px; color: #4B5563; font-weight: 700; letter-spacing: 1px; white-space: nowrap; }

    /* ── Links ── */
    .auth-links { display: flex; justify-content: center; gap: 16px; margin-top: 20px; }
    .auth-link { font-size: 12px; color: #6B7280; cursor: pointer; transition: color .2s; background: none; border: none; font-family: 'Inter', sans-serif; padding: 0; }
    .auth-link:hover { color: #FF8C00; }
    .auth-link.primary { color: #FF8C00; font-weight: 700; }
    .auth-link.green-link { color: #6B7280; }
    .auth-link.green-link:hover { color: #10B981; }

    /* ── Toast ── */
    #auth-toast {
        position: fixed; bottom: 24px; left: 50%;
        transform: translateX(-50%) translateY(80px);
        background: #131526; border: 1px solid #222540;
        border-radius: 12px; padding: 12px 20px;
        font-size: 13px; color: #EDF0F7; z-index: 9999;
        transition: transform .3s cubic-bezier(.16,1,.3,1), opacity .3s;
        opacity: 0; white-space: nowrap; max-width: calc(100vw - 32px);
        white-space: normal; text-align: center;
        box-shadow: 0 8px 28px rgba(0,0,0,.5);
    }
    #auth-toast.show { transform: translateX(-50%) translateY(0); opacity: 1; }
    #auth-toast.danger  { border-color: rgba(239,68,68,.4); color: #FCA5A5; }
    #auth-toast.success { border-color: rgba(16,185,129,.4); color: #6EE7B7; }

    /* ── Spinner ── */
    .auth-spinner { width: 16px; height: 16px; border: 2px solid rgba(0,0,0,.3); border-top-color: #000; border-radius: 50%; animation: spin .7s linear infinite; flex-shrink: 0; }

    /* ── Email preview ── */
    .auth-email-preview { background: rgba(255,140,0,.06); border: 1px solid rgba(255,140,0,.2); border-radius: 10px; padding: 12px 16px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; }
    .auth-email-preview-icon { font-size: 20px; }
    .auth-email-preview-text { font-size: 12px; color: #9CA3AF; line-height: 1.5; }
    .auth-email-preview-addr { color: #FF8C00; font-weight: 700; font-size: 13px; }

    /* ── Timer ── */
    .auth-timer { text-align: center; font-size: 11px; color: #4B5563; margin-top: 12px; }
    .auth-timer span { color: #9CA3AF; font-weight: 700; }

    /* ── Steps ── */
    .auth-steps { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 24px; }
    .auth-step { width: 24px; height: 4px; border-radius: 2px; background: #1A1D2E; transition: background .3s; }
    .auth-step.active { background: #FF8C00; }
    .auth-step.done   { background: rgba(16,185,129,.6); }

    /* ── Strength meter ── */
    .password-strength { margin-top: 6px; }
    .strength-bar { display: flex; gap: 3px; }
    .strength-seg { flex: 1; height: 3px; border-radius: 2px; background: #1A1D2E; transition: background .3s; }
    .strength-txt { font-size: 10px; color: #6B7280; margin-top: 4px; }

    /* ── Animations ── */
    @keyframes fadeDown { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fadeUp   { from { opacity: 0; transform: translateY(16px);  } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin     { to { transform: rotate(360deg); } }
    @keyframes shake    { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
    `;

    // ── SVG LOGO ──────────────────────────────────────────────
    const _logo = (sub = 'Elite Operational OS') => `
    <div class="auth-logo">
        <div class="auth-logo-hex">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#FF8C00" stroke-width="1.8" stroke-linejoin="round"/>
                <path d="M12 8v4l3 2" stroke="#FF8C00" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
        </div>
        <div class="auth-logo-title">OMNI <span>K11</span></div>
        <div class="auth-logo-sub">${sub}</div>
    </div>`;

    // ── PORTAL SELECT ─────────────────────────────────────────
    function _renderPortalSelect() {
        return `
        ${_logo()}
        <div class="portal-selector">
            <div class="portal-card portal-colaborador" id="portal-op" onclick="K11AuthUI._selectPortal('op')">
                <div class="portal-icon orange">🛡️</div>
                <div class="portal-info">
                    <div class="portal-title">Gestor / Colaborador</div>
                    <div class="portal-desc">Acesso ao sistema operacional K11 com LDAP corporativo</div>
                    <div class="portal-pill orange">OBRAMAX TEAM</div>
                </div>
                <svg class="portal-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </div>
            <div class="portal-card portal-cliente" id="portal-cliente" onclick="K11AuthUI._selectPortal('cliente')">
                <div class="portal-icon green">🏠</div>
                <div class="portal-info">
                    <div class="portal-title">Área do Cliente</div>
                    <div class="portal-desc">Acompanhe suas obras, orçamentos e documentos</div>
                    <div class="portal-pill green">PORTAL DO CLIENTE</div>
                </div>
                <svg class="portal-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </div>
        </div>
        <div id="auth-toast"></div>`;
    }

    // ── LOGIN OP ──────────────────────────────────────────────
    function _renderLogin() {
        return `
        ${_logo()}
        <div class="auth-card">
            <button class="auth-back-btn" id="btn-back-portal">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Selecionar portal
            </button>
            <div class="auth-portal-badge orange">🛡️ Gestor / Colaborador</div>
            <div class="auth-card-title">Entrar</div>
            <div class="auth-card-sub">Use seu LDAP e senha cadastrados.</div>

            <div class="auth-field">
                <label class="auth-label">LDAP</label>
                <div class="auth-input-wrap">
                    <input id="f-ldap" class="auth-input" type="text" inputmode="numeric" maxlength="8"
                           placeholder="73xxxxxx" autocomplete="new-password-x" readonly onfocus="this.removeAttribute('readonly')">
                    <span class="auth-input-icon" id="icon-ldap"></span>
                </div>
                <div class="auth-field-error" id="err-ldap"></div>
            </div>

            <div class="auth-field">
                <label class="auth-label">Senha</label>
                <div class="auth-input-wrap">
                    <input id="f-senha" class="auth-input" type="password" placeholder="••••••••" autocomplete="new-password" style="padding-right:44px">
                    <button class="auth-pass-toggle" type="button" id="toggle-pass" tabindex="-1" onclick="K11AuthUI._togglePass('f-senha','toggle-pass')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" id="eye-icon">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                </div>
                <div class="auth-field-error" id="err-senha"></div>
            </div>

            <button class="auth-btn" id="btn-login">ENTRAR NO SISTEMA</button>
        </div>

        <div class="auth-links">
            <button class="auth-link primary" id="link-register">Criar conta</button>
            <button class="auth-link" id="link-forgot">Esqueci minha senha</button>
        </div>
        <div id="auth-toast"></div>`;
    }

    // ── CLIENTE LOGIN ─────────────────────────────────────────
    function _renderClienteLogin() {
        return `
        ${_logo('Portal do Cliente')}
        <div class="auth-card green-card">
            <button class="auth-back-btn" id="btn-back-portal2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Selecionar portal
            </button>
            <div class="auth-portal-badge green">🏠 Portal do Cliente</div>
            <div class="auth-card-title">Bem-vindo</div>
            <div class="auth-card-sub">Acesse suas obras e orçamentos com seu email.</div>

            <div class="auth-field">
                <label class="auth-label">Email</label>
                <div class="auth-input-wrap">
                    <input id="f-email-cliente" class="auth-input green-focus" type="email"
                           placeholder="seu@email.com" autocomplete="email">
                    <span class="auth-input-icon" id="icon-email-cli"></span>
                </div>
                <div class="auth-field-error" id="err-email-cli"></div>
            </div>

            <div class="auth-field">
                <label class="auth-label">Senha</label>
                <div class="auth-input-wrap">
                    <input id="f-senha-cliente" class="auth-input green-focus" type="password"
                           placeholder="••••••••" autocomplete="current-password" style="padding-right:44px">
                    <button class="auth-pass-toggle" type="button" tabindex="-1" onclick="K11AuthUI._togglePass('f-senha-cliente','toggle-pass-cli')" id="toggle-pass-cli">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" id="eye-icon-cli">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                </div>
                <div class="auth-field-error" id="err-senha-cli"></div>
            </div>

            <button class="auth-btn green-btn" id="btn-login-cliente">ACESSAR MINHA ÁREA</button>
        </div>

        <div class="auth-links">
            <button class="auth-link green-link" id="link-register-cliente">Criar conta de cliente</button>
            <button class="auth-link green-link" id="link-forgot-cliente">Esqueci minha senha</button>
        </div>
        <div id="auth-toast"></div>`;
    }

    // ── CLIENTE REGISTER ────────────────────────────────────────
    function _renderClienteRegister() {
        return `
        ${_logo('Portal do Cliente')}
        <div class="auth-card green-card">
            <button class="auth-back-btn" id="btn-back-cliente-login">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Voltar para o login
            </button>
            <div class="auth-portal-badge green">🏠 Portal do Cliente</div>
            <div class="auth-card-title">Criar conta</div>
            <div class="auth-card-sub">Acompanhe suas obras em tempo real.</div>

            <div class="auth-field">
                <label class="auth-label">Nome completo</label>
                <div class="auth-input-wrap">
                    <input id="f-nome-cli" class="auth-input green-focus" type="text" placeholder="Seu nome" autocomplete="name">
                </div>
                <div class="auth-field-error" id="err-nome-cli"></div>
            </div>

            <div class="auth-field">
                <label class="auth-label">Email</label>
                <div class="auth-input-wrap">
                    <input id="f-email-cli-reg" class="auth-input green-focus" type="email" placeholder="seu@email.com" autocomplete="email">
                </div>
                <div class="auth-field-error" id="err-email-cli-reg"></div>
            </div>

            <div class="auth-field">
                <label class="auth-label">Senha</label>
                <div class="auth-input-wrap">
                    <input id="f-senha-cli-reg" class="auth-input green-focus" type="password" placeholder="Mínimo 6 caracteres" style="padding-right:44px">
                    <button class="auth-pass-toggle" type="button" tabindex="-1" onclick="K11AuthUI._togglePass('f-senha-cli-reg','toggle-pass-cli-reg')" id="toggle-pass-cli-reg">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                </div>
                <div class="auth-field-error" id="err-senha-cli-reg"></div>
            </div>

            <button class="auth-btn green-btn" id="btn-register-cliente">CRIAR MINHA CONTA</button>
        </div>
        <div id="auth-toast"></div>`;
    }

    // ── CLIENTE FORGOT ───────────────────────────────────────────
    function _renderClienteForgot() {
        return `
        ${_logo('Portal do Cliente')}
        <div class="auth-card green-card">
            <button class="auth-back-btn" id="btn-back-cliente-login2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Voltar para o login
            </button>
            <div class="auth-portal-badge green">🏠 Portal do Cliente</div>
            <div class="auth-card-title">Recuperar senha</div>
            <div class="auth-card-sub">Enviaremos instruções para o seu email cadastrado.</div>

            <div class="auth-field">
                <label class="auth-label">Email</label>
                <div class="auth-input-wrap">
                    <input id="f-email-cli-forgot" class="auth-input green-focus" type="email" placeholder="seu@email.com" autocomplete="email">
                </div>
                <div class="auth-field-error" id="err-email-cli-forgot"></div>
            </div>

            <button class="auth-btn green-btn" id="btn-forgot-cliente">ENVIAR INSTRUÇÕES</button>
        </div>
        <div id="auth-toast"></div>`;
    }

    // ── REGISTER ─────────────────────────────────────────────
    function _renderRegister() {
        return `
        ${_logo()}
        <div class="auth-card">
            <button class="auth-back-btn" id="btn-back-login-reg">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Voltar para o login
            </button>
            <div class="auth-steps"><div class="auth-step active"></div><div class="auth-step"></div></div>
            <div class="auth-portal-badge orange">🛡️ Colaborador</div>
            <div class="auth-card-title">Criar conta</div>
            <div class="auth-card-sub">Apenas colaboradores Obramax podem se cadastrar.</div>

            <div class="auth-field">
                <label class="auth-label">LDAP</label>
                <div class="auth-input-wrap">
                    <input id="f-ldap" class="auth-input" type="text" inputmode="numeric" maxlength="8"
                           placeholder="73xxxxxx" autocomplete="new-password-x" readonly onfocus="this.removeAttribute('readonly')">
                    <span class="auth-input-icon" id="icon-ldap"></span>
                </div>
                <div class="auth-field-error" id="err-ldap"></div>
                <div class="auth-field-hint">8 dígitos começando com 7300</div>
            </div>
            <div class="auth-field">
                <label class="auth-label">Nome completo</label>
                <div class="auth-input-wrap">
                    <input id="f-nome" class="auth-input" type="text" placeholder="Nome completo"
                           autocomplete="new-password-x" readonly onfocus="this.removeAttribute('readonly')">
                    <span class="auth-input-icon" id="icon-nome"></span>
                </div>
                <div class="auth-field-error" id="err-nome"></div>
            </div>
            <div class="auth-field">
                <label class="auth-label">Email corporativo</label>
                <div class="auth-input-wrap">
                    <input id="f-email" class="auth-input" type="email" placeholder="seu@obramax.com.br"
                           autocomplete="new-password-x" readonly onfocus="this.removeAttribute('readonly')">
                    <span class="auth-input-icon" id="icon-email"></span>
                </div>
                <div class="auth-field-error" id="err-email"></div>
                <div class="auth-field-hint">Deve ser @obramax.com.br</div>
            </div>
            <div class="auth-field">
                <label class="auth-label">Senha</label>
                <div class="auth-input-wrap">
                    <input id="f-senha" class="auth-input" type="password" placeholder="Mínimo 6 caracteres"
                           autocomplete="new-password" style="padding-right:44px">
                    <button class="auth-pass-toggle" type="button" tabindex="-1" onclick="K11AuthUI._togglePass('f-senha','toggle-pass-reg')" id="toggle-pass-reg">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" id="eye-icon-reg">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                </div>
                <div class="auth-field-error" id="err-senha"></div>
                <div class="password-strength" id="strength-wrap" style="display:none">
                    <div class="strength-bar">
                        <div class="strength-seg" id="s1"></div>
                        <div class="strength-seg" id="s2"></div>
                        <div class="strength-seg" id="s3"></div>
                        <div class="strength-seg" id="s4"></div>
                    </div>
                    <div class="strength-txt" id="strength-txt">Senha fraca</div>
                </div>
            </div>
            <button class="auth-btn" id="btn-register">ENVIAR CÓDIGO DE CONFIRMAÇÃO</button>
            <button class="auth-btn auth-btn-secondary" id="btn-back-login">← Voltar para login</button>
        </div>
        <div id="auth-toast"></div>`;
    }

    // ── CONFIRM ───────────────────────────────────────────────
    function _renderConfirm(email) {
        const maskedEmail = (email || '').replace(/(.{2})(.*)(@)/, (_, a, b, c) =>
            a + '*'.repeat(Math.max(2, b.length - 2)) + b.slice(-2) + c);
        return `
        ${_logo()}
        <div class="auth-card">
            <div class="auth-steps"><div class="auth-step done"></div><div class="auth-step active"></div></div>
            <div class="auth-card-title">Verifique seu email</div>
            <div class="auth-email-preview">
                <div class="auth-email-preview-icon">📧</div>
                <div>
                    <div class="auth-email-preview-text">Código enviado para</div>
                    <div class="auth-email-preview-addr">${maskedEmail}</div>
                </div>
            </div>
            <div class="auth-field">
                <label class="auth-label" style="text-align:center;display:block;margin-bottom:12px">Código de 6 dígitos</label>
                <div class="pin-input-wrap">
                    ${[0,1,2,3,4,5].map(i => `<input class="pin-digit" id="pin-${i}" type="text" inputmode="numeric" maxlength="1" pattern="[0-9]">`).join('')}
                </div>
                <div class="auth-field-error" id="err-pin" style="text-align:center"></div>
            </div>
            <button class="auth-btn" id="btn-confirm">CONFIRMAR CADASTRO</button>
            <div class="auth-timer" id="auth-timer">Código expira em <span id="timer-count">15:00</span></div>
            <div class="auth-links">
                <button class="auth-link" id="btn-resend">Reenviar código</button>
                <button class="auth-link" id="btn-back-register">Voltar</button>
            </div>
        </div>
        <div id="auth-toast"></div>`;
    }

    // ── FORGOT ────────────────────────────────────────────────
    function _renderForgot() {
        return `
        ${_logo()}
        <div class="auth-card">
            <button class="auth-back-btn" id="btn-back-login-forgot">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Voltar para login
            </button>
            <div class="auth-card-title">Recuperar senha</div>
            <div class="auth-card-sub">Informe seu LDAP e email cadastrado.</div>
            <div class="auth-field">
                <label class="auth-label">LDAP</label>
                <div class="auth-input-wrap">
                    <input id="f-ldap" class="auth-input" type="text" inputmode="numeric" maxlength="8"
                           placeholder="73xxxxxx" autocomplete="new-password-x" readonly onfocus="this.removeAttribute('readonly')">
                    <span class="auth-input-icon" id="icon-ldap"></span>
                </div>
                <div class="auth-field-error" id="err-ldap"></div>
            </div>
            <div class="auth-field">
                <label class="auth-label">Email corporativo</label>
                <div class="auth-input-wrap">
                    <input id="f-email" class="auth-input" type="email" placeholder="nome@obramax.com.br"
                           autocomplete="new-password-x" readonly onfocus="this.removeAttribute('readonly')">
                    <span class="auth-input-icon" id="icon-email"></span>
                </div>
                <div class="auth-field-error" id="err-email"></div>
            </div>
            <button class="auth-btn" id="btn-forgot">ENVIAR CÓDIGO</button>
        </div>
        <div id="auth-toast"></div>`;
    }

    // ── RESET PIN ─────────────────────────────────────────────
    function _renderResetPin() {
        return `
        ${_logo()}
        <div class="auth-card">
            <button class="auth-back-btn" id="link-back-login2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Voltar para login
            </button>
            <div class="auth-card-title">Digite o código</div>
            <div class="auth-card-sub">Código enviado para seu email.</div>
            <div class="auth-field">
                <label class="auth-label" style="text-align:center;display:block;margin-bottom:12px">Código de 6 dígitos</label>
                <div class="auth-pin-row" id="reset-pin-inputs"></div>
                <div class="auth-field-error" id="err-pin" style="text-align:center"></div>
            </div>
            <div class="auth-field">
                <label class="auth-label">Nova senha</label>
                <div class="auth-input-wrap">
                    <input id="f-nova-senha" class="auth-input" type="password"
                           placeholder="Mínimo 6 caracteres" autocomplete="new-password">
                </div>
                <div class="auth-field-error" id="err-nova-senha"></div>
            </div>
            <button class="auth-btn" id="btn-reset">REDEFINIR SENHA</button>
        </div>
        <div id="auth-toast"></div>`;
    }

    // ── HELPERS ───────────────────────────────────────────────
    function _toast(msg, type = 'info', dur = 3500) {
        const t = document.getElementById('auth-toast');
        if (!t) return;
        t.textContent = msg;
        t.className = `show ${type}`;
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove('show'), dur);
    }

    function _setLoading(id, loading, txt = '') {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading ? `<div class="auth-spinner"></div>` : txt;
    }

    function _fieldError(fId, eId, msg) {
        const inp = fId ? document.getElementById(fId) : null;
        const err = eId ? document.getElementById(eId) : null;
        if (inp) { inp.classList.toggle('error', !!msg); inp.classList.toggle('success', !msg && inp.value); }
        if (err) { err.textContent = msg || ''; err.classList.toggle('show', !!msg); }
    }

    function _clearErrors() {
        document.querySelectorAll('.auth-field-error').forEach(e => { e.classList.remove('show'); e.textContent = ''; });
        document.querySelectorAll('.auth-input').forEach(i => { i.classList.remove('error'); });
    }

    function _validateLdap(v)  {
        if (!v) return 'LDAP obrigatório.';
        if (!/^\d{8}$/.test(v)) return 'LDAP deve ter exatamente 8 dígitos.';
        if (!v.startsWith('7300')) return 'LDAP deve começar com 7300.';
        return null;
    }
    function _validateNome(v)  { return (!v || v.trim().split(' ').filter(Boolean).length < 2) ? 'Informe nome e sobrenome.' : null; }
    function _validateEmail(v, nome) {
        if (!v || !v.endsWith('@obramax.com.br')) return 'Email deve ser @obramax.com.br.';
        const local = v.split('@')[0].toLowerCase();
        const first = (nome || '').trim().toLowerCase()[0];
        if (!local || local[0] !== first) return `Email deve começar com "${first}".`;
        return null;
    }
    function _validateSenha(v) { return (!v || v.length < 6) ? 'Senha deve ter pelo menos 6 caracteres.' : null; }

    // Password strength
    function _updateStrength(v) {
        const w = document.getElementById('strength-wrap');
        if (!w) return;
        if (!v) { w.style.display = 'none'; return; }
        w.style.display = 'block';
        let score = 0;
        if (v.length >= 8) score++;
        if (/[A-Z]/.test(v)) score++;
        if (/[0-9]/.test(v)) score++;
        if (/[^A-Za-z0-9]/.test(v)) score++;
        const colors = ['#EF4444','#F59E0B','#3B82F6','#10B981'];
        const labels = ['Senha fraca','Senha razoável','Senha boa','Senha forte'];
        for (let i = 0; i < 4; i++) {
            const seg = document.getElementById(`s${i+1}`);
            if (seg) seg.style.background = i < score ? colors[score-1] : '#1A1D2E';
        }
        const txt = document.getElementById('strength-txt');
        if (txt) { txt.textContent = labels[Math.max(0,score-1)]; txt.style.color = colors[Math.max(0,score-1)]; }
    }

    // Toggle password visibility
    function _togglePass(inputId, btnId) {
        const inp = document.getElementById(inputId);
        if (!inp) return;
        const isPass = inp.type === 'password';
        inp.type = isPass ? 'text' : 'password';
        const btn = document.getElementById(btnId);
        if (btn) {
            const eye = btn.querySelector('svg');
            if (eye) eye.style.opacity = isPass ? '0.5' : '1';
        }
    }

    function _setupLiveValidation() {
        const ldapEl  = document.getElementById('f-ldap');
        const nomeEl  = document.getElementById('f-nome');
        const emailEl = document.getElementById('f-email');
        const senhaEl = document.getElementById('f-senha');

        if (ldapEl) ldapEl.addEventListener('input', () => {
            const v = ldapEl.value.trim(), err = _validateLdap(v);
            _fieldError('f-ldap','err-ldap', v.length === 8 ? err : null);
            const icon = document.getElementById('icon-ldap');
            if (icon) { icon.textContent = !err && v.length === 8 ? '✅' : ''; icon.classList.toggle('show', !err && v.length === 8); }
        });
        if (nomeEl) nomeEl.addEventListener('blur', () => {
            const v = nomeEl.value.trim(), err = _validateNome(v);
            _fieldError('f-nome','err-nome', v ? err : null);
            const icon = document.getElementById('icon-nome');
            if (icon) { icon.textContent = !err && v ? '✅' : ''; icon.classList.toggle('show', !err && v); }
            if (emailEl?.value) emailEl.dispatchEvent(new Event('blur'));
        });
        if (emailEl) emailEl.addEventListener('blur', () => {
            const v = emailEl.value.trim().toLowerCase(), nome = nomeEl?.value.trim() || '';
            const err = _validateEmail(v, nome);
            _fieldError('f-email','err-email', v ? err : null);
            const icon = document.getElementById('icon-email');
            if (icon) { icon.textContent = !err && v ? '✅' : ''; icon.classList.toggle('show', !err && v); }
        });
        if (senhaEl) {
            senhaEl.addEventListener('input', () => {
                _updateStrength(senhaEl.value);
                if (senhaEl.value.length >= 6) _fieldError('f-senha','err-senha', null);
            });
        }
    }

    let _timerInterval = null;
    function _startTimer(secs = 900) {
        const el = document.getElementById('timer-count');
        if (!el) return;
        clearInterval(_timerInterval);
        let rem = secs;
        _timerInterval = setInterval(() => {
            rem--;
            if (rem <= 0) { clearInterval(_timerInterval); el.textContent = '00:00'; el.style.color = '#EF4444'; return; }
            const m = String(Math.floor(rem/60)).padStart(2,'0'), s = String(rem%60).padStart(2,'0');
            el.textContent = `${m}:${s}`;
            if (rem <= 60) el.style.color = '#EF4444';
        }, 1000);
    }

    function _setupPinInputs(cls = '.pin-digit') {
        const digits = document.querySelectorAll(cls);
        digits.forEach((inp, i) => {
            inp.addEventListener('input', e => {
                const v = e.target.value.replace(/\D/g,'');
                e.target.value = v;
                e.target.classList.toggle('filled', !!v);
                if (v && i < digits.length-1) digits[i+1].focus();
            });
            inp.addEventListener('keydown', e => {
                if (e.key === 'Backspace' && !inp.value && i > 0) { digits[i-1].focus(); digits[i-1].value = ''; digits[i-1].classList.remove('filled'); }
            });
            inp.addEventListener('paste', e => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
                text.split('').forEach((c, j) => { if (digits[j]) { digits[j].value = c; digits[j].classList.add('filled'); }});
                if (digits[text.length-1]) digits[Math.min(text.length,5)].focus();
            });
        });
        if (digits[0]) digits[0].focus();
    }

    function _getPinValue(cls = '.pin-digit') {
        return [...document.querySelectorAll(cls)].map(d => d.value).join('');
    }

    // ── RENDER ────────────────────────────────────────────────
    function _render(screen) {
        _currentScreen = screen;
        clearInterval(_timerInterval);
        const root = document.getElementById('k11-auth-root');
        if (!root) return;

        if (screen === 'portalSelect')    root.innerHTML = _renderPortalSelect();
        if (screen === 'login')           root.innerHTML = _renderLogin();
        if (screen === 'clienteLogin')    root.innerHTML = _renderClienteLogin();
        if (screen === 'clienteRegister') root.innerHTML = _renderClienteRegister();
        if (screen === 'clienteForgot')   root.innerHTML = _renderClienteForgot();
        if (screen === 'register')        root.innerHTML = _renderRegister();
        if (screen === 'confirm')         root.innerHTML = _renderConfirm(sessionStorage.getItem('k11_pending_email') || '');
        if (screen === 'forgot')          root.innerHTML = _renderForgot();
        if (screen === 'resetpin')        root.innerHTML = _renderResetPin();

        _bindEvents(screen);
    }

    // ── BIND EVENTS ───────────────────────────────────────────
    function _bindEvents(screen) {
        if (screen === 'portalSelect') {
            // handled inline
        }
        if (screen === 'login') {
            document.getElementById('btn-login')?.addEventListener('click', _doLogin);
            document.getElementById('link-register')?.addEventListener('click', () => _render('register'));
            document.getElementById('link-forgot')?.addEventListener('click', () => _render('forgot'));
            document.getElementById('btn-back-portal')?.addEventListener('click', () => _render('portalSelect'));
            document.getElementById('f-senha')?.addEventListener('keydown', e => { if (e.key === 'Enter') _doLogin(); });
        }
        if (screen === 'clienteRegister') {
            document.getElementById('btn-back-cliente-login')?.addEventListener('click', () => _render('clienteLogin'));
            document.getElementById('btn-register-cliente')?.addEventListener('click', _doClienteRegister);
            document.getElementById('f-senha-cli-reg')?.addEventListener('keydown', e => { if (e.key === 'Enter') _doClienteRegister(); });
        }
        if (screen === 'clienteForgot') {
            document.getElementById('btn-back-cliente-login2')?.addEventListener('click', () => _render('clienteLogin'));
            document.getElementById('btn-forgot-cliente')?.addEventListener('click', _doClienteForgot);
            document.getElementById('f-email-cli-forgot')?.addEventListener('keydown', e => { if (e.key === 'Enter') _doClienteForgot(); });
        }
        if (screen === 'clienteLogin') {
            document.getElementById('btn-login-cliente')?.addEventListener('click', _doClienteLogin);
            document.getElementById('link-register-cliente')?.addEventListener('click', () => _render('clienteRegister'));
            document.getElementById('link-forgot-cliente')?.addEventListener('click', () => _render('clienteForgot'));
            document.getElementById('btn-back-portal2')?.addEventListener('click', () => _render('portalSelect'));
            document.getElementById('f-senha-cliente')?.addEventListener('keydown', e => { if (e.key === 'Enter') _doClienteLogin(); });
        }
        if (screen === 'register') {
            _setupLiveValidation();
            document.getElementById('btn-register')?.addEventListener('click', _doRegister);
            document.getElementById('btn-back-login')?.addEventListener('click', () => _render('login'));
            document.getElementById('btn-back-login-reg')?.addEventListener('click', () => _render('login'));
        }
        if (screen === 'confirm') {
            _setupPinInputs('.pin-digit');
            _startTimer(900);
            document.getElementById('btn-confirm')?.addEventListener('click', _doConfirm);
            document.getElementById('btn-resend')?.addEventListener('click', _doResend);
            document.getElementById('btn-back-register')?.addEventListener('click', () => _render('register'));
        }
        if (screen === 'forgot') {
            document.getElementById('btn-forgot')?.addEventListener('click', _doForgot);
            document.getElementById('btn-back-login-forgot')?.addEventListener('click', () => _render('login'));
        }
        if (screen === 'resetpin') {
            _setupResetPinInputs();
            document.getElementById('btn-reset')?.addEventListener('click', _doReset);
            document.getElementById('link-back-login2')?.addEventListener('click', () => _render('login'));
        }
    }

    // ── PORTAL SELECT ─────────────────────────────────────────
    function _selectPortal(type) {
        if (type === 'op') _render('login');
        else _render('clienteLogin');
    }

    // ── CLIENTE LOGIN ─────────────────────────────────────────
    async function _doClienteLogin() {
        _clearErrors();
        const email = document.getElementById('f-email-cliente')?.value.trim().toLowerCase();
        const senha = document.getElementById('f-senha-cliente')?.value;
        if (!email) { _fieldError('f-email-cliente','err-email-cli','Email obrigatório.'); return; }
        if (!senha)  { _fieldError('f-senha-cliente','err-senha-cli','Senha obrigatória.'); return; }

        _setLoading('btn-login-cliente', true);

        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/cliente/login`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha }), signal: AbortSignal.timeout(8000),
            });
            const data = await res.json();

            if (!res.ok || !data.ok) {
                _fieldError('f-email-cliente','err-email-cli',' ');
                _fieldError('f-senha-cliente','err-senha-cli', data.error || 'Email ou senha incorretos.');
                _setLoading('btn-login-cliente', false, 'ACESSAR MINHA ÁREA');
                return;
            }

            K11Auth.setToken(data.token);
            try { sessionStorage.setItem('k11_user', JSON.stringify({ nome: data.user.nome, role: 'cliente', email })); } catch {}
            document.body.style.opacity = '0'; document.body.style.transition = 'opacity .3s';
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 350);

        } catch (e) {
            // Demo mode: allow any email/pass for cliente
            K11Auth.setToken?.('demo-cliente-token');
            try { sessionStorage.setItem('k11_user', JSON.stringify({ nome: email.split('@')[0], role: 'cliente', email })); } catch {}
            _toast('Modo demo: entrando como cliente...', 'success', 2000);
            document.body.style.opacity = '0'; document.body.style.transition = 'opacity .3s';
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
        }
    }

    // ── CLIENTE REGISTER ────────────────────────────────────────
    async function _doClienteRegister() {
        _clearErrors();
        const nome  = document.getElementById('f-nome-cli')?.value.trim();
        const email = document.getElementById('f-email-cli-reg')?.value.trim().toLowerCase();
        const senha = document.getElementById('f-senha-cli-reg')?.value;
        let hasErr = false;
        if (!nome || nome.length < 3) { _fieldError('f-nome-cli','err-nome-cli','Nome obrigatório (min. 3 caracteres).'); hasErr = true; }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { _fieldError('f-email-cli-reg','err-email-cli-reg','Email inválido.'); hasErr = true; }
        if (!senha || senha.length < 6) { _fieldError('f-senha-cli-reg','err-senha-cli-reg','Senha deve ter no mínimo 6 caracteres.'); hasErr = true; }
        if (hasErr) return;

        _setLoading('btn-register-cliente', true);
        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/cliente/register`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, email, senha }), signal: AbortSignal.timeout(10000),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                if (data.field) _fieldError(`f-${data.field}-cli-reg`, `err-${data.field}-cli-reg`, data.error);
                else _toast(data.error || 'Erro ao cadastrar.', 'danger');
                _setLoading('btn-register-cliente', false, 'CRIAR MINHA CONTA');
                return;
            }
            K11Auth.setToken(data.token);
            try { sessionStorage.setItem('k11_user', JSON.stringify({ nome: data.user.nome, role: 'cliente', email })); } catch {}
            _toast('Conta criada com sucesso!', 'success', 1200);
            document.body.style.opacity = '0'; document.body.style.transition = 'opacity .3s';
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 1300);
        } catch (e) {
            _toast('Erro de conexão. Verifique sua internet.', 'danger');
            _setLoading('btn-register-cliente', false, 'CRIAR MINHA CONTA');
        }
    }

    // ── CLIENTE FORGOT ───────────────────────────────────────────
    async function _doClienteForgot() {
        _clearErrors();
        const email = document.getElementById('f-email-cli-forgot')?.value.trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            _fieldError('f-email-cli-forgot','err-email-cli-forgot','Email inválido.');
            return;
        }
        _setLoading('btn-forgot-cliente', true);
        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/cliente/forgot`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }), signal: AbortSignal.timeout(10000),
            });
            const data = await res.json();
            _setLoading('btn-forgot-cliente', false, 'ENVIAR INSTRUÇÕES');
            // Sempre mostra mensagem neutra (não revela se email existe)
            _toast(data.message || 'Se o email estiver cadastrado, você receberá as instruções.', 'success', 4000);
            setTimeout(() => _render('clienteLogin'), 4200);
        } catch (e) {
            _toast('Erro de conexão. Verifique sua internet.', 'danger');
            _setLoading('btn-forgot-cliente', false, 'ENVIAR INSTRUÇÕES');
        }
    }

    // ── LOGIN OP ──────────────────────────────────────────────
    async function _doLogin() {
        _clearErrors();
        const ldap  = document.getElementById('f-ldap')?.value.trim();
        const senha = document.getElementById('f-senha')?.value;
        const errL  = _validateLdap(ldap);
        if (errL) { _fieldError('f-ldap','err-ldap', errL); return; }
        if (!senha) { _fieldError('f-senha','err-senha','Senha obrigatória.'); return; }

        _setLoading('btn-login', true);
        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/login`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ re: ldap, pin: senha }), signal: AbortSignal.timeout(8000),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                _fieldError('f-ldap','err-ldap',' ');
                _fieldError('f-senha','err-senha', data.error || 'LDAP ou senha incorretos.');
                _setLoading('btn-login', false, 'ENTRAR NO SISTEMA');
                return;
            }
            K11Auth.setToken(data.token);
            try { sessionStorage.setItem('k11_user', JSON.stringify({ re: ldap, nome: data.user.nome, role: data.user.role })); } catch {}
            if (data.user.role === 'super') try { sessionStorage.setItem('k11_mode', 'ultra'); } catch {}
            document.body.style.opacity = '0'; document.body.style.transition = 'opacity .3s';
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 350);
        } catch (e) {
            _toast('Erro de conexão. Verifique sua internet.', 'danger');
            _setLoading('btn-login', false, 'ENTRAR NO SISTEMA');
        }
    }

    async function _doRegister() {
        _clearErrors();
        const ldap  = document.getElementById('f-ldap')?.value.trim();
        const nome  = document.getElementById('f-nome')?.value.trim();
        const email = document.getElementById('f-email')?.value.trim().toLowerCase();
        const senha = document.getElementById('f-senha')?.value;
        let hasErr  = false;
        [['f-ldap','err-ldap',_validateLdap(ldap)],['f-nome','err-nome',_validateNome(nome)],['f-email','err-email',_validateEmail(email,nome)],['f-senha','err-senha',_validateSenha(senha)]].forEach(([f,e,err]) => { if (err) { _fieldError(f,e,err); hasErr = true; }});
        if (hasErr) return;
        _setLoading('btn-register', true);
        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ldap, nome, email, senha }), signal: AbortSignal.timeout(10000) });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                if (data.field) _fieldError(`f-${data.field}`,`err-${data.field}`, data.error);
                else _toast(data.error || 'Erro ao cadastrar.', 'danger');
                _setLoading('btn-register', false, 'ENVIAR CÓDIGO DE CONFIRMAÇÃO');
                return;
            }
            _pendingLdap = ldap;
            try { sessionStorage.setItem('k11_pending_email', email); sessionStorage.setItem('k11_pending_ldap', ldap); } catch {}
            _render('confirm');
        } catch (e) {
            _toast('Erro de conexão. Verifique sua internet.', 'danger');
            _setLoading('btn-register', false, 'ENVIAR CÓDIGO DE CONFIRMAÇÃO');
        }
    }

    async function _doConfirm() {
        const pin  = _getPinValue('.pin-digit');
        const ldap = sessionStorage.getItem('k11_pending_ldap') || _pendingLdap;
        if (pin.length < 6) { _fieldError(null,'err-pin','Digite todos os 6 dígitos.'); return; }
        _setLoading('btn-confirm', true);
        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/confirm-pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ldap, pin }), signal: AbortSignal.timeout(8000) });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                _fieldError(null,'err-pin', data.error || 'Código incorreto.');
                document.querySelectorAll('.pin-digit').forEach(d => { d.classList.add('error'); setTimeout(() => d.classList.remove('error'), 400); });
                _setLoading('btn-confirm', false, 'CONFIRMAR CADASTRO');
                return;
            }
            clearInterval(_timerInterval);
            sessionStorage.removeItem('k11_pending_email'); sessionStorage.removeItem('k11_pending_ldap');
            K11Auth.setToken(data.token);
            try { sessionStorage.setItem('k11_user', JSON.stringify({ re: ldap, nome: data.user.nome, role: 'op' })); } catch {}
            _toast('Cadastro confirmado! Bem-vindo! 🎉', 'success', 2000);
            setTimeout(() => { document.body.style.opacity = '0'; document.body.style.transition = 'opacity .4s'; setTimeout(() => { window.location.href = 'dashboard.html'; }, 400); }, 1200);
        } catch (e) {
            _toast('Erro de conexão. Tente novamente.', 'danger');
            _setLoading('btn-confirm', false, 'CONFIRMAR CADASTRO');
        }
    }

    async function _doForgot() {
        _clearErrors();
        const ldap  = document.getElementById('f-ldap')?.value.trim();
        const email = document.getElementById('f-email')?.value.trim().toLowerCase();
        const errL  = _validateLdap(ldap);
        if (errL) { _fieldError('f-ldap','err-ldap', errL); return; }
        if (!email) { _fieldError('f-email','err-email','Email obrigatório.'); return; }
        _setLoading('btn-forgot', true);
        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ldap, email }), signal: AbortSignal.timeout(15000) });
            const data = await res.json();
            if (!res.ok || !data.ok) { _toast(data.error || 'Erro ao enviar código.', 'danger'); _setLoading('btn-forgot', false, 'ENVIAR CÓDIGO'); return; }
            sessionStorage.setItem('k11_reset_ldap', ldap);
            _render('resetpin');
        } catch (e) {
            _toast('Erro de conexão. Tente novamente.', 'danger');
            _setLoading('btn-forgot', false, 'ENVIAR CÓDIGO');
        }
    }

    function _setupResetPinInputs() {
        const c = document.getElementById('reset-pin-inputs');
        if (!c) return;
        c.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const inp = document.createElement('input');
            inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 1; inp.className = 'auth-pin-digit'; inp.dataset.idx = i;
            inp.addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/,''); if (e.target.value && i < 5) c.children[i+1].focus(); });
            inp.addEventListener('keydown', e => { if (e.key === 'Backspace' && !e.target.value && i > 0) c.children[i-1].focus(); });
            c.appendChild(inp);
        }
        c.children[0].focus();
    }

    async function _doReset() {
        _clearErrors();
        const ldap      = sessionStorage.getItem('k11_reset_ldap') || '';
        const pin       = [...document.querySelectorAll('.auth-pin-digit')].map(i => i.value).join('');
        const novaSenha = document.getElementById('f-nova-senha')?.value;
        if (pin.length < 6) { _fieldError(null,'err-pin','Digite os 6 dígitos.'); return; }
        if (!novaSenha || novaSenha.length < 6) { _fieldError('f-nova-senha','err-nova-senha','Senha deve ter pelo menos 6 caracteres.'); return; }
        _setLoading('btn-reset', true);
        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ldap, pin, novaSenha }), signal: AbortSignal.timeout(10000) });
            const data = await res.json();
            if (!res.ok || !data.ok) {
                if (data.field === 'novaSenha') _fieldError('f-nova-senha','err-nova-senha', data.error);
                else _fieldError(null,'err-pin', data.error || 'Código incorreto.');
                _setLoading('btn-reset', false, 'REDEFINIR SENHA');
                return;
            }
            sessionStorage.removeItem('k11_reset_ldap');
            _toast('Senha alterada com sucesso!', 'success');
            setTimeout(() => _render('login'), 1800);
        } catch (e) {
            _toast('Erro de conexão. Tente novamente.', 'danger');
            _setLoading('btn-reset', false, 'REDEFINIR SENHA');
        }
    }

    async function _doResend() {
        const ldap = sessionStorage.getItem('k11_pending_ldap') || _pendingLdap;
        const btn  = document.getElementById('btn-resend');
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/resend-pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ldap }), signal: AbortSignal.timeout(8000) });
            const data = await res.json();
            if (data.ok) { _toast('Novo código enviado! ✅', 'success'); _startTimer(900); }
            else _toast(data.error || 'Erro ao reenviar.', 'danger');
        } catch { _toast('Erro de conexão.', 'danger'); }
        finally { setTimeout(() => { if (btn) { btn.disabled = false; btn.textContent = 'Reenviar código'; }}, 60000); }
    }

    // ── INIT ──────────────────────────────────────────────────
    function init() {
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        let root = document.getElementById('k11-auth-root');
        if (!root) { root = document.createElement('div'); root.id = 'k11-auth-root'; document.body.appendChild(root); }

        if (typeof K11Auth !== 'undefined' && K11Auth.isAuthenticated()) { window.location.href = 'dashboard.html'; return; }

        const pendingLdap = sessionStorage.getItem('k11_pending_ldap');
        if (pendingLdap && sessionStorage.getItem('k11_pending_email')) { _pendingLdap = pendingLdap; _render('confirm'); }
        else _render('portalSelect');
    }

    return { init, showForgot: () => _render('forgot'), _selectPortal, _togglePass };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('k11-auth-root') || document.body) K11AuthUI.init(); });
} else {
    K11AuthUI.init();
}
