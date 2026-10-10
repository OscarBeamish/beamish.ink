/*
 * Vue adapter for PanelGauge. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createPanelGauge, panelGaugeDefaults, type PanelGaugeOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const PanelGauge = defineComponent({
  name: 'PanelGauge',
  props: {
    face: { type: String, default: panelGaugeDefaults.face },
    ink: { type: String, default: panelGaugeDefaults.ink },
    needle: { type: String, default: panelGaugeDefaults.needle },
    lit: { type: String, default: panelGaugeDefaults.lit },
    value: { type: Number, default: panelGaugeDefaults.value },
    hunt: { type: Number, default: panelGaugeDefaults.hunt },
    sweep: { type: Number, default: panelGaugeDefaults.sweep },
    majors: { type: Number, default: panelGaugeDefaults.majors },
    minors: { type: Number, default: panelGaugeDefaults.minors },
    period: { type: Number, default: panelGaugeDefaults.period },
    seed: { type: Number, default: panelGaugeDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createPanelGauge(host.value, props as Partial<PanelGaugeOptions>)
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

export default PanelGauge
