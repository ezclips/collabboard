const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1600, height: 900 }
  });
  const page = await browser.newPage();
  
  let frames = [];
  
  await page.exposeFunction('captureFrame', (data) => {
    frames.push(data);
  });

  await page.evaluateOnNewDocument(() => {
    window.addEventListener('DOMContentLoaded', () => {
      let frameCount = 0;
      let clusterSeen = false;
      let framesSinceSeen = 0;
      
      const sample = () => {
        const cluster = document.querySelector('.bg-white.rounded-lg.shadow-lg.border.border-gray-200.flex.items-center.p-1.gap-1.pointer-events-auto');
        const wrapper = cluster ? cluster.closest('.absolute.top-4') : null;
        
        if (cluster) {
           clusterSeen = true;
           framesSinceSeen++;
        }
        
        if (framesSinceSeen > 60 || frameCount > 300) {
           window.captureFrame({ done: true });
           return;
        }
        
        frameCount++;
        
        let data = { frameId: frameCount, time: Date.now() };
        if (wrapper) {
           const wRect = wrapper.getBoundingClientRect();
           data.wrapper = { x: wRect.x, y: wRect.y, left: wrapper.style.left, width: wRect.width };
        }
        
        if (cluster || wrapper) {
           window.captureFrame(data);
        }
        
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });

  try {
     await page.goto('http://localhost:3000/dashboard/canvas/d7b5e7ec-dc2b-4f82-8c3f-14499a0b4886', { waitUntil: 'networkidle0', timeout: 15000 });
  } catch (e) {
     console.error("Navigation timeout", e.message);
  }
  
  // Wait a bit just in case we are still sampling
  await new Promise(r => setTimeout(r, 1000));

  fs.writeFileSync('C:\\Users\\rmeic\\Projects\\dev\\starter\\audit_frames.json', JSON.stringify(frames, null, 2));
  await browser.close();
})();
