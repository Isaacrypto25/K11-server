'use strict';

/**
 * K11 OMNI ELITE — Audit Log Middleware
 * ══════════════════════════════════════
 * Registra todas as mutações (POST/PUT/DELETE) com:
 *   - usuário, role, IP
 *   - rota, método, body resumido
 *   - timestamp
 * Persiste no Supabase (tabela audit_log) + buffer em memória.
 */

const datastore = require('../services/datastore');
const logger    = require('../services/logger');

const _buffer = [];  // fallback em memória
const MAX_BUFFER = 1000;

const SKIP_PATHS = ['/health', '/api/status', '/api/system/log', '/api/system/stream'];
const SKIP_METHODS = ['GET', 'OPTIONS', 'HEAD'];

function _summarize(body) {
    if (!body || typeof body !== 'object') return null;
    const safe = {};
    const SENSITIVE = ['pin', 'senha', 'password', 'token', 'secret', 'key'];
    for (const [k, v] of Object.entries(body)) {
        if (SENSITIVE.some(s => k.toLowerCase().includes(s))) {
            safe[k] = '[REDACTED]';
        } else if (typeof v === 'object') {
            safe[k] = '[object]';
        } else if (String(v).length > 200) {
            safe[k] = String(v).slice(0, 200) + '…';
        } else {
            safe[k] = v;
        }
    }
    return safe;
}

async function _persist(entry) {
    _buffer.push(entry);
    if (_buffer.length > MAX_BUFFER) _buffer.shift();

    const sb = datastore.supabase;
    if (!sb) return;

    try {
        await sb.from('audit_log').insert({
            user_id:    entry.userId,
            user_role:  entry.role,
            user_ip:    entry.ip,
            method:     entry.method,
            path:       entry.path,
            body_summary: entry.body ? JSON.stringify(entry.body) : null,
            status_code:  entry.statusCode,
            duration_ms:  entry.durationMs,
            created_at:   entry.ts,
        });
    } catch (e) {
        // Falha silenciosa — audit log não pode quebrar a requisição
        logger.debug('AUDIT', `persist falhou: ${e.message}`);
    }
}

function auditLog(req, res, next) {
    if (SKIP_METHODS.includes(req.method)) return next();
    if (SKIP_PATHS.some(p => req.path.startsWith(p))) return next();

    const start = Date.now();
    const ts    = new Date().toISOString();

    res.on('finish', () => {
        const entry = {
            ts,
            userId:    req.user?.re || req.user?.email || req.user?.id || 'anon',
            role:      req.user?.role || 'unknown',
            ip:        req.ip || req.connection?.remoteAddress || 'unknown',
            method:    req.method,
            path:      req.path,
            body:      _summarize(req.body),
            statusCode:res.statusCode,
            durationMs:Date.now() - start,
        };

        // Log apenas mutações relevantes
        if (res.statusCode < 500) {
            _persist(entry).catch(() => {});
        }
    });

    next();
}

auditLog.getLogs = (limit = 100) => _buffer.slice(-limit).reverse();

module.exports = auditLog;
