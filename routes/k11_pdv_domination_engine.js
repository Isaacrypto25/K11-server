/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║     K11 PDV DOMINATION ENGINE — Seu PDV ACIMA de TODOS          ║
 * ║                                                                 ║
 * ║  Motor que garante seu PDV sempre estar no topo do ranking    ║
 * ║  Análise competitiva agressiva + Recomendações ofensivas      ║
 * ╚════════════════════════════════════════════════════════════════╝
 */

'use strict';

const pdvDomination = (() => {
  const state = {
    myPdvId: null,
    myPdvName: null,
    
    // Comparação
    competitorMetrics: new Map(),
    myMetrics: null,
    
    // Estratégia
    aggressiveActions: [],
    dailyTargets: null,
    
    // Real-time
    sseClients: new Set(),
    analysisInterval: null,
    
    // Dependencies
    datastore: null,
    supabase: null,
    logger: null,
  };

  // ════════════════════════════════════════════════════════════════
  // INICIALIZAÇÃO
  // ════════════════════════════════════════════════════════════════

  function init(datastore, supabaseClient, logger, pdvId, pdvName) {
    state.datastore = datastore;
    state.supabase = supabaseClient;
    state.logger = logger;
    state.myPdvId = pdvId;
    state.myPdvName = pdvName;

    logger?.info('PDV-DOMINATION', `🔥 Motor ativado para ${pdvName} (ID: ${pdvId})`);

    // Análise a cada 5 minutos (agressivo)
    scheduleAnalysis();
    
    // Primeira análise após 10s
    setTimeout(() => runDominationAnalysis(), 10000);

    logger?.info('PDV-DOMINATION', '✅ Pronto para dominar!');
  }

  function scheduleAnalysis() {
    if (state.analysisInterval) clearInterval(state.analysisInterval);
    state.analysisInterval = setInterval(() => runDominationAnalysis(), 300000); // 5 min
  }

  // ════════════════════════════════════════════════════════════════
  // ANÁLISE AGRESSIVA
  // ════════════════════════════════════════════════════════════════

  async function runDominationAnalysis() {
    try {
      state.logger?.info('PDV-DOMINATION', '📊 Iniciando análise de dominação...');

      // 1. Coleta dados seu PDV
      const myData = await getMyPDVMetrics();
      state.myMetrics = myData;

      // 2. Coleta dados concorrentes
      const competitors = await getCompetitorMetrics();
      state.competitorMetrics = new Map(competitors.map(c => [c.pdvId, c]));

      // 3. Análise comparativa
      const comparison = analyzeCompetition(myData, competitors);

      // 4. Gera ações agressivas
      const actions = generateAggressiveActions(comparison);
      state.aggressiveActions = actions;

      // 5. Define metas diárias
      state.dailyTargets = generateDailyTargets(comparison);

      // 6. Broadcast
      _broadcastSSE('domination_update', {
        myMetrics: myData,
        competitors,
        comparison,
        aggressiveActions: actions,
        dailyTargets: state.dailyTargets,
        timestamp: new Date()
      });

      state.logger?.info('PDV-DOMINATION', '✅ Análise concluída', {
        myPosition: comparison.myRanking,
        targetPosition: 1,
        gap: comparison.gapToFirst,
        actionsPlanned: actions.length
      });

    } catch (err) {
      state.logger?.error('PDV-DOMINATION', 'Erro na análise', { error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════════
  // MÉTRICAS DO SEU PDV
  // ════════════════════════════════════════════════════════════════

  async function getMyPDVMetrics() {
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const semanaAtras = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const mesAtras = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

      const { data, error } = await state.supabase
        .from('pdv')
        .select('loja, data_lancamento, nr_produto, quantidade_vendida')
        .eq('loja', state.myPdvId)
        .gte('data_lancamento', mesAtras);

      if (error) throw error;

      let salesToday = 0, salesWeek = 0, salesMonth = 0;
      const produtos = {};
      for (const row of data) {
        const qtd = parseFloat(row.quantidade_vendida) || 0;
        salesMonth += qtd;
        if (row.data_lancamento >= semanaAtras) salesWeek += qtd;
        if (row.data_lancamento === hoje) salesToday += qtd;
        if (row.nr_produto) produtos[row.nr_produto] = (produtos[row.nr_produto] || 0) + qtd;
      }

      return {
        pdvId: state.myPdvId,
        pdvName: state.myPdvName,
        salesToday,
        salesWeek,
        salesMonth,
        avgTicket: salesMonth > 0 ? salesMonth / Math.max(Object.keys(produtos).length, 1) : 0,
        margin: 0,
        productsMoved: Object.keys(produtos).length,
        customersToday: 0,
        customerFrequency: 0,
        // Calcula métricas derivadas
        dailyAverage: data.vendas_semana / 7,
        growthWeek: ((data.vendas_hoje - (data.vendas_semana / 7)) / (data.vendas_semana / 7) * 100).toFixed(1),
        growthMonth: ((data.vendas_semana - (data.vendas_mes / 4)) / (data.vendas_mes / 4) * 100).toFixed(1)
      };

    } catch (err) {
      state.logger?.error('PDV-DOMINATION', 'Erro ao carregar métricas do PDV', { error: err.message });
      return null;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // MÉTRICAS CONCORRENTES
  // ════════════════════════════════════════════════════════════════

  async function getCompetitorMetrics() {
    try {
      const { data, error } = await state.supabase
        .from('pdv')
        .select(`
          id, 
          nome, 
          vendas_hoje, 
          quantidade_vendida
        `)
        .neq('loja', state.myPdvId)
        .gte('data_lancamento', new Date(Date.now() - 86400000).toISOString().slice(0, 10));

      if (error) throw error;

      // Agrupa por loja
      const lojaMap = {};
      for (const row of data) {
        const loja = row.loja;
        if (!lojaMap[loja]) lojaMap[loja] = 0;
        lojaMap[loja] += parseFloat(row.quantidade_vendida) || 0;
      }

      return Object.entries(lojaMap)
        .sort((a, b) => b[1] - a[1])
        .map(([loja, vendas], idx) => ({
          pdvId: loja,
          pdvName: loja,
          rank: idx + 1,
          salesToday: vendas,
          salesWeek: vendas * 7,
          avgTicket: 0,
          margin: 0,
          customersToday: 0,
          strength: idx === 0 ? 'STRONG' : idx <= 1 ? 'MEDIUM' : 'WEAK'
        }));

    } catch (err) {
      state.logger?.error('PDV-DOMINATION', 'Erro ao carregar métricas concorrentes', { error: err.message });
      return [];
    }
  }

  // ════════════════════════════════════════════════════════════════
  // ANÁLISE COMPETITIVA
  // ════════════════════════════════════════════════════════════════

  function analyzeCompetition(myData, competitors) {
    if (!myData || competitors.length === 0) return null;

    // Encontra posição do meu PDV
    const myRanking = competitors.findIndex(c => myData.salesToday > c.salesToday) + 1;
    
    // Calcula gap para o primeiro
    const first = competitors[0];
    const gapToFirst = first ? first.salesToday - myData.salesToday : 0;
    const percentGapToFirst = first ? ((gapToFirst / first.salesToday) * 100).toFixed(1) : 0;

    // Identifica força/fraqueza
    const strengths = [];
    const weaknesses = [];

    if (myData.margin > competitors[0].margin) {
      strengths.push('MARGEM superior');
    } else {
      weaknesses.push('MARGEM inferior');
    }

    if (myData.avgTicket > competitors[0].avgTicket) {
      strengths.push('TICKET MÉDIO maior');
    } else {
      weaknesses.push('TICKET MÉDIO menor');
    }

    if (myData.growthWeek > 0) {
      strengths.push('CRESCENDO esta semana');
    } else {
      weaknesses.push('CAINDO esta semana');
    }

    return {
      myRanking,
      myData,
      competitors,
      firstPlace: first,
      gapToFirst,
      percentGapToFirst,
      strengths,
      weaknesses,
      opportunity: first ? {
        needToGain: gapToFirst,
        canAchieveWith: Math.ceil(gapToFirst / (myData.avgTicket || 100)),
        estimatedDays: Math.ceil(gapToFirst / (myData.dailyAverage || 1000))
      } : null
    };
  }

  // ════════════════════════════════════════════════════════════════
  // AÇÕES AGRESSIVAS
  // ════════════════════════════════════════════════════════════════

  async function generateAggressiveActions(comparison) {
    const actions = [];

    if (!comparison) return actions;

    // Ação 1: Aumentar ticket médio
    const avgTicketGap = comparison.firstPlace.avgTicket - comparison.myData.avgTicket;
    if (avgTicketGap > 0) {
      actions.push({
        priority: 1,
        type: 'INCREASE_TICKET',
        title: 'AUMENTAR TICKET MÉDIO',
        description: `Concorrente ${comparison.firstPlace.pdvName} tem ticket ${avgTicketGap.toFixed(0)} maior`,
        tactic: 'Bundle: vender 2 produtos relacionados com desconto',
        expectedIncrease: Math.ceil(avgTicketGap * 0.3),
        effort: 'BAIXO'
      });
    }

    // Ação 2: Aumentar margem
    const marginGap = comparison.firstPlace.margin - comparison.myData.margin;
    if (marginGap > 0) {
      actions.push({
        priority: 2,
        type: 'INCREASE_MARGIN',
        title: 'AUMENTAR MARGEM OPERACIONAL',
        description: `Margem ${marginGap.toFixed(1)}pp abaixo do líder`,
        tactic: 'Vender mais produtos high-margin (Adaptador, Conexão)',
        expectedIncrease: marginGap * 0.4,
        effort: 'MÉDIO'
      });
    }

    // Ação 3: Crescimento agressivo
    if (comparison.opportunity) {
      actions.push({
        priority: 1,
        type: 'AGGRESSIVE_GROWTH',
        title: '🔥 ULTRAPASSAR PRIMEIRO LUGAR',
        description: `Precisa de +${comparison.opportunity.needToGain.toFixed(0)} em vendas`,
        tactic: `Promoção relâmpago: vender ${comparison.opportunity.canAchieveWith} unidades extras`,
        daysToAchieve: comparison.opportunity.estimatedDays,
        estimatedRevenue: comparison.opportunity.needToGain,
        effort: 'ALTO'
      });
    }

    // Ação 4: Aumentar frequência de clientes
    const freqGap = comparison.firstPlace.customersToday - comparison.myData.customersToday;
    if (freqGap > 0) {
      actions.push({
        priority: 2,
        type: 'INCREASE_FREQUENCY',
        title: 'AUMENTAR FREQUÊNCIA DE CLIENTES',
        description: `${freqGap} clientes a menos que o líder`,
        tactic: 'Programa de fidelidade + SMS/WhatsApp',
        expectedIncrease: Math.ceil(freqGap * 0.2),
        effort: 'MÉDIO'
      });
    }

    // Ação 5: Ofensiva nos produtos TOP
    actions.push({
      priority: 1,
      type: 'TOP_PRODUCTS_OFFENSIVE',
      title: '⚡ DOMINAR PRODUTOS TOP',
      description: 'Concentrar estoque e promoção nos 3 produtos mais vendidos',
      tactic: 'Estoque + Promoção + Visibilidade nesses produtos',
      expectedLift: '+20-30% em volume',
      effort: 'MÉDIO'
    });

    return actions.sort((a, b) => a.priority - b.priority);
  }

  // ════════════════════════════════════════════════════════════════
  // METAS DIÁRIAS
  // ════════════════════════════════════════════════════════════════

  function generateDailyTargets(comparison) {
    if (!comparison) return null;

    const today = new Date().toISOString().split('T')[0];
    
    return {
      date: today,
      salesTarget: comparison.myData.salesToday * 1.25, // +25%
      ticketTarget: comparison.myData.avgTicket * 1.1, // +10%
      customersTarget: comparison.myData.customersToday * 1.15, // +15%
      marginTarget: comparison.myData.margin + 2, // +2pp
      checkpointsMorning: {
        time: '12:00',
        salesTarget: comparison.myData.salesToday * 0.5
      },
      checkpointsAfternoon: {
        time: '18:00',
        salesTarget: comparison.myData.salesToday * 0.85
      },
      bonusIfAchieve: {
        '+25percent': 'R$ 500',
        '+30percent': 'R$ 1000',
        '+50percent': 'R$ 2000'
      }
    };
  }

  // ════════════════════════════════════════════════════════════════
  // SSE
  // ════════════════════════════════════════════════════════════════

  function addSSEClient(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    state.sseClients.add(res);

    _sendToClient(res, 'connected', {
      status: 'domination_engine_ready',
      myPdv: state.myPdvName,
      targetPosition: 1
    });

    res.on('close', () => {
      state.sseClients.delete(res);
    });
  }

  function _broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of state.sseClients) {
      try { client.write(payload); } catch (_) { state.sseClients.delete(client); }
    }
  }

  function _sendToClient(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════════════════════

  return {
    init,
    addSSEClient,
    getState: () => ({
      myMetrics: state.myMetrics,
      competitors: Array.from(state.competitorMetrics.values()),
      aggressiveActions: state.aggressiveActions,
      dailyTargets: state.dailyTargets,
      sseClients: state.sseClients.size
    }),
    forceAnalysis: runDominationAnalysis
  };
})();

module.exports = pdvDomination;
