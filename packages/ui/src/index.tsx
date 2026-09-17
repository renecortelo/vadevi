import type { ButtonHTMLAttributes, HTMLAttributes, PropsWithChildren } from "react";

import styles from "./components.module.css";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({
  children,
  className = "",
  type = "button",
  variant = "primary",
  ...props
}: PropsWithChildren<ButtonProps>) {
  const variantClass = variant === "primary" ? styles.buttonPrimary : styles.buttonSecondary;

  return (
    <button
      className={`${styles.button} ${variantClass} ${className}`.trim()}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = "",
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return (
    <section className={`${styles.card} ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}
