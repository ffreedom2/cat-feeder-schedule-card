import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
    lib: {
      entry: 'src/cat-feeder-schedule-card.ts',
      name: 'CatFeederScheduleCard',
      formats: ['es'],
      fileName: () => 'cat-feeder-schedule-card.js'
    }
  }
})
