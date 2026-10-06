/*
 * Vue adapter for Lens. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createGlassPanel, glassPanelDefaults, type GlassPanelOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Lens = defineComponent({
  name: 'Lens',
  props: {
    glass: { type: String, default: glassPanelDefaults.glass },
    panelX: { type: Number, default: glassPanelDefaults.panelX },
    panelY: { type: Number, default: glassPanelDefaults.panelY },
    panelWidth: { type: Number, default: glassPanelDefaults.panelWidth },
    panelHeight: { type: Number, default: glassPanelDefaults.panelHeight },
    radius: { type: Number, default: glassPanelDefaults.radius },
    bevel: { type: Number, default: glassPanelDefaults.bevel },
    refraction: { type: Number, default: glassPanelDefaults.refraction },
    dispersion: { type: Number, default: glassPanelDefaults.dispersion },
    frost: { type: Number, default: glassPanelDefaults.frost },
    specular: { type: Number, default: glassPanelDefaults.specular },
    shine: { type: Number, default: glassPanelDefaults.shine },
    fresnel: { type: Number, default: glassPanelDefaults.fresnel },
    edge: { type: Number, default: glassPanelDefaults.edge },
    tint: { type: Number, default: glassPanelDefaults.tint },
    luminosity: { type: Number, default: glassPanelDefaults.luminosity },
    level: { type: Number, default: glassPanelDefaults.level },
    lightX: { type: Number, default: glassPanelDefaults.lightX },
    lightY: { type: Number, default: glassPanelDefaults.lightY },
    shadow: { type: Number, default: glassPanelDefaults.shadow },
    travel: { type: Number, default: glassPanelDefaults.travel },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createGlassPanel(host.value, props as Partial<GlassPanelOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update(props as Partial<GlassPanelOptions>)
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    /*
     * The slot carries the picture. The effect reads it out of the host element
     * rather than taking it as an option, so rendering an empty div would give
     * you a blank panel and no error.
     */
    return () => h('div', { ref: host }, slots['default']?.())
  }
})

export default Lens
