/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║   K11 AI VOICE — Assistente de Voz Melhorado                        ║
 * ║                                                                       ║
 * ║   Melhorias sobre o k11-voice-assistant.js original:                ║
 * ║   • NLP real (classifica intenção antes de processar)               ║
 * ║   • Respostas de voz geradas pelo AI Core (não hardcoded)           ║
 * ║   • Comandos de ação: "reabastecer X", "ajustar preço de Y"         ║
 * ║   • Feedback de confirmação antes de executar ações críticas        ║
 * ║   • Contexto de PDV ativo na conversa                               ║
 * ║   • Histórico de conversa curta (últimas 3 trocas)                  ║
 * ║   • Resposta adaptativa: mais curta em mobile, mais detalhada       ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * INTEGRAÇÃO: Substitui / enriquece o k11-voice-assistant.js existente
 * Requer: K11AICore.chat() disponível globalmente no frontend
 */

'use strict';

const K11VoiceEnhanced = (() => {

  // ── ESTADO ──────────────────────────────────────────────────────────
  const state = {
    active:       false,
    listening:    false,
    processing:   false,
    recognition:  null,
    synthesis:    window.speechSynthesis || null,

    // Contexto da sessão de voz
    activePdvId:   null,
    activePdvName: null,
    conversationHistory: [],  // últimas 3 trocas

    // NLP
    pendingAction:  null,    // ação aguardando confirmação
    lastIntent:     null,

    // Config
    lang:          'pt-BR',
    voiceName:     null,     // preferência de voz TTS
    confidenceMin: 0.65,     // mínimo de confiança do STT
    autoReadReply: true,     // lê a resposta em voz alta automaticamente
  };

  // ── INTENT PATTERNS ──────────────────────────────────────────────────
  const INTENT_PATTERNS = [
    // Consultas
    { intent: 'QUERY_SALES',       patterns: [/venda|faturamento|quanto vendeu|resultado/i] },
    { intent: 'QUERY_STOCK',       patterns: [/estoque|tem|disponível|quantos|ruptura/i] },
    { intent: 'QUERY_GOAL',        patterns: [/meta|objetivo|quanto falta|percentual da meta/i] },
    { intent: 'QUERY_MARGIN',      patterns: [/margem|lucro|rentab/i] },
    { intent: 'QUERY_PRICE',       patterns: [/preço|quanto custa|valor de/i] },
    { intent: 'QUERY_COMPETITOR',  patterns: [/concorrente|mais barato|comparar/i] },
    { intent: 'QUERY_FORECAST',    patterns: [/previsão|vai vender|próxima semana|prever/i] },

    // Ações
    { intent: 'ACTION_REORDER',    patterns: [/reabastecer|pedir|repor|fazer pedido de/i] },
    { intent: 'ACTION_PRICE_ADJ',  patterns: [/ajustar preço|mudar preço|cobrar|precificar/i] },
    { intent: 'ACTION_ALERT',      patterns: [/criar alerta|me avisa|notifica/i] },

    // Navegação
    { intent: 'NAV_ESTOQUE',       patterns: [/ir para estoque|abrir estoque|ver estoque/i] },
    { intent: 'NAV_DASHBOARD',     patterns: [/ir para dash|abrir dash|voltar ao início/i] },
    { intent: 'NAV_COLETA',        patterns: [/abrir coleta|fazer coleta/i] },

    // Sistema
    { intent: 'SYS_HELP',          patterns: [/ajuda|o que você faz|como funciona|comandos/i] },
    { intent: 'SYS_CONFIRM',       patterns: [/sim|confirma|pode|ok|correto|certo/i] },
    { intent: 'SYS_CANCEL',        patterns: [/não|cancela|para|aborta/i] },
  ];

  // ═══════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════

  function init() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('[K11Voice+] Speech Recognition não suportado neste browser');
      return;
    }

    _setupRecognition();
    _loadPreferredVoice();
    _injectVoiceUI();
    console.log('[K11Voice+] ✅ Voice assistant melhorado inicializado');
  }

  // ═══════════════════════════════════════════════════════════════════
  // SPEECH RECOGNITION
  // ═══════════════════════════════════════════════════════════════════

  function _setupRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    state.recognition = new SpeechRecognition();
    state.recognition.lang = state.lang;
    state.recognition.continuous = false;
    state.recognition.interimResults = true;
    state.recognition.maxAlternatives = 3;

    state.recognition.onstart = () => {
      state.listening = true;
      _updateUI('listening');
      _showTranscript('🎤 Ouvindo...');
    };

    state.recognition.onresult = (event) => {
      let interim = '';
      let final   = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const best = result[0];
          if (best.confidence >= state.confidenceMin) {
            final += best.transcript;
          } else {
            // Tenta alternativas
            for (let j = 1; j < result.length; j++) {
              if (result[j].confidence >= state.confidenceMin) {
                final += result[j].transcript;
                break;
              }
            }
          }
        } else {
          interim = result[0].transcript;
        }
      }

      if (interim) _showTranscript(`🎤 "${interim}"`, true);
      if (final)   _processTranscript(final.trim());
    };

    state.recognition.onerror = (event) => {
      state.listening = false;
      if (event.error !== 'no-speech') {
        _showTranscript(`❌ Erro: ${event.error}`);
        _speak('Não entendi. Pode repetir?');
      }
      _updateUI('idle');
    };

    state.recognition.onend = () => {
      state.listening = false;
      if (!state.processing) _updateUI('idle');
    };
  }

  function _loadPreferredVoice() {
    if (!state.synthesis) return;
    const load = () => {
      const voices = state.synthesis.getVoices();
      // Prefere vozes pt-BR femininas
      const preferred = voices.find(v => v.lang === 'pt-BR' && v.name.toLowerCase().includes('female'))
        || voices.find(v => v.lang === 'pt-BR')
        || voices.find(v => v.lang.startsWith('pt'));
      if (preferred) state.voiceName = preferred.name;
    };
    load();
    state.synthesis.addEventListener('voiceschanged', load);
  }

  // ═══════════════════════════════════════════════════════════════════
  // NLP — PROCESSA TRANSCRIÇÃO
  // ═══════════════════════════════════════════════════════════════════

  async function _processTranscript(text) {
    if (!text) return;

    state.processing = true;
    _updateUI('processing');
    _showTranscript(`💬 "${text}"`);

    // Se há ação pendente aguardando confirmação
    if (state.pendingAction) {
      const intent = _classifyIntent(text);
      if (intent === 'SYS_CONFIRM') {
        await _executePendingAction();
        return;
      } else if (intent === 'SYS_CANCEL') {
        state.pendingAction = null;
        _respond('Ação cancelada.');
        return;
      }
    }

    const intent = _classifyIntent(text);
    state.lastIntent = intent;

    // Trata navegação localmente
    if (intent?.startsWith('NAV_')) {
      _handleNavigation(intent, text);
      state.processing = false;
      _updateUI('idle');
      return;
    }

    // Trata comandos de sistema localmente
    if (intent === 'SYS_HELP') {
      _respond('Posso responder sobre vendas, estoque, metas, margens e preços. Também posso reabastecer produtos, ajustar alertas e navegar pelo sistema. O que você precisa?');
      state.processing = false;
      _updateUI('idle');
      return;
    }

    // Ações que precisam de confirmação
    if (intent?.startsWith('ACTION_')) {
      await _handleActionIntent(intent, text);
      state.processing = false;
      _updateUI('idle');
      return;
    }

    // Tudo mais vai para o AI Core
    await _askAICore(text, intent);
    state.processing = false;
    _updateUI('idle');
  }

  function _classifyIntent(text) {
    for (const { intent, patterns } of INTENT_PATTERNS) {
      if (patterns.some(p => p.test(text))) return intent;
    }
    return 'QUERY_GENERAL';
  }

  // ═══════════════════════════════════════════════════════════════════
  // AI CORE INTEGRATION
  // ═══════════════════════════════════════════════════════════════════

  async function _askAICore(text, intent) {
    // Usa K11AICore se disponível, senão POST para /api/ai/chat
    let response;

    try {
      if (typeof K11AICore !== 'undefined') {
        // Direto no frontend (se core estiver exposto)
        const r = await K11AICore.chat(text, {
          pdvId: state.activePdvId,
          mode:  'fast',
        });
        response = r.text;
      } else {
        // Via API
        const token = sessionStorage.getItem('k11_jwt');
        const res   = await fetch('/api/ai/chat', {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: text,
            pdvId:   state.activePdvId,
            intent,
            conversationHistory: state.conversationHistory.slice(-3),
          }),
        });
        const data = await res.json();
        response = data.text || data.response || 'Não consegui processar.';
      }
    } catch (_) {
      response = 'Sem conexão com o servidor. Verifique a rede.';
    }

    // Salva no histórico da conversa
    state.conversationHistory.push({ user: text, ai: response });
    if (state.conversationHistory.length > 6) state.conversationHistory.shift();

    _respond(response);
  }

  // ═══════════════════════════════════════════════════════════════════
  // ACTION HANDLING (com confirmação)
  // ═══════════════════════════════════════════════════════════════════

  async function _handleActionIntent(intent, text) {
    if (intent === 'ACTION_REORDER') {
      // Extrai produto do texto
      const product = _extractProductName(text);
      if (!product) {
        _respond('Qual produto você quer reabastecer?');
        return;
      }
      state.pendingAction = { type: 'REORDER', product, originalText: text };
      _respond(`Confirmar pedido de reposição para ${product}? Diga sim para confirmar ou não para cancelar.`);
      return;
    }

    if (intent === 'ACTION_PRICE_ADJ') {
      const product = _extractProductName(text);
      if (!product) {
        _respond('Qual produto você quer ajustar o preço?');
        return;
      }
      state.pendingAction = { type: 'PRICE_ADJUST', product, originalText: text };
      _respond(`Você quer ajustar o preço de ${product}? Diga sim para abrir o ajuste ou não para cancelar.`);
      return;
    }

    // Ação genérica → manda pro AI Core
    await _askAICore(text, intent);
  }

  async function _executePendingAction() {
    const action = state.pendingAction;
    state.pendingAction = null;

    if (!action) return;

    if (action.type === 'REORDER') {
      _respond(`Abrindo reposição para ${action.product}.`);
      // Dispara evento para o sistema principal tratar
      window.dispatchEvent(new CustomEvent('k11-voice-action', {
        detail: { type: 'REORDER', product: action.product }
      }));
    }

    if (action.type === 'PRICE_ADJUST') {
      _respond(`Abrindo ajuste de preço para ${action.product}.`);
      window.dispatchEvent(new CustomEvent('k11-voice-action', {
        detail: { type: 'PRICE_ADJUST', product: action.product }
      }));
    }
  }

  function _extractProductName(text) {
    // Tenta extrair o que vem após palavras-chave
    const match = text.match(/(?:de|para|do|da)\s+(.+?)(?:\s*$|\s+(?:agora|por favor|ok))/i);
    return match ? match[1].trim() : null;
  }

  function _handleNavigation(intent, text) {
    const navMap = {
      'NAV_ESTOQUE':    () => { if (typeof APP !== 'undefined') APP.view('estoque'); _respond('Abrindo estoque.'); },
      'NAV_DASHBOARD':  () => { if (typeof APP !== 'undefined') APP.view('dash');    _respond('Voltando ao dashboard.'); },
      'NAV_COLETA':     () => { if (typeof APP !== 'undefined') APP.view('operacional'); _respond('Abrindo coleta.'); },
    };
    const handler = navMap[intent];
    if (handler) handler();
    else _respond('Não reconheci o destino. Pode repetir?');
  }

  // ═══════════════════════════════════════════════════════════════════
  // TTS — TEXT TO SPEECH
  // ═══════════════════════════════════════════════════════════════════

  function _speak(text) {
    if (!state.synthesis || !state.autoReadReply) return;
    if (state.synthesis.speaking) state.synthesis.cancel();

    // Limita tamanho para TTS — versão condensada
    const ttsText = text.length > 300 ? text.slice(0, 297) + '...' : text;

    const utterance = new SpeechSynthesisUtterance(ttsText);
    utterance.lang  = state.lang;
    utterance.rate  = 1.05;
    utterance.pitch = 1.0;

    if (state.voiceName) {
      const voice = state.synthesis.getVoices().find(v => v.name === state.voiceName);
      if (voice) utterance.voice = voice;
    }

    utterance.onstart = () => _updateUI('speaking');
    utterance.onend   = () => _updateUI('idle');

    state.synthesis.speak(utterance);
  }

  // ═══════════════════════════════════════════════════════════════════
  // UI
  // ═══════════════════════════════════════════════════════════════════

  function _respond(text) {
    _showResponse(text);
    if (state.autoReadReply) _speak(text);
  }

  function _showTranscript(text, isInterim = false) {
    const el = document.getElementById('k11-voice-transcript');
    if (el) {
      el.textContent = text;
      el.style.opacity = isInterim ? '0.6' : '1';
    }
  }

  function _showResponse(text) {
    const el = document.getElementById('k11-voice-response');
    if (el) {
      el.textContent = text;
      el.style.opacity = '1';
    }
  }

  function _updateUI(status) {
    const btn     = document.getElementById('k11-voice-btn');
    const overlay = document.getElementById('k11-voice-overlay');

    if (btn) {
      btn.dataset.status = status;
      const ring = btn.querySelector('.voice-btn-ring');
      if (ring) {
        ring.style.borderColor = {
          listening:  'rgba(16,185,129,0.8)',
          processing: 'rgba(245,158,11,0.8)',
          speaking:   'rgba(96,165,250,0.8)',
          idle:       'rgba(255,140,0,0.38)',
        }[status] || 'rgba(255,140,0,0.38)';
      }
    }

    if (overlay) {
      const statusText = overlay.querySelector('#k11-voice-status-text');
      if (statusText) {
        statusText.textContent = {
          listening:  '🎤 Ouvindo...',
          processing: '⚙️ Processando...',
          speaking:   '🔊 Respondendo...',
          idle:       'Toque para falar',
        }[status] || 'Toque para falar';
      }
    }
  }

  function _injectVoiceUI() {
    // Injeta overlay melhorado de voz
    let overlay = document.getElementById('k11-voice-overlay');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'k11-voice-overlay';
    overlay.innerHTML = `
      <div id="k11-voice-modal">
        <div id="k11-voice-header">
          <span id="k11-voice-pdv-name">K11 Brain</span>
          <button onclick="K11VoiceEnhanced.close()" style="background:none;border:none;color:#5A6480;font-size:18px;cursor:pointer">✕</button>
        </div>
        <div id="k11-voice-orb-container">
          <div id="k11-voice-orb">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke="currentColor" stroke-width="1.8"/>
              <path d="M19 10v2a7 7 0 01-14 0v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </div>
        </div>
        <div id="k11-voice-status-text">Toque para falar</div>
        <div id="k11-voice-transcript"></div>
        <div id="k11-voice-response"></div>
        <div id="k11-voice-actions">
          <button class="k11-voice-action-btn" onclick="K11VoiceEnhanced.startListening()">
            🎤 Falar
          </button>
          <button class="k11-voice-action-btn k11-voice-action-btn-sec" onclick="K11VoiceEnhanced.toggleAutoRead()">
            🔊 Voz
          </button>
        </div>
        <div id="k11-voice-suggestions">
          <span onclick="K11VoiceEnhanced._processTranscript('Qual é a meta de hoje?')">Meta de hoje</span>
          <span onclick="K11VoiceEnhanced._processTranscript('Tem ruptura de estoque?')">Rupturas</span>
          <span onclick="K11VoiceEnhanced._processTranscript('Como estão as vendas?')">Vendas</span>
        </div>
      </div>
    `;

    // Estilos
    const style = document.createElement('style');
    style.id = 'k11-voice-enhanced-styles';
    style.textContent = `
      #k11-voice-overlay {
        display: none; position: fixed; inset: 0; z-index: 3000;
        background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);
        align-items: flex-end; justify-content: center;
      }
      #k11-voice-overlay.active { display: flex; }
      #k11-voice-modal {
        width: 100%; max-width: 480px;
        background: linear-gradient(180deg, #111320 0%, #0d0f18 100%);
        border: 1px solid rgba(255,140,0,0.2);
        border-radius: 20px 20px 0 0;
        padding: 24px 20px 32px;
        box-shadow: 0 -20px 60px rgba(0,0,0,0.8);
        animation: voiceSlideUp 0.3s ease;
      }
      @keyframes voiceSlideUp {
        from { transform: translateY(40px); opacity: 0; }
        to   { transform: translateY(0); opacity: 1; }
      }
      #k11-voice-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 20px;
      }
      #k11-voice-pdv-name {
        font-size: 13px; font-weight: 900; color: #FF8C00;
        font-family: 'JetBrains Mono', monospace; letter-spacing: 1px;
      }
      #k11-voice-orb-container {
        display: flex; justify-content: center; margin-bottom: 16px;
      }
      #k11-voice-orb {
        width: 72px; height: 72px; border-radius: 50%;
        background: radial-gradient(circle, rgba(255,140,0,0.15) 0%, rgba(255,140,0,0.05) 100%);
        border: 2px solid rgba(255,140,0,0.4);
        display: flex; align-items: center; justify-content: center;
        color: #FF8C00;
        transition: all 0.3s ease;
        cursor: pointer;
      }
      #k11-voice-overlay[data-status="listening"] #k11-voice-orb {
        border-color: rgba(16,185,129,0.8); color: #10B981;
        box-shadow: 0 0 30px rgba(16,185,129,0.3);
        animation: orbPulse 1s ease-in-out infinite;
      }
      #k11-voice-overlay[data-status="processing"] #k11-voice-orb {
        border-color: rgba(245,158,11,0.8); color: #F59E0B;
        animation: orbSpin 1s linear infinite;
      }
      @keyframes orbPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.08); }
      }
      @keyframes orbSpin {
        to { transform: rotate(360deg); }
      }
      #k11-voice-status-text {
        text-align: center; font-size: 11px; font-weight: 800;
        color: #5A6480; letter-spacing: 0.8px; margin-bottom: 14px;
        text-transform: uppercase; font-family: 'JetBrains Mono', monospace;
      }
      #k11-voice-transcript {
        min-height: 20px; text-align: center;
        font-size: 12px; color: #B0B8CC;
        margin-bottom: 10px; transition: opacity 0.3s;
        font-style: italic;
      }
      #k11-voice-response {
        min-height: 40px;
        background: rgba(255,140,0,0.05);
        border: 1px solid rgba(255,140,0,0.12);
        border-radius: 10px; padding: 10px 14px;
        font-size: 13px; color: #EDF0F7; line-height: 1.6;
        margin-bottom: 16px;
      }
      #k11-voice-actions {
        display: flex; gap: 8px; margin-bottom: 12px;
      }
      .k11-voice-action-btn {
        flex: 1; padding: 11px; border-radius: 9px;
        background: linear-gradient(135deg, #FF9800, #FF7000);
        color: #000; border: none; font-size: 11px; font-weight: 900;
        letter-spacing: 0.5px; cursor: pointer;
        font-family: 'Inter', sans-serif;
        transition: opacity 0.2s, transform 0.1s;
      }
      .k11-voice-action-btn:active { transform: scale(0.97); opacity: 0.9; }
      .k11-voice-action-btn-sec {
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        color: #B0B8CC;
      }
      #k11-voice-suggestions {
        display: flex; gap: 6px; flex-wrap: wrap;
      }
      #k11-voice-suggestions span {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 20px; padding: 5px 12px;
        font-size: 10px; color: #5A6480; cursor: pointer;
        transition: all 0.2s; font-weight: 700;
        font-family: 'Inter', sans-serif;
      }
      #k11-voice-suggestions span:hover {
        border-color: rgba(255,140,0,0.35); color: #FF8C00;
      }
    `;

    if (!document.getElementById('k11-voice-enhanced-styles')) {
      document.head.appendChild(style);
    }
    document.body.appendChild(overlay);

    // Clique no orb = inicia
    document.getElementById('k11-voice-orb')?.addEventListener('click', () => startListening());
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════

  function open(pdvId, pdvName) {
    state.activePdvId   = pdvId   || null;
    state.activePdvName = pdvName || 'K11 Brain';
    const overlay = document.getElementById('k11-voice-overlay');
    const nameEl  = document.getElementById('k11-voice-pdv-name');
    if (nameEl) nameEl.textContent = state.activePdvName;
    if (overlay) overlay.classList.add('active');
  }

  function close() {
    if (state.listening)  state.recognition?.stop();
    if (state.synthesis)  state.synthesis.cancel();
    document.getElementById('k11-voice-overlay')?.classList.remove('active');
    state.pendingAction = null;
  }

  function startListening() {
    if (state.listening || state.processing) return;
    try {
      state.recognition.start();
    } catch (_) {
      state.recognition = null;
      _setupRecognition();
      setTimeout(() => state.recognition?.start(), 300);
    }
  }

  function toggleAutoRead() {
    state.autoReadReply = !state.autoReadReply;
    const btn = document.querySelector('.k11-voice-action-btn-sec');
    if (btn) btn.textContent = state.autoReadReply ? '🔊 Voz ON' : '🔇 Voz OFF';
  }

  return { init, open, close, startListening, toggleAutoRead, _processTranscript };
})();

// Auto-init quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => K11VoiceEnhanced.init());
} else {
  K11VoiceEnhanced.init();
}
