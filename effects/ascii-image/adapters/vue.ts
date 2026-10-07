/*
 * Vue adapter for AsciiImage. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createAsciiImage, asciiImageDefaults, type AsciiImageOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const AsciiImage = defineComponent({
  name: 'AsciiImage',
  props: {
    cell: { type: Number, default: asciiImageDefaults.cell },
    glyphs: { type: String, default: asciiImageDefaults.glyphs },
    paper: { type: String, default: asciiImageDefaults.paper },
    ink: { type: String, default: asciiImageDefaults.ink },
    contrast: { type: Number, default: asciiImageDefaults.contrast },
    threshold: { type: Number, default: asciiImageDefaults.threshold },
    shapes: { type: Boolean, default: asciiImageDefaults.shapes },
    reveal: { type: Number, default: asciiImageDefaults.reveal },
    hold: { type: Number, default: asciiImageDefaults.hold },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createAsciiImage(host.value, props as Partial<AsciiImageOptions>)
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

export default AsciiImage
