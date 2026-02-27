/**
 * K11 OMNI ELITE — CONFIGURAÇÕES E CONSTANTES
 * ═══════════════════════════════════════════
 * Centraliza todos os valores configuráveis da aplicação.
 */

'use strict';

// ─── TUNÁVEIS ─────────────────────────────────────────────────
const FETCH_TIMEOUT_MS  = 8000;
const FETCH_RETRY       = 1;
const DEBOUNCE_DELAY_MS = 280;
const ANIM_DURATION_MS  = 1100;
const TOAST_DURATION_MS = 3200;

// ─── SERVIDOR K11 OMNI ────────────────────────────────────────
// URL do backend no Railway
const K11_SERVER_URL   = 'https://web-production-8c4b.up.railway.app';
const K11_SERVER_TOKEN = 'aa62b3d9df5f32d18ccb00ca933be51da8420ffe27a7b7a5a7f87aab49472175';

// ─── GOOGLE CLOUD TTS ─────────────────────────────────────────
const K11_GOOGLE_TTS_KEY   = 'SUA_CHAVE_AQUI';
const K11_GOOGLE_TTS_VOICE = 'pt-BR-Neural2-C';

// ─── GROQ AI ──────────────────────────────────────────────────
const K11_GROQ_API_KEY = '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';

// ─── USUÁRIOS VÁLIDOS ─────────────────────────────────────────
const USUARIOS_VALIDOS = {
    '11111': { pin: '1234', nome: 'Supervisor K11', role: 'super' },
    '22222': { pin: '2222', nome: 'Operador A',     role: 'op'   },
    '33333': { pin: '3333', nome: 'Operador B',     role: 'op'   },
};

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
