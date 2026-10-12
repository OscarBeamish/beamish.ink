/*
 * Vue adapter for CrtScreen. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createCrtScreen, crtScreenDefaults, type CrtScreenOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const CrtScreen = defineComponent({
  name: 'CrtScreen',
  props: {
    bezel: { type: String, default: crtScreenDefaults.bezel },
    tint: { type: String, default: crtScreenDefaults.tint },
    curve: { type: Number, default: crtScreenDefaults.curve },
    grille: { type: Number, default: crtScreenDefaults.grille },
    scanline: { type: Number, default: crtScreenDefaults.scanline },
    scanCount: { type: Number, default: crtScreenDefaults.scanCount },
    bloom: { type: Number, default: crtScreenDefaults.bloom },
    converge: { type: Number, default: crtScreenDefaults.converge },
    vignette: { type: Number, default: crtScreenDefaults.vignette },
    roll: { type: Number, default: crtScreenDefaults.roll },
    brightness: { type: Number, default: crtScreenDefaults.brightness },
    contrast: { type: Number, default: crtScreenDefaults.contrast },
    period: { type: Number, default: crtScreenDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createCrtScreen(host.value, props as Partial<CrtScreenOptions>)
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

export default CrtScreen
