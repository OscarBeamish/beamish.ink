/*
 * Contents: Beamish
 * https://beamish.ink/components/contents
 *
 * Vue build of the full-viewport index. Same decision as the React one: the
 * overlay is a real <dialog> opened with showModal(), so the focus trap, Escape,
 * the top layer, inerting the page and returning focus to the trigger are all the
 * browser's job rather than ours.
 */

import { computed, defineComponent, h, onBeforeUnmount, ref, watch, type PropType } from 'vue'
import './styles.css'

export type ContentsItem = {
  label: string
  href: string
  meta?: string
}

export type ContentsSection = {
  title: string
  items: ContentsItem[]
}

let uid = 0

export const Contents = defineComponent({
  name: 'Contents',
  props: {
    sections: { type: Array as PropType<ContentsSection[]>, required: true },
    /** Trigger text and the dialog's accessible name. */
    label: { type: String, default: 'Index' },
    closeLabel: { type: String, default: 'Close' },
    /** Controlled mode. Leave undefined and the component manages its own state. */
    open: { type: Boolean, default: undefined }
  },
  emits: ['update:open'],
  setup(props, { emit, slots }) {
    const dialog = ref<HTMLDialogElement | null>(null)
    const internalOpen = ref(false)
    const titleId = `beamish-contents-${(uid += 1)}`

    const isOpen = computed(() => (props.open === undefined ? internalOpen.value : props.open))

    const setOpen = (next: boolean) => {
      if (props.open === undefined) internalOpen.value = next
      emit('update:open', next)
    }

    let previousOverflow = ''

    watch(isOpen, next => {
      const element = dialog.value
      if (!element) return
      if (next && !element.open) element.showModal()
      if (!next && element.open) element.close()

      /*
       * showModal() inerts the page but does not stop it scrolling behind the
       * overlay, which on a long index is disorienting.
       */
      const root = document.documentElement
      if (next) {
        previousOverflow = root.style.overflow
        root.style.overflow = 'hidden'
      } else {
        root.style.overflow = previousOverflow
      }
    })

    onBeforeUnmount(() => {
      document.documentElement.style.overflow = previousOverflow
    })

    return () => {
      let index = 0

      const trigger = h(
        'button',
        {
          type: 'button',
          class: 'beamish-contents__trigger',
          'aria-expanded': String(isOpen.value),
          'aria-haspopup': 'dialog',
          onClick: () => setOpen(true)
        },
        props.label
      )

      const overlay = h(
        'dialog',
        {
          ref: dialog,
          class: 'beamish-contents',
          'aria-labelledby': titleId,
          // Escape fires `cancel` before `close`; both are handled so state
          // cannot drift out of step when the browser closes it for us.
          onCancel: () => setOpen(false),
          onClose: () => setOpen(false),
          // A backdrop click lands on the dialog element itself, never on its
          // children, which is the cheapest reliable outside-click test there is.
          onClick: (event: MouseEvent) => {
            if (event.target === dialog.value) setOpen(false)
          }
        },
        [
          h('div', { class: 'beamish-contents__inner' }, [
            h('div', { class: 'beamish-contents__head' }, [
              h('h2', { class: 'beamish-contents__title', id: titleId }, props.label),
              h(
                'button',
                {
                  type: 'button',
                  class: 'beamish-contents__close',
                  onClick: () => setOpen(false)
                },
                props.closeLabel
              )
            ]),
            slots['default'] ? h('div', { class: 'beamish-contents__lede' }, slots['default']()) : null,
            h(
              'nav',
              { class: 'beamish-contents__nav', 'aria-label': props.label },
              props.sections.map(section =>
                h('section', { class: 'beamish-contents__section', key: section.title }, [
                  h('h3', { class: 'beamish-contents__heading' }, section.title),
                  h(
                    'ul',
                    { class: 'beamish-contents__list' },
                    section.items.map(item =>
                      h(
                        'li',
                        {
                          class: 'beamish-contents__item',
                          key: item.href,
                          // Drives the reveal stagger, counted across every
                          // section so the cascade reads as one movement.
                          style: { '--beamish-i': index++ }
                        },
                        h('a', { class: 'beamish-contents__link', href: item.href }, [
                          h('span', { class: 'beamish-contents__label' }, item.label),
                          item.meta ? h('span', { class: 'beamish-contents__meta' }, item.meta) : null
                        ])
                      )
                    )
                  )
                ])
              )
            )
          ])
        ]
      )

      return [trigger, overlay]
    }
  }
})

export default Contents
