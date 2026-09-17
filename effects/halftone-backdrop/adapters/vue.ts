/*
 * Vue adapter for Overprint. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createHalftoneBackdrop, halftoneBackdropDefaults, type HalftoneBackdropOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Overprint = defineComponent({
  name: 'Overprint',
  props: {
    paper: { type: String, default: halftoneBackdropDefaults.paper },
    inkA: { type: String, default: halftoneBackdropDefaults.inkA },
    inkB: { type: String, default: halftoneBackdropDefaults.inkB },
    scale: { type: Number, default: halftoneBackdropDefaults.scale },
    screen: { type: Number, default: halftoneBackdropDefaults.screen },
    angleA: { type: Number, default: halftoneBackdropDefaults.angleA },
    angleB: { type: Number, default: halftoneBackdropDefaults.angleB },
    drift: { type: Number, default: halftoneBackdropDefaults.drift },
    coverage: { type: Number, default: halftoneBackdropDefaults.coverage },
    grain: { type: Number, default: halftoneBackdropDefaults.grain },
    period: { type: Number, default: halftoneBackdropDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createHalftoneBackdrop(host.value, props as Partial<HalftoneBackdropOptions>)
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

    return () => h('div', { ref: host })
  }
})

export default Overprint
