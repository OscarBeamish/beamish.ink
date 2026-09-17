/*
 * The props the Contents demo panel is mounted with. Kept out of the panel
 * component so the demo's content is editable without touching mounting logic.
 */

export const props = {
  label: 'Index',
  sections: [
    {
      title: 'Backdrops',
      items: [
        { label: 'Overprint', href: '/effects/halftone-backdrop', meta: 'shader' },
        { label: 'Sundial', href: '/effects/cast-shadow-scene', meta: 'three' }
      ]
    },
    {
      title: 'Pointer',
      items: [{ label: 'Foil', href: '/effects/pointer-foil-sheen', meta: 'shader' }]
    },
    {
      title: 'Navigation',
      items: [
        { label: 'Contents', href: '/components/fullscreen-menu', meta: 'react · vue' },
        { label: 'Ember', href: '/components/glow-button', meta: 'react · vue' }
      ]
    }
  ]
}
