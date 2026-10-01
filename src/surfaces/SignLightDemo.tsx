import { useMemo, useState, type CSSProperties } from "react";

export type SignLightingMode = "face" | "halo" | "combined";
type SignLightSource = "cool" | "warm" | "rgb";
type RgbPreset = "blue" | "red" | "magenta" | "cyan";

const LIGHT_RGB: Record<Exclude<SignLightSource, "rgb"> | RgbPreset, string> = {
  cool: "199 222 255",
  warm: "255 202 112",
  blue: "40 112 255",
  red: "255 64 72",
  magenta: "255 62 210",
  cyan: "45 224 238",
};

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

type SignLightDemoProps = {
  power: boolean;
  onPowerChange: (power: boolean) => void;
  onSelectSocietate?: () => void;
  onSelectAngajat?: () => void;
};

export function SignLightDemo({
  power,
  onPowerChange,
  onSelectSocietate,
  onSelectAngajat,
}: SignLightDemoProps) {
  const [intensity, setIntensity] = useState(72);
  const [mode, setMode] = useState<SignLightingMode>("combined");
  const [source, setSource] = useState<SignLightSource>("warm");
  const [rgbPreset, setRgbPreset] = useState<RgbPreset>("blue");

  const activeColor = source === "rgb" ? rgbPreset : source;
  const energy = power ? intensity / 100 : 0;
  const faceEnabled = mode === "face" || mode === "combined";
  const haloEnabled = mode === "halo" || mode === "combined";

  const lightingStyle = useMemo(
    () =>
      ({
        "--sign-light-rgb": LIGHT_RGB[activeColor],
        "--sign-face-fill": faceEnabled ? clamp(smoothstep(0.04, 0.96, energy) * 0.98) : 0,
        "--sign-face-glow": faceEnabled ? clamp(Math.pow(energy, 1.35) * 0.52) : 0,
        "--sign-halo-tight": haloEnabled ? clamp(Math.pow(energy, 0.78)) : 0,
        "--sign-halo-near": haloEnabled ? clamp(Math.pow(energy, 1.05) * 0.94) : 0,
        "--sign-halo-mid": haloEnabled ? clamp(Math.pow(energy, 1.55) * 0.46) : 0,
        "--sign-halo-far": haloEnabled ? clamp(Math.pow(energy, 2.25) * 0.13) : 0,
        "--sign-cable-live": power ? clamp(0.18 + energy * 0.58) : 0,
      }) as CSSProperties,
    [activeColor, energy, faceEnabled, haloEnabled, power],
  );

  return (
    <section
      className="sign-demo"
      aria-label="Demonstrație iluminare WorkOS"
      data-power={power ? "on" : "off"}
      data-mode={mode}
      style={lightingStyle}
    >
      <div className="sign-demo__stage">
        <p className="sign-demo__kicker">FABRICAȚIE · PRODUCȚIE · MANAGEMENT</p>

        <div className="sign-demo__assembly" aria-label="Firmă luminoasă WorkOS">
          <svg
            className="sign-demo__cable"
            viewBox="0 0 640 230"
            aria-hidden="true"
            preserveAspectRatio="none"
          >
            <path
              className="sign-demo__cable-base"
              d="M18 208 C90 208 84 142 150 142 H310 C350 142 350 88 390 88 H604 C622 88 622 66 622 52"
            />
            <path
              className="sign-demo__cable-live"
              d="M18 208 C90 208 84 142 150 142 H310 C350 142 350 88 390 88 H604 C622 88 622 66 622 52"
            />
          </svg>

          <div
            className="sign-demo__word"
            data-power={power ? "on" : "off"}
            data-mode={mode}
            data-face-emission={faceEnabled && power ? "on" : "off"}
            data-halo-only={mode === "halo" && power ? "" : undefined}
          >
            <span className="sign-demo__word-material">WorkOS</span>
            <span className="sign-demo__word-halo" aria-hidden="true">
              WorkOS
            </span>
            <span className="sign-demo__word-face" aria-hidden="true">
              WorkOS
            </span>
          </div>

          <span className="sign-demo__mount-note">PUNCT MONTAJ / SIGN ASSEMBLY</span>
        </div>

        <p className="sign-demo__lead">
          Platforma integrată pentru gestiunea clienților, cererilor, configuratorului, ofertelor și
          producției în atelier. O sursă de adevăr, un singur produs.
        </p>

        <div className="sign-demo__journeys" aria-label="Căi de acces">
          <button
            type="button"
            className="sign-demo__journey"
            data-tone="societate"
            onClick={onSelectSocietate}
          >
            <span className="sign-demo__journey-mark" aria-hidden="true" />
            <span className="sign-demo__journey-kicker">SOCIETATE</span>
            <span className="sign-demo__journey-label">Clienți · Oferte · Administrare</span>
            <span className="sign-demo__journey-arrow" aria-hidden="true">
              →
            </span>
          </button>
          <button
            type="button"
            className="sign-demo__journey"
            data-tone="angajat"
            onClick={onSelectAngajat}
          >
            <span className="sign-demo__journey-mark" aria-hidden="true" />
            <span className="sign-demo__journey-kicker">ANGAJAT</span>
            <span className="sign-demo__journey-label">Execuție · Plan de lucru · Urmărire</span>
            <span className="sign-demo__journey-arrow" aria-hidden="true">
              →
            </span>
          </button>
        </div>
      </div>

      <div className="sign-controller" aria-label="Panou control iluminare">
        <div className="sign-controller__header">
          <div>
            <span className="sign-controller__title">WORKOS SIGN CONTROLLER</span>
            <span className="sign-controller__spec">FATA / HALO · 12VDC</span>
          </div>
          <div className="sign-controller__status" aria-live="polite">
            <span className="sign-controller__status-dot" data-active={power ? "" : undefined} />
            <span>{power ? "SIGN LIGHT / ON" : "SIGN LIGHT / OFF"}</span>
          </div>
        </div>

        <fieldset className="sign-controller__group">
          <legend>Mod iluminare</legend>
          <div className="sign-controller__segmented" role="radiogroup" aria-label="Mod iluminare">
            <button
              type="button"
              role="radio"
              aria-checked={mode === "face"}
              onClick={() => setMode("face")}
            >
              FATA
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "halo"}
              onClick={() => setMode("halo")}
            >
              HALO
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "combined"}
              onClick={() => setMode("combined")}
            >
              FATA + HALO
            </button>
          </div>
        </fieldset>

        <div className="sign-controller__dimmer">
          <div className="sign-controller__dimmer-head">
            <label htmlFor="sign-light-intensity">Intensitate</label>
            <output htmlFor="sign-light-intensity">{intensity}%</output>
          </div>
          <input
            id="sign-light-intensity"
            type="range"
            min="0"
            max="100"
            step="1"
            value={intensity}
            aria-label="Intensitate iluminare"
            onChange={(event) => setIntensity(Number(event.target.value))}
          />
        </div>

        <fieldset className="sign-controller__group">
          <legend>Sursă lumină</legend>
          <div className="sign-controller__source" role="radiogroup" aria-label="Sursă lumină">
            <button
              type="button"
              role="radio"
              aria-checked={source === "cool"}
              onClick={() => setSource("cool")}
            >
              <span className="sign-controller__swatch sign-controller__swatch--cool" />
              ALB RECE
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={source === "warm"}
              onClick={() => setSource("warm")}
            >
              <span className="sign-controller__swatch sign-controller__swatch--warm" />
              ALB CALD
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={source === "rgb"}
              onClick={() => setSource("rgb")}
            >
              <span className="sign-controller__rgb-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              RGB
            </button>
          </div>
        </fieldset>

        {source === "rgb" ? (
          <fieldset className="sign-controller__rgb">
            <legend>Culoare RGB</legend>
            <div role="radiogroup" aria-label="Culoare RGB">
              {(["blue", "red", "magenta", "cyan"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  role="radio"
                  aria-label={preset}
                  aria-checked={rgbPreset === preset}
                  data-preset={preset}
                  onClick={() => setRgbPreset(preset)}
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="sign-controller__power">
          <div>
            <span className="sign-controller__power-title">POWER PANEL / 12V PSU</span>
            <span className="sign-controller__power-state">{power ? "DC READY" : "DC OFF"}</span>
          </div>
          <button
            type="button"
            className="sign-controller__switch"
            role="switch"
            aria-checked={power}
            aria-label="Alimentare iluminare WorkOS"
            onClick={() => onPowerChange(!power)}
          >
            <span className="sign-controller__switch-track" aria-hidden="true">
              <span className="sign-controller__switch-knob" />
            </span>
            <span>{power ? "ON" : "OFF"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
