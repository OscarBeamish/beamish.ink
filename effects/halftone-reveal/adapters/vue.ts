/*
 * Vue adapter for Spool. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createHalftoneReveal, halftoneRevealDefaults, type HalftoneRevealOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Spool = defineComponent({
  name: 'Spool',
  props: {
    paper: { type: String, default: halftoneRevealDefaults.paper },
    screen: { type: Number, default: halftoneRevealDefaults.screen },
    angle: { type: Number, default: halftoneRevealDefaults.angle },
    sweep: { type: Number, default: halftoneRevealDefaults.sweep },
    scatter: { type: Number, default: halftoneRevealDefaults.scatter },
    feather: { type: Number, default: halftoneRevealDefaults.feather },
    grain: { type: Number, default: halftoneRevealDefaults.grain },
    duration: { type: Number, default: halftoneRevealDefaults.duration },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createHalftoneReveal(host.value, props as Partial<HalftoneRevealOptions>)
      if (props.autoStart) handle.start()
    })

    // Every option but `sheets` is a uniform or a camera value, so this is free.
    // Changing the count rebuilds the InstancedMesh; do not bind it to a drag.
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

export default Spool
