/**
 * K11 OMNI ELITE — NUCLEAR BOOT MINIMAL
 * ════════════════════════════════════════════════════════════════
 * Versão MINIMALISTA - Apenas o essencial para garantir APP.init()
 * 
 * Cola isto no FINAL do seu k11-app.js original (antes de window.APP = APP)
 * OU use este arquivo completo substituindo k11-app.js
 */

'use strict';

// ════════════════════════════════════════════════════════════════
// 🔥 GARANTIR QUE APP.init() SEJA CHAMADO
// ════════════════════════════════════════════════════════════════

(function _nuclearInit() {
    console.log('[K11 NUCLEAR] Iniciando garantia de APP.init()...');
    
    let tentativas = 0;
    let maxTentativas = 50; // 5 segundos com polling a cada 100ms
    
    const intervalo = setInterval(() => {
        tentativas++;
        
        // Verificar se tudo que é necessário existe
        const engineStatus = document.getElementById('engine-status');
        const appExiste = typeof APP !== 'undefined';
        const initExiste = appExiste && typeof APP.init === 'function';
        const jaSeLlamo = appExiste && APP._initialized;
        
        // Log detalhado a cada 10 tentativas
        if (tentativas % 10 === 0) {
            console.log(`[K11 NUCLEAR] Tentativa ${tentativas}/50`, {
                'engine-status exists': !!engineStatus,
                'APP exists': appExiste,
                'APP.init exists': initExiste,
                'Already initialized': jaSeLlamo,
                readyState: document.readyState,
            });
        }
        
        // Se algo não existe ainda, continua tentando
        if (!engineStatus || !appExiste || !initExiste) {
            if (tentativas >= maxTentativas) {
                console.error('[K11 NUCLEAR] ❌ FALHA: Pré-requisitos não foram atendidos após 5s', {
                    'engine-status': !!engineStatus,
                    'APP': appExiste,
                    'APP.init': initExiste,
                });
                clearInterval(intervalo);
            }
            return;
        }
        
        // Se já foi inicializado, para de tentar
        if (jaSeLlamo) {
            console.log('[K11 NUCLEAR] ✅ APP já foi inicializado');
            clearInterval(intervalo);
            return;
        }
        
        // ✅ TUDO PRONTO! Chama APP.init()
        clearInterval(intervalo);
        
        console.log(`[K11 NUCLEAR] 🔥 EXECUTANDO APP.init() na tentativa ${tentativas}`);
        
        try {
            APP._initialized = true;
            APP.init();
            console.log('[K11 NUCLEAR] ✅ APP.init() executado com sucesso!');
        } catch (erro) {
            console.error('[K11 NUCLEAR] ❌ Erro ao executar APP.init():', erro);
        }
        
    }, 100); // Verifica a cada 100ms
    
    // Timeout de segurança
    setTimeout(() => {
        clearInterval(intervalo);
        if (typeof APP === 'undefined' || !APP._initialized) {
            console.error('[K11 NUCLEAR] ⏱️ TIMEOUT de 5s - APP.init() não foi executado!');
        }
    }, 5000);
})();

// ════════════════════════════════════════════════════════════════
// 🔥 GARANTIR QUE K11Live.start() SEJA CHAMADO (secondary)
// ════════════════════════════════════════════════════════════════

(function _k11LiveInit() {
    console.log('[K11 NUCLEAR] Iniciando garantia de K11Live.start()...');
    
    let tentativas = 0;
    let maxTentativas = 20; // 2 segundos com polling a cada 100ms
    
    const intervalo = setInterval(() => {
        tentativas++;
        
        const liveExiste = typeof K11Live !== 'undefined';
        const startExiste = liveExiste && typeof K11Live.start === 'function';
        const jaSeLlamo = liveExiste && K11Live._started;
        
        if (!liveExiste || !startExiste) {
            if (tentativas >= maxTentativas) {
                console.warn('[K11 NUCLEAR] K11Live não carregou em 2s (pode estar ok)');
                clearInterval(intervalo);
            }
            return;
        }
        
        if (jaSeLlamo) {
            console.log('[K11 NUCLEAR] ✅ K11Live já foi iniciado');
            clearInterval(intervalo);
            return;
        }
        
        clearInterval(intervalo);
        
        console.log(`[K11 NUCLEAR] 🔥 EXECUTANDO K11Live.start()`);
        
        try {
            K11Live._started = true;
            K11Live.start();
            console.log('[K11 NUCLEAR] ✅ K11Live.start() executado com sucesso!');
            
            // Pede permissão de notificação após 3s
            setTimeout(() => {
                if (typeof K11Live.requestNotificationPermission === 'function') {
                    K11Live.requestNotificationPermission();
                }
            }, 3000);
            
        } catch (erro) {
            console.error('[K11 NUCLEAR] ❌ Erro ao executar K11Live.start():', erro);
        }
        
    }, 100);
    
    setTimeout(() => {
        clearInterval(intervalo);
    }, 2000);
})();

console.log('[K11 NUCLEAR] ✅ Sistema de inicialização nuclear ativo');
