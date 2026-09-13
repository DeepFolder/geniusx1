import { useEffect, useMemo, useRef, useState } from "react";

// Blue stays the dominant hue (5 of 9 lines); the rest add variety
// (purple, teal, orange, pink) without overpowering it.
const PALETTE = [
  "#2E6FBF",
  "#5590D8",
  "#90C8F0",
  "#3B5FA0",
  "#4A80CC",
  "#8B5FBF",
  "#35B0A5",
  "#FF8040",
  "#E0507A",
];

const DEFAULT_SIZE = 44;
const NUM_LINES = 9;
const PTS = 8;

function noise(t: number, seed: number): number {
  const s = seed * 127.1;
  return (
    Math.sin(t * 0.97  + s * 1.31) * 0.32 +
    Math.sin(t * 1.618 + s * 2.71) * 0.24 +
    Math.sin(t * 2.414 + s * 0.93) * 0.18 +
    Math.sin(t * 3.732 + s * 4.13) * 0.12 +
    Math.sin(t * 0.577 + s * 3.37) * 0.08 +
    Math.sin(t * 5.083 + s * 1.79) * 0.06
  );
}

function catmullRom(ctx: CanvasRenderingContext2D, pts: number[][], alpha = 0.4) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) * alpha;
    const cp1y = p1[1] + (p2[1] - p0[1]) * alpha;
    const cp2x = p2[0] - (p3[0] - p1[0]) * alpha;
    const cp2y = p2[1] - (p3[1] - p1[1]) * alpha;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
  }
}

interface Line {
  color: string;
  seeds: Array<[number, number]>;
  speedX: number[];
  speedY: number[];
  baseX: number[];
  baseY: number[];
  spread: number;
  thickness: number;
}

function buildLines(R: number, scale: number): Line[] {
  return Array.from({ length: NUM_LINES }, (_, i) => ({
    color: PALETTE[i % PALETTE.length],
    seeds: Array.from({ length: PTS }, (_, j) => [
      i * 17.3 + j * 9.7,
      i * 6.1  + j * 13.3,
    ] as [number, number]),
    speedX: Array.from({ length: PTS }, (_, j) =>
      0.12 + ((i * 5 + j * 11) % 23) * 0.035,
    ),
    speedY: Array.from({ length: PTS }, (_, j) =>
      0.09 + ((i * 9 + j * 4)  % 19) * 0.042,
    ),
    baseX: Array.from({ length: PTS }, (_, j) =>
      R + (((i * 13 + j * 29) % 40) - 20) * 0.95 * scale,
    ),
    baseY: Array.from({ length: PTS }, (_, j) =>
      R + (((i * 19 + j * 11) % 40) - 20) * 0.95 * scale,
    ),
    spread: (11 + (i % 5) * 2.2) * scale,
    thickness: (0.65 + (i % 3) * 0.2) * scale,
  }));
}

interface OrbAnimationProps {
  size?: number;
}

export function OrbAnimation({ size = DEFAULT_SIZE }: OrbAnimationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef   = useRef<number>(0);
  const scale = size / DEFAULT_SIZE;
  const R = size / 2;
  const lines = useMemo(() => buildLines(R, scale), [R, scale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width  = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const start = performance.now();

    function draw(now: number) {
      if (!ctx) return;
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, size, size);

      for (const line of lines) {
        const pts: number[][] = line.seeds.map((seed, j) => {
          const nx = noise(t * line.speedX[j], seed[0]) * line.spread;
          const ny = noise(t * line.speedY[j], seed[1]) * line.spread;
          return [line.baseX[j] + nx, line.baseY[j] + ny];
        });

        ctx.save();
        ctx.beginPath();
        catmullRom(ctx, pts, 0.4);
        ctx.strokeStyle = line.color;
        ctx.lineWidth   = line.thickness;
        ctx.globalAlpha = 0.82;
        ctx.shadowColor = line.color;
        ctx.shadowBlur  = 8 * scale;
        ctx.lineJoin    = "round";
        ctx.lineCap     = "round";
        ctx.stroke();
        ctx.restore();
      }

      // Smooth circular fade — no hard border
      const mask = ctx.createRadialGradient(R, R, R * 0.42, R, R, R * 1.08);
      mask.addColorStop(0,    "rgba(0,0,0,0)");
      mask.addColorStop(0.62, "rgba(0,0,0,0)");
      mask.addColorStop(0.82, "rgba(0,0,0,0.35)");
      mask.addColorStop(0.94, "rgba(0,0,0,0.80)");
      mask.addColorStop(1,    "rgba(0,0,0,1)");
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = mask;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = "source-over";

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, R, scale, lines]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0 }}
    />
  );
}

const SEQUENCE_MESSAGES = [
  "Thinking...",
  "Analyzing your request...",
  "AI Agent search...",
  "Scanning technical data...",
  "Cross-referencing product data...",
  "Verifying data information...",
];

const CYCLE_MESSAGES = [
  "Thinking...",
  "Verifying data information...",
  "Filtering and ranking results...",
];

const PHASE_DURATION = 5000;

interface ThinkingIndicatorProps {
  statusMessage?: string;
}

export function ThinkingIndicator({ statusMessage: _statusMessage }: ThinkingIndicatorProps) {
  const [message, setMessage] = useState(SEQUENCE_MESSAGES[0]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setMessage(SEQUENCE_MESSAGES[0]);
    const timers: ReturnType<typeof setTimeout>[] = [];

    SEQUENCE_MESSAGES.forEach((msg, i) => {
      if (i === 0) return;
      timers.push(setTimeout(() => setMessage(msg), i * PHASE_DURATION));
    });

    const cycleStart = SEQUENCE_MESSAGES.length * PHASE_DURATION;
    timers.push(setTimeout(() => {
      let cycleIndex = 0;
      setMessage(CYCLE_MESSAGES[0]);
      intervalRef.current = setInterval(() => {
        cycleIndex = (cycleIndex + 1) % CYCLE_MESSAGES.length;
        setMessage(CYCLE_MESSAGES[cycleIndex]);
      }, PHASE_DURATION);
    }, cycleStart));

    return () => {
      timers.forEach(clearTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="flex gap-2 items-center px-2 py-2">
      <OrbAnimation />
      <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 ds-status-pulse">
        <span>{message}</span>
        <span className="flex gap-0.5">
          <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 ds-dot-1"></span>
          <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 ds-dot-2"></span>
          <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 ds-dot-3"></span>
        </span>
      </div>
    </div>
  );
}
