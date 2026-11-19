const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ── Estadísticas del dashboard ────────────────────────────
router.get('/', (req, res) => {
  try {
    const today = req.query.date || new Date().toISOString().split('T')[0];
    const realToday = new Date().toISOString().split('T')[0];

    // Activities for selected date
    const todayTotal = db.prepare(
      'SELECT COUNT(*) as c FROM activities WHERE user_id = ? AND scheduled_date = ?'
    ).get(req.userId, today).c;

    const todayCompleted = db.prepare(
      'SELECT COUNT(*) as c FROM activities WHERE user_id = ? AND scheduled_date = ? AND completed = 1'
    ).get(req.userId, today).c;

    const todayPending = todayTotal - todayCompleted;

    // Upcoming exams count (from real today onwards)
    const upcomingExams = db.prepare(
      'SELECT COUNT(*) as c FROM exams WHERE user_id = ? AND exam_date >= ?'
    ).get(req.userId, realToday).c;

    // Total subjects
    const totalSubjects = db.prepare(
      'SELECT COUNT(*) as c FROM subjects WHERE user_id = ?'
    ).get(req.userId).c;

    // Subjects with all activities completed today
    const subjectsStudied = db.prepare(`
      SELECT COUNT(DISTINCT a.subject_id) as c
      FROM activities a
      WHERE a.user_id = ? AND a.scheduled_date = ? AND a.completed = 1 AND a.subject_id IS NOT NULL
    `).get(req.userId, today).c;

    // Streak calculation
    const streak = calculateStreak(req.userId);

    // This cycle (current month)
    const monthStart = today.substring(0, 7) + '-01';
    const cycleActivities = db.prepare(
      'SELECT COUNT(*) as c FROM activities WHERE user_id = ? AND scheduled_date >= ?'
    ).get(req.userId, monthStart).c;

    const cycleExams = db.prepare(
      'SELECT COUNT(*) as c FROM exams WHERE user_id = ? AND exam_date >= ? AND exam_date < ?'
    ).get(req.userId, monthStart, nextMonth(monthStart)).c;

    // Active subjects progress
    const subjectsProgress = db.prepare(`
      SELECT s.id, s.name, s.color,
        (SELECT COUNT(*) FROM activities a WHERE a.subject_id = s.id) as total,
        (SELECT COUNT(*) FROM activities a WHERE a.subject_id = s.id AND a.completed = 1) as completed
      FROM subjects s
      WHERE s.user_id = ? AND (SELECT COUNT(*) FROM activities a WHERE a.subject_id = s.id) > 0
      ORDER BY s.name ASC
    `).all(req.userId);

    // Focus: today's progress percentage
    const focusPercent = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

    res.json({
      today: {
        total: todayTotal,
        completed: todayCompleted,
        pending: todayPending
      },
      subjectsStudied,
      totalSubjects,
      upcomingExams,
      streak,
      cycle: {
        activities: cycleActivities,
        exams: cycleExams
      },
      subjectsProgress,
      focusPercent
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

function calculateStreak(userId) {
  const dates = db.prepare(`
    SELECT DISTINCT date(completed_at) as d
    FROM activities
    WHERE user_id = ? AND completed = 1 AND completed_at IS NOT NULL
    ORDER BY d DESC
  `).all(userId).map(r => r.d);

  if (dates.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = fmt(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = fmt(yesterday);

  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) return 0;

  let streak = 0;
  let check = new Date(dates[0]);

  for (const d of dates) {
    if (d === fmt(check)) {
      streak++;
      check.setDate(check.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function fmt(d) {
  return d.toISOString().split('T')[0];
}

function nextMonth(monthStart) {
  const d = new Date(monthStart);
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
}

module.exports = router;
