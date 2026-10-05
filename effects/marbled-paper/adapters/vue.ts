/*
 * Vue adapter for Guilloche. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createMarbledPaper, marbledPaperDefaults, type MarbledPaperOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Guilloche = defineComponent({
  name: 'Guilloche',
  props: {
    paper: { type: String, default: marbledPaperDefaults.paper },
    ink: { type: String, default: marbledPaperDefaults.ink },
    accent: { type: String, default: marbledPaperDefaults.accent },
    drops: { type: Number, default: marbledPaperDefaults.drops },
    scale: { type: Number, default: marbledPaperDefaults.scale },
    spread: { type: Number, default: marbledPaperDefaults.spread },
    size: { type: Number, default: marbledPaperDefaults.size },
    rake: { type: Number, default: marbledPaperDefaults.rake },
    comb: { type: Number, default: marbledPaperDefaults.comb },
    swirl: { type: Number, default: marbledPaperDefaults.swirl },
    grain: { type: Number, default: marbledPaperDefaults.grain },
    period: { type: Number, default: marbledPaperDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createMarbledPaper(host.value, props as Partial<MarbledPaperOptions>)
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
