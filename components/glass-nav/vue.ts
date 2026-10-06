/*
 * Crossbar: Beamish
 * https://beamish.ink/components/glass-nav
 *
 * The Vue twin of react.tsx. The glass itself lives in glass.ts, which both
 * import, so the two cannot drift apart.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, type PropType, type VNode } from 'vue'
import { watchSettle, attachRefraction } from './glass'
import './styles.css'

export type GlassNavItem = {
  label: string
  href: string
  current?: boolean
}

export const Crossbar = defineComponent({
  name: 'Crossbar',
  props: {
    items: { type: Array as PropType<GlassNavItem[]>, required: true },
    brand: { type: String, default: '' },
    brandHref: { type: String, default: '/' },
    settleOver: { type: Number, default: 120 },
    blur: { type: Number, default: 14 },
    tint: { type: Number, default: 0.55 },
    refract: { type: Boolean, default: true },
    refraction: { type: Number, default: 18 },
    label: { type: String, default: 'Main' }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let stopSettle: (() => void) | null = null
    let stopRefraction: (() => void) | null = null

    onMounted(() => {
      if (!host.value) return
      stopSettle = watchSettle(host.value, props.settleOver)
      if (props.refract && !window.matchMedia('(prefers-reduced-transparency: reduce)').matches) {
        stopRefraction = attachRefraction(host.value, props.refraction, 100)
      }
    })

    onBeforeUnmount(() => {
      stopSettle?.()
      stopRefraction?.()
      stopSettle = null
      stopRefraction = null
    })

    return () =>
      h(
        'nav',
        {
          ref: host,
          'aria-label': props.label,
          class: 'beamish-glass-nav',
          style: {
            '--crossbar-blur': `${props.blur}px`,
            '--crossbar-tint': String(props.tint)
          }
        },
        [
          props.brand
            ? h('a', { class: 'beamish-glass-nav__brand', href: props.brandHref }, props.brand)
            : null,
          h(
            'ul',
            { class: 'beamish-glass-nav__list' },
            props.items.map(item =>
              h('li', { key: item.href }, [
                h(
                  'a',
                  {
                    class: 'beamish-glass-nav__link',
                    href: item.href,
                    'aria-current': item.current ? 'page' : undefined
                  },
                  item.label
                )
              ])
            )
          ),
          slots['default']?.() as VNode[] | undefined
        ]
      )
  }
})

export default Crossbar
