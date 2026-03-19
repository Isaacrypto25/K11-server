'use strict';

/**
 * K11 OMNI ELITE — Sentry Integration
 * ═════════════════════════════════════
 * Inicializa Sentry para error tracking em produção.
 * Fallback gracioso se SENTRY_DSN não estiver configurado.
 */

let _sentry = null;
let _initialized = false;

function init() {
    if (_initialized) return;
    _initialized = true;

    const dsn = process.env.SENTRY_DSN;
    if (!dsn || dsn.includes('xxxxx')) {
        console.log('[SENTRY] DSN não configurado — error tracking desativado');
        return;
    }

    try {
        const Sentry = require('@sentry/node');
        Sentry.init({
            dsn,
            environment:  process.env.NODE_ENV || 'development',
            release:      `k11-omni@2.0.0`,
            tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
            integrations: [
                new Sentry.Integrations.Http({ tracing: true }),
                new Sentry.Integrations.Express({ app: global._k11App }),
            ],
            beforeSend(event) {
                // Remove dados sensíveis
                if (event.request?.data) {
                    const safe = { ...event.request.data };
                    ['pin', 'senha', 'password', 'token', 'secret'].forEach(k => {
                        if (k in safe) safe[k] = '[REDACTED]';
                    });
                    event.request.data = safe;
                }
                return event;
            },
        });
        _sentry = Sentry;
        console.log('[SENTRY] ✅ Error tracking ativo');
    } catch (e) {
        console.warn('[SENTRY] Falha ao inicializar:', e.message);
    }
}

function captureException(err, context = {}) {
    if (!_sentry) return;
    _sentry.withScope(scope => {
        Object.entries(context).forEach(([k, v]) => scope.setExtra(k, v));
        _sentry.captureException(err);
    });
}

function captureMessage(msg, level = 'info') {
    if (!_sentry) return;
    _sentry.captureMessage(msg, level);
}

function setUser(user) {
    if (!_sentry || !user) return;
    _sentry.setUser({ id: user.re || user.email, role: user.role });
}

function requestHandler() {
    if (!_sentry) return (req, res, next) => next();
    return _sentry.Handlers.requestHandler();
}

function errorHandler() {
    if (!_sentry) return (err, req, res, next) => next(err);
    return _sentry.Handlers.errorHandler();
}

module.exports = { init, captureException, captureMessage, setUser, requestHandler, errorHandler };
