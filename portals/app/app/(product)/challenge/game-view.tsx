"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ARENA_H,
  ARENA_W,
  PLAYER_R,
  advance,
  createEngine,
  type EngineState,
  type Vec,
} from "../../game/engine";
import { RUN_DURATION_MS, formatScoreMs } from "../../game/rules";

// The arena renderer. All game LOGIC lives in game/engine.ts (pure, seeded,
// tested); this component owns exactly three things - input, drawing, and the
// countdown - and reports one number upward when the run ends.
//
// The arena draws its own dark palette in BOTH themes rather than reading the
// page tokens: it is a screen-within-a-screen, like the code block, and a
// bullet field on white paper reads as a diagram, not a game. Every color kept
// here is arena-only; the page around it stays on DS tokens.

const ARENA_BG = "#0b0e15";
const TRAIL_FADE = "rgba(11, 14, 21, 0.32)";
const BULLET_HALO = "rgba(125, 146, 245, 0.28)";
const BULLET_CORE = "#cdd8ff";
const PLAYER_RING = "#7d92f5";
const PLAYER_CORE = "#ffffff";
const HUD_INK = "rgba(233, 235, 240, 0.92)";
const HUD_BAR = "#7d92f5";
const HIT_RING = "#f87171";

const COUNTDOWN_MS = 1800; // 3 - 2 - 1, 600ms each
const KEY_SPEED = 340; // logical px/s
const TOUCH_Y_OFFSET = 56; // keep the player visible above the finger
const MAX_FRAME_MS = 50; // background-tab clamp: drop time, never fast-forward

export interface GameFinish {
  scoreMs: number;
  outcome: "survived" | "hit";
}

export function GameView({ seed, onFinish }: { seed: string; onFinish: (f: GameFinish) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [countdown, setCountdown] = useState(3);

  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  const draw = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      state: EngineState,
      player: Vec,
      scale: number,
      opts: { firstFrame: boolean; reducedMotion: boolean },
    ) => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      if (opts.firstFrame || opts.reducedMotion) {
        ctx.fillStyle = ARENA_BG;
      } else {
        ctx.fillStyle = TRAIL_FADE; // motion trails: fade, don't wipe
      }
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);

      for (const b of state.bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 2.1, 0, Math.PI * 2);
        ctx.fillStyle = BULLET_HALO;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = BULLET_CORE;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_R + 3, 0, Math.PI * 2);
      ctx.strokeStyle = state.status === "hit" ? HIT_RING : PLAYER_RING;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_R - 1.5, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_CORE;
      ctx.fill();

      // HUD: elapsed clock + progress bar. Inside the canvas so it shares the
      // arena's fixed contrast and never reflows the page.
      const shown = state.status === "hit" ? state.t : Math.min(state.t, RUN_DURATION_MS);
      ctx.fillStyle = HUD_INK;
      ctx.font = "600 30px ui-monospace, 'Cascadia Code', Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(formatScoreMs(shown), ARENA_W / 2, 44);
      ctx.fillStyle = "rgba(233, 235, 240, 0.14)";
      ctx.fillRect(0, 0, ARENA_W, 3);
      ctx.fillStyle = HUD_BAR;
      ctx.fillRect(0, 0, ARENA_W * Math.min(1, shown / RUN_DURATION_MS), 3);

      if (state.status === "hit") {
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_R + 14, 0, Math.PI * 2);
        ctx.strokeStyle = HIT_RING;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let scale = 1;
    const fit = () => {
      const cssWidth = Math.min(wrap.clientWidth, ARENA_W);
      const cssHeight = (cssWidth / ARENA_W) * ARENA_H;
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      scale = (cssWidth * dpr) / ARENA_W;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);

    const engine = createEngine(seed);
    const player: Vec = { x: ARENA_W / 2, y: ARENA_H * 0.72 };
    const target: Vec = { ...player };
    const keys = new Set<string>();
    let raf = 0;
    let last = performance.now();
    let phaseStart = last;
    let phase: "countdown" | "running" | "over" = "countdown";
    let finished = false;

    const toLogical = (e: PointerEvent): Vec => {
      const rect = canvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * ARENA_W;
      let y = ((e.clientY - rect.top) / rect.height) * ARENA_H;
      if (e.pointerType === "touch") y -= TOUCH_Y_OFFSET;
      return { x, y };
    };

    const onPointer = (e: PointerEvent) => {
      const p = toLogical(e);
      target.x = p.x;
      target.y = p.y;
    };
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        if (down) e.preventDefault();
        if (down) keys.add(k);
        else keys.delete(k);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);

    canvas.addEventListener("pointermove", onPointer);
    canvas.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const movePlayer = (dt: number) => {
      const s = dt / 1000;
      let kx = 0;
      let ky = 0;
      if (keys.has("arrowleft") || keys.has("a")) kx -= 1;
      if (keys.has("arrowright") || keys.has("d")) kx += 1;
      if (keys.has("arrowup") || keys.has("w")) ky -= 1;
      if (keys.has("arrowdown") || keys.has("s")) ky += 1;
      if (kx !== 0 || ky !== 0) {
        const len = Math.hypot(kx, ky);
        target.x += (kx / len) * KEY_SPEED * s;
        target.y += (ky / len) * KEY_SPEED * s;
      }
      // Critically-damped chase: responsive but never teleporting through a
      // bullet - the engine only ever sees positions the player passed through.
      const chase = 1 - Math.exp(-14 * s);
      player.x += (target.x - player.x) * chase;
      player.y += (target.y - player.y) * chase;
      player.x = Math.max(PLAYER_R, Math.min(ARENA_W - PLAYER_R, player.x));
      player.y = Math.max(PLAYER_R, Math.min(ARENA_H - PLAYER_R, player.y));
      target.x = Math.max(PLAYER_R, Math.min(ARENA_W - PLAYER_R, target.x));
      target.y = Math.max(PLAYER_R, Math.min(ARENA_H - PLAYER_R, target.y));
    };

    let firstFrame = true;
    const frame = (now: number) => {
      const dt = Math.min(now - last, MAX_FRAME_MS);
      last = now;

      if (phase === "countdown") {
        const left = COUNTDOWN_MS - (now - phaseStart);
        if (left <= 0) {
          phase = "running";
          setCountdown(0);
        } else {
          setCountdown(Math.ceil(left / 600));
        }
        movePlayer(dt);
        draw(ctx, engine, player, scale, { firstFrame, reducedMotion });
        firstFrame = false;
        raf = requestAnimationFrame(frame);
        return;
      }

      if (phase === "running") {
        movePlayer(dt);
        advance(engine, dt, player);
        draw(ctx, engine, player, scale, { firstFrame: false, reducedMotion });
        if (engine.status !== "running") {
          phase = "over";
          phaseStart = now;
        }
        raf = requestAnimationFrame(frame);
        return;
      }

      // over: hold the final frame briefly so the hit reads, then report once.
      if (!finished && now - phaseStart >= 550) {
        finished = true;
        finishRef.current({
          scoreMs: Math.min(Math.round(engine.t), RUN_DURATION_MS),
          outcome: engine.status === "survived" ? "survived" : "hit",
        });
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [seed, draw]);

  return (
    <div ref={wrapRef} className="arena-wrap">
      <canvas
        ref={canvasRef}
        className="arena-canvas"
        aria-label="Bullet-dodging arena. Move with the mouse, touch, or arrow keys."
      />
      {countdown > 0 && (
        <div className="arena-countdown" aria-hidden>
          {countdown}
        </div>
      )}
    </div>
  );
}
