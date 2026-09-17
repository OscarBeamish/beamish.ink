/*
 * Plate: Beamish
 * https://beamish.ink/components/image-gallery-lightbox
 *
 * Vue build of the contact sheet. Same decisions as the React one: the overlay
 * is a real <dialog> opened with showModal(), the neighbours are decoded ahead
 * of the arrow press, and autoplay ships with a pause control because WCAG
 * 2.2.2 is Level A the moment a thing advances on its own.
 */

import {
  computed,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType
} from 'vue'
import './styles.css'

export type ImageGalleryLightboxItem = {
  src: string
  /** What the picture shows. An empty string is legitimate, but deliberate. */
  alt: string
  /** Intrinsic pixel size, so the sheet reserves its cells before the files load. */
  width: number
  height: number
  caption?: string
  /** Full-size file, if the sheet is showing a smaller one. */
  full?: string
}

let uid = 0

export const Plate = defineComponent({
  name: 'Plate',
  props: {
    plates: { type: Array as PropType<ImageGalleryLightboxItem[]>, required: true },
    label: { type: String, default: 'Plates' },
    closeLabel: { type: String, default: 'Close' },
    columns: { type: Number, default: 3 },
    /** Seconds between plates when open. Zero is off, and off is the default. */
    autoplay: { type: Number, default: 0 },
    playLabel: { type: String, default: 'Play' },
    pauseLabel: { type: String, default: 'Pause' },
    /** Controlled mode. The index of the open plate, or null for closed. */
    open: { type: Number as PropType<number | null>, default: undefined }
  },
  emits: ['update:open'],
  setup(props, { emit }) {
    const dialog = ref<HTMLDialogElement | null>(null)
    const triggers = ref<Array<HTMLButtonElement | null>>([])
    const internalOpen = ref<number | null>(null)
    const playing = ref(false)
    const direction = ref(1)
    const reduced = ref(false)
    const titleId = `beamish-image-gallery-lightbox-${(uid += 1)}`
    const captionId = `${titleId}-caption`

    const index = computed(() => (props.open === undefined ? internalOpen.value : props.open))
    const isOpen = computed(() => index.value !== null && index.value !== undefined)
    const current = computed(() => (isOpen.value ? props.plates[index.value as number] : undefined))

    const setOpen = (next: number | null) => {
      if (props.open === undefined) internalOpen.value = next
      emit('update:open', next)
    }

    const go = (step: number) => {
      if (index.value === null || index.value === undefined) return
      direction.value = step < 0 ? -1 : 1
      // Wraps. A hard stop at each end makes you check whether you have reached
      // the end or whether the control is broken.
      setOpen((index.value + step + props.plates.length) % props.plates.length)
    }

    /*
     * Live, not read once. Someone can change the setting with the page open,
     * and a value captured at mount would be wrong for the rest of the session.
     */
    let query: MediaQueryList | null = null
    const onMotionChange = (event: MediaQueryListEvent) => {
      reduced.value = event.matches
    }

    onMounted(() => {
      query = window.matchMedia('(prefers-reduced-motion: reduce)')
      reduced.value = query.matches
      query.addEventListener('change', onMotionChange)
    })

    let previousOverflow = ''
    let timer = 0
    let lastIndex: number | null = null

    const stopTimer = () => {
      if (timer) window.clearInterval(timer)
      timer = 0
    }

    const syncTimer = () => {
      stopTimer()
      if (!isOpen.value || !playing.value || props.autoplay <= 0 || reduced.value) return
      // Skipped while the tab is in the background, where it would otherwise
      // burn through the whole set unseen.
      timer = window.setInterval(() => {
        if (!document.hidden) go(1)
      }, props.autoplay * 1000)
    }

    watch([playing, isOpen, reduced, () => props.autoplay], syncTimer)

    watch(isOpen, next => {
      const element = dialog.value
      if (element) {
        if (next && !element.open) element.showModal()
        if (!next && element.open) element.close()
      }

      /*
       * showModal() inerts the page but does not stop it scrolling behind the
       * overlay. Locking the root rather than the body avoids fighting anything
       * that positions itself off body.
       */
      const root = document.documentElement
      if (next) {
        previousOverflow = root.style.overflow
        root.style.overflow = 'hidden'
        return
      }

      root.style.overflow = previousOverflow
      // Never resumes on its own next time the overlay opens.
      playing.value = false
      /*
       * The browser restores focus to whatever was focused before showModal(),
       * which is right when you opened it from the sheet and wrong once you
       * have arrowed to a different plate: you want to come back to where you
       * are, not where you started.
       */
      const target = lastIndex === null ? null : triggers.value[lastIndex]
      target?.focus()
    })

    /*
     * Decode the neighbours while the reader is looking at this one. Without it
     * every arrow press is a visible blank, because the file only starts
     * downloading at the moment it is needed.
     */
    watch(index, next => {
      if (next === null || next === undefined) return
      lastIndex = next
      for (const step of [1, -1]) {
        const neighbour = props.plates[(next + step + props.plates.length) % props.plates.length]
        if (!neighbour) continue
        const image = new Image()
        image.src = neighbour.full ?? neighbour.src
      }
    })

    onBeforeUnmount(() => {
      stopTimer()
      query?.removeEventListener('change', onMotionChange)
      if (isOpen.value) document.documentElement.style.overflow = previousOverflow
    })

    let swipeStart: { x: number; y: number } | null = null

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        go(1)
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        go(-1)
      }
      if (event.key === 'Home') {
        event.preventDefault()
        direction.value = -1
        setOpen(0)
      }
      if (event.key === 'End') {
        event.preventDefault()
        direction.value = 1
        setOpen(props.plates.length - 1)
      }
    }

    const sr = (text: string) => h('span', { class: 'beamish-image-gallery-lightbox__sr' }, text)

    const renderSheet = () =>
      h(
        'ul',
        {
          class: 'beamish-image-gallery-lightbox__sheet',
          'aria-label': props.label,
          style: { '--plate-columns': String(props.columns) }
        },
        props.plates.map((plate, i) =>
          h(
            'li',
            {
              key: plate.src,
              class: 'beamish-image-gallery-lightbox__cell'
            },
            [
              h('figure', { class: 'beamish-image-gallery-lightbox__figure' }, [
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'beamish-image-gallery-lightbox__trigger',
                    'aria-haspopup': 'dialog',
                    ref: (element: unknown) => {
                      triggers.value[i] = (element as HTMLButtonElement) ?? null
                    },
                    onClick: () => {
                      direction.value = 1
                      setOpen(i)
                    }
                  },
                  [
                    h('img', {
                      class: 'beamish-image-gallery-lightbox__thumb',
                      src: plate.src,
                      alt: plate.alt,
                      width: plate.width,
                      height: plate.height,
                      // The first row is usually above the fold, and lazy-loading
                      // something already in view just delays it.
                      loading: i < props.columns ? 'eager' : 'lazy',
                      decoding: 'async'
                    }),
                    h(
                      'span',
                      { class: 'beamish-image-gallery-lightbox__number', 'aria-hidden': 'true' },
                      String(i + 1).padStart(2, '0')
                    )
                  ]
                ),
                plate.caption
                  ? h('figcaption', { class: 'beamish-image-gallery-lightbox__caption' }, plate.caption)
                  : null
              ])
            ]
          )
        )
      )

    const renderOpen = () => {
      const plate = current.value
      if (!plate) return null
      return h('figure', { class: 'beamish-image-gallery-lightbox__open' }, [
        h('img', {
          // Keyed by src so Vue swaps the element rather than patching it,
          // which is what lets the enter animation run on every move instead
          // of only the first.
          key: plate.full ?? plate.src,
          class: 'beamish-image-gallery-lightbox__image',
          src: plate.full ?? plate.src,
          alt: plate.alt,
          width: plate.width,
          height: plate.height,
          decoding: 'async'
        }),
        h('figcaption', { class: 'beamish-image-gallery-lightbox__bar' }, [
          h('span', { class: 'beamish-image-gallery-lightbox__count' }, [
            h(
              'span',
              { 'aria-hidden': 'true' },
              `${String((index.value as number) + 1).padStart(2, '0')} / ${String(
                props.plates.length
              ).padStart(2, '0')}`
            ),
            sr(`Plate ${(index.value as number) + 1} of ${props.plates.length}`)
          ]),
          plate.caption
            ? h('span', { class: 'beamish-image-gallery-lightbox__text', id: captionId }, plate.caption)
            : null
        ])
      ])
    }

    const renderControls = () =>
      h('div', { class: 'beamish-image-gallery-lightbox__controls' }, [
        h(
          'button',
          {
            type: 'button',
            class: 'beamish-image-gallery-lightbox__nav',
            'aria-label': 'Previous plate',
            onClick: () => go(-1)
          },
          [h('span', { 'aria-hidden': 'true' }, '←')]
        ),
        // Visible, not Escape-only. Escape is not discoverable, and on a touch
        // device it does not exist at all.
        h(
          'button',
          { type: 'button', class: 'beamish-image-gallery-lightbox__close', onClick: () => setOpen(null) },
          props.closeLabel
        ),
        /*
         * WCAG 2.2.2 is Level A: anything that moves for more than five seconds
         * needs a pause. Autoplay off means there is nothing to pause, so the
         * control is not rendered at all rather than sitting there doing
         * nothing.
         */
        props.autoplay > 0 && !reduced.value
          ? h(
              'button',
              {
                type: 'button',
                class: 'beamish-image-gallery-lightbox__play',
                'aria-pressed': String(playing.value),
                onClick: () => {
                  playing.value = !playing.value
                }
              },
              playing.value ? props.pauseLabel : props.playLabel
            )
          : null,
        h(
          'button',
          {
            type: 'button',
            class: 'beamish-image-gallery-lightbox__nav',
            'aria-label': 'Next plate',
            onClick: () => go(1)
          },
          [h('span', { 'aria-hidden': 'true' }, '→')]
        )
      ])

    return () => [
      renderSheet(),
      h(
        'dialog',
        {
          ref: dialog,
          class: 'beamish-image-gallery-lightbox',
          'aria-labelledby': titleId,
          'aria-describedby': current.value?.caption ? captionId : undefined,
          'data-direction': String(direction.value),
          onCancel: () => setOpen(null),
          onClose: () => setOpen(null),
          onKeydown: onKeyDown,
          // A backdrop click lands on the dialog element itself and never on
          // its children, which is the cheapest reliable outside-click test
          // there is.
          onClick: (event: MouseEvent) => {
            if (event.target === dialog.value) setOpen(null)
          }
        },
        [
          h('h2', { class: 'beamish-image-gallery-lightbox__sr', id: titleId }, props.label),
          h('div', { class: 'beamish-image-gallery-lightbox__inner' }, [
            h(
              'div',
              {
                class: 'beamish-image-gallery-lightbox__stage',
                /*
                 * Touch only. A pointerdown on a mouse is the start of a click,
                 * and treating a small drag as a swipe there makes the overlay
                 * feel like it is jumping about under the cursor.
                 */
                onPointerdown: (event: PointerEvent) => {
                  if (event.pointerType === 'mouse') return
                  swipeStart = { x: event.clientX, y: event.clientY }
                },
                onPointerup: (event: PointerEvent) => {
                  const start = swipeStart
                  swipeStart = null
                  if (!start) return
                  const dx = event.clientX - start.x
                  const dy = event.clientY - start.y
                  // Horizontal intent, not a scroll that happens to drift.
                  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return
                  go(dx < 0 ? 1 : -1)
                }
              },
              [renderOpen()]
            ),
            renderControls()
          ])
        ]
      )
    ]
  }
})

export default Plate
