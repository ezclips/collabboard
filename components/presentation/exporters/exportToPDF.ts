import type { FrameSlide, RenderSlideToPNG } from "../PresentationPanel";

export async function exportSlidesToPDF({
  slides,
  renderSlideToPNG,
  fileName,
}: {
  slides: FrameSlide[];
  renderSlideToPNG: RenderSlideToPNG;
  fileName: string;
}) {
  const { jsPDF } = await import("jspdf");
  const saveAs = (await import("file-saver")).default;

  // 16:9 landscape page (points)
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: [1280, 720],
  });

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];

    const scale = slide.height > 0 ? 1080 / slide.height : 1;
    const png = await renderSlideToPNG(slide, {
      scale: scale * 2,
      background: "#ffffff",
      paddingPx: 32,
    });

    if (i > 0) pdf.addPage([1280, 720], "landscape");
    pdf.addImage(png, "PNG", 0, 0, 1280, 720, undefined, "FAST");
  }

  const blob = pdf.output("blob");
  saveAs(blob, fileName);
}
