"use client";

import { useState } from "react";

export default function HeaderViewControl({ label, options }: { label: string; options: Array<{ label: string; checked: boolean; onChange: () => void }> }) {
  const [open, setOpen] = useState(false);
  return <div className="section-view-control header-columns-accordion">
    <button type="button" className="columns-toggle columns-icon-toggle" aria-label={`Configurar vista de ${label}`} title={`Configurar vista de ${label}`} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3.5" y="4.5" width="17" height="15" /><path d="M9.15 4.5v15M14.85 4.5v15" /></svg>
    </button>
    {open && <div className="columns-options" role="group" aria-label={`Opciones de vista de ${label}`}>
      {options.map((option) => <label key={option.label}><input type="checkbox" checked={option.checked} onChange={option.onChange} />{option.label}</label>)}
    </div>}
  </div>;
}
