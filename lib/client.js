window.__ModuleLoader__.load({
  id: "dsh-quiet",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    "use strict";

    const React = require("react");
    const P = require("@deepseek-ai/dsh-client-ui-primitives");
    const h = React.createElement;

    /* =====================================================================
     * 样式
     * ===================================================================*/
    const CSS = `
.dshr_root{display:flex;flex-direction:column;font-size:var(--dsh-content-font-size,14px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-primary)}
.dshr_body{display:flex;flex-direction:column;gap:16px;min-width:0}
.dshr_reveal{min-width:0}
.dshr_body>[data-turn-process-inline][hidden]{margin-bottom:-16px}
.dshr_stopped{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);align-self:flex-start;padding:0 6px;font-size:11px;line-height:18px}

/* 逐字浮现：透明度 + 颜色 / 模糊，两段动画，不加 transform */
.dshr_tk{animation:dshrFade .68s cubic-bezier(.22,1,.36,1) both,dshrBlur .86s cubic-bezier(.22,1,.36,1) both}
@keyframes dshrFade{from{opacity:0;color:var(--dshr-from,#c3c8d2)}}
@keyframes dshrBlur{from{filter:blur(var(--dshr-blur,10px))}}
@media (prefers-reduced-motion:reduce){.dshr_tk{animation:none}}

/* 流式期间的结构（Markdown 子集） */
.dshr_p{margin:0 0 14px;min-width:0}
.dshr_p:last-child{margin-bottom:0}
.dshr_h1,.dshr_h2,.dshr_h3{margin:18px 0 8px;font-weight:600;line-height:22px}
.dshr_h1{font-size:16px}.dshr_h2{font-size:15px}.dshr_h3{font-size:14px}
.dshr_ul{margin:0 0 14px;padding-left:20px}
.dshr_li{margin:2px 0;animation:dshrLi .5s cubic-bezier(.22,1,.36,1) both}
@keyframes dshrLi{from{opacity:0}}
.dshr_strong{font-weight:600}
.dshr_code{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12.5px;background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));border-radius:4px;padding:1px 4px}


/* —— 背景层 —— */
.dshr-backdrop{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0;transition:opacity .6s ease}
.dshr-backdrop[data-ready]{opacity:1}
.dshr-backdrop canvas{display:block;width:100%;height:100%}
/* 主题切换时给界面 400ms 的过渡（只在这 450ms 内开启，避免平时 hover 变慢） */
body[data-dshr-switching] *{transition:background-color .4s ease,color .4s ease,border-color .4s ease,fill .4s ease!important}

/* 思考行：贴近原生 ReasoningRow 的观感 */
.dshr_reason{display:flex;flex-direction:column}
.dshr_reason:not([data-expanded]){contain:size layout;height:calc(24px + var(--dsh-content-font-delta,0px))}
.dshr_reasonBody{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));min-width:0}
.dshr_sep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}
.dshr_summary{min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;flex:auto;overflow:hidden}
.dshr_summaryText{text-overflow:ellipsis;display:block;overflow:hidden}
.dshr_summary[data-streaming]{mask-image:linear-gradient(90deg,#000 calc(100% - 48px),#0000)}
.dshr_summary[data-streaming] .dshr_summaryText{text-overflow:clip;overflow:visible}
.dshr_reason:not([data-preview]) .dshr_sep,.dshr_reason:not([data-preview]) .dshr_summary{display:none}
`;

    const CSS_ID = "dsh-quiet/index.css";
    function installStyles() {
      if (typeof document === "undefined") return;
      if (document.querySelector("style[data-plugin-css=" + JSON.stringify(CSS_ID) + "]") !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-quiet";
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    /* =====================================================================
     * 深/浅色下的「起始灰」：量一下页面底色，决定从哪个灰起步
     * ===================================================================*/
    function syncTone() {
      try {
        const bg = getComputedStyle(document.body).backgroundColor || "";
        const m = bg.match(/rgba?\(([^)]+)\)/);
        let dark = false;
        if (m) {
          const [r, g, b, a = "1"] = m[1].split(",").map((v) => parseFloat(v));
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          dark = Number(a) > 0.5 && lum < 0.45;
        } else {
          dark = matchMedia("(prefers-color-scheme: dark)").matches;
        }
        document.documentElement.style.setProperty("--dshr-from", dark ? "#566070" : "#c3c8d2");
        document.documentElement.style.setProperty("--dshr-blur", "10px");
      } catch (error) {
        /* 量不到就用默认值 */
      }
    }

    /* =====================================================================
     * 流式 Markdown 分块器（拉取式）
     * 时钟每放一个字，才从这里取一个字 —— 结构与字符永远同序。
     * ===================================================================*/
    const MARKERS = [
      ["### ", "h3", "dshr_h3"],
      ["## ", "h2", "dshr_h2"],
      ["# ", "h1", "dshr_h1"],
      ["- ", "li", "dshr_li"],
    ];

    function createMarkdownStream(root) {
      let raw = [];
      let block = null;
      let list = null;
      let inline = null;
      let inlineKind = null;
      let lineStart = true;
      let strict = true;

      const make = (tag, className) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        return node;
      };
      const closeInline = () => {
        inline = null;
        inlineKind = null;
      };
      const closeBlock = () => {
        closeInline();
        block = null;
      };
      const closeList = () => {
        closeBlock();
        list = null;
      };
      const openBlock = (tag, className) => {
        closeBlock();
        const node = make(tag, className);
        (list ?? root).appendChild(node);
        block = node;
      };
      const openItem = () => {
        closeBlock();
        if (!list) {
          list = make("ul", "dshr_ul");
          root.appendChild(list);
        }
        const li = make("li", "dshr_li");
        list.appendChild(li);
        block = li;
      };
      const lineMarker = () => {
        const head = raw.join("");
        for (const [marker, tag, cls] of MARKERS) {
          if (head.startsWith(marker)) {
            raw.splice(0, marker.length);
            if (tag === "li") openItem();
            else openBlock(tag, cls);
            lineStart = false;
            return "skip";
          }
          if (strict && head.length > 0 && head.length < marker.length && marker.startsWith(head)) return "hold";
        }
        return false;
      };

      return {
        feed(text) {
          for (const ch of text) raw.push(ch);
        },
        take() {
          if (raw.length === 0) return null;
          if (lineStart) {
            const marker = lineMarker();
            if (marker === "hold") return "hold";
            if (marker === "skip") return "skip";
            if (raw[0] === "\n") {
              raw.shift();
              closeList();
              return "skip";
            }
            if (block === null) openBlock("p", "dshr_p");
            lineStart = false;
          }

          const c = raw.shift();

          if (c === "\n") {
            lineStart = true;
            closeInline();
            return { ch: "\n", el: block ?? root };
          }
          if (c === "`") {
            if (inlineKind === "code") closeInline();
            else {
              closeInline();
              inline = make("code", "dshr_code");
              (block ?? root).appendChild(inline);
              inlineKind = "code";
            }
            return "skip";
          }
          if (c === "*") {
            if (raw[0] === "*") {
              raw.shift();
              if (inlineKind === "strong") closeInline();
              else {
                closeInline();
                inline = make("strong", "dshr_strong");
                (block ?? root).appendChild(inline);
                inlineKind = "strong";
              }
              return "skip";
            }
            if (strict && raw.length === 0) {
              raw.unshift("*");
              return "hold";
            }
          }
          return { ch: c, el: inline ?? block ?? root };
        },
        get pending() {
          return raw.length;
        },
        finish() {
          strict = false;
        },
      };
    }

    /* =====================================================================
     * 逐字浮现内核
     * ===================================================================*/
    const smoothstep = (e) => e * e * (3 - 2 * e);

    function createRevealer(el, options) {
      const rate = options.rate ?? 40;
      const rampMs = options.rampMs ?? 700;
      // 队列积压时允许提速：迟钝的模型看不出来，快的模型不会「回复早结束了字幕还在爬」
      const maxBoost = options.maxBoost ?? 6;
      const decoder = options.decoder ?? null;
      const onFrame = options.onFrame;

      const queue = [];
      let acc = 0;
      let t0 = null;
      let last = null;
      let ended = false;
      let raf = 0;
      let disposed = false;
      let active = 0;
      let revealed = 0;
      const dirty = new Set();

      const pending = () => (decoder ? decoder.pending : queue.length);

      const put = (item, delayMs) => {
        const host = item.el ?? el;
        if (item.ch === " " || item.ch === "\n" || item.ch === "\t") {
          host.appendChild(document.createTextNode(item.ch));
          dirty.add(host);
          return;
        }
        const sp = document.createElement("span");
        sp.className = "dshr_tk";
        sp.textContent = item.ch;
        sp.style.animationDelay = delayMs + "ms, " + delayMs + "ms";
        sp.addEventListener("animationend", (event) => {
          if (event.animationName !== "dshrBlur") return;
          active -= 1;
          sp.replaceWith(document.createTextNode(item.ch));
          dirty.add(host);
        });
        active += 1;
        host.appendChild(sp);
      };

      const compact = () => {
        if (dirty.size === 0) return;
        for (const node of dirty) if (node.isConnected) node.normalize();
        dirty.clear();
      };

      const step = (frameNow) => {
        raf = 0;
        if (disposed) return;
        if (t0 == null) t0 = last = frameNow;
        const dt = Math.min(0.05, (frameNow - last) / 1000);
        last = frameNow;

        const e = Math.min(1, (frameNow - t0) / rampMs);
        let speed = rate * (0.35 + 0.65 * smoothstep(e));
        // 积压超过 0.8 秒的量才开始提速，最多 maxBoost 倍（积压越深越快，追平后自动回落）
        const backlog = pending() / rate;
        if (backlog > 0.8) speed *= Math.min(maxBoost, 1 + (backlog - 0.8) * 0.9);
        const slow = ended ? 1 : Math.min(1, pending() / 6 + 0.25);
        const v = speed * slow;
        acc += v * dt;

        while (acc >= 1) {
          const item = decoder ? decoder.take() : queue.length > 0 ? queue.shift() : null;
          if (item === null || item === "hold") break;
          if (item === "skip") continue;
          acc -= 1;
          put(item, Math.round(-(acc / Math.max(v, 1e-6)) * 1000));
          revealed += 1;
        }
        compact();

        const done = ended && pending() === 0;
        if (onFrame) onFrame({ active, revealed, queued: pending(), done });
        // 队列空了但还有 span 在动 → 继续帧循环，等 active 归零再交给正式渲染
        if (pending() > 0 || (ended && active > 0)) raf = requestAnimationFrame(step);
      };

      const kick = () => {
        if (raf === 0 && !disposed) raf = requestAnimationFrame(step);
      };

      return {
        push(chunk) {
          if (!chunk) return;
          if (decoder) decoder.feed(chunk);
          else for (const ch of chunk) queue.push({ ch, el });
          kick();
        },
        end() {
          if (ended) return;
          ended = true;
          if (decoder) decoder.finish();
          kick();
        },
        flush() {
          ended = true;
          if (decoder) decoder.finish();
          if (raf !== 0) cancelAnimationFrame(raf);
          raf = 0;
          for (;;) {
            const item = decoder ? decoder.take() : queue.length > 0 ? queue.shift() : null;
            if (item === null || item === "hold") break;
            if (item === "skip") continue;
            const host = item.el ?? el;
            host.appendChild(document.createTextNode(item.ch));
            dirty.add(host);
            revealed += 1;
          }
          compact();
        },
        dispose() {
          disposed = true;
          if (raf !== 0) cancelAnimationFrame(raf);
          raf = 0;
        },
      };
    }

/**
 * 背景点阵 + 游动的鲸鱼（插件内部版本）。
 *
 * 关键做法：鲸鱼不是另画的图案，而是**同一片点阵里落在鲸鱼形状内的那些点**，
 * 点的大小完全一样，只靠颜色深浅区分。所以每帧要做的是：
 *   屏幕点 → 反变换到鲸鱼本地坐标 → 查一张预先生成的遮罩（带羽化）→ 混合透明度。
 *
 * 身体弯曲 / 尾巴摆动都只是「随身体横坐标变化的纵向位移」，
 * 因此反变换是精确可逆的（减去同样的位移即可），不需要真正的逆向网格变形。
 */

const PALETTES = {
  light: {
    bg: "#ffffff",
    dot: [31, 35, 41],
    baseAlpha: 0.14,
    whaleAlpha: 0.34,
  },
  dark: {
    bg: "#141518",
    dot: [230, 231, 235],
    baseAlpha: 0.09,
    whaleAlpha: 0.22,
  },
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (t) => t * t * (3 - 2 * t);

/** 把 SVG 路径栅格化成带羽化的遮罩，供每帧查表。 */
function buildMask(pathData, viewBox, resolution = 8, featherUnits = 0.55) {
  const width = Math.ceil(viewBox.width * resolution);
  const height = Math.ceil(viewBox.height * resolution);
  const shape = document.createElement("canvas");
  shape.width = width;
  shape.height = height;
  const sctx = shape.getContext("2d");
  sctx.scale(resolution, resolution);
  // 官方 logo 头朝左；镜像一下，让「朝右前进」时头在前
  sctx.translate(viewBox.width, 0);
  sctx.scale(-1, 1);
  sctx.fillStyle = "#fff";
  sctx.fill(new Path2D(pathData));

  // 羽化：模糊一遍，形成 2~3 个点宽的过渡带
  const soft = document.createElement("canvas");
  soft.width = width;
  soft.height = height;
  const fctx = soft.getContext("2d");
  const feather = Math.max(1.5, resolution * featherUnits);
  if (typeof fctx.filter === "string") {
    fctx.filter = `blur(${feather}px)`;
    fctx.drawImage(shape, 0, 0);
    fctx.filter = "none";
  } else {
    fctx.drawImage(shape, 0, 0);
  }

  const data = fctx.getImageData(0, 0, width, height).data;
  const alpha = new Float32Array(width * height);
  let max = 0;
  for (let i = 0; i < alpha.length; i += 1) {
    const v = data[i * 4 + 3] / 255;
    alpha[i] = v;
    if (v > max) max = v;
  }
  // 归一化，让实心区域恒为 1
  if (max > 0.01) for (let i = 0; i < alpha.length; i += 1) alpha[i] = Math.min(1, alpha[i] / max);

  return { width, height, alpha, resolution };
}

function createBackdrop(canvas, options = {}) {
  const spacing = options.spacing ?? 22;
  const dotRadius = options.dotRadius ?? 1;
  const whaleWidthRatio = options.whaleWidthRatio ?? 0.44;
  const cruise = options.cruise ?? 34;
  const cruiseActive = options.cruiseActive ?? 46;
  const turnSeconds = options.turnSeconds ?? 2.2;
  const turnRadiusX = options.turnRadiusX ?? 170;
  const turnRadiusY = options.turnRadiusY ?? 80;

  const mask = buildMask(options.pathData, options.viewBox, 8, options.featherUnits ?? 0.55);

  let scheme = options.scheme ?? "light";
  let palette = { ...PALETTES[scheme], target: { ...PALETTES[scheme] } };
  let dpr = 1;
  let width = 0;
  let height = 0;
  let raf = 0;
  let disposed = false;
  let last = 0;
  let reduced = options.reducedMotion === true;
  let activity = false;
  let pointer = { x: -1e4, y: -1e4, active: false };

  // —— 鲸鱼状态 ——
  const state = {
    x: 0,
    y: 0,
    laneY: 0,
    heading: 0, // 弧度，0 = 朝右
    dir: 1,
    turn: null, // { t, duration, sign, y0 }
    speed: cruise,
    tailFlick: 0, // 0..1，发送消息时甩尾
    opacity: 1,
    time: 0,
    nextTurnUp: true,
  };

  const bubbles = []; // 呼吸孔气泡圈
  const spout = []; // 发送时的喷点

  // 绘制区域：默认整窗，给了 bounds 就只画在这块里（聊天区）
  const view = { x: 0, y: 0, w: 1, h: 1 };
  const readBounds = () => {
    const fn = options.bounds;
    if (typeof fn !== "function") return null;
    try {
      const r = fn();
      if (r && r.width > 80 && r.height > 80) return r;
    } catch (error) {
      /* 布局还没就绪 */
    }
    return null;
  };
  const syncView = () => {
    const r = readBounds();
    if (!r) {
      if (view.w === width && view.h === height && view.x === 0 && view.y === 0) return false;
      view.x = 0;
      view.y = 0;
      view.w = width;
      view.h = height;
      return true;
    }
    const moved = Math.abs(r.x - view.x) > 1 || Math.abs(r.y - view.y) > 1;
    const resized = Math.abs(r.width - view.w) > 1 || Math.abs(r.height - view.h) > 1;
    if (!moved && !resized) return false;
    const prevW = view.w || r.width;
    const prevH = view.h || r.height;
    view.x = r.x;
    view.y = r.y;
    view.w = r.width;
    view.h = r.height;
    // 面板开合时按比例迁移，别让鲸鱼瞬移出界
    state.x = clamp((state.x / prevW) * view.w, 0, view.w);
    state.laneY = clamp((state.laneY / prevH) * view.h, view.h * 0.16, view.h * 0.86);
    return true;
  };

  const measure = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = clamp(options.dpr ?? window.devicePixelRatio ?? 1, 1, 2.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  };

  const whalescale = () => (view.w * whaleWidthRatio) / options.viewBox.width;

  const reset = () => {
    measure();
    syncView();
    state.laneY = view.h * 0.52;
    state.y = state.laneY;
    state.x = view.w * 0.5;
    state.heading = 0;
    state.dir = 1;
    state.turn = null;
  };

  reset();

  /** 身体纵向位移（本地单位）：正弦波 + 尾巴摆动 + 甩尾 */
  const bendAt = (ux, t) => {
    const span = options.viewBox.width;
    const p = clamp(ux / span, 0, 1);
    const body = 1.05 * Math.sin(p * 5.2 - t * 1.35) * Math.sin(Math.PI * clamp(p * 1.12, 0, 1));
    const tailRegion = Math.max(0, (p - 0.62) / 0.38);
    const tail = tailRegion * tailRegion * 2.2 * Math.sin(t * 1.6 - 1.1) + tailRegion * 2.2 * state.tailFlick * Math.sin(t * 9);
    return body + tail;
  };

  const startTurn = () => {
    state.turn = {
      t: 0,
      duration: turnSeconds,
      sign: state.dir, // 前进方向
      up: state.nextTurnUp,
      x0: state.x,
      y0: state.laneY,
    };
    state.nextTurnUp = !state.nextTurnUp;
  };

  const step = (dt) => {
    state.time += dt;
    const t = state.time;

    // —— 速度：巡航 + 活动时更快；永远不停 ——
    const targetSpeed = activity ? cruiseActive : cruise;

    if (state.turn) {
      const turn = state.turn;
      turn.t += dt;
      const p = clamp(turn.t / turn.duration, 0, 1);
      const phi = Math.PI * p;
      const sign = turn.sign;
      const rx = turnRadiusX;
      const ry = turnRadiusY * (turn.up ? -1 : 1);

      state.x = turn.x0 + sign * rx * Math.sin(phi);
      state.laneY = turn.y0 + ry * (1 - Math.cos(phi));

      const dx = sign * rx * Math.cos(phi);
      const dy = ry * Math.sin(phi);
      state.heading = Math.atan2(dy, dx);

      state.opacity = 1 - 0.35 * Math.sin(Math.PI * p); // 掉头瞬间略微变淡
      // 弧线上的速度由角速度决定，起步/收尾用 smoothstep 接上巡航速度
      const arcSpeed = (Math.PI / turn.duration) * Math.hypot(rx, ry) * 1.15;
      state.speed = lerp(targetSpeed, arcSpeed, smooth01(p));

      if (p >= 1) {
        state.turn = null;
        state.dir = -sign;
        state.heading = sign > 0 ? Math.PI : 0;
        state.opacity = 1;
      }
    } else {
      state.speed = lerp(state.speed, targetSpeed, Math.min(1, dt * 2.5));
      state.opacity = lerp(state.opacity, 1, Math.min(1, dt * 4));

      // 鼠标附近：轻微偏向；太近：绕开
      let steer = 0;
      if (pointer.active) {
        const dx = pointer.x - state.x;
        const dy = pointer.y - state.y;
        const dist = Math.hypot(dx, dy);
        const near = 420;
        if (dist < near && dist > 1) {
          const pull = (1 - dist / near) * 0.5;
          steer = clamp((dy / dist) * pull, -0.35, 0.35) * 0.5;
          if (dist < 190) steer -= Math.sign(dy || 1) * (1 - dist / 190) * 0.5;
        }
      }
      const baseHeading = state.dir > 0 ? 0 : Math.PI;
      const wobble = Math.sin(t * 0.21) * 0.02;
      state.heading = lerp(state.heading, baseHeading + steer + wobble, Math.min(1, dt * 1.6));

      state.x += Math.cos(state.heading) * state.speed * dt;
      state.laneY += Math.sin(state.heading) * state.speed * dt;

      // 掉头点在「鲸鱼头部快碰到边」的位置，避免整条纹出屏
      const margin = (view.w * whaleWidthRatio) / 2 + 24;
      if (state.dir > 0 && state.x > view.w - margin) startTurn();
      else if (state.dir < 0 && state.x < margin) startTurn();

      // 水平越界兜底（窗口变化等）
      if (state.x < -view.w * 0.2) state.x = -view.w * 0.2;
      if (state.x > view.w * 1.2) state.x = view.w * 1.2;
    }

    // 上下浮动 + 垂直方向的软约束
    state.laneY = clamp(state.laneY, view.h * 0.16, view.h * 0.86);
    state.y = state.laneY + Math.sin(t * 0.55) * 7 + Math.sin(t * 0.23) * 4;

    // —— 粒子 ——
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const b = bubbles[i];
      b.life -= dt;
      b.y -= b.vy * dt;
      b.x += Math.sin(t * 3 + b.seed) * 6 * dt;
      if (b.life <= 0) bubbles.splice(i, 1);
    }
    for (let i = spout.length - 1; i >= 0; i -= 1) {
      const p2 = spout[i];
      p2.life -= dt;
      p2.x += p2.vx * dt;
      p2.y += p2.vy * dt;
      p2.vy += 26 * dt;
      if (p2.life <= 0) spout.splice(i, 1);
    }
    state.tailFlick = Math.max(0, state.tailFlick - dt * 1.6);
  };

  /** 鲸鱼本地坐标（logo 单位）→ 屏幕坐标 */
  const localToScreen = (ux, uy, scale, cx, cy, cos, sin) => {
    const bend = bendAt(ux, state.time);
    const lx = (ux - options.viewBox.width / 2) * scale;
    const ly = (uy + bend - options.viewBox.height / 2) * scale;
    return {
      x: cx + lx * cos - ly * sin,
      y: cy + lx * sin + ly * cos,
    };
  };

  const headPoint = (scale) => {
    const cos = Math.cos(state.heading);
    const sin = Math.sin(state.heading);
    // 喷气孔：头顶偏前
    const b = localToScreen(options.viewBox.width * 0.7, options.viewBox.height * 0.24, scale, state.x, state.y, cos, sin);
    return b;
  };

  const render = () => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    // 点阵只画在绘制区域里（聊天区），侧栏与标题栏保持干净
    ctx.save();
    ctx.beginPath();
    ctx.rect(view.x, view.y, view.w, view.h);
    ctx.clip();
    ctx.translate(view.x, view.y);

    const scale = whalescale();
    const cos = Math.cos(state.heading);
    const sin = Math.sin(state.heading);
    const halfW = options.viewBox.width / 2;
    const halfH = options.viewBox.height / 2;
    const breath = 1 + Math.sin(state.time * 0.35) * 0.05;
    const [r, g, b] = palette.dot;
    const baseA = palette.baseAlpha * breath;
    const whaleA = palette.whaleAlpha * breath * state.opacity;
    const maskUnit = 1 / mask.resolution;

    // 分桶，避免每个点都切换 fillStyle
    const buckets = new Map();
    const addDot = (x, y, a) => {
      const key = Math.round(a * 40) / 40;
      if (key <= 0.004) return;
      let list = buckets.get(key);
      if (!list) buckets.set(key, (list = []));
      list.push(x, y);
    };

    for (let y = spacing / 2; y < view.h; y += spacing) {
      for (let x = spacing / 2; x < view.w; x += spacing) {
        let mix = 0;
        // 反变换到鲸鱼本地坐标
        const dx = x - state.x;
        const dy = y - state.y;
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;
        const ux = lx / scale + halfW;
        const uy = ly / scale + halfH;
        if (ux > -2 && ux < options.viewBox.width + 2 && uy > -6 && uy < options.viewBox.height + 6) {
          const bend = bendAt(ux, state.time);
          const mu = Math.round(ux * mask.resolution);
          const mv = Math.round((uy - bend) * mask.resolution);
          if (mu >= 0 && mv >= 0 && mu < mask.width && mv < mask.height) {
            mix = mask.alpha[mv * mask.width + mu];
          }
        }
        addDot(x, y, mix > 0 ? lerp(baseA, whaleA, mix) : baseA);
      }
    }


    // 用 2×2 的设备像素方块画点：比抗锯齿的小圆更「实」，同样的透明度更清楚
    const size = dotRadius * 2;
    for (const [alpha, points] of buckets) {
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      for (let i = 0; i < points.length; i += 2) {
        ctx.fillRect(points[i] - size / 2, points[i + 1] - size / 2, size, size);
      }
    }

    // 气泡圈 / 喷点：同色，极轻
    if (bubbles.length || spout.length) {
      const head = headPoint(scale);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(whaleA * 0.9).toFixed(3)})`;
      ctx.fillStyle = `rgba(${r},${g},${b},${(whaleA * 0.9).toFixed(3)})`;
      for (const bubble of bubbles) {
        const a = clamp(bubble.life / bubble.max, 0, 1);
        ctx.globalAlpha = a * 0.9;
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const p2 of spout) {
        const a = clamp(p2.life / p2.max, 0, 1);
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      void head;
    }
    ctx.restore();
  };

  const frame = (now) => {
    raf = 0;
    if (disposed) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    syncView();
    step(dt);
    render();
    // 主题色过渡
    const target = palette.target;
    const k = Math.min(1, dt / 0.4);
    palette.bg = mixColor(palette.bg, target.bg, k);
    palette.dot = palette.dot.map((v, i) => lerp(v, target.dot[i], k));
    palette.baseAlpha = lerp(palette.baseAlpha, target.baseAlpha, k);
    palette.whaleAlpha = lerp(palette.whaleAlpha, target.whaleAlpha, k);
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (raf === 0 && !disposed && !reduced) raf = requestAnimationFrame(frame);
  };

  if (reduced) render();
  else start();

  const onVisibility = () => {
    if (document.hidden) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else start();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const onPointer = (event) => {
    pointer.x = event.clientX - view.x;
    pointer.y = event.clientY - view.y;
    pointer.active = true;
  };
  const onLeave = () => {
    pointer.active = false;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointerleave", onLeave);

  const onResize = () => {
    const oldW = width;
    measure();
    if (oldW > 0 && syncView() === false) {
      state.x = clamp(state.x * (width / oldW), 0, view.w);
    }
    state.laneY = clamp(state.laneY, view.h * 0.16, view.h * 0.86);
    render();
  };
  window.addEventListener("resize", onResize);

  return {
    setScheme(next) {
      scheme = next;
      palette.target = { ...PALETTES[next] };
      if (reduced) {
        palette = { ...PALETTES[next], target: { ...PALETTES[next] } };
        render();
      }
    },
    setActivity(next) {
      activity = next;
    },
    poke(kind) {
      const scale = whalescale();
      const head = headPoint(scale);
      if (kind === "typing") {
        if (bubbles.length > 14) return;
        for (let i = 0; i < 2; i += 1) {
          bubbles.push({
            x: head.x + (Math.random() - 0.5) * 18,
            y: head.y - 6,
            r: 1.6 + Math.random() * 2,
            vy: 14 + Math.random() * 14,
            life: 1.6,
            max: 1.6,
            seed: Math.random() * 6.28,
          });
        }
      } else if (kind === "send") {
        state.tailFlick = 1;
        for (let i = 0; i < 12; i += 1) {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
          const v = 30 + Math.random() * 55;
          spout.push({
            x: head.x,
            y: head.y - 4,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: 0.9 + Math.random() * 0.5,
            max: 1.4,
          });
        }
      }
    },
    setReducedMotion(next) {
      reduced = next;
      if (reduced) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        render();
      } else start();
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
    },
    get state() {
      return state;
    },
  };
}

/** "#141518" ↔ "rgb(...)" 之间插值（返回 canvas 可直接用的字符串） */
function parseColor(value) {
  if (Array.isArray(value)) return value;
  const v = String(value).trim();
  if (v.startsWith("#")) {
    const hex = v.slice(1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (m) return m[1].split(",").slice(0, 3).map((n) => parseFloat(n));
  return [255, 255, 255];
}

function mixColor(from, to, t) {
  const a = parseColor(from);
  const b = parseColor(to);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}


    /* =====================================================================
     * 小工具（背景层用）
     * ===================================================================*/
    const prefersReduced = () =>
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* =====================================================================
     * 小工具
     * ===================================================================*/
    const NO_PRESENTATION = () => true;

    function firstLine(text) {
      const newline = text.indexOf("\n");
      return newline === -1 ? text : text.slice(0, newline);
    }

    function latestCompletedParagraphFirstLine(text) {
      let summary = "";
      let paragraphStart = 0;
      const separator = /\r?\n(?:[\t ]*\r?\n)+/g;
      for (;;) {
        const nextParagraph = separator.exec(text);
        const paragraphEnd = nextParagraph === null ? text.length : nextParagraph.index + nextParagraph[0].indexOf("\n");
        const newline = text.indexOf("\n", paragraphStart);
        if (newline !== -1 && newline <= paragraphEnd) {
          const candidate = text.slice(paragraphStart, newline).trim();
          if (candidate !== "") summary = candidate;
        }
        if (nextParagraph === null) return summary;
        paragraphStart = nextParagraph.index + nextParagraph[0].length;
      }
    }

    function reasoningText(text) {
      if (!text || text[0] !== "<") return text;
      const opening = "<signature>";
      if (opening.startsWith(text)) return "";
      if (!text.startsWith(opening)) return text;
      const end = text.indexOf("</signature>", 11);
      if (end === -1) return "";
      let start = end + 12;
      while (start < text.length) {
        if (text[start] === "\n") start++;
        else if (text[start] === "\r" && text[start + 1] === "\n") start += 2;
        else break;
      }
      return text.slice(start);
    }

    function markdownLabels(t) {
      return {
        code: {
          copyLabel: t("copy"),
          copiedLabel: t("copied"),
          toolbarLabels: {
            codeLabel: t("codeBlock.title"),
            wrapLabel: t("codeBlock.wrap"),
            unwrapLabel: t("codeBlock.unwrap"),
          },
        },
        footnotes: t("markdown.footnotes"),
      };
    }

    /* =====================================================================
     * 逐字浮现的正文块
     * ===================================================================*/
    function RevealBlock({ text, labels, fileMentions, streaming, t }) {
      const hostRef = React.useRef(null);
      const machine = React.useRef(null);
      const fed = React.useRef(0);
      // 挂载时这条回复已经结束（历史消息）→ 直接走正式 Markdown，不演
      const [drained, setDrained] = React.useState(!streaming);

      React.useEffect(() => {
        if (!streaming) return undefined;
        const host = hostRef.current;
        if (!host) return undefined;
        syncTone();
        machine.current = createRevealer(host, {
          rate: 40,
          decoder: createMarkdownStream(host),
          onFrame(frame) {
            if (frame.done && frame.active === 0) setDrained(true);
          },
        });
        if (text) {
          // 挂载时已经有内容（切会话、或无 streaming 标记的首帧）：直接落字，不重演
          machine.current.push(text);
          machine.current.flush();
          fed.current = text.length;
        } else {
          fed.current = 0;
        }
        return () => {
          machine.current?.dispose();
          machine.current = null;
        };
      }, []);

      React.useEffect(() => {
        const target = machine.current;
        if (!target) return;
        if (text.length > fed.current) {
          target.push(text.slice(fed.current));
          fed.current = text.length;
        }
      }, [text]);

      React.useEffect(() => {
        if (!streaming) machine.current?.end();
      }, [streaming]);

      if (drained) {
        if (!P.MarkdownText) return h("div", null, text);
        return h(P.MarkdownText, { text, labels, fileMentions });
      }
      return h("div", { ref: hostRef, className: "dshr_reveal", "data-reveal": "character" });
    }

    /* =====================================================================
     * 思考行（移植自 chat 的 ReasoningRow，正文仍交给原生 Body Slot）
     * ===================================================================*/
    if (P.MarkdownText === undefined || P.DisclosureRow === undefined) {
      console.warn("[dsh-quiet] required UI primitives are missing; the effect stays off");
    }

    const THINK_ICON = P.IconThinkOutlineRegular ? h(P.IconThinkOutlineRegular, { size: 14 }) : null;

    function ReasoningRow(props) {
      const { rawText, running, usePresentation, useDisclosure, renderSlot, t } = props;
      const disclosure = useDisclosure ? useDisclosure() : { expanded: false, toggle: () => {} };
      const { expanded, toggle } = disclosure;
      const text = React.useMemo(() => reasoningText(rawText || ""), [rawText]);
      const summaryText = running ? latestCompletedParagraphFirstLine(text) : firstLine(text);
      const summary = React.useMemo(() => summaryText.replaceAll("**", ""), [summaryText]);
      const presentation = usePresentation || NO_PRESENTATION;
      const settledPreview = presentation(() => true);
      const preview = !expanded && summary !== "" && (running || settledPreview !== false);

      if (text !== rawText && text.trim() === "") return null;

      const collapsedContent = h(
        React.Fragment,
        null,
        h("span", { className: "dshr_sep", "data-shimmer-decoration": true, "aria-hidden": true }),
        h(
          "span",
          { className: "dshr_summary", "data-streaming": running || undefined },
          h(
            "span",
            { className: "dshr_summaryText" },
            P.TextShimmer ? h(P.TextShimmer, null, summary) : summary,
          ),
        ),
      );

      return h(
        "div",
        {
          className: "dshr_reason",
          "data-variant": "think",
          "data-state": running ? "running" : "ok",
          "data-expanded": expanded || undefined,
          "data-preview": preview || undefined,
        },
        running ? h("span", { style: { display: "none" } }, t("row.running")) : null,
        h(
          P.DisclosureRow,
          {
            icon: THINK_ICON,
            title: t("message.think"),
            running,
            open: expanded,
            expandable: true,
            expandOnRowClick: true,
            onToggle: toggle,
            collapsedContent,
          },
          expanded
            ? h("div", { className: "dshr_reasonBody" }, renderSlot("conversation.chat.reasoning.body", { rawText, text, running }))
            : null,
        ),
      );
    }

    /* =====================================================================
     * AI 回复这一格
     * ===================================================================*/
    /** 与原生 ProcessReasoning 同形的包装：ref 由 useGroupAction 交给折叠动画 */
    function ProcessInline({ hidden, reveal, useGroupAction, children }) {
      const ref = useGroupAction ? useGroupAction(hidden, reveal) : undefined;
      return h("div", { ref, "data-turn-process-inline": hidden || undefined }, children);
    }

    function AssistantCell(props) {
      const { node, groupPart, loadImage, useDisclosure, useGroupAction, turnProcess, renderSlot } = props;
      const t = typeof props.t === "function" ? props.t : (key) => key;
      const data = node && node.data ? node.data : { blocks: [], status: "closed" };
      const blocks = Array.isArray(data.blocks) ? data.blocks : [];
      const streaming = data.status === "running";
      const interrupted = data.status === "interrupted";
      const labels = React.useMemo(() => markdownLabels(t), [t]);

      const lastTextIndex = (() => {
        for (let i = blocks.length - 1; i >= 0; i -= 1) {
          const block = blocks[i];
          if (block && block.kind === "text" && block.text.trim() !== "") return i;
        }
        return -1;
      })();

      if (!(streaming || interrupted === true || blocks.some((block) => block.kind !== "tool-call"))) return null;

      const reasoningHidden =
        turnProcess !== undefined &&
        turnProcess.foldable === true &&
        turnProcess.spec !== undefined &&
        turnProcess.spec.answerStep === data.step &&
        turnProcess.spec.inlineReasoning === true &&
        !turnProcess.open;

      const revealProcess = () => {
        if (turnProcess && typeof turnProcess.setOpen === "function") turnProcess.setOpen(true);
      };

      const rendered = [];
      for (let i = 0; i < blocks.length; i += 1) {
        const block = blocks[i];
        if (!block) continue;
        if (groupPart === "reasoning" && block.kind !== "reasoning") continue;
        if (groupPart === "response" && block.kind === "reasoning") continue;

        if (block.kind === "text") {
          const live = streaming && i === lastTextIndex;
          rendered.push(
            h(RevealBlock, {
              key: i,
              text: block.text,
              labels,
              streaming: live,
              t,
            }),
          );
          continue;
        }

        if (block.kind === "reasoning") {
          if (!block.text || block.text.trim() === "") continue;
          rendered.push(
            h(
              ProcessInline,
              { key: i, hidden: reasoningHidden, reveal: revealProcess, useGroupAction },
              h(ReasoningRow, {
                rawText: block.text,
                running: streaming && i === blocks.length - 1,
                useDisclosure,
                renderSlot,
                t,
              }),
            ),
          );
          continue;
        }

        if (block.kind === "image") {
          const start = i;
          const group = [block];
          while (i + 1 < blocks.length) {
            const next = blocks[i + 1];
            if (!next || next.kind !== "image") break;
            group.push(next);
            i += 1;
          }
          rendered.push(
            h(React.Fragment, { key: "img" + start }, renderSlot("conversation.chat.message.images", {
              images: group.map((entry) => ({ attachment: entry.attachment })),
              loadImage,
              align: "start",
            })),
          );
          continue;
        }

        if (block.kind === "tool-call") continue;

        rendered.push(
          P.JsonBlock
            ? h(P.JsonBlock, {
                key: i,
                label: t("message.unknownBlock"),
                payload: block.block !== undefined ? block.block : block,
              })
            : null,
        );
      }

      const stoppedAllowed =
        interrupted &&
        (groupPart === undefined || groupPart === "response" || !blocks.some((block) => block.kind !== "reasoning" && block.kind !== "tool-call"));

      return h(
        "div",
        { className: "dshr_root", "data-streaming": streaming || undefined },
        h(
          "div",
          { className: "dshr_body" },
          rendered,
          stoppedAllowed ? h("span", { className: "dshr_stopped" }, t("message.stopped")) : null,
        ),
      );
    }

    /** 兜底：万一本插件渲染出错，回复仍然以纯文字出现，不会把聊天打空 */
    function PlainFallback({ node }) {
      const blocks = (node && node.data && Array.isArray(node.data.blocks) ? node.data.blocks : []).filter(
        (block) => block && block.kind === "text" && typeof block.text === "string",
      );
      return h(
        "div",
        { className: "dshr_root" },
        h(
          "div",
          { className: "dshr_body", style: { whiteSpace: "pre-wrap" } },
          blocks.map((block) => block.text).join("\n\n"),
        ),
      );
    }

    class SafeCell extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError() {
        return { failed: true };
      }
      componentDidCatch(error) {
        console.error("[dsh-quiet] render failed, falling back to plain text:", error);
      }
      render() {
        if (this.state.failed) return h(PlainFallback, this.props);
        return h(AssistantCell, this.props);
      }
    }


    /* =====================================================================
     * 背景层 + 日/夜配色
     * ===================================================================*/
    const TOKENS = {
      "--dsw-alias-bg-base": { light: "transparent", dark: "transparent" },
      "--dsw-alias-bg-layer-1": { light: "rgba(255,255,255,0.84)", dark: "rgba(23,24,28,0.88)" },
      "--dsw-alias-bg-layer-2": { light: "#f7f8f9", dark: "#1b1d21" },
      "--dsw-alias-bg-layer-3": { light: "#ffffff", dark: "#202226" },
      "--dsw-specific-sidebar-fill": { light: "rgba(255,255,255,0.72)", dark: "rgba(19,20,23,0.78)" },
      "--dsw-specific-bubble": { light: "#f3f4f6", dark: "#24262b" },
      "--dsw-alias-label-primary": { light: "#1f2329", dark: "#e6e7ea" },
      "--dsw-alias-label-secondary": { light: "#5b6472", dark: "#a6acb6" },
      "--dsw-alias-label-tertiary": { light: "#7c8593", dark: "#878d97" },
      "--dsw-alias-label-caption": { light: "#98a0ac", dark: "#71767f" },
      "--dsw-alias-border-l1": { light: "rgba(31,35,41,0.08)", dark: "rgba(230,231,234,0.08)" },
      "--dsw-alias-border-l2": { light: "rgba(31,35,41,0.12)", dark: "rgba(230,231,234,0.12)" },
      "--dsw-alias-border-l3": { light: "rgba(31,35,41,0.18)", dark: "rgba(230,231,234,0.16)" },
      "--dsw-alias-interactive-bg-hover": { light: "rgba(31,35,41,0.05)", dark: "rgba(230,231,234,0.06)" },
    };

    const TONE = { light: "#c3c8d2", dark: "#5b5f68" };

    /**
     * 聊天区的矩形：从输入框往上找第一个「够高、够宽、且顶端在标题栏之下」的祖先。
     * 不依赖哈希类名，面板开合、侧栏收起都跟着变。
     */
    function chatBounds() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const editing = document.querySelector('[contenteditable="true"], textarea');
      if (!editing) return null;
      let el = editing;
      while (el && el !== document.body) {
        const r = el.getBoundingClientRect();
        if (r.height >= vh * 0.6 && r.width >= vw * 0.3 && r.width <= vw + 1 && r.top >= -1 && r.bottom <= vh + 1) {
          return { x: r.left, y: r.top, width: r.width, height: r.height };
        }
        el = el.parentElement;
      }
      return null;
    }

    function mountBackdrop(ctx) {
      const layer = document.createElement("div");
      layer.className = "dshr-backdrop";
      layer.setAttribute("aria-hidden", "true");
      const canvas = document.createElement("canvas");
      layer.append(canvas);
      document.body.prepend(layer);
      document.body.dataset.dshr = "on";

      const theme = ctx.get("theme");
      const readScheme = () => (theme && theme.getTheme && theme.getTheme().active.colorScheme === "dark" ? "dark" : "light");
      let scheme = readScheme();

      const pathData = P.FISH_LOGO_PATH || "";
      const viewBox = P.FISH_LOGO_VIEWBOX || { width: 23.16, height: 17.04 };
      const backdrop = createBackdrop(canvas, {
        pathData,
        viewBox,
        scheme,
        reducedMotion: prefersReduced(),
        bounds: chatBounds,
      });
      requestAnimationFrame(() => layer.setAttribute("data-ready", ""));

      const applyScheme = (next, animate) => {
        scheme = next;
        document.body.dataset.dshrScheme = next;
        document.documentElement.style.setProperty("--dshr-from", TONE[next]);
        if (animate) {
          document.body.setAttribute("data-dshr-switching", "1");
          window.setTimeout(() => document.body.removeAttribute("data-dshr-switching"), 450);
        }
        backdrop.setScheme(next);
      };
      applyScheme(scheme, false);

      // 回复中：游快一点
      let activity = false;
      const tick = () => {
        const busy = document.querySelector("[data-streaming]") !== null;
        if (busy !== activity) {
          activity = busy;
          backdrop.setActivity(busy);
        }
      };
      const activityTimer = window.setInterval(tick, 400);

      // 打字冒泡 / 发送喷气
      const onKey = (event) => {
        const target = event.target;
        const editing =
          target instanceof HTMLElement &&
          (target.isContentEditable || target.tagName === "TEXTAREA" || target.closest('[contenteditable="true"]') !== null);
        if (!editing) return;
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          backdrop.poke("send");
          return;
        }
        if (event.key.length === 1 || event.key === "Backspace") backdrop.poke("typing");
      };
      const onClick = (event) => {
        const btn = event.target instanceof Element ? event.target.closest("button") : null;
        if (!btn) return;
        const label = `${btn.getAttribute("aria-label") || ""} ${btn.textContent || ""}`;
        if (/发送|send/i.test(label)) backdrop.poke("send");
      };
      document.addEventListener("keydown", onKey, true);
      document.addEventListener("click", onClick, true);

      const motionQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
      const onMotion = () => backdrop.setReducedMotion(Boolean(motionQuery && motionQuery.matches));
      if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener("change", onMotion);

      let offTheme;
      if (theme && typeof ctx.on === "function") {
        offTheme = ctx.on("theme/change", (snapshot) => {
          const next = snapshot && snapshot.active && snapshot.active.colorScheme === "dark" ? "dark" : "light";
          if (next !== scheme) applyScheme(next, true);
        });
      }

      return () => {
        window.clearInterval(activityTimer);
        document.removeEventListener("keydown", onKey, true);
        document.removeEventListener("click", onClick, true);
        if (motionQuery && motionQuery.removeEventListener) motionQuery.removeEventListener("change", onMotion);
        if (typeof offTheme === "function") offTheme();
        backdrop.dispose();
        layer.remove();
        delete document.body.dataset.dshr;
        delete document.body.dataset.dshrScheme;
      };
    }

    /* =====================================================================
     * 注册
     * ===================================================================*/
    // -50：低于默认（0），高于 ds-bot 气泡模式的 -100，
    // 所以气泡模式仍然归 ds-bot，原生界面才用这里的逐字浮现。
    const PRIORITY = -50;

    function apply(ctx) {
      const slots = ctx.get("slots");
      if (!slots) {
        console.warn("[dsh-quiet] slot service unavailable; plugin idle");
        return;
      }
      installStyles();
      syncTone();

      const theme = ctx.get("theme");
      if (theme && typeof theme.overrideTokens === "function") {
        ctx.effect(() => theme.overrideTokens("dsh-quiet", TOKENS), "dsh-quiet: palette");
      }

      try {
        ctx.effect(() => mountBackdrop(ctx), "dsh-quiet: backdrop");
      } catch (error) {
        console.error("[dsh-quiet] backdrop failed to mount:", error);
      }

      // 必须等 chat 声明了这个 slot 再注册（slots.inject 会跟随它出现/消失）
      ctx.effect(
        () =>
          slots.inject("conversation.chat.node", () =>
            slots.register(
              {
                name: "conversation.chat.node",
                key: "assistant-step",
                priority: PRIORITY,
                locale: "chat",
                children: {
                  "conversation.chat.reasoning.body": { kind: "single", scope: "session" },
                  "conversation.chat.message.images": { kind: "single", scope: "session" },
                },
              },
              SafeCell,
            ),
          ),
        "dsh-quiet: assistant cell",
      );
    }

    exports.name = "dsh-quiet";
    exports.inject = ["slots", "theme"];
    exports.apply = apply;
    return module.exports;
  },
});
