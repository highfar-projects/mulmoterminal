// Painting a frame of confetti. Kept apart from the physics so that file runs without a canvas.
import { alphaOf, type Particle, type ParticleShape } from "./confettiParticles";

const FLUTTER_RATE = 9;
const BALLOON_STRING_LENGTH = 1.9;

function drawPaper(ctx: CanvasRenderingContext2D, particle: Particle): void {
  // Paper tumbling edge-on: the height collapses and returns as the piece turns over.
  const flutter = Math.abs(Math.cos(particle.age * FLUTTER_RATE + particle.swayPhase));
  ctx.fillRect(-particle.size / 2, (-particle.size * flutter) / 4, particle.size, (particle.size * flutter) / 2 + 1);
}

function drawDot(ctx: CanvasRenderingContext2D, particle: Particle): void {
  ctx.beginPath();
  ctx.arc(0, 0, particle.size / 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawPetal(ctx: CanvasRenderingContext2D, particle: Particle): void {
  const half = particle.size / 2;
  ctx.beginPath();
  ctx.moveTo(-half, 0);
  ctx.quadraticCurveTo(0, -half, half, 0);
  ctx.quadraticCurveTo(0, half * 0.9, -half, 0);
  ctx.fill();
}

function drawSpark(ctx: CanvasRenderingContext2D, particle: Particle): void {
  ctx.shadowColor = particle.color;
  ctx.shadowBlur = particle.size * 3;
  ctx.beginPath();
  ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
  ctx.fill();
}

function drawRocket(ctx: CanvasRenderingContext2D, particle: Particle): void {
  const trail = 26;
  const gradient = ctx.createLinearGradient(0, 0, 0, trail);
  gradient.addColorStop(0, particle.color);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(-1.5, 0, 3, trail);
  ctx.fillStyle = "#fff6d6";
  ctx.beginPath();
  ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
  ctx.fill();
}

function drawBalloon(ctx: CanvasRenderingContext2D, particle: Particle): void {
  const radius = particle.size;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.8, radius, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-4, radius + 3);
  ctx.lineTo(4, radius + 3);
  ctx.lineTo(0, radius - 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, radius + 3);
  ctx.quadraticCurveTo(7, radius + radius * BALLOON_STRING_LENGTH * 0.5, -3, radius + radius * BALLOON_STRING_LENGTH);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.ellipse(-radius * 0.3, -radius * 0.35, radius * 0.18, radius * 0.3, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

const PAINT: Record<ParticleShape, (ctx: CanvasRenderingContext2D, particle: Particle) => void> = {
  paper: drawPaper,
  dot: drawDot,
  petal: drawPetal,
  spark: drawSpark,
  rocket: drawRocket,
  balloon: drawBalloon,
};

// A balloon stays upright and a rocket points where it is going; everything else turns as it falls.
const turns = (shape: ParticleShape): boolean => shape !== "balloon" && shape !== "rocket";

export function drawParticles(ctx: CanvasRenderingContext2D, particles: readonly Particle[]): void {
  particles
    .filter((particle) => particle.delay <= 0)
    .forEach((particle) => {
      ctx.save();
      ctx.globalAlpha = alphaOf(particle);
      ctx.fillStyle = particle.color;
      ctx.translate(particle.x, particle.y);
      if (turns(particle.shape)) ctx.rotate(particle.angle);
      PAINT[particle.shape](ctx, particle);
      ctx.restore();
    });
}
