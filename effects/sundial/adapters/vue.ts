/*
 * Vue adapter for Sundial. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createSundial, sundialDefaults, type SundialOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Sundial = defineComponent({
  name: 'Sundial',
  props: {
    paper: { type: String, default: sundialDefaults.paper },
    stone: { type: String, default: sundialDefaults.stone },
    accent: { type: String, default: sundialDefaults.accent },
    elevation: { type: Number, default: sundialDefaults.elevation },
    softness: { type: Number, default: sundialDefaults.softness },
    shadow: { type: Number, default: sundialDefaults.shadow },
    zoom: { type: Number, default: sundialDefaults.zoom },
    tilt: { type: Number, default: sundialDefaults.tilt },
    period: { type: Number, default: sundialDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createSundial(host.value, props as Partial<SundialOptions>)
      if (props.autoStart) handle.start()
    })

    // Pushes changed options into the running scene rather than remounting it.
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

export default Sundial
