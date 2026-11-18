import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { Gender } from '../types';
import { NODE_H, NODE_W, type LayoutNode, type TreeLayout } from '../lib/layout';
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

const PAD = 80;
const AV = 26; // raggio avatar

const Node = memo(function Node({
  node,
  selected,
  dimmed,
  matched,
  onSelect,
  photoBroken,
  onPhotoError,
}: {
  node: LayoutNode;
  selected: boolean;
  dimmed: boolean;
  matched: boolean;
  onSelect: (id: string) => void;
  photoBroken: boolean;
  onPhotoError: (url: string) => void;
}) {
  const p = node.person;
  const t = tone[p.gender] ?? tone.other;
  const dead = isDeceased(p);
  const clipId = `av-${p.id}`;
  const life = lifespan(p);
  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      className="tree-node cursor-pointer"
      style={{ opacity: dimmed ? 0.22 : 1, transition: 'opacity .25s' }}
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
      {(selected || matched) && (
        <rect
          x={-5}
          y={-5}
          width={NODE_W + 10}
          height={NODE_H + 10}
          rx={20}
          style={{
            fill: 'none',
            stroke: selected ? 'var(--brand)' : 'var(--brass)',
            strokeWidth: selected ? 2.5 : 2,
            strokeDasharray: selected ? undefined : '5 4',
            opacity: selected ? 0.9 : 1,
          }}
        />
      )}
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={16}
        className="tree-card"
        style={{ fill: 'var(--surface)', stroke: selected ? t.main : 'var(--line-2)', strokeWidth: selected ? 1.5 : 1 }}
      />
      <rect x={0} y={18} width={3.5} height={NODE_H - 36} rx={1.75} style={{ fill: t.main }} />

      <circle cx={16 + AV} cy={NODE_H / 2} r={AV} style={{ fill: t.soft, stroke: t.main, strokeOpacity: 0.35 }} />
      {p.photoUrl && !photoBroken ? (
        <>
          <clipPath id={clipId}>
            <circle cx={16 + AV} cy={NODE_H / 2} r={AV - 1} />
          </clipPath>
          <text
            x={16 + AV}
            y={NODE_H / 2 + 6}
            textAnchor="middle"
            className="font-serif"
            style={{ fill: t.main, fontSize: 17, fontWeight: 600 }}
          >
            {initials(p)}
          </text>
          <image
            href={p.photoUrl}
            x={16}
            y={NODE_H / 2 - AV}
            width={AV * 2}
            height={AV * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
            onError={() => onPhotoError(p.photoUrl!)}
            style={{ filter: dead ? 'grayscale(0.6)' : undefined }}
          />
        </>
      ) : (
        <text
          x={16 + AV}
          y={NODE_H / 2 + 6}
          textAnchor="middle"
          className="font-serif"
          style={{ fill: t.main, fontSize: 17, fontWeight: 600 }}
        >
          {initials(p)}
        </text>
      )}

      <text x={84} y={33} style={{ fill: 'var(--ink)', fontSize: 15, fontWeight: 600 }}>
        {truncate(p.firstName || '—', 17)}
        {dead && (
          <tspan dx={5} style={{ fill: 'var(--ink-3)', fontWeight: 400, fontSize: 13 }}>
            †
          </tspan>
        )}
      </text>
      <text x={84} y={51} className="font-serif" style={{ fill: 'var(--ink-2)', fontSize: 14, fontStyle: 'italic' }}>
        {truncate(p.lastName, 19)}
      </text>
      {life && (
        <text x={84} y={68} style={{ fill: 'var(--ink-3)', fontSize: 11.5, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2 }}>
          {life}
        </text>
      )}
    </g>
  );
});

