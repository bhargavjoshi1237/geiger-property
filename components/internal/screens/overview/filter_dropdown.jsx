"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const defaultOptions = [
  { value: "1d", label: "Last 1 day" },
  { value: "1w", label: "Last 1 week" },
  { value: "1m", label: "Last 1 month" },
];

export default function FilterDropdown({
  value: controlledValue,
  onValueChange,
  options = defaultOptions,
  placeholder = "Select filter",
  height = "h-8",
}) {
  const [internalFilter, setInternalFilter] = useState(options[0]?.value || "1d");

  const filter = controlledValue !== undefined ? controlledValue : internalFilter;

  const handleValueChange = (newValue) => {
    if (onValueChange) {
      onValueChange(newValue);
    } else {
      setInternalFilter(newValue);
    }
  };

  const getFilterLabel = (filterValue) => {
    const option = options.find((opt) => opt.value === filterValue);
    return option?.label || placeholder;
  };

  return (
    <div className="flex items-center gap-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={`bg-surface-card border-border text-foreground hover:bg-surface-subtle text-xs px-3 rounded-md font-medium ${height}`}
          >
            {getFilterLabel(filter)}{" "}
            <ChevronDown className="w-3.5 h-3.5 ml-2 text-text-secondary" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-surface-subtle border-border text-foreground">
          <DropdownMenuRadioGroup value={filter} onValueChange={handleValueChange}>
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className="text-xs focus:bg-surface-hover focus:text-foreground cursor-pointer"
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
