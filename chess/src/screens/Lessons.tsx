import { useState } from 'react';
import { courses, type Level, type Category } from '../data/lessons';
import { progress } from '../lib/progress';

const LEVELS: (Level | 'All')[] = ['All', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];
const CATS: (Category | 'All')[] = ['All', 'Basics', 'Openings', 'Tactics', 'Checkmates', 'Endgames', 'Strategy'];

export default function Lessons() {
  const [level, setLevel] = useState<Level | 'All'>('All');
  const [cat, setCat] = useState<Category | 'All'>('All');
  const done = progress.lessonsDone();
  const list = courses.filter((c) => (level === 'All' || c.level === level) && (cat === 'All' || c.category === cat));

  return (
    <div className="page fade-in">
      <div className="page-title"><span className="icon">🎓</span>Lessons</div>
      <div className="filters">
        {LEVELS.map((l) => <button key={l} className={`chip ${level === l ? 'on' : ''}`} onClick={() => setLevel(l)}>{l === 'All' ? 'All levels' : l}</button>)}
      </div>
      <div className="filters">
        {CATS.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c === 'All' ? 'All topics' : c}</button>)}
      </div>
      {LEVELS.slice(1).map((lv) => {
        const group = list.filter((c) => c.level === lv);
        if (!group.length) return null;
        return (
          <div key={lv}>
            <div className="section-title">{lv}</div>
            <div className="grid-cards">
              {group.map((c) => {
                const n = c.lessons.filter((l) => done[`${c.id}/${l.id}`]).length;
                return (
                  <a key={c.id} className="card" href={`#/learn/lessons/${c.id}`}>
                    <div className="card-art" style={{ background: c.color, color: '#fff' }}>{c.icon}</div>
                    <div className="row spread"><span className="tag">{c.category}</span><span className="muted" style={{ fontSize: 13 }}>{c.lessons.length} lessons</span></div>
                    <h3>{c.title}</h3>
                    <p>{c.description}</p>
                    <div className="row" style={{ marginTop: 'auto', gap: 10 }}>
                      <div className="progress" style={{ flex: 1 }}><div style={{ width: `${(n / Math.max(1, c.lessons.length)) * 100}%` }} /></div>
                      <span className="muted" style={{ fontSize: 13 }}>{n === c.lessons.length && n ? '✓ Done' : `${n}/${c.lessons.length}`}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
      {!list.length && <p className="muted">No courses match those filters.</p>}
    </div>
  );
}
