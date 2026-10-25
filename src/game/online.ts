/**
 * Partie en ligne, côté client (passe-plat pour l'UI, qui n'importe que src/game et src/input) : adresse du serveur,
 * codes de salon, lien d'invitation, client réseau.
 */

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isRoomCode, normalizeRoomCode } from '../net/shared/protocol';

export { NetClient, type LobbyView, type StartInfo } from '../net/NetClient';
export type { LobbyPlayer, LobbyConfig } from '../net/shared/protocol';
export { isRoomCode, normalizeRoomCode };

/**
 * Adresse du serveur en ligne : paramètre d'URL `?server=` (tests), sinon celle fixée au build
 * (variable VITE_OVALGUN_SERVER, renseignée par le workflow de déploiement). Chaîne vide : mode en ligne indisponible.
 */
export function serverUrl(params: URLSearchParams): string {
  const fromUrl = params.get('server');
  if (fromUrl !== null && /^https?:\/\//.test(fromUrl)) return fromUrl;
  const built = import.meta.env.VITE_OVALGUN_SERVER as string | undefined;
  return typeof built === 'string' ? built : '';
}

/** Code de salon aléatoire (alphabet sans caractères ambigus). */
export function newRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (const b of bytes) code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
  return code;
}

/** Lien d'invitation : la page actuelle avec ?room=CODE (et ?server= s'il a été forcé). */
export function inviteUrl(code: string): string {
  const u = new URL(window.location.href);
  const keep = u.searchParams.get('server');
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', code);
  if (keep !== null) u.searchParams.set('server', keep);
  return u.toString();
}

/** Code de salon lu dans l'URL (?room=), ou null. */
export function roomFromUrl(params: URLSearchParams): string | null {
  const raw = params.get('room');
  if (raw === null) return null;
  const code = normalizeRoomCode(raw);
  return isRoomCode(code) ? code : null;
}

/** Clé du jeton de reconnexion (sessionStorage : propre à l'onglet, survit à un rechargement). */
const TOKEN_KEY = 'ovalgun.token';

/**
 * Jeton de reconnexion de cet onglet : le serveur rend sa place à un joueur qui revient avec le même (coupure, ou
 * rechargement de la page puis retour dans le même salon pendant le match). Stockage indisponible : jeton de session.
 */
export function sessionToken(): string {
  let token = '';
  try {
    token = window.sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    // stockage interdit
  }
  if (!/^[a-z0-9-]{8,64}$/i.test(token)) {
    token = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : newRoomCode() + newRoomCode() + newRoomCode();
    try {
      window.sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      // stockage interdit : jeton valable jusqu'au rechargement
    }
  }
  return token;
}
