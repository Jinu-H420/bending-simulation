// ヤゲンの断面の絵（2026-10-13 ユーザー「80306 とかの番号では、どのヤゲンかイメージが沸かない」）。
//   PUNCH_LIB の断面（刃先＝(0,0)、上＝マイナス）をそのまま描く。反転は左右を入れ替える。
//   普通のヤゲン 904061 を左に同じ縮尺で並べて、形と高さの違いが分かるようにする（刃先の高さをそろえる）。
import { PUNCH_LIB } from '../bending-simulator.jsx';

const BASE = '904061';

function Shape({ pts, minY, h, color, fill }) {
  const minX = Math.min(...pts.map((q) => q[0])), maxX = Math.max(...pts.map((q) => q[0]));
  const pad = 2;
  const w = Math.max(18, Math.round(h * (maxX - minX + 2 * pad) / (-minY + 2 * pad)));
  const d = `M${pts.map((q) => q.join(',')).join(' L')} Z`;
  return (
    <svg width={w} height={h} viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${-minY + 2 * pad}`}>
      <path d={d} fill={fill} stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function PunchIcon({ id, flip = false, h = 150, compare = true }) {
  const p = PUNCH_LIB[id];
  if (!p || !p.pts) return null;
  const mine = p.pts.map(([x, y]) => [flip ? -x : x, y]);
  const base = compare && id !== BASE && PUNCH_LIB[BASE] ? PUNCH_LIB[BASE].pts : null;
  const minY = Math.min(...[...mine, ...(base || [])].map((q) => q[1]));   // 2本を同じ縮尺に
  const height = (pts) => Math.round(-Math.min(...pts.map((q) => q[1])));
  return (
    <span className="punch-icon">
      {base && (
        <span className="punch-one">
          <Shape pts={base} minY={minY} h={h} color="#8a94a3" fill="rgba(138,148,163,.15)" />
          <span className="punch-cap">普通 {BASE}<br />全高{height(base)}</span>
        </span>
      )}
      <span className="punch-one">
        <Shape pts={mine} minY={minY} h={h} color="#2a78d6" fill="rgba(42,120,214,.25)" />
        <span className="punch-cap"><b>{id}{flip ? '（反転）' : ''}</b><br />全高{height(mine)}</span>
      </span>
    </span>
  );
}
