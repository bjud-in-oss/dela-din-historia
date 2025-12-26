
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { DriveFile, FileType, CompressionLevel, TextConfig, RichTextLine, PageMetadata } from '../types';
import { fetchFileBlob } from './driveService';

// Initialize PDF.js worker
// Use dynamic version to match the installed API version and avoid mismatch errors
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const A4_WIDTH = 595.28; 
const PDF_OVERHEAD_BASE = 15000; 
const PDF_OVERHEAD_PER_PAGE = 4000;

// --- UTILS ---

// Fix for TypeScript Blob errors in build environment
const createBlob = (data: ArrayBuffer | Uint8Array, type: string): Blob => {
    return new Blob([data as any], { type });
};

const compressImageBuffer = async (buffer: ArrayBuffer, level: CompressionLevel): Promise<ArrayBuffer> => {
    let quality = 0.9;
    let maxWidth = 2500;

    if (level === 'medium') {
        quality = 0.7;
        maxWidth = 1600;
    } else if (level === 'high') { 
        quality = 0.5;
        maxWidth = 1024;
    }

    return new Promise((resolve) => {
        try {
            const blob = createBlob(buffer, 'image/jpeg');
            const url = URL.createObjectURL(blob);
            const img = new Image();
            
            img.onload = () => {
                URL.revokeObjectURL(url);
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    const scaleFactor = maxWidth / width;
                    width = maxWidth;
                    height = height * scaleFactor;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                if (!ctx) {
                    resolve(buffer); 
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((newBlob) => {
                    if (newBlob) {
                        newBlob.arrayBuffer().then(resolve).catch(() => resolve(buffer));
                    } else {
                        resolve(buffer);
                    }
                }, 'image/jpeg', quality);
            };

            img.onerror = () => {
                console.warn("Image compression failed (load error), using original.");
                URL.revokeObjectURL(url);
                resolve(buffer); 
            };

            img.src = url;
        } catch (e) {
            console.warn("Image compression crashed, using original.", e);
            resolve(buffer);
        }
    });
};

// --- PROCESS FILE ---

export const processFileForCache = async (
    file: DriveFile, 
    accessToken: string, 
    level: CompressionLevel
): Promise<{ buffer: ArrayBuffer, size: number }> => {
    
    // 1. Check Cache
    if (file.processedBuffer && file.compressionLevelUsed === level) {
        return { buffer: file.processedBuffer, size: file.processedSize || file.processedBuffer.byteLength };
    }

    let rawBuffer: ArrayBuffer;

    // 2. Fetch Content
    try {
        // Fallback strategy: Try Blob URL first, then Drive API
        let fetchSuccess = false;
        
        if (file.blobUrl && file.isLocal) {
            try {
                const res = await fetch(file.blobUrl);
                if (res.ok) {
                    rawBuffer = await res.arrayBuffer();
                    fetchSuccess = true;
                }
            } catch (e) { console.warn(`Blob URL failed for ${file.name}, trying API fallback...`); }
        }

        if (!fetchSuccess) {
            if (!accessToken) throw new Error("Ingen behörighet (AccessToken saknas)");
            const blob = await fetchFileBlob(accessToken, file.id, file.type === FileType.GOOGLE_DOC);
            rawBuffer = await blob.arrayBuffer();
        }
        
    } catch (e: any) {
        console.error(`Failed to process ${file.name}:`, e);
        throw new Error(`Kunde inte ladda: ${e.message}`);
    }

    // 3. Compress if Image
    if (file.type === FileType.IMAGE) {
        const compressed = await compressImageBuffer(rawBuffer!, level);
        return { buffer: compressed, size: compressed.byteLength };
    }

    return { buffer: rawBuffer!, size: rawBuffer!.byteLength };
};

// --- CHUNKING ---

export interface PdfChunk {
    title: string;
    items: DriveFile[];
    estimatedSizeMB: number;
    partNumber: number;
    isFullyOptimized: boolean; 
    contentHash: string; 
}

export const calculateChunks = (
    items: DriveFile[], 
    baseTitle: string, 
    maxMB: number = 15.0,
    compressionLevel: CompressionLevel = 'medium',
    safetyMarginPercent: number = 5
): PdfChunk[] => {
    let chunks: PdfChunk[] = [];
    let currentItems: DriveFile[] = [];
    let currentSize = PDF_OVERHEAD_BASE; 
    let partCounter = 1;
    let currentChunkOptimized = true;

    const getChunkHash = (chunkItems: DriveFile[]) => {
        return chunkItems.map(i => 
            `${i.id}:${i.processedSize || 'raw'}:${i.compressionLevelUsed || 'none'}:${JSON.stringify(i.pageMeta || {})}:${(i.headerText||'').length}:${(i.description||'').length}`
        ).join('|');
    };

    const pushChunk = () => {
        if (currentItems.length === 0) return;
        chunks.push({ 
            title: `${baseTitle} (Del ${partCounter})`, 
            items: currentItems, 
            estimatedSizeMB: currentSize / (1024 * 1024),
            partNumber: partCounter,
            isFullyOptimized: currentChunkOptimized,
            contentHash: getChunkHash(currentItems)
        });
        currentItems = [];
        currentSize = PDF_OVERHEAD_BASE;
        currentChunkOptimized = true;
        partCounter++;
    };

    // Adjusted multipliers to be more realistic/aggressive about reduction
    const COMPRESSION_MULTIPLIERS = { 'low': 0.8, 'medium': 0.3, 'high': 0.15 };
    const maxBytes = maxMB * 1024 * 1024;

    for (const item of items) {
        let itemBytes = 0;
        let isItemOptimized = false;

        if (item.processedSize && item.compressionLevelUsed === compressionLevel) {
            itemBytes = item.processedSize;
            isItemOptimized = true;
        } else {
            const isImage = item.type === FileType.IMAGE;
            const baseMultiplier = isImage ? COMPRESSION_MULTIPLIERS[compressionLevel] : 1.0;
            const safetyFactor = 1 + (safetyMarginPercent / 100); 
            itemBytes = (item.size || 800000) * baseMultiplier * safetyFactor;
            currentChunkOptimized = false;
        }

        itemBytes += PDF_OVERHEAD_PER_PAGE;

        if (itemBytes > maxBytes && currentItems.length === 0) {
            currentItems.push(item);
            currentSize = itemBytes + PDF_OVERHEAD_BASE;
            pushChunk();
            continue;
        }

        if (currentSize + itemBytes > maxBytes) {
            pushChunk();
            currentItems.push(item);
            currentSize = PDF_OVERHEAD_BASE + itemBytes;
            if (!isItemOptimized) currentChunkOptimized = false;
        } else {
            currentItems.push(item);
            currentSize += itemBytes;
            if (!isItemOptimized) currentChunkOptimized = false;
        }
    }

    if (currentItems.length > 0) pushChunk();
    if (chunks.length === 0) {
        chunks.push({ title: `${baseTitle} (Del 1)`, items: [], estimatedSizeMB: 0, partNumber: 1, isFullyOptimized: true, contentHash: 'empty' });
    }

    return chunks;
};

// UPDATED DEFAULTS
export const DEFAULT_TEXT_CONFIG: TextConfig = {
  fontSize: 24, alignment: 'center', isBold: true, isItalic: false, verticalPosition: 'center'
};

export const DEFAULT_FOOTER_CONFIG: TextConfig = {
  fontSize: 12, alignment: 'left', isBold: false, isItalic: false, verticalPosition: 'top'
};

// --- PDF RENDERING ---

export const getPdfDocument = async (blob: Blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    return await loadingTask.promise;
};

export const renderPdfPageToCanvas = async (pdfDoc: any, pageNumber: number, canvas: HTMLCanvasElement, scale: number = 1.0) => {
    try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (e) { console.error(e); }
};

export const extractHighQualityImage = async (blob: Blob, pageIndex: number): Promise<Blob> => {
    const pdf = await getPdfDocument(blob);
    const canvas = document.createElement('canvas');
    await renderPdfPageToCanvas(pdf, pageIndex + 1, canvas, 3.0); 
    return new Promise((resolve, reject) => {
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Img error")), 'image/png');
    });
};

export const generatePageThumbnail = async (blob: Blob, pageIndex: number = 0, scale: number = 0.5): Promise<string> => {
    const pdf = await getPdfDocument(blob);
    const canvas = document.createElement('canvas');
    // Scale 0.5 gives decent readability for text without being too heavy (~300px width for A4)
    await renderPdfPageToCanvas(pdf, pageIndex + 1, canvas, scale); 
    return new Promise((resolve) => {
        canvas.toBlob((b) => b ? resolve(URL.createObjectURL(b)) : resolve(''), 'image/jpeg', 0.7);
    });
};

export const getPdfPageCount = async (blob: Blob): Promise<number> => {
    try {
        const buffer = await blob.arrayBuffer();
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        return doc.getPageCount();
    } catch { return 1; }
};

export const splitPdfIntoPages = async (pdfBlob: Blob, filenameBase: string): Promise<DriveFile[]> => {
  const buffer = await pdfBlob.arrayBuffer();
  const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const pageCount = sourcePdf.getPageCount();
  const resultFiles: DriveFile[] = [];

  for (let i = 0; i < pageCount; i++) {
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(sourcePdf, [i]);
    newPdf.addPage(copiedPage);
    const pdfBytes = await newPdf.save();
    const blob = createBlob(pdfBytes, 'application/pdf');
    
    // Generate thumbnail for the split page
    const thumbUrl = await generatePageThumbnail(blob, 0);

    resultFiles.push({
      id: `split-${Date.now()}-${i}`,
      name: `${filenameBase} (Sida ${i + 1})`,
      type: FileType.PDF,
      size: blob.size,
      modifiedTime: new Date().toISOString(),
      blobUrl: URL.createObjectURL(blob),
      thumbnail: thumbUrl,
      isLocal: true,
      pageCount: 1,
      pageMeta: {}
    });
  }
  return resultFiles;
};

// --- PREVIEW & MERGE (Shared Drawing Logic) ---

const measureTextHeight = (lines: RichTextLine[]) => {
    let h = 0;
    lines.forEach(l => { if(l.text) h += (l.config.fontSize * 1.3); });
    return h;
};

const drawRichLines = (page: PDFPage, lines: RichTextLine[], fonts: any, region: 'top' | 'bottom', footerOffset: number = 0) => {
    const { width, height } = page.getSize();
    const margin = 50;
    let totalTextHeight = measureTextHeight(lines);
    if (totalTextHeight === 0) return;

    let startY = 0;
    
    if (region === 'top') {
        // Header logic (Text ON page)
        const line = lines[0]; 
        const visualHeight = height - footerOffset;
        
        if (line?.config.verticalPosition === 'center') {
             startY = (visualHeight / 2) + (totalTextHeight / 2) + footerOffset;
        } else if (line?.config.verticalPosition === 'bottom') {
             startY = footerOffset + margin + totalTextHeight;
        } else {
             // Top
             startY = height - margin;
        }
    } else {
        // Footer logic (Text BELOW page)
        // Draw in the extended whitespace
        // footerOffset is the extra height added. 
        // We draw starting from top of footer area downwards.
        startY = footerOffset - margin; 
    }

    // Background for text on top of image
    if (region === 'top' && lines[0]?.config.verticalPosition !== 'center') {
        const bgPadding = 10;
        // Optional BG for top text
    } 

    let currentY = startY;
    lines.forEach(line => {
        if (!line.text) return;
        let font = fonts.regular;
        if (line.config.isBold && line.config.isItalic) font = fonts.boldItalic;
        else if (line.config.isBold) font = fonts.bold;
        else if (line.config.isItalic) font = fonts.italic;

        const textWidth = font.widthOfTextAtSize(line.text, line.config.fontSize);
        let x = margin;
        if (line.config.alignment === 'center') x = (width - textWidth) / 2;
        else if (line.config.alignment === 'right') x = width - margin - textWidth;

        page.drawText(line.text, { x, y: currentY - line.config.fontSize, size: line.config.fontSize, font, color: rgb(0,0,0) });
        currentY -= (line.config.fontSize * 1.3);
    });
};

export const createPreviewWithOverlay = async (fileBlob: Blob, fileType: FileType, pageMeta: Record<number, PageMetadata> = {}): Promise<string> => {
    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    const fontBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
    const fonts = { regular: fontRegular, bold: fontBold, italic: fontItalic, boldItalic: fontBoldItalic };

    try {
        const buffer = await fileBlob.arrayBuffer();
        
        let originalPage: PDFPage | undefined;

        if (fileType === FileType.IMAGE) {
            let image;
            try { image = await pdfDoc.embedJpg(buffer); } catch { 
                 try { image = await pdfDoc.embedPng(buffer); }
                 catch { throw new Error("Bildformatet stöds ej (ej JPG/PNG)"); }
            }
            // Add temp page to get size
            const imgWidth = image.width || A4_WIDTH;
            const imgHeight = image.height || (A4_WIDTH * 1.414);
            const scale = A4_WIDTH / imgWidth;
            const scaledHeight = imgHeight * scale;
            
            // Check for footer text to extend page
            const meta = pageMeta[0];
            const footerHeight = meta?.footerLines ? measureTextHeight(meta.footerLines) + 100 : 0;
            
            const page = pdfDoc.addPage([A4_WIDTH, scaledHeight + footerHeight]);
            page.drawImage(image, { x: 0, y: footerHeight, width: A4_WIDTH, height: scaledHeight });
            originalPage = page;
        } else {
            const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
            const embeddedPages = await pdfDoc.embedPages(sourcePdf.getPages());
            
            embeddedPages.forEach((ep, idx) => {
                const meta = pageMeta[idx];
                const footerHeight = meta?.footerLines ? measureTextHeight(meta.footerLines) + 100 : 0;

                const pWidth = ep.width;
                const pHeight = ep.height;
                const page = pdfDoc.addPage([pWidth, pHeight + footerHeight]);
                page.drawPage(ep, { x: 0, y: footerHeight, width: pWidth, height: pHeight });
                originalPage = page;
            });
        }
    } catch (e: any) {
        console.error("Preview Generation Error:", e);
        const page = pdfDoc.addPage([A4_WIDTH, A4_WIDTH * 1.414]);
        page.drawText("Fel vid visning", { x: 50, y: 700 });
    }

    // Apply Meta
    const pages = pdfDoc.getPages();
    pages.forEach((page, index) => {
        const meta = pageMeta[index];
        if (meta) {
            const footerHeight = meta.footerLines ? measureTextHeight(meta.footerLines) + 100 : 0;
            
            if (meta.hideObject) {
                 const { width, height } = page.getSize();
                 // Only cover the image area, not the footer area
                 page.drawRectangle({ x: 0, y: footerHeight, width, height: height - footerHeight, color: rgb(1,1,1) });
            }
            if (meta.headerLines) drawRichLines(page, meta.headerLines, fonts, 'top', footerHeight);
            if (meta.footerLines) drawRichLines(page, meta.footerLines, fonts, 'bottom', footerHeight);
        }
    });

    const pdfBytes = await pdfDoc.save();
    return URL.createObjectURL(createBlob(pdfBytes, 'application/pdf'));
};

export const mergeFilesToPdf = async (files: DriveFile[], accessToken: string, compression: CompressionLevel = 'medium'): Promise<Blob> => {
    const mergedPdf = await PDFDocument.create();
    const fontRegular = await mergedPdf.embedFont(StandardFonts.TimesRoman);
    const fontBold = await mergedPdf.embedFont(StandardFonts.TimesRomanBold);
    const fontItalic = await mergedPdf.embedFont(StandardFonts.TimesRomanItalic);
    const fontBoldItalic = await mergedPdf.embedFont(StandardFonts.TimesRomanBoldItalic);
    const fonts = { regular: fontRegular, bold: fontBold, italic: fontItalic, boldItalic: fontBoldItalic };

    for (const item of files) {
        let buffer: ArrayBuffer | null = null;
        try {
            const result = await processFileForCache(item, accessToken, compression);
            buffer = result.buffer;
            
            // Check meta for this file to see if we need footer space (just checking 1st page meta for single items, looping for pdfs)
            
            if (item.type === FileType.IMAGE) {
                let image;
                try { image = await mergedPdf.embedJpg(buffer); } catch { 
                    try { image = await mergedPdf.embedPng(buffer); }
                    catch (e) { throw new Error("Kunde inte avkoda bild"); }
                }
                
                const meta = item.pageMeta ? item.pageMeta[0] : null;
                // Also check legacy
                const hasFooter = meta?.footerLines && meta.footerLines.length > 0 || (item.description && !item.pageMeta);
                const footerHeight = hasFooter ? 
                    (meta ? measureTextHeight(meta.footerLines) : 50) + 100 
                    : 0;

                const scale = A4_WIDTH / image.width;
                const scaledHeight = image.height * scale;
                const page = mergedPdf.addPage([A4_WIDTH, scaledHeight + footerHeight]);
                page.drawImage(image, { x: 0, y: footerHeight, width: A4_WIDTH, height: scaledHeight });
            
                // Draw text for this image page
                if (meta) {
                    if (meta.hideObject) page.drawRectangle({ x: 0, y: footerHeight, width: A4_WIDTH, height: scaledHeight, color: rgb(1,1,1) });
                    if (meta.headerLines) drawRichLines(page, meta.headerLines, fonts, 'top', footerHeight);
                    if (meta.footerLines) drawRichLines(page, meta.footerLines, fonts, 'bottom', footerHeight);
                } else {
                     if (item.headerText) drawRichLines(page, [{ id: 'l1', text: item.headerText, config: item.textConfig || DEFAULT_TEXT_CONFIG }], fonts, 'top', footerHeight);
                     if (item.description) drawRichLines(page, [{ id: 'f1', text: item.description, config: DEFAULT_FOOTER_CONFIG }], fonts, 'bottom', footerHeight);
                }

            } else {
                 const sourceDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
                 const embeddedPages = await mergedPdf.embedPages(sourceDoc.getPages());
                 
                 embeddedPages.forEach((ep, idx) => {
                    const meta = item.pageMeta ? item.pageMeta[idx] : null;
                    const footerHeight = meta?.footerLines && meta.footerLines.length > 0 ? measureTextHeight(meta.footerLines) + 100 : 0;

                    const scale = A4_WIDTH / ep.width;
                    const scaledHeight = ep.height * scale;
                    const page = mergedPdf.addPage([A4_WIDTH, scaledHeight + footerHeight]);
                    page.drawPage(ep, { x: 0, y: footerHeight, width: A4_WIDTH, height: scaledHeight });

                    if (meta) {
                         if (meta.hideObject) page.drawRectangle({ x: 0, y: footerHeight, width: A4_WIDTH, height: scaledHeight, color: rgb(1,1,1) });
                         if (meta.headerLines) drawRichLines(page, meta.headerLines, fonts, 'top', footerHeight);
                         if (meta.footerLines) drawRichLines(page, meta.footerLines, fonts, 'bottom', footerHeight);
                    }
                });
            }

        } catch (e: any) {
            console.error(`Merge failed for ${item.name}`, e);
        }
    }
    const pdfBytes = await mergedPdf.save();
    return createBlob(pdfBytes, 'application/pdf');
};

export const generateCombinedPDF = async (
  accessToken: string,
  items: DriveFile[],
  partTitle: string,
  compression: CompressionLevel = 'medium',
  coverImageId?: string
): Promise<Uint8Array> => {
  const contentBlob = await mergeFilesToPdf(items, accessToken, compression);
  const contentBuffer = await contentBlob.arrayBuffer();
  // Simply return the merged PDF buffer
  return new Uint8Array(contentBuffer);
};
