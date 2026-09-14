import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/** eslint-config-next 16 ships flat configs directly, so no FlatCompat bridge is needed. */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/sw.js'],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
