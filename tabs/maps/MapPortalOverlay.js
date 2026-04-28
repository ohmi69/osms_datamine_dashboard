
import { el, padMapId } from '../../lib/utils.js';
import { attachTooltip, hideItemTooltip } from '../../lib/tooltip.js';

// Attaches portal circle overlays + intra-map arrows to imgContainer once img loads.
// getSelfNavigate() is called at click-time to avoid stale closure.
export function attachPortalOverlay(imgContainer, img, mapEntry, getSelfNavigate, mapMobs) {
  img.addEventListener('load', async () => {
    imgContainer.querySelectorAll('.portal-overlay').forEach(e => e.remove());

    if (!window._allPortalsCache) {
      try {
        const res = await fetch('data/maps/portals.json');
        window._allPortalsCache = res.ok ? await res.json() : {};
      } catch {
        window._allPortalsCache = {};
      }
    }

    const allPortals = window._allPortalsCache || {};
    const portals = allPortals[padMapId(mapEntry.id)] || [];
    if (!Array.isArray(portals) || portals.length === 0) return;

    const naturalW = img.naturalWidth, naturalH = img.naturalHeight;
    const displayW = img.width, displayH = img.height;
    const scaleX = displayW / naturalW;
    const scaleY = displayH / naturalH;
    const imgScale = Math.min(scaleX, scaleY);
    const portalR = Math.max(8, Math.min(18, Math.round(10 + 16 * imgScale)));
    const portalBorder = Math.max(1, Math.round(2 + imgScale));
    const portalOverlayMap = new Map();
    let showAllIntra = true;

    function drawAllIntraArrows() {
      imgContainer.querySelectorAll('.portal-arrow-svg-all').forEach(s => s.remove());
      const uid = Math.random().toString(36).slice(2);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'portal-arrow-svg-all');
      svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9;overflow:visible';
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const mkEnd = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      mkEnd.setAttribute('id', `pae-${uid}`);
      mkEnd.setAttribute('markerWidth', '5'); mkEnd.setAttribute('markerHeight', '4');
      mkEnd.setAttribute('refX', '5'); mkEnd.setAttribute('refY', '2');
      mkEnd.setAttribute('orient', 'auto');
      const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      p1.setAttribute('points', '0 0, 5 2, 0 4'); p1.setAttribute('fill', '#2ecc40');
      mkEnd.appendChild(p1); defs.appendChild(mkEnd);
      const mkStart = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      mkStart.setAttribute('id', `pas-${uid}`);
      mkStart.setAttribute('markerWidth', '5'); mkStart.setAttribute('markerHeight', '4');
      mkStart.setAttribute('refX', '0'); mkStart.setAttribute('refY', '2');
      mkStart.setAttribute('orient', 'auto');
      const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      p2.setAttribute('points', '5 0, 0 2, 5 4'); p2.setAttribute('fill', '#2ecc40');
      mkStart.appendChild(p2); defs.appendChild(mkStart);
      svg.appendChild(defs);
      const drawn = new Set();
      portals.forEach(portal => {
        if (!portal.intra_map || !portal.dest_portal || !portal.name) return;
        const pairKey = [portal.name, portal.dest_portal].sort().join('|');
        if (drawn.has(pairKey)) return;
        drawn.add(pairKey);
        const src = portalOverlayMap.get(portal.name);
        const dst = portalOverlayMap.get(portal.dest_portal);
        if (!src || !dst) return;
        const destData = portals.find(p => p.name === portal.dest_portal);
        const isMutual = destData && destData.dest_portal === portal.name;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        { const adx = dst.px - src.px, ady = dst.py - src.py, adist = Math.sqrt(adx*adx+ady*ady)||1, aux = adx/adist, auy = ady/adist;
        line.setAttribute('x1', src.px + aux * portalR); line.setAttribute('y1', src.py + auy * portalR);
        line.setAttribute('x2', dst.px - aux * portalR); line.setAttribute('y2', dst.py - auy * portalR); }
        line.setAttribute('stroke', '#2ecc40');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '6 3');
        line.setAttribute('marker-end', `url(#pae-${uid})`);
        if (isMutual) line.setAttribute('marker-start', `url(#pas-${uid})`);
        svg.appendChild(line);
      });
      imgContainer.appendChild(svg);
    }

    portals.forEach(portal => {
      const px = portal.x * scaleX;
      const py = portal.y * scaleY;
      if (portal.dest_map === '999999999') {
        if (portal.name) portalOverlayMap.set(portal.name, { overlay: null, boxShadow: null, hoverShadow: null, bgColor: null, isIntra: false, px, py });
        return;
      }
      const isIntra = portal.intra_map;
      const borderColor = isIntra ? '#2ecc40' : '#3af';
      const bgColor = isIntra ? 'rgba(46,204,64,0.18)' : 'rgba(0,120,255,0.18)';
      const boxShadow = isIntra ? '0 0 8px 2px #2ecc4066' : '0 0 8px 2px #3af6';
      const hoverShadow = isIntra ? '0 0 16px 4px #2ecc40bb' : '0 0 16px 4px #fff8';
      const overlay = el('div', {
        className: 'portal-overlay',
        style: {
          position: 'absolute',
          left: `${px - portalR}px`,
          top: `${py - portalR}px`,
          width: `${portalR * 2}px`,
          height: `${portalR * 2}px`,
          borderRadius: '50%',
          border: `${portalBorder}px solid ${borderColor}`,
          background: bgColor,
          boxShadow: boxShadow,
          zIndex: 2,
          pointerEvents: 'auto',
          cursor: 'pointer',
        }
      });
      if (portal.name) portalOverlayMap.set(portal.name, { overlay, boxShadow, hoverShadow, bgColor, isIntra, px, py });
      overlay.addEventListener('mouseenter', () => {
        overlay.style.boxShadow = hoverShadow;
        overlay.style.background = 'rgba(0,0,0,0.45)';
        if (isIntra && portal.dest_portal) {
          const partner = portalOverlayMap.get(portal.dest_portal);
          if (partner && partner.overlay) {
            partner.overlay.style.boxShadow = '0 0 16px 4px #2ecc40bb';
            partner.overlay.style.background = 'rgba(0,0,0,0.45)';
          }
          if (!showAllIntra && partner) {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'portal-arrow-svg-hover');
            svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9;overflow:visible';
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', 'portal-arrowhead-hover');
            marker.setAttribute('markerWidth', '5'); marker.setAttribute('markerHeight', '4');
            marker.setAttribute('refX', '5'); marker.setAttribute('refY', '2');
            marker.setAttribute('orient', 'auto');
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', '0 0, 5 2, 0 4'); poly.setAttribute('fill', '#2ecc40');
            marker.appendChild(poly); defs.appendChild(marker); svg.appendChild(defs);
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            { const hdx = partner.px - px, hdy = partner.py - py, hdist = Math.sqrt(hdx*hdx+hdy*hdy)||1, hux = hdx/hdist, huy = hdy/hdist;
            line.setAttribute('x1', px + hux * portalR); line.setAttribute('y1', py + huy * portalR);
            line.setAttribute('x2', partner.px - hux * portalR); line.setAttribute('y2', partner.py - huy * portalR); }
            line.setAttribute('stroke', '#2ecc40');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('stroke-dasharray', '6 3');
            line.setAttribute('marker-end', 'url(#portal-arrowhead-hover)');
            svg.appendChild(line);
            imgContainer.appendChild(svg);
          }
        }
      });
      overlay.addEventListener('mouseleave', () => {
        if (!isIntra || !showAllIntra) {
          overlay.style.boxShadow = boxShadow;
          overlay.style.background = bgColor;
        }
        if (isIntra && portal.dest_portal) {
          const partner = portalOverlayMap.get(portal.dest_portal);
          if (partner && partner.overlay && !showAllIntra) {
            partner.overlay.style.boxShadow = partner.boxShadow;
            partner.overlay.style.background = partner.bgColor;
          }
        }
        imgContainer.querySelectorAll('.portal-arrow-svg-hover').forEach(s => s.remove());
      });
      overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        hideItemTooltip();
        if (isIntra) {
          showAllIntra = !showAllIntra;
          if (showAllIntra) {
            drawAllIntraArrows();
            portalOverlayMap.forEach(entry => {
              if (entry.isIntra && entry.overlay) {
                entry.overlay.style.boxShadow = entry.hoverShadow;
                entry.overlay.style.background = 'rgba(0,0,0,0.45)';
              }
            });
          } else {
            imgContainer.querySelectorAll('.portal-arrow-svg-all').forEach(s => s.remove());
            portalOverlayMap.forEach(entry => {
              if (entry.isIntra && entry.overlay) {
                entry.overlay.style.boxShadow = entry.boxShadow;
                entry.overlay.style.background = entry.bgColor;
              }
            });
          }
        } else if (portal.dest_map) {
          const selfNavigate = getSelfNavigate();
          if (selfNavigate) selfNavigate({ id: Number(portal.dest_map), autoExpand: true });
        }
      });
      attachTooltip(overlay, () => ({ portal, mapEntry, mobs: mapMobs.get(mapEntry.id), showAllIntra }), 'portal');
      imgContainer.appendChild(overlay);
    });

    drawAllIntraArrows();
    portalOverlayMap.forEach(entry => {
      if (entry.isIntra && entry.overlay) {
        entry.overlay.style.boxShadow = entry.hoverShadow;
        entry.overlay.style.background = 'rgba(0,0,0,0.45)';
      }
    });
  });
}
