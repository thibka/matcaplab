import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    build: {
        rolldownOptions: {
            output: {
                codeSplitting: {
                    // three.js core in its own chunk: it rarely changes, so browsers keep it cached across app updates.
                    // Only build/ is matched so the examples loaders stay in their lazy-loaded chunks.
                    groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]build[\\/]/ }],
                },
            },
        },
        // The three.js chunk alone is ~600 KB minified and cannot be split further.
        chunkSizeWarningLimit: 700,
    },
});
