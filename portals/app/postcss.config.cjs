/**
 * Tailwind v4 runs as a PostCSS plugin. There is deliberately no
 * `tailwind.config.*`: v4 is configured in CSS via `@theme`, and the design
 * system owns that configuration - a config file here would be a second source
 * for tokens the DS already defines.
 *
 * @type {import('postcss').ProcessOptions}
 */
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};
