import type { Person } from '../types';

/**
 * Layout ad albero vero: gli antenati stanno in basso sul tronco, i discendenti salgono sui rami.
 *
 * 1. Assegna una generazione a ogni persona (figli sopra i genitori, coniugi sulla stessa riga,
 *    genitori "aggiunti dopo" portati vicino ai figli).
 * 2. Raggruppa le coppie in "unità" affiancate.
 * 3. Ordina le unità di ogni generazione con sweep baricentrici per ridurre gli incroci.
 * 4. Calcola le coordinate con una regressione isotonica (PAV): ogni unità si avvicina il più
 *    possibile alla posizione ideale (sopra i genitori / sotto i figli) senza sovrapporsi.
 * 5. Disegna i rami come curve organiche che partono dal punto d'unione della coppia: lo spessore
 *    cresce con il numero di discendenti, così il tronco è più grosso e le punte sottili.
 */

/** Ingombro di una persona: medaglione in alto, cartellino col nome sotto. */
export const NODE_W = 150;
export const NODE_H = 116;
export const MED_R = 30;
export const MED_CY = 36;
export const LABEL_W = 140;
export const LABEL_Y = 74;
export const LABEL_H = 40;

const SPOUSE_GAP = 34;
const UNIT_GAP = 46;
const GEN_GAP = 150;
const ROW_H = NODE_H + GEN_GAP;
const GROUND_GAP = 230;

export interface LayoutNode {
  person: Person;
  x: number;
  y: number;
  gen: number;
  /** Numero di discendenti (per lo spessore dei rami e la chioma). */
  descendants: number;
}

export interface Branch {
  key: string;
  kind: 'child' | 'spouse' | 'trunk' | 'root';
  d: string;
  width: number;
  /** Persone coinvolte (per evidenziare la discendenza). */
  ids: string[];
  /** Generazione di arrivo, per l'animazione di crescita dal basso. */
  gen: number;
  /** Ramo tratteggiato: legame tra persone non affiancate. */
  loose?: boolean;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  nodeById: Map<string, LayoutNode>;
  branches: Branch[];
  /** Punti d'unione delle coppie (dove disegnare il cuore). */
  hearts: { key: string; x: number; y: number; ids: string[] }[];
  ground: { y: number; x1: number; x2: number } | null;
  minX: number;
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

export const branchWidth = (descendants: number) => Math.min(60, 3.5 + 4.4 * Math.sqrt(descendants));

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

  // --- 5. Nodi (asse Y invertito: generazione 0 in basso) ----------------------------------
  const minX = Math.min(0, ...units.map((u) => u.x));
  units.forEach((u) => (u.x -= minX));
  const descCount = new Map<string, number>();
  const countDesc = (id: string): Set<string> => {
    const out = new Set<string>();
    const stack = [...(children.get(id) ?? [])];
    while (stack.length) {
      const c = stack.pop()!;
      if (out.has(c) || c === id) continue;
      out.add(c);
      stack.push(...(children.get(c) ?? []));
    }
    return out;
  };
  people.forEach((p) => descCount.set(p.id, countDesc(p.id).size));

  const rowY = (g: number) => (maxGen - g) * ROW_H;
  const nodes: LayoutNode[] = [];
  units.forEach((u) =>
    u.members.forEach((m, i) =>
      nodes.push({
        person: idx.get(m)!,
        x: u.x + memberOffset(i),
        y: rowY(u.gen),
        gen: u.gen,
        descendants: descCount.get(m) ?? 0,
      }),
    ),
  );
  const nodeById = new Map(nodes.map((n) => [n.person.id, n]));

  // --- 6. Rami ---------------------------------------------------------------------------
  const branches: Branch[] = [];
  const hearts: TreeLayout['hearts'] = [];
  const cx = (n: LayoutNode) => n.x + NODE_W / 2;
  const labelMid = (n: LayoutNode) => n.y + LABEL_Y + LABEL_H / 2;
  const bottom = (n: LayoutNode) => ({ x: cx(n), y: n.y + NODE_H - 2 });
  const medTop = (n: LayoutNode) => ({ x: cx(n), y: n.y + MED_CY - MED_R + 4 });
  const fmt = (v: number) => Math.round(v * 10) / 10;

  /** Curva a "S" morbida, come un ramo che sale. */
  const sCurve = (s: { x: number; y: number }, e: { x: number; y: number }) => {
    const dy = s.y - e.y;
    const dx = e.x - s.x;
    // Parte verso l'alto inclinandosi, poi si raddrizza sotto la persona: come un ramo vero.
    return `M ${fmt(s.x)} ${fmt(s.y)} C ${fmt(s.x + dx * 0.25)} ${fmt(s.y - dy * 0.5)}, ${fmt(e.x - dx * 0.08)} ${fmt(e.y + dy * 0.5)}, ${fmt(e.x)} ${fmt(e.y)}`;
  };

