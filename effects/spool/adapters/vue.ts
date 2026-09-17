/*
 * Vue adapter for Spool. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createSpool, spoolDefaults, type SpoolOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Spool = defineComponent({
  name: 'Spool',
  props: {
    paper: { type: String, default: spoolDefaults.paper },
    bend: { type: Number, default: spoolDefaults.bend },
    slip: { type: Number, default: spoolDefaults.slip },
    fringe: { type: Number, default: spoolDefaults.fringe },
    grain: { type: Number, default: spoolDefaults.grain },
    reference: { type: Number, default: spoolDefaults.reference },
    crossfade: { type: Number, default: spoolDefaults.crossfade },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createSpool(host.value, props as Partial<SpoolOptions>)
      if (props.autoStart) handle.start()
    })

    // Every option but `sheets` is a uniform or a camera value, so this is free.
    // Changing the count rebuilds the InstancedMesh; do not bind it to a drag.
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

export default Spool
