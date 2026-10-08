<script setup lang="ts">
// A celebration over the whole page: a canvas that takes no clicks, mounted once at the app root.
// It draws only while particles are alive, so an idle page costs nothing.
import { onBeforeUnmount, ref, watch } from "vue";
import { confettiRequest } from "../composables/useConfetti";
import { useKonamiCode } from "../composables/useKonamiCode";
import { drawParticles } from "../utils/confettiDraw";
import { mergeShows, spawnConfettiShow, stepParticles, type Particle } from "../utils/confettiParticles";

const canvas = ref<HTMLCanvasElement | null>(null);
const MAX_FRAME_SECONDS = 0.05;
const MS_PER_SECOND = 1000;

// Someone who asked the OS for less motion gets no celebration; it is nothing but motion.
const prefersReducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let particles: Particle[] = [];
let frame: number | null = null;
let lastTime = 0;

function fitCanvas(element: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ratio = window.devicePixelRatio || 1;
  element.width = Math.floor(window.innerWidth * ratio);
  element.height = Math.floor(window.innerHeight * ratio);
  const ctx = element.getContext("2d");
  ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

function tick(time: number): void {
  const element = canvas.value;
  const ctx = element === null ? null : element.getContext("2d");
  if (element === null || ctx === null) return stop();
  const seconds = Math.min(MAX_FRAME_SECONDS, (time - lastTime) / MS_PER_SECOND);
  lastTime = time;
  particles = stepParticles(particles, seconds, Math.random);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  drawParticles(ctx, particles);
  if (particles.length === 0) return stop();
  frame = requestAnimationFrame(tick);
}

function stop(): void {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  particles = [];
}

function start(): void {
  if (frame !== null || canvas.value === null) return;
  fitCanvas(canvas.value);
  lastTime = performance.now();
  frame = requestAnimationFrame(tick);
}

watch(confettiRequest, (request) => {
  if (request === null || prefersReducedMotion) return;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  particles = mergeShows(
    particles,
    request.styles.flatMap((style) => spawnConfettiShow(style, viewport, Math.random)),
  );
  start();
});

useKonamiCode();
onBeforeUnmount(stop);
</script>

<template>
  <canvas ref="canvas" class="pointer-events-none fixed inset-0 z-[10000] h-full w-full" aria-hidden="true" data-testid="confetti-overlay" />
</template>
