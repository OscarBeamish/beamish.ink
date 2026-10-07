/*
 * Vue adapter for Cipher. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createCipher, cipherDefaults, type CipherOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Cipher = defineComponent({
  name: 'Cipher',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    glyphs: { type: String, default: cipherDefaults.glyphs },
    order: { type: String as () => CipherOptions['order'], default: cipherDefaults.order },
    stagger: { type: Number, default: cipherDefaults.stagger },
    hold: { type: Number, default: cipherDefaults.hold },
    rate: { type: Number, default: cipherDefaults.rate },
    dim: { type: Number, default: cipherDefaults.dim },
    steady: { type: Boolean, default: cipherDefaults.steady },
    seed: { type: Number, default: cipherDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createCipher(host.value, props as Partial<CipherOptions>)
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

export default Cipher
