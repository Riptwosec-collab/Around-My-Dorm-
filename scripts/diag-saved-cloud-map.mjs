import { chromium } from "@playwright/test";

const target = process.env.DIAG_URL || "https://around-my-dorm.aidsaras.workers.dev/map/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1125, height: 738 }, deviceScaleFactor: 1 });

const consoleMessages = [];
const pageErrors = [];
const failedRequests = [];
const tileResponses = [];

page.on("console", (message) => {
  consoleMessages.push({ type: message.type(), text: message.text() });
});
page.on("pageerror", (error) => {
  pageErrors.push(error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ""}` : String(error));
});
page.on("requestfailed", (request) => {
  failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" });
});
page.on("response", (response) => {
  if (response.url().includes("tile.openstreetmap.org")) {
    tileResponses.push({ url: response.url(), status: response.status(), ok: response.ok(), headers: response.headers() });
  }
});

let navigationError = null;
try {
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(12_000);
} catch (error) {
  navigationError = error instanceof Error ? error.message : String(error);
}

const snapshot = await page.evaluate(() => {
  const saved = document.querySelector('[data-testid="saved-cloud-map"]');
  const canvas = document.querySelector(".maplibregl-canvas");
  const canvasContainer = document.querySelector(".maplibregl-canvas-container");
  const controlContainer = document.querySelector(".maplibregl-control-container");
  const home = document.querySelector('[aria-label="บ้านสุภาอพาร์ทเม้นต์"]');
  const mapFrame = document.querySelector(".amd-map-frame");

  const inspect = (element) => {
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      tag: element.tagName,
      className: element.className,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      position: style.position,
      zIndex: style.zIndex,
      background: style.background,
      transform: style.transform,
    };
  };

  let webgl = null;
  if (canvas instanceof HTMLCanvasElement) {
    try {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      webgl = gl ? {
        available: true,
        drawingBufferWidth: gl.drawingBufferWidth,
        drawingBufferHeight: gl.drawingBufferHeight,
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
      } : { available: false };
    } catch (error) {
      webgl = { available: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    url: location.href,
    title: document.title,
    savedMapState: saved?.getAttribute("data-map-state") || null,
    saved: inspect(saved),
    mapFrame: inspect(mapFrame),
    canvas: inspect(canvas),
    canvasAttributes: canvas instanceof HTMLCanvasElement ? { width: canvas.width, height: canvas.height } : null,
    canvasContainer: inspect(canvasContainer),
    controlContainer: inspect(controlContainer),
    home: inspect(home),
    canvasCount: document.querySelectorAll(".maplibregl-canvas").length,
    controlCount: document.querySelectorAll(".maplibregl-control-container").length,
    markerCount: document.querySelectorAll(".maplibregl-marker").length,
    homeCount: document.querySelectorAll('[aria-label="บ้านสุภาอพาร์ทเม้นต์"]').length,
    errorBannerText: Array.from(document.querySelectorAll("div")).map((node) => node.textContent || "").find((text) => text.includes("Saved Cloud Map โหลดไม่สำเร็จ") || text.includes("Saved Cloud Map error")) || null,
    bodyTextHasSavedMap: document.body.innerText.includes("Saved Cloud Map"),
    webgl,
  };
});

await page.screenshot({ path: "saved-cloud-map-production.png", fullPage: true });

const report = {
  target,
  navigationError,
  snapshot,
  tileResponseCount: tileResponses.length,
  tileResponses: tileResponses.slice(0, 20),
  failedRequests: failedRequests.slice(0, 50),
  pageErrors,
  consoleMessages: consoleMessages.filter((entry) => entry.type === "error" || entry.type === "warning").slice(0, 100),
};

console.log("=== SAVED CLOUD MAP PRODUCTION DIAGNOSTIC ===");
console.log(JSON.stringify(report, null, 2));
await browser.close();
