'use strict';

/**
 * K11 OMNI ELITE — Price Intelligence (k11_price_intelligence)
 * Scraping + análise de preços competitivos via Groq
 *
 * Expõe:
 *   init(datastore, supabase, logger, options)
 *   addSSEClient(res)
 *   getState()
 *   forceFullScan()
 *   getPriceHistory(productId)
 */

const https = require('https');

let _ds      = null;
let _sb      = null;
let _logger  = console;
let _opts    = { scanIntervalMs: 30 * 60 * 1000, maxProductsPerScan: 10, priceAlertThresholdPct: 10 };
let _groq    = null;

const _sseClients = new Set();
const _priceHistory = {};  // productId → [{ price, ts, source }]
let _state = {
    status:         'idle',
    lastScan:       null,
    productsTracked: 0,
    alerts:          [],
    prices:          {},
};

function _initGroq() {
    if (_groq) return _groq;
    const key = process.env.GROQ_API_KEY;
    if (!key?.startsWith('gsk_')) return null;
    try { const G = require('groq-sdk'); _groq = new G({ apiKey: key }); } catch (_) {}
    return _groq;
}

function _broadcast(event, data) {
    const payload = `data: ${JSON.stringify({ event, data, ts: new Date().toISOString() })}\n\n`;
    for (const res of _sseClients) {
        try { res.write(payload); } catch (_) { _sseClients.delete(res); }
    }
}

/** Scraping real de preços via Mercado Livre API (gratuita, sem auth) */
async function _scrapePrice(product) {
    const base = product.preco_base || product.preco || 100;
    
    // Tenta Mercado Livre Search API (pública, sem auth)
    try {
        const query  = encodeURIComponent(product.nome || product.name || product.sku);
        const url    = `https://api.mercadolibre.com/sites/MLB/search?q=${query}&limit=3`;
        const res    = await new Promise((resolve, reject) => {
            const https  = require('https');
            const req    = https.get(url, { headers: { 'User-Agent': 'K11-OMNI/2.0' }, timeout: 5000 }, resolve);
            req.on('error', reject);
            req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
        });
        
        const chunks = [];
        for await (const chunk of res) chunks.push(chunk);
        const body   = JSON.parse(Buffer.concat(chunks).toString());
        const items  = body.results || [];
        
        if (items.length > 0) {
            // Mediana dos top-3 preços para reduzir ruído
            const prices = items.slice(0, 3)
                .map(i => parseFloat(i.price || 0))
                .filter(p => p > 0)
                .sort((a, b) => a - b);
            
            if (prices.length > 0) {
                const median = prices[Math.floor(prices.length / 2)];
                return { price: median, source: 'mercadolibre', confidence: 0.85 };
            }
        }
    } catch (e) {
        _logger.debug('PRICE-INTEL', `ML scrape falhou para ${product.sku}: ${e.message}`);
    }
    
    // Fallback: Google Shopping via SerpAPI (se configurado)
    if (process.env.SERPAPI_KEY) {
        try {
            const query = encodeURIComponent(product.nome || product.sku);
            const url   = `https://serpapi.com/search.json?engine=google_shopping&q=${query}&gl=br&hl=pt&api_key=${process.env.SERPAPI_KEY}&num=3`;
            const res   = await new Promise((resolve, reject) => {
                const https = require('https');
                https.get(url, { timeout: 5000 }, resolve).on('error', reject);
            });
            const chunks = [];
            for await (const chunk of res) chunks.push(chunk);
            const body   = JSON.parse(Buffer.concat(chunks).toString());
            const items  = body.shopping_results || [];
            if (items.length > 0) {
                const prices = items.slice(0, 3)
                    .map(i => parseFloat(String(i.price || '0').replace(/[^0-9.,]/g, '').replace(',','.')) || 0)
                    .filter(p => p > 0).sort((a,b) => a-b);
                if (prices.length > 0) {
                    return { price: prices[Math.floor(prices.length/2)], source: 'google_shopping', confidence: 0.9 };
                }
            }
        } catch (_) {}
    }
    
    // Fallback final: variação ±5% do preço base (muito mais conservador que antes)
    const noise = (Math.random() - 0.5) * 0.1; // ±5% ao invés de ±15%
    return { price: parseFloat((base * (1 + noise)).toFixed(2)), source: 'estimated', confidence: 0.4 };
}

