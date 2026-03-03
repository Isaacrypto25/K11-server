/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║   K11 DECISION ENGINE                                                ║
 * ║   Cérebro Autônomo — Age Sozinho, Aprende com Seus Dados             ║
 * ║                                                                       ║
 * ║   3 motores integrados:                                               ║
 * ║   1. PDV Health Score   — score 0-100 por PDV ao longo do tempo      ║
 * ║   2. Demand Forecast    — previsão de demanda com sazonalidade        ║
 * ║   3. Auto Replenishment — cria POs automaticamente, sem humano        ║
 * ║                                                                       ║
 * ║   INTEGRAÇÃO:                                                         ║
 * ║   const engine = require('./routes/k11_decision_engine');             ║
 * ║   engine.init(datastore, supabaseClient, logger);                     ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

'use strict';

const https = require('https');

const decisionEngine = (() => {

  // ── ESTADO GLOBAL ───────────────────────────────────────────────────
  const state = {
    // Scores de saúde dos PDVs (acumulado)
    pdvHealthScores: new Map(),      // pdvId → HealthScore[]
    pdvHealthCurrent: new Map(),     // pdvId → score atual (0-100)

    // Previsões de demanda
    demandForecasts: new Map(),      // produtoId → DemandForecast

    // Reposições automáticas
    autoReplenishments: [],          // POs criadas automaticamente
    replenishmentLog: [],            // log completo de ações

    // SSE
    sseClients: new Set(),
    lastCycleTs: null,
    cycleInterval: null,

    // Dependências
    datastore: null,
    supabase:  null,
    logger:    null,

    // Config
    cycleIntervalMs:      60 * 60 * 1000,  // ciclo a cada 1h
    healthScoreWindow:    30,               // dias de histórico p/ score
    forecastHorizonDays:  14,              // previsão para 14 dias à frente
    autoReplenishEnabled: true,
    safetyStockDays:      5,               // dias de estoque de segurança
  };

  // ════════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════════

  function init(datastore, supabaseClient, logger, options = {}) {
    state.datastore = datastore;
    state.supabase  = supabaseClient;
    state.logger    = logger;

    if (options.cycleIntervalMs)      state.cycleIntervalMs      = options.cycleIntervalMs;
    if (options.safetyStockDays)      state.safetyStockDays      = options.safetyStockDays;
    if (options.forecastHorizonDays)  state.forecastHorizonDays  = options.forecastHorizonDays;
    if (options.autoReplenishEnabled !== undefined) state.autoReplenishEnabled = options.autoReplenishEnabled;

    if (!process.env.GROQ_API_KEY) {
      logger?.warn('DECISION-ENGINE', '⚠️  GROQ_API_KEY não definida');
    }

    logger?.info('DECISION-ENGINE', '🧠 Decision Engine inicializando...');

    // Garante tabelas necessárias no Supabase
    _ensureSchema().then(() => {
      // Primeiro ciclo após 30s (dá tempo dos outros módulos subirem)
      setTimeout(() => runFullCycle(), 30000);
      _scheduleCycle();
      logger?.info('DECISION-ENGINE', `✅ Pronto! Ciclo a cada ${state.cycleIntervalMs / 60000} min`);
    });
  }

  function _scheduleCycle() {
    if (state.cycleInterval) clearInterval(state.cycleInterval);
    state.cycleInterval = setInterval(() => runFullCycle(), state.cycleIntervalMs);
  }

  // ════════════════════════════════════════════════════════════════════
  // SCHEMA — Garante tabelas extras no Supabase
  // ════════════════════════════════════════════════════════════════════

  async function _ensureSchema() {
    // Cria tabela de scores de saúde se não existir
    // (executa via RPC ou ignora se já existir)
    const tables = [
      `CREATE TABLE IF NOT EXISTS pdv_health_scores (
        id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        pdv_id        text NOT NULL,
        score         numeric(5,2) NOT NULL,
        score_vendas  numeric(5,2),
        score_margem  numeric(5,2),
        score_ruptura numeric(5,2),
        score_ticket  numeric(5,2),
        score_tendencia numeric(5,2),
        details       jsonb,
        recorded_at   timestamptz DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS demand_forecasts (
        id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        produto_id    text NOT NULL,
        forecast_date date NOT NULL,
        qty_predicted numeric(10,2),
        qty_actual    numeric(10,2),
        confidence    text,
        seasonality_factor numeric(5,3),
        created_at    timestamptz DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS auto_replenishments (
        id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        produto_id    text NOT NULL,
        produto_nome  text,
        fornecedor_id text,
        qty_ordered   numeric(10,2),
        qty_current   numeric(10,2),
        reason        text,
        forecast_days numeric(5,1),
        status        text DEFAULT 'PENDING',
        approved_at   timestamptz,
        created_at    timestamptz DEFAULT now()
      )`,
    ];

    for (const sql of tables) {
      try {
        await state.supabase.rpc('exec_sql', { sql }).catch(() => {});
        // Se rpc não existir, silencia — as tabelas podem já existir
      } catch (_) {}
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // CICLO COMPLETO
  // ════════════════════════════════════════════════════════════════════

  async function runFullCycle() {
    state.logger?.info('DECISION-ENGINE', '⚙️  Iniciando ciclo de decisão...');

    try {
      // 1. Calcula scores de saúde dos PDVs
      const healthResults = await runHealthScoreCycle();

      // 2. Gera previsões de demanda
      const forecasts = await runDemandForecastCycle();

      // 3. Decide reposições automáticas (usa os forecasts)
      const replenishments = await runAutoReplenishmentCycle(forecasts);

      state.lastCycleTs = new Date();

      // 4. Broadcast SSE
      _broadcastSSE('decision_cycle', {
        healthScores:   healthResults,
        forecasts:      forecasts.slice(0, 20),
        replenishments: replenishments,
        timestamp:      state.lastCycleTs,
        summary: {
          pdvsScored:      healthResults.length,
          productsForecasted: forecasts.length,
          posCreated:      replenishments.filter(r => r.status === 'CREATED').length,
          posSkipped:      replenishments.filter(r => r.status === 'SKIPPED').length,
        }
      });

      state.logger?.info('DECISION-ENGINE', '✅ Ciclo completo', {
        pdvs:  healthResults.length,
        forecasts: forecasts.length,
        posCreated: replenishments.filter(r => r.status === 'CREATED').length,
      });

    } catch (err) {
      state.logger?.error('DECISION-ENGINE', 'Erro no ciclo', { error: err.message });
    }
  }

  // ════════════════════════════════════════════════════════════════════
  // MOTOR 1 — PDV HEALTH SCORE
  // Score 0-100 calculado em 5 dimensões, persistido ao longo do tempo
  // ════════════════════════════════════════════════════════════════════

  async function runHealthScoreCycle() {
    const results = [];

    try {
      const { data: pdvs, error } = await state.supabase
        .from('pdv')
        .select('id, nome, vendas_hoje, vendas_semana, vendas_mes, ticket_medio, margem_operacional, clientes_hoje');

      if (error) throw error;

      for (const pdv of pdvs) {
        const score = await calculatePDVHealthScore(pdv);
        results.push(score);

        // Persiste no Supabase
        await _persistHealthScore(score);

        // Atualiza cache
        const history = state.pdvHealthScores.get(pdv.id) || [];
        history.push(score);
        if (history.length > 90) history.shift(); // 90 dias máximo
        state.pdvHealthScores.set(pdv.id, history);
        state.pdvHealthCurrent.set(pdv.id, score.score);
      }

    } catch (err) {
      state.logger?.error('DECISION-ENGINE', 'Erro em healthScore', { error: err.message });
    }

    return results;
  }

  async function calculatePDVHealthScore(pdv) {
    // ── Dimensão 1: Vendas (vs média da semana) ─────────────────────
    const dailyAvg = (pdv.vendas_semana || 0) / 7;
    const salesPerf = dailyAvg > 0 ? Math.min((pdv.vendas_hoje / dailyAvg) * 100, 150) : 50;
    const scoreVendas = _normalize(salesPerf, 50, 150); // 50=ruim, 150=excelente

    // ── Dimensão 2: Margem (vs benchmark 35%) ───────────────────────
    const margem = pdv.margem_operacional || 0;
    const scoreMargem = _normalize(margem, 15, 55); // 15%=crítico, 55%=excelente

    // ── Dimensão 3: Ruptura (busca do banco) ────────────────────────
    const ruptureRate = await _getRuptureRate(pdv.id);
    const scoreRuptura = _normalize(100 - ruptureRate, 50, 100); // invertido: menos ruptura = melhor

    // ── Dimensão 4: Ticket Médio (vs histórico) ─────────────────────
    const ticketHistory = await _getAvgTicketHistory(pdv.id);
    const ticketPerf = ticketHistory > 0 ? Math.min((pdv.ticket_medio / ticketHistory) * 100, 150) : 50;
    const scoreTicket = _normalize(ticketPerf, 60, 140);

    // ── Dimensão 5: Tendência (últimos 7 dias vs 30 dias) ───────────
    const trend = await _getSalesTrend(pdv.id);
    const scoreTendencia = _normalize(trend + 100, 70, 130); // trend -30% a +30% → normalizado

    // ── Score final ponderado ────────────────────────────────────────
    const score = (
      scoreVendas   * 0.30 +  // 30% peso vendas
      scoreMargem   * 0.25 +  // 25% margem
      scoreRuptura  * 0.20 +  // 20% ruptura
      scoreTicket   * 0.15 +  // 15% ticket
      scoreTendencia * 0.10   // 10% tendência
    );

    const scoreRounded = parseFloat(score.toFixed(1));
    const grade = scoreRounded >= 80 ? 'A' : scoreRounded >= 65 ? 'B' : scoreRounded >= 50 ? 'C' : scoreRounded >= 35 ? 'D' : 'F';
    const status = scoreRounded >= 80 ? 'EXCELENTE' : scoreRounded >= 65 ? 'BOM' : scoreRounded >= 50 ? 'REGULAR' : scoreRounded >= 35 ? 'CRÍTICO' : 'COLAPSO';

    return {
      pdvId:          pdv.id,
      pdvName:        pdv.nome,
      score:          scoreRounded,
      grade,
      status,
      dimensions: {
        vendas:    parseFloat(scoreVendas.toFixed(1)),
        margem:    parseFloat(scoreMargem.toFixed(1)),
        ruptura:   parseFloat(scoreRuptura.toFixed(1)),
        ticket:    parseFloat(scoreTicket.toFixed(1)),
        tendencia: parseFloat(scoreTendencia.toFixed(1)),
      },
      raw: {
        vendas_hoje:  pdv.vendas_hoje,
        margem:       pdv.margem_operacional,
        ticket_medio: pdv.ticket_medio,
        trend_pct:    trend,
        rupture_rate: ruptureRate,
      },
      recordedAt: new Date(),
    };
  }

  async function _getRuptureRate(pdvId) {
    try {
      // % de produtos com estoque zero no PDV
      const { data, error } = await state.supabase
        .from('produtos')
        .select('id, qtd_disponivel')
        .eq('pdv_id', pdvId);

      if (error || !data?.length) return 0;
      const zeros = data.filter(p => (p.qtd_disponivel || 0) <= 0).length;
      return (zeros / data.length) * 100;
    } catch (_) { return 0; }
  }

  async function _getAvgTicketHistory(pdvId) {
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await state.supabase
        .from('vendas')
        .select('valor_total')
        .eq('pdv_id', pdvId)
        .gte('created_at', since);

      if (error || !data?.length) return 0;
      return data.reduce((s, v) => s + (v.valor_total || 0), 0) / data.length;
    } catch (_) { return 0; }
  }

  async function _getSalesTrend(pdvId) {
    try {
      const now   = new Date();
      const w1End = now;
      const w1Start = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const w2Start = new Date(now - 30 * 24 * 60 * 60 * 1000);

      const [r7, r30] = await Promise.all([
        state.supabase.from('vendas').select('valor_total')
          .eq('pdv_id', pdvId).gte('created_at', w1Start.toISOString()),
        state.supabase.from('vendas').select('valor_total')
          .eq('pdv_id', pdvId).gte('created_at', w2Start.toISOString()).lt('created_at', w1Start.toISOString()),
      ]);

      const avg7  = r7.data?.length  ? r7.data.reduce((s,v)=>s+(v.valor_total||0),0)  / 7  : 0;
      const avg30 = r30.data?.length ? r30.data.reduce((s,v)=>s+(v.valor_total||0),0) / 23 : 0;

      if (avg30 === 0) return 0;
      return parseFloat(((avg7 - avg30) / avg30 * 100).toFixed(1));
    } catch (_) { return 0; }
  }

  async function _persistHealthScore(score) {
    try {
      await state.supabase.from('pdv_health_scores').insert({
        pdv_id:          score.pdvId,
        score:           score.score,
        score_vendas:    score.dimensions.vendas,
        score_margem:    score.dimensions.margem,
        score_ruptura:   score.dimensions.ruptura,
        score_ticket:    score.dimensions.ticket,
        score_tendencia: score.dimensions.tendencia,
        details:         score.raw,
      });
    } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════════════
  // MOTOR 2 — DEMAND FORECAST
  // Usa histórico real de vendas + sazonalidade + Groq para previsão
  // ════════════════════════════════════════════════════════════════════

  async function runDemandForecastCycle() {
    const forecasts = [];

    try {
      const { data: products, error } = await state.supabase
        .from('produtos')
        .select('id, nome, qtd_disponivel, consumo_diario, categoria, fornecedor_id')
        .order('consumo_diario', { ascending: false })
        .limit(30); // top 30 produtos por consumo

      if (error) throw error;

      for (const product of products) {
        const forecast = await forecastProductDemand(product);
        if (forecast) {
          forecasts.push(forecast);
          state.demandForecasts.set(product.id, forecast);
          await _persistForecast(forecast);
        }
        await _sleep(500); // evita flood no Supabase
      }

    } catch (err) {
      state.logger?.error('DECISION-ENGINE', 'Erro em demandForecast', { error: err.message });
    }

    return forecasts;
  }

  async function forecastProductDemand(product) {
    try {
      // Busca histórico de 90 dias de vendas diárias
      const history = await _getSalesDailyHistory(product.id, 90);

      if (!history.length) {
        // Sem histórico: usa consumo_diario como fallback
        return _buildSimpleForecast(product);
      }

      // Calcula sazonalidade real (padrão por dia da semana e semana do mês)
      const seasonality = _calcSeasonality(history);

      // Usa Groq para interpretar padrão e gerar previsão
      const groqForecast = await _groqDemandForecast(product, history, seasonality);

      return {
        productId:         product.id,
        productName:       product.nome,
        category:          product.categoria,
        currentStock:      product.qtd_disponivel,

        // Previsão por horizonte
        forecast7d:        groqForecast?.qty7d   || seasonality.avg7d   * 7,
        forecast14d:       groqForecast?.qty14d  || seasonality.avg7d   * 14,
        forecast30d:       groqForecast?.qty30d  || seasonality.avgDaily * 30,

        // Sazonalidade calculada com dados reais
        seasonalityFactor: seasonality.factor,
        peakDays:          seasonality.peakDays,
        troughDays:        seasonality.troughDays,
        weeklyPattern:     seasonality.weeklyPattern,

        // Risco
        daysUntilStockout: product.qtd_disponivel > 0 && seasonality.avgDaily > 0
          ? parseFloat((product.qtd_disponivel / seasonality.avgDaily).toFixed(1))
          : 999,
        confidence:        groqForecast?.confidence || 'MEDIUM',
        trend:             groqForecast?.trend      || 'STABLE',
        groqInsight:       groqForecast?.insight    || null,

        forecastedAt: new Date(),
      };

    } catch (err) {
      state.logger?.error('DECISION-ENGINE', `Erro forecast ${product.nome}`, { error: err.message });
      return _buildSimpleForecast(product);
    }
  }

  async function _getSalesDailyHistory(productId, days) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await state.supabase
        .from('movimento')
        .select('quantidade, created_at')
        .eq('produto_id', productId)
        .gte('created_at', since)
        .order('created_at', { ascending: true });

      if (error || !data?.length) return [];

      // Agrupa por dia
      const byDay = {};
      for (const item of data) {
        const day = item.created_at.split('T')[0];
        byDay[day] = (byDay[day] || 0) + (item.quantidade || 0);
      }

      return Object.entries(byDay).map(([date, qty]) => ({
        date,
        qty,
        dayOfWeek: new Date(date).getDay(), // 0=Dom, 6=Sab
        weekOfMonth: Math.ceil(new Date(date).getDate() / 7),
      }));

    } catch (_) { return []; }
  }

  function _calcSeasonality(history) {
    if (!history.length) return { avgDaily: 0, avg7d: 0, factor: 1, peakDays: [], troughDays: [], weeklyPattern: [] };

    const avgDaily = history.reduce((s, d) => s + d.qty, 0) / history.length;

    // Padrão por dia da semana
    const byDow = Array(7).fill(null).map(() => []);
    history.forEach(d => byDow[d.dayOfWeek].push(d.qty));
    const weeklyPattern = byDow.map((days, i) => ({
      dayOfWeek: i,
      dayName: ['Dom','Seg','Ter','Qua','Qui','Sex','Sab'][i],
      avgQty: days.length ? days.reduce((s,v)=>s+v,0) / days.length : 0,
      factor: days.length && avgDaily > 0
        ? parseFloat((days.reduce((s,v)=>s+v,0) / days.length / avgDaily).toFixed(3))
        : 1,
    }));

    // Peak e trough
    const sorted = [...weeklyPattern].sort((a, b) => b.avgQty - a.avgQty);
    const peakDays   = sorted.slice(0, 2).map(d => d.dayName);
    const troughDays = sorted.slice(-2).map(d => d.dayName);

    // Fator dos últimos 7 dias vs média geral
    const last7 = history.slice(-7);
    const avg7d  = last7.length ? last7.reduce((s,d)=>s+d.qty,0) / last7.length : avgDaily;
    const factor = avgDaily > 0 ? parseFloat((avg7d / avgDaily).toFixed(3)) : 1;

    return { avgDaily, avg7d, factor, peakDays, troughDays, weeklyPattern };
  }

  async function _groqDemandForecast(product, history, seasonality) {
    if (!process.env.GROQ_API_KEY) return null;

    try {
      // Resume histórico para não explodir o prompt
      const recentHistory = history.slice(-30).map(d =>
        `${d.date}: ${d.qty} unidades`
      ).join('\n');

      const prompt = `
Você é um especialista em previsão de demanda para distribuidoras de materiais hidráulicos.

PRODUTO: ${product.nome} (${product.categoria || 'Hidráulica'})
ESTOQUE ATUAL: ${product.qtd_disponivel} unidades

PADRÃO DE SAZONALIDADE CALCULADO:
- Média diária: ${seasonality.avgDaily.toFixed(1)} unidades
- Fator recente (7d vs histórico): ${seasonality.factor}x
- Dias de pico: ${seasonality.peakDays.join(', ')}
- Dias de baixa: ${seasonality.troughDays.join(', ')}

HISTÓRICO RECENTE (últimos 30 dias):
${recentHistory}

Com base nos dados reais, forneça a previsão de demanda.
Responda APENAS com JSON válido, sem markdown:
{
  "qty7d": <número: demanda total esperada nos próximos 7 dias>,
  "qty14d": <número: demanda total esperada nos próximos 14 dias>,
  "qty30d": <número: demanda total esperada nos próximos 30 dias>,
  "trend": "<GROWING|STABLE|DECLINING>",
  "confidence": "<HIGH|MEDIUM|LOW>",
  "insight": "<observação mais importante sobre este produto em 1 frase>",
  "riskFlag": "<STOCKOUT_RISK|OVERSTOCK_RISK|NONE>"
}`;

      const raw = await callGroq([{ role: 'user', content: prompt }]);
      if (!raw) return null;

      const match = raw.match(/\{[\s\S]*\}/);
      return match ? JSON.parse(match[0]) : null;

    } catch (_) { return null; }
  }

  function _buildSimpleForecast(product) {
    const daily = product.consumo_diario || 1;
    return {
      productId:         product.id,
      productName:       product.nome,
      currentStock:      product.qtd_disponivel,
      forecast7d:        daily * 7,
      forecast14d:       daily * 14,
      forecast30d:       daily * 30,
      seasonalityFactor: 1,
      peakDays:          [],
      troughDays:        [],
      weeklyPattern:     [],
      daysUntilStockout: daily > 0 ? parseFloat((product.qtd_disponivel / daily).toFixed(1)) : 999,
      confidence:        'LOW',
      trend:             'STABLE',
      groqInsight:       null,
      forecastedAt:      new Date(),
    };
  }

  async function _persistForecast(forecast) {
    try {
      const horizon = new Date(Date.now() + state.forecastHorizonDays * 24 * 60 * 60 * 1000);
      await state.supabase.from('demand_forecasts').insert({
        produto_id:          forecast.productId,
        forecast_date:       horizon.toISOString().split('T')[0],
        qty_predicted:       forecast.forecast14d,
        confidence:          forecast.confidence,
        seasonality_factor:  forecast.seasonalityFactor,
      });
    } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════════════
  // MOTOR 3 — AUTO REPLENISHMENT
  // Decide e cria POs automaticamente com base nos forecasts
  // ════════════════════════════════════════════════════════════════════

  async function runAutoReplenishmentCycle(forecasts) {
    const results = [];

    if (!state.autoReplenishEnabled) return results;

    for (const forecast of forecasts) {
      const decision = await evaluateReplenishment(forecast);
      results.push(decision);

      if (decision.status === 'CREATED') {
        await _createPO(decision);
        state.replenishmentLog.push(decision);
        state.autoReplenishments.push(decision);
      }
    }

    // Limita log em memória
    if (state.replenishmentLog.length > 500) {
      state.replenishmentLog = state.replenishmentLog.slice(-500);
    }

    return results;
  }

  async function evaluateReplenishment(forecast) {
    const { productId, productName, currentStock, forecast14d, daysUntilStockout, confidence, seasonalityFactor } = forecast;

    const safetyStock = forecast14d * (state.safetyStockDays / 14);

    // Regra de decisão: cria PO se estoque < demanda 14d + safety stock
    const needsReplenishment = currentStock < (forecast14d + safetyStock);
    const isUrgent = daysUntilStockout < state.safetyStockDays;

    if (!needsReplenishment && !isUrgent) {
      return {
        productId, productName, status: 'SKIPPED',
        reason: `Estoque suficiente (${daysUntilStockout.toFixed(0)} dias)`,
        currentStock, forecast14d, daysUntilStockout,
      };
    }

    // Verifica se já existe PO recente (últimas 24h) para evitar duplicar
    const recentPO = await _checkRecentPO(productId);
    if (recentPO) {
      return {
        productId, productName, status: 'SKIPPED',
        reason: 'PO já criada nas últimas 24h',
        existingPO: recentPO,
      };
    }

    // Calcula quantidade a pedir
    // Pedido = demanda 14d + safety stock - estoque atual
    // Ajustado pelo fator de sazonalidade
    const baseQty   = Math.max(0, (forecast14d + safetyStock - currentStock));
    const adjQty    = Math.ceil(baseQty * Math.max(seasonalityFactor, 0.8));
    const priority  = isUrgent ? 'URGENTE' : 'NORMAL';

    // Busca fornecedor do produto
    const supplier = await _getSupplier(productId);

    return {
      productId,
      productName,
      status:       'CREATED',
      priority,
      qtyOrdered:   adjQty,
      currentStock,
      forecast14d,
      daysUntilStockout,
      seasonalityFactor,
      supplierId:   supplier?.id   || null,
      supplierName: supplier?.nome || 'Fornecedor não definido',
      reason:       isUrgent
        ? `URGENTE: ruptura em ${daysUntilStockout.toFixed(0)} dias`
        : `Reposição programada: estoque < demanda 14d`,
      estimatedDelivery: _estimateDelivery(supplier),
      confidence,
      createdAt: new Date(),
    };
  }

  async function _createPO(decision) {
    try {
      await state.supabase.from('auto_replenishments').insert({
        produto_id:   decision.productId,
        produto_nome: decision.productName,
        fornecedor_id: decision.supplierId,
        qty_ordered:  decision.qtyOrdered,
        qty_current:  decision.currentStock,
        reason:       decision.reason,
        forecast_days: decision.daysUntilStockout,
        status:       'PENDING',
      });

      // Também cria na tabela purchase_orders se existir
      await state.supabase.from('purchase_orders').insert({
        fornecedor_id: decision.supplierId,
        status:        'PENDING',
        data_prevista: decision.estimatedDelivery,
        produtos:      JSON.stringify([{ id: decision.productId, qty: decision.qtyOrdered }]),
        origem:        'AUTO_DECISION_ENGINE',
        prioridade:    decision.priority,
      }).catch(() => {}); // silencia se tabela não existir

      state.logger?.info('DECISION-ENGINE', `📦 PO criada: ${decision.productName} × ${decision.qtyOrdered}`, {
        reason:   decision.reason,
        priority: decision.priority,
      });

    } catch (err) {
      state.logger?.error('DECISION-ENGINE', `Erro ao criar PO: ${decision.productName}`, { error: err.message });
    }
  }

  async function _checkRecentPO(productId) {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await state.supabase
        .from('auto_replenishments')
        .select('id, created_at')
        .eq('produto_id', productId)
        .gte('created_at', since)
        .limit(1);
      return data?.[0] || null;
    } catch (_) { return null; }
  }

  async function _getSupplier(productId) {
    try {
      const { data: prod } = await state.supabase
        .from('produtos').select('fornecedor_id').eq('id', productId).single();
      if (!prod?.fornecedor_id) return null;

      const { data: sup } = await state.supabase
        .from('fornecedores').select('id, nome, lead_time_dias')
        .eq('id', prod.fornecedor_id).single();
      return sup || null;
    } catch (_) { return null; }
  }

  function _estimateDelivery(supplier) {
    const leadDays = supplier?.lead_time_dias || 7;
    const d = new Date(Date.now() + leadDays * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  }

  // ════════════════════════════════════════════════════════════════════
  // GROQ — Padrão idêntico ao resto do projeto
  // ════════════════════════════════════════════════════════════════════

  function callGroq(messages) {
    return new Promise((resolve) => {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) { resolve(null); return; }

      const body = JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        messages:    Array.isArray(messages) ? messages : [{ role: 'user', content: messages }],
        max_tokens:  1024,
        temperature: 0.15, // mais determinístico para decisões
      });

      const options = {
        hostname: 'api.groq.com',
        path:     '/openai/v1/chat/completions',
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Authorization':  `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const p = JSON.parse(data);
            resolve(p.error ? null : p.choices?.[0]?.message?.content || null);
          } catch (_) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.setTimeout(20000, () => { req.destroy(); resolve(null); });
      req.write(body);
      req.end();
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // SSE
  // ════════════════════════════════════════════════════════════════════

  function addSSEClient(res) {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    state.sseClients.add(res);

    _sendToClient(res, 'connected', {
      status:          'decision_engine_ready',
      lastCycle:       state.lastCycleTs,
      pdvsTracked:     state.pdvHealthCurrent.size,
      productsForecasted: state.demandForecasts.size,
    });

    // Snapshot atual
    if (state.pdvHealthCurrent.size > 0) {
      _sendToClient(res, 'decision_snapshot', {
        healthScores:   Array.from(state.pdvHealthCurrent.entries())
          .map(([id, score]) => ({ pdvId: id, score })),
        forecasts:      Array.from(state.demandForecasts.values()).slice(0, 20),
        replenishments: state.autoReplenishments.slice(-20),
        timestamp:      state.lastCycleTs,
      });
    }

    res.on('close', () => state.sseClients.delete(res));
  }

  function _broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of state.sseClients) {
      try { client.write(payload); } catch (_) { state.sseClients.delete(client); }
    }
  }

  function _sendToClient(res, event, data) {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) {}
  }

  // ════════════════════════════════════════════════════════════════════
  // CONTEXT PARA SUPERVISOR
  // ════════════════════════════════════════════════════════════════════

  function getSupervisorContext() {
    const scores  = Array.from(state.pdvHealthCurrent.entries());
    const worst   = scores.sort((a, b) => a[1] - b[1]).slice(0, 3);
    const best    = scores.sort((a, b) => b[1] - a[1]).slice(0, 1);
    const riskProds = Array.from(state.demandForecasts.values())
      .filter(f => f.daysUntilStockout < 7)
      .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
      .slice(0, 5);

    return {
      decisionEngineSummary: {
        lastCycle:           state.lastCycleTs,
        pdvsAbove80:         scores.filter(([, s]) => s >= 80).length,
        pdvsBelow50:         scores.filter(([, s]) => s <  50).length,
        worstPDVs:           worst,
        bestPDV:             best[0] || null,
        productsAtRisk:      riskProds,
        posCreatedToday:     state.replenishmentLog
          .filter(r => r.createdAt > new Date(Date.now() - 24*60*60*1000)).length,
      }
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════════

  function _normalize(value, min, max) {
    if (value <= min) return 0;
    if (value >= max) return 100;
    return parseFloat(((value - min) / (max - min) * 100).toFixed(1));
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════════════════════════

  return {
    init,
    addSSEClient,
    getSupervisorContext,
    runFullCycle,
    getHealthScore: (pdvId) => ({
      current: state.pdvHealthCurrent.get(pdvId) || null,
      history: state.pdvHealthScores.get(pdvId)  || [],
    }),
    getForecast: (productId) => state.demandForecasts.get(productId) || null,
    getState: () => ({
      healthScores:    Object.fromEntries(state.pdvHealthCurrent),
      forecastCount:   state.demandForecasts.size,
      replenishments:  state.autoReplenishments.slice(-50),
      lastCycleTs:     state.lastCycleTs,
      sseClients:      state.sseClients.size,
    }),
  };
})();

module.exports = decisionEngine;
