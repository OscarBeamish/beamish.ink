/*
 * The props the Plate demo panel is mounted with. Kept out of the panel
 * component so the demo's content is editable without touching mounting logic.
 *
 * The plates are the library's own posters, which are already served from
 * /media for the item cards. That keeps the demo honest, since it is a sheet of
 * real images rather than six grey rectangles, and adds nothing to the build.
 *
 * Autoplay is deliberately off. This panel sits in a page someone is reading,
 * and a gallery that starts moving on its own would take the plate they were
 * looking at away from them. The option's own page is where it is documented.
 */

const plate = (slug: string, caption: string) => ({
  src: `/media/${slug}/poster.jpg`,
  alt: `A still from the ${caption} effect`,
  width: 1440,
  height: 810,
  caption
})

/*
 * Four columns and eight plates, which is two complete rows inside the panel's
 * 16:9 stage. Three columns is the component's own default and it is the right
 * one for a page; here it would make cells so large that the second row is cut
 * in half, which reads as a bug rather than as a sheet that carries on.
 */
export const props = {
  label: 'Plates',
  columns: 4,
  plates: [
    plate('overprint', 'Overprint'),
    plate('guilloche', 'Guilloche'),
    plate('contour', 'Contour'),
    plate('sundial', 'Sundial'),
    plate('foil', 'Foil'),
    plate('swell', 'Swell'),
    plate('magnet', 'Magnet'),
    plate('tilt', 'Tilt')
  ]
}
