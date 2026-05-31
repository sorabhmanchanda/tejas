// =============================================
// Anna — Food Photo Analyzer (Gemini vision). The killer feature.
// POST /api/photo/analyze  (multipart: field "photo")
// =============================================

import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { callAI, parseJsonResponse, hasApiKey } from '../lib/ai.js';
import { UPLOAD_DIR } from '../lib/paths.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

// Store with server-generated filenames; never trust the client filename.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] ?? '.jpg';
    cb(null, `meal_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB cap on untrusted uploads
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG, PNG, or WebP images are allowed'));
  },
});

const SYSTEM_PROMPT = `You are Anna, the nutrition agent for an eggetarian Indian user on a fat-loss cut.
You analyze food photos and return structured nutrition data.

You are FLUENT in Indian food: rotis, dals, sabzis, paneer, eggs, dahi, biryani, dosas, idlis, paratha, etc.
You can estimate portion sizes from visual cues (plate size, katori size, hand reference).
Be realistic, not optimistic, with portion estimates.

RETURN ONLY VALID JSON, no markdown fences:
{
  "items": [
    { "name": "string", "portion": "string", "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }
  ],
  "total_calories": number,
  "total_protein_g": number,
  "total_carbs_g": number,
  "total_fat_g": number,
  "confidence": 0.0-1.0,
  "notes": "any caveats about the estimate"
}`;

async function analyzeFoodPhoto(imagePath, mimeType) {
  const imageData = fs.readFileSync(imagePath).toString('base64');
  const text = await callAI({
    maxTokens: 1000,
    json: true,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageData } },
          { type: 'text', text: 'Analyze this meal. Return JSON only.' },
        ],
      },
    ],
  });
  return parseJsonResponse(text);
}

// Deterministic mock so the UI shell + photo flow work before a key is set.
function mockAnalysis() {
  return {
    items: [
      { name: 'Roti (whole wheat)', portion: '2 medium', calories: 180, protein_g: 6, carbs_g: 36, fat_g: 2 },
      { name: 'Dal tadka', portion: '1 katori', calories: 180, protein_g: 9, carbs_g: 24, fat_g: 5 },
      { name: 'Bhindi sabzi', portion: '1 katori', calories: 120, protein_g: 3, carbs_g: 12, fat_g: 7 },
      { name: 'Curd (dahi)', portion: '1 small bowl', calories: 90, protein_g: 5, carbs_g: 7, fat_g: 4 },
    ],
    total_calories: 570,
    total_protein_g: 23,
    total_carbs_g: 79,
    total_fat_g: 18,
    confidence: 0.62,
    notes: 'MOCK estimate (no GEMINI_API_KEY set). Add your key to enable real Gemini vision.',
  };
}

const router = Router();

router.post('/analyze', (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No photo uploaded (field name must be "photo")' });
    }

    // Always use forward slashes so the path resolves as a /uploads/ URL.
    const relPath = `uploads/${path.basename(req.file.path)}`;

    try {
      let analysis;
      let mock = false;
      if (hasApiKey()) {
        analysis = await analyzeFoodPhoto(req.file.path, req.file.mimetype);
      } else {
        analysis = mockAnalysis();
        mock = true;
      }
      res.json({ ...analysis, photo_path: relPath, mock });
    } catch (e) {
      console.error('[photo/analyze]', e.message);
      // Fall back to a mock so the user can still log, but flag it.
      const analysis = mockAnalysis();
      analysis.notes = `Vision call failed, returned a fallback estimate. ${analysis.notes}`;
      res.status(200).json({ ...analysis, photo_path: relPath, mock: true, degraded: true });
    }
  });
});

export default router;
