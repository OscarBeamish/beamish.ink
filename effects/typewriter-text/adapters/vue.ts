/*
 * Vue adapter for TypewriterText. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createTypewriterText, typewriterTextDefaults, type TypewriterTextOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const TypewriterText = defineComponent({
  name: 'TypewriterText',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    pace: { type: Number, default: typewriterTextDefaults.pace },
    rhythm: { type: Number, default: typewriterTextDefaults.rhythm },
    pause: { type: Number, default: typewriterTextDefaults.pause },
    hold: { type: Number, default: typewriterTextDefaults.hold },
    jitter: { type: Number, default: typewriterTextDefaults.jitter },
    skew: { type: Number, default: typewriterTextDefaults.skew },
    ribbon: { type: Number, default: typewriterTextDefaults.ribbon },
    caret: { type: Number, default: typewriterTextDefaults.caret },
    blink: { type: Number, default: typewriterTextDefaults.blink },
    seed: { type: Number, default: typewriterTextDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createTypewriterText(host.value, props as Partial<TypewriterTextOptions>)
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

export default TypewriterText
