const task = await taskSpace("notesheet-click");
const page = task.page("p1");

// Collect all page console messages
const logs = [];
await page.cdp("Runtime.enable");

await page.goto("http://localhost:3001/");
await page.waitForTimeout(1000);

await page.setInputFiles("input[type=file]", [
  "C:/Users/NEEL/Downloads/Deepseek Harness/notesheet-base/test-20pages.pdf"
]);
console.log("Uploaded test-20pages.pdf");

await page.waitForTimeout(1500);

// Click directly via evaluate
console.log("Triggering click via DOM evaluate...");
const clickResult = await page.evaluate(() => {
  const btn = document.getElementById("process-btn");
  if (!btn) return "Button not found";
  if (btn.disabled) return "Button is disabled!";
  btn.click();
  return "Clicked successfully";
});
console.log("Click result:", clickResult);

// Watch progress for 10 seconds
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(500);
  const status = await page.evaluate(() => {
    return {
      progressText: document.getElementById("progress-text")?.textContent,
      progressBar: document.getElementById("progress-bar")?.style?.width,
      isProgressHidden: document.getElementById("progress-box")?.hidden,
      isResultVisible: !document.getElementById("result-box")?.hidden,
      errorText: document.getElementById("error-alert")?.textContent,
      errorHidden: document.getElementById("error-alert")?.hidden,
      downloadHref: document.getElementById("download-link")?.getAttribute("href"),
      resultMeta: document.getElementById("result-meta")?.textContent
    };
  });
  console.log(`[${(i + 1) * 0.5}s]`, JSON.stringify(status));
  if (status.isResultVisible || !status.errorHidden) break;
}

await task.finish({ keep: [] });
