/*
 * Vue adapter for ScrollMarquee. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createScrollMarquee, scrollMarqueeDefaults, type ScrollMarqueeOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const ScrollMarquee = defineComponent({
  name: 'ScrollMarquee',
  props: {
    period: { type: Number, default: scrollMarqueeDefaults.period },
    direction: { type: Number, default: scrollMarqueeDefaults.direction },
    drag: { type: Number, default: scrollMarqueeDefaults.drag },
    skew: { type: Number, default: scrollMarqueeDefaults.skew },
    stretch: { type: Number, default: scrollMarqueeDefaults.stretch },
    reference: { type: Number, default: scrollMarqueeDefaults.reference },
    gap: { type: Number, default: scrollMarqueeDefaults.gap },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createScrollMarquee(host.value, props as Partial<ScrollMarqueeOptions>)
      if (props.autoStart) handle.start()
    })

    // Pushes changed options into the running effect rather than remounting it.
    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    return () => h('div', { ref: host }, slots['default']?.())
  }
})

export default ScrollMarquee
