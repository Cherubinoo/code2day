const asNumber = (value) => Number(value) || 0;

export function buildStudentGroupPerformanceCharts(students = [], label = 'Students') {
  const rows = Array.isArray(students) ? students : [];
  const totalStudents = rows.length;
  const totalSolved = rows.reduce((sum, student) => sum + asNumber(student.solved_count), 0);
  const streaking = rows.filter((student) => asNumber(student.current_streak) > 0).length;
  const active = rows.filter((student) => student.is_active !== false).length;
  const inactive = Math.max(0, totalStudents - active);
  const maxSolved = Math.max(1, ...rows.map((student) => asNumber(student.solved_count)));
  const averageSolved = totalStudents ? totalSolved / totalStudents : 0;

  const byDate = rows.reduce((acc, student) => {
    if (!student.last_active) return acc;
    const date = new Date(student.last_active);
    if (Number.isNaN(date.getTime())) return acc;
    const key = date.toISOString().slice(0, 10);
    if (!acc[key]) acc[key] = { date: key, programming: 0, aptitude: 0, contest: 0, daily_total: 0, overall_total: 0 };
    const solved = asNumber(student.solved_count);
    acc[key].programming += solved;
    acc[key].daily_total += solved;
    return acc;
  }, {});

  let cumulative = 0;
  const dailySolvedTrend = Object.values(byDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
    .map((row) => {
      cumulative += row.daily_total;
      return { ...row, overall_total: cumulative };
    });

  return {
    scoreHistory: [],
    topicAccuracy: [
      { topic: 'Solved', accuracy: Math.min(100, Math.round((averageSolved / maxSolved) * 100)), total: totalStudents, correct: totalSolved },
      { topic: 'Streaking', accuracy: totalStudents ? Math.round((streaking / totalStudents) * 100) : 0, total: totalStudents, correct: streaking },
      { topic: 'Active', accuracy: totalStudents ? Math.round((active / totalStudents) * 100) : 0, total: totalStudents, correct: active },
    ],
    testsCompleted: 0,
    avgScore: totalStudents ? Math.round(averageSolved * 10) / 10 : 0,
    peakScore: maxSolved,
    solvedCount: totalSolved,
    aptitude: { solved: 0, total: 0, percentage: 0 },
    overallPerformance: [
      { label: 'Programming', value: totalSolved },
      { label: 'Aptitude', value: 0 },
      { label: 'Contest', value: 0 },
    ],
    profileRadar: {
      labels: ['Programming', 'Daily', 'Active', 'Streaking', 'Overall'],
      daily: [
        dailySolvedTrend.at(-1)?.daily_total ? Math.min(100, Math.round((dailySolvedTrend.at(-1).daily_total / Math.max(1, totalSolved)) * 100)) : 0,
        dailySolvedTrend.length ? Math.min(100, Math.round((dailySolvedTrend.length / 30) * 100)) : 0,
        totalStudents ? Math.round((active / totalStudents) * 100) : 0,
        totalStudents ? Math.round((streaking / totalStudents) * 100) : 0,
        totalStudents ? Math.min(100, Math.round((averageSolved / maxSolved) * 100)) : 0,
      ],
      overall: [
        Math.min(100, Math.round((totalSolved / Math.max(1, totalStudents * maxSolved)) * 100)),
        dailySolvedTrend.length ? Math.min(100, Math.round((dailySolvedTrend.length / 30) * 100)) : 0,
        totalStudents ? Math.round((active / totalStudents) * 100) : 0,
        totalStudents ? Math.round((streaking / totalStudents) * 100) : 0,
        totalStudents ? Math.min(100, Math.round((averageSolved / maxSolved) * 100)) : 0,
      ],
    },
    dailySolvedTrend,
    knowledgeDistribution: {
      labels: ['Solved', 'Streaking', 'Active', 'Inactive'],
      programming: [totalSolved, streaking, active, inactive],
      aptitude: [0, 0, 0, 0],
    },
    contestPerformance: [],
    summaryCards: {
      programming_solved: totalSolved,
      aptitude_solved: 0,
      contest_solved: 0,
      active_days: dailySolvedTrend.length,
      label,
    },
  };
}
