/*
 * Vue adapter for AuroraCurtain. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createAuroraCurtain, auroraCurtainDefaults, type AuroraCurtainOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const AuroraCurtain = defineComponent({
  name: 'AuroraCurtain',
  props: {
    sky: { type: String, default: auroraCurtainDefaults.sky },
    low: { type: String, default: auroraCurtainDefaults.low },
    high: { type: String, default: auroraCurtainDefaults.high },
    curtains: { type: Number, default: auroraCurtainDefaults.curtains },
    height: { type: Number, default: auroraCurtainDefaults.height },
    fold: { type: Number, default: auroraCurtainDefaults.fold },
    rays: { type: Number, default: auroraCurtainDefaults.rays },
    pitch: { type: Number, default: auroraCurtainDefaults.pitch },
    brightness: { type: Number, default: auroraCurtainDefaults.brightness },
    stars: { type: Number, default: auroraCurtainDefaults.stars },
    horizon: { type: Number, default: auroraCurtainDefaults.horizon },
    grain: { type: Number, default: auroraCurtainDefaults.grain },
    period: { type: Number, default: auroraCurtainDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createAuroraCurtain(host.value, props as Partial<AuroraCurtainOptions>)
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

export default AuroraCurtain
