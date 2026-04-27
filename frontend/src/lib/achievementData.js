/**
 * Generates a comprehensive list of 100+ achievements and badges 
 * based on user statistics.
 */
export const generateAchievements = (stats, user, contestHistory, topicStats) => {
  const easy = Number(stats?.easy) || 0;
  const medium = Number(stats?.medium) || 0;
  const hard = Number(stats?.hard) || 0;
  const total = easy + medium + hard;
  const streak = Number(user?.streak) || 0;
  const loginDays = Number(user?.loginDays) || 0;
  const joinedContests = Array.isArray(contestHistory) ? contestHistory.length : 0;
  const podiums = Array.isArray(contestHistory) ? contestHistory.filter(c => c.participation?.rank <= 3).length : 0;
  const wins = Array.isArray(contestHistory) ? contestHistory.filter(c => c.participation?.rank === 1).length : 0;

  const achievements = [];

  // 1. STREAK ACHIEVEMENTS (10)
  const streakMilestones = [3, 7, 14, 30, 45, 60, 90, 100, 180, 365];
  streakMilestones.forEach(m => {
    achievements.push({
      id: `streak-${m}`,
      type: 'streak',
      icon: m >= 100 ? '💎' : m >= 30 ? '🔥' : '✨',
      title: `${m}-Day Streak`,
      desc: `Maintained consistency for ${m} consecutive days.`,
      target: m,
      current: Math.min(streak, m)
    });
  });

  // 2. EASY ACHIEVEMENTS (10)
  const easyMilestones = [1, 5, 10, 25, 50, 75, 100, 150, 200, 500];
  easyMilestones.forEach(m => {
    achievements.push({
      id: `easy-${m}`,
      type: 'easy',
      icon: '🟢',
      title: `Easy ${m === 1 ? 'Start' : m}`,
      desc: `Solved ${m} easy level problems.`,
      target: m,
      current: Math.min(easy, m)
    });
  });

  // 3. MEDIUM ACHIEVEMENTS (10)
  const mediumMilestones = [1, 5, 10, 25, 50, 75, 100, 150, 200, 300];
  mediumMilestones.forEach(m => {
    achievements.push({
      id: `medium-${m}`,
      type: 'medium',
      icon: '🟡',
      title: `Medium ${m === 1 ? 'Specialist' : m}`,
      desc: `Solved ${m} medium level problems.`,
      target: m,
      current: Math.min(medium, m)
    });
  });

  // 4. HARD ACHIEVEMENTS (10)
  const hardMilestones = [1, 3, 5, 10, 20, 30, 40, 50, 75, 100];
  hardMilestones.forEach(m => {
    achievements.push({
      id: `hard-${m}`,
      type: 'hard',
      icon: '🔴',
      title: `Hard ${m === 1 ? 'Slayer' : m}`,
      desc: `Solved ${m} hard level problems.`,
      target: m,
      current: Math.min(hard, m)
    });
  });

  // 5. TOTAL ACHIEVEMENTS (10)
  const totalMilestones = [10, 25, 50, 100, 200, 300, 400, 500, 750, 1000];
  totalMilestones.forEach(m => {
    achievements.push({
      id: `total-${m}`,
      type: 'total',
      icon: '🏆',
      title: `${m} Club`,
      desc: `Reached a total of ${m} solved problems.`,
      target: m,
      current: Math.min(total, m)
    });
  });

  // 6. TOPIC ACHIEVEMENTS (30)
  const commonTopics = [
    'Array', 'String', 'Hash Table', 'Dynamic Programming', 'Math', 
    'Sorting', 'Greedy', 'DFS', 'BFS', 'Binary Search'
  ];
  commonTopics.forEach(topic => {
    const solvedForTopic = topicStats?.find(t => t.name === topic)?.count || 0;
    const levels = [
      { name: 'Novice', target: 5, icon: '📜' },
      { name: 'Expert', target: 20, icon: '📜' },
      { name: 'Master', target: 50, icon: '📜' }
    ];
    levels.forEach(l => {
      achievements.push({
        id: `topic-${topic.toLowerCase()}-${l.name.toLowerCase()}`,
        type: 'special',
        icon: l.icon,
        title: `${topic} ${l.name}`,
        desc: `Solved ${l.target} problems in ${topic}.`,
        target: l.target,
        current: Math.min(solvedForTopic, l.target)
      });
    });
  });

  // 7. CONTEST ACHIEVEMENTS (10)
  const contestJoinMilestones = [1, 5, 10, 20, 50];
  contestJoinMilestones.forEach(m => {
    achievements.push({
      id: `contest-join-${m}`,
      type: 'contest',
      icon: '🎟️',
      title: `Contestant ${m}`,
      desc: `Participated in ${m} contests.`,
      target: m,
      current: Math.min(joinedContests, m)
    });
  });
  const winMilestones = [1, 3, 5];
  winMilestones.forEach(m => {
    achievements.push({
      id: `contest-win-${m}`,
      type: 'contest',
      icon: '🥇',
      title: `Victor ${m}`,
      desc: `Won Rank 1 in ${m} contests.`,
      target: m,
      current: Math.min(wins, m)
    });
  });
  const podiumMilestones = [1, 5];
  podiumMilestones.forEach(m => {
    achievements.push({
      id: `contest-podium-${m}`,
      type: 'contest',
      icon: '🎖️',
      title: `Podium Finisher ${m}`,
      desc: `Finished in Top 3 for ${m} contests.`,
      target: m,
      current: Math.min(podiums, m)
    });
  });

  // 8. SPECIAL ACHIEVEMENTS (10)
  const specials = [
    { id: 'polyglot', icon: '🌐', title: 'Polyglot', desc: 'Solved in 5+ languages', target: 5, current: 1 },
    { id: 'early-bird', icon: '🐦', title: 'Early Bird', desc: 'Solved problems before 6 AM', target: 1, current: 0 },
    { id: 'night-owl', icon: '🦉', title: 'Night Owl', desc: 'Solved problems after midnight', target: 1, current: 0 },
    { id: 'weekend-warrior', icon: '🎡', title: 'Weekend Warrior', desc: 'Solved on both Sat & Sun', target: 2, current: 0 },
    { id: 'speed-demon', icon: '⚡', title: 'Speed Demon', desc: 'Solve in under 5 mins', target: 1, current: 0 },
    { id: 'balanced', icon: '⚖️', title: 'Perfectly Balanced', desc: '5 easy, 5 medium, 5 hard', target: 15, current: (Math.min(easy, 5) + Math.min(medium, 5) + Math.min(hard, 5)) },
    { id: 'persistent', icon: '🛠️', title: 'Persistent', desc: '10 failed attempts before solve', target: 1, current: 0 },
    { id: 'clean-code', icon: '💎', title: 'Clean Code', desc: 'Solve without any errors first try', target: 10, current: 0 },
    { id: 'helper', icon: '🤝', title: 'Helper', desc: '10 helpful discussion posts', target: 10, current: 0 },
    { id: 'pro-editor', icon: '⌨️', title: 'Vim Master', desc: 'Used Vim mode for 100 solves', target: 100, current: 0 }
  ];
  specials.forEach(s => {
    achievements.push({ ...s, type: 'special' });
  });

  return achievements;
};
