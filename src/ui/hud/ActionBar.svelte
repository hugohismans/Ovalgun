<!--
  Rangée des actions du joueur local (étape 8), sous la jauge de stabilité : esquive, glissade (ou plongeon / passe /
  coup de pied quand on porte le ballon), capacité du rôle, arme. Chaque pastille montre la touche ou le bouton du
  périphérique actif (glyphes Xbox / PlayStation selon la manette détectée).
  Passe finale : toutes les actions sont barrées quand le joueur est au sol (l'esquive et la glissade semblaient prêtes) ;
  risque de la passe (receveur marqué / passe risquée) sous la pastille de passe.
-->
<script lang="ts">
  import type { IconName } from '../common/Icon.svelte';
  import { controlGlyphs, type ControlId } from '../logic/controlHints';
  import { app } from '../state/app.svelte';
  import { hud } from '../state/hud.svelte';
  import CooldownPill from './CooldownPill.svelte';
  import WeaponPill from './WeaponPill.svelte';

  const s = $derived(hud.snap);
  const glyphs = (id: ControlId) => controlGlyphs(id, app.device, app.padStyle, app.layout);
  const ABILITY_ICON: Record<string, IconName> = { pilier: 'shield', ailier: 'boost', demi: 'zone' };
  const down = $derived(s !== null && s.status !== 'active');
  const passSub = $derived(
    s === null || s.passTarget < 0 ? 'aucune cible' : `→ ${s.passTargetName}${s.passRisk === 'marked' ? ' · marqué' : s.passRisk === 'risky' ? ' · risqué' : ''}`,
  );
</script>

{#if s}
  <div class="actions">
    <CooldownPill icon="dodge" label="Esquive" glyphs={glyphs('dodge')} remaining={s.dodgeCd} total={s.dodgeCooldownSec} blocked={down} />
    {#if s.carrier}
      <CooldownPill icon="dive" label="Plongeon" glyphs={glyphs('dive')} remaining={s.diveCd} total={s.diveCooldownSec} tone="ball" blocked={(!s.canCarrierAct && s.diveCd <= 0.05) || down} />
      <CooldownPill
        icon="pass"
        label="Passe"
        sub={passSub}
        subTone={s.passTarget < 0 ? 'default' : s.passRisk === 'open' ? 'default' : s.passRisk}
        glyphs={glyphs('pass')}
        tone="ball"
        blocked={!s.canCarrierAct || s.passTarget < 0 || down}
      />
      <CooldownPill icon="kick" label="Coup de pied" glyphs={glyphs('kick')} tone="ball" blocked={!s.canCarrierAct || down} />
    {:else}
      <CooldownPill icon="slide" label="Glissade" glyphs={glyphs('slide')} remaining={s.slideCd} total={s.slideCooldownSec} blocked={down} />
    {/if}
    <CooldownPill
      icon={ABILITY_ICON[s.role] ?? 'boost'}
      label={s.abilityLabel}
      sub={s.role === 'demi' && s.abilityActiveSec > 0 ? `zone ${s.abilityActiveSec.toFixed(1).replace('.', ',')} s` : s.abilityHint}
      glyphs={glyphs('ability')}
      tone="ability"
      remaining={s.abilityActiveSec > 0 && s.role !== 'demi' ? 0 : s.abilityCd}
      total={s.abilityCooldownSec}
      activeFrac={s.abilityActiveSec > 0 && s.role !== 'demi' ? s.abilityActiveSec / Math.max(0.01, s.abilityDurationSec) : -1}
      blocked={!s.abilityImplemented || s.status !== 'active'}
    />
    <WeaponPill reloadGlyphs={glyphs('reload')} />
  </div>
{/if}

<style>
  .actions {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: 0.55rem;
  }
</style>
