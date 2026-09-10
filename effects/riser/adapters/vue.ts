/*
 * Vue adapter for Riser. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createRiser, riserDefaults, type RiserOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Riser = defineComponent({
  name: 'Riser',
  props: {
    select: { type: String, default: riserDefaults.select },
    order: { type: String as () => RiserOptions['order'], default: riserDefaults.order },
    stagger: { type: Number, default: riserDefaults.stagger },
    duration: { type: Number, default: riserDefaults.duration },
    rise: { type: Number, default: riserDefaults.rise },
    scale: { type: Number, default: riserDefaults.scale },
    blur: { type: Number, default: riserDefaults.blur },
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
      handle = createRiser(host.value, props as Partial<RiserOptions>)
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
