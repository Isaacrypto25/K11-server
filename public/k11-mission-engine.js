/**
 * K11 OMNI ELITE — Mission Engine (Frontend)
 * ════════════════════════════════════════════
 * Marketplace de missões: criação, matching por afinidade, aceitação.
 * Depende de: k11-skill-system.js, k11-config.js
 *
 * Expõe: K11MissionEngine (global)
 */

'use strict';

const K11MissionEngine = (() => {

    // ── TIPOS DE MISSÃO ───────────────────────────────────────────
    const MISSION_TYPES = {
        SUSTENTACAO: {
            id:          'sustentacao',
            name:        'Sustentação',
            icon:        '⚙️',
            archetype:   'executor',
            baseXP:      100,
            risk:        'low',
            color:       '#FF8C00',
            description: 'Manutenção e operação do sistema',
        },
        DESCOBERTA: {
            id:          'descoberta',
            name:        'Descoberta',
            icon:        '🔍',
            archetype:   'creator',
            baseXP:      250,
            risk:        'medium',
            color:       '#A78BFA',
            description: 'Pesquisa e novas soluções',
        },
        CRITICA: {
            id:          'critica',
            name:        'Crítica',
            icon:        '⚠️',
            archetype:   'analyst',
            baseXP:      500,
            risk:        'high',
            color:       '#F87171',
            description: 'Análise crítica — nível 3+ exigido',
        },
        SUPORTE: {
            id:          'suporte',
            name:        'Suporte',
            icon:        '🤝',
            archetype:   'diplomat',
            baseXP:      150,
            risk:        'low',
            color:       '#34D399',
            description: 'Assistência e atendimento',
        },
        MENTORIA: {
            id:          'mentoria',
            name:        'Mentoria',
            icon:        '👨‍🏫',
            archetype:   'diplomat',
            baseXP:      200,
            risk:        'medium',
            color:       '#60A5FA',
            description: 'Ensinar e desenvolver novatos — nível 5+ exigido',
        },
    };

    // ── CLASSE MISSION ────────────────────────────────────────────
    class Mission {
        constructor(config) {
            this.id          = config.id || `mission_${Date.now()}`;
            this.title       = config.title;
            this.description = config.description || '';
            this.type        = config.type || MISSION_TYPES.SUSTENTACAO;
            this.compartment = config.compartment || 'geral';
            this.requirements = {
                minLevel:           config.requirements?.minLevel || 1,
                requiredAttributes: config.requirements?.requiredAttributes || {},
                targetArchetype:    config.requirements?.targetArchetype || this.type.archetype,
                deadlineDays:       config.requirements?.deadlineDays || 7,
            };
            this.baseXPReward   = config.baseXPReward || this.type.baseXP;
            this.xpMultiplier   = config.xpMultiplier || 1.0;
            this.status         = 'draft';
            this.assignee       = null;
            this.mentor         = null;
            this.createdAt      = new Date().toISOString();
            this.publishedAt    = null;
            this.completedAt    = null;
            this.deadline       = null;
        }

        /** Calcula o score de afinidade (0-100) de um UserProfile com esta missão */
        checkAffinity(userProfile) {
            const { minLevel, requiredAttributes, targetArchetype } = this.requirements;
            const scores = userProfile.getArchetypeScores();
            const attrs  = userProfile.attributes;
            const issues = [];

            let affinity    = 50; // base
            let canAccept   = true;

            // Nível mínimo
            if (userProfile.level < minLevel) {
                affinity -= 30;
                canAccept = false;
                issues.push(`Nível mínimo ${minLevel} requerido (você: ${userProfile.level})`);
            } else {
                affinity += Math.min(20, (userProfile.level - minLevel) * 5);
            }

            // Atributos requeridos
            for (const [attr, minVal] of Object.entries(requiredAttributes)) {
                const userVal = attrs[attr] || 0;
                if (userVal < minVal) {
                    affinity -= 15;
                    canAccept = false;
                    issues.push(`${attr}: ${userVal}/${minVal}`);
                } else {
                    affinity += Math.min(5, Math.floor((userVal - minVal) / 5));
                }
            }

            // Alinhamento de arquétipo
            if (targetArchetype && scores[targetArchetype] > 60) {
                affinity += 15;
            }

            affinity = Math.max(0, Math.min(100, affinity));

            return {
                affinity,
                canAccept,
                issues,
                needsMentor: canAccept === false && userProfile.level >= 1 && userProfile.level < minLevel,
                finalXP:     Math.round(this.baseXPReward * this.xpMultiplier),
            };
        }

        publish() {
            if (this.status !== 'draft') throw new Error('Missão já foi publicada.');
            this.status      = 'published';
            this.publishedAt = new Date().toISOString();
            const d          = new Date();
            d.setDate(d.getDate() + this.requirements.deadlineDays);
            this.deadline = d.toISOString();
        }

        assignUser(userId, mentorId = null) {
            if (this.status !== 'published') throw new Error('Missão não está publicada.');
            this.assignee  = userId;
            this.mentor    = mentorId || null;
            this.status    = 'in_progress';
        }

        complete(userId) {
            if (this.assignee !== userId) throw new Error('Você não está atribuído a esta missão.');
            this.status      = 'completed';
            this.completedAt = new Date().toISOString();
            return {
                xpReward:    Math.round(this.baseXPReward * this.xpMultiplier),
                mentorXP:    this.mentor ? Math.round(this.baseXPReward * 0.3) : 0,
                apprenticeXP:this.mentor ? Math.round(this.baseXPReward * 0.75) : this.baseXPReward,
            };
        }

        toCard(userProfile = null) {
            const affinity = userProfile ? this.checkAffinity(userProfile) : null;
            return {
                id:          this.id,
                title:       this.title,
                description: this.description,
                type:        this.type,
                compartment: this.compartment,
                deadline:    this.deadline,
                requirements:this.requirements,
                xpReward:    Math.round(this.baseXPReward * this.xpMultiplier),
                status:      this.status,
                affinity,
            };
        }
    }

    // ── MARKETPLACE ───────────────────────────────────────────────
    class Marketplace {
        constructor() {
            this._missions = [];
        }

        add(mission) {
            this._missions.push(mission);
        }

        /** Retorna missões publicadas ordenadas por afinidade */
        getRecommendations(userProfile, limit = 10) {
            return this._missions
                .filter(m => m.status === 'published')
                .map(m => ({ mission: m, ...m.checkAffinity(userProfile) }))
                .sort((a, b) => b.affinity - a.affinity)
                .slice(0, limit)
                .map(({ mission, affinity, canAccept, issues, needsMentor, finalXP }) => ({
                    ...mission.toCard(userProfile),
                    affinity,
                    canAccept,
                    issues,
                    needsMentor,
                    finalXP,
                }));
        }

        getStats() {
            const all = this._missions;
            return {
                total:      all.length,
                published:  all.filter(m => m.status === 'published').length,
                inProgress: all.filter(m => m.status === 'in_progress').length,
                completed:  all.filter(m => m.status === 'completed').length,
                byType:     Object.fromEntries(
                    Object.values(MISSION_TYPES).map(t => [t.id, all.filter(m => m.type.id === t.id).length])
                ),
            };
        }
    }

    // ── API PÚBLICA ───────────────────────────────────────────────
    return {
        MISSION_TYPES,
        Mission,
        Marketplace,

        createMission(config) {
            return new Mission(config);
        },

        createMarketplace() {
            return new Marketplace();
        },

        /** Carrega missões recomendadas do servidor */
        async fetchRecommendations(userId) {
            try {
                const res  = await K11Auth.fetch(`/api/missions/recommendations/${userId}`);
                const data = await res?.json();
                return data?.ok ? (data.data || []) : [];
            } catch (e) {
                console.warn('[K11MissionEngine] fetchRecommendations falhou:', e.message);
                return [];
            }
        },

        /** Aceita missão no servidor */
        async acceptMission(missionId, userId) {
            try {
                const res  = await K11Auth.fetch(`/api/missions/${missionId}/assign/${userId}`, { method: 'POST' });
                const data = await res?.json();
                return data?.ok || false;
            } catch (e) {
                console.warn('[K11MissionEngine] acceptMission falhou:', e.message);
                return false;
            }
        },

        /** Conclui missão no servidor */
        async completeMission(missionId, userId) {
            try {
                const res  = await K11Auth.fetch(`/api/missions/${missionId}/complete/${userId}`, { method: 'POST' });
                const data = await res?.json();
                return data?.ok ? data.xp : null;
            } catch (e) {
                console.warn('[K11MissionEngine] completeMission falhou:', e.message);
                return null;
            }
        },
    };

})();
