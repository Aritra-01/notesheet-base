const task = await taskSpace("notesheet-rect");
const page = task.page("p1");

await page.goto("http://localhost:3001/");
await page.waitForTimeout(1000);

await page.setInputFiles("input[type=file]", [
  "C:/Users/NEEL/Downloads/Deepseek Harness/notesheet-base/test-20pages.pdf"
]);

await page.waitForTimeout(2000);

const info = await page.evaluate(() => {
  const btn = document.getElementById("process-btn");
  const rect = btn.getBoundingClientRect();
  const side = document.querySelector(".ws-column-side");
  const sideRect = side.getBoundingClientRect();
  const computed = window.getComputedStyle(btn);
  const sideComputed = window.getComputedStyle(side);
  return {
    btn: {
      disabled: btn.disabled,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
    },
    side: {
      rect: { top: sideRect.top, bottom: sideRect.bottom, height: sideRect.height },
      position: sideComputed.position,
      top: sideComputed.top,
      overflow: sideComputed.overflow,
    },
    window: {
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      scrollY: window.scrollY
    }
  };
});

console.log("Button Info:", JSON.stringify(info, null, 2));

await task.finish({ keep: [] });
