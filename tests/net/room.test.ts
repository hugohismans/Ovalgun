/**
 * Mode en ligne : logique de salon et cœur du serveur autoritaire (RoomCore) avec de faux clients.
 */
import { describe, expect, it } from 'vitest';
import { buildMatchSetup, canJoinTeam, teamForNewPlayer } from '../../src/net/shared/lobby';
import { isRoomCode, joinState, normalizeRoomCode, PROTOCOL_VERSION, sanitizeName, SNAPSHOT_EVERY, splitState, type LobbyPlayer, type ServerMessage } from '../../src/net/shared/protocol';
import { RoomCore } from '../../src/net/shared/room';
import { createMatch, makeInput, Buttons } from '../../src/sim';

const lp = (id: string, team: 0 | 1, role: LobbyPlayer['role'], host = false): LobbyPlayer => ({ id, name: id, team, role, host });

describe('lobby', () => {
  it('équilibre les équipes et refuse une équipe pleine', () => {
    expect(teamForNewPlayer([], 3)).toBe(0);
    expect(teamForNewPlayer([lp('a', 0, 'ailier')], 3)).toBe(1);
    const full = [lp('a', 0, 'ailier'), lp('b', 0, 'demi'), lp('c', 0, 'pilier')];
    expect(teamForNewPlayer(full, 3)).toBe(1);
    expect(canJoinTeam(full, 'z', 0, 3)).toBe(false);
    expect(canJoinTeam(full, 'a', 0, 3)).toBe(true);
    expect(teamForNewPlayer([...full, lp('d', 1, 'ailier'), lp('e', 1, 'ailier'), lp('f', 1, 'ailier')], 3)).toBeNull();
  });

  it('configuration du match : humains en tête avec leur rôle, bots qui complètent, receveurs humains', () => {
    const s = buildMatchSetup([lp('a', 0, 'ailier', true), lp('b', 1, 'pilier'), lp('c', 0, 'ailier')], { teamSize: 3, difficulty: 'normal' }, 7);
    expect(s.config.roles[0]).toEqual(['ailier', 'ailier', 'pilier']);
    expect(s.config.roles[1].slice(0, 1)).toEqual(['pilier']);
    expect(s.config.roles[1]).toHaveLength(3);
    expect(s.playerIds).toEqual({ a: 0, c: 1, b: 3 });
    expect(s.botIds).toEqual([2, 4, 5]);
    expect(s.config.kickoffReceivers).toEqual([0, 0]);
    expect(() => createMatch(s.config)).not.toThrow();
  });

  it('codes et noms', () => {
    expect(normalizeRoomCode(' ab2c d ')).toBe('AB2CD');
    expect(isRoomCode('AB2CD')).toBe(true);
    expect(isRoomCode('AB0CD')).toBe(false); // 0 ambigu, hors alphabet
    expect(sanitizeName('  <Bob>  ', 'x')).toBe('Bob');
    expect(sanitizeName('', 'Joueur 1')).toBe('Joueur 1');
  });

  it('séparation état statique / dynamique sans perte', () => {
    const s = createMatch({ teamSize: 3, seed: 1, roles: [['pilier', 'ailier', 'demi'], ['pilier', 'ailier', 'demi']] });
    const { statics, dynamic } = splitState(s);
    expect(joinState(statics, JSON.parse(JSON.stringify(dynamic)))).toEqual(JSON.parse(JSON.stringify(s)));
  });
});

class FakePeer {
  readonly msgs: ServerMessage[] = [];
  constructor(readonly id: string) {}
  send(text: string): void {
    this.msgs.push(JSON.parse(text) as ServerMessage);
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    return [...this.msgs].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
  }
  count(t: ServerMessage['t']): number {
    return this.msgs.filter((m) => m.t === t).length;
  }
}

function room(): { r: RoomCore; a: FakePeer; b: FakePeer } {
  const r = new RoomCore('ABCDE', 42);
  const a = new FakePeer('a');
  const b = new FakePeer('b');
  r.join(a);
  r.join(b);
  r.message('a', JSON.stringify({ t: 'hello', version: PROTOCOL_VERSION, name: 'Alice', role: 'ailier' }));
  r.message('b', JSON.stringify({ t: 'hello', version: PROTOCOL_VERSION, name: 'Bob', role: 'pilier' }));
  return { r, a, b };
}

