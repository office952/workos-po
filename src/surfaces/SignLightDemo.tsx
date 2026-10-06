import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export type SignLightingMode = "face" | "halo" | "combined";
type SignLightSource = "cool" | "warm" | "rgb";
export type SignRgbPreset =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "cyan"
  | "blue"
  | "violet"
  | "magenta";

export const SIGN_RGB_PRESETS: readonly {
  id: SignRgbPreset;
  label: string;
  rgb: string;
}[] = [
  { id: "red", label: "Roșu", rgb: "255 56 64" },
  { id: "orange", label: "Portocaliu", rgb: "255 122 36" },
  { id: "yellow", label: "Galben", rgb: "242 201 48" },
  { id: "green", label: "Verde", rgb: "46 196 92" },
  { id: "cyan", label: "Cyan", rgb: "45 224 238" },
  { id: "blue", label: "Albastru", rgb: "40 112 255" },
  { id: "violet", label: "Violet", rgb: "148 74 255" },
  { id: "magenta", label: "Magenta", rgb: "255 62 210" },
];

const RGB_PRESET_IDS: readonly SignRgbPreset[] = SIGN_RGB_PRESETS.map((preset) => preset.id);

const LIGHT_RGB: Record<Exclude<SignLightSource, "rgb"> | SignRgbPreset, string> = {
  cool: "199 222 255",
  warm: "233 184 86",
  red: "255 56 64",
  orange: "255 122 36",
  yellow: "242 201 48",
  green: "46 196 92",
  cyan: "45 224 238",
  blue: "40 112 255",
  violet: "148 74 255",
  magenta: "255 62 210",
};

const FACE_RGB: Record<Exclude<SignLightSource, "rgb">, string> = {
  cool: "232 240 252",
  warm: "193 181 154",
};

const CORE_RGB: Record<Exclude<SignLightSource, "rgb">, string> = {
  cool: "250 252 255",
  warm: "255 217 143",
};

const MODES: readonly SignLightingMode[] = ["face", "halo", "combined"];
const SOURCES: readonly SignLightSource[] = ["cool", "warm", "rgb"];

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function lightingBand(energy: number, reference75: number, peak100: number): number {
  const reference = smoothstep(0.02, 0.75, energy) * reference75;
  const peakProgress = smoothstep(0.75, 1, energy);
  return clamp(reference + (peak100 - reference75) * peakProgress);
}

export function resolveSignLighting(
  intensity: number,
  mode: SignLightingMode,
  power: boolean,
): {
  faceFill: number;
  faceGlowTight: number;
  faceGlowNear: number;
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
    faceFill: faceEnabled ? lightingBand(energy, 1, 1) : 0,
    faceGlowTight: faceEnabled ? lightingBand(energy, 0.3750684559, 0.52) : 0,
    faceGlowNear: faceEnabled ? lightingBand(energy, 0.1295126379, 0.24) : 0,
    coreFill: faceEnabled ? lightingBand(energy, 0.3751134872, 0.48) : 0,
    coreGlow: faceEnabled ? lightingBand(energy, 0.2044193596, 0.32) : 0,
    haloTight: haloEnabled ? lightingBand(energy, 0.82, 0.98) : 0,
    haloNear: haloEnabled ? lightingBand(energy, 0.62, 0.86) : 0,
    haloMid: haloEnabled ? lightingBand(energy, 0.28, 0.48) : 0,
    haloFar: haloEnabled ? lightingBand(energy, 0.065, 0.14) : 0,
    cableLive: power ? 0.12 + smoothstep(0, 1, energy) * 0.08 : 0,
  };
}

