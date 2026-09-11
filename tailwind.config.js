/**
 * Das Farbsystem der Website (daisyUI "light"/"dark") als NativeWind-Tokens.
 *
 * daisyUI selbst ist ein CSS-Plugin und läuft in React Native nicht — es gibt
 * keine CSS-Engine, die `@layer components`, Pseudo-Klassen oder seine
 * Komponenten-Klassen auflösen könnte. Übernommen werden deshalb nur die
 * Farbnamen: `bg-base-200`, `text-base-content` usw. heißen hier genauso wie im
 * Web, damit der Port der Templates eine Umbenennung der Tags bleibt und keine
 * Neuerfindung der Palette. Die Komponenten (card, btn, badge …) liegen in
 * src/components/ui/.
 *
 * Die Werte kommen aus global.css als CSS-Variablen, damit Hell/Dunkel dem
 * Systemschema folgt — dasselbe Verhalten wie daisyUI mit prefers-color-scheme.
 */
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        "base-100": withAlpha("--color-base-100"),
        "base-200": withAlpha("--color-base-200"),
        "base-300": withAlpha("--color-base-300"),
        "base-content": withAlpha("--color-base-content"),
        "base-muted": withAlpha("--color-base-muted"),
        primary: withAlpha("--color-primary"),
        "primary-content": withAlpha("--color-primary-content"),
        secondary: withAlpha("--color-secondary"),
        accent: withAlpha("--color-accent"),
        neutral: withAlpha("--color-neutral"),
        info: withAlpha("--color-info"),
        success: withAlpha("--color-success"),
        warning: withAlpha("--color-warning"),
        error: withAlpha("--color-error"),
        // Die Podiumsfarben des Power Rankings.
        gold: withAlpha("--color-gold"),
        silver: withAlpha("--color-silver"),
        bronze: withAlpha("--color-bronze"),
      },
    },
  },
  plugins: [],
};
