import fs from 'node:fs';

const task = await taskSpace("notesheet-debug");
const page = task.page("p1");

// Listen to console and errors
await page.cdp("Runtime.enable");

const consoleMessages = [];
const errors = [];

await page.goto("http://localhost:3001/");
await page.waitForLoadState("networkidle");

console.log("Navigated to localhost:3001");

// Set the input files
await page.setInputFiles("input[type=file]", [
  "C:/Users/NEEL/Downloads/Deepseek Harness/notesheet-base/test-sample.pdf"
]);

console.log("Uploaded test-sample.pdf");

// Wait 2 seconds for document to load and render preview
await page.waitForTimeout(2000);

// Take snapshot of page
console.log(await page.snapshot());

// Click Create PDF button
console.log("Clicking Create Print-Ready PDF button...");
await page.click("#process-btn");

// Wait 5 seconds to observe processing or error
await page.waitForTimeout(5000);

const finalSnapshot = await page.snapshot();
console.log("Final snapshot:");
console.log(finalSnapshot);

const errorText = await page.evaluate(() => {
  const errEl = document.getElementById("error-alert");
  const resultBox = document.getElementById("result-box");
  const progressBox = document.getElementById("progress-box");
  const btn = document.getElementById("process-btn");
  return {
    errorVisible: !errEl?.hidden,
    errorText: errEl?.textContent,
    resultVisible: !resultBox?.hidden,
    progressVisible: !progressBox?.hidden,
    buttonDisabled: btn?.disabled,
    html: document.querySelector(".ws-column-side")?.innerHTML
  };
});

console.log("DOM State:", JSON.stringify(errorText, null, 2));

await task.finish({ keep: [] });
