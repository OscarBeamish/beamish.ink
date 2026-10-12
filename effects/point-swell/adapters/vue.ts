/*
 * Vue adapter for PointSwell. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createPointSwell, pointSwellDefaults, type PointSwellOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const PointSwell = defineComponent({
  name: 'PointSwell',
  props: {
    background: { type: String, default: pointSwellDefaults.background },
    colorLow: { type: String, default: pointSwellDefaults.colorLow },
    colorHigh: { type: String, default: pointSwellDefaults.colorHigh },
    density: { type: Number, default: pointSwellDefaults.density },
    pointSize: { type: Number, default: pointSwellDefaults.pointSize },
    opacity: { type: Number, default: pointSwellDefaults.opacity },
    swell: { type: Number, default: pointSwellDefaults.swell },
    scale: { type: Number, default: pointSwellDefaults.scale },
    waves: { type: Number, default: pointSwellDefaults.waves },
    dive: { type: Number, default: pointSwellDefaults.dive },
    parallax: { type: Number, default: pointSwellDefaults.parallax },
    period: { type: Number, default: pointSwellDefaults.period },
    seed: { type: Number, default: pointSwellDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createPointSwell(host.value, props as Partial<PointSwellOptions>)
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

export default PointSwell
