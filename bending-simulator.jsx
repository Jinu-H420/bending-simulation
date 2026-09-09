import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

// ============================================================================
// 金型実測データ（bending.dxf のベクタ座標をそのまま採用・寸法照合済み）
//
// ■ ダイ（DXF 色2・下段。V12.pdfのトレースとDXFが完全一致）
//   ・V溝：V12・90°（半幅6.0 / 深さ6.0）、肩フラット各1.5
//   ・V金型ブロック：幅15 × 見え高さ50（ホルダに5mm差込み）
//   ・ホルダ：幅28（深さ50〜95）、側面にクランプ溝（深さ67.5〜72.5、切込3.5）
//   ・以下 幅135（〜185）、幅255（〜235）、幅415（ベース）
//   ・照合済み寸法：V12 / 50・95・185・235 / 60・120・200（V金型側面基準）
//
// ■ ヤゲン（ヤゲン.dxf 色3＝緑・9本。金型IDはDXF記載、ユーザー確認済み）
//   ・00300（先端R6・丸刃）／00402／01002／04502／04702／01003／
//     904061（bending.dxfと同一・照合済み）／10600／71606
//   ・904061の例：刃先86°（両面9）・左面1.5→47°×21.9→垂直100.9・全高150.1
//
// ■ 中間板（bending.dxf 色2・上段＝122.7×78.3・タング9.1）
//   ・全ヤゲン共通。スロット天井を工具頂部に合わせて自動取付、一体で昇降・干渉判定
// ============================================================================

// 座標系：Y下向き正。原点＝V溝肩の上面高さ・V中心。
const DIE_RIGHT_HALF = [
  [0, 6.0],        // V底（90° V12）
  [6.0, 0],        // V肩
  [7.5, 0],        // 肩フラット1.5 → V金型右端
  [7.5, 50],       // V金型側面（見え高さ50）
  [14.0, 50],      // ホルダ上面
  [14.0, 67.5],
  [17.5, 67.5],    // クランプ溝
  [17.5, 72.5],
  [14.0, 72.5],
  [14.0, 95],
  [67.5, 95],      // 幅135ブロック
  [67.5, 185],
  [127.5, 185],    // 幅255ブロック
  [127.5, 235],
  [207.5, 235],    // 幅415ベース
  [207.5, 356.9],  // ベース下端（DXF実測：ダイ全高356.9）
];

// 修正済（経緯まとめ 第9.3章）：もとは index 0 の鏡像を飛ばしていたため、先頭点が
// 中心線上にない輪郭（INSERT_STACK_RIGHT など）は天面が水平にならず斜め線で閉じていた。
// 先頭点も鏡像に含める。先頭点が x=0 の場合は無害な重複頂点（ゼロ長辺）になるだけ。
function mirrorClose(right) {
  const pts = [];
  for (let i = right.length - 1; i >= 0; i--) pts.push([-right[i][0], right[i][1]]);
  for (const p of right) pts.push(p);
  return pts;
}

// ヤゲンライブラリ（金型.dxf 色2上段・全11本。刃先＝(0,0)、上＝負）
// 00300のみヤゲン.dxfのARC（先端R6）を12分割近似で採用。他は金型.dxfどおり全直線。
// 10300＝10400＝旧01003＝default.dxf（断面同一・長さ違いと推定）
const PUNCH_LIB = {
  '00300': { // 全高95.0・全幅27.2
    pts: [[5.24, -3.07], [7.2, -6.47], [7.2, -64.0], [6.2, -65.0], [-7.0, -65.0], [-7.0, -94.0], [-8.0, -95.0], [-19.0, -95.0], [-20.0, -94.0], [-20.0, -30.64], [-7.2, -8.47], [-7.2, -6.47], [-5.24, -3.07], [-4.642, -2.195], [-3.9, -1.438], [-3.037, -0.824], [-2.078, -0.371], [-1.056, -0.093], [-0.0, 0.0], [1.056, -0.093], [2.078, -0.371], [3.037, -0.824], [3.9, -1.438], [4.642, -2.195]],
  },
  '00402': { // 全高97.0・全幅27.0
    pts: [[0.0, -0.0], [6.25, -6.47], [0.63, -17.97], [0.9, -30.75], [7.0, -42.0], [7.0, -67.0], [-7.0, -67.0], [-7.0, -97.0], [-20.0, -97.0], [-20.0, -22.15], [-5.56, -7.19], [-6.25, -6.47]],
  },
  '01002': { // 全高115.0・全幅27.0
    pts: [[0.0, -0.0], [5.56, -5.75], [-0.32, -11.84], [-2.0, -16.01], [-2.0, -68.93], [-0.54, -72.47], [7.0, -80.0], [7.0, -85.0], [-7.0, -85.0], [-7.0, -115.0], [-20.0, -115.0], [-20.0, -80.0], [-13.47, -73.47], [-12.0, -69.93], [-12.0, -13.86], [-4.84, -6.45], [-5.56, -5.75]],
  },
  '04502': { // 全高135.0・全幅56.0
    pts: [[0.0, -0.0], [6.28, -6.5], [-18.17, -48.86], [-20.78, -57.12], [-19.65, -65.7], [-14.99, -73.01], [7.0, -95.0], [7.0, -105.0], [-7.0, -105.0], [-7.0, -135.0], [-20.0, -135.0], [-20.0, -105.0], [-37.0, -105.0], [-49.0, -93.0], [-49.0, -52.14], [-5.53, -7.17], [-6.25, -6.47]],
  },
  '04702': { // 全高150.0・全幅64.4
    pts: [[0.0, -0.0], [6.25, -6.47], [-31.69, -70.34], [-33.7, -77.84], [-31.69, -85.34], [-26.2, -90.83], [7.0, -110.0], [7.0, -120.0], [-7.0, -120.0], [-7.0, -150.0], [-20.0, -150.0], [-20.0, -120.0], [-47.39, -120.0], [-57.39, -110.0], [-57.39, -60.82], [-5.53, -7.17], [-6.25, -6.47]],
  },
  '10300': { // 全高97.0・全幅27.0（10400・旧01003・defaultと同一断面）
    pts: [[0.0, -0.0], [7.0, -26.13], [7.0, -66.0], [6.0, -67.0], [-7.0, -67.0], [-7.0, -96.0], [-8.0, -97.0], [-19.0, -97.0], [-20.0, -96.0], [-20.0, -79.5], [-17.0, -79.5], [-17.0, -71.5], [-18.13, -71.5], [-6.02, -26.34], [-6.99, -26.08]],
  },
  '10400': { // 全高97.0・全幅27.0（10300と同一断面）
    pts: [[0.0, -0.0], [7.0, -26.13], [7.0, -66.0], [6.0, -67.0], [-7.0, -67.0], [-7.0, -96.0], [-8.0, -97.0], [-19.0, -97.0], [-20.0, -96.0], [-20.0, -79.5], [-17.0, -79.5], [-17.0, -71.5], [-18.13, -71.5], [-6.02, -26.34], [-6.99, -26.08]],
  },
  '10600': { // 全高125.0・全幅27.0
    pts: [[0.0, -0.0], [3.0, -3.0], [3.0, -66.0], [7.0, -70.0], [7.0, -95.0], [-7.0, -95.0], [-7.0, -125.0], [-20.0, -125.0], [-20.0, -83.0], [-3.0, -66.0], [-3.0, -3.0]],
  },
  '71606': { // 全高97.0・全幅26.0（金型.dxf版を採用）
    pts: [[0.0, -0.0], [2.83, -2.83], [-2.86, -11.36], [-5.08, -16.78], [-5.05, -22.63], [-3.71, -26.44], [6.0, -45.51], [6.0, -67.0], [-7.0, -67.0], [-7.0, -97.0], [-20.0, -97.0], [-20.0, -20.81], [-2.43, -3.23], [-2.78, -2.88]],
  },
  '80306': { // 全高130.0・全幅27.0
    pts: [[0.0, -0.0], [5.66, -5.66], [-0.32, -11.84], [-1.23, -13.07], [-1.8, -14.49], [-2.0, -16.01], [-2.0, -81.03], [-1.59, -84.14], [-0.39, -87.03], [1.51, -89.52], [7.0, -95.0], [7.0, -100.0], [-7.0, -100.0], [-7.0, -130.0], [-20.0, -130.0], [-20.0, -95.0], [-15.51, -90.52], [-15.52, -90.51], [-13.61, -88.03], [-12.41, -85.14], [-12.0, -82.03], [-12.0, -13.41], [-4.95, -6.36], [-5.66, -5.66]],
  },
  '904061': { // 全高150.1・全幅27.2
    pts: [[0.0, -0.0], [6.147, -6.592], [2.266, -11.737], [-0.169, -17.702], [-1.0, -24.093], [-1.0, -91.093], [-0.065, -97.866], [2.669, -104.132], [7.0, -109.423], [7.0, -120.093], [-7.0, -120.093], [-7.0, -150.093], [-17.386, -150.093], [-20.158, -132.593], [-17.0, -132.593], [-17.0, -124.593], [-20.0, -124.593], [-20.0, -23.646], [-5.04, -7.605], [-6.137, -6.582]],
  },
};

