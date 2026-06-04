import { Router } from 'express';
import { requireLoginId } from '../lib/user.js';
import { isFleetDiscussing, listFleetMessages, postFleetUserMessage } from '../lib/fleetChat.js';

const router = Router();
router.use(requireLoginId);

router.get('/messages', (req, res) => {
  const sinceId = Math.max(0, Number(req.query.since) || 0);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 80));
  const messages = listFleetMessages(req.loginId, { sinceId, limit });
  res.json({ messages, active: isFleetDiscussing(req.loginId) });
});

router.get('/status', (req, res) => {
  res.json({ active: isFleetDiscussing(req.loginId) });
});

router.post('/messages', (req, res) => {
  const message = req.body?.message;
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  try {
    const result = postFleetUserMessage(req.loginId, message);
    res.status(202).json(result);
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ error: e.message || 'Could not post message' });
  }
});

export default router;
