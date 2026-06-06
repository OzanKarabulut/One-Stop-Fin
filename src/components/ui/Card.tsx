import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-card-bg border border-card-border rounded-lg p-3 ${className}`}>
      {children}
    </div>
  );
}
