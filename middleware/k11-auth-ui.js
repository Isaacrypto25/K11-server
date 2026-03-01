/**
 * K11 OMNI ELITE — AUTH UI
 * ══════════════════════════
 * Gerencia as 3 telas de autenticação:
 *   1. Login       — LDAP + senha
 *   2. Cadastro    — LDAP, nome, email, senha
 *   3. Confirmar   — PIN de 6 dígitos recebido por email
 *
 * Como usar no index.html:
 *   <script src="k11-auth-ui.js"></script>
 *   <script> K11AuthUI.init(); </script>
 *
 * Depende de: k11-config.js (K11_SERVER_URL, K11Auth)
 */

'use strict';

const K11AuthUI = (() => {

    // ── Estado ────────────────────────────────────────────────
    let _currentScreen = 'login'; // 'login' | 'register' | 'confirm'
    let _pendingLdap   = '';      // LDAP aguardando confirmação

    // ── CSS ───────────────────────────────────────────────────
    const CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
        background: #090A0F;
        color: #F3F4F6;
        font-family: 'Inter', sans-serif;
        min-height: 100vh;
        min-height: -webkit-fill-available;
        display: block;
        padding: 40px 20px;
        overflow-x: hidden;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
    }

    /* Grid background */
    body::before {
        content: '';
        position: fixed; inset: 0;
        background-image:
            linear-gradient(rgba(255,140,0,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,140,0,0.03) 1px, transparent 1px);
        background-size: 40px 40px;
        pointer-events: none;
        z-index: 0;
    }

    #k11-auth-root {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 400px;
        margin: 0 auto;
    }

    /* ── Logo ───────────────────────────────────────────────── */
    .auth-logo {
        text-align: center;
        margin-bottom: 32px;
        animation: fadeDown 0.6s ease both;
    }
    .auth-logo-hex {
        width: 64px; height: 64px;
        background: rgba(255,140,0,0.1);
        border: 1.5px solid rgba(255,140,0,0.4);
        border-radius: 18px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 12px;
        box-shadow: 0 0 32px rgba(255,140,0,0.15);
    }
    .auth-logo-title {
        font-size: 20px;
        font-weight: 900;
        letter-spacing: -0.5px;
        color: #F3F4F6;
    }
    .auth-logo-title span { color: #FF8C00; }
    .auth-logo-sub {
        font-size: 10px;
        letter-spacing: 3px;
        color: #4B5563;
        text-transform: uppercase;
        margin-top: 2px;
    }

    /* ── Card ───────────────────────────────────────────────── */
    .auth-card {
        background: #14171F;
        border: 1px solid #2D3748;
        border-radius: 20px;
        padding: 28px 24px 32px;
        box-shadow: 0 24px 64px rgba(0,0,0,0.5);
        animation: fadeUp 0.5s ease both;
        position: relative;
        overflow: visible;
    }
    .auth-card::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0; height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,140,0,0.4), transparent);
    }

    /* ── Header do card ─────────────────────────────────────── */
    .auth-card-title {
        font-size: 18px;
        font-weight: 800;
        color: #F3F4F6;
        margin-bottom: 4px;
    }
    .auth-card-sub {
        font-size: 12px;
        color: #6B7280;
        margin-bottom: 24px;
        line-height: 1.5;
    }

    /* ── Inputs ─────────────────────────────────────────────── */
    .auth-field { margin-bottom: 16px; }
    .auth-label {
        display: block;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1.5px;
        color: #6B7280;
        text-transform: uppercase;
        margin-bottom: 6px;
    }
    .auth-input-wrap { position: relative; }
    .auth-input {
        width: 100%;
        background: rgba(255,255,255,0.04);
        border: 1px solid #2D3748;
        border-radius: 10px;
        padding: 12px 14px;
        font-size: 14px;
        color: #F3F4F6;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
        font-family: 'Inter', sans-serif;
    }
    .auth-input:focus {
        border-color: rgba(255,140,0,0.5);
        box-shadow: 0 0 0 3px rgba(255,140,0,0.08);
    }
    .auth-input.error {
        border-color: rgba(239,68,68,0.6);
        box-shadow: 0 0 0 3px rgba(239,68,68,0.08);
    }
    .auth-input.success {
        border-color: rgba(16,185,129,0.5);
    }
    .auth-input::placeholder { color: rgba(255,255,255,0.2); }

    /* Ícone de validação inline */
    .auth-input-icon {
        position: absolute;
        right: 12px; top: 50%;
        transform: translateY(-50%);
        font-size: 14px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s;
    }
    .auth-input-icon.show { opacity: 1; }

    /* Mensagem de erro por campo */
    .auth-field-error {
        font-size: 11px;
        color: #EF4444;
        margin-top: 5px;
        display: none;
        animation: shake 0.3s ease;
    }
    .auth-field-error.show { display: block; }

    /* Hint em cinza abaixo do campo */
    .auth-field-hint {
        font-size: 10px;
        color: #4B5563;
        margin-top: 4px;
    }

    /* ── PIN Input especial ──────────────────────────────────── */
    .pin-input-wrap {
        display: flex;
        gap: 8px;
        justify-content: center;
        margin: 8px 0;
    }
    .pin-digit {
        width: 46px; height: 56px;
        background: rgba(255,255,255,0.04);
        border: 1px solid #2D3748;
        border-radius: 10px;
        font-size: 24px;
        font-weight: 800;
        color: #FF8C00;
        text-align: center;
        outline: none;
        caret-color: #FF8C00;
        font-family: 'JetBrains Mono', monospace;
        transition: border-color 0.2s, box-shadow 0.2s;
        -webkit-appearance: none;
    }
    .pin-digit:focus {
        border-color: rgba(255,140,0,0.6);
        box-shadow: 0 0 0 3px rgba(255,140,0,0.1);
    }
    .pin-digit.filled { border-color: rgba(255,140,0,0.4); }

    /* ── Botão principal ────────────────────────────────────── */
    .auth-btn {
        width: 100%;
        padding: 13px;
        background: linear-gradient(135deg, #FF8C00, #E06000);
        border: none;
        border-radius: 10px;
        color: #000;
        font-size: 12px;
        font-weight: 900;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(255,140,0,0.3);
        transition: all 0.2s;
        margin-top: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-family: 'Inter', sans-serif;
    }
    .auth-btn:hover:not(:disabled) {
        box-shadow: 0 6px 28px rgba(255,140,0,0.45);
        transform: translateY(-1px);
    }
    .auth-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
    }
    .auth-btn-secondary {
        background: transparent;
        border: 1px solid #2D3748;
        color: #9CA3AF;
        box-shadow: none;
        margin-top: 8px;
    }
    .auth-btn-secondary:hover:not(:disabled) {
        border-color: #4B5563;
        color: #F3F4F6;
        box-shadow: none;
        transform: none;
    }

    /* ── Links ──────────────────────────────────────────────── */
    .auth-links {
        display: flex;
        justify-content: center;
        gap: 16px;
        margin-top: 20px;
    }
    .auth-link {
        font-size: 12px;
        color: #6B7280;
        cursor: pointer;
        transition: color 0.2s;
        background: none;
        border: none;
        font-family: 'Inter', sans-serif;
        padding: 0;
    }
    .auth-link:hover { color: #FF8C00; }
    .auth-link.primary { color: #FF8C00; font-weight: 700; }

    /* ── Toast ──────────────────────────────────────────────── */
    #auth-toast {
        position: fixed;
        bottom: 24px; left: 50%;
        transform: translateX(-50%) translateY(80px);
        background: #1a1d2e;
        border: 1px solid #2D3748;
        border-radius: 12px;
        padding: 12px 20px;
        font-size: 13px;
        color: #F3F4F6;
        z-index: 9999;
        transition: transform 0.3s cubic-bezier(.16,1,.3,1), opacity 0.3s;
        opacity: 0;
        white-space: nowrap;
        max-width: calc(100vw - 32px);
        white-space: normal;
        text-align: center;
    }
    #auth-toast.show {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
    }
    #auth-toast.danger { border-color: rgba(239,68,68,0.4); color: #FCA5A5; }
    #auth-toast.success { border-color: rgba(16,185,129,0.4); color: #6EE7B7; }

    /* ── Spinner ────────────────────────────────────────────── */
    .auth-spinner {
        width: 16px; height: 16px;
        border: 2px solid rgba(0,0,0,0.3);
        border-top-color: #000;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
        flex-shrink: 0;
    }

    /* ── Email preview ──────────────────────────────────────── */
    .auth-email-preview {
        background: rgba(255,140,0,0.06);
        border: 1px solid rgba(255,140,0,0.2);
        border-radius: 10px;
        padding: 12px 16px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .auth-email-preview-icon { font-size: 20px; }
    .auth-email-preview-text { font-size: 12px; color: #9CA3AF; line-height: 1.5; }
    .auth-email-preview-addr { color: #FF8C00; font-weight: 700; font-size: 13px; }

    /* ── Timer ──────────────────────────────────────────────── */
    .auth-timer {
        text-align: center;
        font-size: 11px;
        color: #4B5563;
        margin-top: 12px;
    }
    .auth-timer span { color: #9CA3AF; font-weight: 700; }

    /* ── Steps indicator ────────────────────────────────────── */
    .auth-steps {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-bottom: 24px;
    }
    .auth-step {
        width: 24px; height: 4px;
        border-radius: 2px;
        background: #2D3748;
        transition: background 0.3s;
    }
    .auth-step.active  { background: #FF8C00; }
    .auth-step.done    { background: rgba(16,185,129,0.6); }

    /* ── Animações ──────────────────────────────────────────── */
    @keyframes fadeDown {
        from { opacity: 0; transform: translateY(-16px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeUp {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    @keyframes shake {
        0%,100% { transform: translateX(0); }
        25%      { transform: translateX(-6px); }
        75%      { transform: translateX(6px); }
    }
    `;

    // ── TEMPLATES HTML ────────────────────────────────────────

    function _renderLogin() {
        return `
        <div class="auth-logo">
            <div class="auth-logo-hex">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#FF8C00" stroke-width="1.8" stroke-linejoin="round"/>
                    <path d="M8 10l4 4 4-4" stroke="#FF8C00" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="auth-logo-title">OMNI <span>K11</span></div>
            <div class="auth-logo-sub">Elite Operational OS</div>
        </div>

        <div class="auth-card">
            <div class="auth-card-title">Entrar</div>
            <div class="auth-card-sub">Use seu LDAP e senha cadastrados.</div>

            <div class="auth-field">
                <label class="auth-label">LDAP</label>
                <div class="auth-input-wrap">
                    <input id="f-ldap" class="auth-input" type="text"
                           inputmode="numeric" maxlength="8"
                           placeholder="73xxxxxx" autocomplete="username">
                    <span class="auth-input-icon" id="icon-ldap"></span>
                </div>
                <div class="auth-field-error" id="err-ldap"></div>
            </div>

            <div class="auth-field">
                <label class="auth-label">Senha</label>
                <div class="auth-input-wrap">
                    <input id="f-senha" class="auth-input" type="password"
                           placeholder="••••••••" autocomplete="current-password">
                </div>
                <div class="auth-field-error" id="err-senha"></div>
            </div>

            <button class="auth-btn" id="btn-login">
                ENTRAR NO SISTEMA
            </button>
        </div>

        <div class="auth-links">
            <button class="auth-link primary" id="link-register">
                Criar conta
            </button>
            <button class="auth-link" id="link-forgot">
                Esqueci minha senha
            </button>
        </div>

        <div id="auth-toast"></div>`;
    }

    function _renderForgot() {
        return `
        <div class="auth-logo">
            <div class="auth-logo-hex">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#FF8C00" stroke-width="1.8" stroke-linejoin="round"/>
                    <path d="M8 10l4 4 4-4" stroke="#FF8C00" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="auth-logo-title">OMNI <span>K11</span></div>
            <div class="auth-logo-sub">Recuperar senha</div>
        </div>

        <div class="auth-card">
            <div class="auth-card-title">Recuperar senha</div>
            <div class="auth-card-sub">Informe seu LDAP e email cadastrado.</div>

            <div class="auth-field">
                <label class="auth-label">LDAP</label>
                <div class="auth-input-wrap">
                    <input id="f-ldap" class="auth-input" type="text"
                           inputmode="numeric" maxlength="8"
                           placeholder="73xxxxxx" autocomplete="username">
                    <span class="auth-input-icon" id="icon-ldap"></span>
                </div>
                <div class="auth-field-error" id="err-ldap"></div>
            </div>

            <div class="auth-field">
                <label class="auth-label">Email corporativo</label>
                <div class="auth-input-wrap">
                    <input id="f-email" class="auth-input" type="email"
                           placeholder="nome@obramax.com" autocomplete="email">
                    <span class="auth-input-icon" id="icon-email"></span>
                </div>
                <div class="auth-field-error" id="err-email"></div>
            </div>

            <button class="auth-btn" id="btn-forgot">
                ENVIAR CÓDIGO
            </button>

            <div class="auth-links">
                <button class="auth-link" id="link-back-login">
                    Voltar para o login
                </button>
            </div>
        </div>

        <div id="auth-toast"></div>`;
    }

    function _renderResetPin() {
        return `
        <div class="auth-logo">
            <div class="auth-logo-hex">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#FF8C00" stroke-width="1.8" stroke-linejoin="round"/>
                    <path d="M8 10l4 4 4-4" stroke="#FF8C00" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="auth-logo-title">OMNI <span>K11</span></div>
            <div class="auth-logo-sub">Confirmar código</div>
        </div>

        <div class="auth-card">
            <div class="auth-card-title">Digite o código</div>
            <div class="auth-card-sub" id="reset-pin-sub">Código enviado para seu email.</div>

            <div class="auth-field">
                <label class="auth-label">Código de 6 dígitos</label>
                <div class="auth-pin-row" id="reset-pin-inputs"></div>
                <div class="auth-field-error" id="err-pin"></div>
            </div>

            <div class="auth-field">
                <label class="auth-label">Nova senha</label>
                <div class="auth-input-wrap">
                    <input id="f-nova-senha" class="auth-input" type="password"
                           placeholder="Mínimo 6 caracteres" autocomplete="new-password">
                </div>
                <div class="auth-field-error" id="err-nova-senha"></div>
            </div>

            <button class="auth-btn" id="btn-reset">
                REDEFINIR SENHA
            </button>

            <div class="auth-links">
                <button class="auth-link" id="link-back-login2">
                    Voltar para o login
                </button>
            </div>
        </div>

        <div id="auth-toast"></div>`;
    }


    function _renderRegister() {
        return `
        <div class="auth-logo">
            <div class="auth-logo-hex">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L3 7v10l9 5 9-5V7L12 2z" stroke="#FF8C00" stroke-width="1.8" stroke-linejoin="round"/>
                    <path d="M12 8v8M8 12h8" stroke="#FF8C00" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="auth-logo-title">OMNI <span>K11</span></div>
            <div class="auth-logo-sub">Criar conta</div>
        </div>

        <div class="auth-card">
            <div class="auth-steps">
                <div class="auth-step active"></div>
                <div class="auth-step"></div>
            </div>

            <div class="auth-card-title">Criar conta</div>
            <div class="auth-card-sub">
                Apenas colaboradores Obramax podem se cadastrar.
            </div>

            <div class="auth-field">
                <label class="auth-label">LDAP</label>
                <div class="auth-input-wrap">
                    <input id="f-ldap" class="auth-input" type="text"
                           inputmode="numeric" maxlength="8"
                           placeholder="73xxxxxx" autocomplete="username">
                    <span class="auth-input-icon" id="icon-ldap"></span>
                </div>
                <div class="auth-field-error" id="err-ldap"></div>
                <div class="auth-field-hint">8 dígitos começando com 7300</div>
            </div>

            <div class="auth-field">
                <label class="auth-label">Nome completo</label>
                <div class="auth-input-wrap">
                    <input id="f-nome" class="auth-input" type="text"
                           placeholder="Ryan Santos" autocomplete="name">
                    <span class="auth-input-icon" id="icon-nome"></span>
                </div>
                <div class="auth-field-error" id="err-nome"></div>
            </div>

            <div class="auth-field">
                <label class="auth-label">Email corporativo</label>
                <div class="auth-input-wrap">
                    <input id="f-email" class="auth-input" type="email"
                           placeholder="rsantos@obramax.com" autocomplete="email">
                    <span class="auth-input-icon" id="icon-email"></span>
                </div>
                <div class="auth-field-error" id="err-email"></div>
                <div class="auth-field-hint">Deve ser @obramax.com</div>
            </div>

            <div class="auth-field">
                <label class="auth-label">Senha</label>
                <div class="auth-input-wrap">
                    <input id="f-senha" class="auth-input" type="password"
                           placeholder="Mínimo 6 caracteres" autocomplete="new-password">
                </div>
                <div class="auth-field-error" id="err-senha"></div>
            </div>

            <button class="auth-btn" id="btn-register">
                ENVIAR CÓDIGO DE CONFIRMAÇÃO
            </button>
            <button class="auth-btn auth-btn-secondary" id="btn-back-login">
                ← Voltar para login
            </button>
        </div>

        <div id="auth-toast"></div>`;
    }

    function _renderConfirm(email) {
        const maskedEmail = email.replace(/(.{2})(.*)(@)/, (_, a, b, c) =>
            a + '*'.repeat(Math.max(2, b.length - 2)) + b.slice(-2) + c
        );
        return `
        <div class="auth-logo">
            <div class="auth-logo-hex">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2z" stroke="#FF8C00" stroke-width="1.8"/>
                    <path d="M2 6l10 7 10-7" stroke="#FF8C00" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="auth-logo-title">OMNI <span>K11</span></div>
            <div class="auth-logo-sub">Confirmar cadastro</div>
        </div>

        <div class="auth-card">
            <div class="auth-steps">
                <div class="auth-step done"></div>
                <div class="auth-step active"></div>
            </div>

            <div class="auth-card-title">Verifique seu email</div>

            <div class="auth-email-preview">
                <div class="auth-email-preview-icon">📧</div>
                <div>
                    <div class="auth-email-preview-text">Código enviado para</div>
                    <div class="auth-email-preview-addr">${maskedEmail}</div>
                </div>
            </div>

            <div class="auth-field">
                <label class="auth-label" style="text-align:center;display:block;margin-bottom:12px">
                    Código de 6 dígitos
                </label>
                <div class="pin-input-wrap">
                    ${[0,1,2,3,4,5].map(i =>
                        `<input class="pin-digit" id="pin-${i}" type="text"
                         inputmode="numeric" maxlength="1" pattern="[0-9]">`
                    ).join('')}
                </div>
                <div class="auth-field-error" id="err-pin" style="text-align:center"></div>
            </div>

            <button class="auth-btn" id="btn-confirm">
                CONFIRMAR CADASTRO
            </button>

            <div class="auth-timer" id="auth-timer">
                Código expira em <span id="timer-count">15:00</span>
            </div>

            <div class="auth-links">
                <button class="auth-link" id="btn-resend">Reenviar código</button>
                <button class="auth-link" id="btn-back-register">Voltar</button>
            </div>
        </div>

        <div id="auth-toast"></div>`;
    }

    // ── HELPERS ───────────────────────────────────────────────

    function _toast(msg, type = 'info', duration = 3500) {
        const t = document.getElementById('auth-toast');
        if (!t) return;
        t.textContent = msg;
        t.className   = `show ${type}`;
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove('show'), duration);
    }

    function _setLoading(btnId, loading, originalText) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading
            ? `<div class="auth-spinner"></div>`
            : originalText;
    }

    function _fieldError(fieldId, errId, msg) {
        const input = document.getElementById(fieldId);
        const err   = document.getElementById(errId);
        if (input) { input.classList.toggle('error', !!msg); input.classList.toggle('success', !msg && input.value); }
        if (err)   { err.textContent = msg || ''; err.classList.toggle('show', !!msg); }
    }

    function _clearErrors() {
        document.querySelectorAll('.auth-field-error').forEach(e => { e.classList.remove('show'); e.textContent = ''; });
        document.querySelectorAll('.auth-input').forEach(i => { i.classList.remove('error'); });
    }

    // Validações cliente (espelha o servidor)
    function _validateLdap(v) {
        if (!v)                return 'LDAP obrigatório.';
        if (!/^\d{8}$/.test(v)) return 'LDAP deve ter exatamente 8 dígitos.';
        if (!v.startsWith('7300')) return 'LDAP deve começar com 7300.';
        return null;
    }
    function _validateNome(v) {
        if (!v || v.trim().split(' ').filter(Boolean).length < 2)
            return 'Informe nome e sobrenome.';
        return null;
    }
    function _validateEmail(v, nome) {
        if (!v || !v.endsWith('@obramax.com')) return 'Email deve ser @obramax.com.';
        const local = v.split('@')[0].toLowerCase();
        const primeiraLetraNome = (nome || '').trim().toLowerCase()[0];
        if (!local || local[0] !== primeiraLetraNome)
            return `Email deve começar com "${primeiraLetraNome}".`;
        return null;
    }
    function _validateSenha(v) {
        if (!v || v.length < 6) return 'Senha deve ter pelo menos 6 caracteres.';
        return null;
    }

    // Validação em tempo real dos campos de cadastro
    function _setupLiveValidation() {
        const ldapEl  = document.getElementById('f-ldap');
        const nomeEl  = document.getElementById('f-nome');
        const emailEl = document.getElementById('f-email');
        const senhaEl = document.getElementById('f-senha');

        if (ldapEl) ldapEl.addEventListener('input', () => {
            const v = ldapEl.value.trim();
            const err = _validateLdap(v);
            _fieldError('f-ldap', 'err-ldap', v.length === 8 ? err : null);
            const icon = document.getElementById('icon-ldap');
            if (icon) { icon.textContent = !err && v.length === 8 ? '✅' : ''; icon.classList.toggle('show', !err && v.length === 8); }
        });

        if (nomeEl) nomeEl.addEventListener('blur', () => {
            const v = nomeEl.value.trim();
            const err = _validateNome(v);
            _fieldError('f-nome', 'err-nome', v ? err : null);
            const icon = document.getElementById('icon-nome');
            if (icon) { icon.textContent = !err && v ? '✅' : ''; icon.classList.toggle('show', !err && v); }
            // Re-valida email ao mudar nome
            if (emailEl?.value) emailEl.dispatchEvent(new Event('blur'));
        });

        if (emailEl) emailEl.addEventListener('blur', () => {
            const v    = emailEl.value.trim().toLowerCase();
            const nome = nomeEl?.value.trim() || '';
            const err  = _validateEmail(v, nome);
            _fieldError('f-email', 'err-email', v ? err : null);
            const icon = document.getElementById('icon-email');
            if (icon) { icon.textContent = !err && v ? '✅' : ''; icon.classList.toggle('show', !err && v); }
        });

        if (senhaEl) senhaEl.addEventListener('input', () => {
            const v = senhaEl.value;
            if (v.length >= 6) _fieldError('f-senha', 'err-senha', null);
        });
    }

    // ── TIMER de 15 minutos ───────────────────────────────────
    let _timerInterval = null;
    function _startTimer(seconds = 900) {
        const el = document.getElementById('timer-count');
        if (!el) return;
        clearInterval(_timerInterval);
        let remaining = seconds;
        _timerInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(_timerInterval);
                el.textContent = '00:00';
                el.style.color = '#EF4444';
                return;
            }
            const m = Math.floor(remaining / 60).toString().padStart(2, '0');
            const s = (remaining % 60).toString().padStart(2, '0');
            el.textContent = `${m}:${s}`;
            if (remaining <= 60) el.style.color = '#EF4444';
        }, 1000);
    }

    // ── SETUP PIN INPUTS ──────────────────────────────────────
    function _setupPinInputs() {
        const digits = document.querySelectorAll('.pin-digit');
        digits.forEach((input, i) => {
            input.addEventListener('input', (e) => {
                const v = e.target.value.replace(/\D/g, '');
                e.target.value = v;
                e.target.classList.toggle('filled', !!v);
                if (v && i < digits.length - 1) digits[i + 1].focus();
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !input.value && i > 0) {
                    digits[i - 1].focus();
                    digits[i - 1].value = '';
                    digits[i - 1].classList.remove('filled');
                }
            });
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
                text.split('').forEach((c, j) => {
                    if (digits[j]) { digits[j].value = c; digits[j].classList.add('filled'); }
                });
                if (digits[text.length - 1]) digits[Math.min(text.length, 5)].focus();
            });
        });
        if (digits[0]) digits[0].focus();
    }

    function _getPinValue() {
        return [...document.querySelectorAll('.pin-digit')].map(d => d.value).join('');
    }

    // ── RENDER ────────────────────────────────────────────────

    function _render(screen) {
        _currentScreen = screen;
        clearInterval(_timerInterval);
        const root = document.getElementById('k11-auth-root');
        if (!root) return;

        if (screen === 'login')    root.innerHTML = _renderLogin();
        if (screen === 'register') root.innerHTML = _renderRegister();
        if (screen === 'confirm')  root.innerHTML = _renderConfirm(
            sessionStorage.getItem('k11_pending_email') || ''
        );
        if (screen === 'forgot')   root.innerHTML = _renderForgot();
        if (screen === 'resetpin') root.innerHTML = _renderResetPin();

        _bindEvents(screen);
    }

    // ── BIND EVENTS ───────────────────────────────────────────

    function _bindEvents(screen) {
        if (screen === 'login') {
            document.getElementById('btn-login')
                ?.addEventListener('click', _doLogin);
            document.getElementById('link-register')
                ?.addEventListener('click', () => _render('register'));
            document.getElementById('f-senha')
                ?.addEventListener('keydown', e => { if (e.key === 'Enter') _doLogin(); });
            document.getElementById('link-forgot')
                ?.addEventListener('click', () => _render('forgot'));
        }

        if (screen === 'register') {
            _setupLiveValidation();
            document.getElementById('btn-register')
                ?.addEventListener('click', _doRegister);
            document.getElementById('btn-back-login')
                ?.addEventListener('click', () => _render('login'));
        }

        if (screen === 'confirm') {
            _setupPinInputs();
            _startTimer(900);
            document.getElementById('btn-confirm')
                ?.addEventListener('click', _doConfirm);
            document.getElementById('btn-resend')
                ?.addEventListener('click', _doResend);
            document.getElementById('btn-back-register')
                ?.addEventListener('click', () => _render('register'));
        }

        if (screen === 'forgot') {
            document.getElementById('btn-forgot')
                ?.addEventListener('click', _doForgot);
            document.getElementById('link-back-login')
                ?.addEventListener('click', () => _render('login'));
        }

        if (screen === 'resetpin') {
            _setupResetPinInputs();
            document.getElementById('btn-reset')
                ?.addEventListener('click', _doReset);
            document.getElementById('link-back-login2')
                ?.addEventListener('click', () => _render('login'));
        }
    }

    // ── AÇÕES ─────────────────────────────────────────────────

    async function _doForgot() {
        _clearErrors();
        const ldap  = document.getElementById('f-ldap')?.value.trim();
        const email = document.getElementById('f-email')?.value.trim().toLowerCase();

        const errLdap = _validateLdap(ldap);
        if (errLdap) { _fieldError('f-ldap', 'err-ldap', errLdap); return; }
        if (!email)  { _fieldError('f-email', 'err-email', 'Email obrigatório.'); return; }

        _setLoading('btn-forgot', true);

        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/forgot-password`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ ldap, email }),
                signal:  AbortSignal.timeout(15000),
            });
            const data = await res.json();

            if (!res.ok || !data.ok) {
                _toast(data.error || 'Erro ao enviar código.', 'danger');
                _setLoading('btn-forgot', false, 'ENVIAR CÓDIGO');
                return;
            }

            // Salva LDAP para usar no reset
            sessionStorage.setItem('k11_reset_ldap', ldap);
            _render('resetpin');

        } catch (err) {
            _toast('Erro de conexão. Tente novamente.', 'danger');
            _setLoading('btn-forgot', false, 'ENVIAR CÓDIGO');
        }
    }

    function _setupResetPinInputs() {
        const container = document.getElementById('reset-pin-inputs');
        if (!container) return;
        container.innerHTML = '';
        for (let i = 0; i < 6; i++) {
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.inputMode = 'numeric';
            inp.maxLength = 1;
            inp.className = 'auth-pin-digit';
            inp.dataset.idx = i;
            inp.addEventListener('input', e => {
                e.target.value = e.target.value.replace(/\D/, '');
                if (e.target.value && i < 5) container.children[i + 1].focus();
            });
            inp.addEventListener('keydown', e => {
                if (e.key === 'Backspace' && !e.target.value && i > 0)
                    container.children[i - 1].focus();
            });
            container.appendChild(inp);
        }
        container.children[0].focus();
    }

    function _getResetPin() {
        const container = document.getElementById('reset-pin-inputs');
        if (!container) return '';
        return Array.from(container.children).map(i => i.value).join('');
    }

    async function _doReset() {
        _clearErrors();
        const ldap      = sessionStorage.getItem('k11_reset_ldap') || '';
        const pin       = _getResetPin();
        const novaSenha = document.getElementById('f-nova-senha')?.value;

        if (pin.length < 6) { _fieldError(null, 'err-pin', 'Digite os 6 dígitos.'); return; }
        if (!novaSenha || novaSenha.length < 6) {
            _fieldError('f-nova-senha', 'err-nova-senha', 'Senha deve ter pelo menos 6 caracteres.');
            return;
        }

        _setLoading('btn-reset', true);

        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/reset-password`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ ldap, pin, novaSenha }),
                signal:  AbortSignal.timeout(10000),
            });
            const data = await res.json();

            if (!res.ok || !data.ok) {
                if (data.field === 'novaSenha') {
                    _fieldError('f-nova-senha', 'err-nova-senha', data.error);
                } else {
                    _fieldError(null, 'err-pin', data.error || 'Código incorreto.');
                }
                _setLoading('btn-reset', false, 'REDEFINIR SENHA');
                return;
            }

            sessionStorage.removeItem('k11_reset_ldap');
            _toast('Senha alterada com sucesso!', 'success');
            setTimeout(() => _render('login'), 1800);

        } catch (err) {
            _toast('Erro de conexão. Tente novamente.', 'danger');
            _setLoading('btn-reset', false, 'REDEFINIR SENHA');
        }
    }


    async function _doLogin() {
        _clearErrors();
        const ldap  = document.getElementById('f-ldap')?.value.trim();
        const senha = document.getElementById('f-senha')?.value;

        const errLdap = _validateLdap(ldap);
        if (errLdap) { _fieldError('f-ldap', 'err-ldap', errLdap); return; }
        if (!senha)  { _fieldError('f-senha', 'err-senha', 'Senha obrigatória.'); return; }

        _setLoading('btn-login', true);

        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/login`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ re: ldap, pin: senha }),
                signal:  AbortSignal.timeout(8000),
            });
            const data = await res.json();

            if (!res.ok || !data.ok) {
                _fieldError('f-ldap',  'err-ldap',  ' ');
                _fieldError('f-senha', 'err-senha', data.error || 'LDAP ou senha incorretos.');
                _setLoading('btn-login', false, 'ENTRAR NO SISTEMA');
                return;
            }

            K11Auth.setToken(data.token);
            try { sessionStorage.setItem('k11_user', JSON.stringify({ re: ldap, nome: data.user.nome, role: data.user.role })); } catch {}

            if (data.user.role === 'super') {
                try { sessionStorage.setItem('k11_mode', 'ultra'); } catch {}
            }

            document.body.style.opacity = '0';
            document.body.style.transition = 'opacity 0.3s';
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 350);

        } catch (err) {
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

        // Valida tudo no cliente primeiro
        let hasError = false;
        const errs = [
            ['f-ldap',  'err-ldap',  _validateLdap(ldap)],
            ['f-nome',  'err-nome',  _validateNome(nome)],
            ['f-email', 'err-email', _validateEmail(email, nome)],
            ['f-senha', 'err-senha', _validateSenha(senha)],
        ];
        errs.forEach(([fId, eId, err]) => { if (err) { _fieldError(fId, eId, err); hasError = true; } });
        if (hasError) return;

        _setLoading('btn-register', true);

        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/register`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ ldap, nome, email, senha }),
                signal:  AbortSignal.timeout(10000),
            });
            const data = await res.json();

            if (!res.ok || !data.ok) {
                if (data.field) _fieldError(`f-${data.field}`, `err-${data.field}`, data.error);
                else _toast(data.error || 'Erro ao cadastrar.', 'danger');
                _setLoading('btn-register', false, 'ENVIAR CÓDIGO DE CONFIRMAÇÃO');
                return;
            }

            // Guarda ldap e email para a tela de confirmação
            _pendingLdap = ldap;
            try { sessionStorage.setItem('k11_pending_email', email); } catch {}
            try { sessionStorage.setItem('k11_pending_ldap', ldap); } catch {}

            _render('confirm');

        } catch (err) {
            _toast('Erro de conexão. Verifique sua internet.', 'danger');
            _setLoading('btn-register', false, 'ENVIAR CÓDIGO DE CONFIRMAÇÃO');
        }
    }

    async function _doConfirm() {
        const pin  = _getPinValue();
        const ldap = sessionStorage.getItem('k11_pending_ldap') || _pendingLdap;

        if (pin.length < 6) {
            _fieldError(null, 'err-pin', 'Digite todos os 6 dígitos.');
            return;
        }

        _setLoading('btn-confirm', true);

        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/confirm-pin`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ ldap, pin }),
                signal:  AbortSignal.timeout(8000),
            });
            const data = await res.json();

            if (!res.ok || !data.ok) {
                _fieldError(null, 'err-pin', data.error || 'Código incorreto.');
                // Shake nos inputs
                document.querySelectorAll('.pin-digit').forEach(d => {
                    d.classList.add('error');
                    setTimeout(() => d.classList.remove('error'), 400);
                });
                _setLoading('btn-confirm', false, 'CONFIRMAR CADASTRO');
                return;
            }

            // Sucesso — limpa pendentes e faz login
            clearInterval(_timerInterval);
            sessionStorage.removeItem('k11_pending_email');
            sessionStorage.removeItem('k11_pending_ldap');

            K11Auth.setToken(data.token);
            try { sessionStorage.setItem('k11_user', JSON.stringify({ re: ldap, nome: data.user.nome, role: 'op' })); } catch {}

            _toast('Cadastro confirmado! Bem-vindo! 🎉', 'success', 2000);

            setTimeout(() => {
                document.body.style.opacity = '0';
                document.body.style.transition = 'opacity 0.4s';
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 400);
            }, 1200);

        } catch (err) {
            _toast('Erro de conexão. Tente novamente.', 'danger');
            _setLoading('btn-confirm', false, 'CONFIRMAR CADASTRO');
        }
    }

    async function _doResend() {
        const ldap = sessionStorage.getItem('k11_pending_ldap') || _pendingLdap;
        const btn  = document.getElementById('btn-resend');
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

        try {
            const res  = await fetch(`${K11_SERVER_URL}/api/auth/resend-pin`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ ldap }),
                signal:  AbortSignal.timeout(8000),
            });
            const data = await res.json();

            if (data.ok) {
                _toast('Novo código enviado! ✅', 'success');
                _startTimer(900);
            } else {
                _toast(data.error || 'Erro ao reenviar.', 'danger');
            }
        } catch {
            _toast('Erro de conexão.', 'danger');
        } finally {
            setTimeout(() => {
                if (btn) { btn.disabled = false; btn.textContent = 'Reenviar código'; }
            }, 60000);
        }
    }

    // ── INIT ──────────────────────────────────────────────────

    function init() {
        // Injeta CSS
        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        // Cria root
        let root = document.getElementById('k11-auth-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'k11-auth-root';
            document.body.appendChild(root);
        }

        // Se já tiver JWT válido, vai direto pro dashboard
        if (typeof K11Auth !== 'undefined' && K11Auth.isAuthenticated()) {
            window.location.href = 'dashboard.html';
            return;
        }

        // Se tiver pendente de confirmação, vai para confirmação
        const pendingLdap = sessionStorage.getItem('k11_pending_ldap');
        if (pendingLdap && sessionStorage.getItem('k11_pending_email')) {
            _pendingLdap = pendingLdap;
            _render('confirm');
        } else {
            _render('login');
        }
    }

    return { init };

})();

// Auto-inicializa se houver #k11-auth-root no HTML
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('k11-auth-root') || document.body) K11AuthUI.init();
    });
} else {
    K11AuthUI.init();
}
