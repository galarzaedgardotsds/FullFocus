const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ── Listar materias del usuario (con conteo de actividades) ──
router.get('/', (req, res) => {
  try {
    const subjects = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM activities a WHERE a.subject_id = s.id) as activity_count,
        (SELECT COUNT(*) FROM activities a WHERE a.subject_id = s.id AND a.completed = 1) as completed_count
      FROM subjects s
      WHERE s.user_id = ?
      ORDER BY s.name ASC
    `).all(req.userId);

    res.json(subjects);
  } catch (err) {
    console.error('List subjects error:', err);
    res.status(500).json({ error: 'Error al obtener materias' });
  }
});

// ── Crear materia ─────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { name, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    const validColors = ['blue', 'terracotta', 'amber', 'purple', 'green', 'red', 'pink', 'teal'];
    const finalColor = validColors.includes(color) ? color : 'blue';

    const result = db.prepare('INSERT INTO subjects (user_id, name, color) VALUES (?, ?, ?)').run(req.userId, name, finalColor);

    const subject = db.prepare('SELECT * FROM subjects WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ ...subject, activity_count: 0, completed_count: 0 });
  } catch (err) {
    console.error('Create subject error:', err);
    res.status(500).json({ error: 'Error al crear materia' });
  }
});

// ── Actualizar materia ────────────────────────────────────
router.put('/:id', (req, res) => {
  try {
    const { name, color } = req.body;
    const subject = db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);

    if (!subject) return res.status(404).json({ error: 'Materia no encontrada' });

    db.prepare('UPDATE subjects SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?')
      .run(name || null, color || null, req.params.id);

    const updated = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM activities a WHERE a.subject_id = s.id) as activity_count,
        (SELECT COUNT(*) FROM activities a WHERE a.subject_id = s.id AND a.completed = 1) as completed_count
      FROM subjects s WHERE s.id = ?
    `).get(req.params.id);

    res.json(updated);
  } catch (err) {
    console.error('Update subject error:', err);
    res.status(500).json({ error: 'Error al actualizar materia' });
  }
});

// ── Eliminar materia ──────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const subject = db.prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!subject) return res.status(404).json({ error: 'Materia no encontrada' });

    db.prepare('DELETE FROM subjects WHERE id = ?').run(req.params.id);
    res.json({ message: 'Materia eliminada' });
  } catch (err) {
    console.error('Delete subject error:', err);
    res.status(500).json({ error: 'Error al eliminar materia' });
  }
});

module.exports = router;
