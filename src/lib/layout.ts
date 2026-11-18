import type { Person } from '../types';

/**
 * Layout genealogico a generazioni.
 *
 * 1. Assegna una generazione a ogni persona (figli sotto i genitori, coniugi sulla stessa riga,
 *    genitori "aggiunti dopo" tirati giù vicino ai figli).
 * 2. Raggruppa le coppie in "unità" affiancate.
 * 3. Ordina le unità di ogni generazione con sweep baricentrici (alto→basso e basso→alto) per
 *    ridurre gli incroci.
 * 4. Calcola le coordinate con una regressione isotonica (PAV): ogni unità si avvicina il più
 *    possibile alla posizione ideale (sotto i genitori / sopra i figli) senza sovrapporsi.
 */

export const NODE_W = 232;
export const NODE_H = 84;
const SPOUSE_GAP = 36;
const UNIT_GAP = 44;
const GEN_GAP = 120;
const ROW_H = NODE_H + GEN_GAP;

export interface LayoutNode {
  person: Person;
  x: number;
  y: number;
  gen: number;
}

export interface LayoutLink {
  key: string;
  type: 'child' | 'spouse';
  d: string;
  /** Persone coinvolte (per evidenziare la discendenza). */
  ids: string[];
  /** Per i legami di coppia: punto medio dove disegnare il simbolo. */
  mid?: { x: number; y: number };
  /** Legame tra persone non adiacenti o su generazioni diverse. */
  loose?: boolean;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  nodeById: Map<string, LayoutNode>;
  links: LayoutLink[];
  width: number;
  height: number;
  generations: number;
}

interface Unit {
  id: number;
  gen: number;
  members: string[];
  x: number;
  w: number;
}

const unitWidth = (n: number) => n * NODE_W + (n - 1) * SPOUSE_GAP;
const memberOffset = (i: number) => i * (NODE_W + SPOUSE_GAP);

