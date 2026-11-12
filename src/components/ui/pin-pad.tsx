"use client";
import { useId, useState } from "react";
import { Delete, Eye, EyeOff } from "lucide-react";

export function PinPad({
  value,
  onChange,
  name = "pin",
  label = "PIN หน้าขาย",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const append = (digit: string) => {
    if (!disabled && value.length < 6) onChange(value + digit);
  };
  return (
    <div
      className="pin-pad"
      role="group"
      aria-label={label}
      aria-describedby={`${id}-hint ${id}-status`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (disabled || e.ctrlKey || e.metaKey || e.altKey) return;
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          append(e.key);
        } else if (e.key === "Backspace") {
          e.preventDefault();
          onChange(value.slice(0, -1));
        } else if (e.key === "Delete") {
          e.preventDefault();
          onChange("");
        }
      }}
    >
      <input type="hidden" name={name} value={value} />
      <div className="pin-display">
        <div className="pin-slots" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={value[i] ? "filled" : ""}>
              {value[i] ? (revealed ? value[i] : "●") : ""}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="pin-reveal"
          aria-label={revealed ? "ซ่อน PIN" : "แสดง PIN"}
          aria-pressed={revealed}
          disabled={disabled}
          onClick={() => setRevealed(!revealed)}
        >
          {revealed ? (
            <EyeOff size={21} aria-hidden="true" />
          ) : (
            <Eye size={21} aria-hidden="true" />
          )}
        </button>
      </div>
      <div className="pin-guidance">
        <span id={`${id}-hint`}>ตัวเลข 4–6 หลัก</span>
        <output id={`${id}-status`} aria-live="polite" aria-atomic="true">
          กรอกแล้ว {value.length} หลัก
        </output>
      </div>
      <div className="pin-keys">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <button
            type="button"
            className="pin-key"
            key={digit}
            disabled={disabled}
            onClick={() => append(String(digit))}
          >
            {digit}
          </button>
        ))}
        <button
          type="button"
          className="pin-key pin-key-action"
          aria-label="ล้าง PIN"
          disabled={disabled}
          onClick={() => onChange("")}
        >
          ล้าง
        </button>
        <button
          type="button"
          className="pin-key"
          disabled={disabled}
          onClick={() => append("0")}
        >
          0
        </button>
        <button
          type="button"
          className="pin-key pin-key-action"
          aria-label="ลบตัวเลขล่าสุด"
          disabled={disabled}
          onClick={() => onChange(value.slice(0, -1))}
        >
          <Delete size={24} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
