import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { Gender } from '../types';
import {
  LABEL_H,
  LABEL_W,
  LABEL_Y,
  MED_CY,
  MED_R,
  NODE_H,
  NODE_W,
  type Branch,
  type LayoutNode,
  type TreeLayout,
} from '../lib/layout';
import { initials, isDeceased, lifespan } from '../lib/family';

export interface FamilyTreeHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  centerOn: (id: string, opts?: { zoom?: boolean; yRatio?: number }) => void;
}

interface Props {
  layout: TreeLayout;
  selectedId: string | null;
  /** Persone da evidenziare (le altre vengono attenuate). */
  focusIds: Set<string> | null;
  /** Risultati di ricerca. */
  matchIds: Set<string> | null;
  onSelect: (id: string) => void;
  onBackgroundClick: () => void;
  onZoomChange?: (k: number) => void;
}

const tone: Record<Gender, { main: string; soft: string }> = {
  male: { main: 'var(--male)', soft: 'var(--male-soft)' },
  female: { main: 'var(--female)', soft: 'var(--female-soft)' },
  other: { main: 'var(--other)', soft: 'var(--other-soft)' },
};

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const PAD = 60;
/** Ritardo dell'animazione di crescita per generazione (s). */
const STEP = 0.16;

/** Hash deterministico per variare le foglie di ogni persona. */
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
};

const leafPath = (l: number) => {
  const w = l * 0.3;
  return `M0 0 C ${l * 0.3} ${-w}, ${l * 0.75} ${-w}, ${l} 0 C ${l * 0.75} ${w}, ${l * 0.3} ${w}, 0 0 Z`;
};

const GREEN = ['var(--leaf-1)', 'var(--leaf-2)', 'var(--leaf-3)', 'var(--leaf-4)'];
const AUTUMN = ['var(--autumn-1)', 'var(--autumn-2)', 'var(--autumn-3)', 'var(--autumn-4)'];

/** Ciuffo di foglie attorno al medaglione: verdi per i viventi, autunnali per chi non c'è più. */
function Leaves({ id, dead, tip }: { id: string; dead: boolean; tip: boolean }) {
  const leaves = useMemo(() => {
    const rnd = hash(id);
    const count = tip ? 9 : 6;
    const palette = dead ? AUTUMN : GREEN;
    return Array.from({ length: count }, (_, i) => {
      // Ventaglio sopra e ai lati del medaglione.
      const a = -200 + (220 / (count - 1)) * i + (rnd() - 0.5) * 18;
      const len = 22 + rnd() * (tip ? 16 : 10);
      return { a, len, r: MED_R - 6 + rnd() * 4, fill: palette[Math.floor(rnd() * palette.length)] };
    });
  }, [id, dead, tip]);
  return (
    <g transform={`translate(${NODE_W / 2},${MED_CY})`}>
      {leaves.map((l, i) => (
        <g key={i} transform={`rotate(${l.a}) translate(${l.r},0)`}>
          <path d={leafPath(l.len)} style={{ fill: l.fill }} />
          <path d={`M1 0 L${l.len - 3} 0`} style={{ stroke: 'var(--leaf-vein)', strokeWidth: 0.8, fill: 'none' }} />
        </g>
      ))}
    </g>
  );
}