/** Analisa variação de preço com Groq */
async function _analyzeWithGroq(product, currentPrice, historicPrices) {
    const groq = _initGroq();
    if (!groq || historicPrices.length < 2) return null;

    const avgPrev = historicPrices.slice(-5).reduce((a, h) => a + h.price, 0) / Math.min(5, historicPrices.length);
    const diffPct = ((currentPrice - avgPrev) / avgPrev * 100).toFixed(1);

    if (Math.abs(parseFloat(diffPct)) < _opts.priceAlertThresholdPct) return null;

    try {
        const prompt = `Produto: ${product.nome} (SKU: ${product.sku})
Preço atual: R$ ${currentPrice}
Média histórica: R$ ${avgPrev.toFixed(2)}
Variação: ${diffPct}%

Analise esta variação de preço. Retorne JSON: { "alert": true|false, "reason": "motivo", "recommendation": "ação" }`;

        const c = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200,
        });
        const text = c.choices[0]?.message?.content || '{}';
        const m    = text.match(/\{[\s\S]*\}/);
        return m ? JSON.parse(m[0]) : null;
    } catch (_) { return null; }
}

/** Executa scan completo de preços */
async function _runScan() {
    const sb = _sb || _ds?.supabase;
    _logger.info('PRICE-INTEL', 'Iniciando scan de preços...');

    try {
        let products = [];

        if (sb) {
            const { data } = await sb.from('produtos').select('id,nome,sku,preco_base,preco').limit(_opts.maxProductsPerScan);
            products = data || [];
        }

        // Fallback: produtos mock
        if (!products.length) {
            products = [
                { id: 'p1', sku: 'CIM001', nome: 'Cimento Portland 50kg', preco_base: 35.90 },
                { id: 'p2', sku: 'ARE001', nome: 'Areia Média 1m³',        preco_base: 120.00 },
                { id: 'p3', sku: 'FER001', nome: 'Ferro CA-50 10mm',       preco_base: 58.00 },
            ];
        }

        const alerts = [];
        const prices = {};

        for (const product of products) {
            const { price, source } = await _scrapePrice(product);
            prices[product.id] = { price, source, ts: new Date().toISOString() };

            if (!_priceHistory[product.id]) _priceHistory[product.id] = [];
            _priceHistory[product.id].push({ price, source, ts: new Date().toISOString() });
            if (_priceHistory[product.id].length > 100) _priceHistory[product.id].shift();

            const analysis = await _analyzeWithGroq(product, price, _priceHistory[product.id]);
            if (analysis?.alert) {
                alerts.push({ productId: product.id, product: product.nome, price, ...analysis, ts: new Date().toISOString() });
                _broadcast('price:alert', { product: product.nome, price, ...analysis });
            }
        }

        _state = {
            status:          'active',
            lastScan:        new Date().toISOString(),
            productsTracked: products.length,
            alerts:          alerts.slice(-20),
            prices,
        };

        _broadcast('price:update', _state);
        _logger.info('PRICE-INTEL', `Scan concluído — ${products.length} produtos analisados`);
    } catch (e) {
        _logger.error('PRICE-INTEL', `Erro no scan: ${e.message}`);
    }
}

function addSSEClient(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    _sseClients.add(res);
    res.write(`data: ${JSON.stringify({ event: 'price:state', data: _state })}\n\n`);
    const ka = setInterval(() => {
        try { res.write(': keepalive\n\n'); } catch (_) { clearInterval(ka); _sseClients.delete(res); }
    }, 30000);
    res.on('close', () => { clearInterval(ka); _sseClients.delete(res); });
}

function getState()                    { return _state; }
function forceFullScan()               { _runScan(); }
function getPriceHistory(productId)    { return _priceHistory[productId] || []; }

function init(ds, sb, logger, opts = {}) {
    _ds     = ds;
    _sb     = sb;
    _logger = logger || console;
    _opts   = { ..._opts, ...opts };

    _runScan();
    setInterval(_runScan, _opts.scanIntervalMs);
    _logger.info('PRICE-INTEL', `Price Intelligence inicializado (scan a cada ${_opts.scanIntervalMs / 60000}min)`);
}

module.exports = { init, addSSEClient, getState, forceFullScan, getPriceHistory };
