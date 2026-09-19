import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  children,
  type = "button",
  className,
  ...props
}: ButtonProps) {
  const classes = ["hit", className].filter(Boolean).join(" ");

  return (
    <button className={classes} type={type} {...props}>
      <span className={`button button--${variant}`}>{children}</span>
    </button>
  );
}
