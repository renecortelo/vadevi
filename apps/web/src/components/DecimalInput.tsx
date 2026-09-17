import { useState, type InputHTMLAttributes } from "react";

import { parseDecimalInput } from "../lib/decimal";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type" | "value"> & {
  onChange: (value: number | null) => void;
  value: number | null;
};

/**
 * A number a person types, including its decimal separator.
 *
 * Two things had to be true at once: the phone must show the numeric keypad, and
 * a comma must be typable — `<input type="number">` gives the first and refuses
 * the second, so on a Spanish keyboard no decimal could be entered at all. This
 * is a text input with `inputMode="decimal"`, which gets the keypad without
 * policing the separator.
 *
 * It keeps the typed text of its own, because storing only the parsed number
 * would erase the separator the moment it was typed — "12," parses to 12, which
 * would render back as "12" and leave nowhere to put the decimals. The parsed
 * value is reported on every keystroke; the text is what the reader sees.
 */
export function DecimalInput({ onChange, value, ...rest }: Props) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [seenValue, setSeenValue] = useState(value);

  // Follow the value when it changes from somewhere else — a loaded draft, a
  // prefill — without fighting what is being typed right now. Adjusting state
  // during render is React's own answer for this; an effect would render the
  // stale text first, and the linter rightly refuses it.
  if (value !== seenValue) {
    setSeenValue(value);
    if (parseDecimalInput(text) !== value) setText(value === null ? "" : String(value));
  }

  return (
    <input
      {...rest}
      inputMode="decimal"
      onChange={(event) => {
        setText(event.target.value);
        onChange(parseDecimalInput(event.target.value));
      }}
      type="text"
      value={text}
    />
  );
}
