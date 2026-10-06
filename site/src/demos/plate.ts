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

const plate = (file: string, caption: string, alt: string, width: number, height: number) => ({
  src: `/plates/image-gallery-lightbox/${file}.jpg`,
  alt,
  width,
  height,
  caption
})

/*
 * Eight landscapes, no two alike. A gallery's job is to hold pictures somebody
 * wants to look at, and a grid of eight near-identical frames tells you nothing
 * about how it handles a set that varies.
 *
 * Four columns and eight plates, which is two complete rows inside the panel's
 * 16:9 stage. Three columns is the component's own default and it is the right
 * one for a page; here it would make cells so large that the second row is cut
 * in half, which reads as a bug rather than as a sheet that carries on.
 *
 * Autoplay is deliberately off. This panel sits in a page someone is reading,
 * and a gallery that starts moving on its own would take the plate they were
 * looking at away from them.
 */
export const props = {
  label: 'Plates',
  columns: 4,
  plates: [
    plate('01-dusk-lake', 'A lake below snow peaks at dusk', 'A photograph: a lake below snow peaks at dusk', 900, 600),
    plate('02-turquoise-peaks', 'A turquoise lake under cloud-covered peaks', 'A photograph: a turquoise lake under cloud-covered peaks', 900, 600),
    plate('03-still-water', 'Flat blue water running out to low hills', 'A photograph: flat blue water running out to low hills', 900, 1200),
    plate('04-lakeside-trees', 'Autumn larches round a still lake', 'A photograph: autumn larches round a still lake', 900, 600),
    plate('05-snow-ridge', 'A snow peak reflected between conifers', 'A photograph: a snow peak reflected between conifers', 900, 600),
    plate('06-glacier-lake', 'A glacial lake in flat morning light', 'A photograph: a glacial lake in flat morning light', 900, 1350),
    plate('07-alpine-meadow', 'Daisies above a lake on a green ridge', 'A photograph: daisies above a lake on a green ridge', 900, 600),
    plate('08-emerald-lake', 'An emerald lake under a flat-topped mountain', 'A photograph: an emerald lake under a flat-topped mountain', 900, 598)
  ]
}
