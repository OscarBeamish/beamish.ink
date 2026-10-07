/*
 * Vue adapter for LightShafts. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createLightShafts, lightShaftsDefaults, type LightShaftsOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const LightShafts = defineComponent({
  name: 'LightShafts',
  props: {
    ground: { type: String, default: lightShaftsDefaults.ground },
    light: { type: String, default: lightShaftsDefaults.light },
    angle: { type: Number, default: lightShaftsDefaults.angle },
    distance: { type: Number, default: lightShaftsDefaults.distance },
    bars: { type: Number, default: lightShaftsDefaults.bars },
    gap: { type: Number, default: lightShaftsDefaults.gap },
    softness: { type: Number, default: lightShaftsDefaults.softness },
    spread: { type: Number, default: lightShaftsDefaults.spread },
    reach: { type: Number, default: lightShaftsDefaults.reach },
    strength: { type: Number, default: lightShaftsDefaults.strength },
    dust: { type: Number, default: lightShaftsDefaults.dust },
    drift: { type: Number, default: lightShaftsDefaults.drift },
    period: { type: Number, default: lightShaftsDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createLightShafts(host.value, props as Partial<LightShaftsOptions>)
      if (props.autoStart) handle.start()
    })

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

export default LightShafts
