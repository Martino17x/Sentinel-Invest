import js from "@eslint/js";

export default [
  {
    ignores: ["dist/**", "node_modules/**", ".astro/**", ".turbo/**", "coverage/**"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
];
