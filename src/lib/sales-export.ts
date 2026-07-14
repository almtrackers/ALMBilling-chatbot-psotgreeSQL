import type { Sale } from '@/lib/types';
import { normalizePhoneNumber } from '@/lib/utils';

export type AgentContactType = 'person-contact' | 'person-alert' | 'tracker-sim';

export const AGENT_CONTACT_LABELS: Record<AgentContactType, string> = {
  'person-contact': 'PERSON - Contact',
  'person-alert': 'PERSON - Alert',
  'tracker-sim': 'TRACKER SIM',
};

function escapeVcardValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function escapeCsvValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildDisplayName(type: AgentContactType, sale: Sale): string {
  const vehicle = sale.vehicleNumber?.trim() || 'No Vehicle';
  const customer = sale.customerName?.trim() || 'Unknown';
  return `[${AGENT_CONTACT_LABELS[type]}] ${vehicle} - ${customer}`;
}

function parsePhones(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => normalizePhoneNumber(part).local)
    .filter((phone): phone is string => Boolean(phone && phone.length >= 10));
}

export function getSimPhone(sale: Sale): string | null {
  const sim = sale.simNumber?.trim();
  if (!sim) return null;
  const normalized = normalizePhoneNumber(sim).local;
  return normalized && normalized.length >= 10 ? normalized : sim;
}

export type AgentContactRow = {
  name: string;
  phone: string;
  contactType: AgentContactType;
  contactTypeLabel: string;
  vehicleNumber: string;
  customerName: string;
  linkedSimNumber: string;
  linkedCustomerNumber: string;
  imei: string;
  status: string;
};

function pushUniqueRow(
  rows: AgentContactRow[],
  seen: Set<string>,
  row: AgentContactRow
) {
  const key = `${row.contactType}:${row.phone}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push(row);
}

export function getPersonContactRows(sales: Sale[]): AgentContactRow[] {
  const rows: AgentContactRow[] = [];
  const seen = new Set<string>();

  for (const sale of sales) {
    const contactPhones = parsePhones(sale.contactNumber);
    const alertPhones = parsePhones(sale.phoneRobocall).filter(
      (phone) => !contactPhones.includes(phone)
    );
    const simNumber = getSimPhone(sale) || sale.simNumber || '';

    for (const phone of contactPhones) {
      pushUniqueRow(rows, seen, {
        name: buildDisplayName('person-contact', sale),
        phone,
        contactType: 'person-contact',
        contactTypeLabel: AGENT_CONTACT_LABELS['person-contact'],
        vehicleNumber: sale.vehicleNumber || '',
        customerName: sale.customerName || '',
        linkedSimNumber: simNumber,
        linkedCustomerNumber: phone,
        imei: sale.imei || '',
        status: sale.status || 'active',
      });
    }

    for (const phone of alertPhones) {
      pushUniqueRow(rows, seen, {
        name: buildDisplayName('person-alert', sale),
        phone,
        contactType: 'person-alert',
        contactTypeLabel: AGENT_CONTACT_LABELS['person-alert'],
        vehicleNumber: sale.vehicleNumber || '',
        customerName: sale.customerName || '',
        linkedSimNumber: simNumber,
        linkedCustomerNumber: contactPhones[0] || phone,
        imei: sale.imei || '',
        status: sale.status || 'active',
      });
    }
  }

  return rows;
}

export function getTrackerSimContactRows(sales: Sale[]): AgentContactRow[] {
  const rows: AgentContactRow[] = [];
  const seen = new Set<string>();

  for (const sale of sales) {
    const simNumber = getSimPhone(sale);
    if (!simNumber) continue;

    const customerNumber =
      parsePhones(sale.contactNumber)[0] ||
      parsePhones(sale.phoneRobocall)[0] ||
      '';

    pushUniqueRow(rows, seen, {
      name: buildDisplayName('tracker-sim', sale),
      phone: simNumber,
      contactType: 'tracker-sim',
      contactTypeLabel: AGENT_CONTACT_LABELS['tracker-sim'],
      vehicleNumber: sale.vehicleNumber || '',
      customerName: sale.customerName || '',
      linkedSimNumber: simNumber,
      linkedCustomerNumber: customerNumber,
      imei: sale.imei || '',
      status: sale.status || 'active',
    });
  }

  return rows;
}

export function getAllAgentContactRows(sales: Sale[]): AgentContactRow[] {
  return [...getPersonContactRows(sales), ...getTrackerSimContactRows(sales)];
}

/** @deprecated Use getPersonContactRows */
export function getCustomerContactRows(sales: Sale[]) {
  return getPersonContactRows(sales).map((row) => ({
    name: row.name,
    phone: row.phone,
    vehicleNumber: row.vehicleNumber,
    customerName: row.customerName,
    simNumber: row.linkedSimNumber,
    imei: row.imei,
    status: row.status,
  }));
}

/** @deprecated Use getTrackerSimContactRows */
export function getSimContactRows(sales: Sale[]) {
  return getTrackerSimContactRows(sales).map((row) => ({
    name: row.name,
    simNumber: row.phone,
    vehicleNumber: row.vehicleNumber,
    customerName: row.customerName,
    customerNumber: row.linkedCustomerNumber,
    imei: row.imei,
    status: row.status,
  }));
}

function buildVcardNote(row: AgentContactRow): string {
  if (row.contactType === 'tracker-sim') {
    return [
      'Number Type: Tracker SIM (device SIM, not customer)',
      `Vehicle: ${row.vehicleNumber}`,
      `Customer: ${row.customerName}`,
      row.linkedCustomerNumber ? `Person Number: ${row.linkedCustomerNumber}` : '',
      row.imei ? `IMEI: ${row.imei}` : '',
      `Status: ${row.status}`,
    ]
      .filter(Boolean)
      .join(' | ');
  }

  return [
    'Number Type: Person (customer/owner)',
    `Vehicle: ${row.vehicleNumber}`,
    row.linkedSimNumber ? `Tracker SIM: ${row.linkedSimNumber}` : '',
    row.imei ? `IMEI: ${row.imei}` : '',
    `Status: ${row.status}`,
  ]
    .filter(Boolean)
    .join(' | ');
}

function buildVcardCategory(type: AgentContactType): string {
  switch (type) {
    case 'tracker-sim':
      return 'Tracker SIM,Device,AlmTrack';
    case 'person-contact':
      return 'Person,Customer,AlmTrack';
    case 'person-alert':
      return 'Person,Alert,AlmTrack';
  }
}

function buildVcardTitle(type: AgentContactType): string {
  switch (type) {
    case 'tracker-sim':
      return 'Tracker SIM - Text Device Only';
    case 'person-contact':
      return 'Person - Customer Contact';
    case 'person-alert':
      return 'Person - Alert Number';
  }
}

function buildVcardOrg(type: AgentContactType): string {
  return type === 'tracker-sim' ? 'AlmTrack Tracker SIM' : 'AlmTrack Person';
}

function buildAgentContactsVcf(rows: AgentContactRow[]): string {
  const cards = rows.map((row) =>
    [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVcardValue(row.name)}`,
      `N:${escapeVcardValue(row.customerName)};;;${escapeVcardValue(row.vehicleNumber)};`,
      `TEL;TYPE=CELL:${row.phone}`,
      `TITLE:${escapeVcardValue(buildVcardTitle(row.contactType))}`,
      `ORG:${escapeVcardValue(buildVcardOrg(row.contactType))}`,
      `CATEGORIES:${buildVcardCategory(row.contactType)}`,
      `NOTE:${escapeVcardValue(buildVcardNote(row))}`,
      'END:VCARD',
    ].join('\r\n')
  );

  return `${cards.join('\r\n')}\r\n`;
}

