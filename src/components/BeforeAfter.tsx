import CompareSlider from "./CompareSlider";

interface Props {
  before: string;
  after: string;
  beforeTag?: string;
  afterTag?: string;
}

export default function BeforeAfter({ before, after, beforeTag, afterTag }: Props) {
  return (
    <CompareSlider
      before={before}
      after={after}
      beforeTag={beforeTag ?? "Before"}
      afterTag={afterTag ?? "After"}
    />
  );
}