// ダイライブラリ（金型.dxf 実測）。上面＝y0、下向き＝正。grooves=[中心x, 半幅, 深さ]。
const DIE_LIB = {
  '01360': { name: 'V85', kind: 'v', grooves: [[0.0, 42.65, 41.27]],
    pts: [[-30.0, 94.99], [30.0, 94.99], [30.0, 76.98], [32.0, 75.0], [47.5, 75.0], [47.5, 0.0], [42.65, 0.0], [41.4, 0.12], [40.23, 0.5], [39.14, 1.11], [38.23, 1.93], [32.49, 8.17], [32.49, 9.65], [5.89, 38.68], [3.23, 40.61], [0.0, 41.27], [-3.23, 40.61], [-5.89, 38.68], [-32.509, 9.65], [-32.509, 8.17], [-38.23, 1.93], [-39.14, 1.11], [-40.23, 0.5], [-41.4, 0.12], [-42.65, 0.0], [-47.5, 0.0], [-47.5, 75.0], [-32.0, 75.0], [-30.0, 76.98]] },
  '01400': { name: 'V170', kind: 'v', grooves: [[0.0, 85.1, 98.5]],
    pts: [[-60.0, 140.0], [60.0, 140.0], [60.0, 120.0], [87.5, 120.0], [92.5, 115.0], [92.5, 0.0], [85.1, 0.0], [83.2, 0.2], [81.4, 0.7], [79.6, 1.5], [78.1, 2.6], [76.7, 4.0], [66.5, 16.1], [66.5, 19.2], [0.0, 98.5], [-66.5, 19.2], [-66.5, 16.1], [-76.7, 4.0], [-78.1, 2.6], [-79.6, 1.5], [-81.4, 0.7], [-83.2, 0.2], [-85.1, 0.0], [-92.5, 0.0], [-92.5, 115.0], [-87.5, 120.0], [-60.0, 120.0]] },
  '01860': { name: 'V106', kind: 'v', grooves: [[0.0, 53.09, 52.73]],
    pts: [[-30.0, 110.0], [30.0, 110.0], [30.0, 92.0], [32.0, 90.02], [59.99, 90.02], [59.99, 0.0], [53.09, 0.0], [51.64, 0.15], [50.27, 0.61], [49.0, 1.32], [47.9, 2.29], [41.0, 9.83], [41.0, 12.8], [7.37, 49.48], [4.01, 51.89], [0.0, 52.73], [-4.04, 51.89], [-7.37, 49.48], [-41.0, 12.8], [-41.0, 9.83], [-47.93, 2.29], [-49.0, 1.32], [-50.27, 0.61], [-51.64, 0.15], [-53.09, 0.0], [-59.99, 0.0], [-59.99, 90.02], [-32.0, 90.02], [-30.0, 92.0]] },
  '03500': { name: 'V35.5', kind: 'v', grooves: [[0.0, 17.75, 17.5]],
    pts: [[-30.0, 59.99], [30.0, 59.99], [30.0, 0.0], [17.75, 0.0], [16.94, 0.08], [16.149, 0.33], [15.42, 0.74], [14.81, 1.3], [11.99, 4.37], [11.99, 5.84], [2.21, 16.51], [1.19, 17.25], [0.0, 17.5], [-1.22, 17.25], [-2.21, 16.51], [-12.01, 5.84], [-12.01, 4.37], [-14.81, 1.3], [-15.44, 0.74], [-16.149, 0.33], [-16.94, 0.08], [-17.75, 0.0], [-30.0, 0.0]] },
  '03600': { name: 'V43.5', kind: 'v', grooves: [[0.01, 21.76, 21.39]],
    pts: [[-29.995, 60.0], [29.995, 60.0], [29.995, 0.0], [21.765, 0.0], [20.925, 0.08], [20.145, 0.33], [19.435, 0.74], [18.795, 1.3], [16.005, 4.37], [16.005, 5.84], [2.945, 20.1], [1.605, 21.03], [-0.005, 21.39], [-1.625, 21.03], [-2.945, 20.1], [-16.005, 5.84], [-16.005, 4.37], [-18.825, 1.3], [-19.435, 0.74], [-20.145, 0.33], [-20.925, 0.08], [-21.745, 0.0], [-29.995, 0.0]] },
  '03700': { name: 'V53.5', kind: 'v', grooves: [[-0.01, 26.76, 26.36]],
    pts: [[-30.0, 59.99], [30.0, 59.99], [30.0, 0.0], [26.75, 0.0], [25.93, 0.07], [25.15, 0.32], [24.43, 0.73], [23.8, 1.29], [19.99, 5.46], [19.99, 6.93], [3.68, 24.73], [2.009, 25.93], [0.0, 26.36], [-2.009, 25.93], [-3.68, 24.73], [-20.02, 6.93], [-20.02, 5.46], [-23.82, 1.29], [-24.43, 0.73], [-25.15, 0.32], [-25.93, 0.07], [-26.77, 0.0], [-30.0, 0.0]] },
  '03800': { name: 'V67', kind: 'v', grooves: [[0.0, 33.71, 32.97]],
    pts: [[-30.0, 75.0], [30.0, 75.0], [30.0, 55.02], [40.01, 55.02], [40.01, 0.0], [33.71, 0.0], [32.659, 0.1], [31.7, 0.43], [30.79, 0.94], [30.02, 1.63], [26.52, 5.46], [26.52, 6.93], [4.42, 31.04], [2.41, 32.46], [0.0, 32.97], [-2.41, 32.46], [-4.42, 31.04], [-26.49, 6.93], [-26.49, 5.46], [-30.0, 1.63], [-30.79, 0.94], [-31.67, 0.43], [-32.659, 0.1], [-33.71, 0.0], [-40.01, 0.0], [-40.01, 55.02], [-30.0, 55.02]] },
  '03900': { name: 'V133', kind: 'v', grooves: [[-0.0, 66.69, 59.8]],
    pts: [[-45.0, 123.0], [44.99, 123.0], [44.99, 104.99], [47.0, 103.0], [77.0, 103.0], [77.0, 0.0], [66.68, 0.0], [64.76, 0.21], [62.9, 0.85], [61.22, 1.86], [59.8, 3.21], [52.0, 12.5], [52.0, 15.63], [24.52, 48.37], [13.52, 56.8], [0.01, 59.8], [-13.53, 56.8], [-24.53, 48.37], [-52.01, 15.63], [-52.01, 12.5], [-59.81, 3.21], [-61.23, 1.86], [-62.91, 0.85], [-64.759, 0.21], [-66.69, 0.0], [-77.0, 0.0], [-77.0, 103.0], [-47.01, 103.0], [-45.0, 104.99]] },
  '34300': { name: 'V47鋭角', kind: 'v', grooves: [[0.0, 23.34, 41.73]],
    pts: [[-30.0, 80.0], [30.0, 80.0], [30.0, 60.02], [40.01, 60.02], [40.01, 0.0], [23.34, 0.0], [21.9, 0.23], [20.57, 0.86], [19.48, 1.83], [18.72, 3.1], [12.5, 18.11], [12.5, 22.05], [6.02, 37.72], [3.61, 40.64], [0.0, 41.73], [-3.61, 40.64], [-5.99, 37.72], [-12.5, 22.05], [-12.5, 18.11], [-18.72, 3.1], [-19.48, 1.83], [-20.55, 0.86], [-21.9, 0.23], [-23.34, 0.0], [-40.01, 0.0], [-40.01, 60.02], [-30.0, 60.02]] },
  '30540': { name: '2溝 V12/V20', kind: 'v2', grooves: [[17.5, 6.0, 6.21], [-13.0, 10.0, 10.35]],
    pts: [[-25.0, 46.0], [-7.5, 46.0], [-7.5, 40.0], [7.5, 40.0], [7.5, 46.0], [25.0, 46.0], [25.0, 0.0], [23.5, 0.0], [17.5, 6.21], [11.5, 0.0], [-3.0, 0.0], [-13.0, 10.35], [-23.0, 0.0], [-25.0, 0.0]] },
  '30640': { name: '2溝 V16/V25', kind: 'v2', grooves: [[15.5, 8.0, 8.28], [-10.5, 12.5, 12.94]],
    pts: [[-25.0, 46.0], [-7.5, 46.0], [-7.5, 40.0], [7.5, 40.0], [7.5, 46.0], [25.0, 46.0], [25.0, 0.0], [23.5, 0.0], [15.5, 8.28], [7.5, 0.0], [2.0, 0.0], [-10.5, 12.94], [-23.0, 0.0], [-25.0, 0.0]] },
  '970061': { name: 'V6ｲﾝｻｰﾄ', kind: 'ins', grooves: [[0.0, 3.0, 3.22]],
    pts: [[-7.0, 59.999], [7.0, 59.999], [7.0, 44.999], [4.5, 44.999], [4.5, 0.0], [3.0, 0.0], [0.0, 3.217], [-3.0, 0.0], [-5.0, 0.0], [-7.0, 2.0]] },
  '974061': { name: 'V12ｲﾝｻｰﾄ', kind: 'ins', grooves: [[0.0, 6.0, 6.43]],
    pts: [[-7.0, 59.999], [7.0, 59.999], [7.0, 44.999], [8.0, 44.999], [8.0, 0.0], [6.0, 0.0], [0.0, 6.434], [-6.0, 0.0], [-8.0, 0.0], [-8.0, 44.999], [-7.0, 44.999]] },
  '977061': { name: 'V16ｲﾝｻｰﾄ', kind: 'ins', grooves: [[0.0, 8.0, 8.58]],
    pts: [[-7.0, 60.0], [7.0, 60.0], [7.0, 45.0], [10.0, 45.0], [10.0, 0.0], [8.0, 0.0], [0.0, 8.579], [-8.0, 0.0], [-10.0, 0.0], [-10.0, 45.0], [-7.0, 45.0]] },
  '979061': { name: 'V20ｲﾝｻｰﾄ', kind: 'ins', grooves: [[0.0, 10.0, 10.72]],
    pts: [[-7.0, 60.0], [7.0, 60.0], [7.0, 45.0], [12.2, 45.0], [12.2, 0.0], [10.0, 0.0], [-0.0, 10.724], [-10.0, 0.0], [-12.2, 0.0], [-12.2, 45.0], [-7.0, 45.0]] },
  '982061': { name: 'V25ｲﾝｻｰﾄ', kind: 'ins', grooves: [[0.0, 12.5, 13.4]],
    pts: [[-7.0, 60.0], [7.0, 60.0], [7.0, 45.0], [14.75, 45.0], [14.75, 0.0], [12.5, 0.0], [0.0, 13.405], [-12.5, 0.0], [-14.75, 0.0], [-14.75, 45.0], [-7.0, 45.0]] },
  '08100': { name: 'サッシU14', kind: 'u', grooves: [[0.0, 7.0, 10.0]],
    pts: [[-30.0, 61.5], [30.0, 61.5], [30.0, 41.5], [12.5, 41.5], [12.5, 0.0], [7.0, 0.0], [7.0, 10.0], [-7.0, 10.0], [-7.0, 0.0], [-12.5, 0.0], [-12.5, 41.5], [-30.0, 41.5]] },
  '08150': { name: 'サッシU14改', kind: 'u', grooves: [[0.0, 7.0, 10.0]],
    pts: [[-30.0, 61.5], [30.0, 61.5], [30.0, 46.5], [12.5, 46.5], [12.5, 0.0], [7.0, 0.0], [7.0, 10.0], [-7.0, 10.0], [-7.0, 0.0], [-14.5, 0.0], [-14.5, 12.5], [-18.5, 12.5], [-18.5, 22.5], [-14.5, 22.5], [-14.5, 27.5], [-12.5, 27.5], [-12.5, 46.5], [-30.0, 46.5]] },
  '05500': { name: 'Uﾁｬﾝﾈﾙ60', kind: 'u', grooves: [[0.0, 30.0, 15.0]],
    pts: [[-30.0, 70.0], [30.0, 70.0], [30.0, 50.0], [37.0, 50.0], [47.0, 33.0], [47.0, 17.0], [37.0, 0.0], [30.0, 0.0], [30.0, 15.0], [-30.0, 15.0], [-30.0, 0.0], [-37.0, 0.0], [-47.0, 17.0], [-47.0, 33.0], [-37.0, 50.0], [-30.0, 50.0]] },
  '33075': { name: '段曲げ', kind: 'manual', grooves: [],
    pts: [[-30.0, 75.0], [30.0, 75.0], [30.0, 55.5], [13.0, 55.5], [13.0, 0.0], [-29.0, 0.0], [-29.0, 55.5], [-30.0, 55.5]] },
  '30000': { name: '凸50', kind: 'manual', grooves: [],
    pts: [[-25.0, 15.0], [25.0, 15.0], [25.0, 5.0], [7.5, 5.0], [7.5, 0.0], [-7.5, 0.0], [-7.5, 5.0], [-25.0, 5.0]] },
  '3009': { name: '凸20', kind: 'manual', grooves: [],
    pts: [[-10.0, 15.0], [10.0, 15.0], [10.0, 5.0], [5.5, 5.0], [5.5, 0.0], [-5.5, 0.0], [-5.5, 5.0], [-10.0, 5.0]] },
  '825': { name: 'フラット板', kind: 'manual', grooves: [],
    pts: [[-65.75, 15.0], [65.75, 15.0], [65.75, 0.0], [-65.75, 0.0]] },
};


