import { useEffect, useRef, useState } from 'react';
import { FloorPlanScene } from './FloorPlanScene';
import './FloorViewer.css';

export interface FloorConfig {
  id: string;
  label: string;
  /** Path relative to /public, e.g. "/models/ground-floor.glb" */
  modelUrl?: string;
  /** Initial camera position [x, y, z]. Defaults to [8, 6, 8]. */
  cameraPosition?: [number, number, number];
  /**
   * Vertical offset in scene units (metres if modelled at 1:1).
   * Ground floor = 0. Set each upper floor to its floor-to-floor height.
   * e.g. yOffset: 3 for a 3 m ceiling height.
   */
  yOffset?: number;
}

interface FloorViewerProps {
  floors: FloorConfig[];
}

export function FloorViewer({ floors }: FloorViewerProps) {
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Entrance animation + active dot tracking via IntersectionObserver
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          const slide = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            slide.classList.add('in-view');
            const idx = Number(slide.dataset.index);
            if (!Number.isNaN(idx)) setActiveIndex(idx);
          }
        });
      },
      // Trigger when ≥ 50% of a slide is visible
      { threshold: 0.5 }
    );

    slideRefs.current.forEach(slide => {
      if (slide) observer.observe(slide);
    });

    return () => observer.disconnect();
  }, [floors]);

  function scrollToFloor(index: number) {
    slideRefs.current[index]?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <>
      {/* Scroll-snap container */}
      <div className='floor-viewer' role='region' aria-label='Floor plan viewer'>
        {floors.map((floor, index) => (
          <div
            key={floor.id}
            ref={el => {
              slideRefs.current[index] = el;
            }}
            data-index={index}
            className='floor-slide'
            aria-label={floor.label}
          >
            <div className='floor-slide__content'>
              <FloorPlanScene
                modelUrl={floor.modelUrl}
                label={floor.label}
                floorIndex={index}
                cameraPosition={floor.cameraPosition}
                yOffset={floor.yOffset ?? 0}
                referenceFloors={floors
                  .slice(0, index)
                  .filter(f => f.modelUrl != null)
                  .map(f => ({ modelUrl: f.modelUrl!, yOffset: f.yOffset ?? 0 }))}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Floor indicator dots (fixed, outside scroll container) */}
      {floors.length > 1 && (
        <nav className='floor-indicators' aria-label='Floor navigation'>
          {floors.map((floor, index) => (
            <button
              key={floor.id}
              className={`floor-dot ${activeIndex === index ? 'active' : ''}`}
              onClick={() => scrollToFloor(index)}
              aria-label={`Go to ${floor.label}`}
              aria-current={activeIndex === index ? 'page' : undefined}
            />
          ))}
        </nav>
      )}
    </>
  );
}
