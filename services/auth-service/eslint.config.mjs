import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["coverage/**", "node_modules/**", "junit.xml"]
  },
  {
    files: ["src/**/*.js", "test/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.mocha
      }
    },
    rules: {
      ...js.configs.recommended.rules
    }
  },
  {
    files: ["test/performance/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        __ENV: "readonly",
        __VU: "readonly",
        __ITER: "readonly",
        __TEST_RUN_ID: "readonly"
      }
    }
  }
];
