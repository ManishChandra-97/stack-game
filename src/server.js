import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './db/database.js';
import { errorHandler } from './middleware/errors.js';
import { runsRouter } from './routes/runs.js';
import { statsRouter } from './routes/stats.js';
import { dailyRouter } from './routes/daily.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = process.env.STACK_DB_PATH || (process.env.VERCEL ? '/tmp/stack.db' : path.join(root, 'data/stack.db'));
export function makeApp(store = createStore(databasePath)) { const app = express(); app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:'] } } })); app.use(express.json({ limit: '16kb' })); app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false })); app.use('/api/run', runsRouter(store)); app.use('/api/stats', statsRouter(store)); app.use('/api/daily', dailyRouter()); app.use(express.static(path.join(root, 'public'))); app.use((req, _res, next) => { const error = new Error('Route not found.'); error.code = 'NOT_FOUND'; error.status = 404; next(error); }); app.use(errorHandler); return app; }
const app = makeApp();
export default app;
if (process.argv[1] === fileURLToPath(import.meta.url)) { const port = Number(process.env.PORT || 3000); app.listen(port, () => console.log(`STACK running at http://localhost:${port}`)); }
