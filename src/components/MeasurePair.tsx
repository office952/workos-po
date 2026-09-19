type MeasurePairProps = {
  planned: string;
  actual: string;
};

export function MeasurePair({ planned, actual }: MeasurePairProps) {
  return (
    <div className="measure-pair">
      <div>
        <p className="section-label">Planificat</p>
        <p className="measure-pair__value">{planned}</p>
      </div>
      <div>
        <p className="section-label">Realizat</p>
        <p className="measure-pair__value">{actual}</p>
      </div>
    </div>
  );
}
