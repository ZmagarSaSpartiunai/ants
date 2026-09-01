// Why does a match stall? Track what each side actually manages to do.
import { createGame, applyCommand, step, TICK_HZ, Bot, canLink, distance, outputRate, KINDS } from '../shared/dist/index.js';

const s = createGame(Number(process.env.SEED ?? 205), Number(process.env.N ?? 2));
const bots = s.players.map((p, i) => new Bot(i, 'normal', i + 1));

// How constrained is the opening board?
const home = s.nodes[s.players[0].home];
console.log(`домівка: ${Math.round(home.count)} мурах, потік ${outputRate(s, home).toFixed(2)}/с`);
const reach = s.nodes.filter((n) => n.id !== home.id && canLink(s, 0, home.id, n.id));
console.log(`доступних цілей: ${reach.length}, їхні гарнізони: ${reach.map((n) => Math.round(n.count)).join(',')}`);

let clashes = 0, captures = 0;
for (let i = 0; i < 300 * TICK_HZ; i++) {
  for (const b of bots) for (const c of b.think(s)) applyCommand(s, c);
  for (const e of step(s)) { if (e.t === 'clash') clashes++; if (e.t === 'capture') captures++; }
  if (i % (40 * TICK_HZ) === 0) {
    const own = s.players.map((p) => s.nodes.filter((n) => n.owner === p.id).length);
    const force = s.players.map((p) => Math.round(s.nodes.filter((n) => n.owner === p.id).reduce((a, n) => a + n.count, 0)));
    console.log(`${String(i / TICK_HZ).padStart(4)}с: вузли ${own.join(':')} сила ${force.join(':')} стежок ${s.trails.length} колон ${s.packets.length} сутичок ${clashes} захоплень ${captures}`);
  }
  if (s.over) { console.log(`завершено на ${(i / TICK_HZ).toFixed(0)}с, переміг ${s.winner}`); break; }
}
if (!s.over) console.log('НЕ ЗАВЕРШИЛОСЬ');