// 中間板（DXF・色2上段＝太線図の122.7×78.3形状）。ヤゲン刃先原点での実位置。
// 中間板ライブラリ（複数種類あり・選択式）。
// 'std'  = bending.dxf 太線図の非対称形状（122.7×78.3・タング付き）。スロット天井 y=-150.093。
// '50001'= 50001.dxf（左右ほぼ対称・スロット深さ32、DXF原点そのまま）。スロット底 y_local=0・天井 y_local=32。
const CHUKAN_LIB = {
  std: {
    // クランプ指（ヤゲン頭部と重なり＝差し込み）／左フック（ガイド溝）／タング（厚9.1相当部）
    pts: [
  [26.017, -192.307],
  [26.017, -144.812],
  [21.796, -128.851],
  [13.454, -128.851],
  [13.454, -150.093],
  [2.821, -150.093],    // クランプ指（ヤゲン頭部と重なり＝差し込み）
  [2.821, -124.982],
  [-7.0, -124.982],
  [-7.0, -150.093],
  [-20.001, -150.093],
  [-20.001, -129.433],
  [-26.996, -129.433],
  [-32.366, -142.999],
  [-32.366, -172.336],
  [-41.555, -172.336],
  [-41.555, -197.494],
  [-52.281, -204.672],  // 左フック（ガイド溝）
  [-52.281, -220.217],
  [-48.301, -220.217],
  [-48.301, -218.058],
  [-39.201, -212.405],
  [-34.905, -205.034],
  [-29.297, -205.034],
  [-29.297, -247.723],  // タング（厚9.1相当部）
  [-19.191, -247.723],
  [-19.191, -221.65],
  [12.619, -221.65],
  [12.619, -192.307],
],
    mount: (top) => top + 150.093, // 天井をtoolTopに合わせるオフセット
  },
  '50001': {
    pts: [[-7.0, 0.0], [0.0, 0.0], [7.0, 0.0], [7.0, 32.0], [20.0, 32.0], [20.0, 5.9], [30.09, 5.9], [35.79, 27.17], [35.79, 53.9], [40.29, 53.9], [40.29, 85.38], [35.79, 85.38], [35.79, 88.5], [44.2, 88.5], [44.2, 117.43], [30.7, 117.43], [30.7, 101.75], [22.0, 101.75], [22.0, 119.8], [-20.0, 119.8], [-20.0, 150.7], [-33.0, 150.7], [-33.0, 85.38], [-40.29, 85.38], [-40.29, 53.9], [-35.79, 53.9], [-35.79, 27.17], [-30.09, 5.9], [-20.0, 5.9], [-20.0, 32.0], [-7.0, 32.0]],
    mount: (top) => top + 32,      // スロット天井(y_local=32)をtoolTopに合わせる。y_localは反転して使用
    flipY: true,
  },
};

// 汎用ストレートパンチ（比較用）
const PUNCH_STRAIGHT = mirrorClose([
  [0, 0], [4.9, -5.3], [4.9, -22], [9, -22], [9, -122],
]).map((p) => p);

// ============================================================================
// 幾何ユーティリティ
// ============================================================================
const rad = (deg) => (deg * Math.PI) / 180;
const rotV = (v, phi) => {
  const c = Math.cos(phi), s = Math.sin(phi);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
};

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) &&
        p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let u = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy));
}

function distPoly(p, poly) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    m = Math.min(m, distSeg(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return m;
}

// 工具の外接枠の外にある板の点は当たりようがない。線分を枠でクリップしてから
// 密サンプリングし、長い辺で計算量が爆発しないようにする（Liang–Barsky）。
function bboxOf(poly, m) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of poly) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
  }
  return [x0 - m, x1 + m, y0 - m, y1 + m];
}
function clipSeg(a, b, B) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const P = [-dx, dx, -dy, dy], Q = [a[0] - B[0], B[1] - a[0], a[1] - B[2], B[3] - a[1]];
  for (let i = 0; i < 4; i++) {
    if (P[i] === 0) { if (Q[i] < 0) return null; }
    else {
      const r = Q[i] / P[i];
      if (P[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
      else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}
function sampleInBox(pts, B, step = 0.8) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const c = clipSeg(pts[i], pts[i + 1], B);
    if (!c) continue;
    const L = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]);
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k <= n; k++) {
      out.push([c[0][0] + ((c[1][0] - c[0][0]) * k) / n, c[0][1] + ((c[1][1] - c[0][1]) * k) / n]);
    }
  }
  return out;
}
// 曲げている箇所そのものは刃先・V肩に「当たって当たり前」。そこを座標の近さで
// 除外すると、離れた面がたまたまその位置に来たとき見逃す（コの字の1枚目フランジが
// 刃先の上を横切る、など）。板に沿った長さ（弧長）で除外する（経緯まとめ 第12章）。
function splitChain(pts, vIdx, exArc) {
  const s = [0];
  for (let i = 1; i < pts.length; i++)
    s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const total = s[s.length - 1], s0 = s[vIdx];
  const ptAt = (u) => {
    for (let i = 0; i < pts.length - 1; i++) {
      if (u <= s[i + 1] || i === pts.length - 2) {
        const seg = s[i + 1] - s[i] || 1, f = (u - s[i]) / seg;
        return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
      }
    }
    return pts[pts.length - 1];
  };
  const build = (a, b) => {
    if (b - a <= 1e-9) return null;
    const o = [ptAt(a)];
    for (let i = 0; i < pts.length; i++) if (s[i] > a && s[i] < b) o.push(pts[i]);
    o.push(ptAt(b));
    return o;
  };
  const res = [];
  const left = build(0, Math.min(s0 - exArc, total)); if (left) res.push(left);
  const right = build(Math.max(s0 + exArc, 0), total); if (right) res.push(right);
  return res;
}
// 最小すきま（mm）を返す。負＝食い込み量（曲がらない）。exArc を渡すと曲げ頂点の
// 前後をその弧長ぶん除外する（正規接触は当たって当たり前のため）。
// hits は侵入0.05mm超の点の一覧（断面図での可視化用）。
function minGap(chain, tools, t, vHalf, exArc) {
  const margin = t + 6;
  const boxes = tools.map((poly) => bboxOf(poly, margin));
  if (!boxes.length) return { gap: Infinity, at: null, hits: [] };
  const G = [
    Math.min(...boxes.map((b) => b[0])), Math.max(...boxes.map((b) => b[1])),
    Math.min(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3])),
  ];
  const parts = exArc != null && chain.vIdx != null ? splitChain(chain.pts, chain.vIdx, exArc) : [chain.pts];
  const samples = [];
  for (const pr of parts) samples.push(...sampleInBox(pr, G, 0.8));
  let g = Infinity, at = null;
  const hits = [];
  for (const p of samples) {
    for (let i = 0; i < tools.length; i++) {
      const B = boxes[i];
      if (p[0] < B[0] || p[0] > B[1] || p[1] < B[2] || p[1] > B[3]) continue;
      const poly = tools[i];
      const d = pointInPoly(p, poly) ? -distPoly(p, poly) : distPoly(p, poly);
      const clearance = d - t / 2;
      if (clearance < g) { g = clearance; at = p; }
      if (clearance < -0.05) hits.push(p);
    }
  }
  return { gap: g === Infinity ? margin - t / 2 : g, at, hits };
}

