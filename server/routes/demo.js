import { Router } from 'express';
import db from '../db/database.js';
import { seedDb } from '../db/schema.js';
import {
  startSimulator,
  stopSimulator,
  setScenario,
  getStatus,
} from '../services/vitalSimulator.js';

const VALID_SCENARIOS = ['glucose-spike', 'bp-crisis', 'cardiac-warning', 'normal'];

export default function createDemoRouter(io) {
  const router = Router();

  // POST /api/demo/seed — seed demo data if database is empty
  router.post('/seed', (req, res) => {
    const { count } = db.prepare('SELECT COUNT(*) as count FROM patients').get();
    if (count > 0) {
      return res.status(400).json({ error: 'Database already has patient data' });
    }
    seedDb();
    const patients = db.prepare('SELECT id, name FROM patients').all();
    res.json({ message: 'Demo data created', patients });
  });

  // POST /api/demo/start
  router.post('/start', (req, res) => {
    const result = startSimulator(io);
    if (result.error) return res.status(400).json(result);
    res.json({ message: 'Simulator started', ...result });
  });

  // POST /api/demo/stop
  router.post('/stop', (req, res) => {
    const result = stopSimulator();
    res.json({ message: 'Simulator stopped', ...result });
  });

  // POST /api/demo/scenario/:scenario
  router.post('/scenario/:scenario', (req, res) => {
    const { scenario } = req.params;
    if (!VALID_SCENARIOS.includes(scenario)) {
      return res.status(400).json({
        error: `Invalid scenario. Use one of: ${VALID_SCENARIOS.join(', ')}`,
      });
    }
    const result = setScenario(scenario);
    if (result.error) return res.status(400).json(result);
    res.json(result);
  });

  // GET /api/demo/status
  router.get('/status', (req, res) => {
    res.json(getStatus());
  });

  return router;
}
