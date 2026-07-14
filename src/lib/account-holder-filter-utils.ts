import type { Expense, Invoice, Person, Sale } from './types';

export type AccountHolderOption = {
  value: string;
  label: string;
};

export function getUniqueNameOptions(
  names: (string | undefined | null)[]
): AccountHolderOption[] {
  const unique = new Map<string, string>();
  names.forEach((name) => {
    const trimmed = name?.trim();
    if (trimmed) unique.set(trimmed, trimmed);
  });
  return Array.from(unique.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getSaleAccountHolderOptions(
  sales: Sale[] | undefined
): AccountHolderOption[] {
  if (!sales) return [];
  return getUniqueNameOptions(sales.map((s) => s.customerName));
}

export function getInvoiceAccountHolderOptions(
  invoices: Invoice[] | undefined
): AccountHolderOption[] {
  if (!invoices) return [];
  return getUniqueNameOptions(invoices.map((i) => i.customerName));
}

/** People (partners/employees) that have at least one linked expense record. */
export function getExpensePersonOptions(
  expenses: Expense[] | undefined,
  people: Person[] | undefined
): AccountHolderOption[] {
  if (!expenses || !people) return [];

  const personIdsWithRecords = new Set(
    expenses.map((e) => e.personId).filter((id): id is string => !!id)
  );

  return people
    .filter((p) => personIdsWithRecords.has(p.id))
    .map((p) => ({ value: p.id, label: p.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
