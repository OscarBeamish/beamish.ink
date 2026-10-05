/*
 * Vue adapter for Plume. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createPointerSmoke, pointerSmokeDefaults, type PointerSmokeOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Plume = defineComponent({
  name: 'Plume',
  props: {
    paper: { type: String, default: pointerSmokeDefaults.paper },
    smoke: { type: String, default: pointerSmokeDefaults.smoke },
    accent: { type: String, default: pointerSmokeDefaults.accent },
    marks: { type: Number, default: pointerSmokeDefaults.marks },
    size: { type: Number, default: pointerSmokeDefaults.size },
    spread: { type: Number, default: pointerSmokeDefaults.spread },
    fade: { type: Number, default: pointerSmokeDefaults.fade },
    edge: { type: Number, default: pointerSmokeDefaults.edge },
    life: { type: Number, default: pointerSmokeDefaults.life },
    grain: { type: Number, default: pointerSmokeDefaults.grain },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createPointerSmoke(host.value, props as Partial<PointerSmokeOptions>)
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

export default Plume
