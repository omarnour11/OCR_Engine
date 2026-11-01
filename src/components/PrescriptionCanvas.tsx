import React, { useEffect, useRef, useState } from 'react';
import { PrescriptionSample } from '../data/prescriptions';
import { ExtractedMedicationLine, PipelineConfig } from '../utils/ocrEngine';
import { ZoomIn, ZoomOut, RotateCcw, PenTool, Eraser, Eye } from 'lucide-react';

export interface InkBandBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PrescriptionCanvasProps {
  sample: PrescriptionSample;
  lines: ExtractedMedicationLine[];
  config: PipelineConfig;
  selectedLineId: string | null;
  onSelectLine: (id: string) => void;
  uploadedImageUrl: string | null;
  isFreehandMode: boolean;
  onToggleFreehandMode: (active: boolean) => void;
  canvasRefExternal: React.RefObject<HTMLCanvasElement | null>;
  onDetectedInkBands?: (bands: InkBandBox[]) => void;
}

/**
 * Analyzes horizontal pixel intensity projection on a 640x500 canvas to locate dark ink rows
 * in an uploaded prescription image.
 */
function detectHorizontalInkBands(ctx: CanvasRenderingContext2D, width: number, height: number): InkBandBox[] {
  const imgData = ctx.getImageData(0, 0, width, height).data;
  const rowDarkCounts = new Array(height).fill(0);

  // Sample middle 80% of width and vertical body region (y = 110..430)
  const xStart = Math.round(width * 0.08);
  const xEnd = Math.round(width * 0.92);

  for (let y = 115; y < 425; y++) {
    let darkPixels = 0;
    for (let x = xStart; x < xEnd; x += 2) {
      const idx = (y * width + x) * 4;
      const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
      if (lum < 155) {
        darkPixels++;
      }
    }
    rowDarkCounts[y] = darkPixels;
  }

  const bands: InkBandBox[] = [];
  let inBand = false;
  let bandStart = 0;

  for (let y = 115; y < 425; y++) {
    if (rowDarkCounts[y] >= 12 && !inBand) {
      inBand = true;
      bandStart = y;
    } else if ((rowDarkCounts[y] < 8 || y - bandStart >= 56) && inBand) {
      inBand = false;
      const bandHeight = y - bandStart;
      if (bandHeight >= 16) {
        bands.push({
          x: 44,
          y: Math.max(100, bandStart - 6),
          width: width - 88,
          height: Math.min(60, Math.max(38, bandHeight + 12)),
        });
      }
    }
  }

  if (bands.length === 0) {
    return [
      { x: 48, y: 155, width: 540, height: 50 },
      { x: 48, y: 225, width: 530, height: 50 },
      { x: 48, y: 295, width: 535, height: 50 },
    ];
  }

  return bands.slice(0, 5);
}

