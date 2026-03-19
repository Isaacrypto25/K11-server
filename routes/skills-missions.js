'use strict';

/**
 * K11 OMNI ELITE — Skills & Missions Routes
 * ══════════════════════════════════════════
 * GET  /api/skills/profile/:userId
 * POST /api/skills/profile/:userId/xp
 * POST /api/skills/profile/:userId/validate
 * GET  /api/skills/archetypes
 * GET  /api/skills/attributes
 *
 * GET  /api/missions
 * POST /api/missions
 * POST /api/missions/:id/publish
 * GET  /api/missions/recommendations/:userId
 * POST /api/missions/:id/assign/:userId
 * POST /api/missions/:id/complete/:userId
 * GET  /api/missions/marketplace/stats
 */

const express   = require('express');
const router    = express.Router();
const datastore = require('../services/datastore');
const logger    = require('../services/logger');
const crypto    = require('crypto');

function _sb()  { return datastore.supabase; }
function _now() { return new Date().toISOString(); }
function _uuid(){ return crypto.randomUUID(); }

// ── DEFINIÇÕES ────────────────────────────────────────────────
const ARCHETYPES = {
    executor: { id:'executor', name:'O Executor',     icon:'⚡', attributes:['velocidade','resistencia','consistencia'] },
    analyst:  { id:'analyst',  name:'O Estrategista', icon:'🧠', attributes:['precisao','logica','otimizacao'] },
    diplomat: { id:'diplomat', name:'O Diplomata',    icon:'🤝', attributes:['empatia','comunicacao','lideranca'] },
    creator:  { id:'creator',  name:'O Criativo',     icon:'💡', attributes:['criatividade','inovacao','adaptabilidade'] },
};

const ATTRIBUTES = {
    velocidade:'executor', resistencia:'executor', consistencia:'executor',
    precisao:'analyst',    logica:'analyst',        otimizacao:'analyst',
    empatia:'diplomat',    comunicacao:'diplomat',  lideranca:'diplomat',
    criatividade:'creator',inovacao:'creator',      adaptabilidade:'creator',
};

function _calcLevel(totalXP) {
    const LEVELS = [0,500,1500,3000,5000,8000,12000,18000,25000,35000];
    return LEVELS.filter(xp => totalXP >= xp).length;
}

function _calcArchetypeScores(attributes) {
    const scores = {};
    for (const [archId, arch] of Object.entries(ARCHETYPES)) {
        const vals = arch.attributes.map(a => attributes[a] || 25);
        scores[archId] = Math.round(vals.reduce((a,v)=>a+v,0) / vals.length);
    }
    return scores;
}

// ══════════════════════════════════════════
// SKILLS
// ══════════════════════════════════════════

// GET /api/skills/profile/:userId
router.get('/profile/:userId', async (req, res) => {
    try {
        const sb = _sb();
        if (sb) {
            const { data, error } = await sb.from('user_profiles').select('*').eq('user_id', req.params.userId).single();
            if (error && error.code !== 'PGRST116') throw error;
            if (data) return res.json({ ok:true, data });
        }
        // Perfil padrão
        res.json({ ok:true, data: { user_id:req.params.userId, level:1, total_xp:0, attributes:{}, archetype_scores:{}, badges:[], specializations:[] } });
    } catch(e) {
        res.status(500).json({ ok:false, error:e.message });
    }
});

// POST /api/skills/profile/:userId/xp
router.post('/profile/:userId/xp', async (req, res) => {
    try {
        const { attributes: gains = {}, missionId } = req.body;
        const userId = req.params.userId;
        const sb = _sb();

        if (sb) {
            // Busca perfil atual
            const { data: profile } = await sb.from('user_profiles').select('*').eq('user_id', userId).single();
            const attrs = profile?.attributes || {};

            // Aplica ganhos
            for (const [attr, amount] of Object.entries(gains)) {
                if (ATTRIBUTES[attr]) {
                    attrs[attr] = Math.min(100, (attrs[attr] || 25) + amount);
                }
            }
            const totalXP = Object.values(attrs).reduce((a,v)=>a+(v*10),0);
            const level   = _calcLevel(totalXP);
            const scores  = _calcArchetypeScores(attrs);
            const primary = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0]?.[0];

            const update = { user_id:userId, level, total_xp:totalXP, attributes:attrs, archetype_scores:scores, primary_archetype:primary, updated_at:_now() };

            await sb.from('user_profiles').upsert(update, { onConflict:'user_id' });

            // Log XP
            for (const [attr, amount] of Object.entries(gains)) {
                await sb.from('xp_log').insert({ user_id:userId, mission_id:missionId||null, attribute:attr, amount });
            }

            return res.json({ ok:true, data:update });
        }

        res.json({ ok:true, message:'XP salvo localmente' });
    } catch(e) {
        logger.error('SKILLS', `xp: ${e.message}`);
        res.status(500).json({ ok:false, error:e.message });
    }
});

// GET /api/skills/archetypes
router.get('/archetypes', (req, res) => {
    res.json({ ok:true, data: Object.values(ARCHETYPES) });
});

// GET /api/skills/attributes
router.get('/attributes', (req, res) => {
    res.json({ ok:true, data: ATTRIBUTES });
});

// ══════════════════════════════════════════
// MISSIONS
// ══════════════════════════════════════════

// GET /api/missions
router.get('/', async (req, res) => {
    try {
        const { status, archetype } = req.query;
        const sb = _sb();
        if (sb) {
            let q = sb.from('missions').select('*').order('created_at', {ascending:false}).limit(100);
            if (status)    q = q.eq('status', status);
            if (archetype) q = q.eq('target_archetype', archetype);
            const { data, error } = await q;
            if (error) throw error;
            return res.json({ ok:true, data:data||[], count:(data||[]).length });
        }
        res.json({ ok:true, data:[], count:0 });
    } catch(e) {
        res.status(500).json({ ok:false, error:e.message });
    }
});

