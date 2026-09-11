import type { Config } from "tailwindcss";
import daisyui from "daisyui";

export default <Partial<Config>>{
  content: [
    "./src/**/*.{vue,js,ts}",
  ],
  theme: {
    extend: {},
  },
  plugins: [daisyui],
  daisyui: {
    themes: ["light", "dark"],
  },
};
