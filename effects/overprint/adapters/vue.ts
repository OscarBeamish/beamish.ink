/*
 * Vue adapter for Overprint. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createOverprint, overprintDefaults, type OverprintOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Overprint = defineComponent({
  name: 'Overprint',
  props: {
    paper: { type: String, default: overprintDefaults.paper },
    inkA: { type: String, default: overprintDefaults.inkA },
    inkB: { type: String, default: overprintDefaults.inkB },
    scale: { type: Number, default: overprintDefaults.scale },
    screen: { type: Number, default: overprintDefaults.screen },
    angleA: { type: Number, default: overprintDefaults.angleA },
    angleB: { type: Number, default: overprintDefaults.angleB },
    drift: { type: Number, default: overprintDefaults.drift },
    coverage: { type: Number, default: overprintDefaults.coverage },
    grain: { type: Number, default: overprintDefaults.grain },
    period: { type: Number, default: overprintDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createOverprint(host.value, props as Partial<OverprintOptions>)
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
