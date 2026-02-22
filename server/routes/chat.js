import { Router } from 'express';
import db from '../db/database.js';
import {
  sendMessage,
  saveMessage,
  getHistory,
  clearHistory,
} from '../services/chatService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _getPatientStmt = null;
function getPatientStmt() {
  if (!_getPatientStmt) {
    _getPatientStmt = db.prepare('SELECT id FROM patients WHERE id = ?');
  }
  return _getPatientStmt;
}

function validatePatient(patientId, res) {
  const patient = getPatientStmt().get(patientId);
  if (!patient) {
    res.status(404).json({ error: 'Patient not found' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default function createChatRouter() {
  const router = Router();

  // POST /:patientId — send message, receive SSE stream
  router.post('/:patientId', async (req, res) => {
    const { patientId } = req.params;
    if (!validatePatient(patientId, res)) return;

    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });

    try {
      const result = await sendMessage(patientId, message.trim());

      if (result.stream) {
        // Streaming response
        let fullContent = '';

        for await (const chunk of result.stream) {
          if (aborted) break;

          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: delta })}\n\n`);
          }
        }

        if (!aborted) {
          // Save assistant message to DB
          saveMessage(patientId, 'assistant', fullContent);
          res.write(`data: ${JSON.stringify({ type: 'done', content: fullContent })}\n\n`);
        }
      } else {
        // Non-streaming fallback
        const content = result.content;
        saveMessage(patientId, 'assistant', content);
        res.write(`data: ${JSON.stringify({ type: 'done', content })}\n\n`);
      }
    } catch (err) {
      const fallback = 'I apologize, but I encountered an error. Please try again.';
      saveMessage(patientId, 'assistant', fallback);
      res.write(`data: ${JSON.stringify({ type: 'done', content: fallback })}\n\n`);
    }

    if (!aborted) res.end();
  });

  // GET /:patientId/history — paginated conversation history
  router.get('/:patientId/history', (req, res) => {
    const { patientId } = req.params;
    if (!validatePatient(patientId, res)) return;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit) || 50), 100);

    const result = getHistory(patientId, page, limit);
    res.json(result);
  });

  // DELETE /:patientId/history — clear chat history
  router.delete('/:patientId/history', (req, res) => {
    const { patientId } = req.params;
    if (!validatePatient(patientId, res)) return;

    clearHistory(patientId);
    res.json({ message: 'Chat history cleared' });
  });

  return router;
}
