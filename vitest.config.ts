import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
	plugins: [svelte({ hot: false })],
	ssr: {
		// Zod 4 is ESM-only ("type":"module") but some environments pick up
		// the CJS stub before exports are ready. Force Vite to bundle it so
		// `z` is always fully initialised when test modules import it.
		noExternal: ['zod']
	},
	test: {
		environment: 'node',
		include: ['src/**/__tests__/**/*.test.ts']
	},
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, 'src/lib')
		}
	}
});