export function computeLayout(people: Person[]): TreeLayout {
  const idx = new Map(people.map((p) => [p.id, p]));
  const has = (id?: string): id is string => !!id && idx.has(id);

  // --- Relazioni normalizzate ------------------------------------------------------------
  const spouses = new Map<string, Set<string>>();
  const addSpouse = (a: string, b: string) => {
    if (a === b || !has(a) || !has(b)) return;
    if (!spouses.has(a)) spouses.set(a, new Set());
    if (!spouses.has(b)) spouses.set(b, new Set());
    spouses.get(a)!.add(b);
    spouses.get(b)!.add(a);
  };
  people.forEach((p) => p.spouseIds?.forEach((s) => addSpouse(p.id, s)));

  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  people.forEach((p) => {
    const ps = [p.fatherId, p.motherId].filter((x) => has(x) && x !== p.id) as string[];
    parents.set(p.id, ps);
    ps.forEach((pid) => {
      if (!children.has(pid)) children.set(pid, []);
      children.get(pid)!.push(p.id);
    });
  });
  const byBirth = (a: string, b: string) =>
    (idx.get(a)!.birthDate || '9999').localeCompare(idx.get(b)!.birthDate || '9999') ||
    idx.get(a)!.firstName.localeCompare(idx.get(b)!.firstName);
  children.forEach((list) => list.sort(byBirth));

  // --- 1. Generazioni --------------------------------------------------------------------
  const gen = new Map(people.map((p) => [p.id, 0]));
  const maxIter = people.length * 2 + 10;
  for (let it = 0, changed = true; changed && it < maxIter; it++) {
    changed = false;
    for (const p of people) {
      let g = gen.get(p.id)!;
      for (const pid of parents.get(p.id)!) g = Math.max(g, gen.get(pid)! + 1);
      for (const s of spouses.get(p.id) ?? []) g = Math.max(g, gen.get(s)!);
      // Un genitore senza ascendenti scende vicino ai propri figli.
      const kids = children.get(p.id);
      if (kids?.length) {
        const limit = Math.min(...kids.map((k) => gen.get(k)!)) - 1;
        if (limit > g && !parents.get(p.id)!.length) g = limit;
      }
      if (g !== gen.get(p.id)) {
        gen.set(p.id, Math.min(g, people.length));
        changed = true;
      }
    }
  }
  const maxGen = people.length ? Math.max(...gen.values()) : 0;

  // --- 2. Unità (coppie) -----------------------------------------------------------------
  const units: Unit[] = [];
  const unitOf = new Map<string, Unit>();
  const sortedPeople = [...people].sort((a, b) => byBirth(a.id, b.id));
  for (const p of sortedPeople) {
    if (unitOf.has(p.id)) continue;
    const g = gen.get(p.id)!;
    const comp: string[] = [];
    const queue = [p.id];
    const seen = new Set(queue);
    while (queue.length) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const s of spouses.get(cur) ?? []) {
        if (!seen.has(s) && !unitOf.has(s) && gen.get(s) === g) {
          seen.add(s);
          queue.push(s);
        }
      }
    }
    let members = comp;
    if (comp.length > 2) {
      // Persona con più coniugi al centro.
      const center = [...comp].sort((a, b) => (spouses.get(b)?.size ?? 0) - (spouses.get(a)?.size ?? 0))[0];
      const others = comp.filter((c) => c !== center);
      const half = Math.ceil(others.length / 2);
      members = [...others.slice(0, half), center, ...others.slice(half)];
    } else if (comp.length === 2) {
      // Uomo a sinistra per convenzione, se applicabile.
      const [a, b] = comp;
      if (idx.get(a)!.gender === 'female' && idx.get(b)!.gender === 'male') members = [b, a];
    }
    const u: Unit = { id: units.length, gen: g, members, x: 0, w: unitWidth(members.length) };
    units.push(u);
    members.forEach((m) => unitOf.set(m, u));
  }

  const parentUnits = (u: Unit) => [
    ...new Set(u.members.flatMap((m) => parents.get(m)!.map((pid) => unitOf.get(pid)!))),
  ];
  const childUnits = (u: Unit) => {
    const kids = [...new Set(u.members.flatMap((m) => children.get(m) ?? []))].sort(byBirth);
    return [...new Set(kids.map((k) => unitOf.get(k)!))].filter((c) => c !== u);
  };

  // --- 3. Ordine iniziale (DFS dalle radici) -----------------------------------------------
  const rows: Unit[][] = Array.from({ length: maxGen + 1 }, () => []);
  const visited = new Set<Unit>();
  const visit = (u: Unit) => {
    if (visited.has(u)) return;
    visited.add(u);
    rows[u.gen].push(u);
    // Visita anche la famiglia d'origine dei coniugi "acquisiti" per tenerla vicina.
    for (const c of childUnits(u)) {
      visit(c);
      for (const pu of parentUnits(c)) visit(pu);
    }
  };
  units
    .filter((u) => parentUnits(u).length === 0)
    .sort((a, b) => a.gen - b.gen)
    .forEach(visit);
  units.forEach(visit);

  const pack = (row: Unit[]) => {
    let x = 0;
    row.forEach((u) => {
      u.x = x;
      x += u.w + UNIT_GAP;
    });
  };
  rows.forEach(pack);

  const memberCenter = (id: string) => {
    const u = unitOf.get(id)!;
    return u.x + memberOffset(u.members.indexOf(id)) + NODE_W / 2;
  };

  /** Posizione sinistra ideale di `u` per stare sotto i propri genitori. */
  const desiredFromParents = (u: Unit): number | null => {
    const vals: number[] = [];
    u.members.forEach((m, i) => {
      const ps = parents.get(m)!;
      if (!ps.length) return;
      const pc = ps.reduce((s, pid) => s + memberCenter(pid), 0) / ps.length;
      vals.push(pc - memberOffset(i) - NODE_W / 2);
    });
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  /** Posizione sinistra ideale di `u` per stare centrata sopra i propri figli. */
  const desiredFromChildren = (u: Unit): number | null => {
    const vals: number[] = [];
    const kids = new Set(u.members.flatMap((m) => children.get(m) ?? []));
    kids.forEach((k) => {
      if (unitOf.get(k) === u) return;
      const inUnit = parents.get(k)!.filter((pid) => unitOf.get(pid) === u);
      const anchor = inUnit.reduce((s, pid) => s + memberOffset(u.members.indexOf(pid)), 0) / inUnit.length + NODE_W / 2;
      vals.push(memberCenter(k) - anchor);
    });
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };

  /** Regressione isotonica pesata: posiziona la riga rispettando ordine e distanze minime. */
  const place = (row: Unit[], desired: (number | null)[]) => {
    if (!row.length) return;
    const offsets: number[] = [];
    let acc = 0;
    row.forEach((u) => {
      offsets.push(acc);
      acc += u.w + UNIT_GAP;
    });
    type Block = { sum: number; weight: number; count: number };
    const blocks: Block[] = [];
    row.forEach((u, i) => {
      const d = desired[i];
      const w = d === null ? 0.05 : 1;
      const target = (d === null ? u.x : d) - offsets[i];
      blocks.push({ sum: target * w, weight: w, count: 1 });
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1];
        const a = blocks[blocks.length - 2];
        if (a.sum / a.weight <= b.sum / b.weight) break;
        blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, weight: a.weight + b.weight, count: a.count + b.count });
      }
    });
    let i = 0;
    blocks.forEach((b) => {
      const v = b.sum / b.weight;
      for (let k = 0; k < b.count; k++, i++) row[i].x = v + offsets[i];
    });
  };

  const center = (u: Unit) => u.x + u.w / 2;
  const reorder = (row: Unit[], key: (u: Unit) => number | null) => {
    const keyed = row.map((u, i) => ({ u, k: key(u), i }));
    keyed.forEach((e) => (e.k = (e.k ?? e.u.x) + e.u.w / 2));
    keyed.sort((a, b) => a.k! - b.k! || a.i - b.i);
    row.splice(0, row.length, ...keyed.map((e) => e.u));
  };

  // --- 4. Sweep baricentrici + posizionamento ------------------------------------------------
  for (let it = 0; it < 6; it++) {
    for (let g = 1; g <= maxGen; g++) {
      reorder(rows[g], desiredFromParents);
      place(rows[g], rows[g].map(desiredFromParents));
    }
    for (let g = maxGen - 1; g >= 0; g--) {
      reorder(rows[g], desiredFromChildren);
      place(rows[g], rows[g].map(desiredFromChildren));
    }
  }
  // Rifinitura: compromesso tra genitori e figli, terminando dall'alto verso il basso.
  const combined = (u: Unit) => {
    const a = desiredFromParents(u);
    const b = desiredFromChildren(u);
    if (a === null) return b;
    if (b === null) return a;
    return (a * 2 + b) / 3;
  };
  for (let it = 0; it < 4; it++) {
    for (let g = maxGen; g >= 0; g--) place(rows[g], rows[g].map(combined));
    for (let g = 0; g <= maxGen; g++) place(rows[g], rows[g].map(desiredFromParents));
  }

  // --- 5. Nodi -----------------------------------------------------------------------------
  const minX = Math.min(0, ...units.map((u) => u.x));
  units.forEach((u) => (u.x -= minX));
  const nodes: LayoutNode[] = [];
  units.forEach((u) =>
    u.members.forEach((m, i) =>
      nodes.push({ person: idx.get(m)!, x: u.x + memberOffset(i), y: u.gen * ROW_H, gen: u.gen }),
    ),
  );
  const nodeById = new Map(nodes.map((n) => [n.person.id, n]));

  // --- 6. Collegamenti ---------------------------------------------------------------------
  const links: LayoutLink[] = [];
  const cy = (n: LayoutNode) => n.y + NODE_H / 2;
  const cx = (n: LayoutNode) => n.x + NODE_W / 2;

  const seenPairs = new Set<string>();
  spouses.forEach((set, a) =>
    set.forEach((b) => {
      const key = [a, b].sort().join('|');
      if (seenPairs.has(key)) return;
      seenPairs.add(key);
      const na = nodeById.get(a)!;
      const nb = nodeById.get(b)!;
      const [l, r] = na.x <= nb.x ? [na, nb] : [nb, na];
      const ua = unitOf.get(a)!;
      const adjacent = ua === unitOf.get(b) && Math.abs(ua.members.indexOf(a) - ua.members.indexOf(b)) === 1;
      if (adjacent) {
        const y = cy(l);
        links.push({
          key: `s-${key}`,
          type: 'spouse',
          d: `M ${l.x + NODE_W} ${y} H ${r.x}`,
          ids: [a, b],
          mid: { x: (l.x + NODE_W + r.x) / 2, y },
        });
      } else {
        const y = Math.min(l.y, r.y);
        const lift = 36 + Math.min(80, Math.abs(cx(r) - cx(l)) * 0.08);
        links.push({
          key: `s-${key}`,
          type: 'spouse',
          d: `M ${cx(l)} ${l.y} C ${cx(l)} ${y - lift}, ${cx(r)} ${y - lift}, ${cx(r)} ${r.y}`,
          ids: [a, b],
          mid: { x: (cx(l) + cx(r)) / 2, y: y - lift * 0.75 },
          loose: true,
        });
      }
    }),
  );

  people.forEach((c) => {
    const ps = parents.get(c.id)!;
    if (!ps.length) return;
    const nc = nodeById.get(c.id)!;
    const pn = ps.map((pid) => nodeById.get(pid)!);
    const busY = nc.y - GEN_GAP / 2;
    let sx: number;
    let sy: number;
    if (pn.length === 2) {
      const [a, b] = pn;
      const coupled = spouses.get(ps[0])?.has(ps[1]) && a.y === b.y;
      sx = (cx(a) + cx(b)) / 2;
      sy = coupled && Math.abs(cx(a) - cx(b)) <= NODE_W + SPOUSE_GAP + 1 ? cy(a) : Math.max(a.y, b.y) + NODE_H;
    } else {
      sx = cx(pn[0]);
      sy = pn[0].y + NODE_H;
    }
    const ex = cx(nc);
    const r = Math.min(10, Math.abs(ex - sx) / 2, Math.abs(busY - sy) / 2);
    let d: string;
    if (Math.abs(ex - sx) < 1) d = `M ${sx} ${sy} V ${nc.y}`;
    else {
      const dir = ex > sx ? 1 : -1;
      d =
        `M ${sx} ${sy} V ${busY - r} Q ${sx} ${busY} ${sx + dir * r} ${busY} ` +
        `H ${ex - dir * r} Q ${ex} ${busY} ${ex} ${busY + r} V ${nc.y}`;
    }
    links.push({ key: `c-${c.id}`, type: 'child', d, ids: [...ps, c.id] });
  });

  const width = nodes.length ? Math.max(...nodes.map((n) => n.x + NODE_W)) : 0;
  const height = nodes.length ? (maxGen + 1) * ROW_H - GEN_GAP : 0;
  return { nodes, nodeById, links, width, height, generations: people.length ? maxGen + 1 : 0 };
}