// POST /api/missions
router.post('/', async (req, res) => {
    try {
        const { title, description, type, compartment, requirements, baseXPReward, xpMultiplier } = req.body;
        if (!title || !type) return res.status(400).json({ ok:false, error:'title e type obrigatórios' });

        const mission = {
            id:              _uuid(),
            title,
            description:     description || '',
            type,
            compartment:     compartment || 'geral',
            requirements:    requirements || {},
            target_archetype:requirements?.targetArchetype || null,
            base_xp_reward:  baseXPReward || 100,
            xp_multiplier:   xpMultiplier || 1.0,
            status:          'draft',
            created_by:      req.user?.re || req.user?.ldap,
            created_at:      _now(),
        };

        const sb = _sb();
        if (sb) {
            const { data, error } = await sb.from('missions').insert(mission).select().single();
            if (error) throw error;
            return res.status(201).json({ ok:true, data });
        }
        res.status(201).json({ ok:true, data:mission });
    } catch(e) {
        res.status(500).json({ ok:false, error:e.message });
    }
});

// POST /api/missions/:id/publish
router.post('/:id/publish', async (req, res) => {
    try {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + (req.body.deadlineDays || 7));
        const updates = { status:'published', published_at:_now(), deadline:deadline.toISOString() };
        const sb = _sb();
        if (sb) {
            const { data, error } = await sb.from('missions').update(updates).eq('id', req.params.id).select().single();
            if (error) throw error;
            return res.json({ ok:true, data });
        }
        res.json({ ok:true, message:'Missão publicada' });
    } catch(e) {
        res.status(500).json({ ok:false, error:e.message });
    }
});

// GET /api/missions/recommendations/:userId
router.get('/recommendations/:userId', async (req, res) => {
    try {
        const sb = _sb();
        if (!sb) return res.json({ ok:true, data:[] });

        const [{ data:profile }, { data:missions }] = await Promise.all([
            sb.from('user_profiles').select('*').eq('user_id', req.params.userId).single(),
            sb.from('missions').select('*').eq('status','published').limit(50),
        ]);

        const userAttrs  = profile?.attributes || {};
        const userLevel  = profile?.level || 1;
        const userScores = profile?.archetype_scores || {};

        const recommendations = (missions||[]).map(m => {
            const reqs     = m.requirements || {};
            const minLevel = reqs.minLevel || 1;
            let affinity   = 50;
            let canAccept  = true;

            if (userLevel < minLevel) { affinity -= 30; canAccept = false; }
            else { affinity += Math.min(20, (userLevel - minLevel) * 5); }

            const archScore = userScores[m.target_archetype] || 0;
            if (archScore > 60) affinity += 15;

            return {
                ...m,
                affinity:    Math.max(0, Math.min(100, affinity)),
                canAccept,
                finalXP:     Math.round((m.base_xp_reward||100) * (m.xp_multiplier||1)),
            };
        }).sort((a,b) => b.affinity - a.affinity);

        res.json({ ok:true, data:recommendations });
    } catch(e) {
        res.status(500).json({ ok:false, error:e.message });
    }
});

// POST /api/missions/:id/assign/:userId
router.post('/:id/assign/:userId', async (req, res) => {
    try {
        const { mentorId } = req.body;
        const assignment = {
            mission_id:  req.params.id,
            user_id:     req.params.userId,
            mentor_id:   mentorId || null,
            status:      'in_progress',
            assigned_at: _now(),
        };

        const sb = _sb();
        if (sb) {
            const { data, error } = await sb.from('mission_assignments').insert(assignment).select().single();
            if (error) throw error;
            await sb.from('missions').update({ status:'in_progress' }).eq('id', req.params.id);
            return res.json({ ok:true, data });
        }
        res.json({ ok:true, data:assignment });
    } catch(e) {
        res.status(500).json({ ok:false, error:e.message });
    }
});

// POST /api/missions/:id/complete/:userId
router.post('/:id/complete/:userId', async (req, res) => {
    try {
        const sb = _sb();
        if (sb) {
            const { data:mission } = await sb.from('missions').select('*').eq('id', req.params.id).single();
            const xp = Math.round((mission?.base_xp_reward||100) * (mission?.xp_multiplier||1));
            await sb.from('mission_assignments').update({ status:'completed', completed_at:_now() })
                .eq('mission_id', req.params.id).eq('user_id', req.params.userId);
            await sb.from('missions').update({ status:'completed', completed_at:_now() }).eq('id', req.params.id);
            await sb.from('xp_log').insert({ user_id:req.params.userId, mission_id:req.params.id, attribute:'geral', amount:xp });
            return res.json({ ok:true, xp, message:`Missão concluída! +${xp} XP` });
        }
        res.json({ ok:true, xp:100 });
    } catch(e) {
        res.status(500).json({ ok:false, error:e.message });
    }
});

// GET /api/missions/marketplace/stats
router.get('/marketplace/stats', async (req, res) => {
    try {
        const sb = _sb();
        if (sb) {
            const { data } = await sb.from('missions').select('status, type');
            const stats = {
                total:      (data||[]).length,
                published:  (data||[]).filter(m=>m.status==='published').length,
                inProgress: (data||[]).filter(m=>m.status==='in_progress').length,
                completed:  (data||[]).filter(m=>m.status==='completed').length,
            };
            return res.json({ ok:true, data:stats });
        }
        res.json({ ok:true, data:{ total:0, published:0, inProgress:0, completed:0 } });
    } catch(e) {
        res.status(500).json({ ok:false, error:e.message });
    }
});

module.exports = router;
