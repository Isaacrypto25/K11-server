/**
 * K11 OMNI ELITE — Radar Profile v1.0
 * ══════════════════════════════════════
 * Radar chart real do perfil do usuário logado.
 * Carrega dados de /api/skills/profile/:userId e renderiza
 * com Chart.js (ou SVG puro como fallback).
 *
 * Expõe: window.K11RadarProfile
 *   K11RadarProfile.render(containerId)  → renderiza o radar
 *   K11RadarProfile.refresh()            → recarrega do servidor
 */

'use strict';

const K11RadarProfile = (() => {

    let _profile  = null;
    let _loading  = false;
    let _chart    = null;

    const ARCHETYPES = {
        executor: { label: 'Executor',    color: '#FF8C00', attrs: ['velocidade','resistencia','consistencia'] },
        analyst:  { label: 'Estrategista',color: '#60A5FA', attrs: ['precisao','logica','otimizacao'] },
        diplomat: { label: 'Diplomata',   color: '#34D399', attrs: ['empatia','comunicacao','lideranca'] },
        creator:  { label: 'Criativo',    color: '#A78BFA', attrs: ['criatividade','inovacao','adaptabilidade'] },
    };

    // ── CARREGAR PERFIL DO SERVIDOR ────────────────────────────
    async function _loadProfile() {
        if (_loading) return _profile;
        _loading = true;
        try {
            const user = K11Auth.getUser();
            const uid  = user?.re || user?.ldap || user?.id;
            if (!uid) return null;

            const res  = await K11Auth.fetch(`/api/skills/profile/${uid}`);
            const data = await res?.json();

            if (data?.ok && data.data) {
                _profile = data.data;
                // Fallback: atributos padrão se vazio
                if (!_profile.attributes || !Object.keys(_profile.attributes).length) {
                    _profile.attributes = {};
                    Object.values(ARCHETYPES).forEach(a =>
                        a.attrs.forEach(attr => { _profile.attributes[attr] = 25; })
                    );
                }
            }
        } catch (e) {
            console.warn('[K11RadarProfile] loadProfile falhou:', e.message);
        } finally {
            _loading = false;
        }
        return _profile;
    }

    // ── CALCULAR SCORES DOS ARQUÉTIPOS ─────────────────────────
    function _calcScores(attrs) {
        const scores = {};
        for (const [id, arch] of Object.entries(ARCHETYPES)) {
            const vals  = arch.attrs.map(a => attrs[a] || 25);
            scores[id]  = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
        }
        return scores;
    }

    // ── RENDERIZAR COM CHART.JS ────────────────────────────────
    async function _renderChart(containerId, profile) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Garante canvas
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas        = document.createElement('canvas');
            canvas.width  = 200;
            canvas.height = 200;
            container.appendChild(canvas);
        }

        // Carrega Chart.js se necessário
        const C = await new Promise(resolve => {
            if (typeof Chart !== 'undefined') return resolve(Chart);
            const s   = document.createElement('script');
            s.src     = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
            s.onload  = () => resolve(Chart);
            s.onerror = () => resolve(null);
            document.head.appendChild(s);
        });

        if (!C) { _renderSVG(containerId, profile); return; }

        if (_chart) { try { _chart.destroy(); } catch (_) {} }

        const scores = profile.archetype_scores || _calcScores(profile.attributes || {});
        const labels = Object.values(ARCHETYPES).map(a => a.label);
        const data   = Object.keys(ARCHETYPES).map(id => scores[id] || 25);
        const colors = Object.values(ARCHETYPES).map(a => a.color);
        const primary= Object.values(scores).indexOf(Math.max(...Object.values(scores)));
        const mainColor = Object.values(ARCHETYPES)[primary]?.color || '#FF8C00';

        _chart = new C(canvas, {
            type: 'radar',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: mainColor + '22',
                    borderColor:     mainColor,
                    borderWidth:     2,
                    pointBackgroundColor: colors,
                    pointBorderColor:     '#fff',
                    pointBorderWidth:     1.5,
                    pointRadius:     4,
                    pointHoverRadius:6,
                    fill: true,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                animation: { duration: 800, easing: 'easeOutQuart' },
                plugins: { legend: { display: false } },
                scales: {
                    r: {
                        min: 0, max: 100,
                        beginAtZero: true,
                        ticks: { display: false, stepSize: 25 },
                        grid:  { color: 'rgba(90,100,128,.2)' },
                        pointLabels: {
                            color:    'var(--text-soft, #B0B8CC)',
                            font:     { size: 11, weight: '600' },
                            padding:  8,
                        },
                        angleLines: { color: 'rgba(90,100,128,.2)' },
                    },
                },
            },
        });
    }

    // ── FALLBACK SVG (sem Chart.js) ────────────────────────────
    function _renderSVG(containerId, profile) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const scores = profile.archetype_scores || _calcScores(profile.attributes || {});
        const cx = 80, cy = 80, r = 60;
        const archs = Object.entries(ARCHETYPES);
        const n     = archs.length;

        const points = archs.map(([id, arch], i) => {
            const angle  = (i / n) * 2 * Math.PI - Math.PI / 2;
            const pct    = (scores[id] || 25) / 100;
            return {
                x:     cx + r * pct * Math.cos(angle),
                y:     cy + r * pct * Math.sin(angle),
                lx:    cx + (r + 18) * Math.cos(angle),
                ly:    cy + (r + 18) * Math.sin(angle),
                label: arch.label,
                color: arch.color,
                score: scores[id] || 25,
            };
        });

        const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
        const gridAngles = Array.from({length:n}, (_,i) => {
            const a = (i/n)*2*Math.PI - Math.PI/2;
            return `<line x1="${cx}" y1="${cy}" x2="${cx+r*Math.cos(a)}" y2="${cy+r*Math.sin(a)}" stroke="rgba(90,100,128,.25)" stroke-width="0.5"/>`;
        });
        const gridRings = [.25,.5,.75,1].map(pct =>
            `<circle cx="${cx}" cy="${cy}" r="${r*pct}" fill="none" stroke="rgba(90,100,128,.15)" stroke-width="0.5"/>`
        );

        container.innerHTML = `
        <svg viewBox="0 0 160 160" width="160" height="160" xmlns="http://www.w3.org/2000/svg">
            ${gridRings.join('')}
            ${gridAngles.join('')}
            <polygon points="${polyline}" fill="${Object.values(ARCHETYPES)[0].color}22" stroke="${Object.values(ARCHETYPES)[0].color}" stroke-width="2" stroke-linejoin="round"/>
            ${points.map(p => `
            <circle cx="${p.x}" cy="${p.y}" r="3" fill="${p.color}" stroke="#fff" stroke-width="1"/>
            <text x="${p.lx}" y="${p.ly}" text-anchor="middle" dominant-baseline="middle" fill="#B0B8CC" font-size="8" font-weight="600">${p.label}</text>
            `).join('')}
        </svg>`;
    }

    // ── INFO DO PERFIL ─────────────────────────────────────────
    function _renderProfileInfo(containerId, profile) {
        const el = document.getElementById(containerId + '-info');
        if (!el || !profile) return;

        const scores  = profile.archetype_scores || _calcScores(profile.attributes || {});
        const topArch = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
        const archInfo= ARCHETYPES[topArch?.[0]];
        const level   = profile.level || 1;
        const xp      = profile.total_xp || 0;

        el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div>
                <div style="font-weight:700;font-size:14px">${archInfo?.label || 'K11 User'}</div>
                <div class="micro-txt txt-muted">Nível ${level} · ${xp.toLocaleString('pt-BR')} XP</div>
            </div>
            <div style="width:36px;height:36px;border-radius:50%;background:${archInfo?.color || '#FF8C00'}22;border:2px solid ${archInfo?.color || '#FF8C00'};display:flex;align-items:center;justify-content:center;font-size:18px">
                ${archInfo?.label?.[0] || 'K'}
            </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
            ${Object.entries(scores).map(([id, score]) => {
                const a = ARCHETYPES[id];
                return `<div style="display:flex;align-items:center;gap:8px">
                    <span class="micro-txt txt-muted" style="width:80px;flex-shrink:0">${a.label}</span>
                    <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
                        <div style="width:${score}%;height:100%;background:${a.color};transition:width .6s"></div>
                    </div>
                    <span class="mono" style="font-size:10px;color:${a.color};width:28px;text-align:right">${score}</span>
                </div>`;
            }).join('')}
        </div>`;
    }

    // ── API PÚBLICA ────────────────────────────────────────────
    async function render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = `<div class="micro-txt txt-muted" style="padding:8px 0">Carregando perfil...</div>`;

        const profile = await _loadProfile();
        if (!profile) {
            container.innerHTML = `<div class="micro-txt txt-muted">Perfil não encontrado</div>`;
            return;
        }

        await _renderChart(containerId, profile);
        _renderProfileInfo(containerId, profile);
    }

    async function refresh() {
        _profile = null;
        _loading = false;
    }

    function getProfile() { return _profile; }

    return { render, refresh, getProfile };

})();

window.K11RadarProfile = K11RadarProfile;
