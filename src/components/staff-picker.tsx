"use client";

import { cn } from "@/lib/utils";
import type { PublicStaff } from "@/lib/use-staff";

interface StaffPickerProps {
  staff: PublicStaff[];
  // null = any free staff member
  selected: string | null;
  onSelect: (staffId: string | null) => void;
  // "dark" for the dark mobile web app background.
  tone?: "light" | "dark";
}

// Chips to choose a staff member before picking the time. Hidden when the
// business has no staff.
export function StaffPicker({ staff, selected, onSelect, tone = "light" }: StaffPickerProps) {
  if (staff.length === 0) return null;
  const options: Array<{ id: string | null; name: string; description?: string | null }> = [
    { id: null, name: "Любой мастер" },
    ...staff,
  ];
  const chosen = staff.find((s) => s.id === selected);

  return (
    <div className="mb-4">
      <p className={cn("mb-2 text-sm font-medium", tone === "dark" ? "text-white" : "text-gray-900")}>
        Мастер
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.id === selected;
          return (
            <button
              key={option.id ?? "any"}
              type="button"
              onClick={() => onSelect(option.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : tone === "dark"
                    ? "border-white/20 bg-white text-slate-900"
                    : "border-gray-300 bg-white text-gray-900"
              )}
            >
              {option.name}
            </button>
          );
        })}
      </div>
      {chosen?.description && (
        <p className={cn("mt-2 text-xs", tone === "dark" ? "text-blue-100" : "text-gray-500")}>
          {chosen.description}
        </p>
      )}
    </div>
  );
}
