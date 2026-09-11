import { useEffect, useRef, useState } from "react";

export default function SimpleSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  style,
  selectOnMouseDown = false,
  useAriaRoles = false
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {

    const onDocMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const current = options.find((o) => o.value === value);

  const selectOption = (optionValue) => {
    onChange(optionValue);
    setOpen(false);
  };

  const handleOptionMouseDown = (e, optionValue) => {
    if (!selectOnMouseDown) return;
    e.preventDefault();
    selectOption(optionValue);
  };

  const handleOptionClick = (optionValue) => {
    if (selectOnMouseDown) return;
    selectOption(optionValue);
  };

  return (
    <div
      ref={ref}
      style={{
        width: "100%",
        maxWidth: "32rem",
        margin: "0 auto 1.5rem auto",
        position: "relative",
        ...style
      }}>
      
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "0.75rem 1rem",
          border: "1px solid #ccc",
          borderRadius: "4px",
          fontSize: "0.95rem",
          background: "#fff",
          color: "#333",
          cursor: "pointer"
        }}>
        
        <span>{current ? current.label : placeholder}</span>
        <span style={{ float: "right" }}>▾</span>
      </button>

      {open &&
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: "0.25rem",
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          background: "#fff",
          border: "1px solid #ccc",
          borderRadius: "6px",
          boxShadow: "0 8px 16px rgba(0,0,0,0.1)",
          maxHeight: "220px",
          overflowY: "auto",
          zIndex: 1000
        }}
        role={useAriaRoles ? "listbox" : undefined}>
        
          {options.map((opt) =>
        <li key={opt.value}>
              <button
            type="button"
            onMouseDown={(e) => handleOptionMouseDown(e, opt.value)}
            onClick={() => handleOptionClick(opt.value)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "0.5rem 0.75rem",
              border: "none",
              background: value === opt.value ? "#f0f0f0" : "transparent",
              color: "#333",
              borderRadius: "4px",
              cursor: "pointer"
            }}
            onMouseOver={(e) => e.currentTarget.style.background = "#f5f5f5"}
            onMouseOut={(e) =>
            e.currentTarget.style.background =
            value === opt.value ? "#f0f0f0" : "transparent"
            }
            role={useAriaRoles ? "option" : undefined}
            aria-selected={useAriaRoles ? value === opt.value : undefined}>
            
                {opt.label}
              </button>
            </li>
        )}
        </ul>
      }
    </div>);

}
