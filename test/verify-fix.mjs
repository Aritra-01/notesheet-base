const task = await taskSpace("verify-fix");
const page = task.page("p1");

await page.goto("http://localhost:3001/");
await page.waitForTimeout(1000);

// Upload 20-page test PDF
await page.setInputFiles("input[type=file]", [
  "C:/Users/NEEL/Downloads/Deepseek Harness/notesheet-base/test-20pages.pdf"
]);
console.log("Uploaded test-20pages.pdf");

// Wait 2 seconds for document to load and workspace to appear
await page.waitForTimeout(2000);

// Check button position and visibility
const btnStatus = await page.evaluate(() => {
  const btn = document.getElementById("process-btn");
  const rect = btn.getBoundingClientRect();
  return {
    top: rect.top,
    bottom: rect.bottom,
    height: rect.height,
    disabled: btn.disabled,
    text: btn.textContent?.trim(),
    windowHeight: window.innerHeight
  };
});
console.log("Button visible status:", JSON.stringify(btnStatus));

// Click the button using ego-browser click directly!
console.log("Clicking #process-btn with page.click()...");
await page.click("#process-btn");
console.log("page.click() succeeded without error!");

// Wait 4 seconds for processing to finish
await page.waitForTimeout(4000);

const finalState = await page.evaluate(() => {
  return {
    btnText: document.getElementById("process-btn")?.textContent?.trim(),
    btnDisabled: document.getElementById("process-btn")?.disabled,
    resultVisible: !document.getElementById("result-box")?.hidden,
    downloadHref: document.getElementById("download-link")?.getAttribute("href"),
    downloadText: document.getElementById("download-link")?.textContent?.trim(),
    meta: document.getElementById("result-meta")?.textContent,
    errorVisible: !document.getElementById("preview-error-alert")?.hidden,
    errorText: document.getElementById("preview-error-alert")?.textContent
  };
});

console.log("Final State:", JSON.stringify(finalState, null, 2));

await task.finish({ keep: [] });
