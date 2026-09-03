import { Router } from 'express';
export function statsRouter(store) { const router = Router(); router.get('/', (_req, res) => res.json(store.stats())); return router; }
