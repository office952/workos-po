import { useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";

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

const MODES: readonly SignLightingMode[] = ["face", "halo", "combined"];
const SOURCES: readonly SignLightSource[] = ["cool", "warm", "rgb"];
const RGB_PRESETS: readonly RgbPreset[] = ["blue", "red", "magenta", "cyan"];

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function lightingBand(energy: number, reference75: number, highGain: number): number {
  const reference = smoothstep(0.02, 0.75, energy) * reference75;
  const high = smoothstep(0.75, 1, energy) * highGain;
  return clamp(reference + high);
}

export function resolveSignLighting(
  intensity: number,
  mode: SignLightingMode,
  power: boolean,
): {
  faceFill: number;
  faceGlow: number;
  coreFill: number;
  coreGlow: number;
  haloTight: number;
  haloNear: number;
  haloMid: number;
  haloFar: number;
  cableLive: number;
} {
  const energy = power ? clamp(intensity / 100) : 0;
  const faceEnabled = mode === "face" || mode === "combined";
  const haloEnabled = mode === "halo" || mode === "combined";

  return {
    faceFill: faceEnabled ? lightingBand(energy, 0.76, 0.16) : 0,
    faceGlow: faceEnabled ? lightingBand(energy, 0.38, 0.1) : 0,
    coreFill: faceEnabled ? lightingBand(energy, 0.38, 0.14) : 0,
    coreGlow: faceEnabled ? lightingBand(energy, 0.2, 0.08) : 0,
    haloTight: haloEnabled ? lightingBand(energy, 0.98, 0.02) : 0,
    haloNear: haloEnabled ? lightingBand(energy, 0.75, 0.1) : 0,
    haloMid: haloEnabled ? lightingBand(energy, 0.295, 0.035) : 0,
    haloFar: haloEnabled ? lightingBand(energy, 0.07, 0.01) : 0,
    cableLive: power ? 0.12 + smoothstep(0, 1, energy) * 0.08 : 0,
  };
}

type SignLightDemoProps = {
  power: boolean;
  onPowerChange: (power: boolean) => void;
  onSelectSocietate?: () => void;
  onSelectAngajat?: () => void;
};

function moveRange(
  event: ReactKeyboardEvent<HTMLInputElement>,
  value: number,
  setValue: (value: number) => void,
): void {
  let next: number | null = null;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = 100;
  if (event.key === "PageDown") next = Math.max(0, value - 10);
  if (event.key === "PageUp") next = Math.min(100, value + 10);
  if (next === null) return;
  event.preventDefault();
  setValue(next);
}

function moveRadio<T extends string>(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  values: readonly T[],
  current: T,
  setValue: (value: T) => void,
): void {
  const delta =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
  if (delta === 0) {
    return;
  }
  event.preventDefault();
  const currentIndex = values.indexOf(current);
  const nextIndex = (currentIndex + delta + values.length) % values.length;
  const next = values[nextIndex];
  setValue(next);
  const group = event.currentTarget.closest('[role="radiogroup"]');
  const target = group?.querySelector<HTMLButtonElement>(`[data-radio-value="${next}"]`);
  target?.focus();
}

export function SignLightDemo({
  power,
  onPowerChange,
  onSelectSocietate,
  onSelectAngajat,
}: SignLightDemoProps) {
  const [intensity, setIntensity] = useState(75);
  const [mode, setMode] = useState<SignLightingMode>("face");
  const [source, setSource] = useState<SignLightSource>("warm");
  const [rgbPreset, setRgbPreset] = useState<RgbPreset>("blue");

  const activeColor = source === "rgb" ? rgbPreset : source;
  const faceEnabled = mode === "face" || mode === "combined";
  const lighting = useMemo(
    () => resolveSignLighting(intensity, mode, power),
    [intensity, mode, power],
  );

  const lightingStyle = useMemo(
    () =>
      ({
        "--sign-light-rgb": LIGHT_RGB[activeColor],
        "--sign-face-fill": lighting.faceFill,
        "--sign-face-glow": lighting.faceGlow,
        "--sign-core-fill": lighting.coreFill,
        "--sign-core-glow": lighting.coreGlow,
        "--sign-halo-tight": lighting.haloTight,
        "--sign-halo-near": lighting.haloNear,
        "--sign-halo-mid": lighting.haloMid,
        "--sign-halo-far": lighting.haloFar,
        "--sign-cable-live": lighting.cableLive,
      }) as CSSProperties,
    [activeColor, lighting],
  );

  return (
    <section
      className="sign-demo"
      aria-label="Demonstrație iluminare WorkOS"
      data-power={power ? "on" : "off"}
      data-mode={mode}
      data-source={source}
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

          <div className="sign-demo__feed-notes" aria-hidden="true">
            <span>Power Feed / PUNCT MONTAJ</span>
            <span>Power Feed / COTA 0</span>
          </div>

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
            <span className="sign-demo__word-core" aria-hidden="true">
              WorkOS
            </span>
          </div>
        </div>

        <p className="sign-demo__lead">
          Platforma integrată pentru gestionarea clienților și cererilor, configurarea produselor,
          ofertare și producție în atelier. O singură sursă de adevăr. Un singur produs.
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
            <span className="sign-controller__spec">FATA / HALO · RGB+CCT</span>
          </div>
          <div className="sign-controller__status" aria-live="polite">
            <span className="sign-controller__status-dot" data-active={power ? "" : undefined} />
            <span>{power ? "DC READY" : "STANDBY"}</span>
          </div>
        </div>

        <fieldset className="sign-controller__group" disabled={!power}>
          <legend>Mod iluminare</legend>
          <div className="sign-controller__segmented" role="radiogroup" aria-label="Mod iluminare">
            <button
              type="button"
              role="radio"
              data-radio-value="face"
              aria-checked={mode === "face"}
              disabled={!power}
              onKeyDown={(event) => moveRadio(event, MODES, mode, setMode)}
              onClick={() => setMode("face")}
            >
              FATA
            </button>
            <button
              type="button"
              role="radio"
              data-radio-value="halo"
              aria-checked={mode === "halo"}
              disabled={!power}
              onKeyDown={(event) => moveRadio(event, MODES, mode, setMode)}
              onClick={() => setMode("halo")}
            >
              HALO
            </button>
            <button
              type="button"
              role="radio"
              data-radio-value="combined"
              aria-checked={mode === "combined"}
              disabled={!power}
              onKeyDown={(event) => moveRadio(event, MODES, mode, setMode)}
              onClick={() => setMode("combined")}
            >
              FATA + HALO
            </button>
          </div>
        </fieldset>

        <div className="sign-controller__dimmer" data-disabled={!power ? "" : undefined}>
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
            disabled={!power}
            aria-label="Intensitate iluminare"
            aria-valuetext={`${intensity}%`}
            onChange={(event) => setIntensity(Number(event.target.value))}
            onKeyDown={(event) => moveRange(event, intensity, setIntensity)}
          />
        </div>

        <fieldset className="sign-controller__group" disabled={!power}>
          <legend>Sursă lumină</legend>
          <div className="sign-controller__source" role="radiogroup" aria-label="Sursă lumină">
            <button
              type="button"
              role="radio"
              data-radio-value="cool"
              aria-checked={source === "cool"}
              disabled={!power}
              onKeyDown={(event) => moveRadio(event, SOURCES, source, setSource)}
              onClick={() => setSource("cool")}
            >
              <span className="sign-controller__swatch sign-controller__swatch--cool" />
              ALB RECE
            </button>
            <button
              type="button"
              role="radio"
              data-radio-value="warm"
              aria-checked={source === "warm"}
              disabled={!power}
              onKeyDown={(event) => moveRadio(event, SOURCES, source, setSource)}
              onClick={() => setSource("warm")}
            >
              <span className="sign-controller__swatch sign-controller__swatch--warm" />
              ALB CALD
            </button>
            <button
              type="button"
              role="radio"
              data-radio-value="rgb"
              aria-checked={source === "rgb"}
              disabled={!power}
              onKeyDown={(event) => moveRadio(event, SOURCES, source, setSource)}
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
          <fieldset className="sign-controller__rgb" disabled={!power}>
            <legend>Culoare RGB</legend>
            <div role="radiogroup" aria-label="Culoare RGB">
              {RGB_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  role="radio"
                  aria-label={preset}
                  aria-checked={rgbPreset === preset}
                  data-preset={preset}
                  data-radio-value={preset}
                  disabled={!power}
                  onKeyDown={(event) => moveRadio(event, RGB_PRESETS, rgbPreset, setRgbPreset)}
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
