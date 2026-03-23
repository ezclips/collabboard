import type { FrameSlide, RenderSlideToPNG } from "../PresentationPanel";

function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export async function exportSlidesToPPTX({
  slides,
  renderSlideToPNG,
  fileName,
}: {
  slides: FrameSlide[];
  renderSlideToPNG: RenderSlideToPNG;
  fileName: string;
}) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const saveAs = (await import("file-saver")).default;

  const pptx = new PptxGenJS();
  // 16:9 widescreen: 13.333" × 7.5"
  pptx.layout = "LAYOUT_WIDE";

  const SLIDE_W = 13.333;
  const SLIDE_H = 7.5;

  for (const slide of slides) {
    const scale = slide.height > 0 ? 1080 / slide.height : 1;
    const png = await renderSlideToPNG(slide, {
      scale: scale * 2,
      background: "#ffffff",
      paddingPx: 32,
    });

    const base64 = dataUrlToBase64(png);
    const s = pptx.addSlide();
    s.addImage({
      data: `image/png;base64,${base64}`,
      x: 0,
      y: 0,
      w: SLIDE_W,
      h: SLIDE_H,
    });
  }

  const blob = await pptx.write({ outputType: "blob" });
  saveAs(blob as Blob, fileName);
}
