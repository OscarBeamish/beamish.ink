/*
 * Vue adapter for DecodeText. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createDecodeText, decodeTextDefaults, type DecodeTextOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const DecodeText = defineComponent({
  name: 'DecodeText',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    glyphs: { type: String, default: decodeTextDefaults.glyphs },
    order: { type: String as () => DecodeTextOptions['order'], default: decodeTextDefaults.order },
    stagger: { type: Number, default: decodeTextDefaults.stagger },
    hold: { type: Number, default: decodeTextDefaults.hold },
    rate: { type: Number, default: decodeTextDefaults.rate },
    dim: { type: Number, default: decodeTextDefaults.dim },
    steady: { type: Boolean, default: decodeTextDefaults.steady },
    seed: { type: Number, default: decodeTextDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createDecodeText(host.value, props as Partial<DecodeTextOptions>)
      if (props.autoStart) handle.start()
    }

    onMounted(build)
    // The split has to be rebuilt when the text changes.
    watch(() => props.text, build)

    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    return () => h(props.tag, { ref: host }, props.text)
  }
})

export default DecodeText
