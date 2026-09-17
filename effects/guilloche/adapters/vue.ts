/*
 * Vue adapter for Guilloche. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createGuilloche, guillocheDefaults, type GuillocheOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Guilloche = defineComponent({
  name: 'Guilloche',
  props: {
    paper: { type: String, default: guillocheDefaults.paper },
    ink: { type: String, default: guillocheDefaults.ink },
    accent: { type: String, default: guillocheDefaults.accent },
    scale: { type: Number, default: guillocheDefaults.scale },
    pitch: { type: Number, default: guillocheDefaults.pitch },
    lobes: { type: Number, default: guillocheDefaults.lobes },
    waves: { type: Number, default: guillocheDefaults.waves },
    depth: { type: Number, default: guillocheDefaults.depth },
    weight: { type: Number, default: guillocheDefaults.weight },
    accentBand: { type: Number, default: guillocheDefaults.accentBand },
    grain: { type: Number, default: guillocheDefaults.grain },
    period: { type: Number, default: guillocheDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createGuilloche(host.value, props as Partial<GuillocheOptions>)
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
