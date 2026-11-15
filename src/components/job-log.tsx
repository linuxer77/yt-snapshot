"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { JobLogEntry } from "@/types/jobs";

const LEVEL_CLASS: Record<JobLogEntry["level"], string> = {
  info: "text-fg-secondary",
  debug: "text-fg-muted",
  warn: "text-accent",
  error: "text-danger",
};

function formatLogTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** The backend's step-by-step log, collapsed unless something went wrong. */
export function JobLog({
  logs,
  defaultOpen = false,
}: {
  logs: JobLogEntry[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const listId = useId();
  const listRef = useRef<HTMLOListElement>(null);

  // Keep the newest line in view while the job is still writing.
  useEffect(() => {
    const list = listRef.current;
    if (open && list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [open, logs.length]);

  return (
    <div className="border-t border-line pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="-mx-2 flex h-10 w-[calc(100%+1rem)] cursor-pointer items-center justify-between rounded-md px-2 text-sm text-fg-secondary transition-colors duration-150 ease-out hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="flex items-center gap-2">
          <ChevronRight
            size={16}
            strokeWidth={1.5}
            aria-hidden="true"
            className={`transition-transform duration-150 ease-out ${open ? "rotate-90" : ""}`}
          />
          Log
        </span>
        <span className="font-mono text-xs tabular-nums text-fg-muted">
          {logs.length} {logs.length === 1 ? "line" : "lines"}
        </span>
      </button>

      {open ? (
        <ol
          id={listId}
          ref={listRef}
          className="mt-2 max-h-72 overflow-auto rounded-lg border border-line bg-raised p-3 font-mono text-xs leading-5"
        >
          {logs.length ? (
            logs.map((entry, index) => (
              <li
                key={`${entry.time}-${index}`}
                className="grid grid-cols-[auto_3rem_minmax(0,1fr)] gap-3"
              >
                <time dateTime={entry.time} className="text-fg-muted tabular-nums">
                  {formatLogTime(entry.time)}
                </time>
                <span className={LEVEL_CLASS[entry.level] ?? LEVEL_CLASS.info}>
                  {entry.level}
                </span>
                <span className="wrap-break-word text-fg-secondary">
                  {entry.message}
                </span>
              </li>
            ))
          ) : (
            <li className="text-fg-muted">Nothing logged yet</li>
          )}
        </ol>
      ) : null}
    </div>
  );
}
