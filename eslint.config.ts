import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
//import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import path from "node:path";

const root = import.meta.dirname;

export default defineConfig(
  // --- ignore patterns ---
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/*.gen.ts"],
  },

  // --- base: all TS/JS files ---
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        // Disambiguates the root tsconfig when multiple are present in the repo
        tsconfigRootDir: root,
        project: ["./**/tsconfig*.json"],
      },
    },
    plugins: { prettier },
    rules: {
      "prettier/prettier": "error",

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },

  // --- frontend: override tsconfig root to the package ---
  {
    files: ["packages/frontend/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: path.join(root, "packages/frontend"),
      },
    },
    plugins: {
      react,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      react: { version: "19" },
    },
    rules: {
      ...react.configs.recommended.rules,
      // ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },

  // --- backend services ---
  {
    files: [
      "packages/api/**/*.ts",
      "packages/importer/**/*.ts",
      "packages/processor/**/*.ts",
      "packages/sequencer/**/*.ts",
      "packages/shared/**/*.ts",
      "packages/storage/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
