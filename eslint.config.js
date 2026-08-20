/**
 * The Power of 10, applied to the browser code.
 *
 * R1 (simple control flow), R4 (60 lines per function) and R6 (smallest
 * scope) are enforceable here; the rest is review. Vendored files are
 * excluded — they are third-party builds, not our code.
 */
const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  console: "readonly",
  fetch: "readonly",
  Promise: "readonly",
  Math: "readonly",
  Object: "readonly",
  Array: "readonly",
  Date: "readonly",
  JSON: "readonly",
  Error: "readonly",
  Blob: "readonly",
  File: "readonly",
  FormData: "readonly",
  DataTransfer: "readonly",
  Uint8Array: "readonly",
  URL: "readonly",
  Event: "readonly",
  CustomEvent: "readonly",
  CameraKit: "readonly",
  FaceKit: "readonly",
};

const rules = {
  "no-undef": "error",
  "no-unused-vars": "error",
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-console": ["error", { allow: ["warn", "error"] }],
  eqeqeq: "error",
  complexity: ["error", 8],
  "max-depth": ["error", 3],
  "max-lines-per-function": ["error", { max: 60, skipComments: true, skipBlankLines: true }],
  "max-params": ["error", 5],
  "no-param-reassign": "error",
  "prefer-const": "off",
  "no-var": "off",
};

module.exports = [
  {
    // Vendored builds (opencv.js, jsPDF) are third-party artefacts, not our
    // code: linting them says nothing about this package.
    ignores: [
      "django_camera_kit/static/django_camera_kit/vendor/**",
      "django_camera_kit/kyc/static/django_camera_kit/kyc/vendor/**",
      "node_modules/**",
      "site/**",
      ".venv/**",
    ],
  },
  {
    files: ["django_camera_kit/**/*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: browserGlobals,
    },
    rules: rules,
  },
  {
    files: ["eslint.config.js"],
    languageOptions: { sourceType: "commonjs", globals: { module: "writable" } },
    rules: { "no-undef": "error" },
  },
  {
    files: ["tests_js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "writable",
        Set: "readonly",
        __dirname: "readonly",
        console: "readonly",
        Math: "readonly",
        Object: "readonly",
        Array: "readonly",
        JSON: "readonly",
        Promise: "readonly",
      },
    },
    rules: Object.assign({}, rules, { "max-lines-per-function": "off" }),
  },
];
