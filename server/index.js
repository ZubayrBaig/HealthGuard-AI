import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
}));
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

// Routes
app.use('/api/patients', createPatientsRouter());
app.use('/api/alerts', createAlertsRouter());
app.use('/api/vitals', createVitalsRouter(io));
app.use('/api/risk', createRiskRouter());
app.use('/api/demo', createDemoRouter(io));
app.use('/api/chat', createChatRouter());

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
