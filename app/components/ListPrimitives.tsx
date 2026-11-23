import type { ReactNode } from "react";

type SharedListRegionProps = {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
};

/** Common outer layout for list search and filter controls. */
export function ListFilterHeader({ children, className = "", ariaLabel }: SharedListRegionProps) {
  return <div className={`shared-list-filter-header ${className}`.trim()} aria-label={ariaLabel}>{children}</div>;
}

/** Common width and overflow boundary for list tables and table-like rows. */
export function ListTableShell({ children, className = "", ariaLabel }: SharedListRegionProps) {
  return <div className={`shared-list-table-shell ${className}`.trim()} aria-label={ariaLabel}>{children}</div>;
}
