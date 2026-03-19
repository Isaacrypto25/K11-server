/**
 * K11 OMNI — DASHBOARD VISUAL SKILL SYSTEM
 * ═════════════════════════════════════════════════════════════════
 * Dashboard com perfil, nível, exp, eneagrama e habilidades visuais
 */

'use strict';

const K11SkillDashboard = (() => {

    // ── RENDERIZAR DASHBOARD COMPLETO ───────────────────────
    const render = (userProfile) => {
        const container = document.getElementById('k11-skill-dashboard');
        if (!container) return;

        const archetype = userProfile.getPrimaryArchetype();
        const archetypeScores = userProfile.getArchetypeScores();
        const nextLevelXP = userProfile.level * 1000;
        const currentLevelXP = nextLevelXP - 1000;
        const levelProgress = ((userProfile.totalXP - currentLevelXP) / 1000) * 100;

        const html = `
            <div class="k11-skill-dashboard-container">
                
                <!-- HEADER COM PERFIL -->
                <div class="k11-skill-header">
                    <div class="k11-profile-card">
                        <!-- Avatar com Nível -->
                        <div class="k11-profile-avatar">
                            <div class="k11-level-badge">${userProfile.level}</div>
                            <div class="k11-avatar-initial">${userProfile.userId.charAt(0).toUpperCase()}</div>
                        </div>

                        <!-- Info do Usuário -->
                        <div class="k11-profile-info">
                            <h2>${userProfile.userId}</h2>
                            <div class="k11-archetype-badge">
                                <span class="k11-arch-icon">${archetype.icon}</span>
                                <span>${archetype.name}</span>
                            </div>

                            <!-- Barra de XP -->
                            <div class="k11-xp-container">
                                <div class="k11-xp-bar">
                                    <div class="k11-xp-fill" style="width: ${levelProgress}%; background: linear-gradient(90deg, ${archetype.color} 0%, ${archetype.color}dd 100%);"></div>
                                </div>
                                <div class="k11-xp-text">
                                    <span>${userProfile.totalXP} / ${nextLevelXP} XP</span>
                                    <span class="k11-xp-percentage">${Math.round(levelProgress)}%</span>
                                </div>
                            </div>
                        </div>

                        <!-- Botões de Ação -->
                        <div class="k11-profile-actions">
                            <button class="k11-btn-small" onclick="K11SkillDashboard.openModal('${userProfile.userId}')">
                                👁️ Ver Perfil
                            </button>
                            <button class="k11-btn-small" onclick="K11SkillDashboard.openMissions('${userProfile.userId}')">
                                🎯 Missões
                            </button>
                        </div>
                    </div>
                </div>

                <!-- RADAR CHART (Eneagrama Visual) -->
                <div class="k11-radar-section">
                    <h3>Sua Composição de Habilidades</h3>
                    <div class="k11-radar-container">
                        <div id="k11-radar-chart"></div>
                    </div>
                </div>

                <!-- ATRIBUTOS DETALHADOS -->
                <div class="k11-attributes-section">
                    <h3>Atributos Principais</h3>
                    <div class="k11-attributes-grid">
                        ${renderAttributesGrid(userProfile)}
                    </div>
                </div>

                <!-- ESPECIALIDADES -->
                <div class="k11-specializations-section">
                    <h3>Especialidades Desbloqueadas</h3>
                    <div class="k11-specializations-list">
                        ${renderSpecializations(userProfile)}
                    </div>
                </div>

                <!-- BADGES/CERTIFICAÇÕES -->
                <div class="k11-badges-section">
                    <h3>Certificações & Badges</h3>
                    <div class="k11-badges-grid">
                        ${renderBadges(userProfile)}
                    </div>
                </div>

                <!-- HISTÓRICO RECENTE -->
                <div class="k11-history-section">
                    <h3>Progresso Recente</h3>
                    <div class="k11-history-timeline">
                        ${renderTimeline(userProfile)}
                    </div>
                </div>

            </div>
        `;

        container.innerHTML = html;

        // Renderizar gráfico radar
        setTimeout(() => {
            K11UserProfileUI.renderRadarChart('k11-radar-chart', userProfile);
        }, 100);
    };

    // ── GRID DE ATRIBUTOS ────────────────────────────────────
    const renderAttributesGrid = (userProfile) => {
        const archetypes = K11SkillSystem.getAllArchetypes();
        let html = '';

        archetypes.forEach(arch => {
            const attrs = arch.primaryAttributes;
            html += `
                <div class="k11-attr-section" style="border-left: 4px solid ${arch.color}">
                    <div class="k11-attr-header">
                        <span class="k11-attr-icon">${arch.icon}</span>
                        <span>${arch.name.split('(')[1].replace(')', '')}</span>
                    </div>
                    <div class="k11-attr-items">
                        ${attrs.map(attr => {
                            const value = userProfile.attributes[attr] || 0;
                            const max = 100;
                            const percentage = (value / max) * 100;
                            const attrName = K11SkillSystem.ATTRIBUTES[attr].name;
                            
                            return `
                                <div class="k11-attr-item">
                                    <div class="k11-attr-name">${attrName}</div>
                                    <div class="k11-attr-bar">
                                        <div class="k11-attr-fill" style="width: ${percentage}%; background-color: ${arch.color};"></div>
                                    </div>
                                    <div class="k11-attr-value">${Math.round(value)}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });

        return html;
    };

    // ── ESPECIALIDADES ───────────────────────────────────────
    const renderSpecializations = (userProfile) => {
        if (!userProfile.specializations || userProfile.specializations.length === 0) {
            return '<p class="k11-empty">Nenhuma especialidade desbloqueada ainda</p>';
        }

        return userProfile.specializations.map(spec => {
            const archId = spec.split('_')[0];
            const arch = K11SkillSystem.getArchetype(archId);
            
            return `
                <div class="k11-spec-badge" style="background: ${arch.color}20; border: 2px solid ${arch.color}">
                    <span class="k11-spec-icon">${arch.icon}</span>
                    <span>${spec}</span>
                    <span class="k11-check">✓</span>
                </div>
            `;
        }).join('');
    };

    // ── BADGES ───────────────────────────────────────────────
    const renderBadges = (userProfile) => {
        if (!userProfile.badges || userProfile.badges.length === 0) {
            return '<p class="k11-empty">Complete missões para ganhar badges!</p>';
        }

        return userProfile.badges.map(badge => `
            <div class="k11-badge-item" title="${badge}">
                <div class="k11-badge-icon">🏅</div>
                <div class="k11-badge-name">${badge}</div>
            </div>
        `).join('');
    };

    // ── TIMELINE DO PROGRESSO ────────────────────────────────
    const renderTimeline = (userProfile) => {
        const history = userProfile.skillHistory.slice(-5).reverse();
        
        if (!history || history.length === 0) {
            return '<p class="k11-empty">Nenhum progresso registrado</p>';
        }

        return history.map(entry => {
            const attr = K11SkillSystem.ATTRIBUTES[entry.attribute];
            const date = new Date(entry.timestamp).toLocaleDateString('pt-BR');
            
            return `
                <div class="k11-timeline-item">
                    <div class="k11-timeline-marker"></div>
                    <div class="k11-timeline-content">
                        <div class="k11-timeline-attr"><strong>${attr.name}</strong></div>
                        <div class="k11-timeline-xp">+${entry.amount} XP</div>
                        <div class="k11-timeline-progress">
                            <div class="k11-progress-bar">
                                <div class="k11-progress-fill" style="width: ${(entry.resultValue / 100) * 100}%"></div>
                            </div>
                            <span>${entry.resultValue}/100</span>
                        </div>
                        <div class="k11-timeline-date">${date}</div>
                    </div>
                </div>
            `;
        }).join('');
    };

    // ── ABRIR MODAL DE PERFIL ────────────────────────────────
    const openModal = (userId) => {
        if (typeof K11UserProfileUI !== 'undefined' && window.K11CurrentUserProfile) {
            K11UserProfileUI.showProfileModal(window.K11CurrentUserProfile);
        }
    };

    // ── ABRIR MISSÕES ────────────────────────────────────────
    const openMissions = (userId) => {
        window.location.href = '/missoes';
    };

    // ── ABRIR COMO VIEW NO STAGE ────────────────────────────
    const open = () => {
        const stage = document.getElementById('stage');
        if (!stage) return;
        const container = document.createElement('div');
        container.id = 'k11-skill-dashboard';
        stage.innerHTML = '';
        stage.appendChild(container);
        window.scrollTo({ top: 0, behavior: 'instant' });
        if (window.K11CurrentUserProfile) {
            render(window.K11CurrentUserProfile);
        } else {
            container.innerHTML = '<div class="op-card" style="text-align:center;padding:32px"><div class="spinner"></div><p style="color:var(--text-muted);font-size:12px;margin-top:10px">Carregando perfil...</p></div>';
        }
    };

    // API Pública
    return {
        render,
        open,
        openModal,
        openMissions: () => {
            if (typeof K11Profile !== 'undefined') K11Profile.navigate('missoes');
        },
    };
})();

// Auto-renderizar se elemento existir
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('k11-skill-dashboard') && window.K11CurrentUserProfile) {
            K11SkillDashboard.render(window.K11CurrentUserProfile);
        }
    });
} else {
    if (document.getElementById('k11-skill-dashboard') && window.K11CurrentUserProfile) {
        K11SkillDashboard.render(window.K11CurrentUserProfile);
    }
}
