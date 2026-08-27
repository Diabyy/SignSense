import type { SignMode } from "../lib/modes";

interface ModeTabsProps {
  mode: SignMode;
  onChange: (mode: SignMode) => void;
}

export function ModeTabs({ mode, onChange }: ModeTabsProps) {
  return (
    <div className="mode-tabs" aria-label="Pilih bahasa isyarat">
      {(["bisindo", "asl"] as const).map((item) => (
        <button
          aria-pressed={mode === item}
          className={mode === item ? "is-active" : ""}
          key={item}
          onClick={() => onChange(item)}
          type="button"
        >
          {item.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
