// C形曲げ かんたん判定（c.html）の入口。
// 中身は かんたん判定（check.jsx）と同じ画面・同じ計算で、形を C形（リップ内向き）だけにしたもの。
// あとで かんたん判定にまとめるときは、check.jsx の CHECK_SHAPES に 'C' を足せばよい。
import React from 'react';
import ReactDOM from 'react-dom/client';
import { CheckApp, Boundary } from './check.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <Boundary>
    <CheckApp shapes={['C']} title="C形曲げ かんたん判定"
      lead="C形（リップ内向き）の寸法を入れて「判定する」を押すだけ。曲げ順と突き当ての向きは自動で探します。" />
  </Boundary>,
);
