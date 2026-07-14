import fs from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { renderAddressImage } from '@/lib/chatbot/text-as-image';

export type EventsReportRow = {
  deviceId: number;
  positionId?: number;
  type?: string;
  serverTime?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  attributes?: Record<string, unknown>;
};

export type EventsReportPdfInput = {
  vehicleName: string;
  from: Date;
  to: Date;
  rows: EventsReportRow[];
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

function replayLinkAround(deviceId: number, time: Date) {
  const from = new Date(time.getTime() - 10 * 60 * 1000);
  const to = new Date(time.getTime() + 10 * 60 * 1000);
  const params = new URLSearchParams({
    deviceId: String(deviceId),
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return `https://app.almtrace.com/replay?${params.toString()}`;
}

function safeDate(value: unknown) {
  const d = value ? new Date(String(value)) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

function getSpeedKmH(row: EventsReportRow) {
  const raw = (row.attributes as any)?.speed;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return 0;
  return num * 1.852;
}

function addressLabel(row: EventsReportRow) {
  if (row.address && row.address.trim()) return row.address.trim();
  if (row.latitude != null && row.longitude != null) {
    return `${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}`;
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
  return `events-${safe}-${format(new Date(), 'yyyyMMddHHmmss')}.pdf`;
}

export async function generateEventsReportPdf(input: EventsReportPdfInput): Promise<{
  buffer: Buffer;
  fileName: string;
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
    time: 90,
    type: 130,
    address: 280,
    speed: 55,
    replay: 55,
  } as const;

  const pageWidth = doc.internal.pageSize.getWidth();
  const maxContentWidth = pageWidth - 36;
  const requestedTableWidth = Object.values(pdfColumnWidths).reduce((sum, width) => sum + width, 0);
  const contentWidth = Math.min(maxContentWidth, requestedTableWidth);
  const contentLeft = (pageWidth - contentWidth) / 2;
  const pdfMargins = { left: contentLeft, right: contentLeft };
  const tableCenterX = contentLeft + contentWidth / 2 - 18;

  const dateLabel = `${format(input.from, 'yyyy-MM-dd HH:mm')} to ${format(input.to, 'yyyy-MM-dd HH:mm')}`;

  const headers = ['Vehicle (No.)', 'Time', 'Type', 'Address', 'Speed', 'Replay'];
  const linkColumns = new Set([5]);
  const linkRows = input.rows.map((row) => {
    const dt = safeDate(row.serverTime) ?? input.from;
    return [undefined, undefined, undefined, undefined, undefined, replayLinkAround(row.deviceId, dt)];
  });

  const rows = input.rows.map((row, index) => {
    const dt = safeDate(row.serverTime);
    const label = addressLabel(row);
    return [
      input.vehicleName,
      dt ? format(dt, 'yy-MM-dd HH:mm') : '-',
      String(row.type || '-'),
      // placeholder; replaced below after images are built
      label,
      `${getSpeedKmH(row).toFixed(1)} km/h`,
      'Open',
    ];
  });

  const addressImages = input.rows.map((row) =>
    renderAddressImage(addressLabel(row), pdfColumnWidths.address)
  );
  addressImages.forEach((img, index) => {
    if (img) rows[index][3] = '';
  });

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
  doc.text(`Total Events: ${input.rows.length}`, contentLeft + contentWidth / 2 + 12, 114);

  doc.setFillColor(224, 242, 254);
  doc.roundedRect(contentLeft, 142, contentWidth, 22, 8, 8, 'F');
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(29, 78, 216);
  doc.text('Events Report', tableCenterX, 156, { align: 'center' });
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
      1: { cellWidth: pdfColumnWidths.time },
      2: { cellWidth: pdfColumnWidths.type },
      3: { cellWidth: pdfColumnWidths.address },
      4: { cellWidth: pdfColumnWidths.speed, halign: 'right' },
      5: { cellWidth: pdfColumnWidths.replay },
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
      if (data.section === 'body' && data.column.index === 4) {
        data.cell.styles.textColor = [202, 138, 4];
      }

      if (data.section === 'body' && data.column.index === 3) {
        const addressImage = addressImages[data.row.index];
        if (addressImage) {
          data.cell.styles.minCellHeight = addressImage.heightPt + 6;
          data.cell.styles.halign = 'right';
          data.cell.text = [''];
        }
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
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

  const arrayBuffer = doc.output('arraybuffer');
  return { buffer: Buffer.from(arrayBuffer), fileName: getExportFileName(input.vehicleName) };
}
