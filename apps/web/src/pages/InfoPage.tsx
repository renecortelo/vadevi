import { Card } from "@vadevi/ui";
import { useTranslation } from "react-i18next";

type InfoPageProps = {
  titleKey: string;
  bodyKey: string;
};

export function InfoPage({ titleKey, bodyKey }: InfoPageProps) {
  const { t } = useTranslation();

  return (
    <div className="info-page">
      <Card>
        <p className="eyebrow">Va de Vi</p>
        <h1>{t(titleKey)}</h1>
        <p>{t(bodyKey)}</p>
      </Card>
    </div>
  );
}
