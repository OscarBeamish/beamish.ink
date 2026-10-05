/*
 * Vue adapter for Foil. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createPointerFilings, pointerFilingsDefaults, type PointerFilingsOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Foil = defineComponent({
  name: 'Foil',
  props: {
    paper: { type: String, default: pointerFilingsDefaults.paper },
    ink: { type: String, default: pointerFilingsDefaults.ink },
    accent: { type: String, default: pointerFilingsDefaults.accent },
    pitch: { type: Number, default: pointerFilingsDefaults.pitch },
    length: { type: Number, default: pointerFilingsDefaults.length },
    weight: { type: Number, default: pointerFilingsDefaults.weight },
    reach: { type: Number, default: pointerFilingsDefaults.reach },
    jitter: { type: Number, default: pointerFilingsDefaults.jitter },
    tilt: { type: Number, default: pointerFilingsDefaults.tilt },
    grain: { type: Number, default: pointerFilingsDefaults.grain },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createPointerFilings(host.value, props as Partial<PointerFilingsOptions>)
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

export default Foil
