/**
 * K11 OMNI ELITE — CONFIG (Frontend)
 * ════════════════════════════════════
 * PRIMEIRO arquivo a ser carregado.
 * Define: K11_SERVER_URL, K11Auth, FETCH_TIMEOUT_MS, brl()
 *
 * ⚠️  Edite apenas K11_SERVER_URL para apontar ao seu deploy Railway.
 *     Todos os outros valores são gerados dinamicamente.
 */

'use strict';

// ── URL DO SERVIDOR ───────────────────────────────────────────
// Em produção: sua URL do Railway (sem barra no final)
// Em dev local: http://localhost:3000
const K11_SERVER_URL = (() => {
    // 1. Variável injetada pelo servidor (Railway)
    if (typeof __K11_SERVER_URL__ !== 'undefined' && __K11_SERVER_URL__) return __K11_SERVER_URL__;
    // 2. Mesma origem (frontend servido pelo próprio backend)
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return window.location.origin;
    }
    // 3. Dev local
    return 'http://localhost:3000';
})();

// ── TIMEOUT DE FETCH ──────────────────────────────────────────
const FETCH_TIMEOUT_MS = 15000;

// ── FORMATADOR DE MOEDA ───────────────────────────────────────
function brl(value, decimals = 2) {
    const n = parseFloat(value) || 0;
    return n.toLocaleString('pt-BR', {
        style:                 'currency',
        currency:              'BRL',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

// ── FORMATADOR DE NÚMERO ──────────────────────────────────────
function num(value, decimals = 1) {
    return (parseFloat(value) || 0).toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

// ── FORMATADOR DE DATA ────────────────────────────────────────
function fmtDate(isoStr) {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── AUTH: gerenciamento de JWT em sessionStorage ──────────────
const K11Auth = (() => {
    const TOKEN_KEY = 'k11_jwt';
    const USER_KEY  = 'k11_user';

    return {
        setToken(token, user = null) {
            sessionStorage.setItem(TOKEN_KEY, token);
            if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
        },

        getToken() {
            return sessionStorage.getItem(TOKEN_KEY) || null;
        },

        getUser() {
            try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
        },

        isAuthenticated() {
            const token = this.getToken();
            if (!token) return false;
            // Verifica expiração local (sem validação de assinatura)
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                return (payload.exp * 1000) > Date.now();
            } catch { return false; }
        },

        clearToken() {
            sessionStorage.removeItem(TOKEN_KEY);
            sessionStorage.removeItem(USER_KEY);
        },

        // Bearer header para fetch
        headers(extra = {}) {
            const token = this.getToken();
            return {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...extra,
            };
        },

        // Wrapper fetch com auth + timeout + refresh automático
        async fetch(path, opts = {}) {
            const url = `${K11_SERVER_URL}${path}`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

            try {
                const res = await fetch(url, {
                    ...opts,
                    signal:  controller.signal,
                    headers: { ...K11Auth.headers(), ...(opts.headers || {}) },
                });
                clearTimeout(timer);
                if (res.status === 401) {
                    K11Auth.clearToken();
                    window.location.reload();
                    return null;
                }
                return res;
            } catch (e) {
                clearTimeout(timer);
                throw e;
            }
        },
    };
})();

// ── VERSÃO / BUILD ────────────────────────────────────────────
const K11_VERSION = '2.0.0';
const K11_BUILD   = '20260317';

// ── FEATURE FLAGS ─────────────────────────────────────────────
const K11_FLAGS = {
    enableVoice:      true,
    enableOrcamento:  true,
    enableSkills:     true,
    enableMissions:   true,
    enableFloatAI:    true,
    enableLivePanel:  true,
};

console.log(`%cK11 OMNI ELITE v${K11_VERSION}`, 'color:#FF8C00;font-weight:900;font-size:14px');
console.log(`%cServidor: ${K11_SERVER_URL}`, 'color:#5A6480;font-size:11px');
