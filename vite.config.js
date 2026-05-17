import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Vercel(winfairy.vercel.app)은 루트 배포. GitHub Pages만 /WinFairy/ 서브경로.
  const base = process.env.VERCEL
    ? '/'
    : env.VITE_BASE_PATH || '/WinFairy/'
  return {
    plugins: [react()],
    base,
  }
})
