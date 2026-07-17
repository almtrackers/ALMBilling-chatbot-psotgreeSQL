import fs from 'fs';
import path from 'path';
import { addMonths, addYears, format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import prisma from '@/lib/prisma/client';
import { WALLET_AUTO_PAY_BY } from '@/lib/wallet-sync';

function money(value: number) {
  return `PKR ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function logoBase64() {
  try {
    return fs.readFileSync(path.join(process.cwd(), 'public', 'logo.png')).toString('base64');
  } catch {
    return null;
  }
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'customer';
}

export async function generateWalletStatementPdf(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      devices: true,
      transactions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
    },
  });
  if (!user) throw new Error('Wallet not found');

  const invoices = user.traccarId
    ? await prisma.invoice.findMany({
        where: { customerIdentifier: String(user.traccarId) },
        orderBy: { createdAt: 'desc' },
      })
    : [];

  const transactions = user.transactions.map((transaction) => ({
    type: transaction.type,
    amount: transaction.amount.toNumber(),
    balanceAfter: transaction.balanceAfter.toNumber(),
    description: transaction.description.replace(/\[(?:SUB|INV|AUTOPAY):[^\]]+\]\s*/g, ''),
    createdAt: transaction.createdAt,
  }));
  const totalDebits = transactions
    .filter((transaction) => transaction.type === 'debit')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalCredits = transactions
    .filter((transaction) => transaction.type === 'credit')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const autoPaidTotal = transactions
    .filter((transaction) => transaction.type === 'auto-pay')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const pendingInvoicesTotal = invoices
    .filter((invoice) => invoice.status === 'pending')
    .reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0);

  const now = new Date();
  const deviceRows: string[][] = [];
  for (const device of user.devices) {
    const addPeriod = device.planType === 'yearly' ? addYears : addMonths;
    let periodStart = new Date(device.billingStartDate);
    let periodNumber = 1;

    while (periodStart <= now && periodNumber <= 240) {
      const periodEnd = addPeriod(periodStart, 1);
      deviceRows.push([
        device.name,
        `${device.planType} / ${money(device.planPrice.toNumber())}`,
        String(periodNumber),
        format(periodStart, 'dd MMM yyyy'),
        format(periodEnd, 'dd MMM yyyy'),
        periodNumber === 1 ? '-' : money(device.planPrice.toNumber()),
        periodNumber === 1 ? 'Free (first period)' : 'Charged',
      ]);
      periodStart = periodEnd;
      periodNumber += 1;
    }

    deviceRows.push([
      device.name,
      `${device.planType} / ${money(device.planPrice.toNumber())}`,
      String(periodNumber),
      format(periodStart, 'dd MMM yyyy'),
      format(addPeriod(periodStart, 1), 'dd MMM yyyy'),
      money(device.planPrice.toNumber()),
      'Upcoming',
    ]);
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const logo = logoBase64();
  if (logo) doc.addImage(`data:image/png;base64,${logo}`, 'PNG', margin, 7, 25, 25);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('Al-Muhafiz Tracker (PVT) LTD', logo ? 41 : margin, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(37, 99, 235);
  doc.text('Helpline: +92 311 1133170', logo ? 41 : margin, 21);
  doc.text('Website: almtrace.com  |  Email: hello@almtrace.com', logo ? 41 : margin, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text('Wallet Statement', pageWidth - margin, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Generated: ${format(now, 'dd MMM yyyy HH:mm')}`, pageWidth - margin, 22, {
    align: 'right',
  });
  doc.setDrawColor(191, 219, 254);
  doc.line(margin, 35, pageWidth - margin, 35);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(`Customer: ${user.name}`, margin, 42);
  doc.text(`Traccar User ID: ${user.traccarId ?? 'N/A'}`, margin, 48);
  doc.text(`Phone: ${user.phone || 'N/A'}   Email: ${user.email || 'N/A'}`, margin + 75, 48);

  autoTable(doc, {
    startY: 54,
    head: [['Subscription Charges', 'Invoice Payments', 'Current Balance', 'Auto-Paid', 'Pending']],
    body: [[
      money(totalDebits),
      money(totalCredits),
      money(user.balance.toNumber()),
      money(autoPaidTotal),
      money(pendingInvoicesTotal),
    ]],
    theme: 'grid',
    styles: { fontSize: 9, halign: 'center' },
    headStyles: { fillColor: [30, 64, 175] },
  });

  const withLastTable = doc as typeof doc & { lastAutoTable?: { finalY?: number } };
  let y = (withLastTable.lastAutoTable?.finalY ?? 65) + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Device Subscription Schedule', margin, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Device', 'Plan', 'Period', 'Start', 'End', 'Charge', 'Status']],
    body: deviceRows.length ? deviceRows : [['No billing devices', '', '', '', '', '', '']],
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [51, 65, 85] },
    margin: { left: margin, right: margin },
  });

  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Transaction History', margin, 15);
  autoTable(doc, {
    startY: 19,
    head: [['Date', 'Type', 'Description', 'Debit', 'Credit', 'Balance']],
    body: transactions.length
      ? transactions.map((transaction) => [
          format(transaction.createdAt, 'dd MMM yyyy HH:mm'),
          transaction.type,
          transaction.description,
          transaction.type === 'debit' ? money(transaction.amount) : '',
          transaction.type === 'credit' ? money(transaction.amount) : '',
          money(transaction.balanceAfter),
        ])
      : [['No transactions', '', '', '', '', '']],
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 1.6, overflow: 'linebreak' },
    headStyles: { fillColor: [51, 65, 85] },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 18 },
      2: { cellWidth: 120 },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 30, halign: 'right' },
    },
    margin: { left: margin, right: margin },
  });

  y = (withLastTable.lastAutoTable?.finalY ?? 20) + 8;
  if (y > doc.internal.pageSize.getHeight() - 35) {
    doc.addPage();
    y = 15;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Invoices', margin, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Invoice ID', 'Period', 'Amount', 'Status', 'Paid At', 'Paid By']],
    body: invoices.length
      ? invoices.map((invoice) => [
          invoice.id,
          `${format(invoice.periodStart, 'dd MMM yy')} - ${format(invoice.periodEnd, 'dd MMM yy')}`,
          money(invoice.totalAmount),
          invoice.paidBy === WALLET_AUTO_PAY_BY ? 'Paid (wallet auto)' : invoice.status,
          invoice.paidAt ? format(invoice.paidAt, 'dd MMM yyyy HH:mm') : '-',
          invoice.paidBy || '-',
        ])
      : [['No invoices', '', '', '', '', '']],
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 1.6, overflow: 'linebreak' },
    headStyles: { fillColor: [51, 65, 85] },
    margin: { left: margin, right: margin },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(
      'Al-Muhafiz Tracker (PVT) LTD  |  Helpline: +92 311 1133170  |  almtrace.com',
      margin,
      doc.internal.pageSize.getHeight() - 6
    );
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 6, {
      align: 'right',
    });
  }

  return {
    buffer: Buffer.from(doc.output('arraybuffer')),
    fileName: `wallet-statement-${safeFilePart(user.name)}-${format(now, 'yyyyMMdd')}.pdf`,
    walletName: user.name,
    balance: user.balance.toNumber(),
  };
}
