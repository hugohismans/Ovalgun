<!--
  Réglages (étape 8), mémorisés (localStorage) et appliqués à chaud (InputManager, caméra, vibrations, son), par
  rubriques : souris (sensibilité, en visée, inversion Y), manette (sensibilité caméra, inversion Y, aide à la visée,
  vibrations), caméra (champ de vision, distance, hauteur, effet de vitesse), son (volume général, musique du menu).
  Curseurs : souris, flèches gauche / droite, croix ou stick à la manette (un pas par appui). Focus initial sur le premier
  curseur.
-->
<script lang="ts">
  import {
    SETTINGS_AIM_SENSITIVITY_MAX,
    SETTINGS_AIM_SENSITIVITY_MIN,
    SETTINGS_CAMERA_DISTANCE_MAX,
    SETTINGS_CAMERA_DISTANCE_MIN,
    SETTINGS_CAMERA_HEIGHT_MAX,
    SETTINGS_CAMERA_HEIGHT_MIN,
    SETTINGS_CAMERA_STEP,
    SETTINGS_FOV_MAX,
    SETTINGS_FOV_MIN,
    SETTINGS_FOV_STEP,
    SETTINGS_SENSITIVITY_MAX,
    SETTINGS_SENSITIVITY_MIN,
    SETTINGS_SENSITIVITY_STEP,
    VOLUME_STEP,
    type PlayerSettings,
  } from '../game/settings';
  import Icon from './common/Icon.svelte';
  import Panel from './common/Panel.svelte';
  import Toggle from './common/Toggle.svelte';
  import { app } from './state/app.svelte';

  type RangeKey = 'mouseSensitivity' | 'padSensitivity' | 'aimSensitivity' | 'fov' | 'cameraDistance' | 'cameraHeight' | 'volume' | 'musicVolume';
  interface Range {
    min: number;
    max: number;
    step: number;
    format: (v: number) => string;
  }

  const num = (v: number, digits: number): string => v.toFixed(digits).replace('.', ',').replace('-', '−');
  const mult = (v: number): string => `× ${num(v, 2)}`;
  const percent = (v: number): string => `${Math.round(v * 100)} %`;
  /** FOV horizontal équivalent en 16:9 (repère usuel des joueurs). */
  const horizontal = (v: number): number => Math.round((2 * Math.atan(Math.tan((v * Math.PI) / 360) * (16 / 9)) * 180) / Math.PI);
  const sensitivity: Range = { min: SETTINGS_SENSITIVITY_MIN, max: SETTINGS_SENSITIVITY_MAX, step: SETTINGS_SENSITIVITY_STEP, format: mult };
  const volume: Range = { min: 0, max: 1, step: VOLUME_STEP, format: percent };
  const RANGES: Record<RangeKey, Range> = {
    mouseSensitivity: sensitivity,
    padSensitivity: sensitivity,
    aimSensitivity: { min: SETTINGS_AIM_SENSITIVITY_MIN, max: SETTINGS_AIM_SENSITIVITY_MAX, step: SETTINGS_SENSITIVITY_STEP, format: mult },
    fov: { min: SETTINGS_FOV_MIN, max: SETTINGS_FOV_MAX, step: SETTINGS_FOV_STEP, format: (v) => `${v}° · ${horizontal(v)}° horiz.` },
    cameraDistance: { min: SETTINGS_CAMERA_DISTANCE_MIN, max: SETTINGS_CAMERA_DISTANCE_MAX, step: SETTINGS_CAMERA_STEP, format: mult },
    cameraHeight: { min: SETTINGS_CAMERA_HEIGHT_MIN, max: SETTINGS_CAMERA_HEIGHT_MAX, step: SETTINGS_CAMERA_STEP, format: (v) => `${v > 0 ? '+' : ''}${num(v, 2)} m` },
    volume,
    musicVolume: volume,
  };

  const onRange = (key: RangeKey) => (e: Event) => {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    const patch: Partial<PlayerSettings> = { [key]: v };
    app.updateSettings(patch);
  };
</script>

