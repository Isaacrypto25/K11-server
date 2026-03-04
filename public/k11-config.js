/**
 * K11 OMNI ELITE — CONFIGURAÇÕES PÚBLICAS
 * ════════════════════════════════════════
 * ⚠ ESTE ARQUIVO É PÚBLICO — nunca coloque credenciais aqui.
 * Tokens, senhas e chaves de API vivem nas variáveis de ambiente do Railway.
 *
 * O frontend agora autentica via /api/auth/login (JWT).
 * O servidor valida as credenciais e retorna um token seguro.
 */

'use strict';

// ─── TUNÁVEIS (sem segredos) ──────────────────────────────────
const FETCH_TIMEOUT_MS  = 20000; // aumentado: Supabase cold start pode levar ~10-12s
const FETCH_RETRY       = 1;
const DEBOUNCE_DELAY_MS = 280;
const ANIM_DURATION_MS  = 1100;
const TOAST_DURATION_MS = 3200;

// ─── SERVIDOR K11 OMNI ────────────────────────────────────────
// Apenas a URL base — o token JWT vem do login, não fica hardcoded
const K11_SERVER_URL = 'https://web-production-8c4b.up.railway.app';

// ─── GOOGLE CLOUD TTS ─────────────────────────────────────────
// A chave TTS deve ser movida para o servidor (Railway)
// O frontend chama /api/tts e o servidor usa a chave internamente
const K11_GOOGLE_TTS_VOICE = 'pt-BR-Neural2-C';

// ─── GROQ AI ──────────────────────────────────────────────────
// ─── GROQ AI ──────────────────────────────────────────────────
// ⚠ CHAVE REMOVIDA DESTE ARQUIVO — use process.env.GROQ_API_KEY no Railway.
// O frontend NÃO precisa da chave Groq. Toda chamada à IA passa pelo servidor.
const K11_GROQ_API_KEY = '';

// ─── REGRAS DE CAPACIDADE DO PKL ──────────────────────────────
const REGRAS_CAPACIDADE = {
    tubo: {
        '20MM': 2000, '25MM': 2000, '32MM': 300,
        '40MM': 100,  '50MM': 100,  '75MM': 20,
        '85MM': 20,   '110MM': 10,
    },
    conexao: {
        '20MM': 3000, '25MM': 3000, '32MM': 100,
        '40MM': 85,   '50MM': 60,
    },
};
const CAPACIDADE_PADRAO = 50;

// ─── HELPERS DE AUTH (JWT no sessionStorage) ──────────────────
const K11Auth = {
    _KEY: 'k11_jwt',

    getToken() {
        try { return sessionStorage.getItem(this._KEY); } catch { return null; }
    },

    setToken(token) {
        try { sessionStorage.setItem(this._KEY, token); } catch {}
    },

    clearToken() {
        try {
            sessionStorage.removeItem(this._KEY);
            sessionStorage.removeItem('k11_user');
            sessionStorage.removeItem('k11_mode');
        } catch {}
    },

    isAuthenticated() {
        const token = this.getToken();
        if (!token) return false;
        // Verifica expiração do payload JWT (sem validar assinatura — isso é do servidor)
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.exp * 1000 > Date.now();
        } catch {
            return false;
        }
    },

    getUser() {
        try {
            const raw = sessionStorage.getItem('k11_user');
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    },
};
