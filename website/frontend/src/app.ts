import { createApp, h, DefineComponent } from "vue";
import { createInertiaApp, Link } from "@inertiajs/vue3";
import DefaultLayout from "./layouts/Default.vue";
import { registerServiceWorker } from "./pwa";
import { watchForNewVersion } from "./appUpdate";
import "./assets/css/app.css";

createInertiaApp({
  resolve: (name: string) => {
    const pages = import.meta.glob<DefineComponent>("./pages/**/*.vue", {
      eager: true,
    });
    const page = pages[`./pages/${name}.vue`];
    if (!page) throw new Error(`Inertia page not found: ${name}`);
    page.default.layout ??= DefaultLayout;
    return page;
  },
  setup({ el, App, props, plugin }) {
    createApp({ render: () => h(App, props) })
      .use(plugin)
      .component("Link", Link)
      .mount(el);
  },
  progress: {
    color: "#4f46e5",
  },
});

registerServiceWorker();
watchForNewVersion();