// ============================================================================
// 金型生成
// ============================================================================
// ============================================================================
// 機械ライブラリ（アマダ公表カタログ値。OH=オープンハイト（クランプ無し基準）mm）
// HD3504NT: 米国仕様シートより stroke 350 / OH 620。HG2203・EGB-1303e: 国内仕様表より。
// 実機の金型クランプ形式によりOHは変わるため、手動補正欄で調整可。
// ============================================================================
const MACHINE_LIB = {
  hd3504nt: { name: 'AMADA HD3504NT（350t×4,000）', oh: 620, stroke: 350, ton: 350, len: 4000 },
  hg2203:   { name: 'AMADA HG2203（220t×3,000）',   oh: 520, stroke: 250, ton: 220, len: 3000 },
  egb1303e: { name: 'AMADA EGB1303E（130t×3,000）', oh: 520, stroke: 250, ton: 130, len: 3000 },
  manual:   { name: '手動入力', oh: 520, stroke: 250, ton: 0, len: 0 },
};

// インサート用スタック（bending.dxfのホルダ・ベース。インサート露出45に合わせ深さ-5シフト）
const INSERT_STACK_RIGHT = [
  [14, 45], [14, 62.5], [17.5, 62.5], [17.5, 67.5], [14, 67.5], [14, 90],
  [67.5, 90], [67.5, 180], [127.5, 180], [127.5, 230], [207.5, 230], [207.5, 351.9],
];

// ダイ選択の解決：{ polys:[...], vHalf, note } を返す
// sel: 'v12stack' | 'flat' | 'lib:ID:溝index' | 'ins:ID:solo' | 'ins:ID:stack'
function resolveDie(sel, vW, dieHalf) {
  if (sel === 'flat') {
    const vh = vW / 2;
    const W = Math.max(dieHalf, vh + 2);
    return { polys: [mirrorClose([[0, vh], [vh, 0], [W, 0], [W, 150]])], vHalf: vh, note: `汎用 V${vW}` };
  }
  if (sel === 'v12stack') {
    return { polys: [mirrorClose(DIE_RIGHT_HALF)], vHalf: 6, note: '実機 V12 段付きスタック（bending.dxf）' };
  }
  const [mode, id, sub] = sel.split(':');
  const d = DIE_LIB[id];
  if (mode === 'ins') {
    const stack = sub === 'stack';
    const polys = stack ? [d.pts, mirrorClose(INSERT_STACK_RIGHT)] : [d.pts];
    return { polys, vHalf: d.grooves[0][1], note: `${id} ${d.name}${stack ? '＋スタック' : '（単体）'}` };
  }
  // lib:ID:gi
  const gi = Number(sub) || 0;
  if (d.kind === 'manual' || d.grooves.length === 0) {
    return { polys: [d.pts], vHalf: vW / 2, note: `${id} ${d.name}（特殊：V支点は手動V幅${vW}で近似）`, manual: true };
  }
  const g = d.grooves[Math.min(gi, d.grooves.length - 1)];
  const polys = [d.pts.map(([x, y]) => [x - g[0], y])];
  return { polys, vHalf: g[1], note: `${id} ${d.name}｜溝 幅${(g[1] * 2).toFixed(1)}・深さ${g[2]}`, maxDepth: g[2] };
}

// パンチ組立体：ヤゲン＋中間板（DXFの実位置のまま一体で昇降）。ポリゴン配列を返す。
function buildPunch(punchType, punchFlip, tipY, chukanSel) {
  if (punchType === 'straight') {
    return [PUNCH_STRAIGHT.map(([x, y]) => [punchFlip ? -x : x, y + tipY])];
  }
  const tool = PUNCH_LIB[punchType].pts;
  const top = Math.min(...tool.map((p) => p[1]));
  const ck = CHUKAN_LIB[chukanSel];
  const dy = ck.mount(top);
  const chukan = ck.flipY
    ? ck.pts.map(([x, y]) => [x, -y + dy])
    : ck.pts.map(([x, y]) => [x, y + dy]);
  const polys = [tool, chukan];
  return polys.map((poly) => poly.map(([x, y]) => [punchFlip ? -x : x, y + tipY]));
}

// ============================================================================
// 板のキネマティクス（エアベンディング近似・中立軸ポリライン）
// アクティブ曲げ頂点はパンチ直下、両側はV肩支点で回転。最大90°。
// ============================================================================
// segs（展開値）の各辺は、曲げが1か所できるたび、その両隣の辺が
// シャープコーナー換算で（片伸び − 板厚/2）だけ長くなる（経緯まとめ 第11章）。
// growArr は曲げごとのその伸び量（元の曲げ番号でインデックス）。
function computeChain(part, seq, stepIdx, prog, vHalf) {
  const { t, segs, bends, growArr } = part;
  const B = bends.length;
  const st = seq[stepIdx];
  const msegs = st.mirror ? [...segs].reverse() : segs;
  const srcOf = (i) => (st.mirror ? B - 1 - i : i);
  const mb = [];
  for (let i = 0; i < B; i++) {
    const s = bends[srcOf(i)];
    mb.push({ angle: s.angle, dir: (st.valley ? -1 : 1) * s.dir, src: srcOf(i) });
  }
  const j = st.mirror ? B - 1 - st.bend : st.bend;
  const done = new Set(seq.slice(0, stepIdx).map((s) => s.bend));
  const pr = Math.max(0, Math.min(1, prog));

  const growOf = (i) => (growArr ? growArr[mb[i].src] || 0 : 0);
  const wOf = (i) => (done.has(mb[i].src) ? 1 : i === j ? pr : 0);
  const ms = msegs.map((L, k) =>
    L + (k > 0 ? growOf(k - 1) * wOf(k - 1) : 0) + (k < B ? growOf(k) * wOf(k) : 0));

  const activeDirOK = mb[j].dir > 0;
  const theta = rad(Math.min(90, mb[j].angle)) * pr;
  const alpha = theta / 2;
  // 板の外面がV肩に接するのがエアベンドの幾何。中立軸(vy)は外面から板厚半分だけ
  // 面直方向にオフセットする（旧式は鉛直オフセットで、深曲げで vHalf·(1-cosα) だけ
  // ずれていた＝経緯まとめ 第8.1章バグ2）。innerY は板の内側面（マイター点＝刃先が
  // 当たる点）で、中立軸からさらに板厚半分だけ面直に入った位置（同章バグ3）。
  const vy = vHalf * Math.tan(alpha) - (t / 2) / Math.cos(alpha);
  const innerY = vy - (t / 2) / Math.cos(alpha);

  const signedOf = (i) =>
    done.has(mb[i].src) ? rad(mb[i].angle) * mb[i].dir : 0;

  const left = [];
  let D = [-Math.cos(alpha), -Math.sin(alpha)];
  let pos = [0, vy];
  for (let i = j; i >= 0; i--) {
    pos = [pos[0] + D[0] * ms[i], pos[1] + D[1] * ms[i]];
    left.push(pos);
    if (i > 0) D = rotV(D, signedOf(i - 1));
  }
  const right = [];
  D = [Math.cos(alpha), -Math.sin(alpha)];
  pos = [0, vy];
  for (let i = j + 1; i < ms.length; i++) {
    pos = [pos[0] + D[0] * ms[i], pos[1] + D[1] * ms[i]];
    right.push(pos);
    if (i < ms.length - 1) D = rotV(D, -signedOf(i));
  }

  const pts = [...left.reverse(), [0, vy], ...right];
  return { pts, vIdx: left.length, vy, innerY, activeDirOK, thetaDeg: (theta * 180) / Math.PI };
}

