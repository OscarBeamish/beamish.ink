/*
 * Pane: Beamish
 * https://beamish.ink/components/glass-modal
 *
 * The Vue twin of react.tsx. The glass itself lives in glass.ts, which both
 * import, so the two cannot drift apart.
 */

import { defineComponent, h, onBeforeUnmount, ref, watch, type VNode } from 'vue'
import { attachRefraction } from './glass'
import './styles.css'

export const Pane = defineComponent({
  name: 'Pane',
  props: {
    open: { type: Boolean, default: false },
    title: { type: String, required: true },
    blur: { type: Number, default: 18 },
    tint: { type: Number, default: 0.72 },
    refract: { type: Boolean, default: true },
    refraction: { type: Number, default: 22 },
    lightDismiss: { type: Boolean, default: true },
    closeLabel: { type: String, default: 'Close' }
  },
  emits: ['close'],
  setup(props, { slots, emit }) {
    const dialog = ref<HTMLDialogElement | null>(null)
    let stopRefraction: (() => void) | null = null
    let previousOverflow = ''

    const dismiss = () => {
      const el = dialog.value
      if (!el || !el.open) return
      el.classList.add('beamish-glass-modal--leaving')
      const done = () => {
        el.classList.remove('beamish-glass-modal--leaving')
        el.close()
      }
      el.addEventListener('animationend', done, { once: true })
      setTimeout(() => {
        if (el.classList.contains('beamish-glass-modal--leaving')) done()
      }, 400)
    }

    watch(
      () => props.open,
      isOpen => {
        const el = dialog.value
        if (!el) return

        if (isOpen && !el.open) {
          el.showModal()
          // showModal makes the document inert but does not stop it scrolling.
          previousOverflow = document.body.style.overflow
          document.body.style.overflow = 'hidden'
          if (
            props.refract &&
            !window.matchMedia('(prefers-reduced-transparency: reduce)').matches
          ) {
            stopRefraction = attachRefraction(el, props.refraction, 20)
          }
        }

        if (!isOpen && el.open) {
          dismiss()
          document.body.style.overflow = previousOverflow
          stopRefraction?.()
          stopRefraction = null
        }
      },
      { flush: 'post' }
    )

    onBeforeUnmount(() => {
      stopRefraction?.()
      stopRefraction = null
      document.body.style.overflow = previousOverflow
    })

    return () =>
      h(
        'dialog',
        {
          ref: dialog,
          class: 'beamish-glass-modal',
          'aria-labelledby': 'beamish-glass-modal-title',
          style: { '--pane-blur': `${props.blur}px`, '--pane-tint': String(props.tint) },
          onCancel: (event: Event) => {
            event.preventDefault()
            emit('close')
          },
          onClick: (event: MouseEvent) => {
            if (!props.lightDismiss) return
            const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
            const outside =
              event.clientX < box.left ||
              event.clientX > box.right ||
              event.clientY < box.top ||
              event.clientY > box.bottom
            if (outside) emit('close')
          }
        },
        [
          h('div', { class: 'beamish-glass-modal__head' }, [
            h(
              'h2',
              { class: 'beamish-glass-modal__title', id: 'beamish-glass-modal-title' },
              props.title
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'beamish-glass-modal__close',
                'aria-label': props.closeLabel,
                onClick: () => emit('close')
              },
              [h('span', { 'aria-hidden': 'true' }, '×')]
            )
          ]),
          h('div', { class: 'beamish-glass-modal__body' }, slots['default']?.() as VNode[] | undefined)
        ]
      )
  }
})

export default Pane
