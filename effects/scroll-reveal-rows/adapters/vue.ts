/*
 * Vue adapter for Riser. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createScrollRevealRows, scrollRevealRowsDefaults, type ScrollRevealRowsOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Riser = defineComponent({
  name: 'Riser',
  props: {
    select: { type: String, default: scrollRevealRowsDefaults.select },
    order: { type: String as () => ScrollRevealRowsOptions['order'], default: scrollRevealRowsDefaults.order },
    stagger: { type: Number, default: scrollRevealRowsDefaults.stagger },
    duration: { type: Number, default: scrollRevealRowsDefaults.duration },
    rise: { type: Number, default: scrollRevealRowsDefaults.rise },
    scale: { type: Number, default: scrollRevealRowsDefaults.scale },
    blur: { type: Number, default: scrollRevealRowsDefaults.blur },
    /**
     * Change this when the children change. The selection is taken on the first
     * frame, so a list that arrives later needs a remount.
     */
    resetKey: { type: [String, Number], default: 0 },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createScrollRevealRows(host.value, props as Partial<ScrollRevealRowsOptions>)
      if (props.autoStart) handle.start()
    }

    onMounted(build)
    watch(() => props.resetKey, build)

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

export default Riser
