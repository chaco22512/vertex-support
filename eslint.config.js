import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.wrangler/**', '**/node_modules/**', 'data/**', 'assets/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.config.{js,ts}', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