type SignLightDemoProps = {
  power: boolean;
  onPowerChange: (power: boolean) => void;
  accessMode: "idle" | "societate" | "angajat";
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

export function SignLightDemo({ power, onPowerChange, accessMode }: SignLightDemoProps) {
  const [intensity, setIntensity] = useState(75);
  const [powerTransition, setPowerTransition] = useState<"on" | "off" | null>(null);
  const previousPower = useRef(power);
  const [mode, setMode] = useState<SignLightingMode>("face");
  const [source, setSource] = useState<SignLightSource>("warm");
  const [rgbPreset, setRgbPreset] = useState<SignRgbPreset>("blue");

  const activeColor = source === "rgb" ? rgbPreset : source;
  const faceEnabled = mode === "face" || mode === "combined";
  const haloEnabled = mode === "halo" || mode === "combined";
  const faceRgb = source === "rgb" ? LIGHT_RGB[rgbPreset] : FACE_RGB[source];
  const coreRgb = source === "rgb" ? LIGHT_RGB[rgbPreset] : CORE_RGB[source];
  const modeLabel = mode === "face" ? "FATA" : mode === "halo" ? "HALO" : "FATA + HALO";
  const sceneLabel =
    accessMode === "societate"
      ? `${power ? "DARK" : "LIGHT"} · AUTH SOCIETATE`
      : accessMode === "angajat"
        ? `${power ? "DARK" : "LIGHT"} · AUTH ANGAJAT`
        : power
          ? `DARK / SIGN ON · ${modeLabel}`
          : "LIGHT / SIGN OFF";
  const lighting = useMemo(
    () => resolveSignLighting(intensity, mode, power),
    [intensity, mode, power],
  );
  const selectedRgbLabel =
    SIGN_RGB_PRESETS.find((preset) => preset.id === rgbPreset)?.label ?? "";

  useEffect(() => {
    if (previousPower.current === power) {
      return;
    }
    const turningOff = previousPower.current && !power;
    previousPower.current = power;
    if (turningOff) {
      setSource("warm");
      setRgbPreset("blue");
      setMode("face");
    }
    setPowerTransition(power ? "on" : "off");
    const timer = window.setTimeout(() => setPowerTransition(null), 440);
    return () => window.clearTimeout(timer);
  }, [power]);

  const lightingStyle = useMemo(
    () =>
      ({
        "--sign-light-rgb": LIGHT_RGB[activeColor],
        "--sign-face-rgb": faceRgb,
        "--sign-core-rgb": coreRgb,
        "--sign-face-fill": lighting.faceFill,
        "--sign-face-glow-tight": lighting.faceGlowTight,
        "--sign-face-glow-near": lighting.faceGlowNear,
        "--sign-core-fill": lighting.coreFill,
        "--sign-core-glow": lighting.coreGlow,
        "--sign-halo-tight": lighting.haloTight,
        "--sign-halo-near": lighting.haloNear,
        "--sign-halo-mid": lighting.haloMid,
        "--sign-halo-far": lighting.haloFar,
        "--sign-cable-live": lighting.cableLive,
      }) as CSSProperties,
    [activeColor, coreRgb, faceRgb, lighting],
  );

  return (
    <section
      className="sign-demo"
      aria-label="Demonstrație iluminare WorkOS"
      data-power={power ? "on" : "off"}
      data-mode={mode}
      data-source={source}
      data-rgb-link={source === "rgb" ? "active" : undefined}
      data-intensity={intensity}
      data-light-color={activeColor}
      data-power-transition={powerTransition ?? undefined}
      style={lightingStyle}
    >
      <p className="sign-demo__scene-state" aria-hidden="true">
        {sceneLabel}
      </p>

      <svg
        className="sign-demo__infrastructure sign-demo__infrastructure--desktop"
        viewBox="0 0 720 816"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g transform="translate(148 80)">
          <path
            className="sign-demo__infra-base"
            d="M 462 374 C 469 374 474 374 480 374 C 490 374 498 366 498 356 L 498 16 C 498 6 492 0 482 0 L 362 0 C 340 0 324 16 324 36 L 30 36 C 12 36 0 42 0 52 L 0 101"
          />
          <path
            className="sign-demo__infra-live"
            pathLength="1"
            d="M 462 374 C 469 374 474 374 480 374 C 490 374 498 366 498 356 L 498 16 C 498 6 492 0 482 0 L 362 0 C 340 0 324 16 324 36 L 30 36 C 12 36 0 42 0 52 L 0 101"
          />
        </g>
        <g transform="translate(63 454)">
          <path
            className="sign-demo__infra-base"
            d="M 273 226 L 287 226 C 312 226 329 204 329 175 C 329 158 323 145 312 135 C 303 127 293 125 281 125 L 31 125 C 12 125 0 109 0 85 L 0 26 C 0 11 5 0 13 0"
          />
          <path
            className="sign-demo__infra-live"
            pathLength="1"
            d="M 273 226 L 287 226 C 312 226 329 204 329 175 C 329 158 323 145 312 135 C 303 127 293 125 281 125 L 31 125 C 12 125 0 109 0 85 L 0 26 C 0 11 5 0 13 0"
          />
        </g>
        <g transform="translate(-8 680)">
          <path
            className="sign-demo__infra-base"
            d="M 0 165 L 26 165 C 32 165 36 161 36 155 L 36 133 C 36 103 48 74 68 53 L 78 43 C 81 40 83 37 84 33 L 84 0"
          />
          <path
            className="sign-demo__infra-live"
            pathLength="1"
            d="M 0 165 L 26 165 C 32 165 36 161 36 155 L 36 133 C 36 103 48 74 68 53 L 78 43 C 81 40 83 37 84 33 L 84 0"
          />
        </g>
      </svg>

      <div className="sign-demo__product">
      <div className="sign-demo__stage">
        <p className="sign-demo__kicker">FABRICAȚIE · PRODUCȚIE · MANAGEMENT</p>

        <div className="sign-demo__assembly" aria-label="Firmă luminoasă WorkOS">

          <div className="sign-demo__feed-notes" aria-hidden="true">
            <span>Power Feed / PUNCT MONTAJ</span>
            <span>Power Feed / COTA 0</span>
          </div>

          <div
            className="sign-demo__word"
            data-power={power ? "on" : "off"}
            data-mode={mode}
            data-intensity={intensity}
            data-face-emission={faceEnabled && power ? "on" : "off"}
            data-halo-only={mode === "halo" && power ? "" : undefined}
          >
            <span className="sign-demo__word-material">WorkOS</span>
            <span className="sign-demo__word-halo sign-demo__word-halo--far" aria-hidden="true">
              WorkOS
            </span>
            <span className="sign-demo__word-halo sign-demo__word-halo--mid" aria-hidden="true">
              WorkOS
            </span>
            <span className="sign-demo__word-halo sign-demo__word-halo--near" aria-hidden="true">
              WorkOS
            </span>
            <span className="sign-demo__word-halo sign-demo__word-halo--tight" aria-hidden="true">
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
      </div>

      <div className="sign-demo__control-power">
      <div className="sign-controller" aria-label="Panou control iluminare">
        <div className="sign-controller__header">
          <div>
            <span className="sign-controller__title">WORKOS SIGN CONTROLLER</span>
            <span className="sign-controller__spec">FATA / HALO · RGB+CCT</span>
          </div>
          <div className="sign-controller__channel" aria-live="polite">
            <span className="sign-controller__channel-label">CHANNEL STATUS</span>
            <span className="sign-controller__channel-states">
              <span data-active={power && faceEnabled ? "" : undefined}>FACE</span>
              <i data-active={power && faceEnabled ? "" : undefined} />
              <span data-active={power && haloEnabled ? "" : undefined}>HALO</span>
              <i data-active={power && haloEnabled ? "" : undefined} />
            </span>
            {source === "rgb" ? (
              <span className="sign-controller__rgb-link" data-live={power ? "" : undefined}>
                RGB LINK ACTIVE
              </span>
            ) : null}
          </div>
        </div>

        <fieldset className="sign-controller__group sign-controller__group--mode" disabled={!power}>
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

        <fieldset className="sign-controller__group sign-controller__group--source" disabled={!power}>
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
      </div>

      {source === "rgb" ? (
        <>
          <svg className="sign-rgb-signal" viewBox="0 0 160 240" aria-hidden="true">
            <path className="sign-rgb-signal__arc" d="M 132 214 C 128 168 108 118 74 64" />
            <path className="sign-rgb-signal__arc" d="M 142 208 C 136 158 114 108 66 52" />
            <path className="sign-rgb-signal__arc" d="M 150 200 C 142 148 118 96 58 42" />
          </svg>
          <aside className="sign-rgb-remote" aria-label="Telecomandă RGB">
            <span className="sign-rgb-remote__antenna" aria-hidden="true" />
            <div className="sign-rgb-remote__head">
              <span className="sign-rgb-remote__title">RGB REMOTE</span>
              <span className="sign-rgb-remote__band">2.4 GHz · WIRELESS</span>
            </div>
            <fieldset className="sign-rgb-remote__pad" disabled={!power}>
              <legend>Culoare RGB</legend>
              <div role="radiogroup" aria-label="Culoare RGB">
                {SIGN_RGB_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    role="radio"
                    aria-label={preset.label}
                    aria-checked={rgbPreset === preset.id}
                    data-preset={preset.id}
                    data-radio-value={preset.id}
                    disabled={!power}
                    onKeyDown={(event) =>
                      moveRadio(event, RGB_PRESET_IDS, rgbPreset, setRgbPreset)
                    }
                    onClick={() => setRgbPreset(preset.id)}
                  >
                    <span className="sign-rgb-remote__chip" aria-hidden="true" />
                    <span className="sign-rgb-remote__name">{preset.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="sign-rgb-remote__status">
              <i data-live={power ? "" : undefined} aria-hidden="true" />
              <span>{power ? "TX LIVE" : "STANDBY"}</span>
              <span>{selectedRgbLabel}</span>
            </p>
          </aside>
        </>
      ) : null}

      <svg
        className="sign-demo__power-rail"
        viewBox="0 0 80 64"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g className="sign-demo__power-rail-path sign-demo__power-rail-path--vertical">
          <path className="sign-demo__infra-base" d="M28 2 H52 M40 2 V62 M28 62 H52" />
          <path
            className="sign-demo__infra-live"
            pathLength="1"
            d="M28 2 H52 M40 2 V62 M28 62 H52"
          />
        </g>
        <g className="sign-demo__power-rail-path sign-demo__power-rail-path--horizontal">
          <path className="sign-demo__infra-base" d="M2 20 V44 M2 32 H78 M78 20 V44" />
          <path
            className="sign-demo__infra-live"
            pathLength="1"
            d="M2 20 V44 M2 32 H78 M78 20 V44"
          />
        </g>
      </svg>

      <div className="sign-power-panel" aria-label="Panou alimentare 12V">
        <div className="sign-power-panel__copy">
          <span className="sign-controller__power-title">POWER PANEL / 12V PSU</span>
          <span className="sign-controller__power-state">{power ? "DC READY" : "DC OFF"}</span>
        </div>
        <div className="sign-power-panel__body">
          <button
            type="button"
            className="sign-power-toggle"
            role="switch"
            aria-checked={power}
            aria-label="Alimentare iluminare WorkOS"
            onClick={() => onPowerChange(!power)}
          >
            <span className="sign-power-toggle__plate" aria-hidden="true">
              <span className="sign-power-toggle__label sign-power-toggle__label--on">ON</span>
              <span className="sign-power-toggle__label sign-power-toggle__label--off">OFF</span>
              <span className="sign-power-toggle__screw sign-power-toggle__screw--top" />
              <span className="sign-power-toggle__screw sign-power-toggle__screw--bottom" />
              <span className="sign-power-toggle__pivot">
                <span className="sign-power-toggle__lever">
                  <span className="sign-power-toggle__stem" />
                  <span className="sign-power-toggle__cap" />
                </span>
              </span>
            </span>
          </button>
          <div className="sign-power-panel__psu" aria-hidden="true">
            <span>AC → DC</span>
            <small>230VAC</small>
            <small>12VDC</small>
          </div>
          <div className="sign-power-panel__ready" data-active={power ? "" : undefined}>
            <span className="sign-power-panel__ready-dot" aria-hidden="true" />
            <span>{power ? "DC READY" : "DC OFF"}</span>
          </div>
        </div>
      </div>
      </div>
      </div>
    </section>
  );
}
