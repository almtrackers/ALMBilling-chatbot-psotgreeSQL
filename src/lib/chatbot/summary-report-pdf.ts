import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export type SummaryReportRow = {
  deviceId: number;
  startTime: string;
  endTime: string;
  distance?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  engineHours?: number;
  spentFuel?: number;
};

export type SummaryReportPdfInput = {
  vehicleName: string;
  from: Date;
  to: Date;
  rows: SummaryReportRow[];
};

function readPublicAssetBase64(relativePath: string): string | null {
  try {
    const fullPath = path.join(process.cwd(), 'public', relativePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath).toString('base64');
  } catch {
    return null;
  }
}

function formatDurationMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatEngineHours(value: unknown) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return '-';
  return formatDurationMs(num);
}

function playbackLink(deviceId: number, from: Date, to: Date) {
  const params = new URLSearchParams({
    deviceId: String(deviceId),
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return `https://app.almtrace.com/replay?${params.toString()}`;
}

function getExportFileName(vehicleName: string) {
  const safe =
    vehicleName
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 80) || 'vehicle';
  return `summary-${safe}-${format(new Date(), 'yyyyMMddHHmmss')}.pdf`;
}

export async function generateSummaryReportPdf(input: SummaryReportPdfInput): Promise<{
  buffer: Buffer;
  fileName: string;
  totalDistanceKm: number;
}> {
  const logoBase64 = readPublicAssetBase64('logo.png');
  const urduFontBase64 = readPublicAssetBase64(path.join('fonts', 'NirmalaUI.ttf'));

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  if (urduFontBase64) {
    doc.addFileToVFS('NirmalaUI.ttf', urduFontBase64);
    doc.addFont('NirmalaUI.ttf', 'NirmalaUI', 'normal');
    doc.addFont('NirmalaUI.ttf', 'NirmalaUI', 'bold');
    doc.setFont('NirmalaUI', 'normal');
  }

  const fontFamily = urduFontBase64 ? 'NirmalaUI' : 'helvetica';
  const pdfColumnWidths = {
    vehicle: 80,
    start: 95,
    end: 95,
    distance: 55,
    avgSpeed: 48,
    maxSpeed: 48,
    engine: 70,
    replay: 60,
  } as const;

  const pageWidth = doc.internal.pageSize.getWidth();
  const maxContentWidth = pageWidth - 36;
  const requestedTableWidth = Object.values(pdfColumnWidths).reduce((sum, width) => sum + width, 0);
  const contentWidth = Math.min(maxContentWidth, requestedTableWidth);
  const contentLeft = (pageWidth - contentWidth) / 2;
  const pdfMargins = { left: contentLeft, right: contentLeft };
  const tableCenterX = contentLeft + contentWidth / 2 - 18;

  const dateLabel = `${format(input.from, 'yyyy-MM-dd HH:mm')} to ${format(input.to, 'yyyy-MM-dd HH:mm')}`;
  const totalDistanceKm =
    input.rows.reduce((sum, row) => sum + Number(row.distance || 0), 0) / 1000;

  const headers = ['Vehicle (No.)', 'Start', 'End', 'KM', 'Avg', 'Max', 'Engine', 'Replay'];
  const linkColumns = new Set([7]);
  const linkRows = input.rows.map((row) => [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    playbackLink(row.deviceId, input.from, input.to),
  ]);

  const rows = input.rows.map((row) => [
    input.vehicleName,
    format(new Date(row.startTime), 'yy-MM-dd HH:mm'),
    format(new Date(row.endTime), 'yy-MM-dd HH:mm'),
    (Number(row.distance || 0) / 1000).toFixed(2),
    Number(row.averageSpeed || 0).toFixed(1),
    Number(row.maxSpeed || 0).toFixed(1),
    formatEngineHours(row.engineHours),
    'Open',
  ]);

  if (logoBase64) {
    doc.addImage(`data:image/png;base64,${logoBase64}`, 'PNG', contentLeft + 12, 24, 44, 44);
  }

  doc.setDrawColor(191, 219, 254);
  doc.setLineWidth(1);
  doc.roundedRect(contentLeft, 20, contentWidth, 58, 10, 10, 'S');
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42);
  doc.text('Al-Muhafiz Tracker (PVT)LTD', contentLeft + 76, 40);
  doc.setFontSize(10);
  doc.setTextColor(59, 130, 246);
  doc.text('Helpline: 0311-1133170', contentLeft + 76, 56);
  doc.text('Website: almtrace.com', contentLeft + 76, 69);

  doc.setFillColor(239, 246, 255);
  doc.roundedRect(contentLeft, 88, contentWidth, 48, 8, 8, 'F');
  doc.setFontSize(10);
  doc.setTextColor(3, 105, 161);
  doc.text(`Vehicles: ${input.vehicleName}`, contentLeft + 12, 100);
  doc.text(`Date Range: ${dateLabel}`, contentLeft + 12, 114);
  doc.setTextColor(15, 23, 42);
  doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`, contentLeft + contentWidth / 2 + 12, 100);
  doc.setTextColor(185, 28, 28);
  doc.text(`Total Entries: ${input.rows.length}`, contentLeft + contentWidth / 2 + 12, 114);

  doc.setFillColor(224, 242, 254);
  doc.roundedRect(contentLeft, 142, contentWidth, 22, 8, 8, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(29, 78, 216);
  doc.text('Summary Report', tableCenterX, 156, { align: 'center' });
  doc.setFont(fontFamily, 'normal');

  autoTable(doc, {
    startY: 172,
    head: [headers],
    body: rows,
    theme: 'grid',
    margin: pdfMargins,
    tableWidth: contentWidth,
    styles: {
      font: fontFamily,
      fontSize: 7,
      cellPadding: 3,
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: [191, 219, 254],
      lineWidth: 0.5,
      textColor: [17, 24, 39],
    },
    headStyles: {
      font: fontFamily,
      fillColor: [30, 64, 175],
      textColor: 255,
      fontSize: 7,
      cellPadding: 3,
      fontStyle: urduFontBase64 ? 'normal' : 'bold',
    },
    alternateRowStyles: {
      fillColor: [239, 246, 255],
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: pdfColumnWidths.vehicle },
      1: { cellWidth: pdfColumnWidths.start },
      2: { cellWidth: pdfColumnWidths.end },
      3: { cellWidth: pdfColumnWidths.distance, halign: 'right' },
      4: { cellWidth: pdfColumnWidths.avgSpeed, halign: 'right' },
      5: { cellWidth: pdfColumnWidths.maxSpeed, halign: 'right' },
      6: { cellWidth: pdfColumnWidths.engine },
      7: { cellWidth: pdfColumnWidths.replay },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && linkColumns.has(data.column.index) && linkRows[data.row.index]?.[data.column.index]) {
        data.cell.styles.textColor = [37, 99, 235];
        data.cell.styles.fontStyle = 'normal';
      }
      if (data.section === 'body' && data.column.index === 7) {
        data.cell.styles.fillColor = [220, 252, 231];
        data.cell.styles.textColor = [21, 128, 61];
      }
      if (data.section === 'body' && data.column.index === 3) {
        data.cell.styles.textColor = [14, 116, 144];
      }
      if (data.section === 'body' && data.column.index === 4) {
        data.cell.styles.textColor = [202, 138, 4];
      }
      if (data.section === 'body' && data.column.index === 5) {
        data.cell.styles.textColor = [220, 38, 38];
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || !linkColumns.has(data.column.index)) return;
      const url = linkRows[data.row.index]?.[data.column.index];
      if (url) {
        doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
      }
    },
  });

  const autoTableDoc = doc as typeof doc & { lastAutoTable?: { finalY?: number } };
  const tableBottomY = autoTableDoc.lastAutoTable?.finalY ?? 172;
  const summaryHeight = 38;
  let summaryY = tableBottomY + 14;

  if (summaryY + summaryHeight > doc.internal.pageSize.getHeight() - 24) {
    doc.addPage();
    summaryY = 28;
  }

  doc.setFillColor(239, 246, 255);
  doc.roundedRect(contentLeft, summaryY, contentWidth, summaryHeight, 8, 8, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 64, 175);
  doc.text('Totals', contentLeft + 12, summaryY + 15);
  doc.setTextColor(14, 116, 144);
  doc.text(`Distance: ${totalDistanceKm.toFixed(2)} km`, contentLeft + 12, summaryY + 29);
  doc.setFont(fontFamily, 'normal');

  const arrayBuffer = doc.output('arraybuffer');
  return { buffer: Buffer.from(arrayBuffer), fileName: getExportFileName(input.vehicleName), totalDistanceKm };
}

