import { useEffect, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { getPrivateMedia } from "../services/api";

/**
 * A wine's own photograph, fetched with the reader's credentials.
 *
 * Media is private to the Space, so it is never a plain <img src> the browser
 * could cache or a crawler could follow: the bytes come through the API and
 * live as an object URL for as long as the element does. Until they arrive —
 * or offline, when they cannot — the wine's name stands in, which is more use
 * than a grey box.
 */
export function PrivateWineImage({
  mediaId,
  name,
  spaceId,
}: {
  mediaId: string;
  name: string;
  spaceId: string;
}) {
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (user === null || !navigator.onLine) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void getPrivateMedia(user, spaceId, mediaId, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId, spaceId, user]);
  return url === null ? (
    <div className="wine-card__placeholder">{name}</div>
  ) : (
    <img alt={name} src={url} />
  );
}
