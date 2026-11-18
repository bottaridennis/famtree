import React, { useEffect, useState, useRef } from 'react';
import * as d3 from 'd3';
import { Person } from '../types';
import { User, Heart, Baby } from 'lucide-react';

interface FamilyTreeProps {
  people: Person[];
  onSelectPerson?: (person: Person) => void;
}

const FamilyTree: React.FC<FamilyTreeProps> = ({ people, onSelectPerson }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || people.length === 0) return;

    const width = containerRef.current?.clientWidth || 800;
    const height = 600;
    const nodeWidth = 160;
    const nodeHeight = 70;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Define gradients for nodes
    const defs = svg.append('defs');
    
    const maleGradient = defs.append('linearGradient')
      .attr('id', 'male-grad')
      .attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
    maleGradient.append('stop').attr('offset', '0%').attr('stop-color', '#f0f7ff');
    maleGradient.append('stop').attr('offset', '100%').attr('stop-color', '#e0efff');

    const femaleGradient = defs.append('linearGradient')
      .attr('id', 'female-grad')
      .attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
    femaleGradient.append('stop').attr('offset', '0%').attr('stop-color', '#fff5f5');
    femaleGradient.append('stop').attr('offset', '100%').attr('stop-color', '#ffebeb');

    const g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Calculate generation levels based on parents
    const levels: Record<string, number> = {};
    const calculateLevel = (id: string, visited = new Set<string>()): number => {
      if (levels[id] !== undefined) return levels[id];
      if (visited.has(id)) return 0;
      visited.add(id);

      const person = people.find(p => p.id === id);
      if (!person) return 0;

      // If person has parents, level is max(parent levels) + 1
      const fatherLevel = person.fatherId ? calculateLevel(person.fatherId, visited) : -1;
      const motherLevel = person.motherId ? calculateLevel(person.motherId, visited) : -1;
      
      const maxParentLevel = Math.max(fatherLevel, motherLevel);
      
      // Also check if person is a spouse of someone with a level
      // This helps keep couples on the same level
      const spouseWithLevel = people.find(p => p.spouseIds?.includes(id) && levels[p.id] !== undefined);
      if (spouseWithLevel) {
        levels[id] = levels[spouseWithLevel.id];
        return levels[id];
      }

      levels[id] = maxParentLevel === -1 ? 0 : maxParentLevel + 1;
      return levels[id];
    };

    // Run multiple passes to stabilize levels for couples
    for (let i = 0; i < 3; i++) {
      people.forEach(p => calculateLevel(p.id));
    }

    // Group by level
    const peopleByLevel: Record<number, Person[]> = {};
    people.forEach(p => {
      const lvl = levels[p.id] || 0;
      if (!peopleByLevel[lvl]) peopleByLevel[lvl] = [];
      peopleByLevel[lvl].push(p);
    });

    const nodes: any[] = [];
    const links: any[] = [];

    // Position nodes with more spacing
    Object.entries(peopleByLevel).forEach(([lvlStr, levelPeople]) => {
      const lvl = parseInt(lvlStr);
      const spacing = nodeWidth + 60;
      const totalWidth = levelPeople.length * spacing;
      const startX = (width - totalWidth) / 2;

      levelPeople.forEach((p, i) => {
        const x = startX + i * spacing;
        const y = lvl * 200 + 100;
        nodes.push({ ...p, x, y });
      });
    });

    // Create links
    nodes.forEach(node => {
      if (node.fatherId) {
        const father = nodes.find(n => n.id === node.fatherId);
        if (father) links.push({ source: father, target: node, type: 'parent' });
      }
      if (node.motherId) {
        const mother = nodes.find(n => n.id === node.motherId);
        if (mother) links.push({ source: mother, target: node, type: 'parent' });
      }
      if (node.spouseIds) {
        node.spouseIds.forEach((sid: string) => {
          const spouse = nodes.find(n => n.id === sid);
          if (spouse && node.id < spouse.id) {
            links.push({ source: node, target: spouse, type: 'spouse' });
          }
        });
      }
    });

    // Draw links with better paths
    g.selectAll('.link')
      .data(links)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', (d: any) => {
        const sx = d.source.x + nodeWidth / 2;
        const sy = d.source.y + nodeHeight / 2;
        const tx = d.target.x + nodeWidth / 2;
        const ty = d.target.y + nodeHeight / 2;

        if (d.type === 'spouse') {
          return `M ${sx} ${sy} L ${tx} ${ty}`;
        } else {
          const startX = d.source.x + nodeWidth / 2;
          const startY = d.source.y + nodeHeight;
          const endX = d.target.x + nodeWidth / 2;
          const endY = d.target.y;
          const midY = (startY + endY) / 2;
          return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
        }
      })
      .attr('stroke', (d: any) => d.type === 'spouse' ? '#9f5f5f' : '#5a5a40')
      .attr('stroke-width', (d: any) => d.type === 'spouse' ? 3 : 2)
      .attr('fill', 'none')
      .attr('stroke-dasharray', (d: any) => d.type === 'spouse' ? '8,4' : '0')
      .attr('opacity', 0.6);

    // Draw nodes
    const nodeGroups = g.selectAll('.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', (d: any) => `translate(${d.x}, ${d.y})`)
      .on('click', (event, d) => onSelectPerson?.(d))
      .style('cursor', 'pointer');

    // Card background
    nodeGroups.append('rect')
      .attr('width', nodeWidth)
      .attr('height', nodeHeight)
      .attr('rx', 20)
      .attr('fill', 'white')
      .attr('stroke', (d: any) => d.gender === 'male' ? '#3b82f6' : d.gender === 'female' ? '#f43f5e' : '#64748b')
      .attr('stroke-width', 1)
      .attr('class', 'transition-all duration-300 hover:stroke-[2px] shadow-sm');

    // Photo or Icon
    const photoGroup = nodeGroups.append('g')
      .attr('transform', 'translate(10, 10)');

    photoGroup.append('rect')
      .attr('width', 50)
      .attr('height', 50)
      .attr('rx', 15)
      .attr('fill', (d: any) => d.gender === 'male' ? '#f0f7ff' : d.gender === 'female' ? '#fff5f5' : '#f8fafc');

    // Add clipPath for circular photos
    defs.selectAll('.node-clip')
      .data(nodes)
      .enter()
      .append('clipPath')
      .attr('id', (d: any) => `clip-${d.id}`)
      .append('rect')
      .attr('width', 50)
      .attr('height', 50)
      .attr('rx', 15);

    photoGroup.append('image')
      .attr('href', (d: any) => d.photoUrl || '')
      .attr('width', 50)
      .attr('height', 50)
      .attr('preserveAspectRatio', 'xMidYMid slice')
      .attr('clip-path', (d: any) => `url(#clip-${d.id})`)
      .attr('opacity', (d: any) => d.photoUrl ? 1 : 0);

    photoGroup.append('circle')
      .attr('cx', 25)
      .attr('cy', 25)
      .attr('r', 15)
      .attr('fill', (d: any) => d.gender === 'male' ? '#3b82f6' : d.gender === 'female' ? '#f43f5e' : '#64748b')
      .attr('opacity', (d: any) => d.photoUrl ? 0 : 0.2);

    // Name
    nodeGroups.append('text')
      .attr('x', 70)
      .attr('y', 28)
      .attr('class', 'serif font-bold')
      .attr('font-size', '14px')
      .attr('fill', '#1a1a1a')
      .text((d: any) => `${d.firstName}`);

    nodeGroups.append('text')
      .attr('x', 70)
      .attr('y', 44)
      .attr('class', 'serif italic')
      .attr('font-size', '12px')
      .attr('fill', '#4a4a4a')
      .text((d: any) => `${d.lastName}`);

    // Dates
    nodeGroups.append('text')
      .attr('x', 70)
      .attr('y', 58)
      .attr('font-size', '10px')
      .attr('fill', '#888')
      .attr('class', 'font-medium')
      .text((d: any) => {
        const birth = d.birthDate ? d.birthDate.split('-')[0] : '?';
        const death = d.deathDate ? d.deathDate.split('-')[0] : '';
        return `${birth}${death ? ' - ' + death : ''}`;
      });

    // Center the tree
    const initialScale = 0.7;
    const initialX = (width - width * initialScale) / 2;
    const initialY = 50;
    svg.call(zoom.transform, d3.zoomIdentity.translate(initialX, initialY).scale(initialScale));

  }, [people, onSelectPerson]);

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-50 rounded-xl overflow-hidden relative border border-slate-200">
      <svg ref={svgRef} className="w-full h-full" />
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 bg-white/80 backdrop-blur p-3 rounded-lg border border-slate-200 text-xs shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span>Maschio</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500" />
          <span>Femmina</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1 h-3 bg-slate-400" />
          <span>Genitore-Figlio</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 border-t border-dashed border-rose-500" />
          <span>Coniugi</span>
        </div>
      </div>
    </div>
  );
};

export default FamilyTree;
