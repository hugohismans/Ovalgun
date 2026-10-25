<!--
  Panneau des contrôles (étape 8) : toutes les correspondances clavier/souris et manette, lues dans keymap.ts /
  gamepadMap.ts (libellés AZERTY, ou ceux de la disposition réelle via getLayoutMap quand le navigateur l'expose).
  Structuré pour le futur remapping : une ligne = une action (`CONTROLS`, logic/controlHints.ts) avec ses actions de
  keymap et de mapping manette ; chaque cellule de liaison porte ces actions (data-*) et deviendra un bouton
  « changer » — pas d'édition pour l'instant. Focus initial sur la bascule Xbox / PlayStation (aussi LB / RB à la manette).
-->
<script lang="ts">
  import { DEFAULT_MENU_PAD_MAP, type GamepadStyle } from '../input/gamepadMap';
  import Glyph from './common/Glyph.svelte';
  import Icon from './common/Icon.svelte';
  import Panel from './common/Panel.svelte';
  import Segmented from './common/Segmented.svelte';
  import { CONTROL_GROUPS, CONTROLS, keyGlyphs, padButtonGlyph, padGlyphs } from './logic/controlHints';
  import { app } from './state/app.svelte';

  const style = $derived<GamepadStyle>(app.controlsStyle);
  const STYLE_OPTIONS = [
    { value: 'xbox' as const, label: 'Xbox' },
    { value: 'playstation' as const, label: 'PlayStation' },
  ];
</script>

<Panel title="Contrôles" subtitle={app.layout !== null && app.layout.size > 0 ? 'Libellés de ta disposition de clavier' : 'Libellés AZERTY (positions physiques : WASD en QWERTY)'} onback={() => app.closePanel()} wide>
  <div class="top">
    <span class="lbl">Glyphes manette</span>
    <Segmented label="Glyphes manette" options={STYLE_OPTIONS} value={style} onselect={(v: GamepadStyle) => (app.controlsStyle = v)} autofocus />
    {#if app.device === 'gamepad'}
      <span class="lbl" aria-hidden="true"><Glyph g={padButtonGlyph(DEFAULT_MENU_PAD_MAP.prev, app.padStyle)} size="sm" /> <Glyph g={padButtonGlyph(DEFAULT_MENU_PAD_MAP.next, app.padStyle)} size="sm" /></span>
    {/if}
  </div>
  <div class="groups">
    {#each CONTROL_GROUPS as grp (grp.title)}
      <section class="group">
        <h3>{grp.title}</h3>
        <div class="head" aria-hidden="true">
          <span></span>
          <span><Icon name="keyboard" /> Clavier / souris</span>
          <span><Icon name="gamepad" /> Manette</span>
        </div>
        {#each grp.ids as id (id)}
          {@const c = CONTROLS[id]}
          <div class="row" data-control={id}>
            <span class="name">
              {c.label}
              {#if c.note}<small>{c.note}</small>{/if}
              {#if c.debug}<small class="dbg">entraînement</small>{/if}
            </span>
            <span class="binding" data-keymap={c.keys.join(' ')}>
              {#each keyGlyphs(id, app.layout) as g, i (i)}<Glyph {g} size="sm" />{/each}
            </span>
            <span class="binding" data-padmap={c.pad.join(' ')}>
              {#each padGlyphs(id, style) as g, i (i)}<Glyph {g} size="sm" />{/each}
            </span>
          </div>
        {/each}
      </section>
    {/each}
  </div>
  <p class="note">Maj : appui bref = esquive, maintien = sprint. Manette : L3 bascule le sprint. Le remapping des touches arrivera plus tard.</p>
</Panel>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-bottom: 0.8rem;
  }
  .lbl {
    font: italic 900 0.72rem/1 var(--font);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(21rem, 1fr));
    gap: 0.8rem 1.2rem;
  }
  .group {
    padding: 0.6rem 0.8rem;
    border-radius: var(--r-md);
    background: rgb(10 8 32 / 0.5);
  }
  h3 {
    margin: 0 0 0.4rem;
    font: italic 900 0.8rem/1 var(--font);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--cyan);
  }
  .head,
  .row {
    display: grid;
    grid-template-columns: 1fr 7rem 5.6rem;
    align-items: center;
    gap: 0.5rem;
  }
  .head span {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font: 800 0.58rem/1 var(--font);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .row {
    padding: 0.22rem 0;
    border-top: 0.06rem solid rgb(255 255 255 / 0.06);
  }
  .name {
    display: flex;
    flex-direction: column;
    font: 800 0.82rem/1.2 var(--font);
  }
  .name small {
    font: 600 0.66rem/1.2 var(--font);
    color: var(--text-faint);
  }
  .name .dbg {
    color: var(--cyan);
  }
  .binding {
    display: flex;
    flex-wrap: wrap;
    gap: 0.15rem;
    font-size: 0.95rem;
  }
  .note {
    margin: 0.8rem 0 0;
    font: 600 0.75rem/1.35 var(--font);
    color: var(--text-dim);
  }
</style>
