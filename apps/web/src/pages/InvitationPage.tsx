import type { InvitationPreviewResponse } from "@vadevi/contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { getInvitationPreview } from "../services/api";
import { useSession } from "../session/SessionContext";
import { AccessBackdrop } from "../brand/AccessBackdrop";
import { SignedOutLocalePicker } from "../components/SignedOutLocalePicker";
import { BrandLockup } from "../brand/Wordmark";

function useInvitation() {
  const { token = "" } = useParams<{ token: string }>();
  const query = useQuery({
    enabled: /^[A-Za-z0-9_-]{43}$/.test(token),
    queryFn: ({ signal }) => getInvitationPreview(token, signal),
    queryKey: ["invitation-preview", token],
    retry: false,
  });
  return { query, token };
}

function InvitationCard({
  action,
  actionLabel,
  busy,
  preview,
}: {
  action: () => void;
  actionLabel: string;
  busy: boolean;
  preview: InvitationPreviewResponse;
}) {
  const { t } = useTranslation();
  return (
    <main className="access-page" id="main-content">
      <AccessBackdrop />
      <SignedOutLocalePicker />
      <section className="access-card invitation-card">
        <BrandLockup className="access-card__lockup" />
        <p className="eyebrow">{t("invitation.eyebrow")}</p>
        <h1>{t("invitation.title", { space: preview.data.spaceName })}</h1>
        <p>
          {t("invitation.body", {
            inviter: preview.data.inviterDisplayName,
            role: t(`spaces.role.${preview.data.intendedRole}`),
          })}
        </p>
        <button
          aria-busy={busy}
          className="primary-button"
          disabled={busy}
          onClick={action}
          type="button"
        >
          {actionLabel}
        </button>
        <p className="local-note">{t("invitation.singleUse")}</p>
      </section>
    </main>
  );
}

function InvitationUnavailable() {
  const { t } = useTranslation();
  return (
    <main className="access-page" id="main-content">
      <AccessBackdrop />
      <SignedOutLocalePicker />
      <section className="access-card">
        <BrandLockup className="access-card__lockup" />
        <h1>{t("invitation.invalidTitle")}</h1>
        <p>{t("invitation.invalidBody")}</p>
      </section>
    </main>
  );
}

export function InvitationSignInPage() {
  const { signIn } = useAuth();
  const { query } = useInvitation();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  if (query.isPending) {
    return (
      <main className="access-page">
        <AccessBackdrop />
        <SignedOutLocalePicker />
        {t("invitation.loading")}
      </main>
    );
  }
  if (query.isError) return <InvitationUnavailable />;

  return (
    <InvitationCard
      action={() => {
        setBusy(true);
        void signIn().catch(() => setBusy(false));
      }}
      actionLabel={t("invitation.signInAction")}
      busy={busy}
      preview={query.data}
    />
  );
}

export function InvitationAcceptPage() {
  const { acceptInvitation, isUpdating } = useSession();
  const { query, token } = useInvitation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  if (query.isPending) {
    return <p aria-live="polite">{t("invitation.loading")}</p>;
  }
  if (query.isError) return <InvitationUnavailable />;

  return (
    <>
      <InvitationCard
        action={() => {
          setFailed(false);
          void acceptInvitation(token)
            .then(() => navigate("/"))
            .catch(() => setFailed(true));
        }}
        actionLabel={t("invitation.acceptAction")}
        busy={isUpdating}
        preview={query.data}
      />
      {failed ? (
        <p className="form-error invitation-error" role="alert">
          {t("invitation.acceptError")}
        </p>
      ) : null}
    </>
  );
}
