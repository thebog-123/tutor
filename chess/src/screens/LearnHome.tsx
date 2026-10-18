import { allLessons, courses } from '../data/lessons';
import { progress } from '../lib/progress';
import { go } from '../lib/router';

const CARDS = [
  { path: 'learn/lessons', title: 'Lessons', icon: '🎓', bg: '#3d5a2a', text: 'Step-by-step interactive lessons, from how the pieces move to winning combinations.' },
  { path: 'puzzles', title: 'Puzzles', icon: '🧩', bg: '#2d4a63', text: 'Rated tactics puzzles that adapt to your level. Find the best move!' },
  { path: 'puzzles/rush', title: 'Puzzle Rush', icon: '⚡', bg: '#6b3a26', text: 'Solve as many puzzles as you can against the clock. Three strikes and you\'re out.' },
  { path: 'learn/practice', title: 'Practice', icon: '🎯', bg: '#4a3a66', text: 'Play key positions out against the computer until you can win them every time.' },
  { path: 'learn/vision', title: 'Vision', icon: '👁', bg: '#2f5f5c', text: 'Train your board vision: click the named square as fast as you can.' },
  { path: 'learn/analysis', title: 'Analysis', icon: '🔍', bg: '#4d4a46', text: 'Set up any position and let the engine show you the best moves.' },
  { path: 'puzzles/themes', title: 'Puzzle Themes', icon: '🏷', bg: '#5c4d22', text: 'Practise one tactic at a time: forks, sacrifices, mates in two and more.' },
];

export default function LearnHome() {
  const done = progress.lessonsDone();
  const doneCount = allLessons.filter(({ course, lesson }) => done[`${course.id}/${lesson.id}`]).length;
  const next = allLessons.find(({ course, lesson }) => !done[`${course.id}/${lesson.id}`]);
  const rating = progress.rating();
  const history = progress.history();
  const solved = history.filter((h) => h.won).length;

  return (
    <div className="page fade-in">
      <div className="hero">
        <div style={{ fontSize: 90, lineHeight: 1 }}>♞</div>
        <div>
          <h2>Learn chess the fun way</h2>
          <p>Lessons, puzzles and drills, all in one place. Pick up where you left off or try something new.</p>
          {next ? (
            <button className="btn" onClick={() => go(`learn/lessons/${next.course.id}/${next.lesson.id}`)}>
              {doneCount ? 'Continue' : 'Start'}: {next.lesson.title}
            </button>
          ) : (
            <button className="btn" onClick={() => go('puzzles')}>Solve puzzles</button>
          )}
        </div>
      </div>

      <div className="stats-row">
        <div className="stat"><b>{rating.rating}</b><span>Puzzle rating</span></div>
        <div className="stat"><b>{solved}</b><span>Puzzles solved</span></div>
        <div className="stat"><b>{doneCount}/{allLessons.length}</b><span>Lessons complete</span></div>
        <div className="stat"><b>{Math.max(progress.rushBest('3'), progress.rushBest('5'), progress.rushBest('survival'))}</b><span>Best Puzzle Rush</span></div>
      </div>

      <div className="grid-cards">
        {CARDS.map((c) => (
          <a key={c.path} className="card" href={`#/${c.path}`}>
            <div className="card-art" style={{ background: c.bg }}>{c.icon}</div>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
          </a>
        ))}
      </div>

      <div className="section-title">Courses</div>
      <div className="grid-cards">
        {courses.slice(0, 4).map((c) => {
          const n = c.lessons.filter((l) => done[`${c.id}/${l.id}`]).length;
          return (
            <a key={c.id} className="card" href={`#/learn/lessons/${c.id}`}>
              <div className="row spread"><span className="level-badge" style={{ color: c.color }}>{c.level}</span><span className="muted">{n}/{c.lessons.length}</span></div>
              <h3>{c.title}</h3>
              <div className="progress"><div style={{ width: `${(n / c.lessons.length) * 100}%` }} /></div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
