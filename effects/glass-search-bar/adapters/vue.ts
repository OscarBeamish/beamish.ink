/*
 * Vue adapter for Lens. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createGlassSearchBar, glassSearchBarDefaults, type GlassSearchBarOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Lens = defineComponent({
  name: 'Lens',
  props: {
    glass: { type: String, default: glassSearchBarDefaults.glass },
    panelX: { type: Number, default: glassSearchBarDefaults.panelX },
    panelY: { type: Number, default: glassSearchBarDefaults.panelY },
    panelWidth: { type: Number, default: glassSearchBarDefaults.panelWidth },
    panelHeight: { type: Number, default: glassSearchBarDefaults.panelHeight },
    radius: { type: Number, default: glassSearchBarDefaults.radius },
    bevel: { type: Number, default: glassSearchBarDefaults.bevel },
    refraction: { type: Number, default: glassSearchBarDefaults.refraction },
    dispersion: { type: Number, default: glassSearchBarDefaults.dispersion },
    frost: { type: Number, default: glassSearchBarDefaults.frost },
    specular: { type: Number, default: glassSearchBarDefaults.specular },
    shine: { type: Number, default: glassSearchBarDefaults.shine },
    fresnel: { type: Number, default: glassSearchBarDefaults.fresnel },
    edge: { type: Number, default: glassSearchBarDefaults.edge },
    tint: { type: Number, default: glassSearchBarDefaults.tint },
    luminosity: { type: Number, default: glassSearchBarDefaults.luminosity },
    level: { type: Number, default: glassSearchBarDefaults.level },
    lightX: { type: Number, default: glassSearchBarDefaults.lightX },
    lightY: { type: Number, default: glassSearchBarDefaults.lightY },
    shadow: { type: Number, default: glassSearchBarDefaults.shadow },
    travel: { type: Number, default: glassSearchBarDefaults.travel },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createGlassSearchBar(host.value, props as Partial<GlassSearchBarOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update(props as Partial<GlassSearchBarOptions>)
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