export function buildPersonContactsVcf(sales: Sale[]): string {
  return buildAgentContactsVcf(getPersonContactRows(sales));
}

export function buildTrackerSimContactsVcf(sales: Sale[]): string {
  return buildAgentContactsVcf(getTrackerSimContactRows(sales));
}

export function buildAllAgentContactsVcf(sales: Sale[]): string {
  return buildAgentContactsVcf(getAllAgentContactRows(sales));
}

/** @deprecated Use buildPersonContactsVcf */
export function buildCustomerContactsVcf(sales: Sale[]): string {
  return buildPersonContactsVcf(sales);
}

/** @deprecated Use buildTrackerSimContactsVcf */
export function buildSimContactsVcf(sales: Sale[]): string {
  return buildTrackerSimContactsVcf(sales);
}

function buildAgentContactsCsv(rows: AgentContactRow[]): string {
  const header = [
    'Name',
    'Number Type',
    'Phone',
    'Vehicle Number',
    'Customer Name',
    'Linked Person Number',
    'Linked Tracker SIM',
    'IMEI',
    'Status',
  ];
  const lines = rows.map((row) =>
    [
      escapeCsvValue(row.name),
      escapeCsvValue(row.contactTypeLabel),
      escapeCsvValue(row.phone),
      escapeCsvValue(row.vehicleNumber),
      escapeCsvValue(row.customerName),
      escapeCsvValue(row.linkedCustomerNumber),
      escapeCsvValue(row.linkedSimNumber),
      escapeCsvValue(row.imei),
      escapeCsvValue(row.status),
    ].join(',')
  );
  return [header.join(','), ...lines].join('\n');
}

export function buildPersonContactsCsv(sales: Sale[]): string {
  return buildAgentContactsCsv(getPersonContactRows(sales));
}

export function buildTrackerSimContactsCsv(sales: Sale[]): string {
  return buildAgentContactsCsv(getTrackerSimContactRows(sales));
}

export function buildAllAgentContactsCsv(sales: Sale[]): string {
  return buildAgentContactsCsv(getAllAgentContactRows(sales));
}

/** @deprecated Use buildPersonContactsCsv */
export function buildCustomerContactsCsv(sales: Sale[]): string {
  return buildPersonContactsCsv(sales);
}

/** @deprecated Use buildTrackerSimContactsCsv */
export function buildSimContactsCsv(sales: Sale[]): string {
  return buildTrackerSimContactsCsv(sales);
}

export function buildAlertNumbersCsv(sales: Sale[]): string {
  const header = ['vehicleNumber', 'imei', 'msisdn', 'numberType'];
  const lines = sales.map((sale) => {
    const vehicleNumber = escapeCsvValue(sale.vehicleNumber || '');
    const imei = sale.imei || '';
    const msisdn = sale.phoneRobocall || '';
    return [vehicleNumber, imei, msisdn, escapeCsvValue('PERSON - Alert')].join(',');
  });
  return [header.join(','), ...lines].join('\n');
}

export function downloadTextFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
