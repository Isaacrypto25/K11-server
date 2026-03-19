'use strict';

/**
 * K11 OMNI ELITE — Logger Service
 * Níveis: debug < info < warn < error < critical
 * Armazena os últimos N logs em memória para streaming SSE
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, critical: 4 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];
const MAX_IN_MEMORY = 500;

const _logs = [];
const _stats = { debug: 0, info: 0, warn: 0, error: 0, critical: 0 };
const _sseClients = new Set();

function _fmt(level, module, message, meta) {
    const ts = new Date().toISOString();
    const entry = {
        ts,
        level,
        module: module || 'SYSTEM',
        message: String(message),
        meta: meta || null,
    };
    return entry;
}

function _emit(entry) {
    // Guarda na memória circular
    _logs.push(entry);
    if (_logs.length > MAX_IN_MEMORY) _logs.shift();
    _stats[entry.level] = (_stats[entry.level] || 0) + 1;

    // Envia para SSE clients
    if (_sseClients.size > 0) {
        const payload = `data: ${JSON.stringify(entry)}\n\n`;
        for (const res of _sseClients) {
            try { res.write(payload); } catch (_) { _sseClients.delete(res); }
        }
    }

    // Imprime no console
    const icons = { debug: '🔍', info: '✅', warn: '⚠️ ', error: '❌', critical: '💥' };
    const icon = icons[entry.level] || '  ';
    const meta = entry.meta ? ' ' + JSON.stringify(entry.meta) : '';
    console.log(`${icon} [${entry.ts}] [${entry.module}] ${entry.message}${meta}`);
}

function log(level, module, message, meta) {
    if (LOG_LEVELS[level] < CURRENT_LEVEL) return;
    _emit(_fmt(level, module, message, meta));
}

const logger = {
    debug:    (mod, msg, meta) => log('debug',    mod, msg, meta),
    info:     (mod, msg, meta) => log('info',     mod, msg, meta),
    warn:     (mod, msg, meta) => log('warn',     mod, msg, meta),
    error:    (mod, msg, meta) => log('error',    mod, msg, meta),
    critical: (mod, msg, meta) => log('critical', mod, msg, meta),

    /** Últimos N logs em memória */
    getLogs(limit = 100) {
        return _logs.slice(-limit);
    },

    /** Estatísticas por nível */
    getStats() {
        return { ..._stats, total: _logs.length };
    },

    /** Registra um SSE response para streaming de logs */
    addSSEClient(res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
        _sseClients.add(res);
        // Envia últimos 50 logs como histórico
        const history = _logs.slice(-50);
        for (const entry of history) {
            try { res.write(`data: ${JSON.stringify(entry)}\n\n`); } catch (_) {}
        }
        res.on('close', () => _sseClients.delete(res));
    },
};

module.exports = logger;
