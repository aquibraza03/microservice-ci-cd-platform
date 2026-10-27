// NOTE: This repository uses ESLint 9 flat config (eslint.config.mjs).
// This file is kept for legacy tooling (ESLint < 9) and is ignored by
// the default ESLint 9 config lookup.
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    mocha: true
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "script"
  },
  rules: {
    semi: ["error", "always"],
    quotes: ["error", "double"],
    indent: ["error", 2],
    "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "no-constant-condition": ["error", { checkLoops: false }],
    "no-console": "off",
    "no-empty": ["error", { allowEmptyCatch: true }]
  }
};