const Node = memo(function Node({
  node,
  selected,
  dimmed,
  matched,
  onSelect,
  photoBroken,
  onPhotoError,
  delay,
}: {
  node: LayoutNode;
  selected: boolean;
  dimmed: boolean;
  matched: boolean;
  onSelect: (id: string) => void;
  photoBroken: boolean;
  onPhotoError: (url: string) => void;
  delay: number;
}) {
  const p = node.person;
  const t = tone[p.gender] ?? tone.other;
  const dead = isDeceased(p);
  const clipId = `av-${p.id}`;
  const life = lifespan(p);
  const cx = NODE_W / 2;
  const lx = (NODE_W - LABEL_W) / 2;
  return (
    <g
      className="tree-node cursor-pointer"
      style={{ transform: `translate(${node.x}px,${node.y}px)`, opacity: dimmed ? 0.25 : 1 }}
      role="button"
      tabIndex={0}
      aria-label={`${p.firstName} ${p.lastName}${life ? `, ${life}` : ''}`}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(p.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(p.id);
        }
      }}
    >
      <g className="node-pop" style={{ animationDelay: `${delay}s` }}>
        <Leaves id={p.id} dead={dead} tip={node.descendants === 0} />

        {(selected || matched) && (
          <circle
            cx={cx}
            cy={MED_CY}
            r={MED_R + 7}
            style={{
              fill: 'none',
              stroke: selected ? 'var(--brand)' : 'var(--brass)',
              strokeWidth: selected ? 3 : 2.5,
              strokeDasharray: selected ? undefined : '5 4',
            }}
          />
        )}
        <circle className="tree-medal" cx={cx} cy={MED_CY} r={MED_R} style={{ fill: t.soft, stroke: t.main, strokeWidth: 2.5 }} />
        <text x={cx} y={MED_CY + 6} textAnchor="middle" className="font-serif" style={{ fill: t.main, fontSize: 19, fontWeight: 600 }}>
          {initials(p)}
        </text>
        {p.photoUrl && !photoBroken && (
          <>
            <clipPath id={clipId}>
              <circle cx={cx} cy={MED_CY} r={MED_R - 1.5} />
            </clipPath>
            <image
              href={p.photoUrl}
              x={cx - MED_R}
              y={MED_CY - MED_R}
              width={MED_R * 2}
              height={MED_R * 2}
              preserveAspectRatio="xMidYMid slice"
              clipPath={`url(#${clipId})`}
              onError={() => onPhotoError(p.photoUrl!)}
              style={{ filter: dead ? 'grayscale(0.6) sepia(0.2)' : undefined }}
            />
          </>
        )}

        <g className="tree-label">
          <rect
            className="tree-card"
            x={lx}
            y={LABEL_Y}
            width={LABEL_W}
            height={LABEL_H}
            rx={11}
            style={{ fill: 'var(--surface)', stroke: selected ? 'var(--brand)' : 'var(--line-2)', strokeWidth: selected ? 1.5 : 1 }}
          />
          <text x={cx} y={LABEL_Y + 17} textAnchor="middle" style={{ fill: 'var(--ink)', fontSize: 12.5, fontWeight: 600 }}>
            {truncate(`${p.firstName} ${p.lastName}`, 21)}
            {dead && <tspan style={{ fill: 'var(--ink-3)', fontWeight: 400 }}> †</tspan>}
          </text>
          <text
            x={cx}
            y={LABEL_Y + 32}
            textAnchor="middle"
            style={{ fill: 'var(--ink-3)', fontSize: 10.5, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2 }}
          >
            {life || '—'}
          </text>
        </g>
      </g>
    </g>
  );
});

const branchDelay = (b: Branch) => Math.max(0, b.gen) * STEP + (b.kind === 'trunk' || b.kind === 'root' ? 0 : 0.15);

