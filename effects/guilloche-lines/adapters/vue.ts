/*
 * Vue adapter for Guilloche. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createGuillocheLines, guillocheLinesDefaults, type GuillocheLinesOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Guilloche = defineComponent({
  name: 'Guilloche',
  props: {
    paper: { type: String, default: guillocheLinesDefaults.paper },
    ink: { type: String, default: guillocheLinesDefaults.ink },
    accent: { type: String, default: guillocheLinesDefaults.accent },
    scale: { type: Number, default: guillocheLinesDefaults.scale },
    pitch: { type: Number, default: guillocheLinesDefaults.pitch },
    lobes: { type: Number, default: guillocheLinesDefaults.lobes },
    waves: { type: Number, default: guillocheLinesDefaults.waves },
    depth: { type: Number, default: guillocheLinesDefaults.depth },
    weight: { type: Number, default: guillocheLinesDefaults.weight },
    accentBand: { type: Number, default: guillocheLinesDefaults.accentBand },
    grain: { type: Number, default: guillocheLinesDefaults.grain },
    period: { type: Number, default: guillocheLinesDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createGuillocheLines(host.value, props as Partial<GuillocheLinesOptions>)
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
