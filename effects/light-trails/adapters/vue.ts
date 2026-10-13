/*
 * Vue adapter for LightTrails. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createLightTrails, lightTrailsDefaults, type LightTrailsOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const LightTrails = defineComponent({
  name: 'LightTrails',
  props: {
    period: { type: Number, default: lightTrailsDefaults.period },
    trails: { type: Number, default: lightTrailsDefaults.trails },
    lanes: { type: Number, default: lightTrailsDefaults.lanes },
    length: { type: Number, default: lightTrailsDefaults.length },
    weight: { type: Number, default: lightTrailsDefaults.weight },
    reach: { type: Number, default: lightTrailsDefaults.reach },
    away: { type: String, default: lightTrailsDefaults.away },
    toward: { type: String, default: lightTrailsDefaults.toward },
    night: { type: String, default: lightTrailsDefaults.night },
    height: { type: Number, default: lightTrailsDefaults.height },
    lens: { type: Number, default: lightTrailsDefaults.lens },
    seed: { type: Number, default: lightTrailsDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createLightTrails(host.value, props as Partial<LightTrailsOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update({ ...props } as Partial<LightTrailsOptions>)
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    return () => h('div', { ref: host })
  }
})

export default LightTrails
