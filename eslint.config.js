import { fixupConfigRules, fixupPluginRules } from '@eslint/compat';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import security from 'eslint-plugin-security';
import jsdoc from 'eslint-plugin-jsdoc';
import _import from 'eslint-plugin-import';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import pluginCompat from 'eslint-plugin-compat';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  unicorn.configs.recommended,
  {
    ignores: [
      'demo/**',
      '**/eslint.config.js',
      '**/dist',
      '**/node_modules',
      '**/ably-common',
      '**/typedoc',
      'scripts/cdn_deploy.js',
      '**/vitest.config.ts',
      '**/vite.config.ts',
      '**/vitest.workspace.ts',
      'test/helper/test-setup.ts',
      '**/__mocks__',
      '**/coverage/',
    ],
  },
  ...fixupConfigRules(
    compat.extends(
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended-type-checked',
      'plugin:@typescript-eslint/strict-type-checked',
      'plugin:@typescript-eslint/stylistic-type-checked',
      'plugin:security/recommended-legacy',
      'plugin:import/recommended',
      'plugin:compat/recommended',
      'plugin:node/recommended',
    ),
  ),
  {
    plugins: {
      '@typescript-eslint': fixupPluginRules(typescriptEslint),
      security: fixupPluginRules(security),
      jsdoc,
      import: fixupPluginRules(_import),
      'simple-import-sort': simpleImportSort,
      pluginCompat: fixupPluginRules(pluginCompat),
    },

    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },

      parser: tsParser,
      ecmaVersion: 5,
      sourceType: 'module',

      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },

    settings: {
      jsdoc: {
        tagNamePreference: {
          default: 'defaultValue',
        },
      },
    },

    rules: {
      'eol-last': 'error',
      'security/detect-object-injection': 'off',
      'no-redeclare': 'off',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unicorn/filename-case': 'error',
      'node/no-missing-import': 'off',

      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'memberLike',
          format: ['camelCase'],
          modifiers: ['private'],
          leadingUnderscore: 'require',
        },
        {
          selector: 'enumMember',
          format: ['PascalCase'],
        },
        {
          selector: 'memberLike',
          format: ['camelCase'],
          modifiers: ['public', 'protected'],
          leadingUnderscore: 'forbid',
        },
        {
          selector: 'objectLiteralProperty',

          filter: {
            regex: '(ably-|-ably-|chat-|-chat-)',
            match: true,
          },

          format: null,
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],

    rules: {
      '@typescript-eslint/no-unused-vars': ['error'],
      'import/no-unresolved': 'off',
      'no-undef': 'off',
      'no-dupe-class-members': 'off',
      'require-await': 'off',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/numeric-separators-style': 'off',
      'unicorn/prefer-event-target': 'off',
      'unicorn/no-static-only-class': 'off',
      'unicorn/no-nested-ternary': 'off',

      '@typescript-eslint/no-extraneous-class': [
        'error',
        {
          allowStaticOnly: true,
        },
      ],

      'import/extensions': [
        'error',
        'always',
        {
          ignorePackages: true,
        },
      ],
    },
  },
  {
    files: ['test/**/*.{ts,tsx}'],

    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'unicorn/no-null': 'off',
      'unicorn/consistent-function-scoping': 'off',
      'unicorn/prefer-ternary': 'off',
    },
  },
  ...fixupConfigRules(compat.extends('plugin:react/recommended', 'plugin:react-hooks/recommended')).map((config) => ({
    ...config,
    files: ['src/react/**/*.{ts,tsx}'],
  })),
  {
    files: ['src/react/**/*.{ts,tsx}'],

    plugins: {
      react: fixupPluginRules(react),
      'react-hooks': fixupPluginRules(reactHooks),
    },

    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',

      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },

    settings: {
      react: {
        version: 'detect',
      },
    },
  },
];
