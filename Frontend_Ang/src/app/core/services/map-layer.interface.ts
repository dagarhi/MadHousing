import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Contract every map-owning service must fulfill so `MapLayerManager` can
 * orchestrate attach/detach/visibility/cleanup uniformly across themes, modes
 * and style reloads.
 *
 * Lifecycle guarantee from the manager:
 *   register → attach → (setVisible | cached-data updates)* → detach → attach …
 *   → clear on teardown.
 *
 * After `attach(map)` the layer MUST be in its full visual state (sources +
 * layers + cached data pushed). `detach()` must leave cached data intact so
 * the next `attach()` restores the layer as it was — this is what makes
 * theme toggling work without re-fetching.
 */
export interface MapLayer {
  /** Stable key in the manager's registry. Not the MapLibre layer id. */
  readonly id: string;

  /**
   * Relative Z-order among registered layers. Lower = painted earlier
   * (underneath). The manager sorts ascending before calling `attach`.
   */
  readonly zIndex: number;

  /**
   * Idempotent. Adds sources + layers + handlers and pushes any cached data.
   * Safe to call on an already-attached layer (no-op or self-heal).
   */
  attach(map: MapLibreMap): void;

  /**
   * Removes sources + layers + handlers from the current map. Keeps cached
   * data so the next `attach()` can restore visuals (used on style reload).
   */
  detach(): void;

  setVisible(visible: boolean): void;

  /** detach + drop cached data. After this, attach() yields an empty layer. */
  clear(): void;
}
