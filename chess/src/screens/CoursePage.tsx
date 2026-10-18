import { findCourse } from '../data/lessons';
import { progress } from '../lib/progress';
import { go } from '../lib/router';

export default function CoursePage({ courseId }: { courseId: string }) {
  const course = findCourse(courseId);
  if (!course) return <div className="page"><p>Course not found. <a href="#/learn/lessons">Back to lessons</a></p></div>;
  const done = progress.lessonsDone();
  const n = course.lessons.filter((l) => done[`${course.id}/${l.id}`]).length;
  const next = course.lessons.find((l) => !done[`${course.id}/${l.id}`]) ?? course.lessons[0];

  return (
    <div className="page fade-in">
      <a href="#/learn/lessons" className="muted" style={{ fontWeight: 700, display: 'inline-block', marginBottom: 14 }}>← All lessons</a>
      <div className="course-head">
        <div className="course-art" style={{ background: course.color }}>{course.icon}</div>
        <div style={{ flex: 1 }}>
          <div className="level-badge" style={{ color: course.color, filter: 'brightness(1.6)' }}>{course.level} · {course.category}</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: '4px 0 6px' }}>{course.title}</h1>
          <p className="muted" style={{ margin: '0 0 14px', lineHeight: 1.5 }}>{course.description}</p>
          <div className="row" style={{ gap: 14 }}>
            <button className="btn sm" onClick={() => go(`learn/lessons/${course.id}/${next.id}`)}>{n === 0 ? 'Start course' : n === course.lessons.length ? 'Review' : 'Continue'}</button>
            <div className="progress" style={{ width: 160 }}><div style={{ width: `${(n / course.lessons.length) * 100}%` }} /></div>
            <span className="muted">{n}/{course.lessons.length} complete</span>
          </div>
        </div>
      </div>
      <div className="lesson-list">
        {course.lessons.map((l, i) => {
          const isDone = !!done[`${course.id}/${l.id}`];
          const challenges = l.steps.filter((s) => s.type !== 'info').length;
          return (
            <a key={l.id} className="lesson-row" href={`#/learn/lessons/${course.id}/${l.id}`}>
              <div className={`lesson-num ${isDone ? 'done' : ''}`}>{isDone ? '✓' : i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{l.title}</div>
                <div className="muted" style={{ fontSize: 14 }}>{l.summary}</div>
              </div>
              <span className="tag">{challenges} {challenges === 1 ? 'challenge' : 'challenges'}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
