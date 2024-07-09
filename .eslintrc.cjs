module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
    browser: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    project: ['./tsconfig.json', './tsconfig.test.json']
  },
  plugins: ['@typescript-eslint', 'security', 'jsdoc', 'import', 'simple-import-sort'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:@typescript-eslint/strict-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked',
    'plugin:security/recommended-legacy',
    'plugin:import/recommended'
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
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'typeLike',
        format: ['PascalCase']
      },
      {
        selector: 'memberLike',
        format: ['camelCase'],
        modifiers: ['private'],
        leadingUnderscore: 'require'
      },
      {
        selector: 'enumMember',
        format: ['PascalCase']
      },
      {
        selector: 'memberLike',
        format: ['camelCase'],
        modifiers: ['public', 'protected'],
        leadingUnderscore: 'forbid'
      },
      {
        selector: 'objectLiteralProperty',
        filter: { regex: '(ably-|-ably-|chat-|-chat-)', match: true },
        format: null
      },
    ]
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
            ignorePackages: true
          }
        ]
      }
    },
    {
      files: ['test/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-empty-function': 'off'
      }
    }
  ],
  ignorePatterns: [
    '.eslintrc.cjs',
    'dist',
    'node_modules',
    'ably-common',
    'typedoc',
    'src/utils',
    'test/utils',
    'scripts/cdn_deploy.js',
    'vitest.config.ts',
    'vite.config.ts',
    'test/helper/testSetup.ts',
    '__mocks__'
  ],
  settings: {
    jsdoc: {
      tagNamePreference: {
        default: 'defaultValue'
      }
    }
  }
};
