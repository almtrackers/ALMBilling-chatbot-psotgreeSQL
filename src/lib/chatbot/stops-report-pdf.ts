import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { renderAddressImage } from '@/lib/chatbot/text-as-image';

export type StopReportRow = {
  deviceId: number;
  startTime: string;
  endTime: string;
  duration?: number;
  latitude?: number;
  longitude?: number;
  address?: string;
};

export type StopsReportPdfInput = {
  vehicleName: string;
  from: Date;
  to: Date;
  stops: StopReportRow[];
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

function formatStopDuration(stop: StopReportRow) {
  if (typeof stop.duration === 'number' && Number.isFinite(stop.duration)) {
    return formatDurationMs(stop.duration);
  }
  const ms = new Date(stop.endTime).getTime() - new Date(stop.startTime).getTime();
  return formatDurationMs(ms);
}

function mapsLink(lat?: number, lng?: number) {
  if (lat == null || lng == null) return undefined;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function addressLabel(stop: StopReportRow) {
  if (stop.address && stop.address.trim()) return stop.address.trim();
  if (stop.latitude != null && stop.longitude != null) {
    return `${stop.latitude.toFixed(5)}, ${stop.longitude.toFixed(5)}`;
  }
  return '-';
}

function getExportFileName(vehicleName: string) {
  const safe =
    vehicleName
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 80) || 'vehicle';
  return `stops-${safe}-${format(new Date(), 'yyyyMMddHHmmss')}.pdf`;
}

export async function generateStopsReportPdf(input: StopsReportPdfInput): Promise<{
  buffer: Buffer;
  fileName: string;
  totalDurationLabel: string;
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
    vehicle: 70,
    start: 90,
    end: 90,
    duration: 70,
    address: 420,
    map: 60,
  } as const;

  const pageWidth = doc.internal.pageSize.getWidth();
  const maxContentWidth = pageWidth - 36;
  const requestedTableWidth = Object.values(pdfColumnWidths).reduce((sum, width) => sum + width, 0);
  const contentWidth = Math.min(maxContentWidth, requestedTableWidth);
  const contentLeft = (pageWidth - contentWidth) / 2;
  const pdfMargins = { left: contentLeft, right: contentLeft };
  const tableCenterX = contentLeft + contentWidth / 2 - 18;

  const dateLabel = `${format(input.from, 'yyyy-MM-dd HH:mm')} to ${format(input.to, 'yyyy-MM-dd HH:mm')}`;
  const totalDurationMs = input.stops.reduce((sum, stop) => {
    if (typeof stop.duration === 'number' && Number.isFinite(stop.duration)) {
      return sum + stop.duration;
    }
    return sum + (new Date(stop.endTime).getTime() - new Date(stop.startTime).getTime());
  }, 0);
  const totalDurationLabel = formatDurationMs(totalDurationMs);

  const headers = ['Vehicle (No.)', 'Start', 'End', 'Duration', 'Address', 'Map'];
  const linkColumns = new Set([5]);
  const linkRows = input.stops.map((stop) => [undefined, undefined, undefined, undefined, undefined, mapsLink(stop.latitude, stop.longitude)]);
  const addressImages = input.stops.map((stop) =>
    renderAddressImage(addressLabel(stop), pdfColumnWidths.address)
  );
  const rows = input.stops.map((stop, index) => [
    input.vehicleName,
    format(new Date(stop.startTime), 'yy-MM-dd HH:mm'),
    format(new Date(stop.endTime), 'yy-MM-dd HH:mm'),
    formatStopDuration(stop),
    addressImages[index] ? '' : addressLabel(stop),
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
  doc.text(`Total Stops: ${input.stops.length}`, contentLeft + contentWidth / 2 + 12, 114);

  doc.setFillColor(224, 242, 254);
  doc.roundedRect(contentLeft, 142, contentWidth, 22, 8, 8, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(29, 78, 216);
  doc.text('Stop Report', tableCenterX, 156, { align: 'center' });
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
      3: { cellWidth: pdfColumnWidths.duration },
      4: { cellWidth: pdfColumnWidths.address },
      5: { cellWidth: pdfColumnWidths.map },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && linkColumns.has(data.column.index) && linkRows[data.row.index]?.[data.column.index]) {
        data.cell.styles.textColor = [37, 99, 235];
        data.cell.styles.fontStyle = 'normal';
      }
      if (data.section === 'body' && data.column.index === 5) {
        data.cell.styles.fillColor = [220, 252, 231];
        data.cell.styles.textColor = [21, 128, 61];
      }
      if (data.section === 'body' && data.column.index === 3) {
        data.cell.styles.textColor = [185, 28, 28];
      }

      if (data.section === 'body' && data.column.index === 4) {
        const addressImage = addressImages[data.row.index];
        if (addressImage) {
          data.cell.styles.minCellHeight = addressImage.heightPt + 6;
          data.cell.styles.halign = 'right';
          data.cell.text = [''];
        }
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const addressImage = addressImages[data.row.index];
        if (addressImage) {
          const drawWidth = Math.min(data.cell.width - 4, addressImage.widthPt);
          const drawHeight = addressImage.heightPt * (drawWidth / addressImage.widthPt);
          doc.addImage(
            addressImage.dataUrl,
            'PNG',
            data.cell.x + 2,
            data.cell.y + Math.max(2, (data.cell.height - drawHeight) / 2),
            drawWidth,
            drawHeight
          );
        }
      }

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
  doc.setTextColor(185, 28, 28);
  doc.text(`Duration: ${totalDurationLabel}`, contentLeft + 12, summaryY + 29);
  doc.setFont(fontFamily, 'normal');

  const arrayBuffer = doc.output('arraybuffer');
  return { buffer: Buffer.from(arrayBuffer), fileName: getExportFileName(input.vehicleName), totalDurationLabel };
}
