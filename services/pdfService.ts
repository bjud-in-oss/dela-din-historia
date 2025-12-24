
import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { DriveFile, FileType, CompressionLevel, TextConfig, RichTextLine, PageMetadata } from '../types';
import { fetchFileBlob } from './driveService';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs`;

const A4_WIDTH = 595.28; 
// A4_HEIGHT används inte längre som tvingande höjd, utan sidor anpassas dynamiskt.
const PDF_OVERHEAD_BASE = 15000; 
const PDF_OVERHEAD_PER_PAGE = 4000;

// --- COMPRESSION HELPERS ---

const compressImageBuffer = async (buffer: ArrayBuffer, level: CompressionLevel): Promise<ArrayBuffer> => {
    let quality = 0.9;
    let maxWidth = 2500;

    if (level === 'medium') {
        quality = 0.7;
        maxWidth = 1600;
    } else if (level === 'high') { 
        quality = 0.5;
        maxWidth = 1024;
    } else {
        // Low compression (High Quality)
        quality = 0.9;
        maxWidth = 2500;
    }

    return new Promise((resolve, reject) => {
        const blob = new Blob([buffer]);
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
            URL.revokeObjectURL(url);
            resolve(buffer); 
        };

        img.src = url;
    });
};

// --- PROCESS FILE (Unified Process) ---
export const processFileForCache = async (
    file: DriveFile, 
    accessToken: string, 
    level: CompressionLevel
): Promise<{ buffer: ArrayBuffer, size: number }> => {
    
    let rawBuffer: ArrayBuffer;
    if (file.processedBuffer && file.compressionLevelUsed === level) {
        return { buffer: file.processedBuffer, size: file.processedSize || file.processedBuffer.byteLength };
    }

    if (file.blobUrl) {
        const res = await fetch(file.blobUrl);
        rawBuffer = await res.arrayBuffer();
    } else {
        const blob = await fetchFileBlob(accessToken, file.id, file.type === FileType.GOOGLE_DOC);
        rawBuffer = await blob.arrayBuffer();
    }

    if (file.type === FileType.IMAGE) {
        const compressed = await compressImageBuffer(rawBuffer, level);
        return { buffer: compressed, size: compressed.byteLength };
    }

    return { buffer: rawBuffer, size: rawBuffer.byteLength };
};

// --- CONSTANTS & HELPERS FOR CHUNKING ---

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
    maxMB: number = 14.7,
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

    const COMPRESSION_MULTIPLIERS = {
        'low': 1.0, 'medium': 0.6, 'high': 0.3
    };

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

    if (currentItems.length > 0) {
        pushChunk();
    }

    if (chunks.length === 0) {
        chunks.push({ 
            title: `${baseTitle} (Del 1)`, 
            items: [], 
            estimatedSizeMB: 0, 
            partNumber: 1, 
            isFullyOptimized: true,
            contentHash: 'empty'
        });
    }

    return chunks;
};

export const DEFAULT_TEXT_CONFIG: TextConfig = {
  fontSize: 24,
  alignment: 'center',
  isBold: true,
  isItalic: false,
  verticalPosition: 'top'
};

export const DEFAULT_FOOTER_CONFIG: TextConfig = {
  fontSize: 12,
  alignment: 'left',
  isBold: false,
  isItalic: false,
  verticalPosition: 'bottom'
};

// --- PDF RENDERING (PDF.js) ---

export const getPdfDocument = async (blob: Blob) => {
    try {
        const arrayBuffer = await blob.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        return await loadingTask.promise;
    } catch (e) {
        console.error("Kunde inte ladda PDF-dokumentet", e);
        throw e;
    }
};

export const renderPdfPageToCanvas = async (
    pdfDoc: any, 
    pageNumber: number, 
    canvas: HTMLCanvasElement, 
    scale: number = 1.0
) => {
    try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        
        if (viewport.width === 0 || viewport.height === 0) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: canvas.getContext('2d', { willReadFrequently: true })!,
            viewport: viewport,
        };
        
        await page.render(renderContext).promise;
    } catch (e) {
        console.error(`Fel vid rendering av sida ${pageNumber}`, e);
    }
};

export const extractHighQualityImage = async (blob: Blob, pageIndex: number): Promise<Blob> => {
    const pdf = await getPdfDocument(blob);
    const canvas = document.createElement('canvas');
    // Use scale 3.0 for high quality
    await renderPdfPageToCanvas(pdf, pageIndex + 1, canvas, 3.0); 
    
    return new Promise((resolve, reject) => {
        // Try high quality PNG first
        canvas.toBlob((pngBlob) => {
            if (pngBlob) {
                // If over 15MB limit, fallback to JPEG high quality
                if (pngBlob.size > 14.5 * 1024 * 1024) {
                    canvas.toBlob((jpegBlob) => {
                        if (jpegBlob) resolve(jpegBlob);
                        else resolve(pngBlob); // Fallback to PNG anyway if JPEG fails
                    }, 'image/jpeg', 0.95);
                } else {
                    resolve(pngBlob);
                }
            } else {
                reject(new Error("Could not create image blob"));
            }
        }, 'image/png');
    });
};

export const extractPageToPng = async (blob: Blob, pageIndex: number): Promise<Blob> => {
    return extractHighQualityImage(blob, pageIndex);
};

// --- EXISTING PDF-LIB FUNCTIONS ---

export const getPdfPageCount = async (blob: Blob): Promise<number> => {
    try {
        const buffer = await blob.arrayBuffer();
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        return doc.getPageCount();
    } catch (e) {
        console.error("Failed to count pages", e);
        return 1;
    }
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
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    resultFiles.push({
      id: `split-${Date.now()}-${i}-${Math.random()}`,
      name: `${filenameBase} (Sida ${i + 1})`,
      type: FileType.PDF,
      size: blob.size,
      modifiedTime: new Date().toISOString(),
      blobUrl: blobUrl,
      isLocal: true,
      pageCount: 1,
      pageMeta: {}
    });
  }

  return resultFiles;
};

export const createPreviewWithOverlay = async (
    fileBlob: Blob, 
    fileType: FileType, 
    pageMeta: Record<number, PageMetadata> = {}
): Promise<string> => {
    const pdfDoc = await PDFDocument.create();
    const buffer = await fileBlob.arrayBuffer();

    // Logic here MUST match mergeFilesToPdf exactly to be WYSIWYG
    if (fileType === FileType.IMAGE) {
        let image;
        try { image = await pdfDoc.embedJpg(buffer); } 
        catch { 
            try { image = await pdfDoc.embedPng(buffer); }
            catch { image = await pdfDoc.embedJpg(buffer); } // Fallback
        }
        
        // FLUID HEIGHT LOGIC
        // Ensure width is valid to avoid Division by Zero
        const imgWidth = image.width || A4_WIDTH;
        const imgHeight = image.height || (A4_WIDTH * 1.414);
        
        const scale = A4_WIDTH / imgWidth;
        const scaledHeight = imgHeight * scale;

        const page = pdfDoc.addPage([A4_WIDTH, scaledHeight]);
        page.drawImage(image, {
            x: 0,
            y: 0,
            width: A4_WIDTH,
            height: scaledHeight
        });
    } else {
        const sourcePdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
        // Must use embedPages to allow scaling (copyPages preserves original size/media box)
        const embeddedPages = await pdfDoc.embedPages(sourcePdf.getPages());

        embeddedPages.forEach((embeddedPage) => {
            // FLUID HEIGHT LOGIC
            const pWidth = embeddedPage.width || A4_WIDTH;
            const pHeight = embeddedPage.height || (A4_WIDTH * 1.414);
            
            const scale = A4_WIDTH / pWidth;
            const scaledHeight = pHeight * scale;

            const page = pdfDoc.addPage([A4_WIDTH, scaledHeight]);
            page.drawPage(embeddedPage, {
                x: 0,
                y: 0,
                width: A4_WIDTH,
                height: scaledHeight
            });
        });
    }

    const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const fontItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    const fontBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);

    const pages = pdfDoc.getPages();
    pages.forEach((page, index) => {
        const meta = pageMeta[index];
        if (meta) {
            if (meta.hideObject) {
                 const { width, height } = page.getSize();
                 page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1,1,1) });
            }
            if (meta.headerLines) drawRichLines(page, meta.headerLines, { regular: fontRegular, bold: fontBold, italic: fontItalic, boldItalic: fontBoldItalic }, 'top');
            if (meta.footerLines) drawRichLines(page, meta.footerLines, { regular: fontRegular, bold: fontBold, italic: fontItalic, boldItalic: fontBoldItalic }, 'bottom');
        }
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
};

const drawRichLines = (
    page: PDFPage, 
    lines: RichTextLine[], 
    fonts: { regular: PDFFont, bold: PDFFont, italic: PDFFont, boldItalic: PDFFont },
    region: 'top' | 'bottom'
) => {
    const { width, height } = page.getSize();
    const margin = 50;
    
    let totalTextHeight = 0;
    lines.forEach(line => {
        if(line.text) totalTextHeight += (line.config.fontSize * 1.2);
    });
    if (totalTextHeight === 0) return;

    let startY = region === 'top' ? height - margin : margin + totalTextHeight; 
    const bgPadding = 10;
    page.drawRectangle({
        x: 0,
        y: region === 'top' ? startY - totalTextHeight - bgPadding : margin - bgPadding,
        width: width,
        height: totalTextHeight + (bgPadding * 2),
        color: rgb(1, 1, 1),
        opacity: 0.6
    });

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

        page.drawText(line.text, {
            x,
            y: currentY - line.config.fontSize,
            size: line.config.fontSize,
            font: font,
            color: rgb(0,0,0)
        });
        currentY -= (line.config.fontSize * 1.2);
    });
};

export const mergeFilesToPdf = async (files: DriveFile[], accessToken: string, compression: CompressionLevel = 'medium'): Promise<Blob> => {
    const mergedPdf = await PDFDocument.create();
    
    const fontRegular = await mergedPdf.embedFont(StandardFonts.TimesRoman);
    const fontBold = await mergedPdf.embedFont(StandardFonts.TimesRomanBold);
    const fontItalic = await mergedPdf.embedFont(StandardFonts.TimesRomanItalic);
    const fontBoldItalic = await mergedPdf.embedFont(StandardFonts.TimesRomanBoldItalic);
    const fonts = { regular: fontRegular, bold: fontBold, italic: fontItalic, boldItalic: fontBoldItalic };

    for (const item of files) {
        try {
            let buffer: ArrayBuffer;

            // UNIFIED PROCESS CHECK:
            if (item.processedBuffer && item.compressionLevelUsed === compression) {
                buffer = item.processedBuffer;
            } else {
                const result = await processFileForCache(item, accessToken, compression);
                buffer = result.buffer;
            }

            let startPageIndexInMerged = mergedPdf.getPageCount();

            if (item.type === FileType.IMAGE) {
                // FLUID HEIGHT LOGIC FOR IMAGES (Full Width, Dynamic Height)
                try {
                    let image;
                    try { image = await mergedPdf.embedJpg(buffer); } 
                    catch { 
                        try { image = await mergedPdf.embedPng(buffer); }
                        catch { image = await mergedPdf.embedJpg(buffer); } // Fallback
                    }

                    const imgWidth = image.width || A4_WIDTH;
                    const imgHeight = image.height || (A4_WIDTH * 1.414);

                    // 1. Calculate scaling based on WIDTH ONLY (Fit to A4 width)
                    const scale = A4_WIDTH / imgWidth;
                    
                    // 2. Determine new page height
                    const scaledHeight = imgHeight * scale;

                    // 3. Create page with EXACT dimensions needed
                    const page = mergedPdf.addPage([A4_WIDTH, scaledHeight]);
                    
                    // 4. Draw edge-to-edge
                    page.drawImage(image, {
                        x: 0,
                        y: 0,
                        width: A4_WIDTH,
                        height: scaledHeight
                    });

                } catch (e) {
                    console.error("Failed to embed image", e);
                }
            } else {
                // FLUID HEIGHT LOGIC FOR PDF/DOCS (Fixes "Frame" look, removes all margins)
                
                const sourceDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
                const embeddedPages = await mergedPdf.embedPages(sourceDoc.getPages());

                embeddedPages.forEach((embeddedPage) => {
                    const pWidth = embeddedPage.width || A4_WIDTH;
                    const pHeight = embeddedPage.height || (A4_WIDTH * 1.414);

                    // 1. Calculate scaling based on WIDTH ONLY (Fit to A4 width)
                    const scale = A4_WIDTH / pWidth;
                    
                    // 2. Determine new page height
                    const scaledHeight = pHeight * scale;

                    // 3. Create page with EXACT dimensions needed
                    const page = mergedPdf.addPage([A4_WIDTH, scaledHeight]);
                    
                    // 4. Draw edge-to-edge
                    page.drawPage(embeddedPage, {
                        x: 0,
                        y: 0,
                        width: A4_WIDTH,
                        height: scaledHeight
                    });
                });
            }

            // Apply metadata
            if (item.pageMeta) {
                const addedPageCount = mergedPdf.getPageCount() - startPageIndexInMerged;
                for (let i = 0; i < addedPageCount; i++) {
                    const meta = item.pageMeta[i];
                    if (meta) {
                        const targetPage = mergedPdf.getPage(startPageIndexInMerged + i);
                        if (meta.hideObject) {
                            const { width, height } = targetPage.getSize();
                            targetPage.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1,1,1) });
                        }
                        if (meta.headerLines) drawRichLines(targetPage, meta.headerLines, fonts, 'top');
                        if (meta.footerLines) drawRichLines(targetPage, meta.footerLines, fonts, 'bottom');
                    }
                }
            } else if (item.headerText || item.description) {
                 const targetPage = mergedPdf.getPage(startPageIndexInMerged);
                 const hLines: RichTextLine[] = item.headerText ? [{ id: 'l1', text: item.headerText, config: item.textConfig || DEFAULT_TEXT_CONFIG }] : [];
                 const fLines: RichTextLine[] = item.description ? [{ id: 'f1', text: item.description, config: DEFAULT_FOOTER_CONFIG }] : [];
                 drawRichLines(targetPage, hLines, fonts, 'top');
                 drawRichLines(targetPage, fLines, fonts, 'bottom');
            }

        } catch (e) {
            console.error(`Merge failed for ${item.name}`, e);
        }
    }

    const pdfBytes = await mergedPdf.save();
    return new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
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
  const contentPdf = await PDFDocument.load(contentBuffer);
  const finalPdf = await PDFDocument.create();
  
  const copiedPages = await finalPdf.copyPages(contentPdf, contentPdf.getPageIndices());
  copiedPages.forEach(p => finalPdf.addPage(p));

  return await finalPdf.save();
};
