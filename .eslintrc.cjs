module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
    browser: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    project: ['./tsconfig.json'],
  },
  plugins: ['@typescript-eslint', 'security', 'jsdoc', 'import', 'simple-import-sort', 'compat', 'unicorn'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:@typescript-eslint/strict-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked',
    'plugin:security/recommended-legacy',
    'plugin:import/recommended',
    'plugin:compat/recommended',
    'plugin:unicorn/recommended',
  ],
  rules: {
    'eol-last': 'error',
    // security/detect-object-injection just gives a lot of false positives
    // see https://github.com/nodesecurity/eslint-plugin-security/issues/21
    'security/detect-object-injection': 'off',
    // the code problem checked by this ESLint rule is automatically checked by the TypeScript compiler
    'no-redeclare': 'off',
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    'unicorn/filename-case': 'error',
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
        filter: { regex: '(ably-|-ably-|chat-|-chat-)', match: true },
        format: null,
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-unused-vars': ['error'],
        'import/no-unresolved': 'off',
        // TypeScript already enforces these rules better than any eslint setup can
        'no-undef': 'off',
        'no-dupe-class-members': 'off',
        'require-await': 'off',
        'unicorn/prevent-abbreviations': 'off',
        'unicorn/numeric-separators-style': 'off',
        // We have EventEmitter from ably-js, so we can't enforce this rule
        'unicorn/prefer-event-target': 'off',
        // We've explicitly decided to do this for room options
        'unicorn/no-static-only-class': 'off',
        // Clashes with prettier - so must be turned off
        'unicorn/no-nested-ternary': 'off',
        '@typescript-eslint/no-extraneous-class': [
          'error',
          {
            allowStaticOnly: true,
          },
        ],
        // see:
        // https://github.com/ably/spaces/issues/76
        // https://github.com/microsoft/TypeScript/issues/16577#issuecomment-703190339
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
        // ably-js returns null for channel attach, so we can't enforce this rule in tests
        'unicorn/no-null': 'off',
        'unicorn/consistent-function-scoping': 'off',
        'unicorn/prefer-ternary': 'off',
      },
    },
    // For everything React, use additional rules and plugins
    {
      files: ['src/react/**/*.{ts,tsx}'],
      extends: ['plugin:react/recommended', 'plugin:react-hooks/recommended'],
      plugins: ['react', 'react-hooks'],
      settings: {
        react: {
          version: 'detect',
        },
      },
    },
  ],
  ignorePatterns: [
    '.eslintrc.cjs',
    'dist',
    'node_modules',
    'ably-common',
    'typedoc',
    'scripts/cdn_deploy.js',
    'vitest.config.ts',
    'vite.config.ts',
    'vitest.workspace.ts',
    'test/helper/test-setup.ts',
    '__mocks__',
    'coverage/',
  ],
  settings: {
    jsdoc: {
      tagNamePreference: {
        default: 'defaultValue',
      },
    },
  },
};
