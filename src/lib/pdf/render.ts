import { chromium, type Browser } from "playwright-core";

const MAX_CONCURRENCY = Math.max(1, Number(process.env.PDF_MAX_CONCURRENCY ?? 2));

const globalForBrowser = globalThis as unknown as {
  __qgsBrowser?: Promise<Browser>;
};

let active = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENCY) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
}

function release(): void {
  active -= 1;
  const next = waiting.shift();
  if (next) next();
}

async function browser(): Promise<Browser> {
  if (!globalForBrowser.__qgsBrowser) {
    globalForBrowser.__qgsBrowser = chromium
      .launch({
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      })
      .then((instance) => {
        instance.on("disconnected", () => {
          globalForBrowser.__qgsBrowser = undefined;
        });
        return instance;
      })
      .catch((error) => {
        globalForBrowser.__qgsBrowser = undefined;
        throw error;
      });
  }
  return globalForBrowser.__qgsBrowser;
}

export async function renderPdf(html: string): Promise<Buffer> {
  await acquire();
  let context: Awaited<ReturnType<Browser["newContext"]>> | undefined;

  try {
    const instance = await browser();
    context = await instance.newContext();
    const page = await context.newPage();

    // Do not disable JavaScript: document.fonts.ready needs the event loop,
    // and skipping it produces fallback (broken) Myanmar shaping.
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.emulateMedia({ media: "print" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `
        <div style="width:100%;padding:0 14mm;font-size:8px;color:#64748b;
                    display:flex;justify-content:space-between;font-family:Arial,sans-serif;">
          <span>VitalTech Myanmar · Quotation</span>
          <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
      margin: { top: "14mm", right: "12mm", bottom: "16mm", left: "12mm" },
    });

    return Buffer.from(pdf);
  } finally {
    await context?.close().catch(() => undefined);
    release();
  }
}
