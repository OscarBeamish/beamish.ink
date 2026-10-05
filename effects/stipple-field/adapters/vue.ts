/*
 * Vue adapter for Guilloche. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createStippleField, stippleFieldDefaults, type StippleFieldOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Guilloche = defineComponent({
  name: 'Guilloche',
  props: {
    paper: { type: String, default: stippleFieldDefaults.paper },
    ink: { type: String, default: stippleFieldDefaults.ink },
    accent: { type: String, default: stippleFieldDefaults.accent },
    pitch: { type: Number, default: stippleFieldDefaults.pitch },
    jitter: { type: Number, default: stippleFieldDefaults.jitter },
    scale: { type: Number, default: stippleFieldDefaults.scale },
    weight: { type: Number, default: stippleFieldDefaults.weight },
    contrast: { type: Number, default: stippleFieldDefaults.contrast },
    accentShare: { type: Number, default: stippleFieldDefaults.accentShare },
    grain: { type: Number, default: stippleFieldDefaults.grain },
    period: { type: Number, default: stippleFieldDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createStippleField(host.value, props as Partial<StippleFieldOptions>)
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
