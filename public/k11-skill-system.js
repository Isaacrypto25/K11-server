/**
 * K11 OMNI ELITE — Skill System (Frontend)
 * ═══════════════════════════════════════════
 * Gerencia arquétipos, atributos, XP e perfis de usuário no front-end.
 * Usado por: k11-user-profile.js, k11-mission-engine.js
 *
 * Expõe: K11SkillSystem (global)
 */

'use strict';

const K11SkillSystem = (() => {

    // ── DEFINIÇÃO DOS ATRIBUTOS ───────────────────────────────────
    const ATTRIBUTES = {
        // Executor
        velocidade:    { name: 'Velocidade',    archetype: 'executor',   max: 100, icon: '⚡' },
        resistencia:   { name: 'Resistência',   archetype: 'executor',   max: 100, icon: '🏋️' },
        consistencia:  { name: 'Consistência',  archetype: 'executor',   max: 100, icon: '🎯' },
        // Analyst
        precisao:      { name: 'Precisão',      archetype: 'analyst',    max: 100, icon: '🔬' },
        logica:        { name: 'Lógica',        archetype: 'analyst',    max: 100, icon: '🧠' },
        otimizacao:    { name: 'Otimização',    archetype: 'analyst',    max: 100, icon: '📊' },
        // Diplomat
        empatia:       { name: 'Empatia',       archetype: 'diplomat',   max: 100, icon: '❤️' },
        comunicacao:   { name: 'Comunicação',   archetype: 'diplomat',   max: 100, icon: '💬' },
        lideranca:     { name: 'Liderança',     archetype: 'diplomat',   max: 100, icon: '👑' },
        // Creator
        criatividade:  { name: 'Criatividade',  archetype: 'creator',    max: 100, icon: '🎨' },
        inovacao:      { name: 'Inovação',      archetype: 'creator',    max: 100, icon: '💡' },
        adaptabilidade:{ name: 'Adaptabilidade',archetype: 'creator',    max: 100, icon: '🌊' },
    };

    // ── DEFINIÇÃO DOS ARQUÉTIPOS ──────────────────────────────────
    const ARCHETYPES = {
        executor: {
            id:          'executor',
            name:        'O Executor',
            icon:        '⚡',
            color:       '#FF8C00',
            description: 'Velocidade, volume e consistência. Faz acontecer.',
            attributes:  ['velocidade', 'resistencia', 'consistencia'],
        },
        analyst: {
            id:          'analyst',
            name:        'O Estrategista',
            icon:        '🧠',
            color:       '#60A5FA',
            description: 'Dados, precisão e otimização. Pensa antes de agir.',
            attributes:  ['precisao', 'logica', 'otimizacao'],
        },
        diplomat: {
            id:          'diplomat',
            name:        'O Diplomata',
            icon:        '🤝',
            color:       '#34D399',
            description: 'Empatia, comunicação e liderança. Conecta pessoas.',
            attributes:  ['empatia', 'comunicacao', 'lideranca'],
        },
        creator: {
            id:          'creator',
            name:        'O Criativo',
            icon:        '💡',
            color:       '#A78BFA',
            description: 'Criatividade, inovação e adaptabilidade. Pensa diferente.',
            attributes:  ['criatividade', 'inovacao', 'adaptabilidade'],
        },
    };

    // ── NÍVEIS ────────────────────────────────────────────────────
    const LEVELS = [
        { level: 1,  xpRequired: 0,    title: 'Iniciante'   },
        { level: 2,  xpRequired: 500,  title: 'Aprendiz'    },
        { level: 3,  xpRequired: 1500, title: 'Praticante'  },
        { level: 4,  xpRequired: 3000, title: 'Profissional'},
        { level: 5,  xpRequired: 5000, title: 'Especialista'},
        { level: 6,  xpRequired: 8000, title: 'Expert'      },
        { level: 7,  xpRequired: 12000,title: 'Mestre'      },
        { level: 8,  xpRequired: 18000,title: 'Grão-Mestre' },
        { level: 9,  xpRequired: 25000,title: 'Lenda'       },
        { level: 10, xpRequired: 35000,title: 'Elite K11'   },
    ];

    // ── CLASSE USER PROFILE ───────────────────────────────────────
    class UserProfile {
        constructor(userId, attributes = {}) {
            this.userId     = userId;
            this.totalXP    = 0;
            this.level      = 1;
            this.attributes = {};
            this.specializations = [];
            this.badges     = [];
            this.skillHistory = [];

            // Inicializa atributos com padrão 25
            for (const key of Object.keys(ATTRIBUTES)) {
                this.attributes[key] = Math.min(100, Math.max(0, attributes[key] || 25));
            }

            this._recalc();
        }

        _recalc() {
            // Calcula XP total a partir dos atributos
            this.totalXP = Object.values(this.attributes).reduce((a, v) => a + v * 10, 0);
            // Determina nível
            this.level = LEVELS.filter(l => this.totalXP >= l.xpRequired).at(-1)?.level || 1;
        }

        gainXP(attribute, amount) {
            if (!ATTRIBUTES[attribute]) return;
            const before = this.attributes[attribute];
            this.attributes[attribute] = Math.min(100, before + amount);
            this.totalXP += amount * 10;
            this.level = LEVELS.filter(l => this.totalXP >= l.xpRequired).at(-1)?.level || 1;
            this.skillHistory.unshift({ attribute, amount, before, after: this.attributes[attribute], ts: new Date().toISOString() });
            if (this.skillHistory.length > 100) this.skillHistory.pop();
        }

        gainXPFromMission(missionId, attributeMap) {
            for (const [attr, amount] of Object.entries(attributeMap)) {
                this.gainXP(attr, amount);
            }
        }

        getArchetypeScores() {
            const scores = {};
            for (const [id, arch] of Object.entries(ARCHETYPES)) {
                const vals = arch.attributes.map(a => this.attributes[a] || 0);
                scores[id] = Math.round(vals.reduce((a, v) => a + v, 0) / vals.length);
            }
            return scores;
        }

        getPrimaryArchetype() {
            const scores = this.getArchetypeScores();
            const primary = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
            return ARCHETYPES[primary[0]];
        }

        getLevelInfo() {
            const cur  = LEVELS.find(l => l.level === this.level) || LEVELS[0];
            const next = LEVELS.find(l => l.level === this.level + 1);
            const pct  = next ? ((this.totalXP - cur.xpRequired) / (next.xpRequired - cur.xpRequired)) * 100 : 100;
            return { ...cur, next, progressPct: Math.min(100, Math.round(pct)) };
        }

        toJSON() {
            return {
                userId:      this.userId,
                totalXP:     this.totalXP,
                level:       this.level,
                attributes:  { ...this.attributes },
                archetypeScores: this.getArchetypeScores(),
                primaryArchetype: this.getPrimaryArchetype().id,
                specializations: this.specializations,
                badges:      this.badges,
            };
        }
    }

    // ── API PÚBLICA ───────────────────────────────────────────────
    return {
        ATTRIBUTES,
        ARCHETYPES,
        LEVELS,
        UserProfile,

        createProfile(userId, attrs = {}) {
            return new UserProfile(userId, attrs);
        },

        getArchetype(id) {
            return ARCHETYPES[id] || null;
        },

        getAllArchetypes() {
            return Object.values(ARCHETYPES);
        },

        getLevelByXP(xp) {
            return LEVELS.filter(l => xp >= l.xpRequired).at(-1) || LEVELS[0];
        },

        /** Carrega perfil do servidor */
        async fetchProfile(userId) {
            try {
                const res  = await K11Auth.fetch(`/api/skills/profile/${userId}`);
                const data = await res?.json();
                if (data?.ok) {
                    const p = new UserProfile(userId, data.data.attributes || {});
                    p.totalXP  = data.data.total_xp || p.totalXP;
                    p.level    = data.data.level    || p.level;
                    p.badges   = data.data.badges   || [];
                    p.specializations = data.data.specializations || [];
                    return p;
                }
            } catch (e) {
                console.warn('[K11SkillSystem] fetchProfile falhou, usando local:', e.message);
            }
            return new UserProfile(userId);
        },

        /** Persiste XP no servidor */
        async saveXP(userId, attributeMap) {
            try {
                await K11Auth.fetch(`/api/skills/profile/${userId}/xp`, {
                    method:  'POST',
                    body:    JSON.stringify({ attributes: attributeMap }),
                });
            } catch (e) {
                console.warn('[K11SkillSystem] saveXP falhou:', e.message);
            }
        },
    };

})();
