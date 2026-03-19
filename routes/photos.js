'use strict';

/**
 * K11 OMNI ELITE — Photos Routes
 * ════════════════════════════════
 * Upload e gestão de fotos de obra (progresso visual).
 *
 * POST /api/photos/obra/:obraId        → upload de foto
 * GET  /api/photos/obra/:obraId        → lista fotos da obra
 * DELETE /api/photos/:photoId          → remove foto
 */

const express   = require('express');
const router    = express.Router();
const multer    = require('multer');
const crypto    = require('crypto');
const datastore = require('../services/datastore');
const logger    = require('../services/logger');

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 15 * 1024 * 1024 }, // 15 MB
    fileFilter: (req, file, cb) => {
        const ok = /^image\/(jpeg|jpg|png|webp|heic)$/i.test(file.mimetype);
        cb(ok ? null : new Error('Apenas imagens JPEG, PNG e WebP'), ok);
    },
});

function _sb()   { return datastore.supabase; }
function _now()  { return new Date().toISOString(); }
function _uuid() { return crypto.randomUUID(); }

// ── POST /api/photos/obra/:obraId ─────────────────────────────
router.post('/obra/:obraId', upload.single('foto'), async (req, res) => {
    try {
        const { obraId } = req.params;
        const { legenda, fase_id } = req.body;
        const file = req.file;

        if (!file) return res.status(400).json({ ok: false, error: 'Nenhuma foto enviada' });

        const sb = _sb();
        if (!sb) return res.status(503).json({ ok: false, error: 'Storage não configurado' });

        // Upload para Supabase Storage (bucket 'obra-photos')
        const ext      = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
        const filename = `${obraId}/${_uuid()}.${ext}`;

        const { data: uploadData, error: uploadError } = await sb.storage
            .from('obra-photos')
            .upload(filename, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600',
                upsert: false,
            });

        if (uploadError) {
            // Fallback: tenta AWS S3 se configurado
            if (process.env.AWS_ACCESS_KEY_ID) {
                return await _uploadToS3(req, res, file, obraId, legenda, fase_id);
            }
            throw uploadError;
        }

        // URL pública
        const { data: { publicUrl } } = sb.storage.from('obra-photos').getPublicUrl(filename);

        // Salva no banco
        const photo = {
            id:         _uuid(),
            obra_id:    obraId,
            fase_id:    fase_id || null,
            url:        publicUrl,
            storage_path: filename,
            legenda:    legenda || null,
            autor_ldap: req.user?.re,
            autor_nome: req.user?.nome,
            created_at: _now(),
        };

        const { data, error } = await sb.from('obra_photos').insert(photo).select().single();
        if (error) throw error;

        logger.info('PHOTOS', `Foto enviada: ${obraId}/${filename}`);
        res.status(201).json({ ok: true, data });

    } catch (e) {
        logger.error('PHOTOS', `Upload falhou: ${e.message}`);
        res.status(500).json({ ok: false, error: e.message });
    }
});

async function _uploadToS3(req, res, file, obraId, legenda, fase_id) {
    try {
        const AWS = require('@aws-sdk/client-s3');
        const s3  = new AWS.S3Client({
            region:      process.env.AWS_S3_REGION || 'us-east-1',
            credentials: {
                accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });

        const ext  = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
        const key  = `obra-photos/${obraId}/${_uuid()}.${ext}`;
        const cmd  = new AWS.PutObjectCommand({
            Bucket:      process.env.AWS_S3_BUCKET,
            Key:         key,
            Body:        file.buffer,
            ContentType: file.mimetype,
        });

        await s3.send(cmd);
        const url = `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com/${key}`;

        const sb   = _sb();
        const photo = { id:_uuid(), obra_id:obraId, fase_id:fase_id||null, url, storage_path:key, legenda:legenda||null, autor_ldap:req.user?.re, created_at:_now() };
        if (sb) { const { data } = await sb.from('obra_photos').insert(photo).select().single(); return res.status(201).json({ ok:true, data }); }
        res.status(201).json({ ok: true, data: photo });
    } catch (e) {
        res.status(500).json({ ok: false, error: `S3 upload falhou: ${e.message}` });
    }
}

// ── GET /api/photos/obra/:obraId ──────────────────────────────
router.get('/obra/:obraId', async (req, res) => {
    try {
        const sb = _sb();
        if (!sb) return res.json({ ok: true, data: [] });
        const { fase_id } = req.query;
        let q = sb.from('obra_photos').select('*').eq('obra_id', req.params.obraId)
            .order('created_at', { ascending: false }).limit(100);
        if (fase_id) q = q.eq('fase_id', fase_id);
        const { data, error } = await q;
        if (error) throw error;
        res.json({ ok: true, data: data || [] });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// ── DELETE /api/photos/:photoId ───────────────────────────────
router.delete('/:photoId', async (req, res) => {
    try {
        const sb = _sb();
        if (!sb) return res.status(503).json({ ok: false, error: 'Storage não configurado' });

        const { data: photo } = await sb.from('obra_photos').select('storage_path').eq('id', req.params.photoId).single();
        if (photo?.storage_path) {
            await sb.storage.from('obra-photos').remove([photo.storage_path]);
        }
        await sb.from('obra_photos').delete().eq('id', req.params.photoId);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

module.exports = router;
