import express from 'express';
import http from 'node:http';
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
  app.use('/api', apiRouter);

  attachWebSocketServer(server);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
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
