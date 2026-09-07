import tseslint from "typescript-eslint";
export default tseslint.config(
  { ignores: [".next/**", "out/**", "node_modules/**", "public/sw.js"] },
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/no-unused-vars": "off", "@typescript-eslint/no-empty-object-type": "off" } },
);
