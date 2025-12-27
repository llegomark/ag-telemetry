import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default defineConfig([
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    // Test file specific configuration
    {
        files: ["src/test/**/*.ts"],
        languageOptions: {
            globals: {
                ...globals.mocha,
            },
        },
        rules: {
            // Chai assertions like expect().to.be.true are expressions, not statements
            "@typescript-eslint/no-unused-expressions": "off",
            "no-unused-expressions": "off",
        },
    },
    {
        ignores: ["out/", "node_modules/"],
    },
]);
