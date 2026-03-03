/**
 * K11 SUPERVISOR FRONTEND
 * Dashboard + Chat Interface
 * 
 * INTEGRAÇÃO:
 * 1. Adicionar ao dashboard.html: <script src="k11-supervisor-frontend.js"></script>
 * 2. Chamar K11Supervisor.init() após login
 */

'use strict';

const K11Supervisor = (() => {
  const state = {
    connected: false,
    sseClient: null,
    currentData: {
      commercial: null,
      operational: null,
      strategy: null,
      lastUpdate: null
    },
    chatMessages: [],
  };

  // ════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════

  function init() {
    console.log('[K11 Supervisor] Inicializando...');
    
    connectSSE();
    setupChatInterface();
    
    console.log('[K11 Supervisor] ✅ Pronto!');
  }

  // ════════════════════════════════════════════════════════════════
  // SSE - Recebe atualizações em tempo real
  // ════════════════════════════════════════════════════════════════

  function connectSSE() {
    const token = sessionStorage.getItem('k11_jwt');
    if (!token) {
      console.warn('[K11 Supervisor] Token não disponível');
      return;
    }

    const url = `${window.location.origin}/api/supervisor/stream?token=${token}`;
    state.sseClient = new EventSource(url);

    state.sseClient.addEventListener('connected', (e) => {
      state.connected = true;
      console.log('[K11 Supervisor] ✅ Conectado ao servidor');
      updateConnectionStatus('online');
    });

    state.sseClient.addEventListener('supervisor_update', (e) => {
      const data = JSON.parse(e.data);
      state.currentData = {
        commercial: data.commercial,
        operational: data.operational,
        strategy: data.strategy,
        lastUpdate: data.timestamp
      };
      
      console.log('[K11 Supervisor] Análise recebida', data);
      updateDashboard();
      showCriticalAlerts();
    });

    state.sseClient.addEventListener('error', (e) => {
      state.connected = false;
      console.error('[K11 Supervisor] SSE Error:', e);
      updateConnectionStatus('offline');
      reconnectSSEAfterDelay();
    });
  }

  function reconnectSSEAfterDelay() {
    setTimeout(() => {
      if (!state.connected) {
        console.log('[K11 Supervisor] Tentando reconectar...');
        connectSSE();
      }
    }, 5000);
  }

  // ════════════════════════════════════════════════════════════════
  // ATUALIZAR DASHBOARD
  // ════════════════════════════════════════════════════════════════

  function updateDashboard() {
    const { commercial, operational, strategy } = state.currentData;

    // Atualiza seção comercial
    if (commercial) {
      updateCommercialSection(commercial);
    }

    // Atualiza seção operacional
    if (operational) {
      updateOperationalSection(operational);
    }

    // Atualiza seção estratégica
    if (strategy) {
      updateStrategySection(strategy);
    }
  }

  function updateCommercialSection(data) {
    const el = document.getElementById('supervisor-commercial');
    if (!el) return;

    let html = '<h3>💰 INTELIGÊNCIA COMERCIAL</h3>';
    html += '<table><tr><th>Rank</th><th>PDV</th><th>Vendas</th><th>Trend</th><th>Top Produtos</th></tr>';

    data.forEach((pdv, idx) => {
      const trend = parseFloat(pdv.salesTrend);
      const trendClass = trend > 0 ? 'trend-up' : 'trend-down';
      const topProdStr = pdv.topProducts.map(p => p.productId).join(' · ');
      
      html += `
        <tr>
          <td>${['🥇', '🥈', '🥉', '4️⃣'][idx] || idx + 1}</td>
          <td><strong>${pdv.name}</strong></td>
          <td>R$ ${pdv.salesToday.toLocaleString()}</td>
          <td class="${trendClass}">${trend > 0 ? '+' : ''}${trend.toFixed(1)}%</td>
          <td>${topProdStr}</td>
        </tr>
      `;
    });

    html += '</table>';
    el.innerHTML = html;
  }

  function updateOperationalSection(data) {
    const el = document.getElementById('supervisor-operational');
    if (!el) return;

    let html = '<h3>⚙️ ALERTAS OPERACIONAIS</h3>';

    data.forEach((alert) => {
      const bgClass = {
        'CRITICAL': 'alert-critical',
        'WARNING': 'alert-warning',
        'OPPORTUNITY': 'alert-opportunity',
        'OPTIMIZATION': 'alert-optimization'
      }[alert.type] || 'alert-normal';

      html += `
        <div class="alert-box ${bgClass}">
          <strong>#${alert.priority}</strong> — ${alert.title}<br>
          <small>Ação: ${alert.action} | Impacto: ${alert.estimatedLoss ? 'R$ ' + alert.estimatedLoss.toFixed(0) : alert.impact || 'N/A'}</small>
          <button onclick="K11Supervisor.executeAction('${alert.action}')" style="margin-top: 5px; padding: 4px 8px; background: #ff8c00; color: black; border: none; border-radius: 3px; font-size: 10px; cursor: pointer;">
            Agir Agora
          </button>
        </div>
      `;
    });

    el.innerHTML = html;
  }

  function updateStrategySection(strategy) {
    const el = document.getElementById('supervisor-strategy');
    if (!el) return;

    let html = '<h3>🎯 ESTRATÉGIA PARA SUPERAR</h3>';

    if (strategy.recommendations && Array.isArray(strategy.recommendations)) {
      strategy.recommendations.forEach((rec, idx) => {
        html += `
          <div style="padding: 10px; margin: 8px 0; background: rgba(59,130,246,.08); border-left: 3px solid #3b82f6; border-radius: 4px;">
            <strong>${idx + 1}. ${rec.goal || rec.title}</strong><br>
            <small>Tática: ${rec.tactic || rec.description}</small><br>
            <small style="color: #10b981;">📈 ${rec.expectedLift || '+15%'} esperado</small>
          </div>
        `;
      });
    }

    el.innerHTML = html;
  }

  // ════════════════════════════════════════════════════════════════
  // CHAT COM IA
  // ════════════════════════════════════════════════════════════════

  function setupChatInterface() {
    const chatBtn = document.getElementById('supervisor-chat-btn');
    const chatModal = document.getElementById('supervisor-chat-modal');
    const chatInput = document.getElementById('supervisor-chat-input');
    const chatSend = document.getElementById('supervisor-chat-send');

    if (!chatBtn) return; // Chat desabilitado se não tiver no HTML

    chatBtn.addEventListener('click', () => {
      chatModal.style.display = chatModal.style.display === 'none' ? 'block' : 'none';
    });

    chatSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  async function sendMessage() {
    const input = document.getElementById('supervisor-chat-input');
    const message = input.value.trim();

    if (!message) return;

    const token = sessionStorage.getItem('k11_jwt');
    if (!token) {
      alert('Faça login para usar o chat');
      return;
    }

    // Adiciona mensagem do usuário
    addChatMessage(message, 'user');
    input.value = '';

    // Envia ao servidor
    try {
      const response = await fetch(`${window.location.origin}/api/supervisor/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message })
      });

      const data = await response.json();

      if (data.success) {
        addChatMessage(data.response, 'supervisor');
      } else {
        addChatMessage(`Erro: ${data.error}`, 'error');
      }

    } catch (err) {
      addChatMessage(`Erro de conexão: ${err.message}`, 'error');
    }
  }

  function addChatMessage(text, sender) {
    const container = document.getElementById('supervisor-chat-messages');
    if (!container) return;

    const messageEl = document.createElement('div');
    messageEl.style.marginBottom = '10px';
    messageEl.style.padding = '8px';
    messageEl.style.borderRadius = '4px';
    messageEl.style.fontSize = '11px';

    if (sender === 'user') {
      messageEl.style.background = 'rgba(59,130,246,.15)';
      messageEl.style.textAlign = 'right';
      messageEl.textContent = text;
    } else if (sender === 'supervisor') {
      messageEl.style.background = 'rgba(255,140,0,.1)';
      messageEl.textContent = '🤖 Supervisor: ' + text;
    } else {
      messageEl.style.background = 'rgba(239,68,68,.1)';
      messageEl.style.color = '#f87171';
      messageEl.textContent = '⚠️ ' + text;
    }

    container.appendChild(messageEl);
    container.scrollTop = container.scrollHeight;

    state.chatMessages.push({ sender, text, timestamp: new Date() });
  }

  // ════════════════════════════════════════════════════════════════
  // ALERTAS CRÍTICOS
  // ════════════════════════════════════════════════════════════════

  function showCriticalAlerts() {
    const critical = state.currentData.operational?.filter(a => a.type === 'CRITICAL') || [];

    for (const alert of critical) {
      // Mostra notificação toast/push
      showNotification(alert.title, {
        body: alert.action,
        tag: 'supervisor-' + alert.priority,
        requireInteraction: true
      });
    }
  }

  function showNotification(title, options = {}) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, options);
    } else {
      // Fallback: toast na tela
      const toast = document.createElement('div');
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f87171;
        color: black;
        padding: 15px;
        border-radius: 6px;
        font-weight: bold;
        z-index: 9999;
        animation: slideIn 0.3s ease-in-out;
      `;
      toast.textContent = title;
      document.body.appendChild(toast);

      setTimeout(() => toast.remove(), 5000);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // AÇÕES EXECUTÁVEIS
  // ════════════════════════════════════════════════════════════════

  async function executeAction(action) {
    const token = sessionStorage.getItem('k11_jwt');
    if (!token) {
      alert('Autentique-se para executar ações');
      return;
    }

    console.log(`[K11 Supervisor] Executando ação: ${action}`);

    switch (action) {
      case 'REPOR_URGENTE':
        // TODO: Abrir formulário de PO
        alert('🛒 Criar PO de reposição urgente');
        break;

      case 'MONITORAR':
        alert('👁️ Produto adicionado ao monitoramento');
        break;

      case 'FOLLOW_UP':
        alert('📞 Follow-up com fornecedor agendado');
        break;

      default:
        console.log('Ação desconhecida:', action);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // STATUS DE CONEXÃO
  // ════════════════════════════════════════════════════════════════

  function updateConnectionStatus(status) {
    const el = document.getElementById('supervisor-status');
    if (!el) return;

    el.textContent = status === 'online' ? '🟢 Supervisor Online' : '🔴 Supervisor Offline';
    el.style.color = status === 'online' ? '#10b981' : '#f87171';
  }

  // ════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════════════════════

  return {
    init,
    executeAction,
    getState: () => state.currentData,
    getChatHistory: () => state.chatMessages,
    sendMessage: (msg) => {
      document.getElementById('supervisor-chat-input').value = msg;
      sendMessage();
    }
  };
})();

// Auto-init quando disponível
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => K11Supervisor.init(), 500);
  });
} else {
  setTimeout(() => K11Supervisor.init(), 500);
}

console.log('✅ K11 Supervisor Frontend carregado');
