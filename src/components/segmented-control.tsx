"use client";

import { useId } from "react";

type Option<T extends string> = { value: T; label: string };

/** A row of radio buttons styled as one control. Arrow keys move the choice. */
export function SegmentedControl<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
}) {
  const labelId = useId();

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium text-fg">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex h-11 rounded-[10px] border border-line bg-raised p-1"
      >
        {options.map((option) => (
          <label key={option.value} className="relative flex-1">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="flex h-full cursor-pointer items-center justify-center rounded-md text-sm text-fg-secondary transition-colors duration-150 ease-out select-none hover:text-fg peer-checked:bg-selected peer-checked:font-medium peer-checked:text-fg peer-checked:shadow-control peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
