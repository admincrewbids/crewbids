export async function extractPdfPagesFromFile(file: File): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
  } as any);

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const items = content.items
      .filter((item: any) => "str" in item && item.str?.trim())
      .map((item: any) => {
        const x = item.transform?.[4] ?? 0;
        const y = item.transform?.[5] ?? 0;

        return {
          str: item.str.trim(),
          x,
          y,
        };
      });

    // Sort top-to-bottom, then left-to-right
    items.sort((a, b) => {
      const yDiff = Math.abs(b.y - a.y);

      // Same visual line
      if (yDiff < 3) {
        return a.x - b.x;
      }

      // PDF coords usually have larger y higher on page
      return b.y - a.y;
    });

    const lines: { y: number; parts: { x: number; str: string }[] }[] = [];

    for (const item of items) {
      const existingLine = lines.find((line) => Math.abs(line.y - item.y) < 3);

      if (existingLine) {
        existingLine.parts.push({ x: item.x, str: item.str });
      } else {
        lines.push({
          y: item.y,
          parts: [{ x: item.x, str: item.str }],
        });
      }
    }

    const text = lines
      .map((line) => {
        line.parts.sort((a, b) => a.x - b.x);
        return line.parts.map((p) => p.str).join(" ");
      })
      .join("\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();

    pages.push(text);
  }

  return pages;
}