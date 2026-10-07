/*
 * Vue adapter for MoireScreens. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createMoireScreens, moireScreensDefaults, type MoireScreensOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const MoireScreens = defineComponent({
  name: 'MoireScreens',
  props: {
    paper: { type: String, default: moireScreensDefaults.paper },
    first: { type: String, default: moireScreensDefaults.first },
    second: { type: String, default: moireScreensDefaults.second },
    pitch: { type: Number, default: moireScreensDefaults.pitch },
    coverage: { type: Number, default: moireScreensDefaults.coverage },
    separation: { type: Number, default: moireScreensDefaults.separation },
    angle: { type: Number, default: moireScreensDefaults.angle },
    drift: { type: Number, default: moireScreensDefaults.drift },
    lines: { type: Boolean, default: moireScreensDefaults.lines },
    detune: { type: Number, default: moireScreensDefaults.detune },
    period: { type: Number, default: moireScreensDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createMoireScreens(host.value, props as Partial<MoireScreensOptions>)
      if (props.autoStart) handle.start()
    })

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

export default MoireScreens
