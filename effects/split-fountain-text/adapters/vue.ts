/*
 * Vue adapter for SplitFountainText. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createSplitFountainText, splitFountainTextDefaults, type SplitFountainTextOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const SplitFountainText = defineComponent({
  name: 'SplitFountainText',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    first: { type: String, default: splitFountainTextDefaults.first },
    second: { type: String, default: splitFountainTextDefaults.second },
    third: { type: String, default: splitFountainTextDefaults.third },
    angle: { type: Number, default: splitFountainTextDefaults.angle },
    blend: { type: Number, default: splitFountainTextDefaults.blend },
    wobble: { type: Number, default: splitFountainTextDefaults.wobble },
    walk: { type: Number, default: splitFountainTextDefaults.walk },
    seed: { type: Number, default: splitFountainTextDefaults.seed },
    period: { type: Number, default: splitFountainTextDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createSplitFountainText(host.value, props as Partial<SplitFountainTextOptions>)
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

export default SplitFountainText
