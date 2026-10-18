import { useState } from 'react';
import { useRoute } from './lib/router';
import { isMuted, setMuted } from './lib/sound';
import LearnHome from './screens/LearnHome';
import Lessons from './screens/Lessons';
import CoursePage from './screens/CoursePage';
import LessonPlayer from './screens/LessonPlayer';
import Puzzles from './screens/Puzzles';
import PuzzleRush from './screens/PuzzleRush';
import Themes from './screens/Themes';
import Vision from './screens/Vision';
import Analysis from './screens/Analysis';
import Practice from './screens/Practice';

type NavItem = { path: string; label: string; icon: string; sub: [string, string][] };

const NAV: NavItem[] = [
  { path: 'puzzles', label: 'Puzzles', icon: '🧩', sub: [['puzzles', 'Puzzles'], ['puzzles/rush', 'Puzzle Rush'], ['puzzles/themes', 'Themes']] },
  { path: 'learn', label: 'Learn', icon: '🎓', sub: [['learn/lessons', 'Lessons'], ['learn/practice', 'Practice'], ['learn/vision', 'Vision'], ['learn/analysis', 'Analysis']] },
];

function Screen({ r }: { r: string[] }) {
  if (r[0] === 'puzzles') {
    if (r[1] === 'rush') return <PuzzleRush />;
    if (r[1] === 'themes') return <Themes theme={r[2]} />;
    return <Puzzles />;
  }
  if (r[0] === 'learn') {
    if (r[1] === 'lessons') {
      if (r[2] && r[3]) return <LessonPlayer courseId={r[2]} lessonId={r[3]} />;
      if (r[2]) return <CoursePage courseId={r[2]} />;
      return <Lessons />;
    }
    if (r[1] === 'vision') return <Vision />;
    if (r[1] === 'analysis') return <Analysis fen={r[2] ? decodeURIComponent(r[2]) : undefined} />;
    if (r[1] === 'practice') return <Practice drill={r[2]} />;
  }
  return <LearnHome />;
}

export default function App() {
  const r = useRoute();
  const path = r.join('/');
  const [muted, setM] = useState(isMuted());
  const isActive = (p: string) => path === p || (p !== 'puzzles' && p !== 'learn' && path.startsWith(p + '/'));

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#/learn">
          <span className="brand-mark"><img src="pieces/wN.svg" alt="" /></span>
          Chess<span style={{ color: 'var(--green-hi)' }}>Learn</span>
        </a>
        {NAV.map((n) => (
          <div key={n.path}>
            <a className={`nav-item ${r[0] === n.path ? 'active' : ''}`} href={`#/${n.sub[0][0]}`}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </a>
            {r[0] === n.path && (
              <div className="nav-sub">
                {n.sub.map(([p, label]) => (
                  <a key={p} href={`#/${p}`} className={isActive(p) ? 'active' : ''}>{label}</a>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="sidebar-foot">
          <button className="small-btn" onClick={() => { setMuted(!muted); setM(!muted); }}>{muted ? '🔇 Sound off' : '🔊 Sound on'}</button>
        </div>
      </aside>
      <main className="main">
        <nav className="topbar-mobile">
          <a href="#/learn" className={path === 'learn' ? 'active' : ''}>♞ Home</a>
          {NAV.flatMap((n) => n.sub).map(([p, label]) => (
            <a key={p} href={`#/${p}`} className={isActive(p) ? 'active' : ''}>{label}</a>
          ))}
        </nav>
        <Screen r={r} />
      </main>
    </div>
  );
}
