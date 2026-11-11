import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

const typeChecked = {
  parserOptions: {
    projectService: true,
    tsconfigRootDir: import.meta.dirname
  }
};

// ADR 0003. Findings that predate the linter live in eslint-suppressions.json.
export default defineConfig(
  // The Supabase CLI writes this file, so a hand fix would vanish on the next run. See ADR 0004.
  { ignores: ['src/lib/database.types.ts'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite
    ],
    languageOptions: {
      globals: globals.browser,
      ...typeChecked
    },
    rules: {
      // Bulk suppressions record errors only, and verify fails on warnings anyway.
      'react-hooks/exhaustive-deps': 'error'
    }
  },
  {
    files: ['api/**/*.ts', 'scripts/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      ...typeChecked
    }
  }
);
