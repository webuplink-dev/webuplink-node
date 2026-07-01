import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // The published SDK is fully self-contained with zero dependencies.
  // Target matches the SDK's engines field (Node 18+)
  target: 'node18',
});
