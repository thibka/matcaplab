import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
    globalIgnores(['dist']),
    {
        files: ['**/*.{js,ts}'],
        extends: [js.configs.recommended, tseslint.configs.recommended, prettier],
        languageOptions: {
            globals: globals.browser,
        },
    },
    {
        files: ['*.config.{js,ts}'],
        languageOptions: {
            globals: globals.node,
        },
    },
]);
