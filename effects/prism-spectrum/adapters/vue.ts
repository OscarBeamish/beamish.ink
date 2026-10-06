/*
 * Vue adapter for PrismSpectrum. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createPrismSpectrum, prismSpectrumDefaults, type PrismSpectrumOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const PrismSpectrum = defineComponent({
  name: 'PrismSpectrum',
  props: {
    background: { type: String, default: prismSpectrumDefaults.background },
    apex: { type: Number, default: prismSpectrumDefaults.apex },
    incidence: { type: Number, default: prismSpectrumDefaults.incidence },
    index: { type: Number, default: prismSpectrumDefaults.index },
    dispersion: { type: Number, default: prismSpectrumDefaults.dispersion },
    size: { type: Number, default: prismSpectrumDefaults.size },
    spread: { type: Number, default: prismSpectrumDefaults.spread },
    brightness: { type: Number, default: prismSpectrumDefaults.brightness },
    glass: { type: Number, default: prismSpectrumDefaults.glass },
    tilt: { type: Number, default: prismSpectrumDefaults.tilt },
    sway: { type: Number, default: prismSpectrumDefaults.sway },
    grain: { type: Number, default: prismSpectrumDefaults.grain },
    period: { type: Number, default: prismSpectrumDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createPrismSpectrum(host.value, props as Partial<PrismSpectrumOptions>)
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

export default PrismSpectrum