describe('RoomCore (serveur autoritaire)', () => {
  it('accueil, hôte, équipes équilibrées, version refusée', () => {
    const { r, a, b } = room();
    const lobby = b.last('lobby');
    expect(lobby?.players.map((p) => [p.name, p.team, p.host])).toEqual([
      ['Alice', 0, true],
      ['Bob', 1, false],
    ]);
    expect(a.last('welcome')?.you).toBe('a');
    const c = new FakePeer('c');
    r.join(c);
    r.message('c', JSON.stringify({ t: 'hello', version: 999, name: 'Old', role: 'demi' }));
    expect(c.last('error')).toBeDefined();
    expect(c.count('lobby')).toBe(0);
  });

  it('seul l’hôte configure et lance ; chacun reçoit son id ; instantanés à 15 Hz ; entrées appliquées', () => {
    const { r, a, b } = room();
    r.message('b', JSON.stringify({ t: 'start' }));
    expect(r.inMatch).toBe(false);
    r.message('a', JSON.stringify({ t: 'config', teamSize: 5, difficulty: 'facile' }));
    expect(a.last('lobby')?.config).toEqual({ teamSize: 5, difficulty: 'facile' });
    r.message('a', JSON.stringify({ t: 'start' }));
    expect(r.inMatch).toBe(true);
    const sa = a.last('start');
    const sb = b.last('start');
    expect(sa?.playerId).toBe(0);
    expect(sb?.playerId).toBe(5);
    expect(sa?.statics.config.teamSize).toBe(5);
    // Coup d'envoi (3 s) puis Alice avance.
    for (let i = 0; i < 100; i++) r.tick();
    const z0 = a.last('snap')?.state.players[0].pos.z ?? 0;
    for (let i = 0; i < 30; i++) {
      r.message('a', JSON.stringify({ t: 'input', inputs: [makeInput({ moveY: 1, yaw: 0 })] }));
      r.tick();
    }
    const snap = a.last('snap');
    expect(snap?.state.players[0].pos.z).toBeGreaterThan(z0 + 4);
    expect(a.count('snap')).toBe(Math.floor(130 / SNAPSHOT_EVERY));
    expect(snap?.state).not.toHaveProperty('field');
  });

  it('entrée manquante : la dernière est répétée (pas de freinage) ; file bornée', () => {
    const { r, a } = room();
    r.message('a', JSON.stringify({ t: 'start' }));
    for (let i = 0; i < 100; i++) r.tick();
    r.message('a', JSON.stringify({ t: 'input', inputs: [makeInput({ moveY: 1, buttons: Buttons.SPRINT })] }));
    for (let i = 0; i < 20; i++) r.tick();
    const p = a.last('snap')?.state.players[0];
    expect(Math.hypot(p?.vel.x ?? 0, p?.vel.z ?? 0)).toBeGreaterThan(7);
  });

  it('un joueur qui part en match est remplacé par un bot ; salon vide => retour au lobby', () => {
    const { r, a } = room();
    r.message('a', JSON.stringify({ t: 'start' }));
    for (let i = 0; i < 100; i++) r.tick();
    r.leave('b');
    for (let i = 0; i < 200; i++) r.tick();
    const p = a.last('snap')?.state.players[3];
    expect(Math.hypot(p?.vel.x ?? 0, p?.vel.z ?? 0) + Math.abs((p?.pos.z ?? 0) - 0)).toBeGreaterThan(0); // le bot joue
    expect(a.last('lobby')?.players).toHaveLength(1);
    r.leave('a');
    expect(r.empty).toBe(true);
    expect(r.inMatch).toBe(false);
  });

  it('fin du match : score envoyé puis retour au lobby', () => {
    const { r, a } = room();
    r.message('a', JSON.stringify({ t: 'start' }));
    let n = 0;
    while (r.inMatch && n < 30000) {
      r.tick();
      n++;
    }
    expect(r.inMatch).toBe(false);
    expect(a.last('end')).toBeDefined();
    expect(a.last('lobby')?.phase).toBe('lobby');
  });
});
