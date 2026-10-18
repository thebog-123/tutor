import { useEffect, useRef, useState } from 'react';
import Board from '../components/Board';
import { progress } from '../lib/progress';
import { playSound } from '../lib/sound';

const FILES = 'abcdefgh';
const randomSquare = () => FILES[Math.floor(Math.random() * 8)] + (1 + Math.floor(Math.random() * 8));
const DURATION = 30_000;

export default function Vision() {
  const [color, setColor] = useState<'w' | 'b'>('w');
  const [coords, setCoords] = useState(false);
  const [phase, setPhase] = useState<'menu' | 'playing' | 'over'>('menu');
  const [target, setTarget] = useState(randomSquare());
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(DURATION);
  const [flash, setFlash] = useState<Record<string, string>>({});
  const deadline = useRef(0);

  useEffect(() => {
    if (phase !== 'playing') return;
    const t = setInterval(() => {
      const l = Math.max(0, deadline.current - Date.now());
      setLeft(l);
      if (l <= 0) {
        clearInterval(t);
        setPhase('over');
        setScore((s) => { progress.setVisionBest(color, s); return s; });
        playSound('success');
      }
    }, 100);
    return () => clearInterval(t);
  }, [phase, color]);

  const start = () => {
    setScore(0);
    setTarget(randomSquare());
    setLeft(DURATION);
    deadline.current = Date.now() + DURATION;
    setPhase('playing');
    playSound('start');
  };

  const click = (sq: string) => {
    if (phase !== 'playing') return;
    if (sq === target) {
      setScore((s) => s + 1);
      setFlash({ [sq]: 'rgba(129,182,76,.85)' });
      let n = randomSquare();
      while (n === target) n = randomSquare();
      setTarget(n);
      playSound('move');
    } else {
      setFlash({ [sq]: 'rgba(250,65,45,.8)' });
      playSound('wrong');
    }
    setTimeout(() => setFlash({}), 250);
  };

  return (
    <div className="play">
      <div className="play-board" style={{ position: 'relative' }}>
        <Board fen="8/8/8/8/8/8/8/8 w - - 0 1" orientation={color} coordinates={coords || phase !== 'playing'} onSquareClick={click} highlights={flash} sound={false} />
        {phase === 'playing' && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', zIndex: 40 }}>
            <div key={target} className="fade-in" style={{ fontSize: 'min(22vmin, 150px)', fontWeight: 900, color: 'rgba(255,255,255,.9)', textShadow: '0 4px 18px rgba(0,0,0,.5)' }}>{target}</div>
          </div>
        )}
      </div>
      <div className="side">
        <div className="side-head"><span style={{ fontSize: 22 }}>👁</span> Vision</div>
        <div className="side-body">
          {phase === 'menu' && <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>A square name appears on the board. Click it as fast as you can. You have 30 seconds.</p>}
          {phase !== 'menu' && (
            <div style={{ textAlign: 'center' }}>
              <div className="timer" style={{ display: 'inline-block', marginBottom: 10 }}>{(left / 1000).toFixed(1)}</div>
              <div className="rush-score">{score}</div>
              {phase === 'over' && <p className="muted">Best as {color === 'w' ? 'White' : 'Black'}: {progress.visionBest(color)}</p>}
            </div>
          )}
          <div>
            <div className="muted" style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>PLAY AS</div>
            <div className="mode-pick" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className={color === 'w' ? 'on' : ''} onClick={() => setColor('w')} disabled={phase === 'playing'}><img src="pieces/wK.svg" width={34} alt="" />White<small>Best {progress.visionBest('w')}</small></button>
              <button className={color === 'b' ? 'on' : ''} onClick={() => setColor('b')} disabled={phase === 'playing'}><img src="pieces/bK.svg" width={34} alt="" />Black<small>Best {progress.visionBest('b')}</small></button>
            </div>
          </div>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={coords} onChange={(e) => setCoords(e.target.checked)} /> Show coordinates while playing
          </label>
        </div>
        <div className="side-foot">
          {phase === 'playing' ? <button className="btn grey block sm" onClick={() => setPhase('over')}>Stop</button> : <button className="btn block" onClick={start}>{phase === 'over' ? 'Play again' : 'Start Training'}</button>}
        </div>
      </div>
    </div>
  );
}
