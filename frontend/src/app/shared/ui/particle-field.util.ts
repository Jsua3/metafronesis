export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

export interface ParticleBounds {
  width: number;
  height: number;
}

export interface ParticlePointer {
  x: number;
  y: number;
}

/** Las velocidades están calibradas a un cuadro de 60 fps. */
export const REFERENCE_FRAME_MS = 1000 / 60;
/** Tope del delta: al volver de segundo plano las partículas no saltan. */
export const MAX_FRAME_MS = 50;

const POINTER_RADIUS = 120;
const POINTER_FORCE = 0.04;
const DAMPING_PER_FRAME = 0.995;

/** Cuántos cuadros de referencia representa `deltaMs`. */
export function frameScale(deltaMs: number): number {
  return Math.min(Math.max(deltaMs, 0), MAX_FRAME_MS) / REFERENCE_FRAME_MS;
}

/** Avanza el campo de partículas `scale` cuadros de referencia (muta en el sitio). */
export function stepParticles(
  particles: Particle[],
  scale: number,
  bounds: ParticleBounds,
  pointer: ParticlePointer | null,
): void {
  const damping = Math.pow(DAMPING_PER_FRAME, scale);
  for (const particle of particles) {
    particle.x += particle.vx * scale;
    particle.y += particle.vy * scale;

    if (particle.x < 0 || particle.x > bounds.width) {
      particle.vx *= -1;
    }
    if (particle.y < 0 || particle.y > bounds.height) {
      particle.vy *= -1;
    }

    if (pointer) {
      const dx = particle.x - pointer.x;
      const dy = particle.y - pointer.y;
      const dist = Math.hypot(dx, dy);
      if (dist < POINTER_RADIUS && dist > 0) {
        const force = (POINTER_RADIUS - dist) / POINTER_RADIUS;
        particle.vx += (dx / dist) * force * POINTER_FORCE * scale;
        particle.vy += (dy / dist) * force * POINTER_FORCE * scale;
      }
    }

    particle.vx *= damping;
    particle.vy *= damping;
  }
}
