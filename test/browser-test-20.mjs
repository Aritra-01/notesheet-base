const task = await taskSpace("notesheet-debug-20");
const page = task.page("p1");

await page.goto("http://localhost:3001/");
await page.waitForLoadState("networkidle");

console.log("Navigated to localhost:3001");

// Set the input files to 20-page pdf
await page.setInputFiles("input[type=file]", [
  "C:/Users/NEEL/Downloads/Deepseek Harness/notesheet-base/test-20pages.pdf"
]);
console.log("Uploaded test-20pages.pdf");

// Wait for document to load and render preview
await page.waitForTimeout(2000);

// Capture any browser console error
const browserErrors = [];
await page.evaluate(() => {
  window.addEventListener('error', (e) => {
    console.error('WINDOW ERROR:', e.message, e.filename, e.lineno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('UNHANDLED REJECTION:', e.reason);
  });
});

console.log("Scrolling Create Print-Ready PDF button into view and clicking...");
await page.evaluate(() => {
  const btn = document.getElementById("process-btn");
  btn.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(500);

// Click Create PDF button
await page.click("#process-btn");

// Monitor progress every 500ms
let done = false;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(500);
  const status = await page.evaluate(() => {
    const err = document.getElementById("error-alert");
    const progressBox = document.getElementById("progress-box");
    const progressText = document.getElementById("progress-text")?.textContent;
    const progressBar = document.getElementById("progress-bar")?.style?.width;
    const resultBox = document.getElementById("result-box");
    const btn = document.getElementById("process-btn");
    return {
      error: !err?.hidden ? err?.textContent : null,
      progressHidden: progressBox?.hidden,
      progressText,
      progressBar,
      isResultVisible: !resultBox?.hidden,
      btnDisabled: btn?.disabled,
      downloadHref: document.getElementById("download-link")?.getAttribute("href"),
      busyAlert: document.getElementById("busy-alert")?.textContent
    };
  });
  console.log(`[T+${(i + 1) * 0.5}s]`, JSON.stringify(status));
  if (status.isResultVisible || status.error) {
    done = true;
    break;
  }
}

const finalState = await page.evaluate(() => {
  return {
    errorAlert: document.getElementById("error-alert")?.textContent,
    errorHidden: document.getElementById("error-alert")?.hidden,
    resultVisible: !document.getElementById("result-box")?.hidden,
    downloadHref: document.getElementById("download-link")?.getAttribute("href"),
    downloadText: document.getElementById("download-link")?.textContent?.trim(),
    meta: document.getElementById("result-meta")?.textContent,
  };
});
console.log("Final State:", JSON.stringify(finalState, null, 2));

await task.finish({ keep: [] });
