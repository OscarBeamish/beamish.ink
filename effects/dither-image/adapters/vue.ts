/*
 * Vue adapter for DitherImage. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createDitherImage, ditherImageDefaults, type DitherImageOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const DitherImage = defineComponent({
  name: 'DitherImage',
  props: {
    dot: { type: Number, default: ditherImageDefaults.dot },
    mode: { type: String, default: ditherImageDefaults.mode },
    levels: { type: Number, default: ditherImageDefaults.levels },
    ink: { type: String, default: ditherImageDefaults.ink },
    paper: { type: String, default: ditherImageDefaults.paper },
    exposure: { type: Number, default: ditherImageDefaults.exposure },
    contrast: { type: Number, default: ditherImageDefaults.contrast },
    swell: { type: Number, default: ditherImageDefaults.swell },
    period: { type: Number, default: ditherImageDefaults.period },
    serpentine: { type: Boolean, default: ditherImageDefaults.serpentine },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createDitherImage(host.value, props as Partial<DitherImageOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update({ ...props } as Partial<DitherImageOptions>)
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    // The picture is slotted in, stays in the document and is only hidden.
    return () => h('div', { ref: host }, slots.default?.())
  }
})

export default DitherImage