const FamilyTree = forwardRef<FamilyTreeHandle, Props>(function FamilyTree(
  { layout, selectedId, focusIds, matchIds, onSelect, onBackgroundClick, onZoomChange },
  ref,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const fittedRef = useRef(false);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const onPhotoError = useCallback((url: string) => setBroken((b) => (b.has(url) ? b : new Set(b).add(url))), []);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    const svg = d3.select(svgRef.current!);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 2.5])
      .on('zoom', (e) => {
        gRef.current?.setAttribute('transform', e.transform.toString());
        onZoomChange?.(e.transform.k);
      });
    zoomRef.current = zoom;
    svg.call(zoom).on('dblclick.zoom', null);
    return () => {
      svg.on('.zoom', null);
    };
  }, [onZoomChange]);

  /** Adatta tutto l'albero; con `readable` non scende sotto una scala leggibile e parte dall'alto. */
  const fit = useCallback((animate = true, readable = false) => {
    const svgEl = svgRef.current;
    const zoom = zoomRef.current;
    const l = layoutRef.current;
    if (!svgEl || !zoom || !l.nodes.length) return;
    const { width, height } = svgEl.getBoundingClientRect();
    if (!width || !height) return;
    const bw = l.width + PAD * 2;
    const bh = l.height + PAD * 2;
    let k = Math.min(width / bw, height / bh, 1);
    let tx = (width - l.width * k) / 2;
    let ty = Math.max(PAD * k, (height - l.height * k) / 2);
    if (readable && k < 0.6) {
      // Albero molto ampio: mostra i capostipiti a una scala leggibile.
      k = Math.min(0.6, Math.max(k, width / 1400));
      const top = l.nodes.filter((n) => n.gen === 0);
      const cx = top.reduce((s, n) => s + n.x + NODE_W / 2, 0) / top.length;
      tx = width / 2 - cx * k;
      ty = 48;
    }
    const t = d3.zoomIdentity.translate(tx, ty).scale(k);
    const sel = d3.select(svgEl);
    (animate ? sel.transition().duration(550).ease(d3.easeCubicOut) : sel).call(zoom.transform as never, t);
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
    d3.select(svgEl).transition().duration(600).ease(d3.easeCubicInOut).call(zoom.transform as never, t);
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

  // Adatta la vista la prima volta che ci sono dati.
  useEffect(() => {
    if (!layout.nodes.length) {
      fittedRef.current = false;
      return;
    }
    if (!fittedRef.current) {
      fittedRef.current = true;
      requestAnimationFrame(() => fit(false, true));
    }
  }, [layout, fit]);

  const highlightLink = (ids: string[], type: 'child' | 'spouse' = 'spouse') => {
    if (!focusIds) return true;
    if (type === 'spouse') return ids.every((id) => focusIds.has(id));
    // Figlio evidenziato se lui e almeno un genitore fanno parte della linea.
    return focusIds.has(ids[ids.length - 1]) && ids.slice(0, -1).some((id) => focusIds.has(id));
  };

  return (
    <svg
      ref={svgRef}
      className="h-full w-full touch-none select-none outline-none"
      onClick={onBackgroundClick}
      role="application"
      aria-label="Albero genealogico interattivo: trascina per spostarti, usa la rotella o il pizzico per lo zoom"
    >
      <g ref={gRef}>
        <g fill="none">
          {layout.links.map((l) => {
            const on = highlightLink(l.ids, l.type);
            const isSpouse = l.type === 'spouse';
            return (
              <path
                key={l.key}
                d={l.d}
                style={{
                  stroke: isSpouse ? 'var(--brass)' : focusIds && on ? 'var(--brand)' : 'var(--link)',
                  strokeWidth: focusIds && on ? 2.25 : isSpouse ? 1.75 : 1.5,
                  strokeDasharray: l.loose ? '6 5' : undefined,
                  opacity: on ? (isSpouse ? 0.9 : 0.75) : 0.15,
                  transition: 'opacity .25s, stroke .25s',
                }}
              />
            );
          })}
        </g>
        {layout.links
          .filter((l) => l.type === 'spouse' && l.mid)
          .map((l) => (
            <g
              key={`h-${l.key}`}
              transform={`translate(${l.mid!.x},${l.mid!.y})`}
              style={{ opacity: highlightLink(l.ids) ? 1 : 0.2, transition: 'opacity .25s' }}
            >
              <circle r={10} style={{ fill: 'var(--paper)', stroke: 'var(--brass)', strokeWidth: 1.25 }} />
              <path
                d="M0 3.6 C-4.6 0.4 -5.4 -2.4 -3.4 -3.9 C-2 -4.9 -0.6 -4.3 0 -3.2 C0.6 -4.3 2 -4.9 3.4 -3.9 C5.4 -2.4 4.6 0.4 0 3.6 Z"
                style={{ fill: 'var(--brass)' }}
              />
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
          />
        ))}
      </g>
    </svg>
  );
});

export default FamilyTree;
