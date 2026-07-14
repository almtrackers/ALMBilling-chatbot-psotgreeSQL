import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { renderAddressImage, type PdfAddressImage } from '@/lib/chatbot/text-as-image';

export type TripReportRow = {
  deviceId: number;
  distance: number;
  averageSpeed: number;
  maxSpeed: number;
  startTime: string;
  endTime: string;
  duration?: number;
  startLatitude?: number;
  startLongitude?: number;
  endLatitude?: number;
  endLongitude?: number;
  startAddress?: string;
  endAddress?: string;
};

export type TripReportPdfInput = {
  vehicleName: string;
  from: Date;
  to: Date;
  trips: TripReportRow[];
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

function formatDuration(startTime: string, endTime: string, durationMs?: number) {
  const ms =
    typeof durationMs === 'number' && Number.isFinite(durationMs)
      ? durationMs
      : new Date(endTime).getTime() - new Date(startTime).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '-';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function mapsLink(lat?: number, lng?: number) {
  if (lat == null || lng == null) return undefined;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function playbackLink(trip: TripReportRow) {
  const from = new Date(trip.startTime);
  const to = new Date(trip.endTime);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return undefined;
  const params = new URLSearchParams({
    deviceId: String(trip.deviceId),
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return `https://app.almtrace.com/replay?${params.toString()}`;
}

function addressLabel(trip: TripReportRow, kind: 'start' | 'end') {
  const address = kind === 'start' ? trip.startAddress : trip.endAddress;
  if (address && address.trim()) return address.trim();
  const lat = kind === 'start' ? trip.startLatitude : trip.endLatitude;
  const lng = kind === 'start' ? trip.startLongitude : trip.endLongitude;
  if (lat != null && lng != null) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return '-';
}

function getExportFileName(vehicleName: string) {
  const safe =
    vehicleName
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 80) || 'vehicle';
  return `trips-${safe}-${format(new Date(), 'yyyyMMddHHmmss')}.pdf`;
}

/**
 * Generates a landscape trip PDF matching Al-Muhafiz Android app trip report.
 */
export async function generateTripReportPdf(input: TripReportPdfInput): Promise<{
  buffer: Buffer;
  fileName: string;
  totalDistanceKm: number;
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
    vehicle: 64,
    start: 72,
    end: 72,
    distance: 38,
    avgSpeed: 34,
    maxSpeed: 34,
    duration: 48,
    playback: 44,
    startAddress: 136,
    endAddress: 136,
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
    input.trips.reduce((sum, trip) => sum + Number(trip.distance || 0), 0) / 1000;
  const totalDurationMs = input.trips.reduce((sum, trip) => {
    if (typeof trip.duration === 'number' && Number.isFinite(trip.duration)) {
      return sum + trip.duration;
    }
    return sum + (new Date(trip.endTime).getTime() - new Date(trip.startTime).getTime());
  }, 0);
  const totalDurationLabel = formatDuration(
    input.from.toISOString(),
    input.to.toISOString(),
    totalDurationMs
  );

  const headers = [
    'Vehicle (No.)',
    'Start',
    'End',
    'KM',
    'Avg',
    'Max',
    'Duration',
    'Replay',
    'Start Address',
    'End Address',
  ];

  const linkColumns = new Set([7, 8, 9]);
  const linkRows = input.trips.map((trip) => [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    playbackLink(trip),
    mapsLink(trip.startLatitude, trip.startLongitude),
    mapsLink(trip.endLatitude, trip.endLongitude),
  ]);

  const addressImageRows = input.trips.map((trip) => [
    renderAddressImage(addressLabel(trip, 'start'), pdfColumnWidths.startAddress),
    renderAddressImage(addressLabel(trip, 'end'), pdfColumnWidths.endAddress),
  ]);

  const rows = input.trips.map((trip, index) => [
    input.vehicleName,
    format(new Date(trip.startTime), 'yy-MM-dd HH:mm'),
    format(new Date(trip.endTime), 'yy-MM-dd HH:mm'),
    (Number(trip.distance || 0) / 1000).toFixed(2),
    Number(trip.averageSpeed || 0).toFixed(1),
    Number(trip.maxSpeed || 0).toFixed(1),
    formatDuration(trip.startTime, trip.endTime, trip.duration),
    'Open',
    addressImageRows[index][0] ? '' : addressLabel(trip, 'start'),
    addressImageRows[index][1] ? '' : addressLabel(trip, 'end'),
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
  doc.text(`Total Trips: ${input.trips.length}`, contentLeft + contentWidth / 2 + 12, 114);

  doc.setFillColor(224, 242, 254);
  doc.roundedRect(contentLeft, 142, contentWidth, 22, 8, 8, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(29, 78, 216);
  doc.text('Trip Report', tableCenterX, 156, { align: 'center' });
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
      6: { cellWidth: pdfColumnWidths.duration },
      7: { cellWidth: pdfColumnWidths.playback },
      8: { cellWidth: pdfColumnWidths.startAddress, halign: 'right' },
      9: { cellWidth: pdfColumnWidths.endAddress, halign: 'right' },
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

      if (data.section === 'body' && (data.column.index === 8 || data.column.index === 9)) {
        const addressImage = addressImageRows[data.row.index]?.[data.column.index - 8] as
          | PdfAddressImage
          | null
          | undefined;
        if (addressImage) {
          data.cell.styles.minCellHeight = addressImage.heightPt + 6;
          data.cell.styles.halign = 'right';
          data.cell.text = [''];
        }
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && (data.column.index === 8 || data.column.index === 9)) {
        const addressImage = addressImageRows[data.row.index]?.[data.column.index - 8];
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
  doc.setTextColor(14, 116, 144);
  doc.text(`Distance: ${totalDistanceKm.toFixed(2)} km`, contentLeft + 12, summaryY + 29);
  doc.setTextColor(185, 28, 28);
  doc.text(`Duration: ${totalDurationLabel}`, contentLeft + contentWidth / 2 + 12, summaryY + 29);
  doc.setFont(fontFamily, 'normal');

  const arrayBuffer = doc.output('arraybuffer');
  return {
    buffer: Buffer.from(arrayBuffer),
    fileName: getExportFileName(input.vehicleName),
    totalDistanceKm,
    totalDurationLabel,
  };
}
