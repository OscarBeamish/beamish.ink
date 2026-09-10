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
        { label: 'Overprint', href: '/effects/overprint', meta: 'shader' },
        { label: 'Sundial', href: '/effects/sundial', meta: 'three' }
      ]
    },
    {
      title: 'Pointer',
      items: [{ label: 'Foil', href: '/effects/foil', meta: 'shader' }]
    },
    {
      title: 'Navigation',
      items: [
        { label: 'Contents', href: '/components/contents', meta: 'react · vue' },
        { label: 'Ember', href: '/components/ember', meta: 'react · vue' }
      ]
    }
  ]
}
