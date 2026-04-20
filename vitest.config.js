import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.{js,jsx}',
      'functions/**/*.test.{js,mjs}',
      'scripts/**/*.test.mjs',
    ],
    environment: 'node',
    globals: false,
  },
})
