/**
 * ╔════════════════════════════════════════════════════════════════════╗
 * ║   K11 PRICE INTELLIGENCE ENGINE — Groq Edition                    ║
 * ║   Busca preços reais via scraping + analisa com Groq AI            ║
 * ║                                                                     ║
 * ║   Mesmo padrão do k11_supervisor_backend.js (callGroq reutilizado) ║
 * ╚════════════════════════════════════════════════════════════════════╝
 *
 * INTEGRAÇÃO NO server.js:
 *   const priceIntel = require('./routes/k11_price_intelligence');
 *   priceIntel.init(datastore, supabaseClient, logger);
 *
 * ROTAS:
 *   GET  /api/price-intel/stream           → SSE tempo real
 *   GET  /api/price-intel/state            → snapshot JSON
 *   POST /api/price-intel/scan             → scan produto específico
 *   POST /api/price-intel/scan-all         → forçar scan geral
 *   GET  /api/price-intel/history/:prodId  → histórico de preços
 */

'use strict';

const https = require('https');
const http  = require('http');

const priceIntel = (() => {

  // ── ESTADO ─────────────────────────────────────────────────────────
  const state = {
    priceMap:     new Map(),   // produtoId → PriceResult
    marketTrends: [],
    alerts:       [],
    priceHistory: new Map(),   // produtoId → PriceSnapshot[]
    lastScanTs:   null,
    scanInterval: null,
    sseClients:   new Set(),

    datastore: null,
    supabase:  null,
    logger:    null,

    scanIntervalMs:         30 * 60 * 1000,
    maxProductsPerScan:     10,
    priceAlertThresholdPct: 10,
  };

  // ── INIT ───────────────────────────────────────────────────────────


  // ── PREÇOS LOCAIS (sem Groq) ──────────────────────────────────────
  function _loadLocalPrices(logger) {
    const CATALOG = [
      { id:'cimento', nome:'Cimento Portland CP-II 50kg', preco:38.90, variacao:2.1, tendencia:'estavel', categoria:'estrutura' },
      { id:'areia',   nome:'Areia Média (m³)',             preco:125.00, variacao:-1.5, tendencia:'queda',   categoria:'estrutura' },
      { id:'tijolo',  nome:'Tijolo Cerâmico 9 furos (mil)',preco:920.00, variacao:3.8, tendencia:'alta',    categoria:'alvenaria' },
      { id:'ferro',   nome:'Ferro CA-50 10mm barra 12m',  preco:62.50,  variacao:1.2, tendencia:'estavel', categoria:'estrutura' },
      { id:'cal',     nome:'Cal Hidratada 20kg',           preco:48.00,  variacao:0.5, tendencia:'estavel', categoria:'acabamento' },
      { id:'reboco',  nome:'Reboco Pronto 20kg',           preco:58.00,  variacao:4.2, tendencia:'alta',    categoria:'acabamento' },
      { id:'tinta',   nome:'Tinta Acrílica Premium 18L',  preco:195.00, variacao:-2.0, tendencia:'queda',   categoria:'acabamento' },
      { id:'pvc20',   nome:'Tubo PVC 20mm 6m',            preco:14.50,  variacao:1.0, tendencia:'estavel', categoria:'hidráulica' },
      { id:'fio25',   nome:'Fio Flexível 2.5mm (rolo 100m)',preco:89.00, variacao:3.5, tendencia:'alta',   categoria:'elétrica' },
      { id:'piso',    nome:'Piso Cerâmico 60x60 (m²)',    preco:52.00,  variacao:-0.8, tendencia:'queda',   categoria:'acabamento' },
    ];

    CATALOG.forEach(p => {
      state.priceMap.set(p.id, {
        productId: p.id, productName: p.nome,
        myPrice: p.preco, marketPrice: p.preco * (1 + (Math.random()-0.5)*0.15),
        diffPercent: p.variacao, trend: p.tendencia,
        category: p.categoria, scannedAt: new Date(),
      });
    });

    state.lastScanTs = new Date();
    logger?.info('PRICE-INTEL', `${CATALOG.length} preços carregados do catálogo local`);
    _broadcastUpdate();
  }

  function init(datastore, supabaseClient, logger, options = {}) {
    state.datastore = datastore;
    state.supabase  = supabaseClient;
    state.logger    = logger;

    if (options.scanIntervalMs)         state.scanIntervalMs         = options.scanIntervalMs;
    if (options.maxProductsPerScan)     state.maxProductsPerScan     = options.maxProductsPerScan;
    if (options.priceAlertThresholdPct) state.priceAlertThresholdPct = options.priceAlertThresholdPct;

    if (!process.env.GROQ_API_KEY) {
      logger?.warn('PRICE-INTEL', '⚠️  GROQ_API_KEY não definida — usando dados de mercado locais');
      // Continua sem Groq — usa preços base do catálogo
      _loadLocalPrices(logger);
      // Atualiza preços locais a cada 30min
      state.scanInterval = setInterval(() => _loadLocalPrices(logger), state.scanIntervalMs);
      return;}

    logger?.info('PRICE-INTEL', '🔍 Price Intelligence (Groq) inicializando...');
    setTimeout(() => runFullScan(), 25000);
    scheduleScan();
    logger?.info('PRICE-INTEL', `✅ Pronto! Scan a cada ${state.scanIntervalMs / 60000} min`);
  }

  function scheduleScan() {
    if (state.scanInterval) clearInterval(state.scanInterval);
    state.scanInterval = setInterval(() => runFullScan(), state.scanIntervalMs);
  }

  // ── PRODUTOS DO SUPABASE ───────────────────────────────────────────

  async function fetchMyProducts() {
    try {
      // Lê do cache do datastore em vez de query direta ao Supabase
      const todos = await state.datastore.get('produtos');
      // Ordena por valor total desc e limita
      return todos
        .sort((a, b) => (parseFloat(b['Valor total']) || 0) - (parseFloat(a['Valor total']) || 0))
        .slice(0, state.maxProductsPerScan)
        .map(p => ({
          id:              p._id,
          produto:         p['Produto'],
          descricao_produto: p['Descrição produto'],
          quantidade:      p['Quantidade'],
          qtd_disponivel_uma: p['Qtd.disponível UMA'],
          valor_total:     p['Valor total'],
        }));
    } catch (err) {
      state.logger?.error('PRICE-INTEL', 'Erro ao buscar produtos', { error: err.message });
      return [];
    }
  }

  // ── SCAN COMPLETO ──────────────────────────────────────────────────

  async function runFullScan() {
    // Sem Groq, usa preços de catálogo local
    if (!process.env.GROQ_API_KEY) {
      _loadLocalPrices(state.logger);
      return;
    }
    state.logger?.info('PRICE-INTEL', '🔎 Iniciando scan de preços...');

    try {
      const products = await fetchMyProducts();
      if (!products.length) { state.logger?.warn('PRICE-INTEL', 'Nenhum produto encontrado'); return; }

      const results = [];
      for (const product of products) {
        const result = await scanProductPrice(product);
        if (result) {
          results.push(result);
          state.priceMap.set(product.id, result);
          _saveHistory(product.id, result);
        }
        await _sleep(3000);
      }

      const trends = await analyzeMarketTrends(products, results);
      state.marketTrends = trends;
      state.alerts       = generatePriceAlerts(results);
      state.lastScanTs   = new Date();

      _broadcastSSE('price_update', {
        priceMap:        results,
        marketTrends:    trends,
        alerts:          state.alerts,
        timestamp:       state.lastScanTs,
        productsScanned: results.length,
      });

      state.logger?.info('PRICE-INTEL', `✅ Scan concluído`, {
        products: results.length,
        alerts:   state.alerts.length,
        avgGap:   _calcAvgGap(results) + '%',
      });
    } catch (err) {
      state.logger?.error('PRICE-INTEL', 'Erro no scan completo', { error: err.message });
    }
  }

  // ── SCAN INDIVIDUAL ────────────────────────────────────────────────

  async function scanProductPrice(product) {
    try {
      state.logger?.debug('PRICE-INTEL', `Buscando: ${product.descricao_produto || product.produto}`);

      const scrapedPrices = await scrapeProductPrices(product.descricao_produto || product.produto, 'Hidráulica');
      const analysis      = await analyzeWithGroq(product, scrapedPrices);
      if (!analysis) return null;

      const myPrice   = parseFloat(parseFloat(product.valor_total) || 0) || 0;
      const marketAvg = analysis.marketAvgPrice   || myPrice;
      const diffPct   = myPrice > 0
        ? parseFloat(((myPrice - marketAvg) / marketAvg * 100).toFixed(1))
        : 0;

      return {
        productId:          product.id,
        productName:        product.descricao_produto || product.produto,
        category:           'Hidráulica' || 'Geral',
        myPrice,
        marketAvgPrice:     marketAvg,
        lowestMarketPrice:  analysis.lowestPrice    || myPrice,
        highestMarketPrice: analysis.highestPrice   || myPrice,
        diffPercent:        diffPct,
        competitorPrices:   scrapedPrices,
        trend:              analysis.trend          || 'STABLE',
        demandSignal:       analysis.demandSignal   || 'NORMAL',
        recommendation:     analysis.recommendation || '',
        confidence:         analysis.confidence     || 'LOW',
        scannedAt:          new Date(),
      };
    } catch (err) {
      state.logger?.error('PRICE-INTEL', `Erro ao escanear ${product.descricao_produto || product.produto}`, { error: err.message });
      return null;
    }
  }

  // ── WEB SCRAPING ───────────────────────────────────────────────────

  async function scrapeProductPrices(productName, category) {
    const results  = [];
    const encoded  = encodeURIComponent(productName);
    const scrapers = [
      scrapeMercadoLivre(encoded),
      scrapeGooglePrices(encoded, category),
    ];

    const settled = await Promise.allSettled(scrapers);
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value?.length) results.push(...r.value);
    }
    return results.slice(0, 10);
  }

  // MercadoLivre — API pública, sem autenticação
  async function scrapeMercadoLivre(encodedName) {
    try {
      const url  = `https://api.mercadolibre.com/sites/MLB/search?q=${encodedName}&limit=5`;
      const raw  = await _fetchURL(url);
      const data = JSON.parse(raw);
      if (!data?.results?.length) return [];

      return data.results
        .filter(item => item.price && item.title)
        .map(item => ({
          store:     'MercadoLivre',
          price:     parseFloat(item.price),
          title:     item.title,
          url:       item.permalink || '',
          condition: item.condition || 'new',
        }));
    } catch (_) { return []; }
  }

  // Busca preços em HTML público via padrão R$ XX,XX
  async function scrapeGooglePrices(encodedName, category) {
    try {
      const query = `${decodeURIComponent(encodedName)} ${category || ''} preço loja`;
      const url   = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=5`;
      const html  = await _fetchURL(url, { 'User-Agent': 'Mozilla/5.0 (compatible; K11Bot/1.0)' });

      const pricePattern = /R\$\s*([\d.]+,\d{2})/g;
      const prices = [];
      let match;

      while ((match = pricePattern.exec(html)) !== null && prices.length < 5) {
        const price = parseFloat(match[1].replace('.', '').replace(',', '.'));
        if (price > 0 && price < 100000) {
          prices.push({ store: 'Web', price, title: '', url: '' });
        }
      }
      return prices;
    } catch (_) { return []; }
  }

  // ── ANÁLISE COM GROQ — mesmo padrão do k11_supervisor_backend.js ──

  async function analyzeWithGroq(product, scrapedPrices) {
    try {
      const hasData     = scrapedPrices.length > 0;
      const pricesText  = hasData
        ? scrapedPrices.map(p => `- ${p.store}: R$ ${p.price} (${p.title || product.descricao_produto || product.produto})`).join('\n')
        : 'Sem dados de scraping — use conhecimento de mercado para produtos similares no Brasil.';

      const prompt = `
Você é um analista de preços especialista em materiais hidráulicos e construção civil no Brasil.

PRODUTO:
- Nome: ${product.descricao_produto || product.produto}
- Categoria: ${'Hidráulica' || 'Materiais Hidráulicos'}
- Meu preço: R$ ${parseFloat(product.valor_total) || 0}

PREÇOS COLETADOS (web scraping):
${pricesText}

${hasData ? '' : 'IMPORTANTE: Sem dados reais disponíveis. Estime com base no mercado brasileiro para esse tipo de produto.'}

Responda APENAS com JSON válido, sem markdown, sem texto extra:
{
  "marketAvgPrice": <número>,
  "lowestPrice": <número>,
  "highestPrice": <número>,
  "trend": "<RISING|FALLING|STABLE>",
  "demandSignal": "<HIGH|NORMAL|LOW>",
  "recommendation": "<ação em 1 frase>",
  "confidence": "<HIGH|MEDIUM|LOW>",
  "reasoning": "<explicação em 1 frase>"
}`;

      const raw = await callGroq([{ role: 'user', content: prompt }]);
      if (!raw) return null;

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch (err) {
      state.logger?.error('PRICE-INTEL', 'Erro no Groq', { error: err.message });
      return null;
    }
  }

  // ── TENDÊNCIAS DE MERCADO ──────────────────────────────────────────

  async function analyzeMarketTrends(products, scanResults) {
    try {
      const categories = [...new Set(products.map(p => p.categoria).filter(Boolean))];
      const summary    = scanResults.map(r =>
        `${r.productName}: meu R$${r.myPrice} vs mercado R$${r.marketAvgPrice} (${r.diffPercent > 0 ? '+' : ''}${r.diffPercent}%) | trend: ${r.trend}`
      ).join('\n');

      const prompt = `
Você é analista sênior do mercado de materiais hidráulicos e construção civil brasileiro.

CATEGORIAS: ${categories.join(', ') || 'Tubos, Conexões, Hidráulica'}

RESUMO DOS PREÇOS ESCANEADOS:
${summary || 'Dados coletados ainda insuficientes'}

Considere: cenário atual de insumos (PVC, cobre, aço), sazonalidade, SELIC, INCC, demanda de construção civil.

Responda APENAS com JSON válido, sem markdown:
{
  "macroInsight": "<visão geral em 1-2 frases>",
  "trends": [
    {
      "category": "<categoria>",
      "trend": "<RISING|FALLING|STABLE>",
      "trendPercent": <número>,
      "signal": "<HIGH_DEMAND|NORMAL|LOW_DEMAND>",
      "insight": "<insight acionável em 1 frase>",
      "action": "<ação recomendada para o PDV>"
    }
  ],
  "opportunities": ["<oportunidade 1>", "<oportunidade 2>", "<oportunidade 3>"],
  "risks": ["<risco 1>", "<risco 2>"]
}`;

      const raw = await callGroq([{ role: 'user', content: prompt }]);
      if (!raw) return [];

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch (err) {
      state.logger?.error('PRICE-INTEL', 'Erro em analyzeMarketTrends', { error: err.message });
      return [];
    }
  }

  // ── GROQ — idêntico ao callGroq do k11_supervisor_backend.js ──────

  function callGroq(messages) {
    return new Promise((resolve) => {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) { resolve(null); return; }

      const body = JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        messages:    Array.isArray(messages) ? messages : [{ role: 'user', content: messages }],
        max_tokens:  1024,
        temperature: 0.2,
      });

      const options = {
        hostname: 'api.groq.com',
        path:     '/openai/v1/chat/completions',
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Authorization':  `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) { resolve(null); return; }
            resolve(parsed.choices?.[0]?.message?.content || null);
          } catch (_) { resolve(null); }
        });
      });

      req.on('error', () => resolve(null));
      req.setTimeout(15000, () => { req.destroy(); resolve(null); });
      req.write(body);
      req.end();
    });
  }

  // ── ALERTAS ────────────────────────────────────────────────────────

  function generatePriceAlerts(results) {
    const alerts = [];
    const thresh = state.priceAlertThresholdPct;

    for (const item of results) {
      if (item.diffPercent > thresh) {
        alerts.push({
          type: 'PRICE_TOO_HIGH', severity: item.diffPercent > 25 ? 'CRITICAL' : 'WARNING',
          productId: item.productId, productName: item.productName,
          myPrice: item.myPrice, marketAvg: item.marketAvgPrice, diffPercent: item.diffPercent,
          title:  `⚠️ ${item.productName}: ${item.diffPercent}% acima do mercado`,
          action: `Reduzir para ~R$ ${(item.marketAvgPrice * 1.05).toFixed(2)}`,
          estimatedLoss: parseFloat(((item.myPrice - item.marketAvgPrice) * 0.1).toFixed(2)),
          timestamp: new Date(),
        });
      }
      if (item.diffPercent < -thresh) {
        alerts.push({
          type: 'MARGIN_OPPORTUNITY', severity: 'OPPORTUNITY',
          productId: item.productId, productName: item.productName,
          myPrice: item.myPrice, marketAvg: item.marketAvgPrice, diffPercent: item.diffPercent,
          title:  `💰 ${item.productName}: ${Math.abs(item.diffPercent)}% abaixo do mercado`,
          action: `Ajustar para R$ ${(item.marketAvgPrice * 0.97).toFixed(2)} mantendo vantagem`,
          potentialGain: parseFloat((item.marketAvgPrice - item.myPrice).toFixed(2)),
          timestamp: new Date(),
        });
      }
      if (item.trend === 'RISING') {
        alerts.push({
          type: 'MARKET_RISING', severity: 'INFO',
          productId: item.productId, productName: item.productName,
          title:  `📈 ${item.productName}: mercado em ALTA`,
          action: 'Repor estoque agora antes de nova alta de custo',
          timestamp: new Date(),
        });
      }
      if (item.demandSignal === 'HIGH') {
        alerts.push({
          type: 'HIGH_DEMAND', severity: 'OPPORTUNITY',
          productId: item.productId, productName: item.productName,
          title:  `🔥 ${item.productName}: ALTA DEMANDA detectada`,
          action: 'Garantir estoque e considerar reajuste de preço',
          timestamp: new Date(),
        });
      }
      if (item.diffPercent <= 0 && item.diffPercent >= -thresh) {
        alerts.push({
          type: 'PRICE_COMPETITIVE', severity: 'OPTIMIZATION',
          productId: item.productId, productName: item.productName,
          title:  `✅ ${item.productName}: preço competitivo`,
          action: 'Promover este produto — você tem vantagem de preço!',
          timestamp: new Date(),
        });
      }
    }

    const order = { CRITICAL: 0, WARNING: 1, OPPORTUNITY: 2, OPTIMIZATION: 3, INFO: 4 };
    return alerts.sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5));
  }

  // ── INTEGRAÇÃO: DOMINATION ENGINE ─────────────────────────────────

  function enrichDominationActions(existingActions) {
    const enriched = [...existingActions];

    for (const [, p] of state.priceMap.entries()) {
      if (p.diffPercent > 15) {
        enriched.unshift({
          priority: 1, type: 'PRICE_CORRECTION',
          title:       `🔴 PREÇO ALTO: ${p.productName}`,
          description: `R$ ${p.myPrice} vs mercado R$ ${p.marketAvgPrice} (+${p.diffPercent}%)`,
          tactic:      `Reduzir para R$ ${(p.marketAvgPrice * 1.05).toFixed(2)} e comunicar clientes`,
          expectedIncrease: parseFloat((p.myPrice * 0.1).toFixed(2)),
          effort: 'BAIXO', source: 'PRICE_INTEL',
        });
      }
      if (p.diffPercent < -5 && p.diffPercent > -20) {
        enriched.push({
          priority: 2, type: 'PRICE_ADVANTAGE',
          title:       `✅ VANTAGEM: ${p.productName}`,
          description: `${Math.abs(p.diffPercent)}% abaixo do mercado — use como arma!`,
          tactic:      'Destacar no PDV + divulgar WhatsApp + push em promoção',
          effort: 'BAIXO', source: 'PRICE_INTEL',
        });
      }
    }

    return enriched.sort((a, b) => a.priority - b.priority);
  }

  // ── INTEGRAÇÃO: SUPERVISOR ─────────────────────────────────────────

  function getSupervisorContext() {
    const critical      = state.alerts.filter(a => a.severity === 'CRITICAL');
    const opportunities = state.alerts.filter(a => a.severity === 'OPPORTUNITY');
    const topMisaligned = Array.from(state.priceMap.values())
      .sort((a, b) => Math.abs(b.diffPercent) - Math.abs(a.diffPercent))
      .slice(0, 5);

    return {
      priceIntelSummary: {
        lastScan:              state.lastScanTs,
        productsMonitored:     state.priceMap.size,
        criticalAlerts:        critical.length,
        opportunities:         opportunities.length,
        topMisalignedProducts: topMisaligned,
        macroInsight:          state.marketTrends?.macroInsight    || null,
        marketOpportunities:   state.marketTrends?.opportunities   || [],
        marketRisks:           state.marketTrends?.risks           || [],
      },
    };
  }

  // ── HISTÓRICO ──────────────────────────────────────────────────────

  function _saveHistory(productId, result) {
    if (!state.priceHistory.has(productId)) state.priceHistory.set(productId, []);
    const history = state.priceHistory.get(productId);
    history.push({
      myPrice:           result.myPrice,
      marketAvgPrice:    result.marketAvgPrice,
      lowestMarketPrice: result.lowestMarketPrice,
      diffPercent:       result.diffPercent,
      trend:             result.trend,
      confidence:        result.confidence,
      scannedAt:         result.scannedAt,
    });
    if (history.length > 100) history.splice(0, history.length - 100);
  }

  function getPriceHistory(productId) {
    return state.priceHistory.get(productId) || [];
  }

  // ── SSE ────────────────────────────────────────────────────────────

  function addSSEClient(res) {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    });
    state.sseClients.add(res);

    _sendToClient(res, 'connected', {
      status:            'price_intel_ready',
      productsMonitored: state.priceMap.size,
      lastScan:          state.lastScanTs,
      nextScanInMin:     state.scanIntervalMs / 60000,
    });

    if (state.priceMap.size > 0) {
      _sendToClient(res, 'price_update', {
        priceMap:     Array.from(state.priceMap.values()),
        marketTrends: state.marketTrends,
        alerts:       state.alerts,
        timestamp:    state.lastScanTs,
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

  // ── HTTP FETCH ─────────────────────────────────────────────────────

  function _fetchURL(url, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
      const lib     = url.startsWith('https') ? https : http;
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; K11PriceBot/1.0)',
          'Accept':     'application/json, text/html',
          ...extraHeaders,
        },
        timeout: 10000,
      };
      lib.get(url, options, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          return _fetchURL(res.headers.location, extraHeaders).then(resolve).catch(reject);
        }
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(data));
      }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
    });
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function _calcAvgGap(results) {
    if (!results.length) return 0;
    return (results.reduce((s, r) => s + (r.diffPercent || 0), 0) / results.length).toFixed(1);
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────

  return {
    init,
    addSSEClient,
    enrichDominationActions,
    getSupervisorContext,
    getPriceHistory,
    forceFullScan: runFullScan,
    scanProductPrice: async (productId) => {
      try {
        const prods = await state.datastore.get('produtos');
        const p = prods.find(x => x._id === productId || x._id === Number(productId));
        if (!p) return null;
        return scanProductPrice({
          id: p._id,
          produto: p['Produto'],
          descricao_produto: p['Descrição produto'],
          quantidade: p['Quantidade'],
          valor_total: p['Valor total'],
        });
      } catch (_) { return null; }
    },
    getState: () => ({
      priceMap:          Array.from(state.priceMap.values()),
      marketTrends:      state.marketTrends,
      alerts:            state.alerts,
      lastScanTs:        state.lastScanTs,
      productsMonitored: state.priceMap.size,
      sseClients:        state.sseClients.size,
    }),
  };
})();

module.exports = priceIntel;
