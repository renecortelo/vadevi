import { type ReactNode, useEffect, useRef } from "react";

/**
 * A modal dialog that behaves like one.
 *
 * `aria-modal="true"` is a promise to assistive technology that everything
 * outside the dialog is inert. Declaring it without managing focus breaks that
 * promise in the worst way: the screen reader stops announcing the page behind,
 * but the keyboard can still walk into it, so the user ends up somewhere they
 * are being told does not exist.
 *
 * This does the three things the attribute implies. Focus moves in when the
 * dialog opens, Tab and Shift+Tab cycle within it, and Escape dismisses and
 * hands focus back to whatever opened it — so someone carries on from where they
 * were rather than from the top of the document.
 *
 * It is a component rather than a hook so the next dialog cannot be written
 * without it.
 */

/**
 * Elements that can hold focus. `:not([disabled])` matters because a disabled
 * control is still matched by the tag selectors but cannot be focused, and
 * cycling onto one would silently drop focus to the body.
 */
const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ModalDialog({
  children,
  className = "review-dialog",
  labelledBy,
  onDismiss,
  open,
}: {
  children: ReactNode;
  className?: string;
  labelledBy: string;
  onDismiss: () => void;
  open: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Held in a ref rather than a dependency: callers pass an inline arrow, and
  // depending on it would tear down and re-run the effect on every render,
  // stealing focus back to the dialog while the user is trying to move. It is
  // assigned in an effect rather than during render, which is the only time a
  // ref may be touched.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab" || dialog === null) return;

      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) => element.offsetParent !== null,
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) {
        // Nothing to move to; keeping focus on the dialog beats losing it.
        event.preventDefault();
        return;
      }

      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    // Captured, so a handler inside the dialog cannot swallow Escape first.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // `isConnected` guards the case where the dialog closed because the page
      // navigated away: the opener is gone and focusing it does nothing useful.
      if (opener?.isConnected === true) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      aria-labelledby={labelledBy}
      aria-modal="true"
      className={className}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className={`${className}__card`}>{children}</div>
    </div>
  );
}
