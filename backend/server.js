import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import './db/database.js'; // ensure schema applied + agents seeded
import { hasApiKey, MODEL } from './lib/ai.js';
import { UPLOAD_DIR } from './lib/paths.js';
import { startScheduler } from './scheduler.js';

import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import logRoutes from './routes/log.js';
import photoRoutes from './routes/photoAnalyze.js';
import agentRoutes from './routes/agents.js';
import briefingRoutes from './routes/briefing.js';
import fleetRoutes from './routes/fleet.js';

const app = express();
const PORT = process.env.PORT || 3001;

function corsOptions() {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (!raw) return {}; // local dev: permissive default
  const origins = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) callback(null, true);
      else callback(new Error('Not allowed by CORS'));
    },
    // Browser must be allowed to send the login-id header from Vercel → Railway.
    allowedHeaders: ['Content-Type', 'X-Tejas-User'],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  };
}

app.use(cors(corsOptions()));
app.use(express.json({ limit: '2mb' }));

// Serve uploaded food photos (read-only static).
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    ai: hasApiKey() ? 'live' : 'mock',
    provider: 'gemini',
    model: MODEL,
    ts: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/log', logRoutes);
app.use('/api/photo', photoRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/briefing', briefingRoutes);
app.use('/api/fleet', fleetRoutes);

// Generic error handler — never leak stack traces to clients.
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`\n  TEJAS backend → http://localhost:${PORT}`);
  console.log(`  Gemini (${MODEL}): ${hasApiKey() ? 'LIVE' : 'MOCK (set GEMINI_API_KEY)'}\n`);
  startScheduler();
});
