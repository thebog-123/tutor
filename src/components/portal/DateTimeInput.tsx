"use client";

import { useEffect, useState } from "react";
import { toDateTimeLocal } from "@/lib/format";

/**
 * `datetime-local` expects a wall-clock string in the *viewer's* timezone, so
 * the value is filled in after mount rather than rendered on the server.
 */
export function DateTimeInput({
  name,
  defaultValue,
  id,
  required,
  className = "field-input",
}: {
  name: string;
  defaultValue?: string | null;
  id?: string;
  required?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (defaultValue) setValue(toDateTimeLocal(defaultValue));
  }, [defaultValue]);

  return (
    <input
      id={id}
      name={name}
      type="datetime-local"
      required={required}
      className={className}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}
