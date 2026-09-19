import markUrl from "../assets/workos-mark.svg";

type BrandMarkProps = {
  size?: number;
};

export function BrandMark({ size = 20 }: BrandMarkProps) {
  return (
    <img
      className="app-shell__mark"
      src={markUrl}
      alt=""
      width={size}
      height={size}
    />
  );
}
