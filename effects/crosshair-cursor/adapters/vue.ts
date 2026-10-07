/*
 * Vue adapter for CrosshairCursor. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createCrosshairCursor, crosshairCursorDefaults, type CrosshairCursorOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const CrosshairCursor = defineComponent({
  name: 'CrosshairCursor',
  props: {
    colour: { type: String, default: crosshairCursorDefaults.colour },
    thickness: { type: Number, default: crosshairCursorDefaults.thickness },
    size: { type: Number, default: crosshairCursorDefaults.size },
    corner: { type: Number, default: crosshairCursorDefaults.corner },
    padding: { type: Number, default: crosshairCursorDefaults.padding },
    ease: { type: Number, default: crosshairCursorDefaults.ease },
    snap: { type: Number, default: crosshairCursorDefaults.snap },
    target: { type: String, default: crosshairCursorDefaults.target },
    lines: { type: Boolean, default: crosshairCursorDefaults.lines },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createCrosshairCursor(host.value, props as Partial<CrosshairCursorOptions>)
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

export default CrosshairCursor
