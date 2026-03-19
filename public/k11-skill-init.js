/**
 * K11 SKILL SYSTEM — Frontend Initialization
 * ═════════════════════════════════════════════════════════════════
 * Script de inicialização que carrega o perfil e missões do usuário
 * 
 * Inclua ANTES dos outros scripts K11:
 * <script src="/k11-skill-init.js"></script>
 */

'use strict';

const K11SkillInit = (() => {
    
    // ── CARREGAR PERFIL DO USUÁRIO ──────────────────────────────
    const loadUserProfile = async (userId) => {
        try {
            const response = await fetch(`/api/skills/profile/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${K11Auth.getToken()}`
                }
            });

            if (response.status === 401) {
                console.error('[K11SkillInit] Not authenticated');
                return null;
            }

            if (!response.ok) {
                console.error('[K11SkillInit] Failed to load profile:', response.status);
                return null;
            }

            const profileData = await response.json();
            
            // Criar objeto UserProfile local
            const profile = K11SkillSystem.createProfile(userId, profileData.attributes);
            profile.level = profileData.level;
            profile.totalXP = profileData.totalXP;
            profile.specializations = profileData.specializations || [];
            profile.badges = profileData.badges || [];
            
            console.log('[K11SkillInit] Profile loaded:', profile.toJSON());
            return profile;
        } catch (error) {
            console.error('[K11SkillInit] Load profile error:', error);
            return null;
        }
    };

    // ── RENDERIZAR DASHBOARD DE PERFIL ──────────────────────────
    const renderProfileDashboard = async (userId) => {
        const profile = await loadUserProfile(userId);
        if (!profile) {
            console.error('[K11SkillInit] Failed to load profile');
            return;
        }

        const container = document.getElementById('k11-dashboard');
        if (!container) {
            console.warn('[K11SkillInit] Container #k11-dashboard not found');
            return;
        }

        // Renderizar card de perfil
        const html = K11UserProfileUI.renderProfileCard(profile);
        container.innerHTML = html;

        // Renderizar radar chart após DOM estar pronto
        setTimeout(() => {
            try {
                K11UserProfileUI.renderRadarChart('k11-radar-chart', profile);
            } catch (e) {
                console.error('[K11SkillInit] Radar render error:', e);
            }
        }, 100);

        // Armazenar referência global para acesso posterior
        window.K11CurrentUserProfile = profile;
        
        console.log('[K11SkillInit] Dashboard rendered');
    };

    // ── CARREGAR MISSÕES RECOMENDADAS ──────────────────────────
    const loadMissions = async (userId) => {
        try {
            const response = await fetch(`/api/missions/recommendations/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${K11Auth.getToken()}`
                }
            });

            if (!response.ok) {
                console.error('[K11SkillInit] Failed to load missions:', response.status);
                return [];
            }

            const missions = await response.json();
            renderMissions(missions);
            return missions;
        } catch (error) {
            console.error('[K11SkillInit] Load missions error:', error);
            return [];
        }
    };

    // ── RENDERIZAR CARDS DE MISSÕES ─────────────────────────────
    const renderMissions = (missions) => {
        const container = document.getElementById('k11-missions-list');
        if (!container) {
            console.warn('[K11SkillInit] Container #k11-missions-list not found');
            return;
        }

        if (!missions || missions.length === 0) {
            container.innerHTML = '<p class="k11-empty-state">Nenhuma missão disponível no momento</p>';
            return;
        }

        let html = '<div class="k11-missions-grid">';

        missions.forEach(mission => {
            const color = getMissionColor(mission.type);
            const affinity = mission.affinityScore || 0;
            
            html += `
                <div class="k11-mission-card" style="border-left-color: ${color}">
                    <div class="k11-mission-header">
                        <h3 class="k11-mission-title">${mission.title || 'Sem título'}</h3>
                        <span class="k11-mission-type">${mission.type || 'N/A'}</span>
                    </div>
                    <p class="k11-mission-description">${mission.description || ''}</p>
                    <div class="k11-mission-footer">
                        <span class="k11-mission-xp">⭐ ${mission.baseXPReward || 0} XP</span>
                        <span class="k11-mission-affinity">Afinidade: ${Math.round(affinity)}%</span>
                    </div>
                    <button class="k11-btn-accept" onclick="K11SkillInit.acceptMission('${mission.id}')">
                        Aceitar Missão
                    </button>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
        console.log('[K11SkillInit] Missions rendered:', missions.length);
    };

    // ── CORES POR TIPO DE MISSÃO ────────────────────────────────
    const getMissionColor = (type) => {
        const colors = {
            sustentacao: '#FF6B6B',
            descoberta: '#95E1D3',
            critica: '#4ECDC4',
            suporte: '#FFE66D',
            mentoria: '#667eea'
        };
        return colors[type] || '#667eea';
    };

    // ── ACEITAR UMA MISSÃO ──────────────────────────────────────
    const acceptMission = async (missionId) => {
        if (!window.K11CurrentUserProfile) {
            alert('Perfil não carregado');
            return;
        }

        const userId = window.K11CurrentUserProfile.userId;

        try {
            const response = await fetch(`/api/missions/${missionId}/assign/${userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${K11Auth.getToken()}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                alert(`Erro: ${error.reason || 'Falha ao aceitar missão'}`);
                return;
            }

            const result = await response.json();
            
            // Mostrar notificação
            if (K11Live) {
                K11Live.showNotification('Missão Aceita!', {
                    body: `Você aceitou a missão!`,
                    tag: 'k11-mission-accepted'
                });
                K11Live.playSound('success');
            }

            if (typeof APP !== 'undefined') APP.ui.toast('Missão aceita! 🎯', 'success');

            // Recarregar lista de missões
            await loadMissions(userId);
        } catch (error) {
            console.error('[K11SkillInit] Accept mission error:', error);
            if (typeof APP !== 'undefined') APP.ui.toast('Erro ao aceitar missão', 'danger');
        }
    };

    // ── INICIALIZAR SISTEMA ─────────────────────────────────────
    const init = async () => {
        console.log('[K11SkillInit] Initializing...');

        // Obter userId da sessão (compatível com K11Auth)
        let userId = null;
        try {
            const raw = sessionStorage.getItem('k11_user');
            if (raw) {
                const u = JSON.parse(raw);
                userId = u.re || u.ldap || u.id || u.userId || null;
            }
        } catch(_) {}
        // fallback legado
        if (!userId) userId = sessionStorage.getItem('K11_USER_ID') || sessionStorage.getItem('k11_user_id');
        if (!userId) {
            console.warn('[K11SkillInit] No user ID in session — skill init skipped');
            return; // silencioso, não bloqueia o app
        }

        console.log('[K11SkillInit] User ID:', userId);

        // Verificar se K11SkillSystem está disponível
        if (typeof K11SkillSystem === 'undefined') {
            console.error('[K11SkillInit] K11SkillSystem not loaded');
            setTimeout(init, 500); // Tentar novamente
            return;
        }

        // Carregar e renderizar perfil
        await renderProfileDashboard(userId);

        // Carregar missões
        await loadMissions(userId);

        // Setup de listeners para K11Live se disponível
        if (typeof K11Live !== 'undefined') {
            K11Live.listen('k11:xp-gained', (data) => {
                console.log('[K11SkillInit] XP gained:', data);
                loadMissions(userId); // Recarregar missões
            });

            K11Live.listen('k11:mission-completed', (data) => {
                console.log('[K11SkillInit] Mission completed:', data);
                loadMissions(userId); // Recarregar missões
            });
        }

        console.log('[K11SkillInit] Ready!');
    };

    // ── API PÚBLICA ─────────────────────────────────────────────
    return {
        init,
        loadUserProfile,
        renderProfileDashboard,
        loadMissions,
        acceptMission,
        renderMissions
    };
})();

// ── AUTO-INICIALIZAR ────────────────────────────────────────────
// Só auto-inicializa se houver um container de skill dashboard na página
// No dashboard.html principal, o APP.init() gerencia o fluxo
(function() {
    function _maybeInit() {
        if (document.getElementById('k11-skill-dashboard') ||
            document.getElementById('k11-missions-list')) {
            K11SkillInit.init();
        }
        // Em dashboard.html: init será chamado pelo K11Profile.navigate quando necessário
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _maybeInit);
    } else {
        _maybeInit();
    }
})();
