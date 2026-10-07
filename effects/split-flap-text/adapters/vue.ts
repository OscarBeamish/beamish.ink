/*
 * Vue adapter for SplitFlapText. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createSplitFlapText, splitFlapTextDefaults, type SplitFlapTextOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const SplitFlapText = defineComponent({
  name: 'SplitFlapText',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    strip: { type: String, default: splitFlapTextDefaults.strip },
    flap: { type: Number, default: splitFlapTextDefaults.flap },
    stagger: { type: Number, default: splitFlapTextDefaults.stagger },
    hold: { type: Number, default: splitFlapTextDefaults.hold },
    face: { type: String, default: splitFlapTextDefaults.face },
    ink: { type: String, default: splitFlapTextDefaults.ink },
    seam: { type: Number, default: splitFlapTextDefaults.seam },
    depth: { type: Number, default: splitFlapTextDefaults.depth },
    shade: { type: Number, default: splitFlapTextDefaults.shade },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createSplitFlapText(host.value, props as Partial<SplitFlapTextOptions>)
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

export default SplitFlapText
