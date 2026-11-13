import { defineConfig } from 'vitest/config';
import { API_BASE_URLS } from './build/buildModes.js';

export default defineConfig({
    define: { __API_BASE_URL__: JSON.stringify(API_BASE_URLS.development) }
});
