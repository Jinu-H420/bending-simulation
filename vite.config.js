import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages はプロジェクトページのため /<リポジトリ名>/ 配下で配信される。
// ビルド時のみ base を付与し、ローカル dev（/）はそのまま維持する。
// 配布用の単体HTML（build:single）はシミュレーター1枚だけ。通常のビルドは、かんたん判定ページも作る。
const single = process.argv.some((a) => a.includes('dist-single'));

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/bending-simulation/' : '/',
  build: single ? {} : { rollupOptions: { input: { main: 'index.html', check: 'check.html' } } },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: false,
  },
}));
