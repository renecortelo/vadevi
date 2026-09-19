import type { AllowedAccountsResponse } from "@vadevi/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../services/api";
import { ModalDialog } from "../components/ModalDialog";
import { addAllowedAccount, getAllowedAccounts, removeAllowedAccount } from "../services/api";
import { useSession } from "../session/SessionContext";

/**
 * Who may sign in — the administrator's page.
 *
 * A private deployment admits the e-mails on this list and nobody else. The
 * page is reachable only by an administrator (the server refuses everyone
 * else, and the link is not shown to them). Removing an e-mail closes the
 * door on the next request; the account and its data stay, which is what an
 * administrator expects of "remove" — deletion is the account's own act.
 */
/** Set once a session has been sent through the Access login, so it is not
 *  sent again in a loop if that login keeps failing. */
const accessLoginAttemptKey = "vadevi.access.login-attempt";

export function AccessPage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const [list, setList] = useState<AllowedAccountsResponse["data"] | null>(null);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const isAdmin = bootstrap.data.features.accessAdmin;

  const secondFactor = bootstrap.data.features.accessSecondFactor;

  useEffect(() => {
    if (user === null || !isAdmin) return;
    const controller = new AbortController();
    getAllowedAccounts(user, controller.signal)
      .then((response) => setList(response.data))
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        // The API wants Cloudflare Access's word as well, and the browser has
        // not been through that login yet. A full navigation to this screen —
        // not a fetch, which cannot follow a login — is what Access intercepts
        // and sends back here with its cookie set. Once per session, so a login
        // that keeps failing does not spin.
        if (
          secondFactor &&
          failure instanceof ApiError &&
          failure.code === "SECOND_FACTOR_REQUIRED" &&
          sessionStorage.getItem(accessLoginAttemptKey) === null
        ) {
          sessionStorage.setItem(accessLoginAttemptKey, String(Date.now()));
          window.location.assign("/settings/access");
          return;
        }
        setError(
          failure instanceof ApiError && failure.code === "SECOND_FACTOR_REQUIRED"
            ? "access.secondFactorError"
            : "access.loadError",
        );
      });
    return () => controller.abort();
  }, [isAdmin, secondFactor, user]);

  if (!isAdmin) return <Navigate replace to="/about" />;

  async function add(event: FormEvent) {
    event.preventDefault();
    if (user === null || email.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const response = await addAllowedAccount(user, {
        email: email.trim(),
        ...(note.trim().length === 0 ? {} : { note: note.trim() }),
      });
      setList(response.data);
      setEmail("");
      setNote("");
    } catch {
      setError("access.saveError");
    } finally {
      setBusy(false);
    }
  }

  async function remove(target: string) {
    if (user === null) return;
    setPendingRemoval(null);
    setBusy(true);
    setError(null);
    try {
      setList((await removeAllowedAccount(user, target)).data);
    } catch {
      setError("access.saveError");
    } finally {
      setBusy(false);
    }
  }

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });

  return (
    <section className="settings-page">
      <header className="page-heading">
        <p className="eyebrow">{t("access.eyebrow")}</p>
        <h1>{t("access.title")}</h1>
        <p>{t("access.body")}</p>
      </header>

      {list !== null && list.mode === "open" ? (
        <p className="form-warning" role="status">
          {t("access.openNotice")}
        </p>
      ) : null}

      {error === null ? null : (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}

      <section aria-labelledby="access-admins-title" className="settings-card">
        <h2 id="access-admins-title">{t("access.adminsTitle")}</h2>
        <p>{t("access.adminsBody")}</p>
        <ul className="member-list">
          {(list?.admins ?? []).map((admin) => (
            <li key={admin}>
              <span>
                <strong>{admin}</strong>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <form className="settings-card field-stack" onSubmit={(event) => void add(event)}>
        <h2>{t("access.addTitle")}</h2>
        <label htmlFor="access-email">{t("access.emailLabel")}</label>
        <input
          autoComplete="off"
          id="access-email"
          inputMode="email"
          maxLength={254}
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
        <label htmlFor="access-note">{t("access.noteLabel")}</label>
        <input
          id="access-note"
          maxLength={200}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("access.notePlaceholder")}
          value={note}
        />
        <div className="hero__actions">
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? t("access.adding") : t("access.addAction")}
          </button>
        </div>
      </form>

      <section aria-labelledby="access-list-title" className="settings-card">
        <h2 id="access-list-title">{t("access.listTitle")}</h2>
        {list === null ? null : list.accounts.length === 0 ? (
          <p className="cache-note">{t("access.empty")}</p>
        ) : (
          <ul className="member-list">
            {list.accounts.map((account) => (
              <li key={account.email}>
                <span>
                  <strong>{account.email}</strong>
                  <small>
                    {account.userId === null ? t("access.notSignedIn") : t("access.signedIn")}
                    {" · "}
                    {t("access.addedOn", { date: dateFormatter.format(new Date(account.addedAt)) })}
                    {account.note === null ? "" : ` · ${account.note}`}
                  </small>
                </span>
                <button
                  className="action-link action-link--danger"
                  disabled={busy}
                  onClick={() => setPendingRemoval(account.email)}
                  type="button"
                >
                  {t("access.removeAction")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingRemoval === null ? null : (
        <ModalDialog
          labelledBy="access-remove-title"
          onDismiss={() => setPendingRemoval(null)}
          open
        >
          <h2 id="access-remove-title">{t("access.removeConfirm", { email: pendingRemoval })}</h2>
          <div className="hero__actions">
            <button
              className="action-link action-link--danger"
              onClick={() => void remove(pendingRemoval)}
              type="button"
            >
              {t("access.removeAction")}
            </button>
            <button
              className="action-link action-link--secondary"
              onClick={() => setPendingRemoval(null)}
              type="button"
            >
              {t("spaces.cancelAction")}
            </button>
          </div>
        </ModalDialog>
      )}
    </section>
  );
}
