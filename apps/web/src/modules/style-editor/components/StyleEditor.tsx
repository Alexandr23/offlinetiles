import { Collapsible } from '@/shared/components/Collapsible';
import { ColorPicker } from '@/shared/components/ColorPicker';
import { PropertyRow, SliderPropertyRow } from '@/shared/components/PropertyRow';
import { Slider } from '@/shared/components/Slider';
import { Switch } from '@/shared/components/Switch';
import { useStyleStore } from '../style.store';

/**
 * Property-row based editor over the well-known layer groups.
 * Every change goes through the store, which produces a new style → MapLibre diff.
 */
export function StyleEditor() {
  const params = useStyleStore((s) => s.params);
  const update = useStyleStore((s) => s.updateParam);

  return (
    <div>
      <Collapsible title="Background" defaultOpen>
        <PropertyRow label="Color">
          <ColorPicker value={params.background.color} onChange={(v) => update({ section: 'background', key: 'color', value: v })} aria-label="Background color" />
        </PropertyRow>
      </Collapsible>

      <Collapsible title="Water" defaultOpen>
        <PropertyRow label="Color">
          <ColorPicker value={params.water.color} onChange={(v) => update({ section: 'water', key: 'color', value: v })} aria-label="Water color" />
        </PropertyRow>
      </Collapsible>

      <Collapsible title="Land">
        <PropertyRow label="Color">
          <ColorPicker value={params.land.color} onChange={(v) => update({ section: 'land', key: 'color', value: v })} aria-label="Land color" />
        </PropertyRow>
      </Collapsible>

      <Collapsible title="Parks" meta={params.parks.visible ? undefined : 'hidden'}>
        <PropertyRow label="Color">
          <ColorPicker value={params.parks.color} onChange={(v) => update({ section: 'parks', key: 'color', value: v })} aria-label="Park color" />
        </PropertyRow>
        <PropertyRow label="Visible">
          <Switch checked={params.parks.visible} onChange={(v) => update({ section: 'parks', key: 'visible', value: v })} aria-label="Parks visible" />
        </PropertyRow>
      </Collapsible>

      <Collapsible title="Buildings" meta={params.buildings.visible ? undefined : 'hidden'}>
        <PropertyRow label="Color">
          <ColorPicker value={params.buildings.color} onChange={(v) => update({ section: 'buildings', key: 'color', value: v })} aria-label="Building color" />
        </PropertyRow>
        <SliderPropertyRow label="Opacity" value={`${Math.round(params.buildings.opacity * 100)}%`}>
          <Slider min={0} max={1} step={0.05} value={params.buildings.opacity} onChange={(v) => update({ section: 'buildings', key: 'opacity', value: v })} aria-label="Building opacity" />
        </SliderPropertyRow>
        <PropertyRow label="Visible">
          <Switch checked={params.buildings.visible} onChange={(v) => update({ section: 'buildings', key: 'visible', value: v })} aria-label="Buildings visible" />
        </PropertyRow>
      </Collapsible>

      <Collapsible title="Roads" defaultOpen meta={params.roads.visible ? `${params.roads.widthScale.toFixed(1)}×` : 'hidden'}>
        <PropertyRow label="Motorway">
          <ColorPicker value={params.roads.motorway} onChange={(v) => update({ section: 'roads', key: 'motorway', value: v })} aria-label="Motorway color" />
        </PropertyRow>
        <PropertyRow label="Primary">
          <ColorPicker value={params.roads.primary} onChange={(v) => update({ section: 'roads', key: 'primary', value: v })} aria-label="Primary road color" />
        </PropertyRow>
        <PropertyRow label="Secondary">
          <ColorPicker value={params.roads.secondary} onChange={(v) => update({ section: 'roads', key: 'secondary', value: v })} aria-label="Secondary road color" />
        </PropertyRow>
        <SliderPropertyRow label="Width" value={`${params.roads.widthScale.toFixed(1)}×`}>
          <Slider min={0.4} max={2.5} step={0.1} value={params.roads.widthScale} onChange={(v) => update({ section: 'roads', key: 'widthScale', value: v })} aria-label="Road width scale" />
        </SliderPropertyRow>
        <PropertyRow label="Visible">
          <Switch checked={params.roads.visible} onChange={(v) => update({ section: 'roads', key: 'visible', value: v })} aria-label="Roads visible" />
        </PropertyRow>
      </Collapsible>

      <Collapsible title="Boundaries" meta={params.boundaries.visible ? undefined : 'hidden'}>
        <PropertyRow label="Color">
          <ColorPicker value={params.boundaries.color} onChange={(v) => update({ section: 'boundaries', key: 'color', value: v })} aria-label="Boundary color" />
        </PropertyRow>
        <PropertyRow label="Visible">
          <Switch checked={params.boundaries.visible} onChange={(v) => update({ section: 'boundaries', key: 'visible', value: v })} aria-label="Boundaries visible" />
        </PropertyRow>
      </Collapsible>

      <Collapsible title="Labels" defaultOpen meta={params.labels.visible ? `${params.labels.sizeScale.toFixed(1)}×` : 'hidden'}>
        <PropertyRow label="Countries">
          <Switch size="sm" checked={params.labels.countries} onChange={(v) => update({ section: 'labels', key: 'countries', value: v })} aria-label="Country labels" />
        </PropertyRow>
        <PropertyRow label="Cities">
          <Switch size="sm" checked={params.labels.cities} onChange={(v) => update({ section: 'labels', key: 'cities', value: v })} aria-label="City labels" />
        </PropertyRow>
        <PropertyRow label="Roads">
          <Switch size="sm" checked={params.labels.roads} onChange={(v) => update({ section: 'labels', key: 'roads', value: v })} aria-label="Road labels" />
        </PropertyRow>
        <PropertyRow label="POIs">
          <Switch size="sm" checked={params.labels.pois} onChange={(v) => update({ section: 'labels', key: 'pois', value: v })} aria-label="POI labels" />
        </PropertyRow>
        <PropertyRow label="Color">
          <ColorPicker value={params.labels.color} onChange={(v) => update({ section: 'labels', key: 'color', value: v })} aria-label="Label color" />
        </PropertyRow>
        <SliderPropertyRow label="Size" value={`${params.labels.sizeScale.toFixed(1)}×`}>
          <Slider min={0.6} max={1.8} step={0.1} value={params.labels.sizeScale} onChange={(v) => update({ section: 'labels', key: 'sizeScale', value: v })} aria-label="Label size scale" />
        </SliderPropertyRow>
        <PropertyRow label="All labels">
          <Switch checked={params.labels.visible} onChange={(v) => update({ section: 'labels', key: 'visible', value: v })} aria-label="All labels visible" />
        </PropertyRow>
      </Collapsible>
    </div>
  );
}
