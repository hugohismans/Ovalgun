/**
 * Couleurs de la palette précalculées en THREE.Color (passe finale) : les vues les recopient (`color.copy`) au lieu
 * d'analyser une chaîne CSS à chaque image (`color.set('#…')` passe par des expressions régulières et alloue).
 */

import * as THREE from 'three';
import { PALETTE } from './palette';

export const TEAM_MAIN = [new THREE.Color(PALETTE.teams[0].main), new THREE.Color(PALETTE.teams[1].main)] as const;
export const TEAM_LIGHT = [new THREE.Color(PALETTE.teams[0].light), new THREE.Color(PALETTE.teams[1].light)] as const;
export const SHIELD_FLASH = new THREE.Color(PALETTE.shieldFlash);
export const SCRUM_NEUTRAL = new THREE.Color(PALETTE.scrumNeutral);
export const SCRUM_RIM = new THREE.Color(PALETTE.scrumRim);
export const SCRUM_OVERTIME = new THREE.Color(PALETTE.scrumOvertime);
export const EXPLOSION_CORE = new THREE.Color(PALETTE.explosionCore);
