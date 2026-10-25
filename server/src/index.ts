/**
 * Serveur en ligne d'Ovalgun : Cloudflare Worker + Durable Objects.
 *
 * - `GET /room/<CODE>` (upgrade WebSocket) : rejoint le salon <CODE> ; un Durable Object par salon (`idFromName`), qui
 *   fait tourner la simulation autoritaire et les bots (src/net/shared/room.ts) à 30 Hz tant que des joueurs sont là.
 * - `GET /health` : vérification simple (« ok »).
 *
 * Le salon est créé à la première connexion et oublié quand tout le monde est parti (rien n'est stocké). Un match dont
 * tous les joueurs sont coupés reste figé (boucle arrêtée) tant que le Durable Object vit : un joueur qui se reconnecte
 * le reprend (RoomCore, jeton de reconnexion).
 */

import { DurableObject } from 'cloudflare:workers';
import { isRoomCode, normalizeRoomCode } from '../../src/net/shared/protocol';
import { RoomCore } from '../../src/net/shared/room';
import { TICK_DT } from '../../src/sim';

export interface Env {
  ROOMS: DurableObjectNamespace<MatchRoom>;
}

const CORS = { 'Access-Control-Allow-Origin': '*' };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return new Response('ok', { headers: CORS });
    const m = /^\/room\/([^/]+)$/.exec(url.pathname);
    if (m !== null) {
      const code = normalizeRoomCode(decodeURIComponent(m[1]));
      if (!isRoomCode(code)) return new Response('Code de salon invalide', { status: 400, headers: CORS });
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket attendu', { status: 426, headers: CORS });
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(request);
    }
    return new Response('Ovalgun — serveur en ligne', { headers: CORS });
  },
};

export class MatchRoom extends DurableObject<Env> {
  private room: RoomCore | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTime = 0;
  private acc = 0;
  private nextPeer = 1;

  async fetch(request: Request): Promise<Response> {
    const code = normalizeRoomCode(decodeURIComponent(new URL(request.url).pathname.split('/').pop() ?? ''));
    this.room ??= new RoomCore(code, Math.floor(Math.random() * 0x7fffffff));
    const room = this.room;
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    const id = `p${this.nextPeer++}`;
    room.join({ id, send: (text) => server.send(text), close: () => server.close(4000, 'Connexion remplacée') });
    server.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') room.message(id, ev.data);
    });
    const close = (): void => {
      room.leave(id);
      if (room.empty) this.stopLoop();
    };
    server.addEventListener('close', close);
    server.addEventListener('error', close);
    this.startLoop();
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Boucle à pas fixe (30 Hz) : rattrape au plus 4 ticks si le minuteur a pris du retard. */
  private startLoop(): void {
    if (this.timer !== null) return;
    this.lastTime = Date.now();
    this.acc = 0;
    this.timer = setInterval(() => {
      const now = Date.now();
      this.acc += Math.min(0.25, (now - this.lastTime) / 1000);
      this.lastTime = now;
      let n = 0;
      while (this.acc >= TICK_DT && n < 4) {
        this.room?.tick();
        this.acc -= TICK_DT;
        n++;
      }
      if (n === 4) this.acc = 0;
    }, 1000 / 60);
  }

  private stopLoop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
