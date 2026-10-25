<!--
  Réglages (étape 8), mémorisés (localStorage) et appliqués à chaud à l'InputManager et aux vibrations : sensibilité
  souris, sensibilité caméra manette, inversion Y (manette), aide à la visée manette, vibrations ; volume réservé (pas
  encore de son). Curseurs : souris, flèches gauche / droite, croix ou stick à la manette (un pas par appui). Focus initial
  sur le premier curseur.
-->
<script lang="ts">
  import { SETTINGS_SENSITIVITY_MAX, SETTINGS_SENSITIVITY_MIN, SETTINGS_SENSITIVITY_STEP, VOLUME_STEP, type PlayerSettings } from '../game/settings';
  import Icon from './common/Icon.svelte';
  import Panel from './common/Panel.svelte';
  import Toggle from './common/Toggle.svelte';
  import { app } from './state/app.svelte';

  const mult = (v: number): string => `× ${v.toFixed(2).replace('.', ',')}`;
  const onRange = (key: 'mouseSensitivity' | 'padSensitivity' | 'volume') => (e: Event) => {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    const patch: Partial<PlayerSettings> = { [key]: v };
    app.updateSettings(patch);
  };
</script>

{#snippet slider(id: string, label: string, icon: 'keyboard' | 'gamepad', value: number, key: 'mouseSensitivity' | 'padSensitivity', autofocus = false)}
  <div class="slider">
    <label for={id}><Icon name={icon} /> {label}</label>
    <output for={id}>{mult(value)}</output>
    <input
      {id}
      data-autofocus={autofocus ? '' : undefined}
      type="range"
      min={SETTINGS_SENSITIVITY_MIN}
      max={SETTINGS_SENSITIVITY_MAX}
      step={SETTINGS_SENSITIVITY_STEP}
      {value}
      oninput={onRange(key)}
      style:--p="{((value - SETTINGS_SENSITIVITY_MIN) / (SETTINGS_SENSITIVITY_MAX - SETTINGS_SENSITIVITY_MIN)) * 100}%"
    />
  </div>
{/snippet}

<Panel title="Réglages" subtitle="Appliqués tout de suite, mémorisés sur cet appareil" onback={() => app.closePanel()}>
  <div class="list">
    {@render slider('set-mouse', 'Sensibilité souris', 'keyboard', app.settings.mouseSensitivity, 'mouseSensitivity', true)}
    {@render slider('set-pad', 'Sensibilité caméra manette', 'gamepad', app.settings.padSensitivity, 'padSensitivity')}
    <Toggle label="Inverser l’axe vertical" hint="caméra à la manette" checked={app.settings.invertY} onchange={(v) => app.updateSettings({ invertY: v })} />
    <Toggle label="Aide à la visée" hint="manette : ralentit et suit légèrement la cible" checked={app.settings.aimAssist} onchange={(v) => app.updateSettings({ aimAssist: v })} />
    <Toggle label="Vibrations" hint="manette : tirs reçus, plaquages, essais…" checked={app.settings.rumble} onchange={(v) => app.updateSettings({ rumble: v })} />
    <div class="slider disabled">
      <label for="set-volume">Volume <small>bientôt</small></label>
      <output for="set-volume">{Math.round(app.settings.volume * 100)} %</output>
      <input id="set-volume" type="range" min="0" max="1" step={VOLUME_STEP} value={app.settings.volume} disabled style:--p="{app.settings.volume * 100}%" />
    </div>
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
  .slider.disabled {
    opacity: 0.5;
  }
  label {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font: 800 0.9rem/1.2 var(--font);
  }
  label small {
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.12);
    font: 800 0.62rem/1.3 var(--font);
    color: var(--text-dim);
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
