import { Router } from 'express';
import { localDate } from '../game/daily.js';
export function dailyRouter() { const router = Router(); router.get('/', (_req, res) => res.json({ date: localDate(), label: 'DAILY MODE', seedVersion: 'v1', allowsUnlimitedAttempts: true })); return router; }
