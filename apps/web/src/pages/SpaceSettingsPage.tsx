import type { CreateInvitationResponse, SpaceDetailResponse } from "@vadevi/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useSession } from "../session/SessionContext";

type Member = SpaceDetailResponse["data"]["members"][number];

export function SpaceSettingsPage() {
  const { bootstrap, createInvitation, getSpace, isUpdating, removeMember } = useSession();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const queryKey = ["space", spaceId] as const;
  const detailQuery = useQuery({
    queryFn: ({ signal }) => getSpace(spaceId, signal),
    queryKey,
  });
  const [intendedRole, setIntendedRole] = useState<"admin" | "member">("member");
  const [invitation, setInvitation] = useState<CreateInvitationResponse | null>(null);
  const [status, setStatus] = useState<"copied" | "error" | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    try {
      setInvitation(await createInvitation(spaceId, { intendedRole }));
    } catch {
      setStatus("error");
    }
  }

  async function copyInvitation() {
    if (invitation === null) return;
    try {
      const url = new URL(invitation.data.invitationPath, globalThis.location.origin).toString();
      await globalThis.navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  async function remove(target: Member) {
    setStatus(null);
    try {
      const detail = await removeMember(spaceId, target.id, {
        baseVersion: target.version,
        status: "removed",
      });
      queryClient.setQueryData(queryKey, detail);
      setPendingRemovalId(null);
    } catch {
      setStatus("error");
    }
  }

  if (detailQuery.isPending) {
    return <p aria-live="polite">{t("spaces.loading")}</p>;
  }
  if (detailQuery.isError) {
    return (
      <section className="settings-page">
        <h1>{t("spaces.settingsTitle")}</h1>
        <p className="form-error" role="alert">
          {t("spaces.loadError")}
        </p>
      </section>
    );
  }

  const detail = detailQuery.data;
  const canManage = detail.data.space.role === "owner" || detail.data.space.role === "admin";
  const canInvite = canManage && detail.data.space.type !== "personal";
  const invitationUrl =
    invitation === null
      ? null
      : new URL(invitation.data.invitationPath, globalThis.location.origin).toString();

  return (
    <section className="settings-page">
      <div className="settings-heading">
        <div>
          <p className="eyebrow">{t("spaces.settingsEyebrow")}</p>
          <h1>{detail.data.space.name}</h1>
          <p>{t(`spaces.type.${detail.data.space.type}`)}</p>
        </div>
        <Link className="action-link action-link--secondary" to="/spaces/new">
          {t("spaces.newAction")}
        </Link>
      </div>

      <section aria-labelledby="members-title" className="settings-card">
        <h2 id="members-title">{t("spaces.membersTitle")}</h2>
        <ul className="member-list">
          {detail.data.members.map((member: Member) => {
            const removable =
              canManage && member.role !== "owner" && member.id !== bootstrap.data.user.id;
            return (
              <li key={member.id}>
                <span>
                  <strong>{member.displayName}</strong>
                  <small>{t(`spaces.role.${member.role}`)}</small>
                </span>
                {removable ? (
                  pendingRemovalId === member.id ? (
                    <span className="member-list__actions">
                      <button
                        className="text-button text-button--danger"
                        disabled={isUpdating}
                        onClick={() => void remove(member)}
                        type="button"
                      >
                        {t("spaces.removeConfirm")}
                      </button>
                      <button
                        className="text-button"
                        disabled={isUpdating}
                        onClick={() => setPendingRemovalId(null)}
                        type="button"
                      >
                        {t("spaces.cancelAction")}
                      </button>
                    </span>
                  ) : (
                    <button
                      className="text-button text-button--danger"
                      disabled={isUpdating}
                      onClick={() => setPendingRemovalId(member.id)}
                      type="button"
                    >
                      {t("spaces.removeAction")}
                    </button>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {canInvite ? (
        <section aria-labelledby="invite-title" className="settings-card">
          <h2 id="invite-title">{t("spaces.inviteTitle")}</h2>
          <p>{t("spaces.inviteBody")}</p>
          <form className="inline-form" onSubmit={(event) => void invite(event)}>
            <label htmlFor="invite-role">{t("spaces.inviteRole")}</label>
            <select
              id="invite-role"
              onChange={(event) => setIntendedRole(event.target.value as "admin" | "member")}
              value={intendedRole}
            >
              <option value="member">{t("spaces.role.member")}</option>
              <option value="admin">{t("spaces.role.admin")}</option>
            </select>
            <button className="primary-button" disabled={isUpdating} type="submit">
              {t("spaces.inviteAction")}
            </button>
          </form>

          {invitationUrl !== null ? (
            <div className="invitation-link" role="status">
              <label htmlFor="invitation-url">{t("spaces.shareLabel")}</label>
              <input id="invitation-url" readOnly value={invitationUrl} />
              <button
                className="action-link action-link--secondary"
                onClick={() => void copyInvitation()}
                type="button"
              >
                {t("spaces.copyAction")}
              </button>
              <small>{t("spaces.expiryNote")}</small>
            </div>
          ) : null}
        </section>
      ) : null}

      {status === "copied" ? <p role="status">{t("spaces.copied")}</p> : null}
      {status === "error" ? (
        <p className="form-error" role="alert">
          {t("spaces.manageError")}
        </p>
      ) : null}
    </section>
  );
}
