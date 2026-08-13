import { useEffect, useState } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  style?: React.CSSProperties;
  min?: number;
  max?: number;
  step?: number;
}

export function NumberInput({ value, onChange, style, min, max, step = 1 }: NumberInputProps) {
  const [text, setText] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setText(String(value));
    }
  }, [value, isFocused]);

  const clampValue = (next: number) => {
    let result = next;
    if (typeof min === 'number') result = Math.max(min, result);
    if (typeof max === 'number') result = Math.min(max, result);
    return result;
  };

  const handleChange = (raw: string) => {
    // Allow natural typing states like '', '-', '.', and '-.' while editing.
    if (!/^-?\d*\.?\d*$/.test(raw)) return;
    setText(raw);

    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    onChange(clampValue(parsed));
  };

  return (
    <input
      type='text'
      inputMode='decimal'
      value={text}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        if (text === '' || text === '-' || text === '.' || text === '-.') {
          setText(String(value));
        }
      }}
      onChange={event => handleChange(event.target.value)}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      style={style}
      min={min}
      max={max}
      step={step}
    />
  );
}
