"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ARENA_H,
  ARENA_W,
  PLAYER_R,
  PLAYER_SPEED,
  advance,
  createEngine,
  type EngineState,
  type Vec,
} from "../../game/engine";
import { QUALIFY_MS, formatScoreMs } from "../../game/rules";

// The arena renderer. All game LOGIC lives in game/engine.ts (pure, seeded,
// tested); this component owns exactly three things - input, drawing, and the
// countdown - and reports one number upward when the run ends.
//
// Input is the four arrow keys and nothing else (owner decision 2026-08-31):
// no pointer follow, no WASD. Direct velocity movement at PLAYER_SPEED - the
// old pointer-chase let the cursor teleport the player, which made speed the
// skill; fixed-speed keys make POSITIONING the skill.
//
// The palette is the command-deck amber-on-charcoal of the owner's reference
// design (Figma "data visualization dashboard"): warm near-black ground, gold
// orbit rings, glowing amber orbs. Fixed in both themes - the deck is a
// screen-within-a-screen. Every color kept here is arena-only.

const ARENA_BG = "#0d0b08";
const TRAIL_FADE = "rgba(13, 11, 8, 0.3)";
const ORBIT_RING = "rgba(245, 166, 35, 0.09)";
const BULLET_HALO = "rgba(245, 158, 35, 0.2)";
const BULLET_CORE = "#ffb340";
const PLAYER_RING = "#f5a623";
const PLAYER_CORE = "#fff8e7";
const HUD_INK = "rgba(255, 244, 214, 0.95)";
const HUD_TRACK = "rgba(245, 166, 35, 0.16)";
const HUD_BAR = "#f5a623";
const QUALIFIED_INK = "#6fdc8f";
const HIT_RING = "#ff5a3c";

const COUNTDOWN_MS = 1800; // 3 - 2 - 1, 600ms each
const ARROW_KEYS = ["arrowup", "arrowdown", "arrowleft", "arrowright"] as const;
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

      // Faint concentric orbit rings, the deck's centerpiece motif - and a
      // real dodging aid: fixed reference circles to judge lanes against.
      ctx.strokeStyle = ORBIT_RING;
      ctx.lineWidth = 1;
      for (const r of [110, 200]) {
        ctx.beginPath();
        ctx.arc(ARENA_W / 2, ARENA_H / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (const b of state.bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = BULLET_HALO;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = BULLET_CORE;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_R + 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = state.status === "hit" ? HIT_RING : PLAYER_RING;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_R - 1, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_CORE;
      ctx.fill();

      // HUD: elapsed clock + progress bar, inside the canvas so it shares the
      // deck's fixed contrast and never reflows the page. 20s is the bar, not
      // the end: past it the clock turns qualified-green and the bar WRAPS,
      // refilling every 20s lap.
      const qualified = state.t >= QUALIFY_MS;
      ctx.fillStyle = qualified ? QUALIFIED_INK : HUD_INK;
      ctx.font = "600 26px ui-monospace, 'Cascadia Code', Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(formatScoreMs(state.t), ARENA_W / 2, 40);
      if (qualified) {
        ctx.font = "700 10px ui-monospace, 'Cascadia Code', Consolas, monospace";
        ctx.fillText("QUALIFIED", ARENA_W / 2, 56);
      }
      ctx.fillStyle = HUD_TRACK;
      ctx.fillRect(0, 0, ARENA_W, 2);
      ctx.fillStyle = qualified ? QUALIFIED_INK : HUD_BAR;
      ctx.fillRect(0, 0, ARENA_W * ((state.t % QUALIFY_MS) / QUALIFY_MS), 2);

      if (state.status === "hit") {
        ctx.beginPath();
        ctx.arc(player.x, player.y, PLAYER_R + 12, 0, Math.PI * 2);
        ctx.strokeStyle = HIT_RING;
        ctx.lineWidth = 2;
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
      // Contain within the wrapper: the deck letterboxes around the arena.
      const cssWidth = Math.min(wrap.clientWidth, (wrap.clientHeight / ARENA_H) * ARENA_W || Infinity);
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
    const keys = new Set<string>();
    let raf = 0;
    let last = performance.now();
    let phaseStart = last;
    let phase: "countdown" | "running" | "over" = "countdown";
    let finished = false;

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if ((ARROW_KEYS as readonly string[]).includes(k)) {
        e.preventDefault();
        if (down) keys.add(k);
        else keys.delete(k);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const movePlayer = (dt: number) => {
      let kx = 0;
      let ky = 0;
      if (keys.has("arrowleft")) kx -= 1;
      if (keys.has("arrowright")) kx += 1;
      if (keys.has("arrowup")) ky -= 1;
      if (keys.has("arrowdown")) ky += 1;
      if (kx === 0 && ky === 0) return;
      // Fixed speed, diagonals included: direction changes, pace never does.
      const len = Math.hypot(kx, ky);
      const s = (PLAYER_SPEED * dt) / 1000;
      player.x = Math.max(PLAYER_R, Math.min(ARENA_W - PLAYER_R, player.x + (kx / len) * s));
      player.y = Math.max(PLAYER_R, Math.min(ARENA_H - PLAYER_R, player.y + (ky / len) * s));
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
        const scoreMs = Math.round(engine.t);
        finishRef.current({
          scoreMs,
          // 'survived' is the stored name for a QUALIFIED run (>= the bar).
          outcome: scoreMs >= QUALIFY_MS ? "survived" : "hit",
        });
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [seed, draw]);

  return (
    <div ref={wrapRef} className="deck-arena">
      <canvas
        ref={canvasRef}
        className="deck-arena__canvas"
        aria-label="Bullet-dodging arena. Move with the arrow keys."
      />
      {countdown > 0 && (
        <div className="deck-countdown" aria-hidden>
          {countdown}
        </div>
      )}
    </div>
  );
}
