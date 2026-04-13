export async function extractPdfPagesFromFile(file: File): Promise<string[]> {
  const isE1644Debug = file.name?.toLowerCase?.() === "e1644.pdf";
  const logStep = (message: string) => {
    if (!isE1644Debug) return;
    console.log(`[pdfTextExtractor:${file.name}] ${message}`);
  };

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
  logStep(`document loaded -> numPages=${pdf.numPages}`);
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    let page: any;
    try {
      logStep(`page ${pageNum}: before getPage`);
      page = await pdf.getPage(pageNum);
      logStep(`page ${pageNum}: after getPage`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logStep(`page ${pageNum}: getPage failed -> ${message}`);
      throw new Error(
        `extractPdfPagesFromFile failed at page ${pageNum} during getPage: ${message}`
      );
    }

    let content: any;
    try {
      logStep(`page ${pageNum}: before getTextContent`);
      content = await page.getTextContent();
      logStep(`page ${pageNum}: after getTextContent`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logStep(`page ${pageNum}: getTextContent failed -> ${message}`);
      throw new Error(
        `extractPdfPagesFromFile failed at page ${pageNum} during getTextContent: ${message}`
      );
    }

    let rawItems: any[] = [];
    try {
      logStep(`page ${pageNum}: before normalizing content.items`);
      rawItems = Array.isArray(content.items)
        ? content.items
        : Array.from(content.items ?? []);
      logStep(
        `page ${pageNum}: after normalizing content.items -> rawItemCount=${rawItems.length}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logStep(`page ${pageNum}: normalize content.items failed -> ${message}`);
      throw new Error(
        `extractPdfPagesFromFile failed at page ${pageNum} during normalize content.items: ${message}`
      );
    }

    let items: { str: string; x: number; y: number }[] = [];
    try {
      logStep(`page ${pageNum}: before mapping text items`);
      items = rawItems
        .map((item: any) => {
          const text = String(item?.str ?? "").trim();
          const x = item.transform?.[4] ?? 0;
          const y = item.transform?.[5] ?? 0;

          return {
            str: text,
            x,
            y,
          };
        })
        .filter((item) => item.str.length > 0);
      logStep(
        `page ${pageNum}: after mapping text items -> filteredItemCount=${items.length}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logStep(`page ${pageNum}: map/filter text items failed -> ${message}`);
      throw new Error(
        `extractPdfPagesFromFile failed at page ${pageNum} during map/filter text items: ${message}`
      );
    }

    try {
      logStep(`page ${pageNum}: before sorting/grouping/joining page text`);

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
      logStep(
        `page ${pageNum}: after sorting/grouping/joining page text -> textLength=${text.length}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logStep(`page ${pageNum}: sort/group/join page text failed -> ${message}`);
      throw new Error(
        `extractPdfPagesFromFile failed at page ${pageNum} during sort/group/join page text: ${message}`
      );
    }
  }

  return pages;
}
