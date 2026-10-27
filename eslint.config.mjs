const nodeGlobals = {
  console: "readonly",
  process: "readonly",
  Buffer: "readonly",
  require: "readonly",
  module: "readonly",
  exports: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  global: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly"
};

const mochaGlobals = {
  describe: "readonly",
  it: "readonly",
  before: "readonly",
  after: "readonly",
  beforeEach: "readonly",
  afterEach: "readonly",
  context: "readonly",
  specify: "readonly",
  xdescribe: "readonly",
  xit: "readonly",
  suite: "readonly",
  test: "readonly",
  setup: "readonly",
  teardown: "readonly"
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/coverage/**",
      "**/junit.xml",
      "**/*.min.js",
      ".ai-ready/**"
    ]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...nodeGlobals,
        ...mochaGlobals
      }
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
  }
];
