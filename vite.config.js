import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages はプロジェクトページのため /<リポジトリ名>/ 配下で配信される。
// ビルド時のみ base を付与し、ローカル dev（/）はそのまま維持する。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/bending-simulation/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: false,
  },
}));
