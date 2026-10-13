/*
 * Vue adapter for PixelResolve. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createPixelResolve, pixelResolveDefaults, type PixelResolveOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const PixelResolve = defineComponent({
  name: 'PixelResolve',
  props: {
    coarse: { type: Number, default: pixelResolveDefaults.coarse },
    steps: { type: Number, default: pixelResolveDefaults.steps },
    duration: { type: Number, default: pixelResolveDefaults.duration },
    hold: { type: Number, default: pixelResolveDefaults.hold },
    scatter: { type: Number, default: pixelResolveDefaults.scatter },
    taps: { type: Number, default: pixelResolveDefaults.taps },
    levels: { type: Number, default: pixelResolveDefaults.levels },
    ink: { type: String, default: pixelResolveDefaults.ink },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createPixelResolve(host.value, props as Partial<PixelResolveOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update({ ...props } as Partial<PixelResolveOptions>)
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    /* The picture is slotted in, stays in the document and is only hidden. */
    return () => h('div', { ref: host }, slots.default?.())
  }
})

export default PixelResolve
