<script setup lang="ts">
import { Link } from "@inertiajs/vue3";
import logoUrl from "../../public/web-app-manifest-512x512.png";
import startggLogoUrl from "../../public/startgg-logo.svg";
import InstallPrompt from "../components/InstallPrompt.vue";
import PushBell from "../components/PushBell.vue";
import RankedDayIndicator from "../components/RankedDayIndicator.vue";
</script>

<template>
  <div class="relative min-h-screen bg-base-200 text-base-content">
    <div
      class="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-20"
      style="background-image: url('/characters/tt_background.webp')"
      aria-hidden="true"
    ></div>

    <div class="relative z-10 flex min-h-screen flex-col">
      <div class="navbar bg-base-100 shadow">
      <div class="flex-1">
        <Link href="/" class="btn btn-ghost gap-2 text-xl normal-case">
          <img :src="logoUrl" alt="" class="h-8 w-8 rounded" />
          Turner Tuesdays
        </Link>
      </div>
      <div class="flex-none items-center gap-3 flex pe-3">
        <PushBell />
        <Link href="/power-ranking" class="btn btn-ghost btn-sm">
          <span class="sm:hidden">PR</span>
          <span class="hidden sm:inline">Power Ranking</span>
        </Link>
        <a
          href="https://start.gg/whv"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn-ghost btn-sm btn-square"
          aria-label="start.gg"
          title="start.gg"
        >
          <img :src="startggLogoUrl" alt="start.gg" class="h-5 w-5" />
        </a>
      </div>
    </div>

      <div class="flex-1">
        <slot />
      </div>

      <!-- Both float bottom-right, inside this z-10 layer so the push error
           toast (z-50) stays above them. The install hint (z-40) covers the
           ranked day button (z-30) until it is dismissed. -->
      <RankedDayIndicator />
      <InstallPrompt />
    </div>
  </div>
</template>
