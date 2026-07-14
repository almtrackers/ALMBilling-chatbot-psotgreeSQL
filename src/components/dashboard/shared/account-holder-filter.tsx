'use client';

import { Combobox } from '@/components/ui/combobox';
import type { AccountHolderOption } from '@/lib/account-holder-filter-utils';

type AccountHolderFilterProps = {
  value: string;
  onChange: (value: string) => void;
  options: AccountHolderOption[];
  disabled?: boolean;
  className?: string;
};

export default function AccountHolderFilter({
  value,
  onChange,
  options,
  disabled = false,
  className,
}: AccountHolderFilterProps) {
  const comboboxOptions = [
    { value: 'all', label: 'All Account Holders' },
    ...options,
  ];

  return (
    <Combobox
      options={comboboxOptions}
      value={value}
      onChange={onChange}
      placeholder="All account holders..."
      searchPlaceholder="Search account holder..."
      noResultsMessage="No account holders with records found."
      disabled={disabled || options.length === 0}
      className={className}
    />
  );
}
