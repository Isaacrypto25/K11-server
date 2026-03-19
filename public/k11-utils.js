/**
 * K11 OMNI ELITE — UTILS
 * ════════════════════════
 * Utilitários globais compartilhados por todos os módulos frontend.
 * DEVE ser carregado logo após k11-config.js, antes de qualquer outro script.
 *
 * Exporta globals:
 *   esc(s)                   → sanitiza HTML
 *   esc_(s)                  → alias de esc (compatibilidade)
 *   debounce(fn, ms)         → throttle de função
 *   pct(val, total)          → percentual formatado
 *   clamp(n, min, max)       → limita valor
 *   formatDate(iso)          → dd/mm/aaaa
 *   formatDateTime(iso)      → dd/mm/aaaa hh:mm
 *   timeAgo(iso)             → "há 3 horas"
 *   truncate(str, len)       → "lorem ipsu…"
 *   sleep(ms)                → Promise delay
 *   copyToClipboard(text)    → copia para área de transferência
 *   DEBOUNCE_DELAY_MS        → 280 (constante)
 *   TOAST_DURATION_MS        → 3200 (constante)
 */

'use strict';

// ── CONSTANTES ────────────────────────────────────────────────
const DEBOUNCE_DELAY_MS = 280;
const TOAST_DURATION_MS = 3200;

// ── SANITIZAÇÃO HTML ──────────────────────────────────────────
/**
 * Escapa caracteres especiais HTML para prevenir XSS.
 * @param {*} s - Valor a escapar
 * @returns {string}
 */
function esc(s) {
    return String(s ?? '')
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
}

// Alias mantido para compatibilidade com módulos que usam esc_()
const esc_ = esc;

// ── DEBOUNCE ──────────────────────────────────────────────────
/**
 * Retorna uma versão "debounced" de fn: só executa após ms ms de silêncio.
 * @param {Function} fn
 * @param {number}   ms
 * @returns {Function}
 */
function debounce(fn, ms = DEBOUNCE_DELAY_MS) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

// ── PERCENTUAL ────────────────────────────────────────────────
/**
 * Calcula percentual seguro (evita divisão por zero).
 * @param {number} val
 * @param {number} total
 * @param {number} decimals
 * @returns {number}
 */
function pct(val, total, decimals = 1) {
    if (!total) return 0;
    return parseFloat(((val / total) * 100).toFixed(decimals));
}

// ── CLAMP ─────────────────────────────────────────────────────
function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

// ── FORMATAÇÃO DE DATAS ───────────────────────────────────────
function formatDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('pt-BR', {
            day:   '2-digit',
            month: '2-digit',
            year:  'numeric',
        });
    } catch { return '—'; }
}

function formatDateTime(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('pt-BR', {
            day:    '2-digit',
            month:  '2-digit',
            year:   'numeric',
            hour:   '2-digit',
            minute: '2-digit',
        });
    } catch { return '—'; }
}

function timeAgo(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const min  = Math.floor(diff / 60000);
    if (min < 1)   return 'agora mesmo';
    if (min < 60)  return `há ${min} min`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24)  return `há ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7)  return `há ${days}d`;
    return formatDate(iso);
}

// ── TEXTO ─────────────────────────────────────────────────────
function truncate(str, len = 40) {
    const s = String(str ?? '');
    return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

// ── ASYNC UTILS ───────────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── CLIPBOARD ─────────────────────────────────────────────────
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(String(text));
        return true;
    } catch {
        // Fallback para navegadores sem Clipboard API
        const el = document.createElement('textarea');
        el.value = String(text);
        el.style.position = 'fixed';
        el.style.opacity  = '0';
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(el);
        return ok;
    }
}

// ── NÚMERO COMPACTO ───────────────────────────────────────────
/**
 * Formata número grande de forma compacta: 1500 → "1,5K", 1200000 → "1,2M"
 */
function compact(n) {
    const v = parseFloat(n) || 0;
    if (v >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
    if (v >= 1e3) return (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'K';
    return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

// ── COR POR PERCENTUAL ────────────────────────────────────────
/**
 * Retorna cor CSS baseada em thresholds: verde ≥ 80, amarelo ≥ 50, vermelho < 50
 */
function colorByPct(value, thresholdHigh = 80, thresholdMid = 50) {
    const v = parseFloat(value) || 0;
    if (v >= thresholdHigh) return 'var(--success)';
    if (v >= thresholdMid)  return 'var(--warning)';
    return 'var(--danger)';
}

// ── UUID SIMPLES ──────────────────────────────────────────────
function uid() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11)
        .replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
}

// ── DEEP MERGE ────────────────────────────────────────────────
function deepMerge(target, source) {
    const out = Object.assign({}, target);
    for (const k of Object.keys(source)) {
        if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
            out[k] = deepMerge(out[k] || {}, source[k]);
        } else {
            out[k] = source[k];
        }
    }
    return out;
}

// ── SAFE FLOAT (global — também definido localmente em k11-brain-auxiliar) ──
function safeFloat(v, fallback = 0) {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return isNaN(n) ? fallback : n;
}

// ── CAPACIDADE DE POSIÇÃO DE ESTOQUE ─────────────────────────
// Extrai capacidade máxima da descrição do produto (ex: "CAIXA C/12 UN" → 12)
function getCapacidade(desc) {
    if (!desc) return 1;
    const m = String(desc).match(/\bC[\/\s]?(\d+)\s*(?:UN|PC|PCS|KG)?\b/i)
        || String(desc).match(/\b(\d+)\s*(?:UN|PCS|PC)\b/i);
    return m ? Math.max(1, parseInt(m[1])) : 1;
}

// ── EVENT BUS — pub/sub global mínimo ────────────────────────
// [FIX A] EventBus não estava definido em nenhum arquivo.
// k11-processors.js chamava EventBus.emit() sem guard → ReferenceError
// dentro de processarEstoque() → capturado pelo catch do init() → toast de erro.
const EventBus = (() => {
    const _listeners = {};
    return {
        on(event, fn) {
            if (!_listeners[event]) _listeners[event] = [];
            _listeners[event].push(fn);
        },
        off(event, fn) {
            _listeners[event] = (_listeners[event] || []).filter(f => f !== fn);
        },
        emit(event, data) {
            (_listeners[event] || []).forEach(fn => {
                try { fn(data); } catch (e) { console.warn('[EventBus]', event, e); }
            });
        },
    };
})();
