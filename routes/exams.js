const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ── Listar exámenes (próximos primero) ────────────────────
router.get('/', (req, res) => {
  try {
    const { upcoming } = req.query;

    let sql = `
      SELECT e.*, s.name as subject_name, s.color as subject_color
      FROM exams e
      LEFT JOIN subjects s ON e.subject_id = s.id
      WHERE e.user_id = ?
    `;
    const params = [req.userId];

    if (upcoming === 'true') {
      sql += ' AND e.exam_date >= date("now")';
    }

    sql += ' ORDER BY e.exam_date ASC';

    const exams = db.prepare(sql).all(...params);
    res.json(exams);
  } catch (err) {
    console.error('List exams error:', err);
    res.status(500).json({ error: 'Error al obtener exámenes' });
  }
});

// ── Crear examen ──────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const { title, subject_id, exam_date, description } = req.body;

    if (!title || !exam_date) {
      return res.status(400).json({ error: 'Título y fecha son obligatorios' });
    }

    if (subject_id) {
      const subject = db.prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?').get(subject_id, req.userId);
      if (!subject) return res.status(400).json({ error: 'Materia no encontrada' });
    }

    const result = db.prepare(`
      INSERT INTO exams (user_id, subject_id, title, description, exam_date)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.userId, subject_id || null, title, description || '', exam_date);

    const exam = db.prepare(`
      SELECT e.*, s.name as subject_name, s.color as subject_color
      FROM exams e LEFT JOIN subjects s ON e.subject_id = s.id
      WHERE e.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(exam);
  } catch (err) {
    console.error('Create exam error:', err);
    res.status(500).json({ error: 'Error al crear examen' });
  }
});

// ── Eliminar examen ───────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
    if (!exam) return res.status(404).json({ error: 'Examen no encontrado' });

    db.prepare('DELETE FROM exams WHERE id = ?').run(req.params.id);
    res.json({ message: 'Examen eliminado' });
  } catch (err) {
    console.error('Delete exam error:', err);
    res.status(500).json({ error: 'Error al eliminar examen' });
  }
});

module.exports = router;
