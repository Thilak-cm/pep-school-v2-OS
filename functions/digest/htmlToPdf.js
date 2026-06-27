/**
 * Convert rendered digest HTML to PDF using Puppeteer.
 *
 * Uses puppeteer-core + @sparticuz/chromium so the Chromium binary
 * ships inside node_modules (deployed with the CF bundle) instead of
 * relying on a cache directory that doesn't survive deployment.
 *
 * Used to attach classroom digests as PDFs to the exec email —
 * PDFs are previewable inline in Gmail/iOS Mail without downloading.
 */

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

/**
 * Convert multiple HTML strings to PDFs sequentially.
 * Shares a single browser instance for efficiency.
 *
 * @param {Array<{html: string, filename: string}>} items
 * @returns {Promise<Array<{filename: string, content: string}>>} Resend-ready attachments (base64)
 */
export async function batchHtmlToPdf(items) {
  if (!items.length) return [];

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  try {
    const results = [];
    for (const item of items) {
      const page = await browser.newPage();
      await page.setContent(item.html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({
        format: "A4",
        margin: { top: "16px", right: "16px", bottom: "16px", left: "16px" },
        printBackground: true,
      });
      await page.close();
      results.push({
        filename: item.filename.replace(/\.html$/, ".pdf"),
        content: Buffer.from(pdf).toString("base64"),
      });
    }
    return results;
  } finally {
    await browser.close();
  }
}
