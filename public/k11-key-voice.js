/**
 * K11 OMNI ELITE — KEY VOICE (Google Cloud TTS)
 * ════════════════════════════════════════════════════════════════
 * Síntese de voz neural em pt-BR via Google Cloud Text-to-Speech.
 *
 * Free tier: 500k chars/mês (Neural2), 1M/mês (WaveNet/Standard) — sem cartão.
 * Chave em: https://console.cloud.google.com → APIs → Cloud Text-to-Speech API
 *
 * Para injetar a chave direto no código, adicione em k11-config.js:
 *   const K11_GOOGLE_TTS_KEY   = 'AIzaSy...';
 *   const K11_GOOGLE_TTS_VOICE = 'pt-BR-Neural2-C';
 *
 * Inserir no dashboard.html ANTES de k11-voice-assistant.js.
 */

'use strict';

const K11KeyVoice = (() => {

    // ══════════════════════════════════════════════════════════
    // CONSTANTES
    // ══════════════════════════════════════════════════════════
    const SK_API   = 'k11_google_tts_api_key';
    const SK_VOICE = 'k11_google_tts_voice';
    const API_URL  = 'https://texttospeech.googleapis.com/v1/text:synthesize';

    const VOICES = [
        { id: 'pt-BR-Neural2-C', name: 'Neural2-C', tag: 'Feminina · a mais natural'    },
        { id: 'pt-BR-Neural2-A', name: 'Neural2-A', tag: 'Feminina · clara'              },
        { id: 'pt-BR-Neural2-B', name: 'Neural2-B', tag: 'Masculina · natural'           },
        { id: 'pt-BR-Neural2-D', name: 'Neural2-D', tag: 'Masculina · profundo'          },
        { id: 'pt-BR-Wavenet-A', name: 'Wavenet-A', tag: 'Feminina · alta qualidade'     },
        { id: 'pt-BR-Wavenet-B', name: 'Wavenet-B', tag: 'Feminina · expressiva'         },
        { id: 'pt-BR-Wavenet-C', name: 'Wavenet-C', tag: 'Masculina · profissional'      },
        { id: 'pt-BR-Standard-A', name: 'Standard-A', tag: 'Feminina · leve'             },
        { id: 'pt-BR-Standard-B', name: 'Standard-B', tag: 'Masculina · direto'          },
    ];

    // ══════════════════════════════════════════════════════════
    // LOG INTERNO
    // ══════════════════════════════════════════════════════════
    const _log = [];

    function _emit(level, msg, data) {
        const entry = { ts: new Date().toLocaleTimeString('pt-BR'), level, msg, data: data ?? null };
        _log.push(entry);
        const icon = { info: 'ℹ️', ok: '✅', warn: '⚠️', error: '❌' }[level] || '·';
        console.log(`[K11KeyVoice/Google] ${icon} ${msg}`, data ?? '');
        _renderLog();
        return entry;
    }

    function getLog() { return [..._log]; }

    // ══════════════════════════════════════════════════════════
    // STORAGE — k11-config.js tem prioridade máxima
    // ══════════════════════════════════════════════════════════
    function getApiKey() {
        try {
            if (typeof K11_GOOGLE_TTS_KEY !== 'undefined'
                && K11_GOOGLE_TTS_KEY?.length > 10
                && !K11_GOOGLE_TTS_KEY.includes('SUA_CHAVE'))
                return K11_GOOGLE_TTS_KEY;
        } catch (_) {}
        try { return localStorage.getItem(SK_API) || ''; } catch (_) { return ''; }
    }

    function getVoiceId() {
        try {
            if (typeof K11_GOOGLE_TTS_VOICE !== 'undefined' && K11_GOOGLE_TTS_VOICE)
                return K11_GOOGLE_TTS_VOICE;
        } catch (_) {}
        try { return localStorage.getItem(SK_VOICE) || VOICES[0].id; } catch (_) { return VOICES[0].id; }
    }

    function _saveApiKey(k)  { try { localStorage.setItem(SK_API,   k.trim()); } catch (_) {} }
    function _saveVoiceId(v) { try { localStorage.setItem(SK_VOICE, v.trim()); } catch (_) {} }

    function isReady() { return getApiKey().length > 10; }

    // ══════════════════════════════════════════════════════════
    // PLAYBACK — Google retorna base64 MP3
    // ══════════════════════════════════════════════════════════
    let _currentAudio = null;
    let _onStartCb    = null;
    let _onEndCb      = null;
    let _audioCtx     = null;

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
        audio.onended = () => { URL.revokeObjectURL(url); _currentAudio = null; };
        audio.onerror = () => { URL.revokeObjectURL(url); _currentAudio = null; };
        _currentAudio = audio;
        try {
            await audio.play();
        } catch (e) {
            // Fallback AudioContext para iOS
            try {
                const ctx    = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
                _audioCtx    = ctx;
                if (ctx.state === 'suspended') await ctx.resume();
                const arrBuf  = await new Response(blob).arrayBuffer();
                const decoded = await ctx.decodeAudioData(arrBuf);
                const src     = ctx.createBufferSource();
                src.buffer    = decoded;
                src.connect(ctx.destination);
                src.onended   = () => { _currentAudio = null; };
                src.start(0);
                _currentAudio = { pause: () => { try { src.stop(); } catch (_) {} } };
            } catch (e2) {
                _emit('error', 'Autoplay bloqueado pelo navegador', e2.message);
                _currentAudio = null;
                throw e2;
            }
        }
    }

    function onStart(cb) { _onStartCb = cb; }
    function onEnd(cb)   { _onEndCb   = cb; }

    function stop() {
        if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
        if (_onEndCb) _onEndCb();
    }

    // ══════════════════════════════════════════════════════════
    // SÍNTESE
    // ══════════════════════════════════════════════════════════
    async function speak(text) {
        if (!text?.trim()) return;

        if (!isReady()) {
            _emit('warn', 'Sem chave Google TTS — fallback Web Speech', { text: text.substring(0, 40) });
            _webSpeechFallback(text);
            return;
        }

        stop();
        const apiKey    = getApiKey();
        const voiceId   = getVoiceId();
        const voiceName = VOICES.find(v => v.id === voiceId)?.name ?? voiceId;

        _emit('info', `Gerando áudio — voz: ${voiceName}`, { chars: text.length });

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
                _emit('error', 'Google TTS recusou a requisição', { status: res.status, msg: errMsg });
                _webSpeechFallback(text);
                if (_onEndCb) _onEndCb();
                return;
            }

            const json = await res.json();
            const b64  = json?.audioContent;
            if (!b64) {
                _emit('error', 'Resposta sem audioContent');
                _webSpeechFallback(text);
                if (_onEndCb) _onEndCb();
                return;
            }

            try {
                await _playBase64(b64);
                _emit('ok', `Reproduzindo Google TTS · ${voiceName}`);
                if (_currentAudio?.addEventListener) {
                    _currentAudio.addEventListener('ended', () => { if (_onEndCb) _onEndCb(); });
                    _currentAudio.addEventListener('error', () => { _webSpeechFallback(text); if (_onEndCb) _onEndCb(); });
                } else {
                    setTimeout(() => { if (_onEndCb) _onEndCb(); }, 500);
                }
            } catch (e) {
                _emit('warn', 'Playback bloqueado — fallback Web Speech');
                _webSpeechFallback(text);
                if (_onEndCb) _onEndCb();
            }

        } catch (e) {
            _emit('error', 'Exceção na chamada Google TTS', e.message);
            _webSpeechFallback(text);
            if (_onEndCb) _onEndCb();
        }
    }

    function _webSpeechFallback(text) {
        _emit('info', 'Usando Web Speech API (fallback)');
        const synth = window.speechSynthesis;
        if (!synth) { _emit('error', 'Web Speech indisponível'); return; }
        try { synth.cancel(); } catch (_) {}
        const u   = new SpeechSynthesisUtterance(text);
        u.lang    = 'pt-BR';
        u.onstart = () => { if (_onStartCb) _onStartCb(); };
        u.onend   = () => { _emit('ok', 'Web Speech finalizado'); if (_onEndCb) _onEndCb(); };
        const fire = () => {
            const vl = synth.getVoices();
            const v  = vl.find(v => v.lang === 'pt-BR') || vl.find(v => v.lang.startsWith('pt')) || null;
            if (v) { u.voice = v; _emit('info', `Web Speech voz: ${v.name}`); }
            synth.speak(u);
        };
        synth.getVoices().length > 0 ? fire()
            : synth.addEventListener('voiceschanged', function f() {
                synth.removeEventListener('voiceschanged', f); fire();
            });
    }

    // ══════════════════════════════════════════════════════════
    // PAINEL DE CONFIGURAÇÃO
    // ══════════════════════════════════════════════════════════
    function _css() {
        if (document.getElementById('k11kv-css')) return;
        const s = document.createElement('style');
        s.id = 'k11kv-css';
        s.textContent = `
        #k11kv-overlay {
            display:none; position:fixed; inset:0;
            background:rgba(5,5,12,.97); backdrop-filter:blur(10px);
            z-index:10001; align-items:flex-end; justify-content:center; padding:0;
        }
        #k11kv-overlay.active { display:flex; }
        #k11kv-panel {
            width:100%; max-width:480px; background:#0d0d1c;
            border:1px solid rgba(66,133,244,.2); border-bottom:none;
            border-radius:20px 20px 0 0;
            padding:0 0 env(safe-area-inset-bottom,12px);
            box-shadow:0 -8px 60px rgba(66,133,244,.1);
            max-height:92vh; overflow-y:auto;
            animation:k11kv-up .25s ease;
        }
        @keyframes k11kv-up { from{transform:translateY(100%)} to{transform:translateY(0)} }
        .k11kv-drag { width:40px; height:4px; background:rgba(255,255,255,.12); border-radius:2px; margin:10px auto 0; }
        .k11kv-hdr {
            display:flex; align-items:center; gap:12px;
            padding:16px 18px 12px; border-bottom:1px solid rgba(255,255,255,.05);
        }
        .k11kv-icon {
            width:38px; height:38px; border-radius:50%; flex-shrink:0;
            background:rgba(66,133,244,.12); border:1px solid rgba(66,133,244,.3);
            display:flex; align-items:center; justify-content:center; color:#4285f4;
        }
        .k11kv-icon .material-symbols-outlined { font-size:20px; }
        .k11kv-title { font-size:13px; font-weight:800; color:#e2e8f0; letter-spacing:.5px; }
        .k11kv-sub   { font-size:10px; color:#64748b; margin-top:2px; }
        .k11kv-status-badge {
            margin-left:auto; padding:4px 10px; border-radius:99px;
            font-size:9px; font-weight:800; letter-spacing:1px; text-transform:uppercase;
        }
        .k11kv-status-badge.active   { background:rgba(16,185,129,.15); color:#10b981; border:1px solid rgba(16,185,129,.3); }
        .k11kv-status-badge.inactive { background:rgba(100,116,139,.1);  color:#64748b; border:1px solid rgba(100,116,139,.2); }
        .k11kv-section { padding:14px 18px 0; }
        .k11kv-label {
            font-size:9px; font-weight:700; letter-spacing:2px; color:#475569;
            text-transform:uppercase; margin-bottom:8px; display:flex; align-items:center; gap:6px;
        }
        .k11kv-hint { font-size:9px; color:#475569; margin-top:6px; padding:0 2px; line-height:1.6; }
        .k11kv-hint a { color:#4285f4; text-decoration:none; }
        .k11kv-input {
            width:100%; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);
            border-radius:10px; padding:11px 14px; font-size:12px; color:#e0e0e0;
            outline:none; font-family:monospace; transition:border-color .2s; box-sizing:border-box;
        }
        .k11kv-input:focus { border-color:rgba(66,133,244,.5); }
        .k11kv-input::placeholder { color:rgba(255,255,255,.2); }
        .k11kv-voices { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
        .k11kv-vbtn {
            padding:10px 12px; border-radius:10px; cursor:pointer;
            background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07);
            transition:all .15s; text-align:left;
        }
        .k11kv-vbtn:hover { border-color:rgba(66,133,244,.35); background:rgba(66,133,244,.07); }
        .k11kv-vbtn.sel  { border-color:rgba(66,133,244,.6);  background:rgba(66,133,244,.15); }
        .k11kv-vbtn-name { font-size:12px; font-weight:700; color:#e2e8f0; }
        .k11kv-vbtn-tag  { font-size:9px;  color:#64748b; margin-top:3px; }
        .k11kv-actions { display:flex; gap:8px; padding:16px 18px 10px; }
        .k11kv-btn {
            flex:1; padding:12px; border-radius:12px; cursor:pointer;
            font-weight:800; font-size:11px; letter-spacing:1px;
            text-transform:uppercase; border:none; transition:all .2s;
        }
        .k11kv-btn.test {
            background:rgba(66,133,244,.1); border:1px solid rgba(66,133,244,.25); color:#4285f4;
        }
        .k11kv-btn.test:hover { background:rgba(66,133,244,.2); }
        .k11kv-btn.save {
            flex:2; background:linear-gradient(135deg,#4285f4,#1a73e8); color:#fff;
            box-shadow:0 4px 20px rgba(66,133,244,.3);
        }
        .k11kv-btn.save:hover { box-shadow:0 4px 28px rgba(66,133,244,.5); }
        .k11kv-btn.close-btn {
            background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07); color:#64748b;
        }
        .k11kv-msg { font-size:11px; text-align:center; padding:6px 18px; min-height:20px; transition:color .2s; }
        .k11kv-msg.ok   { color:#10b981; }
        .k11kv-msg.err  { color:#f87171; }
        .k11kv-msg.info { color:#94a3b8; }
        .k11kv-info-box {
            margin:0 18px 16px; font-size:10px; color:#475569; line-height:1.7;
            padding:10px 12px; background:rgba(255,255,255,.02);
            border:1px solid rgba(255,255,255,.04); border-radius:8px;
        }
        .k11kv-info-box a    { color:#4285f4; text-decoration:none; }
        .k11kv-info-box code {
            background:rgba(255,255,255,.06); padding:1px 5px;
            border-radius:4px; font-family:monospace; font-size:10px;
        }
        .k11kv-log-hdr {
            display:flex; align-items:center; justify-content:space-between;
            padding:10px 18px 6px; border-top:1px solid rgba(255,255,255,.05);
            margin-top:6px; cursor:pointer;
        }
        .k11kv-log-title  { font-size:9px; font-weight:700; letter-spacing:2px; color:#334155; text-transform:uppercase; }
        .k11kv-log-toggle { font-size:9px; color:#334155; }
        #k11kv-log-body {
            display:none; margin:0 18px 14px;
            background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.05);
            border-radius:8px; padding:8px; max-height:160px; overflow-y:auto;
            font-family:monospace; font-size:10px;
        }
        #k11kv-log-body.open { display:block; }
        .k11kv-log-row   { padding:2px 0; border-bottom:1px solid rgba(255,255,255,.03); display:flex; gap:6px; }
        .k11kv-log-ts    { color:#334155; flex-shrink:0; }
        .k11kv-log-info  { color:#94a3b8; }
        .k11kv-log-ok    { color:#10b981; }
        .k11kv-log-warn  { color:#eab308; }
        .k11kv-log-error { color:#f87171; }
        `;
        document.head.appendChild(s);
    }

    function _html() {
        if (document.getElementById('k11kv-overlay')) return;
        const el = document.createElement('div');
        el.id = 'k11kv-overlay';
        el.innerHTML = `
            <div id="k11kv-panel">
                <div class="k11kv-drag"></div>
                <div class="k11kv-hdr">
                    <div class="k11kv-icon">
                        <span class="material-symbols-outlined">record_voice_over</span>
                    </div>
                    <div>
                        <div class="k11kv-title">K11 Voice — Google TTS</div>
                        <div class="k11kv-sub">pt-BR Neural2 · alta qualidade</div>
                    </div>
                    <div id="k11kv-badge" class="k11kv-status-badge ${isReady() ? 'active' : 'inactive'}">
                        ${isReady() ? 'ATIVO' : 'SEM CHAVE'}
                    </div>
                </div>

                <div class="k11kv-section">
                    <div class="k11kv-label">
                        <span class="material-symbols-outlined" style="font-size:13px">key</span>
                        Chave API Google Cloud
                    </div>
                    <input class="k11kv-input" id="k11kv-apikey" type="password"
                        placeholder="AIzaSy..." autocomplete="off" spellcheck="false">
                    <div class="k11kv-hint">
                        Ative a <b style="color:#64748b">Cloud Text-to-Speech API</b> e gere uma
                        <b style="color:#64748b">API Key</b> em
                        <a href="https://console.cloud.google.com/apis/credentials" target="_blank">console.cloud.google.com</a>.
                        Ou injete direto em <code>k11-config.js</code>:
                        <code>K11_GOOGLE_TTS_KEY</code> e <code>K11_GOOGLE_TTS_VOICE</code>.
                    </div>
                </div>

                <div class="k11kv-section" style="margin-top:14px;">
                    <div class="k11kv-label">
                        <span class="material-symbols-outlined" style="font-size:13px">graphic_eq</span>
                        Escolha a voz pt-BR
                    </div>
                    <div class="k11kv-voices" id="k11kv-voices">
                        ${VOICES.map(v => `
                            <div class="k11kv-vbtn" data-id="${v.id}">
                                <div class="k11kv-vbtn-name">${v.name}</div>
                                <div class="k11kv-vbtn-tag">${v.tag}</div>
                            </div>`).join('')}
                    </div>
                </div>

                <div class="k11kv-msg info" id="k11kv-msg">Cole sua chave e escolha uma voz para começar.</div>

                <div class="k11kv-actions">
                    <button class="k11kv-btn test" id="k11kv-test">TESTAR</button>
                    <button class="k11kv-btn save" id="k11kv-save">SALVAR</button>
                    <button class="k11kv-btn close-btn" id="k11kv-close">FECHAR</button>
                </div>

                <div class="k11kv-info-box">
                    Free tier: <b style="color:#e2e8f0">500k chars/mês</b> (Neural2) ·
                    <b style="color:#e2e8f0">1M chars/mês</b> (WaveNet/Standard) — sem cartão.<br>
                    Para fixar no código, adicione em <code>k11-config.js</code>:<br>
                    <code>const K11_GOOGLE_TTS_KEY   = 'AIzaSy...';</code><br>
                    <code>const K11_GOOGLE_TTS_VOICE = 'pt-BR-Neural2-C';</code>
                </div>

                <div class="k11kv-log-hdr" id="k11kv-log-toggle-btn">
                    <span class="k11kv-log-title">Log de processo</span>
                    <span class="k11kv-log-toggle" id="k11kv-log-arrow">▶ expandir</span>
                </div>
                <div id="k11kv-log-body"></div>
            </div>`;
        document.body.appendChild(el);
        _bindEvents();
        _syncUI();
    }

    function _bindEvents() {
        document.getElementById('k11kv-close').addEventListener('click', closePanel);
        document.getElementById('k11kv-overlay').addEventListener('click', e => {
            if (e.target.id === 'k11kv-overlay') closePanel();
        });

        document.getElementById('k11kv-voices').addEventListener('click', e => {
            const btn = e.target.closest('.k11kv-vbtn');
            if (!btn) return;
            document.querySelectorAll('.k11kv-vbtn').forEach(b => b.classList.remove('sel'));
            btn.classList.add('sel');
            _setMsg('Voz "' + btn.querySelector('.k11kv-vbtn-name').textContent + '" selecionada. Clique em TESTAR.', 'info');
        });

        document.getElementById('k11kv-test').addEventListener('click', async () => {
            _unlockAudio();
            const apiKey  = document.getElementById('k11kv-apikey').value.trim();
            const voiceId = _resolveVoice();
            if (!apiKey)  { _setMsg('Cole sua chave API primeiro.', 'err'); return; }
            if (!voiceId) { _setMsg('Selecione uma voz.', 'err'); return; }

            const vName = VOICES.find(v => v.id === voiceId)?.name ?? voiceId;
            _setMsg('Gerando áudio de teste...', 'info');
            _emit('info', `Testando voz: ${vName}`, { voiceId });

            try {
                const r = await fetch(`${API_URL}?key=${encodeURIComponent(apiKey)}`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        input:       { text: 'K11 OMNI. Voz neural Google ativa em português.' },
                        voice:       { languageCode: 'pt-BR', name: voiceId },
                        audioConfig: { audioEncoding: 'MP3' },
                    }),
                });

                if (!r.ok) {
                    let msg = `HTTP ${r.status}`;
                    try { const j = await r.json(); msg = j?.error?.message ?? msg; } catch (_) {}
                    _setMsg('Erro: ' + msg, 'err');
                    _emit('error', 'Teste falhou', { status: r.status, msg });
                    return;
                }

                const json = await r.json();
                const b64  = json?.audioContent;
                if (!b64) { _setMsg('Resposta inválida da API.', 'err'); return; }

                _unlockAudio();
                await _playBase64(b64).catch(e => _setMsg('Erro ao reproduzir: ' + e.message, 'err'));
                _setMsg('Reproduzindo teste · ' + vName + ' ✓', 'ok');
                _emit('ok', `Teste OK — voz: ${vName}`);

            } catch (e) {
                _setMsg('Falha de conexão: ' + e.message, 'err');
                _emit('error', 'Exceção no teste', e.message);
            }
        });

        document.getElementById('k11kv-save').addEventListener('click', () => {
            const apiKey  = document.getElementById('k11kv-apikey').value.trim();
            const voiceId = _resolveVoice();
            if (!apiKey)  { _setMsg('Informe a chave API.', 'err'); return; }
            if (!voiceId) { _setMsg('Selecione uma voz.', 'err'); return; }

            _saveApiKey(apiKey);
            _saveVoiceId(voiceId);

            const vName = VOICES.find(v => v.id === voiceId)?.name ?? voiceId;
            _setMsg('Salvo! Voz "' + vName + '" ativa no K11.', 'ok');
            _emit('ok', `Config salva — voz: ${vName}`, { voiceId });

            const badge = document.getElementById('k11kv-badge');
            if (badge) { badge.className = 'k11kv-status-badge active'; badge.textContent = 'ATIVO'; }

            setTimeout(closePanel, 1400);
        });

        document.getElementById('k11kv-log-toggle-btn').addEventListener('click', () => {
            const body  = document.getElementById('k11kv-log-body');
            const arrow = document.getElementById('k11kv-log-arrow');
            const open  = body.classList.toggle('open');
            arrow.textContent = open ? '▼ recolher' : '▶ expandir';
        });
    }

    function _syncUI() {
        const key = getApiKey();
        if (key) document.getElementById('k11kv-apikey').value = key;
        const vid = getVoiceId();
        document.querySelectorAll('.k11kv-vbtn').forEach(b => {
            b.classList.toggle('sel', b.dataset.id === vid);
        });
    }

    function _resolveVoice() {
        return document.querySelector('.k11kv-vbtn.sel')?.dataset?.id ?? VOICES[0].id;
    }

    function _setMsg(text, type) {
        const el = document.getElementById('k11kv-msg');
        if (!el) return;
        el.textContent = text;
        el.className   = 'k11kv-msg ' + (type || 'info');
    }

    function _renderLog() {
        const body = document.getElementById('k11kv-log-body');
        if (!body) return;
        body.innerHTML = _log.slice(-30).reverse().map(e =>
            `<div class="k11kv-log-row">
                <span class="k11kv-log-ts">${e.ts}</span>
                <span class="k11kv-log-${e.level}">${e.msg}${e.data ? ' — ' + JSON.stringify(e.data) : ''}</span>
            </div>`
        ).join('');
    }

    function openPanel() {
        _unlockAudio();
        _css();
        _html();
        document.getElementById('k11kv-overlay').classList.add('active');
        _syncUI();
        _renderLog();
        _emit('info', `Painel aberto — status: ${isReady() ? 'chave presente' : 'sem chave'}`);
    }

    function closePanel() {
        document.getElementById('k11kv-overlay')?.classList.remove('active');
    }

    function _init() {
        _css();
        if (isReady()) {
            _emit('ok', 'Google Cloud TTS configurado — voz neural pt-BR ativa', { voice: getVoiceId() });
        } else {
            _emit('warn', 'Sem chave Google TTS — Web Speech ativo como fallback');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

    return { speak, stop, isReady, onStart, onEnd, openPanel, closePanel, getLog, getApiKey, getVoiceId };

})();
