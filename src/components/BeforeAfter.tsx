import CompareSlider from "./CompareSlider";
import { useTranslation } from "react-i18next";

interface Props {
  before: string;
  after: string;
  beforeTag?: string;
  afterTag?: string;
}

export default function BeforeAfter({ before, after, beforeTag, afterTag }: Props) {
  const { t } = useTranslation();
  return (
    <CompareSlider
      before={before}
      after={after}
      beforeTag={beforeTag ?? t("errors.original")}
      afterTag={afterTag ?? t("common.result")}
    />
  );
}