  // Coppie affiancate: ramoscello che le unisce e punto d'unione da cui partono i figli.
  const junction = new Map<string, { x: number; y: number }>();
  const pairKey = (a: string, b: string) => [a, b].sort().join('|');
  const seenPairs = new Set<string>();
  spouses.forEach((set, a) =>
    set.forEach((b) => {
      const key = pairKey(a, b);
      if (seenPairs.has(key)) return;
      seenPairs.add(key);
      const na = nodeById.get(a)!;
      const nb = nodeById.get(b)!;
      const [l, r] = na.x <= nb.x ? [na, nb] : [nb, na];
      const ua = unitOf.get(a)!;
      const adjacent = ua === unitOf.get(b) && Math.abs(ua.members.indexOf(a) - ua.members.indexOf(b)) === 1;
      if (adjacent) {
        const y = labelMid(l);
        const x1 = l.x + (NODE_W + LABEL_W) / 2 - 2;
        const x2 = r.x + (NODE_W - LABEL_W) / 2 + 2;
        const mid = { x: (x1 + x2) / 2, y };
        junction.set(key, mid);
        branches.push({
          key: `s-${key}`,
          kind: 'spouse',
          d: `M ${fmt(x1)} ${fmt(y)} Q ${fmt(mid.x)} ${fmt(y + 10)} ${fmt(x2)} ${fmt(y)}`,
          width: 4,
          ids: [a, b],
          gen: l.gen,
        });
        hearts.push({ key, x: mid.x, y: mid.y + 5, ids: [a, b] });
      } else {
        // Coniugi non affiancati (es. secondo matrimonio lontano): arco tratteggiato.
        const s = medTop(l);
        const e = medTop(r);
        const lift = 50 + Math.min(90, Math.abs(e.x - s.x) * 0.08);
        const top = Math.min(s.y, e.y) - lift;
        branches.push({
          key: `s-${key}`,
          kind: 'spouse',
          d: `M ${fmt(s.x)} ${fmt(s.y)} C ${fmt(s.x)} ${fmt(top)}, ${fmt(e.x)} ${fmt(top)}, ${fmt(e.x)} ${fmt(e.y)}`,
          width: 2,
          ids: [a, b],
          gen: Math.max(l.gen, r.gen),
          loose: true,
        });
        hearts.push({ key, x: (s.x + e.x) / 2, y: top + lift * 0.25, ids: [a, b] });
      }
    }),
  );

  // Rami genitori → figli.
  people.forEach((c) => {
    const ps = parents.get(c.id)!;
    if (!ps.length) return;
    const nc = nodeById.get(c.id)!;
    const pn = ps.map((pid) => nodeById.get(pid)!);
    let start: { x: number; y: number };
    if (pn.length === 2 && junction.has(pairKey(ps[0], ps[1]))) start = junction.get(pairKey(ps[0], ps[1]))!;
    else if (pn.length === 2) start = { x: (cx(pn[0]) + cx(pn[1])) / 2, y: Math.min(pn[0].y, pn[1].y) + MED_CY - MED_R };
    else start = medTop(pn[0]);
    const end = bottom(nc);
    branches.push({
      key: `c-${c.id}`,
      kind: 'child',
      d: end.y < start.y ? sCurve(start, end) : `M ${fmt(start.x)} ${fmt(start.y)} L ${fmt(end.x)} ${fmt(end.y)}`,
      width: branchWidth(nc.descendants),
      ids: [...ps, c.id],
      gen: nc.gen,
    });
  });

  // Tronco e radici sotto i capostipiti della generazione 0.
  let ground: TreeLayout['ground'] = null;
  if (nodes.length) {
    const groundY = rowY(0) + NODE_H + GROUND_GAP;
    const xs = nodes.map((n) => n.x);
    ground = { y: groundY, x1: Math.min(...xs) - 160, x2: Math.max(...xs) + NODE_W + 160 };
    rows[0].forEach((u) => {
      if (u.members.some((m) => parents.get(m)!.length)) return;
      const total = new Set(u.members.flatMap((m) => [...countDesc(m)])).size;
      const ms = u.members.map((m) => nodeById.get(m)!);
      const key = u.members.length === 2 ? pairKey(u.members[0], u.members[1]) : '';
      const top = junction.get(key) ?? bottom(ms[0]);
      const w = total ? 14 + 6.5 * Math.sqrt(total) : branchWidth(0);
      branches.push({
        key: `t-${u.id}`,
        kind: 'trunk',
        d: `M ${fmt(top.x)} ${fmt(top.y - 10)} C ${fmt(top.x + 8)} ${fmt(top.y + 70)}, ${fmt(top.x - 12)} ${fmt(groundY - 90)}, ${fmt(top.x)} ${fmt(groundY + 4)}`,
        width: w,
        ids: u.members,
        gen: -1,
      });
      if (!total) return;
      // Radici che affiorano dal terreno.
      [-1, 1].forEach((dir) =>
        [0.55, 1].forEach((f, i) => {
          const len = (50 + w * 2.6) * f;
          branches.push({
            key: `r-${u.id}-${dir}-${i}`,
            kind: 'root',
            d: `M ${fmt(top.x)} ${fmt(groundY - 6)} Q ${fmt(top.x + dir * len * 0.4)} ${fmt(groundY + 2)} ${fmt(top.x + dir * len)} ${fmt(groundY + 10 + i * 10)}`,
            width: Math.max(3, w * (i ? 0.32 : 0.5)),
            ids: u.members,
            gen: -1,
          });
        }),
      );
    });
  }

  const width = nodes.length ? Math.max(...nodes.map((n) => n.x + NODE_W)) : 0;
  const height = ground ? ground.y + 40 : 0;
  return {
    nodes,
    nodeById,
    branches,
    hearts,
    ground,
    minX: 0,
    width,
    height,
    generations: people.length ? maxGen + 1 : 0,
  };
}
