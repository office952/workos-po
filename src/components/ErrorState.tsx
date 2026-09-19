import type { ReactNode } from "react";

type ErrorStateProps = {
  title: string;
  children: ReactNode;
};

export function ErrorState({ title, children }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <p className="error-state__title">{title}</p>
      <div className="error-state__body">{children}</div>
    </div>
  );
}
