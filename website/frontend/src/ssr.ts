import { createSSRApp, h, DefineComponent } from "vue";
import { createInertiaApp, Link } from "@inertiajs/vue3";
import { renderToString } from "@vue/server-renderer";
import createServer from "@inertiajs/vue3/server";
import DefaultLayout from "./layouts/Default.vue";
import "./assets/css/app.css";

createServer((page) =>
  createInertiaApp({
    page,
    render: renderToString,
    resolve: (name: string) => {
      const pages = import.meta.glob<DefineComponent>("./pages/**/*.vue", {
        eager: true,
      });
      const component = pages[`./pages/${name}.vue`];
      if (!component) throw new Error(`Inertia page not found: ${name}`);
      component.default.layout ??= DefaultLayout;
      return component;
    },
    setup({ App, props, plugin }) {
      return createSSRApp({ render: () => h(App, props) })
        .use(plugin)
        .component("Link", Link);
    },
  })
);