// 曲げ頂点からV肩の接触点までの中立軸長さ（90°ではほぼ板厚に依らず0.707×V幅に収束）。
// これより短いフランジはV肩に届かず溝に落ちる（経緯まとめ 第8.2章）。
function shoulderReach(vHalf, t, ang) {
  const a = rad(Math.min(90, ang)) / 2;
  const vy = vHalf * Math.tan(a) - (t / 2) / Math.cos(a);
  return Math.hypot(vHalf - (t / 2) * Math.sin(a), vy + (t / 2) * Math.cos(a));
}

// 現在の工程で、曲げ頂点の左右の辺がV肩に届く長さを持っているか。
// computeChain は届く／届かないに関わらず肩支点で回転させてしまうため、
// この判定はそれとは別立てで行う必要がある。
function reachCheck(part, seq, stepIdx, vHalf) {
  const { t, segs, bends, growArr } = part;
  const B = bends.length;
  const st = seq[stepIdx];
  const msegs = st.mirror ? [...segs].reverse() : segs;
  const srcOf = (i) => (st.mirror ? B - 1 - i : i);
  const j = st.mirror ? B - 1 - st.bend : st.bend;
  const done = new Set(seq.slice(0, stepIdx).map((s) => s.bend));
  const growOf = (i) => (growArr ? growArr[srcOf(i)] || 0 : 0);
  const wOf = (i) => (done.has(srcOf(i)) ? 1 : 0); // この工程の開始時点＝進捗0%
  const ms = msegs.map((L, k) =>
    L + (k > 0 ? growOf(k - 1) * wOf(k - 1) : 0) + (k < B ? growOf(k) * wOf(k) : 0));
  const need = shoulderReach(vHalf, t, bends[srcOf(j)].angle);
  let Lf = 0;
  for (let i = j; i >= 0; i--) { Lf += ms[i]; if (i > 0 && done.has(srcOf(i - 1))) break; }
  let Rf = 0;
  for (let i = j + 1; i < ms.length; i++) { Rf += ms[i]; if (i < ms.length - 1 && done.has(srcOf(i))) break; }
  return { ok: Lf >= need && Rf >= need, need, have: Math.min(Lf, Rf) };
}

// ============================================================================
// 伸び値（曲げ控除）計算：BD = 2(R+t)tan(θ/2) − BA、BA = θrad(R + K·t)
// θは90°超の場合セットバックをtan45°で頭打ち（一般的な簡易式）。
// ============================================================================
function bendDeduction(angleDeg, R, t, K) {
  const th = rad(angleDeg);
  const sb = 2 * (R + t) * Math.tan(rad(Math.min(angleDeg, 90)) / 2);
  const ba = th * (R + K * t);
  return sb - ba;
}

// ============================================================================
// 自動段取り探索（Dr.ABE_Bend相当の簡易版）
// 曲げ順×姿勢（左右反転・表裏）をDFSで総当りし、粗ストローク走査で干渉チェック
// ============================================================================
function stepFeasible(part, prefix, st, vHalf, diePolys, punchType, punchFlip, chukanSel) {
  const seq = [...prefix, st];
  const idx = prefix.length;
  if (!reachCheck(part, seq, idx, vHalf).ok) return false;
  const exArc = shoulderReach(vHalf, part.t, 90) + part.t;
  for (let p = 0; p <= 1.0001; p += 0.1) {
    const ch = computeChain(part, seq, idx, p, vHalf);
    if (!ch.activeDirOK) return false;
    const punchPolys = buildPunch(punchType, punchFlip, ch.innerY, chukanSel);
    if (minGap(ch, [...diePolys, ...punchPolys], part.t, vHalf, exArc).gap < -0.05) return false;
  }
  return true;
}

function searchSequences(part, vHalf, diePolys, punchType, punchFlip, chukanSel, limit = 6) {
  const B = part.bends.length;
  const sols = [];
  let tried = 0;
  const dfs = (prefix, remaining) => {
    if (sols.length >= limit) return;
    if (remaining.length === 0) { sols.push(prefix.slice()); return; }
    for (const b of remaining) {
      for (const valley of [false, true]) {
        for (const mirror of [false, true]) {
          if (sols.length >= limit) return;
          tried++;
          const st = { bend: b, mirror, valley };
          if (stepFeasible(part, prefix, st, vHalf, diePolys, punchType, punchFlip, chukanSel)) {
            dfs([...prefix, st], remaining.filter((x) => x !== b));
          }
        }
      }
    }
  };
  dfs([], [...Array(B).keys()]);
  return { sols, tried };
}

// 金型候補（Vダイ経験則：4t ≦ V幅 ≦ 20t、V半幅+1 < 最短フランジ）
function dieCandidates(t, minFlange) {
  const out = [{ sel: 'v12stack', vHalf: 6, label: 'V12スタック' }];
  for (const [id, d] of Object.entries(DIE_LIB)) {
    if (d.kind === 'v' || d.kind === 'v2' || d.kind === 'u') {
      d.grooves.forEach((g, gi) =>
        out.push({ sel: `lib:${id}:${gi}`, vHalf: g[1], label: `${id} V${(g[1] * 2).toFixed(0)}` }));
    } else if (d.kind === 'ins') {
      out.push({ sel: `ins:${id}:stack`, vHalf: d.grooves[0][1], label: `${id} ${d.name}＋スタック` });
    }
  }
  return out
    .filter((c) => c.vHalf * 2 >= 3.9 * t && c.vHalf * 2 <= 20 * t && c.vHalf + 1 < minFlange)
    .sort((a, b) => Math.abs(a.vHalf * 2 - 8 * t) - Math.abs(b.vHalf * 2 - 8 * t));
}

function searchTools(part, vW, dieHalf, chukanSel, maxCombos = 8) {
  const minFlange = Math.min(...part.segs);
  const dies = dieCandidates(part.t, minFlange);
  const found = [];
  for (const dc of dies) {
    const info = resolveDie(dc.sel, vW, dieHalf);
    for (const pid of Object.keys(PUNCH_LIB)) {
      for (const flip of [false, true]) {
        const { sols } = searchSequences(part, info.vHalf, info.polys, pid, flip, chukanSel, 1);
        if (sols.length > 0) {
          found.push({ dieSel: dc.sel, dieLabel: dc.label, punch: pid, flip, seq: sols[0] });
          if (found.length >= maxCombos) return { found, diesTried: dies.length };
        }
      }
    }
  }
  return { found, diesTried: dies.length };
}

