/*
 * Vue adapter for LightningVein. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createLightningVein, lightningVeinDefaults, type LightningVeinOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const LightningVein = defineComponent({
  name: 'LightningVein',
  props: {
    sky: { type: String, default: lightningVeinDefaults.sky },
    bolt: { type: String, default: lightningVeinDefaults.bolt },
    halo: { type: String, default: lightningVeinDefaults.halo },
    period: { type: Number, default: lightningVeinDefaults.period },
    lean: { type: Number, default: lightningVeinDefaults.lean },
    jitter: { type: Number, default: lightningVeinDefaults.jitter },
    detail: { type: Number, default: lightningVeinDefaults.detail },
    branches: { type: Number, default: lightningVeinDefaults.branches },
    weight: { type: Number, default: lightningVeinDefaults.weight },
    afterglow: { type: Number, default: lightningVeinDefaults.afterglow },
    seed: { type: Number, default: lightningVeinDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createLightningVein(host.value, props as Partial<LightningVeinOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    // The element needs a height from your own CSS. A backdrop in a
    // zero-height box builds its canvas, draws nothing, and says nothing.
    return () => h('div', { ref: host })
  }
})

export default LightningVein
