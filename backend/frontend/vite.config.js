import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
    server: {
        fs: {
            allow: [fileURLToPath(new URL('.', import.meta.url))]
        }
    },
    assetsInclude: ['**/*.wasm']
});