// ============================================================================
// メインコンポーネント
// ============================================================================
const BendingSimulator = () => {
  // --- 板形状（初期値：図面の展開 86.3 = 30 + 16.3 + 40、t2.3、Z曲げ90°×2）---
  const [t, setT] = useState(2.3);
  const [segs, setSegs] = useState([30, 16.3, 40]);
  const [inputMode, setInputMode] = useState('flat'); // 'flat'=展開値 / 'outer'=仕上がり外寸
  const [outerSegs, setOuterSegs] = useState([32.3, 21.2, 42.3]);
  const [innerR, setInnerR] = useState(1.5);
  const [kf, setKf] = useState(0.446);
  const [bends, setBends] = useState([
    { angle: 90, dir: 1 },
    { angle: 90, dir: -1 },
  ]);
  // --- 金型 ---
  const [dieSel, setDieSel] = useState('v12stack');
  const [vW, setVW] = useState(12);
  const [dieHalf, setDieHalf] = useState(30);
  const [punchType, setPunchType] = useState('904061');
  const [machineSel, setMachineSel] = useState('hd3504nt');
  const [ohAdj, setOhAdj] = useState(0); // OH補正（クランプ・中間板取付形態の差分）
  const [punchFlip, setPunchFlip] = useState(false);
  const [chukanSel, setChukanSel] = useState('std');
  // --- 工程 ---
  const [seq, setSeq] = useState([
    { bend: 0, mirror: false, valley: false },
    { bend: 1, mirror: false, valley: true },
  ]);
  const [step, setStep] = useState(0);
  const [prog, setProg] = useState(1);
  const [playing, setPlaying] = useState(false);
  // --- 表示 ---
  const [view, setView] = useState({ scale: 4.2, cx: 0, cy: -20 }); // cx,cy=注視点(mm)
  const [showGuide, setShowGuide] = useState(true);     // 曲げ開始前の板位置（ガイド線）
  const [seqResults, setSeqResults] = useState(null);   // 曲げ順探索結果
  const [toolResults, setToolResults] = useState(null); // 金型総当り結果
  const dragRef = useRef(null);

  const canvasRef = useRef(null);
  // 仕上がり外寸モード：伸び値（BD）で展開値へ換算
  const bdList = useMemo(() => bends.map((b) => bendDeduction(b.angle, innerR, t, kf)), [bends, innerR, t, kf]);
  const effSegs = useMemo(() => {
    if (inputMode === 'flat') return segs;
    return outerSegs.map((L, i) =>
      Math.max(1, L - (i > 0 ? bdList[i - 1] / 2 : 0) - (i < bends.length ? bdList[i] / 2 : 0)));
  }, [inputMode, segs, outerSegs, bdList, bends.length]);
  // 曲げ済みの辺の伸び（片伸び − 板厚/2）。実測の折り曲げ表値（片伸び）に置き換えるべき
  // ところを、ここでは暫定として K係数式の伸び値の半分を片伸びとして使う
  // （経緯まとめ 第11章／棚卸し_jsx移植と多曲げ設計 E16・フェーズ3で表に差し替え予定）。
  const growArr = useMemo(() => bdList.map((bd) => bd / 2 - t / 2), [bdList, t]);
  const part = useMemo(() => ({ t, segs: effSegs, bends, growArr }), [t, effSegs, bends, growArr]);
  const dieInfo = useMemo(() => resolveDie(dieSel, vW, dieHalf), [dieSel, vW, dieHalf]);
  const diePolys = dieInfo.polys;
  const vHalf = dieInfo.vHalf;

  // --- 全工程スイープ判定（ストローク0→100%を走査）---
  const verdicts = useMemo(() => {
    const exArc = shoulderReach(vHalf, t, 90) + t;
    return seq.map((_, si) => {
      const reach = reachCheck(part, seq, si, vHalf);
      if (!reach.ok) return { orientationNG: false, reachFail: reach, firstHit: null };
      let orientationNG = false;
      let firstHit = null;
      for (let p = 0; p <= 1.0001; p += 0.04) {
        const ch = computeChain(part, seq, si, p, vHalf);
        if (!ch.activeDirOK) orientationNG = true;
        const punchPolys = buildPunch(punchType, punchFlip, ch.innerY, chukanSel);
        const g = minGap(ch, [...diePolys, ...punchPolys], t, vHalf, exArc);
        if (g.gap < -0.05) {
          firstHit = { prog: p, gap: g.gap };
          break;
        }
      }
      return { orientationNG, reachFail: null, firstHit };
    });
  }, [part, seq, vHalf, diePolys, punchType, punchFlip, chukanSel, t]);

  const allOK = verdicts.every((v) => !v.firstHit && !v.orientationNG && !v.reachFail);

  // --- 現在フレーム ---
  const frame = useMemo(() => {
    const exArc = shoulderReach(vHalf, t, 90) + t;
    const ch = computeChain(part, seq, step, prog, vHalf);
    const punchPolys = buildPunch(punchType, punchFlip, ch.innerY, chukanSel);
    const g = minGap(ch, [...diePolys, ...punchPolys], t, vHalf, exArc);
    const guide = computeChain(part, seq, step, 0, vHalf); // 曲げ開始前（ストローク0%）
    return { ch, punchPolys, hits: g.hits, gap: g.gap, guide };
  }, [part, seq, step, prog, vHalf, diePolys, punchType, punchFlip, chukanSel, t]);

  // --- 機械チェック（型合わせ・曲げ切り・部品出し入れ）---
  const machineCheck = useMemo(() => {
    const m = MACHINE_LIB[machineSel];
    const OH = m.oh + ohAdj;
    const dieH = Math.max(...diePolys.flatMap((poly) => poly.map((p) => p[1])));
    const punchPolys0 = buildPunch(punchType, punchFlip, 0, chukanSel);
    const punchH = -Math.min(...punchPolys0.flatMap((poly) => poly.map((p) => p[1])));
    // 各工程で板が金型上面より上に張り出す最大高さ（開始時・完了時の姿勢から）
    let partRise = 0;
    seq.forEach((_, si) => {
      [0, 1].forEach((pp) => {
        const ch = computeChain(part, seq, si, pp, vHalf);
        const top = -Math.min(...ch.pts.map((q) => q[1]));
        partRise = Math.max(partRise, top + t / 2);
      });
    });
    const dNeed = vHalf; // 90°時の最大押込み量 ≈ V半幅
    const gapTDC = OH - dieH - punchH;                 // 上死点での刃先〜ダイ上面
    const closeMargin = dieH + punchH - dNeed - (OH - m.stroke); // ≥0で曲げ切り可
    const loadMargin = gapTDC - partRise;              // ≥0で部品出し入れ可
    return { m, OH, dieH, punchH, partRise, gapTDC, closeMargin, loadMargin };
  }, [machineSel, ohAdj, diePolys, punchType, punchFlip, chukanSel, seq, part, vHalf, t]);

  // --- 再生 ---
  useEffect(() => {
    if (!playing) return;
    let raf;
    const tick = () => {
      setProg((p) => Math.min(1, p + 0.01));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    if (!playing || prog < 1) return;
    const id = setTimeout(() => {
      if (step < seq.length - 1) {
        setStep(step + 1);
        setProg(0);
      } else {
        setPlaying(false);
      }
    }, 700);
    return () => clearTimeout(id);
  }, [playing, prog, step, seq.length]);

  // --- 描画 ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const { scale, cx, cy } = view;
    const tx = (x) => W / 2 + (x - cx) * scale;
    const ty = (y) => H / 2 + (y - cy) * scale;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0c1116';
    ctx.fillRect(0, 0, W, H);

    // グリッド（10mm）
    ctx.strokeStyle = 'rgba(148,163,184,0.07)';
    ctx.lineWidth = 1;
    const gx0 = Math.floor((cx - W / 2 / scale) / 10) * 10;
    const gy0 = Math.floor((cy - H / 2 / scale) / 10) * 10;
    for (let gx = gx0; tx(gx) < W; gx += 10) {
      ctx.beginPath(); ctx.moveTo(tx(gx), 0); ctx.lineTo(tx(gx), H); ctx.stroke();
    }
    for (let gy = gy0; ty(gy) < H; gy += 10) {
      ctx.beginPath(); ctx.moveTo(0, ty(gy)); ctx.lineTo(W, ty(gy)); ctx.stroke();
    }
    // V中心線
    ctx.strokeStyle = 'rgba(56,189,248,0.25)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(tx(0), 0); ctx.lineTo(tx(0), H); ctx.stroke();
    ctx.setLineDash([]);

    const drawPoly = (poly, fill, stroke) => {
      ctx.beginPath();
      ctx.moveTo(tx(poly[0][0]), ty(poly[0][1]));
      for (let i = 1; i < poly.length; i++) ctx.lineTo(tx(poly[i][0]), ty(poly[i][1]));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'miter';
      ctx.stroke();
    };

    diePolys.forEach((poly) => drawPoly(poly, '#161a10', '#d4a017'));
    frame.punchPolys.forEach((poly, i) =>
      drawPoly(poly, i === 0 ? '#10201c' : '#141821', i === 0 ? '#4ade80' : '#8a93a8'));

    // ガイド線：曲げ開始前（ストローク0%）の板位置。AMNC画面との目視比較用
    if (showGuide && prog > 0.005) {
      const g = frame.guide.pts;
      ctx.beginPath();
      ctx.moveTo(tx(g[0][0]), ty(g[0][1]));
      for (let i = 1; i < g.length; i++) ctx.lineTo(tx(g[i][0]), ty(g[i][1]));
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(148,163,184,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 板（中立軸を板厚幅で描画）
    const pts = frame.ch.pts;
    ctx.beginPath();
    ctx.moveTo(tx(pts[0][0]), ty(pts[0][1]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(tx(pts[i][0]), ty(pts[i][1]));
    ctx.strokeStyle = frame.hits.length ? '#f87171' : '#e05252';
    ctx.lineWidth = Math.max(2, t * scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    ctx.stroke();

    // 干渉点
    for (const h of frame.hits) {
      ctx.beginPath();
      ctx.arc(tx(h[0]), ty(h[1]), 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(251,146,60,0.9)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tx(h[0]), ty(h[1]), 11, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(251,146,60,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 情報表示
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`工程 ${step + 1}/${seq.length}　曲げ角度 ${frame.ch.thetaDeg.toFixed(1)}°`, 16, 24);
    if (!frame.ch.activeDirOK) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('⚠ この向きでは谷曲げ（下向き）になります。「山谷反転」で裏返してください', 16, 44);
    }
    if (frame.gap < -0.05) {
      ctx.fillStyle = '#fb923c';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillText(`⚠ 干渉：${(-frame.gap).toFixed(2)}mm 食い込み`, 16, H - 18);
    }
  }, [frame, diePolys, step, seq.length, t, view, showGuide, prog]);

  // --- ビュー操作（ドラッグ＝パン、ホイール＝ズーム）---
  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    const k = canvas.width / r.width;
    setView((v) => ({
      ...v,
      cx: dragRef.current.cx - ((e.clientX - dragRef.current.x) * k) / v.scale,
      cy: dragRef.current.cy - ((e.clientY - dragRef.current.y) * k) / v.scale,
    }));
  };
  const onPointerUp = () => { dragRef.current = null; };
  const onWheel = useCallback((e) => {
    e.preventDefault();
    setView((v) => {
      const s = Math.min(12, Math.max(1.2, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      return { ...v, scale: s };
    });
  }, []);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const viewPreset = (name) => {
    if (name === 'tip') setView({ scale: 5.5, cx: 0, cy: -25 });
    else if (name === 'all') setView({ scale: 1.7, cx: 0, cy: 60 });
    else setView({ scale: 4.2, cx: 0, cy: -20 });
  };

  // --- 形状編集 ---
  const setSeg = (i, v) => setSegs(segs.map((s, k) => (k === i ? v : s)));
  const setBend = (i, patch) => setBends(bends.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  const addSeg = () => {
    setSegs([...segs, 30]);
    setOuterSegs([...outerSegs, 30]);
    setBends([...bends, { angle: 90, dir: 1 }]);
    setSeq([...seq, { bend: bends.length, mirror: false, valley: false }]);
  };
  const removeSeg = () => {
    if (segs.length <= 2) return;
    setSegs(segs.slice(0, -1));
    setOuterSegs(outerSegs.slice(0, -1));
    setBends(bends.slice(0, -1));
    setSeq(seq.slice(0, -1).map((s) => ({ ...s, bend: Math.min(s.bend, bends.length - 2) })));
    setStep(0); setProg(1);
  };
  const setStepConf = (i, patch) => setSeq(seq.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  const inp = 'w-16 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-right text-slate-100 text-sm';
  const sel = 'bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-slate-100 text-sm';
  const lbl = 'text-slate-400 text-xs';
  const vbtn = 'px-2 py-0.5 text-xs rounded border border-slate-600 hover:bg-slate-800 text-slate-300';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-baseline gap-3 mb-3 flex-wrap">
          <h1 className="text-lg font-bold tracking-wide text-slate-100">曲げ加工シミュレーター</h1>
          <span className="text-xs text-slate-500">実測金型（V12ダイ＋実機ヤゲン）｜プレスブレーキ干渉判定</span>
        </div>

        {/* 総合判定バー */}
        <div className={`rounded-md px-4 py-2.5 mb-3 border font-bold text-sm flex items-center gap-3 flex-wrap ${
          allOK ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                : 'bg-red-950/60 border-red-700 text-red-300'}`}>
          <span className="text-lg">{allOK ? '○' : '✕'}</span>
          {allOK ? '全工程 曲げ可能（干渉なし）' : '干渉あり — この段取りでは曲がりません'}
          <div className="ml-auto flex gap-2 flex-wrap">
            {verdicts.map((v, i) => (
              <button key={i}
                onClick={() => { setStep(i); setProg(1); setPlaying(false); }}
                className={`px-2.5 py-1 rounded text-xs font-mono border transition ${
                  step === i ? 'border-sky-400 bg-sky-900/40' : 'border-slate-700 bg-slate-900'
                } ${v.firstHit || v.orientationNG || v.reachFail ? 'text-red-300' : 'text-emerald-300'}`}>
                工程{i + 1} {
                  v.reachFail ? `✕ フランジ不足(${v.reachFail.need.toFixed(1)}mm必要)`
                  : v.orientationNG ? '要反転'
                  : v.firstHit ? `✕ ${Math.round(v.firstHit.prog * 100)}%で干渉（${(-v.firstHit.gap).toFixed(1)}mm）`
                  : '○'
                }
              </button>
            ))}
          </div>
        </div>

        {/* キャンバス */}
        <div className="border border-slate-800 rounded-md overflow-hidden bg-black relative">
          <canvas ref={canvasRef} width={880} height={560} className="w-full h-auto block cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button className={vbtn} onClick={() => viewPreset('tip')}>刃先</button>
            <button className={vbtn} onClick={() => viewPreset('std')}>標準</button>
            <button className={vbtn} onClick={() => viewPreset('all')}>全体</button>
          </div>
          <div className="absolute bottom-2 right-3 text-[10px] text-slate-500 font-mono">
            ドラッグ＝移動 / ホイール＝拡大縮小
          </div>
        </div>

        {/* 再生コントロール */}
        <div className="flex items-center gap-4 mt-3 bg-slate-900 border border-slate-800 rounded-md px-4 py-3">
          <button
            onClick={() => {
              if (!playing) { setStep(0); setProg(0); }
              setPlaying(!playing);
            }}
            className="px-4 py-1.5 rounded bg-sky-700 hover:bg-sky-600 text-white text-sm font-bold shrink-0">
            {playing ? '■ 停止' : '▶ 全工程再生'}
          </button>
          <span className={`${lbl} shrink-0`}>ストローク {Math.round(prog * 100)}%</span>
          <input type="range" min={0} max={100} value={Math.round(prog * 100)}
            onChange={(e) => { setPlaying(false); setProg(Number(e.target.value) / 100); }}
            className="flex-1 accent-sky-500" />
        </div>

        <div className="grid md:grid-cols-2 gap-3 mt-3">
          {/* 板形状 */}
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-100">
                板形状（{inputMode === 'flat' ? '展開寸法' : '仕上がり外寸'} mm）
              </h2>
              <div className="flex rounded overflow-hidden border border-slate-600 text-xs">
                <button onClick={() => setInputMode('flat')}
                  className={`px-2 py-0.5 ${inputMode === 'flat' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>展開値</button>
                <button onClick={() => setInputMode('outer')}
                  className={`px-2 py-0.5 ${inputMode === 'outer' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>外寸→伸び値計算</button>
              </div>
              <div className="flex gap-2">
                <button onClick={addSeg} className="px-2 py-0.5 text-xs rounded border border-slate-600 hover:bg-slate-800">＋辺追加</button>
                <button onClick={removeSeg} className="px-2 py-0.5 text-xs rounded border border-slate-600 hover:bg-slate-800">－削除</button>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className={lbl}>板厚 t</span>
              <input type="number" step={0.1} min={0.5} max={9} value={t}
                onChange={(e) => setT(Number(e.target.value) || 1)} className={inp} />
              <span className={`${lbl} ml-3`}>展開長 {effSegs.reduce((a, b) => a + b, 0).toFixed(1)} mm</span>
              {inputMode === 'outer' && (
                <>
                  <span className={`${lbl} ml-3`}>内R</span>
                  <input type="number" step={0.1} min={0.1} value={innerR}
                    onChange={(e) => setInnerR(Number(e.target.value) || 0.5)} className={inp} />
                  <span className={lbl}>K係数</span>
                  <input type="number" step={0.001} min={0.2} max={0.5} value={kf}
                    onChange={(e) => setKf(Number(e.target.value) || 0.446)} className={inp} />
                </>
              )}
            </div>
            {inputMode === 'outer' && (
              <div className="text-[11px] text-slate-500 font-mono mb-2">
                伸び値（曲げ控除）: {bdList.map((b, i) => `曲げ${i + 1}=${b.toFixed(2)}`).join('　')}
                ｜展開値: {effSegs.map((L) => L.toFixed(2)).join(' / ')}
              </div>
            )}
            <div className="space-y-1.5">
              {segs.map((L, i) => (
                <React.Fragment key={i}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500 w-10">辺{i + 1}</span>
                    <input type="number" step={0.1} min={2}
                      value={inputMode === 'flat' ? L : outerSegs[i]}
                      onChange={(e) => {
                        const v = Number(e.target.value) || 2;
                        if (inputMode === 'flat') setSeg(i, v);
                        else setOuterSegs(outerSegs.map((x, k) => (k === i ? v : x)));
                      }} className={inp} />
                    <span className={lbl}>mm</span>
                  </div>
                  {i < bends.length && (
                    <div className="flex items-center gap-2 pl-6 border-l-2 border-slate-700 ml-3">
                      <span className="text-xs font-mono text-amber-500 w-12">曲げ{i + 1}</span>
                      <input type="number" step={1} min={10} max={90} value={bends[i].angle}
                        onChange={(e) => setBend(i, { angle: Math.min(90, Number(e.target.value) || 90) })}
                        className={inp} />
                      <span className={lbl}>°</span>
                      <select value={bends[i].dir}
                        onChange={(e) => setBend(i, { dir: Number(e.target.value) })} className={sel}>
                        <option value={1}>山（上曲げ）</option>
                        <option value={-1}>谷（下曲げ）</option>
                      </select>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* 金型・段取り */}
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
            <h2 className="text-sm font-bold text-slate-100 mb-3">機械・金型</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
              <label className="flex items-center gap-1.5">
                <span className={lbl}>機械</span>
                <select value={machineSel} onChange={(e) => setMachineSel(e.target.value)} className={sel}>
                  {Object.entries(MACHINE_LIB).map(([k, m]) => (
                    <option key={k} value={k}>{m.name}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <span className={lbl}>OH補正</span>
                <input type="number" step={5} value={ohAdj}
                  onChange={(e) => setOhAdj(Number(e.target.value) || 0)} className={inp} />
                <span className={lbl}>mm</span>
              </label>
            </div>
            <div className="text-[11px] font-mono mb-3 leading-relaxed">
              <span className="text-slate-500">
                OH {machineCheck.OH}｜ストローク {machineCheck.m.stroke}｜ダイ高 {machineCheck.dieH.toFixed(1)}
                ｜パンチ組立高 {machineCheck.punchH.toFixed(1)}｜上死点すき間 {machineCheck.gapTDC.toFixed(1)}
                ｜部品張出し {machineCheck.partRise.toFixed(1)}
              </span>
              <br />
              <span className={machineCheck.closeMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {machineCheck.closeMargin >= 0
                  ? `✓ 曲げ切り可（余裕 ${machineCheck.closeMargin.toFixed(1)}mm）`
                  : `✗ ストローク不足：曲げ切れません（${(-machineCheck.closeMargin).toFixed(1)}mm不足）`}
              </span>
              {'　'}
              <span className={machineCheck.loadMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {machineCheck.loadMargin >= 0
                  ? `✓ 部品の出し入れ可（余裕 ${machineCheck.loadMargin.toFixed(1)}mm）`
                  : `✗ 上死点でも部品が抜けません（${(-machineCheck.loadMargin).toFixed(1)}mm干渉）`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
              <label className="flex items-center gap-1.5">
                <span className={lbl}>ダイ</span>
                <select value={dieSel} onChange={(e) => setDieSel(e.target.value)} className={sel}>
                  <option value="v12stack">実機 V12 段付きスタック（bending.dxf）</option>
                  <optgroup label="Vダイ（単体）">
                    {Object.entries(DIE_LIB).filter(([, d]) => d.kind === 'v').map(([id, d]) => (
                      <option key={id} value={`lib:${id}:0`}>{id}　{d.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="2溝ダイ（溝を選択）">
                    {Object.entries(DIE_LIB).filter(([, d]) => d.kind === 'v2').flatMap(([id, d]) =>
                      d.grooves.map((g, gi) => (
                        <option key={`${id}-${gi}`} value={`lib:${id}:${gi}`}>{id}　V{(g[1] * 2).toFixed(0)}溝</option>
                      ))
                    )}
                  </optgroup>
                  <optgroup label="Vインサート">
                    {Object.entries(DIE_LIB).filter(([, d]) => d.kind === 'ins').flatMap(([id, d]) => [
                      <option key={`${id}-st`} value={`ins:${id}:stack`}>{id}　{d.name}＋スタック</option>,
                      <option key={`${id}-so`} value={`ins:${id}:solo`}>{id}　{d.name}（単体）</option>,
                    ])}
                  </optgroup>
                  <optgroup label="特殊ダイ">
                    {Object.entries(DIE_LIB).filter(([, d]) => d.kind === 'u' || d.kind === 'manual').map(([id, d]) => (
                      <option key={id} value={`lib:${id}:0`}>{id}　{d.name}</option>
                    ))}
                  </optgroup>
                  <option value="flat">汎用フラット（手動V幅）</option>
                </select>
              </label>
              {(dieSel === 'flat' || dieInfo.manual) && (
                <>
                  <label className="flex items-center gap-1.5">
                    <span className={lbl}>V幅</span>
                    <input type="number" step={1} min={4} max={25} value={vW}
                      onChange={(e) => setVW(Number(e.target.value) || 12)} className={inp} />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className={lbl}>ダイ半幅</span>
                    <input type="number" step={1} min={8} max={60} value={dieHalf}
                      onChange={(e) => setDieHalf(Number(e.target.value) || 30)} className={inp} />
                  </label>
                </>
              )}
              <label className="flex items-center gap-1.5">
                <span className={lbl}>パンチ</span>
                <select value={punchType} onChange={(e) => setPunchType(e.target.value)} className={sel}>
                  {Object.keys(PUNCH_LIB).map((id) => (
                    <option key={id} value={id}>ヤゲン {id}{id === '00300' ? '（先端R6）' : ''}</option>
                  ))}
                  <option value="straight">ストレート（汎用）</option>
                </select>
              </label>
              {punchType !== 'straight' && (
                <label className="flex items-center gap-1.5">
                  <span className={lbl}>中間板</span>
                  <select value={chukanSel} onChange={(e) => setChukanSel(e.target.value)} className={sel}>
                    <option value="std">標準（122.7×78.3・タング付）</option>
                    <option value="50001">50001（左右対称・スロット深32）</option>
                  </select>
                </label>
              )}
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={punchFlip} onChange={(e) => setPunchFlip(e.target.checked)} />
                向き反転
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} />
                ガイド線（曲げ開始位置）
              </label>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mb-4 leading-relaxed">
              {`ダイ: ${dieInfo.note}｜V半幅 ${vHalf.toFixed(2)}（キネマティクス支点）`}
              <br />
              {punchType !== 'straight'
                ? (() => {
                    const pts = PUNCH_LIB[punchType].pts;
                    const ys = pts.map((p) => p[1]); const xs = pts.map((p) => p[0]);
                    const ckLabel = chukanSel === 'std' ? '標準122.7×78.3' : '50001（対称・スロット深32）';
                    return `ヤゲン ${punchType}: 全高${(-Math.min(...ys)).toFixed(1)}・全幅${(Math.max(...xs) - Math.min(...xs)).toFixed(1)}（DXF実測）｜中間板${ckLabel} 自動取付・一体昇降`;
                  })()
                : 'パンチ: ストレート（汎用・先端86°）'}
            </div>

            <h2 className="text-sm font-bold text-slate-100 mb-2">自動チェック（曲がるか判定）</h2>
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                onClick={() => {
                  const r = searchSequences(part, vHalf, diePolys, punchType, punchFlip, chukanSel, 6);
                  setSeqResults(r); setToolResults(null);
                }}
                className="px-3 py-1 text-xs rounded bg-emerald-700 hover:bg-emerald-600 text-white">
                この金型で曲げ順を自動探索
              </button>
              <button
                onClick={() => {
                  const r = searchTools(part, vW, dieHalf, chukanSel, 8);
                  setToolResults(r); setSeqResults(null);
                }}
                className="px-3 py-1 text-xs rounded bg-sky-700 hover:bg-sky-600 text-white">
                金型も含めて総当り探索
              </button>
            </div>
            {seqResults && (
              <div className="mb-3 text-xs">
                {seqResults.sols.length === 0 ? (
                  <span className="text-red-400">この金型では全曲げ順・全姿勢で干渉します（{seqResults.tried}通り検査）。金型総当りを試してください。</span>
                ) : (
                  <>
                    <span className="text-emerald-400">曲げ可能な段取り {seqResults.sols.length}件（クリックで適用）:</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {seqResults.sols.map((sol, i) => (
                        <button key={i}
                          onClick={() => { setSeq(sol); setStep(0); setProg(1); }}
                          className="px-2 py-0.5 rounded border border-emerald-700 text-emerald-300 hover:bg-emerald-900 font-mono">
                          {sol.map((st) => `${st.bend + 1}${st.valley ? '裏' : ''}${st.mirror ? '⇄' : ''}`).join('→')}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {toolResults && (
              <div className="mb-3 text-xs">
                {toolResults.found.length === 0 ? (
                  <span className="text-red-400">候補ダイ{toolResults.diesTried}種×ヤゲン全種で可行解なし。板形状か曲げ角を見直してください。</span>
                ) : (
                  <>
                    <span className="text-sky-300">曲げ可能な金型組合せ（クリックで適用）:</span>
                    <div className="flex flex-col gap-1 mt-1">
                      {toolResults.found.map((r, i) => (
                        <button key={i}
                          onClick={() => {
                            setDieSel(r.dieSel); setPunchType(r.punch); setPunchFlip(r.flip);
                            setSeq(r.seq); setStep(0); setProg(1);
                          }}
                          className="text-left px-2 py-1 rounded border border-sky-800 text-sky-200 hover:bg-sky-950 font-mono">
                          ヤゲン{r.punch}{r.flip ? '（反転）' : ''} ＋ {r.dieLabel}｜順:
                          {r.seq.map((st) => ` ${st.bend + 1}${st.valley ? '裏' : ''}${st.mirror ? '⇄' : ''}`).join(' →')}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <h2 className="text-sm font-bold text-slate-100 mb-2">加工手順（工程ごとのセット向き）</h2>
            <div className="space-y-1.5">
              {seq.map((s, i) => (
                <div key={i} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-2 py-1.5 border ${
                  step === i ? 'border-sky-700 bg-sky-950/30' : 'border-slate-800'}`}>
                  <span className="text-xs font-mono text-slate-400 w-12">工程{i + 1}</span>
                  <select value={s.bend} onChange={(e) => setStepConf(i, { bend: Number(e.target.value) })} className={sel}>
                    {bends.map((_, bi) => (
                      <option key={bi} value={bi}>曲げ{bi + 1}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-slate-400">
                    <input type="checkbox" checked={s.mirror}
                      onChange={(e) => setStepConf(i, { mirror: e.target.checked })} />
                    左右反転
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-400">
                    <input type="checkbox" checked={s.valley}
                      onChange={(e) => setStepConf(i, { valley: e.target.checked })} />
                    山谷反転（裏返し）
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* モデルの前提 */}
        <div className="mt-3 text-xs text-slate-500 bg-slate-900/60 border border-slate-800 rounded-md p-3 leading-relaxed">
          金型輪郭は bending.dxf／ヤゲン.dxf／金型.dxf のベクタ座標をそのまま採用（ヤゲン11本・ダイ23個）。
          00300のみ先端R6を12分割近似、他は図面どおり全直線。中間板は全ヤゲンに自動取付、Vインサートは
          単体／スタック取付を選択可。特殊ダイ（凸・段曲げ・フラット）はV支点を手動V幅で近似します。
          干渉判定はヤゲン・中間板・ダイ（スタック含む）の全てに対して行います。
          板は中立軸で表現し、展開寸法（図面値 30 / 16.3 / 40、展開長86.3）で入力します。
          エアベンディングの肩支点近似で内Rとスプリングバックは無視、曲げ角度は90°まで。
          判定は全ストロークを走査し、板厚の半分（余裕0.05mm）を超えて侵入した点を干渉として橙色で
          表示します（正規接触部は板に沿った長さ＝弧長で除外。V肩に届かないフランジは「フランジ不足」
          として別途判定）。曲げ済みの辺は片伸び相当ぶん伸びるものとして扱います（伸び値は暫定的に
          K係数式から近似。上型ホルダ・実測ダイ台・Z曲げ段差の実績値は未移植 — 詳細は
          <code>棚卸し_jsx移植と多曲げ設計_20260909.md</code> を参照）。
        </div>
      </div>
    </div>
  );
};

export default BendingSimulator;
