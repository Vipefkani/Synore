import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { initSchema, seedDatabase } from './server/db.ts';
import { attachWebSocketServer } from './server/ws.ts';
import apiRouter from './server/routes.ts';

dotenv.config();

async function startServer() {
  initSchema();
  seedDatabase();

  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', apiRouter);

  // Guarantee /api/* always responds with JSON even on unmatched paths
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Global JSON error handler for API & body parse errors
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api')) {
      return res.status(400).json({ error: err.message || 'Invalid request' });
    }
    next(err);
  });

  attachWebSocketServer(server);

  const distPath = path.resolve(process.cwd(), 'dist');
  const hasBuiltDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (process.env.NODE_ENV !== 'production' || !hasBuiltDist) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Synore server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Synore server:', err);
  process.exit(1);
});