export const PrescriptionCanvas: React.FC<PrescriptionCanvasProps> = ({
  sample,
  lines,
  config,
  selectedLineId,
  onSelectLine,
  uploadedImageUrl,
  isFreehandMode,
  onToggleFreehandMode,
  canvasRefExternal,
  onDetectedInkBands,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [userStrokes, setUserStrokes] = useState<Array<Array<{ x: number; y: number }>>>([]);

  const internalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastProcessedUploadUrlRef = useRef<string | null>(null);

  const setCanvasRefs = (node: HTMLCanvasElement | null) => {
    internalCanvasRef.current = node;
    if (canvasRefExternal) {
      (canvasRefExternal as React.MutableRefObject<HTMLCanvasElement | null>).current = node;
    }
  };

  useEffect(() => {
    const canvas = internalCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = 640;
    const height = 500;
    canvas.width = width;
    canvas.height = height;

    const drawDocument = (img?: HTMLImageElement) => {
      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Base clinical paper background
      ctx.fillStyle = config.adaptiveBinarization ? '#ffffff' : sample.paperTint;
      ctx.fillRect(0, 0, width, height);

      // Apply deskew or original skew transform
      const effectiveAngleDeg = config.deskewCorrection ? 0 : sample.skewDegrees;
      ctx.translate(width / 2, height / 2);
      ctx.rotate((effectiveAngleDeg * Math.PI) / 180);
      ctx.translate(-width / 2, -height / 2);

      if (img) {
        // Draw uploaded prescription image scaled cleanly inside the pad
        const scale = Math.min(width / img.width, height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);

        if (uploadedImageUrl && lastProcessedUploadUrlRef.current !== uploadedImageUrl) {
          lastProcessedUploadUrlRef.current = uploadedImageUrl;
          const detectedBands = detectHorizontalInkBands(ctx, width, height);
          onDetectedInkBands?.(detectedBands);
        }
      } else {
        // Subtle clinical security gridlines (suppressed when adaptive binarization is active)
        if (!config.adaptiveBinarization) {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
          ctx.lineWidth = 1;
          for (let x = 24; x < width; x += 24) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
          }
          for (let y = 24; y < height; y += 24) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
          }
        }

        // Prescription Pad Header (Printed Clinical Typography + Arabic Roshetta Header)
        ctx.fillStyle = config.adaptiveBinarization ? '#000000' : '#0f172a';
        ctx.font = '700 13.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(sample.clinicName.toUpperCase(), 36, 34);

        if (sample.clinicArabicHeader) {
          ctx.font = '600 12.5px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = config.adaptiveBinarization ? '#000000' : '#1e3a8a';
          ctx.fillText(sample.clinicArabicHeader, 36, 52);
        }

        ctx.fillStyle = config.adaptiveBinarization ? '#1e293b' : '#475569';
        ctx.font = '500 10.5px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(sample.clinicAddress, 36, 68);

        ctx.font = '600 10.5px "IBM Plex Mono", monospace';
        ctx.fillText(`SYNDICATE: ${sample.deaNumber}`, 445, 34);
        ctx.fillText(`ROS-ID: ${sample.code}`, 445, 50);
        ctx.fillText(`DATE: ${sample.dateWritten}`, 445, 66);

        // Header divider line
        ctx.strokeStyle = config.adaptiveBinarization ? '#000000' : '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(36, 80);
        ctx.lineTo(width - 36, 80);
        ctx.stroke();

        // Patient Demographics Box
        ctx.fillStyle = config.adaptiveBinarization ? '#000000' : '#334155';
        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillText('PATIENT:', 36, 106);
        ctx.fillText('DOB:', 335, 106);
        ctx.fillText('WT:', 505, 106);
        ctx.fillText('ALLERGIES:', 36, 132);

        // Handwritten patient metadata
        const inkColor = config.adaptiveBinarization ? '#020617' : sample.inkColor;
        ctx.fillStyle = inkColor;
        ctx.font = '600 16.5px "Caveat", cursive';
        ctx.fillText(sample.patientName, 92, 107);
        ctx.fillText(sample.patientDob, 366, 107);
        ctx.fillText(`${sample.patientWeightKg} kg`, 532, 107);
        ctx.fillText(sample.patientAllergies.join(', '), 104, 133);

        ctx.strokeStyle = config.adaptiveBinarization ? '#000000' : '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(36, 146);
        ctx.lineTo(width - 36, 146);
        ctx.stroke();

        // Large Rx Symbol
        ctx.fillStyle = config.adaptiveBinarization ? '#000000' : '#1e3a8a';
        ctx.font = '700 28px Georgia, serif';
        ctx.fillText('R/', 36, 174);

        // Handwritten Medication Lines with realistic fountain/ballpoint stroke jitter
        ctx.fillStyle = inkColor;
        ctx.strokeStyle = inkColor;
        const baseWeight = 600 + config.strokeDilation * 100;

        lines.forEach((line, idx) => {
          const yPos = line.boundingBox.y + 30;
          ctx.save();
          const lineSlope = config.deskewCorrection ? 0 : (idx % 2 === 0 ? -0.008 : 0.009);
          ctx.transform(1, lineSlope, -0.04, 1, 0, 0);

          ctx.font = `${baseWeight} 21px "Caveat", cursive`;
          ctx.fillText(line.rawHandwrittenText, line.boundingBox.x + 10, yPos);

          // Simulate cursive pen pressure underline/flourish on sig
          ctx.lineWidth = 1.1 + config.strokeDilation * 0.45;
          ctx.beginPath();
          ctx.moveTo(line.boundingBox.x + 8, yPos + 7);
          ctx.bezierCurveTo(
            line.boundingBox.x + 160,
            yPos + 10,
            line.boundingBox.x + 320,
            yPos + 5,
            line.boundingBox.x + Math.min(460, line.boundingBox.width - 20),
            yPos + 8
          );
          ctx.strokeStyle = config.adaptiveBinarization ? 'rgba(0,0,0,0.35)' : 'rgba(30, 58, 138, 0.25)';
          ctx.stroke();
          ctx.restore();
        });

        // Prescriber Signature Block at bottom
        ctx.strokeStyle = config.adaptiveBinarization ? '#000000' : '#94a3b8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(330, 445);
        ctx.lineTo(600, 445);
        ctx.stroke();

        ctx.fillStyle = config.adaptiveBinarization ? '#000000' : '#475569';
        ctx.font = '500 10px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(`SIGNATURE — ${sample.prescriberName}`, 330, 462);
        ctx.fillText('EDA / SYNDICATE VERIFIED CLINICAL ROSHETTA', 36, 462);

        // Doctor stylized cursive signature path
        ctx.save();
        ctx.strokeStyle = inkColor;
        ctx.lineWidth = 1.8 + config.strokeDilation * 0.4;
        ctx.beginPath();
        ctx.moveTo(350, 436);
        ctx.bezierCurveTo(375, 402, 395, 442, 420, 418);
        ctx.bezierCurveTo(445, 395, 460, 438, 495, 424);
        ctx.bezierCurveTo(530, 412, 560, 434, 585, 426);
        ctx.stroke();
        ctx.restore();
      }

      // Freehand user strokes
      if (userStrokes.length > 0) {
        ctx.save();
        ctx.strokeStyle = '#1e3a8a';
        ctx.lineWidth = 2.6 + config.strokeDilation * 0.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const stroke of userStrokes) {
          if (stroke.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(stroke[0].x, stroke[0].y);
          for (let i = 1; i < stroke.length; i++) {
            ctx.lineTo(stroke[i].x, stroke[i].y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }

      ctx.restore();

      // Apply pixel-level CLAHE Contrast & Binarization adjustment
      if (config.claheContrast !== 50 || (config.adaptiveBinarization && uploadedImageUrl)) {
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        const factor = (259 * (config.claheContrast * 1.6 + 255)) / (255 * (259 - config.claheContrast * 1.6));
        for (let i = 0; i < data.length; i += 4) {
          let r = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
          let g = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
          let b = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
          if (config.adaptiveBinarization && uploadedImageUrl) {
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const bin = lum < 165 ? 12 : 255;
            r = bin;
            g = bin;
            b = bin;
          }
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
        }
        ctx.putImageData(imgData, 0, 0);
      }

      // Draw Deep Learning Region-of-Interest (ROI) Bounding Boxes (including on uploaded images!)
      if (config.showBoundingBoxes) {
        lines.forEach((line) => {
          const isSelected = line.id === selectedLineId;
          const isHovered = line.id === hoveredLineId;
          const box = line.boundingBox;

          ctx.save();
          const strokeColor =
            line.lexiconAdjustedConfidence >= 96
              ? '#0284c7'
              : line.lexiconAdjustedConfidence >= 94
                ? '#d97706'
                : '#dc2626';

          ctx.strokeStyle = isSelected ? '#2563eb' : strokeColor;
          ctx.lineWidth = isSelected || isHovered ? 2.2 : 1.5;
          if (!isSelected) {
            ctx.setLineDash([5, 3]);
          }
          ctx.strokeRect(box.x, box.y, box.width, box.height);

          ctx.fillStyle = isSelected
            ? 'rgba(37, 99, 235, 0.10)'
            : isHovered
              ? 'rgba(2, 132, 199, 0.08)'
              : 'rgba(2, 132, 199, 0.03)';
          ctx.fillRect(box.x, box.y, box.width, box.height);

          const labelText = `L${line.lineNumber} · ${line.brandName.split(' ')[0]} · ${line.lexiconAdjustedConfidence.toFixed(1)}%`;
          ctx.font = '600 10px "IBM Plex Mono", monospace';
          const textWidth = ctx.measureText(labelText).width;
          const tagX = Math.max(10, box.x + box.width - textWidth - 12);
          const tagY = Math.max(4, box.y - 17);

          ctx.fillStyle = isSelected ? '#1d4ed8' : '#0f172a';
          ctx.fillRect(tagX, tagY, textWidth + 12, 17);

          ctx.fillStyle = '#ffffff';
          ctx.fillText(labelText, tagX + 6, tagY + 12);
          ctx.restore();
        });
      }
    };

    if (uploadedImageUrl) {
      const img = new Image();
      img.onload = () => drawDocument(img);
      img.src = uploadedImageUrl;
    } else {
      drawDocument();
    }
  }, [sample, lines, config, selectedLineId, hoveredLineId, uploadedImageUrl, userStrokes]);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = internalCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((e.clientX - rect.left) * scaleX),
      y: Math.round((e.clientY - rect.top) * scaleY),
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    setCursorCoords(coords);

    if (isFreehandMode && isDrawing) {
      setUserStrokes((prev) => {
        const copy = [...prev];
        const current = copy[copy.length - 1] || [];
        copy[copy.length - 1] = [...current, coords];
        return copy;
      });
      return;
    }

    const hit = lines.find(
      (l) =>
        coords.x >= l.boundingBox.x &&
        coords.x <= l.boundingBox.x + l.boundingBox.width &&
        coords.y >= l.boundingBox.y &&
        coords.y <= l.boundingBox.y + l.boundingBox.height
    );
    setHoveredLineId(hit ? hit.id : null);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoords(e);
    if (isFreehandMode) {
      setIsDrawing(true);
      setUserStrokes((prev) => [...prev, [coords]]);
      return;
    }

    const hit = lines.find(
      (l) =>
        coords.x >= l.boundingBox.x &&
        coords.x <= l.boundingBox.x + l.boundingBox.width &&
        coords.y >= l.boundingBox.y &&
        coords.y <= l.boundingBox.y + l.boundingBox.height
    );
    if (hit) {
      onSelectLine(hit.id);
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  return (
    <div className="flex flex-col border border-slate-200 bg-white">
      {/* Optical Instrument Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-100/80 px-4 py-2.5">
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">
            {uploadedImageUrl ? 'Uploaded Roshetta Scanner Stage' : 'Optical Scanner Stage'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            X:{String(cursorCoords.x).padStart(3, '0')} Y:{String(cursorCoords.y).padStart(3, '0')} px
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            Skew: {config.deskewCorrection ? '0.0° (Aligned)' : `${sample.skewDegrees}°`}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleFreehandMode(!isFreehandMode)}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              isFreehandMode
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
            aria-label="Toggle Freehand Prescription Ink Pad"
          >
            <PenTool className="h-3.5 w-3.5" />
            <span>{isFreehandMode ? 'Drawing Ink Active' : 'Annotate / Write Rx'}</span>
          </button>

          {userStrokes.length > 0 && (
            <button
              type="button"
              onClick={() => setUserStrokes([])}
              className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              aria-label="Clear Freehand Ink Annotations"
            >
              <Eraser className="h-3.5 w-3.5" />
              <span>Clear Ink</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.8, Number((z - 0.1).toFixed(2))))}
            className="rounded border border-slate-200 bg-white p-1 text-slate-700 hover:bg-slate-50"
            aria-label="Zoom Out Prescription Canvas"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="px-1.5 font-mono text-xs tabular-nums text-slate-700">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
            className="rounded border border-slate-200 bg-white p-1 text-slate-700 hover:bg-slate-50"
            aria-label="Zoom In Prescription Canvas"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded border border-slate-200 bg-white p-1 text-slate-700 hover:bg-slate-50"
            aria-label="Reset Canvas Zoom"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main High-DPI Optical Viewport */}
      <div className="relative flex min-h-[460px] items-center justify-center overflow-auto bg-slate-900/95 p-5">
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
          className="transition-transform duration-150"
        >
          <canvas
            ref={setCanvasRefs}
            data-testid="prescription-ocr-canvas"
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`max-w-full border border-slate-700 shadow-sm ${
              isFreehandMode ? 'cursor-pen' : 'cursor-crosshair'
            }`}
          />
        </div>
      </div>

      {/* Token Attention & Confidence Footer Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-blue-600" />
          <span>
            Click any bounding box on the prescription scan to inspect token-level optical logits and EDA (Egypt) / RxNorm lexicon corrections.
          </span>
        </div>
        <div className="font-mono text-xs tabular-nums text-slate-500">
          ROIs Detected: {lines.length} · Encoder: Bilingual ENG+ARA LSTM + EDA Lexicon
        </div>
      </div>
    </div>
  );
};
