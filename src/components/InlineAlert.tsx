import type { ReactNode } from "react";

type AlertTone = "error" | "blocked" | "pending" | "success";

type InlineAlertProps = {
  tone: AlertTone;
  title: string;
  children: ReactNode;
};

export function inlineAlertRole(
  tone: AlertTone,
): "alert" | "status" {
  switch (tone) {
    case "error":
    case "blocked":
      return "alert";
    case "pending":
    case "success":
      return "status";
    default: {
      const exhaustive: never = tone;
      return exhaustive;
    }
  }
}

export function InlineAlert({ tone, title, children }: InlineAlertProps) {
  return (
    <div className={`alert alert--${tone}`} role={inlineAlertRole(tone)}>
      <p className="alert__title">{title}</p>
      <div className="alert__body">{children}</div>
    </div>
  );
}
