import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(process.env.URL ?? "http://localhost:3000/es", { waitUntil: "networkidle" });
const info = await page.evaluate(() => {
  const accent = document.querySelector(".nr-brand-accent");
  if (!accent) return { found: false };
  const style = getComputedStyle(accent);
  const letter = accent.querySelector("span");
  const letterStyle = letter ? getComputedStyle(letter) : null;
  return {
    found: true,
    html: accent.outerHTML.slice(0, 300),
    fontFamily: style.fontFamily,
    backgroundImage: style.backgroundImage,
    color: style.color,
    fill: letterStyle?.webkitTextFillColor,
    clip: letterStyle?.webkitBackgroundClip,
    animation: letterStyle?.animationName,
    transform: letterStyle?.transform,
    animationPlayState: letterStyle?.animationPlayState,
  };
});
console.log(JSON.stringify(info, null, 2));
await page.locator(".nr-brand-button").screenshot({ path: process.env.OUT ?? "logo-live.png", animations: "allow" });
await browser.close();
