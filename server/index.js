import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

import { initDb, seedDb } from './db/schema.js';

initDb();
seedDb();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import createVitalsRouter from './routes/vitals.js';
import createPatientsRouter from './routes/patients.js';
import createAlertsRouter from './routes/alerts.js';
import createRiskRouter from './routes/risk.js';
import createDemoRouter from './routes/demo.js';
import createChatRouter from './routes/chat.js';
import createAuthRouter from './routes/auth.js';
import { requireAuth, extractUser } from './middleware/auth.js';

const app = express();
const httpServer = createServer(app);

const isProduction = process.env.NODE_ENV === 'production';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const io = new Server(httpServer, {
  cors: isProduction
    ? undefined
    : { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

const PORT = process.env.PORT || 3001;

// Middleware — only need CORS in dev (production serves from same origin)
if (!isProduction) {
  app.use(cors({ origin: CLIENT_ORIGIN }));
}
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
app.use('/api', limiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Demo routes — no auth required (mounted before auth middleware)
app.use('/api/demo', createDemoRouter(io));

// Auth middleware — protects all subsequent /api/* routes
app.use('/api', requireAuth, extractUser);

// Auth routes
app.use('/api/auth', createAuthRouter());

// Protected routes
app.use('/api/patients', createPatientsRouter());
app.use('/api/alerts', createAlertsRouter());
app.use('/api/vitals', createVitalsRouter(io));
app.use('/api/risk', createRiskRouter());
app.use('/api/chat', createChatRouter());

// Serve client build in production
const clientDist = join(__dirname, '..', 'client', 'dist');
if (isProduction && existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback — serve index.html for any non-API route
  app.get('*', (req, res) => {
    res.sendFile(join(clientDist, 'index.html'));
  });
}

// Socket.io
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
