/*
 * Vue adapter for MeshGradient. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createMeshGradient, meshGradientDefaults, type MeshGradientOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const MeshGradient = defineComponent({
  name: 'MeshGradient',
  props: {
    base: { type: String, default: meshGradientDefaults.base },
    one: { type: String, default: meshGradientDefaults.one },
    two: { type: String, default: meshGradientDefaults.two },
    three: { type: String, default: meshGradientDefaults.three },
    scale: { type: Number, default: meshGradientDefaults.scale },
    warp: { type: Number, default: meshGradientDefaults.warp },
    softness: { type: Number, default: meshGradientDefaults.softness },
    relief: { type: Number, default: meshGradientDefaults.relief },
    grain: { type: Number, default: meshGradientDefaults.grain },
    period: { type: Number, default: meshGradientDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createMeshGradient(host.value, props as Partial<MeshGradientOptions>)
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

export default MeshGradient
