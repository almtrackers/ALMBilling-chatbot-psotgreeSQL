"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  touchScrollClassName,
  useTouchScroll,
  wasRecentTouchScroll,
} from "@/hooks/use-touch-scroll"

export type ComboboxOption = {
  value: string
  label: React.ReactNode
}

type ComboboxProps = {
  options: ComboboxOption[]
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  noResultsMessage?: string
  disabled?: boolean
  className?: string
  isMultiSelect?: boolean
  selectedValues?: string[]
  allowCustomValue?: boolean
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select an option...",
  searchPlaceholder = "Search...",
  noResultsMessage = "No results found.",
  disabled = false,
  className,
  isMultiSelect = false,
  selectedValues = [],
  allowCustomValue = false,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const listScrollRef = useTouchScroll<HTMLDivElement>()

  const selectedOption = !isMultiSelect
    ? options.find((option) => option.value === value)
    : null

  const triggerText = isMultiSelect
    ? selectedValues.length > 0
      ? `${selectedValues.length} selected`
      : placeholder
    : selectedOption
      ? selectedOption.label
      : value || placeholder

  const handleInputChange = (search: string) => {
    setInputValue(search)
    if (allowCustomValue) {
      onChange(search)
    }
  }

  const handleSelect = (currentValue: string) => {
    if (wasRecentTouchScroll()) return
    if (isMultiSelect) {
      onChange(currentValue)
    } else {
      const newValue = currentValue === value ? "" : currentValue
      onChange(newValue)
      setInputValue(newValue)
      setOpen(false)
    }
  }

  React.useEffect(() => {
    if (!open) {
      if (allowCustomValue) {
        const isValueInOptions = options.some(
          (opt) => opt.label === inputValue || opt.value === inputValue
        )
        if (!isValueInOptions) {
          onChange(inputValue)
        }
      }
    }
  }, [open, inputValue, allowCustomValue, options, onChange])

  const filteredOptions = React.useMemo(() => {
    if (allowCustomValue && inputValue) {
      return options.filter((option) =>
        String(option.label).toLowerCase().includes(inputValue.toLowerCase())
      )
    }
    return options
  }, [options, inputValue, allowCustomValue])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          <span className="truncate">{triggerText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        onWheel={(event) => event.stopPropagation()}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Command shouldFilter={!allowCustomValue} disablePointerSelection>
          <CommandInput
            placeholder={searchPlaceholder}
            value={allowCustomValue ? inputValue : undefined}
            onValueChange={allowCustomValue ? handleInputChange : undefined}
          />
          <div
            ref={listScrollRef}
            data-dropdown-scroll
            role="listbox"
            className={cn(
              "max-h-[min(16rem,50vh)] overflow-y-auto overflow-x-hidden p-1",
              touchScrollClassName
            )}
          >
            {filteredOptions.length === 0 ? (
              <CommandEmpty>{noResultsMessage}</CommandEmpty>
            ) : (
              <CommandGroup className="overflow-visible p-0">
                {filteredOptions.map((option) => {
                  const isSelected = isMultiSelect
                    ? selectedValues.includes(option.value)
                    : value === option.value
                  return (
                    <CommandItem
                      key={option.value}
                      value={String(option.label)}
                      onSelect={() => handleSelect(option.value)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {option.label}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
