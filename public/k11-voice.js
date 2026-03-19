/**
 * K11 OMNI ELITE — K11Voice (Interface Principal de Voz)
 * ═══════════════════════════════════════════════════════
 * Wrapper unificado sobre K11KeyVoice (TTS) e K11VoiceID (reconhecimento).
 * Expõe a interface que k11-float-ai.js e k11-brain-auxiliar.js esperam:
 *
 *   K11Voice.open()          → abre o painel de voz
 *   K11Voice.speak(text)     → fala o texto
 *   K11Voice.stop()          → para a reprodução
 *   K11Voice.isReady()       → true se TTS configurado
 *   K11Voice.listen(onResult)→ ativa reconhecimento de fala (Web Speech)
 *   K11Voice.panel           → referência ao painel visual
 *
 * Depende de: k11-config.js, k11-utils.js
 * Carregado APÓS k11-voice-id.js e k11-key-voice.js
 */

'use strict';

const K11Voice = (() => {

    // ── ESTADO ─────────────────────────────────────────────────
    let _panelOpen    = false;
    let _recognition  = null;
    let _listening    = false;
    let _onSpeechEnd  = null;

    // ── PANEL HTML ──────────────────────────────────────────────
    const PANEL_ID = 'k11-voice-panel';

    function _ensurePanel() {
        if (document.getElementById(PANEL_ID)) return;

        const panel = document.createElement('div');
        panel.id    = PANEL_ID;
        panel.style.cssText = `
            position:fixed;inset:0;z-index:8888;display:none;
            align-items:flex-end;justify-content:center;
            background:rgba(0,0,0,.6);backdrop-filter:blur(6px);
        `;
        panel.innerHTML = `
        <div id="${PANEL_ID}-inner" style="
            background:var(--card-bg,#0c0e18);border-radius:20px 20px 0 0;
            padding:24px 20px 32px;width:100%;max-width:480px;
            border:1px solid var(--border-mid,#222540);border-bottom:none;
            transform:translateY(100%);transition:transform .32s cubic-bezier(.34,1.56,.64,1);
        ">
            <!-- Handle -->
            <div style="width:40px;height:4px;border-radius:2px;background:var(--border-bright,#2d3155);margin:0 auto 20px"></div>

            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
                <div>
                    <div style="font-size:16px;font-weight:800;color:var(--text-main,#EDF0F7)">🎙️ Assistente de Voz</div>
                    <div id="k11v-status" style="font-size:11px;color:var(--text-muted,#5A6480);margin-top:3px">Pronto</div>
                </div>
                <button onclick="K11Voice.close()" style="
                    background:var(--border,#191c2e);border:none;border-radius:50%;
                    width:32px;height:32px;cursor:pointer;color:var(--text-soft,#B0B8CC);
                    font-size:16px;display:flex;align-items:center;justify-content:center;
                ">✕</button>
            </div>

            <!-- Input de texto -->
            <div style="display:flex;gap:8px;margin-bottom:12px">
                <input id="k11v-text-input" placeholder="Digite ou fale um comando…" style="
                    flex:1;background:var(--bg2,#080a12);border:1px solid var(--border-mid,#222540);
                    border-radius:10px;padding:12px 14px;color:var(--text-main,#EDF0F7);
                    font-size:14px;outline:none;font-family:inherit;
                " onkeydown="if(event.key==='Enter')K11Voice._sendText()">
                <button onclick="K11Voice._sendText()" style="
                    background:var(--primary,#FF8C00);border:none;border-radius:10px;
                    padding:12px 16px;cursor:pointer;font-weight:700;font-size:13px;
                    color:#000;white-space:nowrap;
                ">Enviar</button>
            </div>

            <!-- Botão de microfone -->
            <button id="k11v-mic-btn" onclick="K11Voice._toggleListen()" style="
                width:100%;padding:14px;border-radius:12px;border:none;cursor:pointer;
                background:var(--primary-dim,rgba(255,140,0,.12));
                color:var(--primary,#FF8C00);font-weight:700;font-size:14px;
                border:1px solid var(--border-glow,rgba(255,140,0,.2));
                transition:all .2s;
            ">🎤 Segurar para falar</button>

            <!-- Última resposta -->
            <div id="k11v-response" style="
                margin-top:14px;padding:12px;border-radius:10px;
                background:var(--bg2,#080a12);border:1px solid var(--border,#191c2e);
                font-size:13px;color:var(--text-soft,#B0B8CC);min-height:48px;
                line-height:1.5;display:none;
            "></div>
        </div>`;

        panel.addEventListener('click', e => { if (e.target === panel) K11Voice.close(); });
        document.body.appendChild(panel);
    }

    // ── OPEN / CLOSE ─────────────────────────────────────────────
    function open() {
        _ensurePanel();
        const panel = document.getElementById(PANEL_ID);
        const inner = document.getElementById(`${PANEL_ID}-inner`);
        if (!panel || !inner) return;
        panel.style.display = 'flex';
        requestAnimationFrame(() => {
            requestAnimationFrame(() => { inner.style.transform = 'translateY(0)'; });
        });
        _panelOpen = true;
        // Foca no input de texto
        setTimeout(() => {
            document.getElementById('k11v-text-input')?.focus();
        }, 350);
    }

    function close() {
        const panel = document.getElementById(PANEL_ID);
        const inner = document.getElementById(`${PANEL_ID}-inner`);
        if (!panel || !inner) return;
        inner.style.transform = 'translateY(100%)';
        setTimeout(() => { panel.style.display = 'none'; }, 340);
        _panelOpen = false;
        _stopListen();
    }

    // ── TTS: falar texto ─────────────────────────────────────────
    function speak(text) {
        if (!text) return;
        // Delega para K11KeyVoice se disponível
        if (typeof K11KeyVoice !== 'undefined' && K11KeyVoice.speak) {
            return K11KeyVoice.speak(text);
        }
        // Delega para K11VoiceID se disponível
        if (typeof K11VoiceID !== 'undefined' && K11VoiceID.speak) {
            return K11VoiceID.speak(text);
        }
        // Fallback: Web Speech API
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utt  = new SpeechSynthesisUtterance(text);
            utt.lang   = 'pt-BR';
            utt.rate   = 1.05;
            utt.pitch  = 1.0;
            utt.onend  = () => { if (_onSpeechEnd) _onSpeechEnd(); };
            window.speechSynthesis.speak(utt);
        }
    }

    function stop() {
        if (typeof K11KeyVoice !== 'undefined' && K11KeyVoice.stop) K11KeyVoice.stop();
        if (typeof K11VoiceID  !== 'undefined' && K11VoiceID.stop)  K11VoiceID.stop();
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }

    function isReady() {
        if (typeof K11KeyVoice !== 'undefined' && K11KeyVoice.isReady?.()) return true;
        if (typeof K11VoiceID  !== 'undefined' && K11VoiceID.isReady?.())  return true;
        return 'speechSynthesis' in window;
    }

    function onSpeechEnd(cb) { _onSpeechEnd = cb; }

    // ── RECONHECIMENTO DE FALA (Web Speech API) ──────────────────
    function listen(onResult) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn('[K11Voice] Web Speech API não suportada');
            return false;
        }
        _recognition = new SpeechRecognition();
        _recognition.lang        = 'pt-BR';
        _recognition.interimResults = false;
        _recognition.maxAlternatives = 1;
        _recognition.onresult = e => {
            const transcript = e.results[0][0].transcript;
            if (onResult) onResult(transcript);
        };
        _recognition.onerror = e => console.warn('[K11Voice] Erro speech:', e.error);
        _recognition.onend   = () => { _listening = false; };
        _recognition.start();
        _listening = true;
        return true;
    }

    function _stopListen() {
        if (_recognition) { try { _recognition.stop(); } catch (_) {} }
        _listening = false;
    }

    function _toggleListen() {
        const btn    = document.getElementById('k11v-mic-btn');
        const status = document.getElementById('k11v-status');
        if (_listening) {
            _stopListen();
            if (btn)    btn.style.background = 'var(--primary-dim,rgba(255,140,0,.12))';
            if (status) status.textContent = 'Pronto';
            return;
        }
        if (btn)    btn.style.background = 'rgba(239,68,68,.2)';
        if (status) status.textContent = 'Ouvindo…';
        listen(text => {
            const input = document.getElementById('k11v-text-input');
            if (input) {
                input.value = text;
                if (btn)    btn.style.background = 'var(--primary-dim,rgba(255,140,0,.12))';
                if (status) status.textContent = 'Pronto';
            }
        });
    }

    function _sendText() {
        const input = document.getElementById('k11v-text-input');
        const text  = input?.value?.trim();
        if (!text) return;
        const resp = document.getElementById('k11v-response');

        // Exibe thinking
        if (resp) { resp.style.display = 'block'; resp.textContent = '⏳ Processando…'; }

        // Envia ao AI Core v3 via API
        K11Auth.fetch('/api/ai/v3/chat', {
            method: 'POST',
            body:   JSON.stringify({ message: text, mode: 'auto' }),
        })
        .then(r => r?.json())
        .then(data => {
            if (resp) {
                resp.textContent = data?.reply || data?.error || 'Sem resposta.';
                if (data?.reply) speak(data.reply);
            }
        })
        .catch(e => {
            if (resp) resp.textContent = '⚠ Erro ao conectar com a IA.';
        });

        if (input) input.value = '';
    }

    // ── AUTO-INIT ─────────────────────────────────────────────────
    window.addEventListener('k11:ready', () => {
        console.log('[K11Voice] ✅ Módulo de voz unificado pronto');
    });

    return { open, close, speak, stop, isReady, listen, onSpeechEnd, _toggleListen, _sendText };

})();

// Expõe globalmente
window.K11Voice = K11Voice;
