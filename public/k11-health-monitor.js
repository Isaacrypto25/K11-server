/**
 * K11 OMNI ELITE — FRONTEND HEALTH MONITOR
 * ════════════════════════════════════════════════
 * Envia heartbeat ao servidor a cada 5 segundos
 * Permite que o AI Supervisor detecte problemas no frontend
 *
 * INTEGRAÇÃO:
 * 1. Inclua este arquivo no dashboard.html
 * 2. Chama /api/supervisor/frontend-ping a cada 5s
 * 3. Servidor pode detectar:
 *    - Se APP.init() foi executado
 *    - Se K11Live.start() foi executado
 *    - Se há erros JavaScript
 *    - Se frontend está offline
 *
 * EXEMPLO:
 * <script src="k11-health-monitor.js"></script>
 */

'use strict';

const K11HealthMonitor = (() => {
    
    const config = {
        pingInterval: 5000,      // 5 segundos
        clientId: null,          // Gerado no startup
        serverUrl: null,         // Definido via init()
        enabled: true,
    };
    
    let intervalHandle = null;
    let lastErrorCount = 0;
    const errorLog = [];
    
    // ── INICIALIZAÇÃO ─────────────────────────────────────
    function init(options = {}) {
        config.serverUrl = options.serverUrl || window.location.origin;
        config.clientId = options.clientId || _generateClientId();
        config.enabled = options.enabled !== false;
        
        if (!config.enabled) {
            console.log('[K11 Health] Monitor desabilitado');
            return;
        }
        
        console.log('[K11 Health] Monitor iniciado (clientId: ' + config.clientId + ')');
        
        // Captura erros JavaScript
        _setupErrorCapture();
        
        // Inicia heartbeat
        _startHeartbeat();
    }
    
    // ── GERAÇÃO DE CLIENT ID ──────────────────────────────
    function _generateClientId() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let id = 'client_';
        for (let i = 0; i < 12; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }
    
    // ── CAPTURA DE ERROS ──────────────────────────────────
    function _setupErrorCapture() {
        // Erros JavaScript
        window.addEventListener('error', (event) => {
            const error = {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                timestamp: Date.now(),
            };
            errorLog.push(error);
            if (errorLog.length > 20) errorLog.shift();
            
            console.error('[K11 Health] Erro capturado:', error.message);
        });
        
        // Promise rejections não tratadas
        window.addEventListener('unhandledrejection', (event) => {
            const error = {
                message: String(event.reason),
                type: 'unhandledRejection',
                timestamp: Date.now(),
            };
            errorLog.push(error);
            if (errorLog.length > 20) errorLog.shift();
            
            console.error('[K11 Health] Promise rejection não tratada:', event.reason);
        });
    }
    
    // ── HEARTBEAT ─────────────────────────────────────────
    function _startHeartbeat() {
        if (intervalHandle) clearInterval(intervalHandle);
        
        // Primeiro ping imediatamente
        _sendHealthCheck();
        
        // Próximos pings a cada 5 segundos
        intervalHandle = setInterval(_sendHealthCheck, config.pingInterval);
    }
    
    function _sendHealthCheck() {
        if (!config.enabled || !config.serverUrl) return;
        
        const payload = {
            clientId: config.clientId,
            appInitialized: typeof APP !== 'undefined' && (APP._initialized || false),
            k11LiveStarted: typeof K11Live !== 'undefined' && (K11Live._started || false),
            readyState: document.readyState,
            errors: errorLog.slice(-5), // Últimos 5 erros
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
        };
        
        // Tenta enviar ao servidor
        fetch(config.serverUrl + '/api/supervisor/frontend-ping', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': _getAuthHeader(),
            },
            body: JSON.stringify(payload),
        })
        .then(res => res.json())
        .then(data => {
            if (!data.ok) {
                console.warn('[K11 Health] Ping falhou:', data.message);
            }
        })
        .catch(err => {
            console.debug('[K11 Health] Falha ao enviar ping:', err.message);
        });
    }
    
    function _getAuthHeader() {
        // Tenta obter JWT
        try {
            const token = sessionStorage.getItem('k11_jwt');
            if (token) return 'Bearer ' + token;
        } catch (_) {}
        return '';
    }
    
    // ── PUBLIC API ────────────────────────────────────────
    function stop() {
        if (intervalHandle) {
            clearInterval(intervalHandle);
            intervalHandle = null;
        }
        console.log('[K11 Health] Monitor parado');
    }
    
    function getStatus() {
        return {
            clientId: config.clientId,
            enabled: config.enabled,
            appInitialized: typeof APP !== 'undefined' && (APP._initialized || false),
            k11LiveStarted: typeof K11Live !== 'undefined' && (K11Live._started || false),
            errorCount: errorLog.length,
            readyState: document.readyState,
            lastErrors: errorLog.slice(-3),
        };
    }
    
    function getErrors() {
        return errorLog;
    }
    
    function clearErrors() {
        errorLog.length = 0;
    }
    
    // ── AUTO-INIT se já estiver pronto ──────────────────
    // Se este arquivo for carregado após o DOM estar pronto
    if (document.readyState !== 'loading') {
        setTimeout(() => {
            init();
        }, 100);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                init();
            }, 100);
        });
    }
    
    // ── EXPORTS ─────────────────────────────────────────
    return {
        init,
        stop,
        getStatus,
        getErrors,
        clearErrors,
    };
})();

// Expõe globalmente
window.K11HealthMonitor = K11HealthMonitor;

// Log inicial
console.log('[K11 Health] Frontend Health Monitor carregado');
