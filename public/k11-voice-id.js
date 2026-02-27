/**
 * K11 OMNI ELITE — VOICE ID (Google Cloud TTS)
 * ════════════════════════════════════════════════════════════════
 * Módulo de síntese de voz neural em pt-BR via Google Cloud TTS.
 *
 * INTEGRAÇÃO:
 *   • K11VoiceID.speak(text)       → fala o texto via Google TTS
 *   • K11VoiceID.isReady()         → true se chave configurada
 *   • K11VoiceID.stop()            → para a reprodução atual
 *   • K11VoiceID.openSettings()    → abre painel de configuração
 *
 * FALLBACK: se não houver chave, usa Web Speech API nativo.
 *
 * Para injetar a chave direto no código, adicione em k11-config.js:
 *   const K11_GOOGLE_TTS_KEY   = 'AIzaSy...';
 *   const K11_GOOGLE_TTS_VOICE = 'pt-BR-Neural2-C';
 *
 * Inserir no dashboard.html ANTES de k11-voice-assistant.js.
 */

'use strict';

const K11VoiceID = (() => {

    // ── CONSTANTES ────────────────────────────────────────────
    const STORAGE_KEY_API   = 'k11_google_tts_api_key';   // compartilha com k11-key-voice
    const STORAGE_KEY_VOICE = 'k11_google_tts_voice';     // compartilha com k11-key-voice
    const API_URL           = 'https://texttospeech.googleapis.com/v1/text:synthesize';
    const DEFAULT_VOICE     = 'pt-BR-Neural2-C';

    const SUGGESTED_VOICES = [
        { id: 'pt-BR-Neural2-C',  name: 'Neural2-C',  desc: 'Feminina · a mais natural'  },
        { id: 'pt-BR-Neural2-A',  name: 'Neural2-A',  desc: 'Feminina · clara'            },
        { id: 'pt-BR-Neural2-B',  name: 'Neural2-B',  desc: 'Masculina · natural'         },
        { id: 'pt-BR-Neural2-D',  name: 'Neural2-D',  desc: 'Masculina · profundo'        },
        { id: 'pt-BR-Wavenet-A',  name: 'Wavenet-A',  desc: 'Feminina · alta qualidade'   },
        { id: 'pt-BR-Wavenet-B',  name: 'Wavenet-B',  desc: 'Feminina · expressiva'       },
        { id: 'pt-BR-Wavenet-C',  name: 'Wavenet-C',  desc: 'Masculina · profissional'    },
        { id: 'pt-BR-Standard-A', name: 'Standard-A', desc: 'Feminina · leve'             },
        { id: 'pt-BR-Standard-B', name: 'Standard-B', desc: 'Masculina · direto'          },
    ];

    // ── ESTADO ────────────────────────────────────────────────
    let _currentAudio = null;
    let _onStartCb    = null;
    let _onEndCb      = null;
    let _settingsOpen = false;
    let _audioCtx     = null;

    // ── STORAGE — k11-config.js tem prioridade máxima ─────────
    function _getApiKey() {
        try {
            if (typeof K11_GOOGLE_TTS_KEY !== 'undefined'
                && K11_GOOGLE_TTS_KEY?.length > 10
                && !K11_GOOGLE_TTS_KEY.includes('SUA_CHAVE'))
                return K11_GOOGLE_TTS_KEY;
        } catch (_) {}
        try { return localStorage.getItem(STORAGE_KEY_API) || ''; } catch (_) { return ''; }
    }

    function _getVoiceId() {
        try {
            if (typeof K11_GOOGLE_TTS_VOICE !== 'undefined' && K11_GOOGLE_TTS_VOICE)
                return K11_GOOGLE_TTS_VOICE;
        } catch (_) {}
        try { return localStorage.getItem(STORAGE_KEY_VOICE) || DEFAULT_VOICE; } catch (_) { return DEFAULT_VOICE; }
    }

    function _saveApiKey(k)  { try { localStorage.setItem(STORAGE_KEY_API,   k.trim()); } catch (_) {} }
    function _saveVoiceId(v) { try { localStorage.setItem(STORAGE_KEY_VOICE, v.trim()); } catch (_) {} }

    // ── API PÚBLICA ───────────────────────────────────────────
    function isReady() { return _getApiKey().length > 10; }
    function onStart(cb) { _onStartCb = cb; }
    function onEnd(cb)   { _onEndCb   = cb; }

    function stop() {
        if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
        if (_onEndCb) _onEndCb();
    }

    function _unlockAudio() {
        try {
            if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (_audioCtx.state === 'suspended') _audioCtx.resume();
        } catch (_) {}
    }

    async function _playBase64(b64) {
        const binary = atob(b64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob  = new Blob([bytes], { type: 'audio/mpeg' });
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { URL.revokeObjectURL(url); _currentAudio = null; if (_onEndCb) _onEndCb(); };
        audio.onerror = () => { URL.revokeObjectURL(url); _currentAudio = null; if (_onEndCb) _onEndCb(); };
        _currentAudio = audio;
        try {
            await audio.play();
        } catch (e) {
            try {
                const ctx    = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
                _audioCtx    = ctx;
                if (ctx.state === 'suspended') await ctx.resume();
                const arrBuf  = await new Response(blob).arrayBuffer();
                const decoded = await ctx.decodeAudioData(arrBuf);
                const src     = ctx.createBufferSource();
                src.buffer    = decoded;
                src.connect(ctx.destination);
                src.onended   = () => { _currentAudio = null; if (_onEndCb) _onEndCb(); };
                src.start(0);
                _currentAudio = { pause: () => { try { src.stop(); } catch (_) {} } };
            } catch (e2) {
                console.warn('[K11VoiceID] Autoplay bloqueado:', e2.message);
                _currentAudio = null;
                throw e2;
            }
        }
    }

    async function speak(text) {
        if (!text?.trim()) return;
        if (!isReady()) {
            console.warn('[K11VoiceID] Sem chave Google TTS — usando fallback Web Speech.');
            _webSpeechFallback(text);
            return;
        }

        stop();
        const apiKey  = _getApiKey();
        const voiceId = _getVoiceId();

        try {
            if (_onStartCb) _onStartCb();

            const res = await fetch(`${API_URL}?key=${encodeURIComponent(apiKey)}`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input:       { text },
                    voice:       { languageCode: 'pt-BR', name: voiceId },
                    audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 },
                }),
            });

            if (!res.ok) {
                let errMsg = `HTTP ${res.status}`;
                try { const j = await res.json(); errMsg = j?.error?.message ?? errMsg; } catch (_) {}
                console.error('[K11VoiceID] Erro Google TTS:', res.status, errMsg);
                _webSpeechFallback(text);
                if (_onEndCb) _onEndCb();
                return;
            }

            const json = await res.json();
            const b64  = json?.audioContent;
            if (!b64) { _webSpeechFallback(text); if (_onEndCb) _onEndCb(); return; }

            await _playBase64(b64).catch(() => _webSpeechFallback(text));

        } catch (e) {
            console.error('[K11VoiceID] Exceção:', e);
            _webSpeechFallback(text);
            if (_onEndCb) _onEndCb();
        }
    }

    // ── FALLBACK WEB SPEECH ───────────────────────────────────
    function _webSpeechFallback(text) {
        const synth = window.speechSynthesis;
        if (!synth) return;
        try { synth.cancel(); } catch (_) {}
        const u   = new SpeechSynthesisUtterance(text);
        u.lang    = 'pt-BR';
        u.onstart = () => { if (_onStartCb) _onStartCb(); };
        u.onend   = () => { if (_onEndCb)   _onEndCb();   };
        const fire = () => {
            const vl = synth.getVoices();
            const v  = vl.find(v => v.lang === 'pt-BR') || vl.find(v => v.lang.startsWith('pt')) || null;
            if (v) u.voice = v;
            synth.speak(u);
        };
        synth.getVoices().length > 0 ? fire()
            : synth.addEventListener('voiceschanged', function f() {
                synth.removeEventListener('voiceschanged', f); fire();
            });
    }

    // ── PAINEL DE CONFIGURAÇÃO ────────────────────────────────
    function _injectSettingsCSS() {
        if (document.getElementById('k11-vid-css')) return;
        const s = document.createElement('style');
        s.id = 'k11-vid-css';
        s.textContent = `
        #k11-vid-overlay {
            display:none; position:fixed; inset:0;
            background:rgba(9,9,15,.97); backdrop-filter:blur(8px);
            z-index:10000; align-items:center; justify-content:center; padding:20px;
        }
        #k11-vid-overlay.active { display:flex; }
        .k11-vid-box {
            width:100%; max-width:440px; background:#0f0f1a;
            border:1px solid rgba(66,133,244,.25); border-radius:16px;
            padding:24px; box-shadow:0 0 60px rgba(66,133,244,.08); position:relative;
        }
        .k11-vid-hdr  { display:flex; align-items:center; gap:12px; margin-bottom:20px; }
        .k11-vid-icon {
            width:40px; height:40px; border-radius:50%; flex-shrink:0;
            background:rgba(66,133,244,.12); border:1px solid rgba(66,133,244,.3);
            display:flex; align-items:center; justify-content:center; color:#4285f4;
        }
        .k11-vid-icon .material-symbols-outlined { font-size:20px; }
        .k11-vid-title { font-size:11px; font-weight:800; letter-spacing:2px; color:#4285f4; text-transform:uppercase; }
        .k11-vid-sub   { font-size:10px; color:#64748b; margin-top:2px; }
        .k11-vid-label {
            font-size:9px; font-weight:700; letter-spacing:2px; text-transform:uppercase;
            color:#475569; margin-bottom:6px; margin-top:14px;
        }
        .k11-vid-input {
            width:100%; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);
            border-radius:10px; padding:10px 13px; font-size:12px; color:#e0e0e0;
            outline:none; font-family:monospace; transition:border-color .2s; box-sizing:border-box;
        }
        .k11-vid-input:focus { border-color:rgba(66,133,244,.45); }
        .k11-vid-input::placeholder { color:rgba(255,255,255,.2); }
        .k11-vid-voices { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:2px; }
        .k11-vid-voice-btn {
            padding:9px 11px; border-radius:9px; cursor:pointer;
            background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07);
            transition:all .15s; text-align:left;
        }
        .k11-vid-voice-btn:hover    { border-color:rgba(66,133,244,.35); background:rgba(66,133,244,.07); }
        .k11-vid-voice-btn.selected { border-color:rgba(66,133,244,.6);  background:rgba(66,133,244,.13); }
        .k11-vid-voice-name { font-size:12px; font-weight:700; color:#e2e8f0; }
        .k11-vid-voice-desc { font-size:9px;  color:#64748b; margin-top:2px; }
        .k11-vid-actions { display:flex; gap:8px; margin-top:16px; }
        .k11-vid-btn-test {
            padding:11px 18px; border-radius:10px; cursor:pointer;
            background:rgba(66,133,244,.1); border:1px solid rgba(66,133,244,.25);
            color:#4285f4; font-weight:800; font-size:11px; letter-spacing:1px;
            text-transform:uppercase; transition:all .2s;
        }
        .k11-vid-btn-test:hover { background:rgba(66,133,244,.2); }
        .k11-vid-btn-save {
            flex:1; padding:11px; border-radius:10px; cursor:pointer;
            background:linear-gradient(135deg,#4285f4,#1a73e8); border:none;
            color:#fff; font-weight:800; font-size:11px; letter-spacing:1px;
            text-transform:uppercase; box-shadow:0 4px 18px rgba(66,133,244,.3);
            transition:all .2s;
        }
        .k11-vid-btn-save:hover { box-shadow:0 4px 26px rgba(66,133,244,.5); }
        .k11-vid-status { font-size:10px; margin-top:10px; text-align:center; color:#64748b; min-height:16px; }
        .k11-vid-status.ok  { color:#10b981; }
        .k11-vid-status.err { color:#f87171; }
        .k11-vid-close {
            position:absolute; top:16px; right:16px;
            background:none; border:none; color:#64748b; cursor:pointer; font-size:18px;
        }
        .k11-vid-info {
            font-size:10px; color:#475569; line-height:1.6; margin-top:14px;
            padding:10px 12px; background:rgba(255,255,255,.02);
            border:1px solid rgba(255,255,255,.05); border-radius:8px;
        }
        .k11-vid-info a    { color:#4285f4; text-decoration:none; }
        .k11-vid-info code {
            background:rgba(255,255,255,.06); padding:1px 5px;
            border-radius:4px; font-family:monospace; font-size:10px;
        }
        .k11-vid-badge {
            display:inline-flex; align-items:center; gap:4px;
            font-size:9px; font-weight:700; letter-spacing:1px;
            padding:2px 8px; border-radius:99px;
            background:rgba(66,133,244,.12); color:#4285f4; border:1px solid rgba(66,133,244,.3);
            vertical-align:middle; margin-left:6px;
        }
        `;
        document.head.appendChild(s);
    }

    function _injectSettingsHTML() {
        if (document.getElementById('k11-vid-overlay')) return;
        const div     = document.createElement('div');
        div.id        = 'k11-vid-overlay';
        const current = _getVoiceId();

        div.innerHTML = `
            <div class="k11-vid-box">
                <button class="k11-vid-close" id="k11-vid-close">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <div class="k11-vid-hdr">
                    <div class="k11-vid-icon">
                        <span class="material-symbols-outlined">record_voice_over</span>
                    </div>
                    <div>
                        <div class="k11-vid-title">K11 Voice ID <span class="k11-vid-badge">Google TTS</span></div>
                        <div class="k11-vid-sub">Voz neural pt-BR · alta qualidade</div>
                    </div>
                </div>

                <div class="k11-vid-label">Chave API Google Cloud</div>
                <input class="k11-vid-input" id="k11-vid-apikey" type="password"
                    placeholder="AIzaSy..." autocomplete="off" spellcheck="false"
                    value="${_getApiKey()}">

                <div class="k11-vid-label">Voz pt-BR — selecione uma opção</div>
                <div class="k11-vid-voices" id="k11-vid-voices">
                    ${SUGGESTED_VOICES.map(v => `
                        <div class="k11-vid-voice-btn ${current === v.id ? 'selected' : ''}" data-id="${v.id}">
                            <div class="k11-vid-voice-name">${v.name}</div>
                            <div class="k11-vid-voice-desc">${v.desc}</div>
                        </div>`).join('')}
                </div>

                <div class="k11-vid-actions">
                    <button class="k11-vid-btn-test" id="k11-vid-test">TESTAR</button>
                    <button class="k11-vid-btn-save" id="k11-vid-save">SALVAR</button>
                </div>
                <div class="k11-vid-status" id="k11-vid-status"></div>

                <div class="k11-vid-info">
                    Chave grátis em <a href="https://console.cloud.google.com/apis/credentials" target="_blank">console.cloud.google.com</a> —
                    ative a <b style="color:#64748b">Cloud Text-to-Speech API</b> no projeto.<br>
                    Ou injete direto em <code>k11-config.js</code>:<br>
                    <code>const K11_GOOGLE_TTS_KEY   = 'AIzaSy...';</code><br>
                    <code>const K11_GOOGLE_TTS_VOICE = 'pt-BR-Neural2-C';</code>
                </div>
            </div>`;

        document.body.appendChild(div);
        _bindSettingsEvents();
    }

    function _bindSettingsEvents() {
        document.getElementById('k11-vid-close').addEventListener('click', closeSettings);

        document.getElementById('k11-vid-voices').addEventListener('click', e => {
            const btn = e.target.closest('.k11-vid-voice-btn');
            if (!btn) return;
            document.querySelectorAll('.k11-vid-voice-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });

        document.getElementById('k11-vid-test').addEventListener('click', async () => {
            _unlockAudio();
            const apiKey  = document.getElementById('k11-vid-apikey').value.trim();
            const voiceId = _resolveSelectedVoice();
            if (!apiKey)  { _setSettingsStatus('Cole sua chave API primeiro.', 'err'); return; }
            if (!voiceId) { _setSettingsStatus('Selecione uma voz.', 'err'); return; }

            const vName = SUGGESTED_VOICES.find(v => v.id === voiceId)?.name ?? voiceId;
            _setSettingsStatus('Gerando áudio de teste...', '');

            try {
                const r = await fetch(`${API_URL}?key=${encodeURIComponent(apiKey)}`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        input:       { text: 'K11 OMNI Voice ID ativo. Voz neural pronta para uso operacional.' },
                        voice:       { languageCode: 'pt-BR', name: voiceId },
                        audioConfig: { audioEncoding: 'MP3' },
                    }),
                });

                if (!r.ok) {
                    let msg = `HTTP ${r.status}`;
                    try { const j = await r.json(); msg = j?.error?.message ?? msg; } catch (_) {}
                    _setSettingsStatus('Erro: ' + msg, 'err');
                    return;
                }

                const json = await r.json();
                const b64  = json?.audioContent;
                if (!b64) { _setSettingsStatus('Resposta inválida da API.', 'err'); return; }

                await _playBase64(b64).catch(e => _setSettingsStatus('Erro ao reproduzir: ' + e.message, 'err'));
                _setSettingsStatus(`Áudio reproduzindo · ${vName} ✓`, 'ok');

            } catch (e) {
                _setSettingsStatus('Falha na conexão: ' + e.message, 'err');
            }
        });

        document.getElementById('k11-vid-save').addEventListener('click', () => {
            const apiKey  = document.getElementById('k11-vid-apikey').value.trim();
            const voiceId = _resolveSelectedVoice();
            if (!apiKey)  { _setSettingsStatus('Informe a chave API.', 'err'); return; }
            if (!voiceId) { _setSettingsStatus('Selecione uma voz.', 'err'); return; }

            _saveApiKey(apiKey);
            _saveVoiceId(voiceId);

            const vName = SUGGESTED_VOICES.find(v => v.id === voiceId)?.name ?? voiceId;
            _setSettingsStatus(`Configuração salva! Voz "${vName}" ativa.`, 'ok');
            setTimeout(closeSettings, 1200);
        });
    }

    function _resolveSelectedVoice() {
        return document.querySelector('.k11-vid-voice-btn.selected')?.dataset?.id || DEFAULT_VOICE;
    }

    function _setSettingsStatus(msg, type) {
        const el = document.getElementById('k11-vid-status');
        if (!el) return;
        el.textContent = msg;
        el.className   = 'k11-vid-status' + (type ? ' ' + type : '');
    }

    function openSettings() {
        _unlockAudio();
        _injectSettingsCSS();
        _injectSettingsHTML();
        document.getElementById('k11-vid-overlay').classList.add('active');
        _settingsOpen = true;
    }

    function closeSettings() {
        document.getElementById('k11-vid-overlay')?.classList.remove('active');
        _settingsOpen = false;
    }

    function init() {
        _injectSettingsCSS();
        console.log('[K11VoiceID] ' + (isReady()
            ? '✅ Google Cloud TTS configurado — voz neural pt-BR ativa.'
            : '⚠️ Sem chave Google TTS — usando Web Speech fallback. Use K11VoiceID.openSettings().'));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { speak, stop, isReady, onStart, onEnd, openSettings, closeSettings };

})();
