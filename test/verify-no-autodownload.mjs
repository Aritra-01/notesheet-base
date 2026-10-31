const task = await taskSpace("verify-no-autodl");
const page = task.page("p1");

await page.goto("http://localhost:3001/");
await page.waitForTimeout(1000);

await page.setInputFiles("input[type=file]", [
  "C:/Users/NEEL/Downloads/Deepseek Harness/notesheet-base/test-sample.pdf"
]);

await page.waitForTimeout(1500);

// Track if any download event fires automatically
let autoDownloadFired = false;
page.waitForEvent("download", { timeout: 3000 }).then(() => {
  autoDownloadFired = true;
}).catch(() => {
  // Expected to time out because auto-download is disabled
});

console.log("Triggering click via evaluate...");
await page.evaluate(() => document.getElementById("process-btn").click());

// Wait 3 seconds for creation to finish
await page.waitForTimeout(3000);

const state = await page.evaluate(() => {
  const resultBox = document.getElementById("result-box");
  const dlLink = document.getElementById("download-link");
  return {
    isResultVisible: !resultBox?.hidden,
    downloadHref: dlLink?.getAttribute("href"),
    downloadText: dlLink?.textContent?.trim()
  };
});

console.log("Result state:", JSON.stringify(state));
console.log("Auto-download fired automatically?:", autoDownloadFired);

if (!autoDownloadFired && state.isResultVisible) {
  console.log("SUCCESS: PDF ready and waiting for user to click Download PDF button!");
} else {
  console.error("FAIL: Did not match expected behavior");
}

await task.finish({ keep: [] });
