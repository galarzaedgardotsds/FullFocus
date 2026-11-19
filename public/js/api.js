// ── API / Storage Bridge ──────────────────────────────────
// Funciona 100% en cliente con Storage garantizando que nunca se pierdan datos
const API = {
  async get(path) {
    if (path === '/auth/me') return { id: 1, name: 'Estudiante' };
    if (path.startsWith('/subjects')) return Storage.getSubjects();
    if (path.startsWith('/exams')) return Storage.getExams();
    if (path.startsWith('/stats')) {
      const match = path.match(/date=([^&]+)/);
      return Storage.getStats(match ? match[1] : null);
    }
    if (path.startsWith('/activities')) {
      const url = new URL('http://local' + path);
      return Storage.getActivities({
        date: url.searchParams.get('date'),
        subject_id: url.searchParams.get('subject_id'),
        search: url.searchParams.get('search'),
        status: url.searchParams.get('status')
      });
    }
    return [];
  },

  async post(path, body) {
    if (path === '/subjects') return Storage.createSubject(body.name, body.color);
    if (path === '/activities') return Storage.createActivity(body);
    if (path === '/exams') return Storage.createExam(body);
    return {};
  },

  async patch(path) {
    const match = path.match(/\/activities\/([^/]+)\/toggle/);
    if (match) return Storage.toggleActivity(match[1]);
    return {};
  },

  async delete(path) {
    const matchAct = path.match(/\/activities\/([^/]+)/);
    if (matchAct) return Storage.deleteActivity(matchAct[1]);
    const matchExam = path.match(/\/exams\/([^/]+)/);
    if (matchExam) return Storage.deleteExam(matchExam[1]);
    return {};
  }
};