const FamilyTree = forwardRef<FamilyTreeHandle, Props>(function FamilyTree(
  { layout, selectedId, focusIds, matchIds, onSelect, onBackgroundClick, onZoomChange },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const fittedRef = useRef(false);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const onPhotoError = useCallback((url: string) => setBroken((b) => (b.has(url) ? b : new Set(b).add(url))), []);

  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 2.5])
      .on('zoom', (e) => {
        gRef.current?.setAttribute('transform', e.transform.toString());
        // Da lontano si vede la chioma: nascondiamo i cartellini per leggibilità.
        svgRef.current?.setAttribute('data-lod', e.transform.k < 0.42 ? 'far' : 'near');
        onZoomChange?.(e.transform.k);
      });
    zoomRef.current = zoom;
    svg.call(zoom).on('dblclick.zoom', null);
    return () => {
      svg.on('.zoom', null);
    };
  }, [onZoomChange]);

  const fit = useCallback((animate = true) => {
    const svgEl = svgRef.current;
    const zoom = zoomRef.current;
    const l = layoutRef.current;
    if (!svgEl || !zoom || !l.nodes.length) return;
    const { width, height } = svgEl.getBoundingClientRect();
    if (!width || !height) return;
    const x1 = l.ground?.x1 ?? 0;
    const x2 = l.ground?.x2 ?? l.width;
    const top = -70; // spazio per le foglie in cima
    const bw = x2 - x1 + PAD * 2;
    const bh = l.height - top + PAD * 2;
    let k = Math.min(width / bw, height / bh, 1);
    let tx = width / 2 - ((x1 + x2) / 2) * k;
    let ty = height / 2 - ((top + l.height) / 2) * k;
    if (k < 0.14 && l.ground) {
      // Albero enorme o schermo piccolo: inquadra il tronco e le prime generazioni.
      k = 0.3;
      // Con più famiglie scollegate parte dal tronco con più discendenti.
      const root = l.nodes.filter((n) => n.gen === 0).sort((a, b) => b.descendants - a.descendants)[0];
      const cx = root.x + NODE_W / 2;
      tx = width / 2 - cx * k;
      ty = height * 0.78 - l.ground.y * k;
    }
    const t = d3.zoomIdentity.translate(tx, ty).scale(k);
    const sel = d3.select(svgEl);
    (animate ? sel.transition().duration(650).ease(d3.easeCubicOut) : sel).call(zoom.transform as never, t);
  }, []);

  const centerOn = useCallback((id: string, opts?: { zoom?: boolean; yRatio?: number }) => {
    const svgEl = svgRef.current;
    const zoom = zoomRef.current;
    const n = layoutRef.current.nodeById.get(id);
    if (!svgEl || !zoom || !n) return;
    const { width, height } = svgEl.getBoundingClientRect();
    const current = d3.zoomTransform(svgEl);
    const k = opts?.zoom === false ? current.k : Math.max(current.k, 0.85);
    const t = d3.zoomIdentity
      .translate(width / 2 - (n.x + NODE_W / 2) * k, height * (opts?.yRatio ?? 0.5) - (n.y + NODE_H / 2) * k)
      .scale(k);
    d3.select(svgEl).transition().duration(650).ease(d3.easeCubicInOut).call(zoom.transform as never, t);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => zoomRef.current && d3.select(svgRef.current!).transition().duration(250).call(zoomRef.current.scaleBy as never, 1.3),
      zoomOut: () => zoomRef.current && d3.select(svgRef.current!).transition().duration(250).call(zoomRef.current.scaleBy as never, 1 / 1.3),
      fit: () => fit(true),
      centerOn,
    }),
    [fit, centerOn],
  );

  // La prima volta mostra l'intero albero.
  useEffect(() => {
    if (!layout.nodes.length) {
      fittedRef.current = false;
      return;
    }
    if (!fittedRef.current) {
      fittedRef.current = true;
      requestAnimationFrame(() => fit(false));
    }
  }, [layout, fit]);

  const isOn = (b: { ids: string[]; kind?: Branch['kind'] }) => {
    if (!focusIds) return true;
    if (b.kind === 'child') return focusIds.has(b.ids[b.ids.length - 1]) && b.ids.slice(0, -1).some((id) => focusIds.has(id));
    if (b.kind === 'trunk' || b.kind === 'root') return b.ids.some((id) => focusIds.has(id));
    return b.ids.every((id) => focusIds.has(id));
  };

  const { ground } = layout;
  const solid = layout.branches.filter((b) => !b.loose);
  const loose = layout.branches.filter((b) => b.loose);

  return (
    <svg
      ref={svgRef}
      className="family-tree h-full w-full touch-none select-none outline-none"
      onClick={onBackgroundClick}
      role="application"
      aria-label="Albero genealogico interattivo: trascina per spostarti, usa la rotella o il pizzico per lo zoom"
    >
      <defs>
        <linearGradient id="ground-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--grass-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--grass-2)' }} />
        </linearGradient>
      </defs>
      <g ref={gRef}>
        {ground && (
          <g className="tree-ground">
            <path
              d={`M ${ground.x1 - 400} ${ground.y + 14} C ${ground.x1} ${ground.y - 14}, ${(ground.x1 + ground.x2) / 2 - 300} ${ground.y - 30}, ${(ground.x1 + ground.x2) / 2} ${ground.y - 30} S ${ground.x2} ${ground.y - 14}, ${ground.x2 + 400} ${ground.y + 14} V ${ground.y + 40000} H ${ground.x1 - 400} Z`}
              style={{ fill: 'url(#ground-grad)' }}
            />
          </g>
        )}

        {/* Chioma: macchie di fogliame dietro le persone, fuse insieme per dare la sagoma dell'albero. */}
        <g className="tree-canopy" style={{ opacity: focusIds ? 0.1 : 0.22, transition: 'opacity .25s' }}>
          {layout.nodes
            .filter((n) => n.gen > 0 || layout.generations === 1)
            .map((n) => (
              <circle
                key={`c-${n.person.id}`}
                className="node-pop"
                cx={n.x + NODE_W / 2}
                cy={n.y + MED_CY + 8}
                r={n.descendants === 0 ? 150 : 135}
                style={{ fill: 'var(--canopy)', animationDelay: `${n.gen * STEP + 0.3}s` }}
              />
            ))}
        </g>

        {/* Corteccia: contorno scuro sotto, legno chiaro sopra, così i rami si fondono senza giunture. */}
        {[0, 1].map((layer) => (
          <g key={layer} fill="none" strokeLinecap="round" strokeLinejoin="round">
            {solid.map((b) => {
              const on = isOn(b);
              return (
                <path
                  key={b.key}
                  d={b.d}
                  pathLength={1}
                  className="branch"
                  style={{
                    stroke: layer ? 'var(--bark)' : 'var(--bark-edge)',
                    strokeWidth: layer ? b.width : b.width + 2.5,
                    opacity: on ? 1 : 0.18,
                    animationDelay: `${branchDelay(b)}s`,
                  }}
                />
              );
            })}
          </g>
        ))}
        {/* Riflesso di luce sui rami più grossi (effetto cilindrico). */}
        <g fill="none" strokeLinecap="round" style={{ pointerEvents: 'none' }}>
          {solid
            .filter((b) => (b.kind === 'trunk' || b.kind === 'child') && b.width > 9)
            .map((b) => (
              <path
                key={`v-${b.key}`}
                d={b.d}
                pathLength={1}
                className="branch"
                style={{
                  stroke: 'var(--bark-light)',
                  strokeWidth: b.width * 0.18,
                  opacity: isOn(b) ? 0.4 : 0.08,
                  transform: `translateX(${-b.width * 0.22}px)`,
                  animationDelay: `${branchDelay(b)}s`,
                }}
              />
            ))}
        </g>
        <g fill="none" strokeLinecap="round">
          {loose.map((b) => (
            <path
              key={b.key}
              d={b.d}
              style={{ stroke: 'var(--brass)', strokeWidth: 2, strokeDasharray: '6 5', opacity: isOn(b) ? 0.9 : 0.15 }}
            />
          ))}
        </g>
        {layout.hearts.map((h) => (
          <g key={`h-${h.key}`} className="tree-node" style={{ transform: `translate(${h.x}px,${h.y}px)`, opacity: isOn(h) ? 1 : 0.2 }}>
            <g className="node-pop" style={{ animationDelay: '0.4s' }}>
            <circle r={9} style={{ fill: 'var(--surface)', stroke: 'var(--brass)', strokeWidth: 1.25 }} />
            <path
              d="M0 3.4 C-4.4 0.4 -5.1 -2.3 -3.2 -3.7 C-1.9 -4.6 -0.6 -4.1 0 -3 C0.6 -4.1 1.9 -4.6 3.2 -3.7 C5.1 -2.3 4.4 0.4 0 3.4 Z"
              style={{ fill: 'var(--brass)' }}
            />
            </g>
          </g>
        ))}
        {layout.nodes.map((n) => (
          <Node
            key={n.person.id}
            node={n}
            selected={n.person.id === selectedId}
            dimmed={!!focusIds && !focusIds.has(n.person.id)}
            matched={!!matchIds?.has(n.person.id)}
            onSelect={onSelect}
            photoBroken={!!n.person.photoUrl && broken.has(n.person.photoUrl)}
            onPhotoError={onPhotoError}
            delay={n.gen * STEP + 0.35}
          />
        ))}
      </g>
    </svg>
  );
});

export default FamilyTree;
