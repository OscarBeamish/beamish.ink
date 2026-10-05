/*
 * Vue adapter for Guilloche. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createWatermarkSheet, watermarkSheetDefaults, type WatermarkSheetOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Guilloche = defineComponent({
  name: 'Guilloche',
  props: {
    paper: { type: String, default: watermarkSheetDefaults.paper },
    light: { type: String, default: watermarkSheetDefaults.light },
    laid: { type: Number, default: watermarkSheetDefaults.laid },
    laidPitch: { type: Number, default: watermarkSheetDefaults.laidPitch },
    chain: { type: Number, default: watermarkSheetDefaults.chain },
    chainPitch: { type: Number, default: watermarkSheetDefaults.chainPitch },
    formation: { type: Number, default: watermarkSheetDefaults.formation },
    cloud: { type: Number, default: watermarkSheetDefaults.cloud },
    device: { type: Number, default: watermarkSheetDefaults.device },
    deviceSize: { type: Number, default: watermarkSheetDefaults.deviceSize },
    angle: { type: Number, default: watermarkSheetDefaults.angle },
    grain: { type: Number, default: watermarkSheetDefaults.grain },
    period: { type: Number, default: watermarkSheetDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createWatermarkSheet(host.value, props as Partial<WatermarkSheetOptions>)
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

export default Guilloche
