/*
 * Vue adapter for GlassShatter. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createGlassShatter, glassShatterDefaults, type GlassShatterOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const GlassShatter = defineComponent({
  name: 'GlassShatter',
  props: {
    sectors: { type: Number, default: glassShatterDefaults.sectors },
    rings: { type: Number, default: glassShatterDefaults.rings },
    jitter: { type: Number, default: glassShatterDefaults.jitter },
    impactX: { type: Number, default: glassShatterDefaults.impactX },
    impactY: { type: Number, default: glassShatterDefaults.impactY },
    crack: { type: Number, default: glassShatterDefaults.crack },
    glint: { type: Number, default: glassShatterDefaults.glint },
    gap: { type: Number, default: glassShatterDefaults.gap },
    refract: { type: Number, default: glassShatterDefaults.refract },
    fringe: { type: Number, default: glassShatterDefaults.fringe },
    facet: { type: Number, default: glassShatterDefaults.facet },
    impactAt: { type: Number, default: glassShatterDefaults.impactAt },
    spread: { type: Number, default: glassShatterDefaults.spread },
    tint: { type: String, default: glassShatterDefaults.tint },
    seed: { type: Number, default: glassShatterDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createGlassShatter(host.value, props as Partial<GlassShatterOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    // The picture is slotted in, stays in the document and is only hidden.
    return () => h('div', { ref: host }, slots.default?.())
  }
})

export default GlassShatter
