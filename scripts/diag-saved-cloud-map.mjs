import { chromium } from "@playwright/test";

const target = process.env.DIAG_URL || "https://around-my-dorm.aidsaras.workers.dev/map/";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1125, height: 738 }, deviceScaleFactor: 1 });

const consoleMessages = [];
const pageErrors = [];
const failedRequests = [];
const tileResponses = [];

page.on("console", (message) => consoleMessages.push({ type: message.type(), text: message.text() }));
page.on("pageerror", (error) => pageErrors.push(error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ""}` : String(error)));
page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" }));
page.on("response", (response) => {
  if (response.url().includes("tile.openstreetmap.org")) tileResponses.push({ url: response.url(), status: response.status(), ok: response.ok() });
});

let navigationError = null;
try {
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(8_000);
} catch (error) {
  navigationError = error instanceof Error ? error.message : String(error);
}

async function captureSnapshot() {
  return page.evaluate(() => {
    const saved = document.querySelector('[data-testid="saved-cloud-map"]');
    const mapElement = document.querySelector(".maplibregl-map");
    const canvas = document.querySelector(".maplibregl-canvas");
    const canvasContainer = document.querySelector(".maplibregl-canvas-container");
    const controlContainer = document.querySelector(".maplibregl-control-container");
    const homeMarker = document.querySelector(".maplibregl-marker");
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
        inlineStyle: element.getAttribute("style"),
      };
    };

    let webgl = null;
    if (canvas instanceof HTMLCanvasElement) {
      try {
        const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
        webgl = gl ? { available: true, drawingBufferWidth: gl.drawingBufferWidth, drawingBufferHeight: gl.drawingBufferHeight } : { available: false };
      } catch (error) {
        webgl = { available: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      savedMapState: saved?.getAttribute("data-map-state") || null,
      mapFrame: inspect(mapFrame),
      saved: inspect(saved),
      mapElement: inspect(mapElement),
      canvas: inspect(canvas),
      canvasAttributes: canvas instanceof HTMLCanvasElement ? { width: canvas.width, height: canvas.height } : null,
      canvasContainer: inspect(canvasContainer),
      controlContainer: inspect(controlContainer),
      homeMarker: inspect(homeMarker),
      markerCount: document.querySelectorAll(".maplibregl-marker").length,
      controlButtonCount: document.querySelectorAll(".maplibregl-ctrl button").length,
      webgl,
    };
  });
}

const before = await captureSnapshot();
await page.screenshot({ path: "saved-cloud-map-production-before-resize.png", fullPage: true });

await page.setViewportSize({ width: 1124, height: 739 });
await page.waitForTimeout(3_000);
await page.setViewportSize({ width: 1125, height: 738 });
await page.waitForTimeout(4_000);

const after = await captureSnapshot();
await page.screenshot({ path: "saved-cloud-map-production-after-resize.png", fullPage: true });

const report = {
  target,
  navigationError,
  before,
  after,
  tileResponseCount: tileResponses.length,
  tileResponses: tileResponses.slice(0, 30),
  failedRequests: failedRequests.slice(0, 50),
  pageErrors,
  consoleMessages: consoleMessages.filter((entry) => entry.type === "error" || entry.type === "warning").slice(0, 100),
};

console.log("=== SAVED CLOUD MAP RESIZE DIAGNOSTIC ===");
console.log(JSON.stringify(report, null, 2));
await browser.close();
