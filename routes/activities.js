const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ── Listar actividades (con filtros) ──────────────────────
router.get('/', (req, res) => {
  try {
    const { date, subject_id, status, search } = req.query;

    let sql = `
      SELECT a.*, s.name as subject_name, s.color as subject_color
      FROM activities a
      LEFT JOIN subjects s ON a.subject_id = s.id
      WHERE a.user_id = ?
    `;
    const params = [req.userId];

    if (date) {
      sql += ' AND a.scheduled_date = ?';
      params.push(date);
    }

    if (subject_id) {
      sql += ' AND a.subject_id = ?';
      params.push(subject_id);
    }

    if (status === 'completed') {
      sql += ' AND a.completed = 1';
    } else if (status === 'pending') {
      sql += ' AND a.completed = 0';
    }

    if (search) {
      sql += ' AND (a.title LIKE ? OR a.description LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term);
    }

    sql += ' ORDER BY a.completed ASC, a.scheduled_time ASC, a.created_at DESC';

    const activities = db.prepare(sql).all(...params);
    res.json(activities);
  } catch (err) {
    console.error('List activities error:', err);
    res.status(500).json({ error: 'Error al obtener actividades' });
  }
});

// ── Crear actividad ───────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { title, subject_id, description, priority, scheduled_date, scheduled_time } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'El título es obligatorio' });
    }

    // Verify subject belongs to user if provided
    if (subject_id) {
      const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, req.userId);
      if (!subject) return res.status(400).json({ error: 'Materia no encontrada' });
    }

    const finalDate = scheduled_date || new Date().toISOString().split('T')[0];
    const validPriorities = ['alta', 'media', 'baja'];
    const finalPriority = validPriorities.includes(priority) ? priority : 'media';

    const result = db.prepare(`
      INSERT INTO activities (user_id, subject_id, title, description, priority, scheduled_date, scheduled_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.userId, subject_id || null, title, description || '', finalPriority, finalDate, scheduled_time || null);

    const activity = db.prepare(`
      SELECT a.*, s.name as subject_name, s.color as subject_color
      FROM activities a
      LEFT JOIN subjects s ON a.subject_id = s.id
      WHERE a.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(activity);
  } catch (err) {
    console.error('Create activity error:', err);
    res.status(500).json({ error: 'Error al crear actividad' });
  }
});

// ── Actualizar actividad ──────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const activity = db.prepare('SELECT * FROM activities WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!activity) return res.status(404).json({ error: 'Actividad no encontrada' });

    const { title, subject_id, description, priority, scheduled_date, scheduled_time } = req.body;

    db.prepare(`
      UPDATE activities SET
        title = COALESCE(?, title),
        subject_id = COALESCE(?, subject_id),
        description = COALESCE(?, description),
        priority = COALESCE(?, priority),
        scheduled_date = COALESCE(?, scheduled_date),
        scheduled_time = COALESCE(?, scheduled_time)
      WHERE id = ?
    `).run(title || null, subject_id !== undefined ? subject_id : null, description !== undefined ? description : null,
           priority || null, scheduled_date || null, scheduled_time || null, req.params.id);

    const updated = db.prepare(`
      SELECT a.*, s.name as subject_name, s.color as subject_color
      FROM activities a LEFT JOIN subjects s ON a.subject_id = s.id
      WHERE a.id = ?
    `).get(req.params.id);

    res.json(updated);
  } catch (err) {
    console.error('Update activity error:', err);
    res.status(500).json({ error: 'Error al actualizar actividad' });
  }
});

// ── Marcar/desmarcar completada ───────────────────────────
router.patch('/:id/toggle', (req, res) => {
  try {
    const activity = db.prepare('SELECT * FROM activities WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!activity) return res.status(404).json({ error: 'Actividad no encontrada' });

    const newCompleted = activity.completed ? 0 : 1;
    const completedAt = newCompleted ? new Date().toISOString() : null;

    db.prepare('UPDATE activities SET completed = ?, completed_at = ? WHERE id = ?')
      .run(newCompleted, completedAt, req.params.id);

    const updated = db.prepare(`
      SELECT a.*, s.name as subject_name, s.color as subject_color
      FROM activities a LEFT JOIN subjects s ON a.subject_id = s.id
      WHERE a.id = ?
    `).get(req.params.id);

    res.json(updated);
  } catch (err) {
    console.error('Toggle activity error:', err);
    res.status(500).json({ error: 'Error al actualizar actividad' });
  }
});

// ── Eliminar actividad ────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const activity = db.prepare('SELECT * FROM activities WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!activity) return res.status(404).json({ error: 'Actividad no encontrada' });

    db.prepare('DELETE FROM activities WHERE id = ?').run(req.params.id);
    res.json({ message: 'Actividad eliminada' });
  } catch (err) {
    console.error('Delete activity error:', err);
    res.status(500).json({ error: 'Error al eliminar actividad' });
  }
});

module.exports = router;
