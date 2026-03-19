/**
 * K11 USER PROFILE UI — Dashboard de Habilidades
 * ═════════════════════════════════════════════════════════════════
 * Interface visual para exibição do perfil do usuário com gráfico
 * radar dos arquétipos e progressão de habilidades.
 * 
 * v1.0 - Núcleo do ecossistema K11 Omni
 */

'use strict';

const K11UserProfileUI = (() => {

    // ── RENDERIZAÇÃO DO PERFIL ──────────────────────────────────
    const renderProfileCard = (userProfile) => {
        const archetype = userProfile.getPrimaryArchetype();
        const archetypeScores = userProfile.getArchetypeScores();

        const html = `
            <div class="k11-profile-container">
                <div class="k11-profile-header">
                    <div class="k11-profile-avatar">
                        <span class="k11-profile-level">${userProfile.level}</span>
                    </div>
                    <div class="k11-profile-info">
                        <h3 class="k11-profile-name">Usuário ${userProfile.userId}</h3>
                        <div class="k11-profile-archetype">
                            <span class="k11-arch-icon">${archetype.icon}</span>
                            <span class="k11-arch-name">${archetype.name}</span>
                        </div>
                        <div class="k11-profile-xp">
                            <div class="k11-xp-bar">
                                <div class="k11-xp-fill" style="width: ${((userProfile.totalXP % 1000) / 1000) * 100}%"></div>
                            </div>
                            <span class="k11-xp-text">${userProfile.totalXP} XP Total</span>
                        </div>
                    </div>
                </div>

                <div class="k11-profile-radar">
                    <div id="k11-radar-chart"></div>
                </div>

                <div class="k11-profile-attributes">
                    <h4>Atributos</h4>
                    <div class="k11-attributes-grid">
                        ${renderAttributesGrid(userProfile)}
                    </div>
                </div>

                <div class="k11-profile-specializations">
                    <h4>Especializações</h4>
                    <div class="k11-spec-list">
                        ${renderSpecializationsList(userProfile)}
                    </div>
                </div>

                <div class="k11-profile-badges">
                    <h4>Certificações</h4>
                    <div class="k11-badges-container">
                        ${renderBadges(userProfile)}
                    </div>
                </div>
            </div>
        `;

        return html;
    };

    // ── GRID DE ATRIBUTOS ───────────────────────────────────────
    const renderAttributesGrid = (userProfile) => {
        const archetypes = K11SkillSystem.getAllArchetypes();
        let html = '';

        archetypes.forEach(arch => {
            const attrs = arch.primaryAttributes;
            const maxAttrValue = Math.max(...attrs.map(a => userProfile.attributes[a] || 0));

            html += `
                <div class="k11-attr-section" style="border-left-color: ${arch.color}">
                    <div class="k11-attr-header">
                        <span class="k11-attr-icon">${arch.icon}</span>
                        <span class="k11-attr-category">${arch.name.split(' (')[1].replace(')', '')}</span>
                    </div>
                    <div class="k11-attr-list">
                        ${attrs.map(attr => {
                            const value = userProfile.attributes[attr] || 0;
                            const maxValue = K11SkillSystem.ATTRIBUTES[attr].max;
                            const percentage = (value / maxValue) * 100;
                            
                            return `
                                <div class="k11-attr-item">
                                    <div class="k11-attr-name">${K11SkillSystem.ATTRIBUTES[attr].name}</div>
                                    <div class="k11-attr-bar">
                                        <div class="k11-attr-fill" style="width: ${percentage}%; background-color: ${arch.color};"></div>
                                    </div>
                                    <div class="k11-attr-value">${Math.round(value)}/${maxValue}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });

        return html;
    };

    // ── LISTA DE ESPECIALIZAÇÕES ────────────────────────────────
    const renderSpecializationsList = (userProfile) => {
        if (userProfile.specializations.length === 0) {
            return '<p class="k11-empty-state">Nenhuma especialização desbloqueada ainda</p>';
        }

        return userProfile.specializations.map(spec => {
            const archId = spec.split('_')[0];
            const archetype = K11SkillSystem.getArchetype(archId);
            
            return `
                <div class="k11-spec-item" style="border-color: ${archetype.color}">
                    <span class="k11-spec-icon">${archetype.icon}</span>
                    <span class="k11-spec-name">${spec}</span>
                    <span class="k11-spec-badge">✓</span>
                </div>
            `;
        }).join('');
    };

    // ── CERTIFICAÇÕES/BADGES ────────────────────────────────────
    const renderBadges = (userProfile) => {
        if (userProfile.badges.length === 0) {
            return '<p class="k11-empty-state">Nenhum badge ainda. Complete missões para ganhar!</p>';
        }

        return userProfile.badges.map(badge => {
            return `
                <div class="k11-badge" title="${badge}">
                    <span class="k11-badge-icon">🏅</span>
                    <span class="k11-badge-label">${badge}</span>
                </div>
            `;
        }).join('');
    };

    // ── RENDERIZAÇÃO DO GRÁFICO RADAR (SVG) ─────────────────────
    const renderRadarChart = (containerId, userProfile) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        const archetypeScores = userProfile.getArchetypeScores();
        const data = Object.values(archetypeScores);
        const size = 250;
        const center = size / 2;
        const maxValue = 100;
        const levels = 5; // Número de anéis do radar

        let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">`;

        // Grade de fundo
        for (let i = 1; i <= levels; i++) {
            const radius = (i / levels) * (size / 2 - 40);
            svg += `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#e0e0e0" stroke-width="1" opacity="0.3"/>`;
        }

        // Eixos
        data.forEach((item, index) => {
            const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2;
            const x2 = center + (size / 2 - 40) * Math.cos(angle);
            const y2 = center + (size / 2 - 40) * Math.sin(angle);
            svg += `<line x1="${center}" y1="${center}" x2="${x2}" y2="${y2}" stroke="#e0e0e0" stroke-width="1" opacity="0.3"/>`;
        });

        // Polígono de dados
        let pathPoints = '';
        data.forEach((item, index) => {
            const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2;
            const radius = (item.value / maxValue) * (size / 2 - 40);
            const x = center + radius * Math.cos(angle);
            const y = center + radius * Math.sin(angle);
            pathPoints += `${x},${y} `;
        });

        svg += `<polygon points="${pathPoints}" fill="#4ECDC4" fill-opacity="0.3" stroke="#4ECDC4" stroke-width="2"/>`;

        // Labels
        data.forEach((item, index) => {
            const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2;
            const labelRadius = (size / 2 - 15);
            const x = center + labelRadius * Math.cos(angle);
            const y = center + labelRadius * Math.sin(angle);
            
            svg += `
                <text 
                    x="${x}" 
                    y="${y}" 
                    text-anchor="middle" 
                    dominant-baseline="middle" 
                    font-size="12" 
                    font-weight="bold"
                    fill="${item.color}">
                    ${item.icon} ${Math.round(item.score)}
                </text>
            `;
        });

        svg += `</svg>`;

        container.innerHTML = svg;
    };

    // ── HISTÓRICO DE PROGRESSÃO ─────────────────────────────────
    const renderProgressionTimeline = (userProfile, limit = 10) => {
        const history = userProfile.skillHistory.slice(-limit).reverse();

        if (history.length === 0) {
            return '<p class="k11-empty-state">Nenhum ganho de habilidade registrado</p>';
        }

        return history.map(entry => {
            const attr = K11SkillSystem.ATTRIBUTES[entry.attribute];
            const timestamp = new Date(entry.timestamp).toLocaleDateString('pt-BR');

            return `
                <div class="k11-timeline-item">
                    <div class="k11-timeline-marker"></div>
                    <div class="k11-timeline-content">
                        <div class="k11-timeline-attribute">
                            <strong>${attr.name}</strong>
                            <span class="k11-timeline-xp">+${entry.amount} XP</span>
                        </div>
                        <div class="k11-timeline-progress">
                            <div class="k11-prog-bar">
                                <div class="k11-prog-fill" style="width: ${(entry.resultValue / attr.max) * 100}%"></div>
                            </div>
                            <span class="k11-prog-value">${entry.resultValue}/${attr.max}</span>
                        </div>
                        <div class="k11-timeline-date">${timestamp}</div>
                    </div>
                </div>
            `;
        }).join('');
    };

    // ── MODAL DE DETALHES ────────────────────────────────────────
    const showProfileModal = (userProfile) => {
        const modal = document.createElement('div');
        modal.className = 'k11-profile-modal-overlay';
        modal.innerHTML = `
            <div class="k11-profile-modal">
                <div class="k11-modal-close">&times;</div>
                <div class="k11-modal-tabs">
                    <button class="k11-tab-btn active" data-tab="overview">Visão Geral</button>
                    <button class="k11-tab-btn" data-tab="skills">Habilidades</button>
                    <button class="k11-tab-btn" data-tab="timeline">Progressão</button>
                </div>
                
                <div class="k11-tab-content active" id="k11-tab-overview">
                    ${renderProfileCard(userProfile)}
                </div>
                
                <div class="k11-tab-content" id="k11-tab-skills">
                    <div class="k11-skills-detail">
                        ${renderAttributesGrid(userProfile)}
                    </div>
                </div>
                
                <div class="k11-tab-content" id="k11-tab-timeline">
                    <div class="k11-timeline">
                        ${renderProgressionTimeline(userProfile, 20)}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('.k11-modal-close').onclick = () => modal.remove();

        modal.querySelectorAll('.k11-tab-btn').forEach(btn => {
            btn.onclick = () => {
                modal.querySelectorAll('.k11-tab-btn').forEach(b => b.classList.remove('active'));
                modal.querySelectorAll('.k11-tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`k11-tab-${btn.dataset.tab}`).classList.add('active');
            };
        });

        // Renderiza o radar chart
        setTimeout(() => renderRadarChart('k11-radar-chart', userProfile), 100);

        return modal;
    };

    // ── API PÚBLICA ─────────────────────────────────────────────
    return {
        renderProfileCard,
        renderAttributesGrid,
        renderSpecializationsList,
        renderBadges,
        renderRadarChart,
        renderProgressionTimeline,
        showProfileModal,
    };
})();
