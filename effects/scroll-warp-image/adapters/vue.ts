/*
 * Vue adapter for Spool. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createScrollWarpImage, scrollWarpImageDefaults, type ScrollWarpImageOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Spool = defineComponent({
  name: 'Spool',
  props: {
    paper: { type: String, default: scrollWarpImageDefaults.paper },
    bulge: { type: Number, default: scrollWarpImageDefaults.bulge },
    twist: { type: Number, default: scrollWarpImageDefaults.twist },
    squeeze: { type: Number, default: scrollWarpImageDefaults.squeeze },
    fringe: { type: Number, default: scrollWarpImageDefaults.fringe },
    vignette: { type: Number, default: scrollWarpImageDefaults.vignette },
    grain: { type: Number, default: scrollWarpImageDefaults.grain },
    range: { type: Number, default: scrollWarpImageDefaults.range },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createScrollWarpImage(host.value, props as Partial<ScrollWarpImageOptions>)
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
