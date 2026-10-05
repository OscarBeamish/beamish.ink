/*
 * Vue adapter for Foil. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createPointerTrail, pointerTrailDefaults, type PointerTrailOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Foil = defineComponent({
  name: 'Foil',
  props: {
    paper: { type: String, default: pointerTrailDefaults.paper },
    ink: { type: String, default: pointerTrailDefaults.ink },
    accent: { type: String, default: pointerTrailDefaults.accent },
    marks: { type: Number, default: pointerTrailDefaults.marks },
    size: { type: Number, default: pointerTrailDefaults.size },
    spread: { type: Number, default: pointerTrailDefaults.spread },
    fade: { type: Number, default: pointerTrailDefaults.fade },
    edge: { type: Number, default: pointerTrailDefaults.edge },
    spacing: { type: Number, default: pointerTrailDefaults.spacing },
    grain: { type: Number, default: pointerTrailDefaults.grain },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createPointerTrail(host.value, props as Partial<PointerTrailOptions>)
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