{#snippet slider(key: RangeKey, label: string, hint = '', autofocus = false)}
  {@const r = RANGES[key]}
  {@const value = app.settings[key]}
  {@const id = `set-${key}`}
  <div class="slider">
    <label for={id}>{label}{#if hint}<small>{hint}</small>{/if}</label>
    <output for={id}>{r.format(value)}</output>
    <input
      {id}
      data-autofocus={autofocus ? '' : undefined}
      type="range"
      min={r.min}
      max={r.max}
      step={r.step}
      {value}
      oninput={onRange(key)}
      style:--p="{((value - r.min) / (r.max - r.min)) * 100}%"
    />
  </div>
{/snippet}

<Panel title="Réglages" subtitle="Appliqués tout de suite, mémorisés sur cet appareil" onback={() => app.closePanel()}>
  <div class="list">
    <h3><Icon name="keyboard" /> Souris</h3>
    {@render slider('mouseSensitivity', 'Sensibilité', '', true)}
    {@render slider('aimSensitivity', 'Sensibilité en visée', 'souris et manette, par rapport à la normale')}
    <Toggle label="Inverser l’axe vertical" hint="souris" checked={app.settings.invertMouseY} onchange={(v) => app.updateSettings({ invertMouseY: v })} />

    <h3><Icon name="gamepad" /> Manette</h3>
    {@render slider('padSensitivity', 'Sensibilité caméra')}
    <Toggle label="Inverser l’axe vertical" hint="stick droit" checked={app.settings.invertY} onchange={(v) => app.updateSettings({ invertY: v })} />
    <Toggle label="Aide à la visée" hint="ralentit et suit légèrement la cible" checked={app.settings.aimAssist} onchange={(v) => app.updateSettings({ aimAssist: v })} />
    <Toggle label="Vibrations" hint="tirs reçus, plaquages, essais…" checked={app.settings.rumble} onchange={(v) => app.updateSettings({ rumble: v })} />

    <h3>Caméra</h3>
    {@render slider('fov', 'Champ de vision', 'porteur et visée suivent')}
    {@render slider('cameraDistance', 'Distance')}
    {@render slider('cameraHeight', 'Hauteur', 'le réticule reste juste vers 20 m')}
    <Toggle label="Effet de vitesse" hint="le champ s’élargit au sprint" checked={app.settings.speedFov} onchange={(v) => app.updateSettings({ speedFov: v })} />

    <h3>Son</h3>
    {@render slider('volume', 'Volume général')}
    {@render slider('musicVolume', 'Musique du menu')}
    <button type="button" class="reset" onclick={() => app.resetSettings()}><Icon name="restart" /> Valeurs par défaut</button>
  </div>
</Panel>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .slider {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.35rem 0.8rem;
    padding: 0.55rem 0.8rem 0.7rem;
    border-radius: var(--r-md);
    background: rgb(10 8 32 / 0.55);
    box-shadow: inset 0 0 0 0.1rem var(--stroke);
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0.6rem 0 0;
    font: 900 0.8rem/1 var(--font);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--accent);
  }
  h3:first-child {
    margin-top: 0;
  }
  label {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.2rem 0.5rem;
    font: 800 0.9rem/1.2 var(--font);
  }
  small {
    font: 600 0.75rem/1.2 var(--font);
    opacity: 0.65;
  }
  output {
    font: 900 0.9rem/1 var(--font);
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  input[type='range'] {
    grid-column: 1 / -1;
    width: 100%;
    height: 1.6rem;
    margin: 0;
    background: transparent;
    appearance: none;
    cursor: pointer;
  }
  input[type='range']::-webkit-slider-runnable-track {
    height: 0.5rem;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent) var(--p), rgb(255 255 255 / 0.15) var(--p));
  }
  input[type='range']::-moz-range-track {
    height: 0.5rem;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent) var(--p), rgb(255 255 255 / 0.15) var(--p));
  }
  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 1.25rem;
    height: 1.25rem;
    margin-top: -0.375rem;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0.12rem 0.3rem rgb(0 0 0 / 0.5);
  }
  input[type='range']::-moz-range-thumb {
    width: 1.25rem;
    height: 1.25rem;
    border: 0;
    border-radius: 50%;
    background: #fff;
  }
  .reset {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.2rem;
    padding: 0.5rem 0.9rem;
    border: 0;
    border-radius: var(--r-md);
    background: rgb(255 255 255 / 0.1);
    color: #fff;
    font: 800 0.85rem/1 var(--font);
    cursor: pointer;
  }
  .reset:hover {
    background: rgb(255 255 255 / 0.18);
  }
</style>
