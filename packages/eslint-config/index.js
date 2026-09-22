import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const environments = {
  browser: { ...globals.browser, ...globals.webextensions },
  node: globals.node,
};

export function translatorConfig({ environment }) {
  const selectedGlobals = environments[environment];
  if (!selectedGlobals) {
    throw new Error(`Unsupported ESLint environment: ${environment}`);
  }

  return [
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
      ignores: ["dist/**", ".output/**", ".wxt/**", "coverage/**"],
    },
    {
      languageOptions: {
        globals: selectedGlobals,
      },
      rules: {
        "@typescript-eslint/consistent-type-imports": "error",
      },
    },
  ];
}
