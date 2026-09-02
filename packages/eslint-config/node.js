import base from "./index.js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  ...base,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // Express augmenta Request con `declare global { namespace Express ... }`
      "@typescript-eslint/no-namespace": "off",
      // Código legacy del api con `any` tipado — revisar a futuro
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
